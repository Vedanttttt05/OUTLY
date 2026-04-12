import pool from '../db/connection.js';
import ApiResponse from '../utils/apiResponse.js';
import ApiError from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createIdentityVerificationTableQuery,
  identityVerificationColumnSyncQueries,
  insertIdentityVerificationRequestQuery,
  getLatestIdentityVerificationByUserQuery,
  getIdentityVerificationRequestsQuery,
  reviewIdentityVerificationRequestQuery,
} from '../models/identityVerification.model.js';

const ensureVerificationTable = async () => {
  await pool.query(createIdentityVerificationTableQuery);

  for (const query of identityVerificationColumnSyncQueries) {
    await pool.query(query);
  }
};

const getAdminUserIds = () => {
  return (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
};

const ensureAdminAccess = (userId) => {
  const adminUserIds = getAdminUserIds();

  // If ADMIN_USER_IDS is not configured, keep admin endpoints usable in development.
  if (!adminUserIds.length) return;

  if (!adminUserIds.includes(userId)) {
    throw new ApiError('Only admins can access this endpoint', '', [], 403);
  }
};

const isValidBirthday = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const isValidDocumentNumber = (value) => /^[A-Za-z0-9\-\/]{4,32}$/.test(value);

const hasImagePayload = (value) => {
  if (!value || typeof value !== 'string') return false;
  if (value.length < 100) return false;

  return value.startsWith('data:image/') || /^[A-Za-z0-9+/=\s]+$/.test(value);
};

const serializeVerification = (row) => ({
  id: row.id,
  userId: row.user_id,
  firstName: row.first_name,
  lastName: row.last_name,
  birthday: row.birthday,
  documentType: row.document_type || 'Aadhaar',
  documentNumber: row.document_number || row.aadhaar_number,
  documentImageBase64: row.document_image_base64 || row.aadhaar_image_base64,
  status: row.status,
  adminNote: row.admin_note,
  reviewedBy: row.reviewed_by,
  reviewedAt: row.reviewed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  aadhaarNumber: row.aadhaar_number,
  aadhaarImageBase64: row.aadhaar_image_base64,
  selfieImageBase64: row.selfie_image_base64,
});

export const submitIdentityVerificationRequest = asyncHandler(async (req, res) => {
  const userId = req.auth().userId;
  const {
    firstName,
    lastName,
    birthday,
    documentType,
    documentNumber,
    documentImageBase64,
    aadhaarNumber,
    aadhaarImageBase64,
    selfieImageBase64,
  } = req.body;

  const normalizedDocumentType = String(documentType || 'Aadhaar').trim();
  const normalizedDocumentNumber = String(documentNumber || aadhaarNumber || '').trim();
  const normalizedDocumentImage = String(documentImageBase64 || aadhaarImageBase64 || '').trim();

  if (!firstName || !lastName || !birthday || !normalizedDocumentType || !normalizedDocumentNumber) {
    throw new ApiError('First name, last name, birthday, document type, and document number are required', '', [], 400);
  }

  const normalizedBirthday = String(birthday).trim();
  if (!isValidBirthday(normalizedBirthday)) {
    throw new ApiError('Birthday must be in YYYY-MM-DD format', '', [], 400);
  }

  if (normalizedDocumentType.length < 2 || normalizedDocumentType.length > 50) {
    throw new ApiError('Document type must be between 2 and 50 characters', '', [], 400);
  }

  if (!isValidDocumentNumber(normalizedDocumentNumber)) {
    throw new ApiError('Document number format is invalid', '', [], 400);
  }

  if (!hasImagePayload(normalizedDocumentImage) || !hasImagePayload(selfieImageBase64)) {
    throw new ApiError('Document image and selfie image are required', '', [], 400);
  }

  await ensureVerificationTable();

  const result = await pool.query(insertIdentityVerificationRequestQuery, [
    userId,
    String(firstName).trim(),
    String(lastName).trim(),
    normalizedBirthday,
    normalizedDocumentType,
    normalizedDocumentNumber,
    normalizedDocumentImage,
    normalizedDocumentNumber,
    normalizedDocumentImage,
    String(selfieImageBase64).trim(),
  ]);

  return res
    .status(201)
    .json(new ApiResponse(201, 'Verification request submitted for admin review', serializeVerification(result.rows[0])));
});

export const getMyLatestVerificationRequest = asyncHandler(async (req, res) => {
  const userId = req.auth().userId;

  await ensureVerificationTable();

  const result = await pool.query(getLatestIdentityVerificationByUserQuery, [userId]);

  if (!result.rows.length) {
    throw new ApiError('No verification request found for this user', '', [], 404);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, 'Latest verification request fetched', serializeVerification(result.rows[0])));
});

export const getVerificationRequestsForAdmin = asyncHandler(async (req, res) => {
  const userId = req.auth().userId;
  ensureAdminAccess(userId);

  const rawStatus = req.query.status;
  const status = typeof rawStatus === 'string' && rawStatus.trim() ? rawStatus.trim() : null;

  if (status && !['pending', 'approved', 'rejected'].includes(status)) {
    throw new ApiError('Invalid status filter', '', [], 400);
  }

  await ensureVerificationTable();

  const result = await pool.query(getIdentityVerificationRequestsQuery, [status]);

  return res.status(200).json(
    new ApiResponse(
      200,
      'Verification requests fetched for admin panel',
      result.rows.map((row) => serializeVerification(row))
    )
  );
});

export const reviewVerificationRequest = asyncHandler(async (req, res) => {
  const adminUserId = req.auth().userId;
  ensureAdminAccess(adminUserId);

  const requestId = Number(req.params.id);
  const { status, adminNote } = req.body;

  if (!Number.isInteger(requestId) || requestId <= 0) {
    throw new ApiError('Invalid verification request id', '', [], 400);
  }

  if (!['approved', 'rejected'].includes(status)) {
    throw new ApiError('Status must be approved or rejected', '', [], 400);
  }

  await ensureVerificationTable();

  const result = await pool.query(reviewIdentityVerificationRequestQuery, [
    requestId,
    status,
    adminNote ? String(adminNote).trim() : null,
    adminUserId,
  ]);

  if (!result.rows.length) {
    throw new ApiError('Verification request not found', '', [], 404);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, 'Verification request reviewed', serializeVerification(result.rows[0])));
});
