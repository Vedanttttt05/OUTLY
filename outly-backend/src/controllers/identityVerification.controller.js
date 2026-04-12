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
      const response = await fetch(buildUrl('') + '&_=' + Date.now().toString().slice(-6), {
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
      const docImage = row.documentImageBase64 || row.aadhaarImageBase64 || '';
      const selfieImage = row.selfieImageBase64 || '';

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

export const renderVerificationAdminPanel = asyncHandler(async (req, res) => {
  ensureAdminPanelAccess(req);

  const secret = getProvidedAdminSecret(req);
  if (!secret) {
    throw new ApiError('Provide ?secret=... to open this temporary admin UI', '', [], 400);
  }

  const rawStatus = req.query.status;
  const status = typeof rawStatus === 'string' ? rawStatus.trim() : '';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(buildAdminPanelHtml({ secret, status }));
});

export const getVerificationRequestsForAdmin = asyncHandler(async (req, res) => {
  ensureAdminPanelAccess(req);

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

  return res
    .status(200)
    .json(new ApiResponse(200, 'Verification request reviewed', serializeVerification(result.rows[0])));
});
