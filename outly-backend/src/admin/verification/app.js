const SECRET_STORAGE_KEY = 'outly_admin_verification_secret';

const state = {
  secret: '',
  page: 1,
  limit: 20,
  status: '',
  search: '',
  sort: 'created_desc',
  loading: false,
  rows: [],
  selectedId: null,
  detail: null,
  detailLoading: false,
  summary: { total: 0, pending: 0, approved: 0, rejected: 0 },
  pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
  searchTimer: null,
};

const refs = {};

const qs = (selector) => document.querySelector(selector);

const fmtDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const setHidden = (el, hidden) => {
  if (!el) return;
  el.classList.toggle('hidden', Boolean(hidden));
};

const statusBadgeClass = (status) => {
  if (status === 'approved') return 'badge badge-approved';
  if (status === 'rejected') return 'badge badge-rejected';
  if (status === 'pending') return 'badge badge-pending';
  return 'badge badge-neutral';
};

const authHeaders = () => {
  if (!state.secret) return {};
  return { 'x-admin-secret': state.secret };
};

const apiRequest = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...authHeaders(),
    },
  });

  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    const message = payload?.message || `Request failed with ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  return payload.data;
};

const buildListQuery = () => {
  const query = new URLSearchParams();
  query.set('page', String(state.page));
  query.set('limit', String(state.limit));
  query.set('sort', state.sort);
  if (state.status) query.set('status', state.status);
  if (state.search) query.set('search', state.search);
  return query.toString();
};

const applyAuthState = (valid) => {
  refs.authState.textContent = valid ? 'Auth verified' : 'Auth not verified';
  refs.authState.className = valid ? 'badge badge-approved' : 'badge badge-neutral';
};

const showSecretModal = (showError = '') => {
  refs.secretError.textContent = showError;
  setHidden(refs.secretError, !showError);
  refs.secretInput.value = state.secret || '';
  setHidden(refs.secretModal, false);
  refs.secretInput.focus();
};

const closeSecretModal = () => {
  setHidden(refs.secretModal, true);
};

const renderSummary = () => {
  refs.summaryTotal.textContent = String(state.summary.total || 0);
  refs.summaryPending.textContent = String(state.summary.pending || 0);
  refs.summaryApproved.textContent = String(state.summary.approved || 0);
  refs.summaryRejected.textContent = String(state.summary.rejected || 0);
};

const renderPagination = () => {
  const { page, totalPages, total } = state.pagination;
  refs.pageMeta.textContent = `Page ${page} of ${totalPages} • ${total} total`;
  refs.prevPageBtn.disabled = page <= 1 || state.loading;
  refs.nextPageBtn.disabled = page >= totalPages || state.loading;
};

const renderRows = () => {
  if (state.loading) {
    refs.requestsBody.innerHTML = '<tr><td colspan="7" class="empty-cell">Loading requests...</td></tr>';
    return;
  }

  if (!state.rows.length) {
    refs.requestsBody.innerHTML = '<tr><td colspan="7" class="empty-cell">No verification requests found.</td></tr>';
    return;
  }

  refs.requestsBody.innerHTML = state.rows.map((row) => {
    const selectedClass = row.id === state.selectedId ? 'active' : '';
    return `
      <tr data-id="${row.id}" class="${selectedClass}">
        <td>#${esc(row.id)}</td>
        <td>${esc(row.userId)}</td>
        <td>${esc(`${row.firstName} ${row.lastName}`)}</td>
        <td>${esc(row.documentType || 'Aadhaar')}</td>
        <td><span class="${statusBadgeClass(row.status)}">${esc((row.status || 'pending').toUpperCase())}</span></td>
        <td>${esc(fmtDateTime(row.createdAt))}</td>
        <td>${esc(fmtDateTime(row.reviewedAt))}</td>
      </tr>
    `;
  }).join('');
};

const openLightbox = (imageUrl) => {
  if (!imageUrl) return;
  refs.lightboxImage.src = imageUrl;
  setHidden(refs.imageLightbox, false);
};

const closeLightbox = () => {
  refs.lightboxImage.src = '';
  setHidden(refs.imageLightbox, true);
};

const renderDetail = () => {
  if (state.detailLoading) {
    refs.detailContent.innerHTML = '<p class="muted">Loading request details...</p>';
    refs.detailStatusBadge.className = 'badge badge-neutral';
    refs.detailStatusBadge.textContent = 'Loading';
    return;
  }

  const detail = state.detail;
  if (!detail) {
    refs.detailStatusBadge.className = 'badge badge-neutral';
    refs.detailStatusBadge.textContent = 'Select row';
    refs.detailContent.className = 'detail-placeholder';
    refs.detailContent.textContent =
      'Select a request to review identity details, verify images, and approve or reject.';
    return;
  }

  refs.detailStatusBadge.className = statusBadgeClass(detail.status);
  refs.detailStatusBadge.textContent = (detail.status || 'pending').toUpperCase();

  const documentImage = detail.documentImageUrl || detail.documentImageBase64 || detail.aadhaarImageUrl || detail.aadhaarImageBase64 || '';
  const selfieImage = detail.selfieImageUrl || detail.selfieImageBase64 || '';

  refs.detailContent.className = '';
  refs.detailContent.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><b>ID</b>${esc(detail.id)}</div>
      <div class="detail-item"><b>User</b>${esc(detail.userId)}</div>
      <div class="detail-item"><b>Name</b>${esc(`${detail.firstName} ${detail.lastName}`)}</div>
      <div class="detail-item"><b>Birthday</b>${esc(detail.birthday || '-')}</div>
      <div class="detail-item"><b>Document Type</b>${esc(detail.documentType || 'Aadhaar')}</div>
      <div class="detail-item"><b>Document Number</b>${esc(detail.documentNumber || detail.aadhaarNumber || '-')}</div>
      <div class="detail-item"><b>Created At</b>${esc(fmtDateTime(detail.createdAt))}</div>
      <div class="detail-item"><b>Reviewed At</b>${esc(fmtDateTime(detail.reviewedAt))}</div>
      <div class="detail-item"><b>Reviewed By</b>${esc(detail.reviewedBy || '-')}</div>
      <div class="detail-item"><b>Last Updated</b>${esc(fmtDateTime(detail.updatedAt))}</div>
    </div>

    <div class="images-grid">
      <div class="image-card">
        <p>Document</p>
        ${documentImage ? `<img data-preview="document" src="${documentImage}" alt="Document" />` : '<span class="muted">No document image</span>'}
      </div>
      <div class="image-card">
        <p>Selfie</p>
        ${selfieImage ? `<img data-preview="selfie" src="${selfieImage}" alt="Selfie" />` : '<span class="muted">No selfie image</span>'}
      </div>
    </div>

    <div class="review-form">
      <label for="adminNoteInput">Admin Note</label>
      <textarea id="adminNoteInput" placeholder="Add context for approval/rejection...">${esc(detail.adminNote || '')}</textarea>
      <div class="review-actions">
        <button class="btn" id="approveBtn" type="button">Approve</button>
        <button class="btn btn-danger" id="rejectBtn" type="button">Reject</button>
      </div>
    </div>
  `;

  const adminNoteInput = qs('#adminNoteInput');
  const approveBtn = qs('#approveBtn');
  const rejectBtn = qs('#rejectBtn');

  const runReview = async (nextStatus) => {
    const note = adminNoteInput?.value?.trim() || '';
    try {
      approveBtn.disabled = true;
      rejectBtn.disabled = true;
      await apiRequest(`/api/identity-verification/admin/requests/${detail.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus, adminNote: note }),
      });
      await Promise.all([loadList(), loadDetail(detail.id)]);
    } catch (error) {
      window.alert(error.message || 'Could not review request');
    } finally {
      approveBtn.disabled = false;
      rejectBtn.disabled = false;
    }
  };

  approveBtn.addEventListener('click', () => runReview('approved'));
  rejectBtn.addEventListener('click', () => runReview('rejected'));

  refs.detailContent.querySelectorAll('img[data-preview]').forEach((img) => {
    img.addEventListener('click', () => openLightbox(img.src));
  });
};

const loadDetail = async (id) => {
  if (!id) return;

  state.detailLoading = true;
  renderDetail();

  try {
    const detail = await apiRequest(`/api/identity-verification/admin/requests/${id}`);
    state.detail = detail;
    state.selectedId = id;
  } catch (error) {
    state.detail = null;
    state.selectedId = null;
    window.alert(error.message || 'Could not fetch request details');
  } finally {
    state.detailLoading = false;
    renderRows();
    renderDetail();
  }
};

const loadList = async () => {
  state.loading = true;
  renderRows();
  renderPagination();

  try {
    const data = await apiRequest(`/api/identity-verification/admin/requests?${buildListQuery()}`);
    state.rows = Array.isArray(data?.items) ? data.items : [];
    state.pagination = data?.pagination || { page: 1, limit: state.limit, total: 0, totalPages: 1 };
    state.summary = data?.summary || state.summary;

    if (state.selectedId) {
      const stillThere = state.rows.some((row) => row.id === state.selectedId);
      if (!stillThere) {
        state.selectedId = null;
        state.detail = null;
      }
    }

    renderSummary();
    renderRows();
    renderPagination();
    renderDetail();
  } catch (error) {
    state.rows = [];
    state.pagination = { page: 1, limit: state.limit, total: 0, totalPages: 1 };
    renderRows();
    renderPagination();

    if (error.status === 401 || error.status === 403) {
      applyAuthState(false);
      showSecretModal('Admin authentication failed. Check your secret.');
    } else {
      window.alert(error.message || 'Could not load requests');
    }
  } finally {
    state.loading = false;
    renderRows();
    renderPagination();
  }
};

const validateSecret = async (candidate) => {
  const previous = state.secret;
  state.secret = candidate;

  try {
    await apiRequest('/api/identity-verification/admin/requests?page=1&limit=1');
    sessionStorage.setItem(SECRET_STORAGE_KEY, candidate);
    applyAuthState(true);
    closeSecretModal();
    return true;
  } catch (error) {
    state.secret = previous;
    return false;
  }
};

const bindEvents = () => {
  refs.openSecretModalBtn.addEventListener('click', () => showSecretModal(''));

  refs.saveSecretBtn.addEventListener('click', async () => {
    const candidate = refs.secretInput.value.trim();
    if (!candidate) {
      refs.secretError.textContent = 'Admin secret is required.';
      setHidden(refs.secretError, false);
      return;
    }

    refs.saveSecretBtn.disabled = true;
    const ok = await validateSecret(candidate);
    refs.saveSecretBtn.disabled = false;

    if (!ok) {
      refs.secretError.textContent = 'Invalid admin secret.';
      setHidden(refs.secretError, false);
      return;
    }

    await loadList();
  });

  refs.cancelSecretBtn.addEventListener('click', () => closeSecretModal());

  refs.reloadBtn.addEventListener('click', () => {
    state.page = 1;
    void loadList();
  });

  refs.statusFilter.addEventListener('change', () => {
    state.status = refs.statusFilter.value;
    state.page = 1;
    void loadList();
  });

  refs.sortBy.addEventListener('change', () => {
    state.sort = refs.sortBy.value;
    state.page = 1;
    void loadList();
  });

  refs.pageSize.addEventListener('change', () => {
    state.limit = Number(refs.pageSize.value) || 20;
    state.page = 1;
    void loadList();
  });

  refs.searchInput.addEventListener('input', () => {
    if (state.searchTimer) {
      clearTimeout(state.searchTimer);
    }

    state.searchTimer = setTimeout(() => {
      state.search = refs.searchInput.value.trim();
      state.page = 1;
      void loadList();
    }, 260);
  });

  refs.prevPageBtn.addEventListener('click', () => {
    if (state.pagination.page <= 1) return;
    state.page -= 1;
    void loadList();
  });

  refs.nextPageBtn.addEventListener('click', () => {
    if (state.pagination.page >= state.pagination.totalPages) return;
    state.page += 1;
    void loadList();
  });

  refs.requestsBody.addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-id]');
    if (!row) return;
    const id = Number(row.dataset.id);
    if (!id) return;
    void loadDetail(id);
  });

  refs.closeLightboxBtn.addEventListener('click', closeLightbox);
  refs.imageLightbox.addEventListener('click', (event) => {
    if (event.target === refs.imageLightbox) closeLightbox();
  });
};

const hydrateRefs = () => {
  refs.authState = qs('#authState');
  refs.openSecretModalBtn = qs('#openSecretModalBtn');
  refs.reloadBtn = qs('#reloadBtn');
  refs.searchInput = qs('#searchInput');
  refs.statusFilter = qs('#statusFilter');
  refs.sortBy = qs('#sortBy');
  refs.pageSize = qs('#pageSize');
  refs.requestsBody = qs('#requestsBody');
  refs.prevPageBtn = qs('#prevPageBtn');
  refs.nextPageBtn = qs('#nextPageBtn');
  refs.pageMeta = qs('#pageMeta');

  refs.summaryTotal = qs('#summaryTotal');
  refs.summaryPending = qs('#summaryPending');
  refs.summaryApproved = qs('#summaryApproved');
  refs.summaryRejected = qs('#summaryRejected');

  refs.detailPanel = qs('#detailPanel');
  refs.detailStatusBadge = qs('#detailStatusBadge');
  refs.detailContent = qs('#detailContent');

  refs.secretModal = qs('#secretModal');
  refs.secretInput = qs('#secretInput');
  refs.secretError = qs('#secretError');
  refs.saveSecretBtn = qs('#saveSecretBtn');
  refs.cancelSecretBtn = qs('#cancelSecretBtn');

  refs.imageLightbox = qs('#imageLightbox');
  refs.lightboxImage = qs('#lightboxImage');
  refs.closeLightboxBtn = qs('#closeLightboxBtn');
};

const init = async () => {
  hydrateRefs();
  bindEvents();

  const querySecret = new URLSearchParams(window.location.search).get('secret');
  const storedSecret = sessionStorage.getItem(SECRET_STORAGE_KEY);

  if (querySecret) {
    state.secret = querySecret.trim();
    sessionStorage.setItem(SECRET_STORAGE_KEY, state.secret);
    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({}, '', cleanUrl);
  } else if (storedSecret) {
    state.secret = storedSecret.trim();
  }

  if (!state.secret) {
    applyAuthState(false);
    showSecretModal('');
    return;
  }

  applyAuthState(true);
  await loadList();
};

window.addEventListener('DOMContentLoaded', () => {
  void init();
});
