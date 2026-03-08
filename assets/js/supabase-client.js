/* ============================================================
   KHEDMAH — Supabase Shared Client
   ============================================================
   HOW TO GET YOUR KEYS:
   1. Go to https://supabase.com and create a free project
   2. Dashboard → Settings → API
   3. Copy "Project URL" and "anon public" key below
   ============================================================ */

const SUPABASE_URL      = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';

/* ── Demo mode: bypass all Supabase calls ─────────────────────── */
const _DEMO = !!localStorage.getItem('khedmah_demo');
const _DEMO_USER = _DEMO ? (function(){ try{ return JSON.parse(localStorage.getItem('khedmah_demo')); }catch(e){ return null; } })() : null;

/* Initialize the Supabase JS client (loaded from CDN) */
let sb = null;
try {
  if (!_DEMO && window.supabase) {
    const { createClient } = window.supabase;
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn('Supabase init skipped:', e.message);
}


/* ──────────────────────────────────────────────────────────
   AUTH HELPERS
   ────────────────────────────────────────────────────────── */
const Auth = {

  /** Return current authenticated user, or null */
  async getUser() {
    if (_DEMO) return { id: 'demo-user', phone: _DEMO_USER?.phone, email: null };
    if (!sb) return null;
    const { data: { user } } = await sb.auth.getUser();
    return user;
  },

  /** Fetch profile row for a given user id */
  async getProfile(userId) {
    if (_DEMO) return {
      id: 'demo-user',
      full_name: _DEMO_USER?.name || 'سالم الدوسري',
      phone: _DEMO_USER?.phone || '0594607776',
      role: _DEMO_USER?.role || 'customer',
      preferred_language: 'ar'
    };
    if (!sb) return null;
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error && error.code !== 'PGRST116') console.error('getProfile:', error);
    return data || null;
  },

  /**
   * Call at the top of any protected page.
   * In demo mode, always passes. Otherwise redirects to login if not authenticated.
   */
  async requireAuth() {
    if (_DEMO) {
      const user = await this.getUser();
      const profile = await this.getProfile('demo-user');
      return { user, profile };
    }
    const user = await this.getUser();
    if (!user) {
      window.location.href = _rootPath() + 'auth/login.html';
      return null;
    }
    const profile = await this.getProfile(user.id);
    return { user, profile };
  },

  /** Sign out and go to login page */
  async signOut() {
    localStorage.removeItem('khedmah_demo');
    sessionStorage.clear();
    if (sb) await sb.auth.signOut();
    window.location.href = _rootPath() + 'auth/login.html';
  },

  /**
   * Send phone OTP via Supabase.
   * Phone is auto-converted to E.164 (+966XXXXXXXXX).
   */
  async sendOtp(phone) {
    if (_DEMO) return { ok: true, error: null };
    if (!sb) return { ok: false, error: { message: 'Supabase غير مُهيَّأ' } };
    const e164 = _toE164(phone);
    if (!e164) return { ok: false, error: { message: 'رقم الهاتف غير صحيح' } };
    const { error } = await sb.auth.signInWithOtp({ phone: e164 });
    return { ok: !error, error };
  },

  /**
   * Verify a phone OTP token.
   * Returns { ok, user, error }.
   */
  async verifyOtp(phone, token) {
    if (_DEMO) return { ok: true, user: await this.getUser(), error: null };
    if (!sb) return { ok: false, user: null, error: { message: 'Supabase غير مُهيَّأ' } };
    const e164 = _toE164(phone);
    const { data, error } = await sb.auth.verifyOtp({
      phone: e164,
      token: token.trim(),
      type:  'sms'
    });
    return { ok: !error, user: data?.user || null, error };
  }
};


/* ──────────────────────────────────────────────────────────
   PROFILE HELPERS
   ────────────────────────────────────────────────────────── */
const Profile = {

  /** Create or update a profile row for the current user */
  async upsert(fields) {
    if (_DEMO) return { ok: true, error: null };
    const user = await Auth.getUser();
    if (!user) return { ok: false, error: { message: 'غير مسجل الدخول' } };
    if (!sb) return { ok: false, error: { message: 'Supabase غير مُهيَّأ' } };
    const { error } = await sb
      .from('profiles')
      .upsert({ id: user.id, ...fields }, { onConflict: 'id' });
    if (error) console.error('Profile.upsert:', error);
    return { ok: !error, error };
  }
};


/* ──────────────────────────────────────────────────────────
   FORMAT HELPERS
   ────────────────────────────────────────────────────────── */

/** Format a date string to Arabic or English */
function kFormatDate(dateStr, lang) {
  lang = lang || document.documentElement.lang || 'ar';
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return lang === 'ar'
    ? d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Format a SAR amount */
function kFormatAmount(amount) {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('ar-SA', {
    style: 'currency', currency: 'SAR', maximumFractionDigits: 0
  }).format(amount);
}

/** Arabic booking status labels */
const STATUS_AR = {
  pending:     'قيد الانتظار',
  quoted:      'تم التسعير',
  accepted:    'مقبول',
  in_progress: 'جاري التنفيذ',
  completed:   'مكتمل',
  cancelled:   'ملغي',
  disputed:    'متنازع عليه'
};

/** Status badge colours (Bootstrap-compatible hex) */
const STATUS_COLOR = {
  pending:     '#f59e0b',
  quoted:      '#3b82f6',
  accepted:    '#8b5cf6',
  in_progress: '#06b6d4',
  completed:   '#10b981',
  cancelled:   '#ef4444',
  disputed:    '#f97316'
};

/** Destination routes per user role */
const ROLE_DEST = {
  customer:   'customer/dashboard.html',
  provider:   'provider/dashboard.html',
  company:    'tenders/index.html',
  equipment:  'equipment/list-equipment.html',
  government: 'tenders/post-tender.html',
  engineer:   'services/professional-services.html',
  admin:      'admin/dashboard.html'
};


/* ──────────────────────────────────────────────────────────
   PRIVATE UTILITIES
   ────────────────────────────────────────────────────────── */

/** Resolve how many levels deep the current page is */
function _rootPath() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const depth = parts.length - 1;         // e.g. auth/login.html → 1 level
  return depth > 0 ? '../'.repeat(depth) : '';
}

/** Convert Saudi phone number to E.164 format */
function _toE164(raw) {
  if (!raw) return null;
  let p = String(raw).replace(/[\s\-\(\)\.]/g, '');
  if (/^05\d{8}$/.test(p))  p = '+966' + p.slice(1);   // 05XX... → +96605XX...
  else if (/^5\d{8}$/.test(p)) p = '+9665' + p.slice(1); // 5XX... → +9665XX...
  else if (/^009665/.test(p))  p = '+' + p.slice(2);     // 009665... → +9665...
  if (!/^\+966\d{9}$/.test(p)) return null;              // reject invalid
  return p;
}

/** Mask a phone number for display: +966 5** *** **7 */
function _maskPhone(e164) {
  if (!e164 || e164.length < 8) return e164;
  const d = e164.replace('+966', '').replace(/\D/g, '');
  return `+966 ${d[0]}** *** **${d[d.length - 1]}`;
}

/** Show a short error toast using kToast (from khedmah.js) or alert fallback */
function kError(msg) {
  if (typeof kToast === 'function') kToast(msg, 'danger');
  else console.error(msg);
}
