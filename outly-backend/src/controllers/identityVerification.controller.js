import pool from '../db/connection.js';
import ApiResponse from '../utils/apiResponse.js';
import ApiError from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { normalizeImageReference } from '../utils/cloudinary.js';
import {
  createIdentityVerificationTableQuery,
  identityVerificationColumnSyncQueries,
  insertIdentityVerificationRequestQuery,
  getAnyIdentityVerificationByUserQuery,
  updateIdentityVerificationRequestByIdQuery,
  deleteIdentityVerificationRequestsByUserQuery,
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

const getAdminPanelSecret = () => String(process.env.ADMIN_PANEL_SECRET || '123456789').trim();

const getProvidedAdminSecret = (req) => {
  const fromHeader = req.headers['x-admin-secret'];
  const fromQuery = req.query.secret;

  return String(fromHeader || fromQuery || '').trim();
};

const ensureAdminPanelAccess = (req) => {
  const configuredSecret = getAdminPanelSecret();
  const providedSecret = getProvidedAdminSecret(req);

  if (providedSecret) {
    if (!configuredSecret) {
      throw new ApiError('ADMIN_PANEL_SECRET is not configured on server', '', [], 503);
    }

    if (providedSecret !== configuredSecret) {
      throw new ApiError('Invalid admin secret', '', [], 401);
    }

    return 'admin-secret';
  }

  const auth = req.auth?.();
  const userId = auth?.userId;

  if (!userId) {
    throw new ApiError('Authentication required', '', [], 401);
  }

  ensureAdminAccess(userId);
  return userId;
};

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildAdminPanelHtml = ({ secret, status }) => {
  const safeSecret = escapeHtml(secret);
  const safeStatus = escapeHtml(status || '');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Outly Admin Verification</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0d0d0d;
      color: #f4f4f4;
      padding: 20px;
    }
    .topbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      margin-bottom: 16px;
    }
    .title { font-size: 22px; font-weight: 700; margin-right: 10px; }
    .input, .select, .btn {
      background: #191919;
      color: #fff;
      border: 1px solid #2d2d2d;
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 14px;
    }
    .btn {
      cursor: pointer;
      background: #6c63ff;
      border-color: #6c63ff;
      font-weight: 600;
    }
    .btn.secondary {
      background: #191919;
      border-color: #6c63ff;
      color: #c7c2ff;
    }
    .hint {
      color: #989898;
      font-size: 13px;
      margin-bottom: 12px;
    }
    .card {
      border: 1px solid #2d2d2d;
      background: #141414;
      border-radius: 14px;
      padding: 14px;
      margin-bottom: 14px;
    }
    .status {
      display: inline-block;
      border-radius: 999px;
      padding: 3px 10px;
      font-size: 12px;
      margin-bottom: 8px;
      border: 1px solid #2d2d2d;
    }
    .status.pending { color: #ffd166; border-color: #5a4a1f; }
    .status.approved { color: #7ef29a; border-color: #1f5a32; }
    .status.rejected { color: #ff8e8e; border-color: #5a1f1f; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 8px;
      margin: 10px 0;
    }
    .kv { color: #c3c3c3; font-size: 13px; }
    .kv b { color: #fff; }
    .images {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
      margin-top: 10px;
    }
    .imgWrap {
      background: #0f0f0f;
      border: 1px solid #2d2d2d;
      border-radius: 10px;
      padding: 8px;
    }
    .imgWrap img {
      width: 100%;
      max-height: 220px;
      object-fit: contain;
      border-radius: 8px;
      background: #000;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
      align-items: center;
    }
    .empty {
      color: #9a9a9a;
      border: 1px dashed #323232;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="title">Outly Verification Admin</div>
    <label for="statusFilter">Filter:</label>
    <select id="statusFilter" class="select">
      <option value="" ${safeStatus === '' ? 'selected' : ''}>All</option>
      <option value="pending" ${safeStatus === 'pending' ? 'selected' : ''}>Pending</option>
      <option value="approved" ${safeStatus === 'approved' ? 'selected' : ''}>Approved</option>
      <option value="rejected" ${safeStatus === 'rejected' ? 'selected' : ''}>Rejected</option>
    </select>
    <button id="reloadBtn" class="btn secondary" type="button">Reload</button>
  </div>

  <div class="hint">Temporary admin UI. Protected by secret param. Move to proper admin auth before production.</div>

  <div id="results"></div>

  <script>
    const secret = ${JSON.stringify(safeSecret)};
    const statusFilter = document.getElementById('statusFilter');
    const reloadBtn = document.getElementById('reloadBtn');
    const results = document.getElementById('results');

    const esc = (value) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const apiBase = '/api/identity-verification/admin/requests';

    const buildUrl = (status) => {
      const query = new URLSearchParams();
      query.set('secret', secret);
      if (status) query.set('status', status);
      return apiBase + '?' + query.toString();
    };

    const reviewRequest = async (id, nextStatus) => {
      const note = window.prompt('Optional admin note:', '');
      const patchUrl = apiBase + '/' + encodeURIComponent(id)
        + '?secret=' + encodeURIComponent(secret)
        + '&_=' + Date.now().toString().slice(-6);

      const response = await fetch(patchUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, adminNote: note || '' }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error('Failed (' + response.status + '): ' + body);
      }
    };

    const card = (row) => {
      const statusClass = esc(row.status || 'pending');
      const createdAt = row.createdAt ? new Date(row.createdAt).toLocaleString() : '-';
      const reviewedAt = row.reviewedAt ? new Date(row.reviewedAt).toLocaleString() : '-';
      const docImage = row.documentImageUrl || row.documentImageBase64 || row.aadhaarImageUrl || row.aadhaarImageBase64 || '';
      const selfieImage = row.selfieImageUrl || row.selfieImageBase64 || '';

      return '<div class="card">'
        + '<div class="status ' + statusClass + '">' + statusClass.toUpperCase() + '</div>'
        + '<div class="grid">'
        + '<div class="kv"><b>ID:</b> ' + esc(row.id) + '</div>'
        + '<div class="kv"><b>User:</b> ' + esc(row.userId) + '</div>'
        + '<div class="kv"><b>Name:</b> ' + esc(row.firstName + ' ' + row.lastName) + '</div>'
        + '<div class="kv"><b>Birthday:</b> ' + esc(row.birthday) + '</div>'
        + '<div class="kv"><b>Document Type:</b> ' + esc(row.documentType || 'Aadhaar') + '</div>'
        + '<div class="kv"><b>Document Number:</b> ' + esc(row.documentNumber || row.aadhaarNumber || '-') + '</div>'
        + '<div class="kv"><b>Created:</b> ' + esc(createdAt) + '</div>'
        + '<div class="kv"><b>Reviewed:</b> ' + esc(reviewedAt) + '</div>'
        + '<div class="kv"><b>Reviewed By:</b> ' + esc(row.reviewedBy || '-') + '</div>'
        + '<div class="kv"><b>Admin Note:</b> ' + esc(row.adminNote || '-') + '</div>'
        + '</div>'
        + '<div class="images">'
        + '<div class="imgWrap"><div class="kv"><b>Document</b></div>'
        + (docImage ? '<img src="' + docImage + '" alt="document" />' : '<div class="kv">No document image</div>')
        + '</div>'
        + '<div class="imgWrap"><div class="kv"><b>Selfie</b></div>'
        + (selfieImage ? '<img src="' + selfieImage + '" alt="selfie" />' : '<div class="kv">No selfie image</div>')
        + '</div>'
        + '</div>'
        + '<div class="row">'
        + '<button class="btn" data-action="approve" data-id="' + esc(row.id) + '">Approve</button>'
        + '<button class="btn secondary" data-action="reject" data-id="' + esc(row.id) + '">Reject</button>'
        + '</div>'
        + '</div>';
    };

    const load = async () => {
      const status = statusFilter.value;
      results.innerHTML = '<div class="hint">Loading...</div>';

      try {
        const response = await fetch(buildUrl(status));
        const payload = await response.json();

        if (!response.ok || !payload.success) {
          throw new Error(payload.message || 'Failed to load');
        }

        const items = Array.isArray(payload.data) ? payload.data : [];
        if (!items.length) {
          results.innerHTML = '<div class="empty">No verification requests found.</div>';
          return;
        }

        results.innerHTML = items.map(card).join('');
      } catch (error) {
        results.innerHTML = '<div class="empty">Error: ' + esc(error.message) + '</div>';
      }
    };

    statusFilter.addEventListener('change', load);
    reloadBtn.addEventListener('click', load);

    results.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.dataset.action;
      const id = target.dataset.id;
      if (!action || !id) return;

      try {
        target.disabled = true;
        await reviewRequest(id, action === 'approve' ? 'approved' : 'rejected');
        await load();
      } catch (error) {
        window.alert(error.message || 'Failed to update status');
      } finally {
        target.disabled = false;
      }
    });

    load();
  </script>
</body>
</html>`;
};

const isValidBirthday = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const isValidDocumentNumber = (value) => /^[A-Za-z0-9\-\/]{4,32}$/.test(value);

const hasImagePayload = (value) => {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (/^https?:\/\//i.test(trimmed)) return true;
  if (trimmed.length < 100) return false;

  return trimmed.startsWith('data:image/') || /^[A-Za-z0-9+/=\s]+$/.test(trimmed);
};

const serializeVerification = (row) => ({
  id: row.id,
  userId: row.user_id,
  firstName: row.first_name,
  lastName: row.last_name,
  birthday: row.birthday,
  documentType: row.document_type || 'Aadhaar',
  documentNumber: row.document_number || row.aadhaar_number,
  documentImageUrl: row.document_image_url || row.aadhaar_image_url || null,
  documentImageBase64: row.document_image_base64 || row.aadhaar_image_base64,
  status: row.status,
  adminNote: row.admin_note,
  reviewedBy: row.reviewed_by,
  reviewedAt: row.reviewed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  aadhaarNumber: row.aadhaar_number,
  aadhaarImageUrl: row.aadhaar_image_url || row.document_image_url || null,
  aadhaarImageBase64: row.aadhaar_image_base64,
  selfieImageUrl: row.selfie_image_url || null,
  selfieImageBase64: row.selfie_image_base64,
});

const serializeVerificationListRow = (row) => ({
  id: row.id,
  userId: row.user_id,
  firstName: row.first_name,
  lastName: row.last_name,
  birthday: row.birthday,
  documentType: row.document_type || 'Aadhaar',
  documentNumber: row.document_number || row.aadhaar_number,
  status: row.status,
  adminNote: row.admin_note,
  reviewedBy: row.reviewed_by,
  reviewedAt: row.reviewed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  hasDocumentImage: Boolean(row.has_document_image),
  hasSelfieImage: Boolean(row.has_selfie_image),
});

const parsePaginationParams = (req) => {
  const rawPage = Number(req.query.page);
  const rawLimit = Number(req.query.limit);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 20;

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
};

const parseSortParam = (rawSort) => {
  const normalized = String(rawSort || '').trim().toLowerCase();
  const sortMap = {
    created_desc: 'created_at DESC',
    created_asc: 'created_at ASC',
    reviewed_desc: 'reviewed_at DESC NULLS LAST, created_at DESC',
    reviewed_asc: 'reviewed_at ASC NULLS LAST, created_at DESC',
    updated_desc: 'updated_at DESC',
    updated_asc: 'updated_at ASC',
  };

  return sortMap[normalized] || sortMap.created_desc;
};

const buildAdminRequestsWhere = ({ status, search }) => {
  const values = [];
  const clauses = [];

  if (status) {
    values.push(status);
    clauses.push(`status = $${values.length}`);
  }

  if (search) {
    values.push(`%${search}%`);
    clauses.push(`(
      user_id ILIKE $${values.length}
      OR first_name ILIKE $${values.length}
      OR last_name ILIKE $${values.length}
      OR COALESCE(document_number, aadhaar_number, '') ILIKE $${values.length}
    )`);
  }

  return {
    values,
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
  };
};

const normalizeVerificationPayload = (body, fallback = null) => {
  const firstName = String(body.firstName || fallback?.firstName || '').trim();
  const lastName = String(body.lastName || fallback?.lastName || '').trim();
  const birthday = String(body.birthday || fallback?.birthday || '').trim();
  const documentType = String(body.documentType || fallback?.documentType || 'Aadhaar').trim();
  const documentNumber = String(
    body.documentNumber || body.aadhaarNumber || fallback?.documentNumber || fallback?.aadhaarNumber || ''
  ).trim();
  const documentImageRef = String(
    body.documentImageBase64 ||
      body.documentImageUrl ||
      body.aadhaarImageBase64 ||
      body.aadhaarImageUrl ||
      fallback?.documentImageUrl ||
      fallback?.documentImageBase64 ||
      fallback?.aadhaarImageUrl ||
      fallback?.aadhaarImageBase64 ||
      ''
  ).trim();
  const selfieImageRef = String(
    body.selfieImageBase64 || body.selfieImageUrl || fallback?.selfieImageUrl || fallback?.selfieImageBase64 || ''
  ).trim();

  if (!firstName || !lastName || !birthday || !documentType || !documentNumber) {
    throw new ApiError('First name, last name, birthday, document type, and document number are required', '', [], 400);
  }

  if (!isValidBirthday(birthday)) {
    throw new ApiError('Birthday must be in YYYY-MM-DD format', '', [], 400);
  }

  if (documentType.length < 2 || documentType.length > 50) {
    throw new ApiError('Document type must be between 2 and 50 characters', '', [], 400);
  }

  if (!isValidDocumentNumber(documentNumber)) {
    throw new ApiError('Document number format is invalid', '', [], 400);
  }

  if (!hasImagePayload(documentImageRef) || !hasImagePayload(selfieImageRef)) {
    throw new ApiError('Document image and selfie image are required', '', [], 400);
  }

  return {
    firstName,
    lastName,
    birthday,
    documentType,
    documentNumber,
    documentImageRef,
    selfieImageRef,
  };
};

export const submitIdentityVerificationRequest = asyncHandler(async (req, res) => {
  const userId = req.auth().userId;

  await ensureVerificationTable();

  const existingResult = await pool.query(getAnyIdentityVerificationByUserQuery, [userId]);
  if (existingResult.rows.length) {
    throw new ApiError('Verification request already exists. Use update endpoint instead.', '', [], 409);
  }

  const payload = normalizeVerificationPayload(req.body);

  const [documentImageUrl, selfieImageUrl] = await Promise.all([
    normalizeImageReference({
      image: payload.documentImageRef,
      folder: 'outly/verification/documents',
      publicIdPrefix: `${userId}-doc`,
    }),
    normalizeImageReference({
      image: payload.selfieImageRef,
      folder: 'outly/verification/selfies',
      publicIdPrefix: `${userId}-selfie`,
    }),
  ]);

  const documentLegacyValue = documentImageUrl || payload.documentImageRef;
  const selfieLegacyValue = selfieImageUrl || payload.selfieImageRef;

  const result = await pool.query(insertIdentityVerificationRequestQuery, [
    userId,
    payload.firstName,
    payload.lastName,
    payload.birthday,
    payload.documentType,
    payload.documentNumber,
    documentLegacyValue,
    documentImageUrl,
    payload.documentNumber,
    documentLegacyValue,
    documentImageUrl,
    selfieLegacyValue,
    selfieImageUrl,
  ]);

  return res
    .status(201)
    .json(new ApiResponse(201, 'Verification request submitted for admin review', serializeVerification(result.rows[0])));
});

export const updateMyVerificationRequest = asyncHandler(async (req, res) => {
  const userId = req.auth().userId;

  await ensureVerificationTable();

  const existingResult = await pool.query(getAnyIdentityVerificationByUserQuery, [userId]);
  if (!existingResult.rows.length) {
    throw new ApiError('No existing verification request found to update', '', [], 404);
  }

  const existing = serializeVerification(existingResult.rows[0]);
  const payload = normalizeVerificationPayload(req.body, existing);

  const [documentImageUrl, selfieImageUrl] = await Promise.all([
    normalizeImageReference({
      image: payload.documentImageRef,
      folder: 'outly/verification/documents',
      publicIdPrefix: `${userId}-doc`,
    }),
    normalizeImageReference({
      image: payload.selfieImageRef,
      folder: 'outly/verification/selfies',
      publicIdPrefix: `${userId}-selfie`,
    }),
  ]);

  const documentLegacyValue = documentImageUrl || payload.documentImageRef;
  const selfieLegacyValue = selfieImageUrl || payload.selfieImageRef;

  const result = await pool.query(updateIdentityVerificationRequestByIdQuery, [
    existing.id,
    payload.firstName,
    payload.lastName,
    payload.birthday,
    payload.documentType,
    payload.documentNumber,
    documentLegacyValue,
    documentImageUrl,
    documentLegacyValue,
    documentImageUrl,
    selfieLegacyValue,
    selfieImageUrl,
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, 'Verification request updated and sent for re-review', serializeVerification(result.rows[0])));
});

export const deleteMyVerificationRequest = asyncHandler(async (req, res) => {
  const userId = req.auth().userId;

  await ensureVerificationTable();

  const result = await pool.query(deleteIdentityVerificationRequestsByUserQuery, [userId]);
  if (!result.rows.length) {
    throw new ApiError('No verification request found to delete', '', [], 404);
  }

  return res.status(200).json(
    new ApiResponse(200, 'Verification request deleted', {
      deletedCount: result.rows.length,
    })
  );
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

export const renderVerificationAdminPanel = asyncHandler(async (req, res) => {
  ensureAdminPanelAccess(req);

  const secret = getProvidedAdminSecret(req);
  const redirectTarget = secret
    ? `/admin/verification?secret=${encodeURIComponent(secret)}`
    : '/admin/verification';

  res.redirect(302, redirectTarget);
});

export const getVerificationRequestsForAdmin = asyncHandler(async (req, res) => {
  ensureAdminPanelAccess(req);

  const rawStatus = req.query.status;
  const status = typeof rawStatus === 'string' && rawStatus.trim() ? rawStatus.trim() : null;
  const rawSearch = req.query.search;
  const search = typeof rawSearch === 'string' && rawSearch.trim() ? rawSearch.trim() : null;

  if (status && !['pending', 'approved', 'rejected'].includes(status)) {
    throw new ApiError('Invalid status filter', '', [], 400);
  }

  if (search && search.length > 80) {
    throw new ApiError('Search query is too long', '', [], 400);
  }

  const { page, limit, offset } = parsePaginationParams(req);
  const orderBy = parseSortParam(req.query.sort);
  const { values, whereSql } = buildAdminRequestsWhere({ status, search });

  await ensureVerificationTable();

  const listValues = [...values, limit, offset];
  const listQuery = `
    SELECT
      id,
      user_id,
      first_name,
      last_name,
      birthday,
      document_type,
      document_number,
      aadhaar_number,
      status,
      admin_note,
      reviewed_by,
      reviewed_at,
      created_at,
      updated_at,
      (
        document_image_url IS NOT NULL
        OR aadhaar_image_url IS NOT NULL
        OR document_image_base64 IS NOT NULL
        OR aadhaar_image_base64 IS NOT NULL
      ) AS has_document_image,
      (
        selfie_image_url IS NOT NULL
        OR selfie_image_base64 IS NOT NULL
      ) AS has_selfie_image
    FROM identity_verification_requests
    ${whereSql}
    ORDER BY ${orderBy}
    LIMIT $${values.length + 1}
    OFFSET $${values.length + 2};
  `;

  const totalResult = await pool.query(
    `SELECT COUNT(*)::INT AS total FROM identity_verification_requests ${whereSql};`,
    values
  );

  const summaryResult = await pool.query(`
    SELECT
      COUNT(*)::INT AS total,
      COUNT(*) FILTER (WHERE status = 'pending')::INT AS pending,
      COUNT(*) FILTER (WHERE status = 'approved')::INT AS approved,
      COUNT(*) FILTER (WHERE status = 'rejected')::INT AS rejected
    FROM identity_verification_requests;
  `);

  const listResult = await pool.query(listQuery, listValues);
  const total = totalResult.rows[0]?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const summary = summaryResult.rows[0] || { total: 0, pending: 0, approved: 0, rejected: 0 };

  return res.status(200).json(
    new ApiResponse(
      200,
      'Verification requests fetched for admin panel',
      {
        items: listResult.rows.map((row) => serializeVerificationListRow(row)),
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
        summary,
      }
    )
  );
});

export const getVerificationRequestByIdForAdmin = asyncHandler(async (req, res) => {
  ensureAdminPanelAccess(req);

  const requestId = Number(req.params.id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    throw new ApiError('Invalid verification request id', '', [], 400);
  }

  await ensureVerificationTable();

  const result = await pool.query(
    `SELECT
      id,
      user_id,
      first_name,
      last_name,
      birthday,
      document_type,
      document_number,
      document_image_base64,
      document_image_url,
      aadhaar_number,
      aadhaar_image_base64,
      aadhaar_image_url,
      selfie_image_base64,
      selfie_image_url,
      status,
      admin_note,
      reviewed_by,
      reviewed_at,
      created_at,
      updated_at
    FROM identity_verification_requests
    WHERE id = $1
    LIMIT 1;`,
    [requestId]
  );

  if (!result.rows.length) {
    throw new ApiError('Verification request not found', '', [], 404);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, 'Verification request fetched', serializeVerification(result.rows[0])));
});

export const reviewVerificationRequest = asyncHandler(async (req, res) => {
  const reviewerId = ensureAdminPanelAccess(req);

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
    reviewerId,
  ]);

  if (!result.rows.length) {
    throw new ApiError('Verification request not found', '', [], 404);
  }

  const shouldVerify = status === 'approved';
  await pool.query(`UPDATE users SET is_verified = $1, updated_at = NOW() WHERE id = $2`, [
    shouldVerify,
    result.rows[0].user_id,
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, 'Verification request reviewed', serializeVerification(result.rows[0])));
});
