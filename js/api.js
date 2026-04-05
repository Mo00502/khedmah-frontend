/**
 * Khedmah API Client — shared across all 36 pages
 *
 * Usage:  const data = await API.auth.login(email, password);
 *
 * Auto-handles:
 *  - Authorization: Bearer <token> headers
 *  - 401 → silent token refresh → retry once → redirect to login
 *  - Response unwrapping  ({ success, data } → returns data directly)
 *  - Structured error objects  { status, message, errors[] }
 *
 * Config (set before loading this script if needed):
 *  window.KHEDMAH_API_URL = 'https://api.khedmah.sa/api/v1';  // defaults below
 */

(function () {
  'use strict';

  /* ─── Configuration ──────────────────────────────────────────────────────── */

  const BASE = (window.KHEDMAH_API_URL || 'http://localhost:3000/api/v1').replace(/\/$/, '');

  /* ─── Storage helpers ────────────────────────────────────────────────────── */

  const Store = {
    get:    (k)    => { try { return localStorage.getItem(k); } catch { return null; } },
    set:    (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    remove: (k)    => { try { localStorage.removeItem(k); } catch {} },

    getAccessToken:  () => Store.get('khedmah_access_token'),
    getRefreshToken: () => Store.get('khedmah_refresh_token'),
    getTokenId:      () => Store.get('khedmah_token_id'),

    saveTokens(accessToken, tokenId, refreshToken) {
      Store.set('khedmah_access_token',  accessToken);
      Store.set('khedmah_token_id',      tokenId);
      Store.set('khedmah_refresh_token', refreshToken);
    },

    saveUser(user) {
      // Normalise role to lowercase so existing auth-guard checks (role==='provider') keep working
      const saved = { ...user, role: (user.role || '').toLowerCase() };
      Store.set('khedmah_user',  JSON.stringify(saved));
      // Keep the demo flag so existing auth-guard code keeps working
      Store.set('khedmah_demo', '1');
      const r = saved.role;
      if (r === 'admin' || r === 'super_admin' || r === 'support') {
        Store.set('khedmah_admin', JSON.stringify({ loggedIn: true, username: user.username }));
      }
    },

    clearAll() {
      ['khedmah_access_token', 'khedmah_refresh_token', 'khedmah_token_id',
       'khedmah_demo', 'khedmah_user', 'khedmah_admin'].forEach(k => Store.remove(k));
    },

    getUser() {
      try { return JSON.parse(Store.get('khedmah_user') || 'null'); } catch { return null; }
    },
  };

  /* ─── Error class ────────────────────────────────────────────────────────── */

  class ApiError extends Error {
    constructor(status, message, errors) {
      super(message);
      this.status = status;
      this.errors = errors || [];
      this.name   = 'ApiError';
    }
  }

  /* ─── Core fetch wrapper ─────────────────────────────────────────────────── */

  let _refreshing = null; // singleton promise during token refresh

  async function _fetch(method, path, body, opts = {}) {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;

    const headers = { 'Content-Type': 'application/json' };
    if (!opts.skipAuth) {
      const token = Store.getAccessToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });

    // 401 → try silent refresh once
    if (res.status === 401 && !opts.skipAuth && !opts._retried) {
      const refreshed = await _tryRefresh();
      if (refreshed) {
        return _fetch(method, path, body, { ...opts, _retried: true });
      }
      // Read role BEFORE clearing session so we can redirect correctly
      const role = Store.getUser()?.role;
      Store.clearAll();
      window.location.href = (role === 'admin' || role === 'super_admin' || role === 'support') ? 'admin-login.html' : 'login.html';
      throw new ApiError(401, 'انتهت جلستك. يرجى تسجيل الدخول مجدداً.');
    }

    // Parse JSON (some endpoints return 204 with no body)
    let json = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      json = await res.json();
    }

    if (!res.ok) {
      const msg    = json?.message || _httpMessage(res.status);
      const errors = Array.isArray(json?.errors) ? json.errors : [];
      throw new ApiError(res.status, msg, errors);
    }

    // Unwrap the ResponseInterceptor envelope: { success, data, meta, ... }
    return json?.data !== undefined ? json.data : json;
  }

  async function _tryRefresh() {
    if (_refreshing) return _refreshing;

    const tokenId      = Store.getTokenId();
    const refreshToken = Store.getRefreshToken();
    if (!tokenId || !refreshToken) return false;

    _refreshing = (async () => {
      try {
        const res = await fetch(`${BASE}/auth/token/refresh`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ tokenId, refreshToken }),
        });
        if (!res.ok) return false;
        const json = await res.json();
        const d    = json?.data || json;
        Store.saveTokens(d.accessToken, d.tokenId, d.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        _refreshing = null;
      }
    })();

    return _refreshing;
  }

  function _httpMessage(status) {
    const map = {
      400: 'بيانات غير صحيحة',
      401: 'غير مصرح لك بالوصول',
      403: 'ليس لديك صلاحية',
      404: 'العنصر غير موجود',
      409: 'يوجد تعارض في البيانات',
      422: 'بيانات غير صالحة',
      429: 'طلبات كثيرة، يرجى الانتظار',
      500: 'خطأ في الخادم، يرجى المحاولة لاحقاً',
    };
    return map[status] || `خطأ ${status}`;
  }

  /* ─── HTTP shortcuts ─────────────────────────────────────────────────────── */

  const http = {
    get:    (path, opts)       => _fetch('GET',    path, null, opts),
    post:   (path, body, opts) => _fetch('POST',   path, body, opts),
    patch:  (path, body, opts) => _fetch('PATCH',  path, body, opts),
    put:    (path, body, opts) => _fetch('PUT',    path, body, opts),
    delete: (path, opts)       => _fetch('DELETE', path, null, opts),
  };

  /* ─── API namespaces ─────────────────────────────────────────────────────── */

  const auth = {
    async login(identifier, password) {
      const d = await http.post('/auth/login', { identifier, password }, { skipAuth: true });
      Store.saveTokens(d.accessToken, d.tokenId, d.refreshToken);
      // Fetch full user profile and persist
      const user = await auth.me();
      Store.saveUser(user);
      return user;
    },

    async registerCustomer(data) {
      return http.post('/auth/register/customer', data, { skipAuth: true });
    },

    async registerProvider(data) {
      return http.post('/auth/register/provider', data, { skipAuth: true });
    },

    async me() {
      return http.get('/auth/me');
    },

    async logout() {
      const tokenId = Store.getTokenId();
      try {
        await http.post('/auth/logout', tokenId ? { tokenId } : {});
      } catch { /* ignore network errors on logout */ }
      Store.clearAll();
    },

    async forgotPassword(email) {
      return http.post('/auth/forgot-password', { email }, { skipAuth: true });
    },

    async resetPassword(token, newPassword) {
      return http.post('/auth/reset-password', { token, newPassword }, { skipAuth: true });
    },

    async resendVerification(email) {
      return http.post('/auth/verify-email/resend', { email }, { skipAuth: true });
    },

    async changePassword(currentPassword, newPassword) {
      return http.patch('/auth/me/password', { currentPassword, newPassword });
    },

    isLoggedIn:  () => !!Store.getAccessToken(),
    currentUser: () => Store.getUser(),
    getRole:     () => Store.getUser()?.role || null,
  };

  const requests = {
    create: (data)           => http.post('/requests', data),
    list:   (params = {})    => http.get('/requests?' + new URLSearchParams(params)),
    get:    (id)             => http.get(`/requests/${id}`),
    cancel: (id)             => http.patch(`/requests/${id}/cancel`),

    // Provider actions
    submitQuote: (id, data)           => http.post(`/requests/${id}/quotes`, data),
    acceptQuote: (id, quoteId)        => http.patch(`/requests/${id}/quotes/${quoteId}/accept`),
    start:       (id)                 => http.patch(`/requests/${id}/start`),
    complete:    (id)                 => http.patch(`/requests/${id}/complete`),
  };

  const payments = {
    initiate:    (requestId, data) => http.post(`/payments/requests/${requestId}/pay`, data),
    release:     (requestId)       => http.post(`/payments/requests/${requestId}/release`),
    status:      (paymentId)       => http.get(`/payments/${paymentId}/status`),
    escrow:      (requestId)       => http.get(`/payments/requests/${requestId}/escrow`),
  };

  const wallet = {
    balance:        ()          => http.get('/wallet/balance'),
    transactions:   (p = {})    => http.get('/wallet/transactions?' + new URLSearchParams(p)),
    withdraw:       (data)      => http.post('/wallet/withdraw', data),
    withdrawals:    (p = {})    => http.get('/wallet/withdrawals?' + new URLSearchParams(p)),
  };

  const providers = {
    getProfile:   (id)        => http.get(`/providers/${id}`),
    myProfile:    ()          => http.get('/providers/me/profile'),
    myEarnings:   ()          => http.get('/providers/me/earnings'),
    // Bank settings: ibanNumber + bankName live on ProviderProfile.
    // accountName (beneficiary) is cached in localStorage since schema has no field for it.
    updateBank: async (data) => {
      if (data.accountName) Store.set('khedmah_bank_account_name', data.accountName);
      return http.patch('/providers/me/profile', { ibanNumber: data.iban, bankName: data.bankName });
    },
    getBankSettings: async () => {
      const profile = await http.get('/providers/me/profile');
      // Merge cached accountName (not stored on server — kept in localStorage)
      return { ...(profile || {}), accountName: Store.get('khedmah_bank_account_name') || '' };
    },
    submitDocs:   (data)      => http.post('/providers/me/documents', data),
    // Skills/services: backend uses catalog model (providers link to existing Service records)
    // services() fetches the provider's linked skills via their profile
    services:      () => http.get('/providers/me/profile').then(p => p?.skills || []),
    addService:    (data) => http.post('/providers/me/skills', data),        // data.serviceId required
    updateService: (id, data) => http.patch(`/providers/me/skills/${id}`, data),
    removeService: (id)       => http.delete(`/providers/me/skills/${id}`),
    getSchedule:  ()          => http.get('/providers/me/schedule'),
    saveSchedule: (data)      => http.patch('/providers/me/schedule', data),
  };

  const services = {
    list:       (params = {}) => http.get('/services?' + new URLSearchParams(params)),
    get:        (id)          => http.get(`/services/${id}`),
    categories: ()            => http.get('/services/categories'),
    byService:  (id, p = {})  => http.get(`/services/${id}/providers?` + new URLSearchParams(p)),
  };

  const search = {
    providers: (params = {}) => http.get('/search/providers?' + new URLSearchParams(params)),
    services:  (q)           => http.get(`/search/services?q=${encodeURIComponent(q)}`),
  };

  const reviews = {
    create: (requestId, data) => http.post(`/reviews/requests/${requestId}`, data),
    list:   (providerId, p = {}) => http.get(`/reviews/providers/${providerId}?` + new URLSearchParams(p)),
  };

  const notifications = {
    list:      (p = {})  => http.get('/notifications?' + new URLSearchParams(p)),
    markRead:  (id)      => http.patch(`/notifications/${id}/read`),
    markAllRead: ()      => http.patch('/notifications/read-all'),
    registerToken: (data) => http.post('/notifications/device-token', data),
  };

  const chat = {
    conversations: ()     => http.get('/chat/conversations'),
    messages:      (id, p = {}) => http.get(`/chat/conversations/${id}/messages?` + new URLSearchParams(p)),
    send:          (id, data)   => http.post(`/chat/conversations/${id}/messages`, data),
    // create() chooses the right endpoint based on context
    create: (data) => {
      if (data.requestId) return http.post(`/chat/request/${data.requestId}`);
      if (data.tenderId)  return http.post(`/chat/tender/${data.tenderId}`);
      if (data.userId)    return http.post(`/chat/direct/${data.userId}`);
      return http.post('/chat/direct/' + (data.recipientId || ''));
    },
    // markRead not in backend — no-op to avoid 404
    markRead: () => Promise.resolve(),
  };

  const admin = {
    stats:               ()       => http.get('/admin/dashboard'),
    users:               (p = {}) => http.get('/admin/users?' + new URLSearchParams(p)),
    suspendUser:         (id, data) => http.post(`/admin/users/${id}/suspend`, data),
    unsuspendUser:       (id)     => http.post(`/admin/users/${id}/reinstate`),
    deleteUser:          (id)     => http.post(`/admin/users/${id}/delete`),
    pendingProviders:    ()       => http.get('/admin/verifications/pending'),
    approveProvider:     (id)     => http.patch(`/admin/verifications/${id}/approve`),
    rejectProvider:      (id, data) => http.patch(`/admin/verifications/${id}/reject`, data),
    disputes:            (p = {}) => http.get('/admin/disputes?' + new URLSearchParams(p)),
    resolveDispute:      (id, data) => http.post(`/admin/disputes/${id}/resolve`, data),
    withdrawals:         (p = {}) => http.get('/wallet/admin/withdrawals?' + new URLSearchParams(p)),
    approveWithdrawal:   (id, data) => http.patch(`/wallet/admin/withdrawals/${id}/approve`, data),
    rejectWithdrawal:    (id, data) => http.patch(`/wallet/admin/withdrawals/${id}/reject`, data),
    health:              ()       => http.get('/admin/health'),
    overdueCommissions:  ()       => http.get('/admin/commissions/overdue'),
    weeklyReport:        ()       => http.get('/admin/reports/weekly'),
  };

  const tenders = {
    list:               (p = {})           => http.get('/tenders?' + new URLSearchParams(p)),
    get:                (id)               => http.get(`/tenders/${id}`),
    create:             (data)             => http.post('/tenders', data),
    bid:                (id, data)         => http.post(`/tenders/${id}/bids`, data),
    updateBid:          (id, bidId, data)  => http.patch(`/tenders/${id}/bids/${bidId}`, data),
    withdrawBid:        (id, bidId)        => http.delete(`/tenders/${id}/bids/${bidId}`),
    listBids:           (id)               => http.get(`/tenders/${id}/bids`),
    award:              (id, bidId)        => http.post(`/tenders/${id}/award/${bidId}`),
    myBids:             ()                 => http.get('/tenders/my-bids'),
    milestones:         (id)               => http.get(`/tenders/${id}/milestones`),
    createMilestone:    (id, data)         => http.post(`/tenders/${id}/milestones`, data),
    updateMilestone:    (milestoneId, data) => http.patch(`/tenders/milestones/${milestoneId}/status`, data),
    commissionSettings: ()                 => http.get('/tenders/settings/commission'),
    updateCommission:   (module, rate)     => http.patch('/tenders/settings/commission', { module, rate }),
  };

  /* ─── Translation (AR → EN) ─────────────────────────────────────────────── */
  const translation = {
    translate: (title, description) => http.post('/ai/translate', { title, description }),
  };

  const invoices = {
    list:      (p = {}) => http.get('/invoices?' + new URLSearchParams(p)),
    get:       (id)     => http.get(`/invoices/${id}`),
  };

  const equipment = {
    list:         (p = {})      => http.get('/equipment?' + new URLSearchParams(p)),
    get:          (id)          => http.get(`/equipment/${id}`),
    rent:         (id, data)    => http.post(`/equipment/${id}/rentals`, data),
    myRentals:    ()            => http.get('/equipment/rentals/mine'),
    myListings:   ()            => http.get('/equipment/mine'),
    create:       (data)        => http.post('/equipment', data),
    update:       (id, data)    => http.patch(`/equipment/${id}`, data),
    remove:       (id)          => http.delete(`/equipment/${id}`),
    requestQuote: (id, data)    => http.post(`/equipment/${id}/quote`, data),
    updateRental: (id, data)    => http.patch(`/equipment/rentals/${id}`, data),
  };

  const consultations = {
    list:     (p = {})      => http.get('/consultations?' + new URLSearchParams(p)),
    book:     (data)        => http.post('/consultations', data),
    create:   (data)        => http.post('/consultations', data),   // alias for .book()
    get:      (id)          => http.get(`/consultations/${id}`),
    accept:   (id)          => http.patch(`/consultations/${id}/accept`),
    complete: (id)          => http.patch(`/consultations/${id}/complete`),
    cancel:   (id)          => http.patch(`/consultations/${id}/cancel`),
    rate:     (id, data)    => http.post(`/consultations/${id}/rate`, data),
  };

  const maps = {
    geocode:      (address) => http.get(`/maps/geocode?address=${encodeURIComponent(address)}`),
    distance:     (o, d)    => http.get(`/maps/distance?origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(d)}`),
    autocomplete: (q, tok)  => http.get(`/maps/autocomplete?q=${encodeURIComponent(q)}&sessionToken=${tok}`),
  };

  const addresses = {
    list:       ()          => http.get('/users/me/addresses'),
    create:     (data)      => http.post('/users/me/addresses', data),
    update:     (id, data)  => http.patch(`/users/me/addresses/${id}`, data),
    remove:     (id)        => http.delete(`/users/me/addresses/${id}`),
    setDefault: (id)        => http.patch(`/users/me/addresses/${id}/default`),
  };

  /* ─── Toast / UI helpers ─────────────────────────────────────────────────── */

  function toast(message, type = 'danger') {
    let container = document.getElementById('api-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'api-toast-container';
      container.style.cssText = [
        'position:fixed',
        'bottom:1.5rem',
        'left:1.5rem',
        'z-index:99999',
        'display:flex',
        'flex-direction:column-reverse',
        'gap:.6rem',
        'max-width:360px',
        'width:calc(100% - 3rem)'
      ].join(';');
      document.body.appendChild(container);
      const style = document.createElement('style');
      style.textContent = `
        @keyframes toastIn { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes toastOut { from { opacity:1; transform:translateY(0); } to { opacity:0; transform:translateY(20px); } }
        @keyframes toastProgress { from { width:100%; } to { width:0%; } }
        .api-toast-item { animation: toastIn .25s ease forwards; border-radius:12px; overflow:hidden;
          box-shadow:0 8px 32px rgba(0,0,0,.18); display:flex; flex-direction:column; }
        .api-toast-item.removing { animation: toastOut .25s ease forwards; }
        .api-toast-body { display:flex; align-items:flex-start; gap:.75rem; padding:.85rem 1rem; }
        .api-toast-icon { font-size:1.2rem; flex-shrink:0; margin-top:.05rem; }
        .api-toast-msg { flex:1; font-size:.9rem; line-height:1.45; font-family:'Tajawal',sans-serif; direction:rtl; }
        .api-toast-close { background:none; border:none; color:inherit; opacity:.7; cursor:pointer; font-size:1.1rem; padding:0 .25rem; flex-shrink:0; line-height:1; }
        .api-toast-close:hover { opacity:1; }
        .api-toast-progress { height:3px; animation:toastProgress linear forwards; }
      `;
      document.head.appendChild(style);
    }
    const id = 'toast-' + Date.now() + Math.random().toString(36).slice(2,6);
    const cfg = {
      success: { bg:'#065f46', accent:'#10b981', icon:'✅' },
      danger:  { bg:'#7f1d1d', accent:'#ef4444', icon:'❌' },
      warning: { bg:'#78350f', accent:'#f59e0b', icon:'⚠️' },
      info:    { bg:'#1e3a5f', accent:'#3b82f6', icon:'ℹ️' },
    };
    const c = cfg[type] || cfg.danger;
    const duration = 4500;
    const el = document.createElement('div');
    el.className = 'api-toast-item';
    el.id = id;
    el.style.background = c.bg;
    el.style.color = '#fff';
    el.innerHTML = `
      <div class="api-toast-body">
        <span class="api-toast-icon">${c.icon}</span>
        <span class="api-toast-msg">${message}</span>
        <button class="api-toast-close" onclick="document.getElementById('${id}')?.remove()">✕</button>
      </div>
      <div class="api-toast-progress" style="background:${c.accent};animation-duration:${duration}ms;"></div>`;
    container.appendChild(el);
    setTimeout(() => {
      const t = document.getElementById(id);
      if (!t) return;
      t.classList.add('removing');
      setTimeout(() => t?.remove(), 280);
    }, duration);
  }

  /** Extract a user-facing error message from an ApiError or unknown error. */
  function errorMsg(err) {
    if (err instanceof ApiError) {
      if (err.errors?.length) return err.errors.join(' ، ');
      return err.message;
    }
    return 'حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.';
  }

  /* ─── Export ─────────────────────────────────────────────────────────────── */

  window.API = {
    // HTTP primitives (advanced use)
    get:    http.get,
    post:   http.post,
    patch:  http.patch,
    put:    http.put,
    delete: http.delete,

    // Domain namespaces
    auth, requests, payments, wallet, providers, services,
    search, reviews, notifications, chat, admin, tenders,
    invoices, equipment, consultations, maps, addresses, translation,

    // Auth helpers (frequently needed in guards)
    isLoggedIn:  auth.isLoggedIn,
    currentUser: auth.currentUser,
    getRole:     auth.getRole,

    // Storage
    Store,

    // UI helpers
    toast,
    errorMsg,
    ApiError,
  };

  /* ─── CSS for toast fade-in (handled inside toast() now) ────────────────── */

})();
