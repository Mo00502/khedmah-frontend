/**
 * Khedmah AI Chat Widget
 * Self-contained floating AI assistant that injects into any page.
 * Loaded automatically by api.js. To opt-out, set window.KHEDMAH_NO_WIDGET = true
 * before api.js loads.
 */
(function () {
  'use strict';

  if (window._khedmahWidget) return;
  window._khedmahWidget = true;

  /* ─── Config ─────────────────────────────────────────────────────────────── */
  const BASE = (window.KHEDMAH_API_URL || 'http://localhost:3000/api/v1').replace(/\/$/, '');

  /* ─── Helpers ────────────────────────────────────────────────────────────── */
  function isDark()       { return document.documentElement.classList.contains('dark'); }
  function getLang()      { return localStorage.getItem('khedmah_lang') || document.documentElement.lang || 'ar'; }
  function isRTL()        { return getLang() === 'ar'; }
  function isLoggedIn()   { return !!localStorage.getItem('khedmah_demo'); }
  function getToken()     { return localStorage.getItem('khedmah_access_token') || null; }
  function esc(s)         { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* ─── Strings (bilingual) ─────────────────────────────────────────────────── */
  const STRINGS = {
    ar: {
      btnLabel:    'مساعد ذكي',
      title:       'مساعد خدمة الذكي',
      subtitle:    'متاح 24/7 للمساعدة',
      placeholder: 'اكتب سؤالك هنا...',
      send:        'إرسال',
      greeting:    'مرحباً! أنا مساعد خدمة الذكي 🤖\n\nيسعدني مساعدتك في:\n• الاستفسار عن الخدمات والأسعار\n• نظام الدفع والضمان (Escrow)\n• فتح نزاع أو تقديم شكوى\n• كيفية تقييم مزود الخدمة\n\nماذا تريد أن تعرف؟',
      loginPrompt: 'سجّل دخولك للحصول على مساعدة مخصصة من الذكاء الاصطناعي.',
      loginBtn:    '← تسجيل الدخول',
      error:       'عذراً، حدث خطأ. تأكد من الاتصال بالإنترنت وحاول مجدداً.',
      escalate:    '💬 تحدث مع موظف دعم بشري',
      close:       'إغلاق',
      chips: [
        'كيف يعمل نظام الضمان؟',
        'ما هي رسوم المنصة؟',
        'كيف أفتح نزاعاً؟',
        'كيف أقيّم مزود الخدمة؟',
      ],
    },
    en: {
      btnLabel:    'AI Assistant',
      title:       'Khedmah AI Assistant',
      subtitle:    'Available 24/7 to help',
      placeholder: 'Type your question...',
      send:        'Send',
      greeting:    "Hi! I'm Khedmah's AI assistant 🤖\n\nI can help you with:\n• Service & pricing inquiries\n• How the escrow payment works\n• Opening a dispute or complaint\n• Rating your service provider\n\nWhat would you like to know?",
      loginPrompt: 'Log in to get personalized AI assistance.',
      loginBtn:    '← Log In',
      error:       'Sorry, an error occurred. Check your connection and try again.',
      escalate:    '💬 Talk to a Human Agent',
      close:       'Close',
      chips: [
        'How does escrow work?',
        'What are the platform fees?',
        'How do I open a dispute?',
        'How do I rate a provider?',
      ],
    },
  };
  function s(key) { return (STRINGS[getLang()] || STRINGS.ar)[key]; }

  /* ─── Inject CSS ─────────────────────────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('kw-css')) return;
    const el = document.createElement('style');
    el.id = 'kw-css';
    el.textContent = `
/* ── Khedmah Chat Widget ── */
#kw-fab {
  position: fixed !important; bottom: 1.5rem; right: 1.5rem; z-index: 9990;
  width: 54px; height: 54px; border-radius: 50%;
  background: linear-gradient(135deg,#028090,#02C39A);
  color: white; border: none; cursor: pointer;
  font-size: 1.35rem;
  display: flex !important; align-items: center; justify-content: center;
  box-shadow: 0 4px 20px rgba(2,128,144,.45);
  transition: transform .2s, box-shadow .2s;
  overflow: visible !important;
  min-height: unset !important;
  transform: none;
}
#kw-fab:hover { transform: scale(1.1) !important; box-shadow: 0 6px 28px rgba(2,128,144,.55); }
#kw-fab .kw-notify {
  position: absolute; top: -3px; left: -3px;
  width: 17px; height: 17px; border-radius: 50%;
  background: #ef4444; border: 2px solid white;
  font-size: .6rem; font-weight: 900;
  display: flex; align-items: center; justify-content: center;
  animation: kwPulse 2.2s ease-in-out infinite;
}
@keyframes kwPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.2)} }

#kw-panel {
  position: fixed; bottom: 5.25rem; right: 1.5rem; z-index: 9991;
  width: 355px; max-height: 510px;
  background: #fff;
  border-radius: 22px;
  box-shadow: 0 12px 48px rgba(0,0,0,.18);
  /* display:none removes element from paint tree entirely — no GPU layer, no background leak */
  display: none; flex-direction: column; overflow: hidden;
  font-family: 'Tajawal', sans-serif;
  opacity: 0; pointer-events: none;
  transform: scale(.88) translateY(18px);
  transition: transform .24s cubic-bezier(.4,0,.2,1), opacity .24s ease;
}
#kw-panel.kw-open {
  /* display:flex set by JS before adding class so CSS transition fires */
  opacity: 1; pointer-events: auto;
  transform: scale(1) translateY(0);
}

/* Header */
.kw-head {
  background: linear-gradient(135deg,#028090,#02C39A);
  padding: .85rem 1rem; display: flex; align-items: center; gap: .7rem; flex-shrink: 0;
}
.kw-head-icon {
  width: 38px; height: 38px; border-radius: 50%;
  background: rgba(255,255,255,.18);
  display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0;
}
.kw-head-info { flex: 1; color: white; min-width: 0; }
.kw-head-name  { font-weight: 800; font-size: .92rem; }
.kw-head-sub   { font-size: .72rem; opacity: .85; display: flex; align-items: center; gap: .3rem; margin-top: .1rem; }
.kw-online-dot { width: 7px; height: 7px; border-radius: 50%; background: #6ee7b7; flex-shrink: 0; }
.kw-head-close {
  width: 30px; height: 30px; border-radius: 50%;
  background: rgba(255,255,255,.2); border: none; color: white;
  cursor: pointer; font-size: 1rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.kw-head-close:hover { background: rgba(255,255,255,.35); }

/* Messages */
.kw-msgs {
  flex: 1; overflow-y: auto; padding: .8rem .75rem;
  display: flex; flex-direction: column; gap: .6rem; scroll-behavior: smooth;
}
.kw-msgs::-webkit-scrollbar { width: 4px; }
.kw-msgs::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }

.kw-row        { display: flex; align-items: flex-end; gap: .45rem; }
.kw-row.kw-me  { flex-direction: row-reverse; }

.kw-avatar-sm {
  width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
  background: linear-gradient(135deg,#028090,#02C39A);
  display: flex; align-items: center; justify-content: center; font-size: .7rem;
}
.kw-bubble {
  max-width: 82%; padding: .55rem .85rem; border-radius: 16px;
  font-size: .875rem; line-height: 1.55; word-break: break-word; white-space: pre-wrap;
}
.kw-row.kw-ai .kw-bubble  { background: #f1f5f9; color: #1e293b; border-bottom-right-radius: 4px; }
.kw-row.kw-me .kw-bubble  { background: #028090; color: white;   border-bottom-left-radius: 4px; }

.kw-links { margin-top: .4rem; display: flex; flex-direction: column; gap: .3rem; }
.kw-link  {
  display: inline-flex; align-items: center; gap: .3rem;
  font-size: .78rem; font-weight: 600; color: #028090; text-decoration: none;
  background: rgba(2,128,144,.08); padding: .28rem .65rem; border-radius: 8px;
}
.kw-link:hover { background: rgba(2,128,144,.15); }

.kw-esc-btn {
  margin-top: .45rem; width: 100%;
  background: #f0fdf4; border: 1.5px solid #86efac; color: #166534;
  border-radius: 10px; padding: .42rem .75rem;
  font-family: 'Tajawal',sans-serif; font-size: .8rem; font-weight: 700;
  cursor: pointer; text-align: right;
}
.kw-esc-btn:hover { background: #dcfce7; }

/* Typing indicator */
.kw-typing {
  display: flex; align-items: center; gap: .35rem;
  padding: .55rem .85rem; background: #f1f5f9; border-radius: 14px; width: fit-content;
}
.kw-dot { width: 7px; height: 7px; border-radius: 50%; background: #94a3b8; animation: kwBounce .9s infinite; }
.kw-dot:nth-child(2) { animation-delay: .16s; }
.kw-dot:nth-child(3) { animation-delay: .32s; }
@keyframes kwBounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-7px)} }

/* Chips */
.kw-chips {
  padding: .5rem .75rem; display: flex; flex-wrap: wrap; gap: .35rem;
  border-top: 1px solid #f1f5f9; flex-shrink: 0;
}
.kw-chip {
  font-size: .75rem; padding: .28rem .7rem;
  background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 20px;
  cursor: pointer; font-family: 'Tajawal',sans-serif; color: #334155;
  transition: border-color .15s, color .15s; white-space: nowrap;
}
.kw-chip:hover { border-color: #028090; color: #028090; }

/* Input row */
.kw-input-row {
  padding: .55rem .75rem; display: flex; gap: .45rem;
  border-top: 1px solid #f1f5f9; flex-shrink: 0;
}
.kw-input {
  flex: 1; border: 1.5px solid #e2e8f0; border-radius: 12px;
  padding: .48rem .8rem; font-family: 'Tajawal',sans-serif; font-size: .88rem;
  outline: none; background: #f8fafc; color: #1e293b; transition: border-color .15s, box-shadow .15s;
}
.kw-input:focus { border-color: #028090; box-shadow: 0 0 0 3px rgba(2,128,144,.12); background: white; }
.kw-send {
  width: 38px; height: 38px; border-radius: 12px;
  background: #028090; color: white; border: none; cursor: pointer;
  font-size: .95rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  transition: background .15s;
}
.kw-send:hover   { background: #026f7e; }
.kw-send:disabled { background: #94a3b8; cursor: not-allowed; }

/* Login prompt */
.kw-login-block { padding: 1.5rem; text-align: center; }
.kw-login-block p { font-size: .88rem; color: #64748b; margin-bottom: 1rem; line-height: 1.5; }
.kw-login-link {
  display: inline-block; background: #028090; color: white !important;
  padding: .55rem 1.5rem; border-radius: 12px;
  font-family: 'Tajawal',sans-serif; font-weight: 700; font-size: .9rem; text-decoration: none;
}
.kw-login-link:hover { background: #026f7e; }

/* ── Dark Mode ── */
html.dark #kw-panel          { background: #1e293b; }
html.dark .kw-row.kw-ai .kw-bubble { background: #0f172a; color: #e2e8f0; }
html.dark .kw-typing          { background: #0f172a; }
html.dark .kw-dot             { background: #475569; }
html.dark .kw-chips           { border-color: #334155; }
html.dark .kw-chip            { background: #0f172a; border-color: #334155; color: #cbd5e1; }
html.dark .kw-chip:hover      { border-color: #02C39A; color: #02C39A; }
html.dark .kw-input-row       { border-color: #334155; }
html.dark .kw-input           { background: #0f172a; color: #e2e8f0; border-color: #334155; }
html.dark .kw-input:focus     { background: #0f172a; }
html.dark .kw-link            { background: rgba(2,128,144,.12); }
html.dark .kw-esc-btn         { background: rgba(22,101,52,.15); border-color: rgba(134,239,172,.3); color: #6ee7b7; }
html.dark .kw-esc-btn:hover   { background: rgba(22,101,52,.25); }
html.dark .kw-login-block p   { color: #94a3b8; }
html.dark .kw-msgs::-webkit-scrollbar-thumb { background: #475569; }

@media (max-width: 430px) {
  #kw-panel { width: calc(100vw - 2rem); right: 1rem; left: 1rem; }
  #kw-fab   { right: 1rem; }
}
    `;
    document.head.appendChild(el);
  }

  /* ─── State ──────────────────────────────────────────────────────────────── */
  let _open    = false;
  let _busy    = false;
  let _greeted = false;

  /* ─── Build DOM ──────────────────────────────────────────────────────────── */
  function buildPanel() {
    const dir = isRTL() ? 'rtl' : 'ltr';
    const S   = STRINGS[getLang()] || STRINGS.ar;
    const chips = S.chips.map(c =>
      `<button class="kw-chip" data-q="${esc(c)}">${esc(c)}</button>`
    ).join('');

    return `
<div class="kw-head" dir="${dir}">
  <div class="kw-head-icon">🤖</div>
  <div class="kw-head-info">
    <div class="kw-head-name">${esc(S.title)}</div>
    <div class="kw-head-sub"><span class="kw-online-dot"></span>${esc(S.subtitle)}</div>
  </div>
  <button class="kw-head-close" id="kw-close" aria-label="${esc(S.close)}">✕</button>
</div>
<div class="kw-msgs" id="kw-msgs" dir="${dir}"></div>
<div class="kw-chips" id="kw-chips" dir="${dir}">${chips}</div>
<div class="kw-input-row" dir="${dir}">
  <input id="kw-input" class="kw-input" type="text" dir="${dir}"
         placeholder="${esc(S.placeholder)}" autocomplete="off" maxlength="500">
  <button id="kw-send" class="kw-send" aria-label="${esc(S.send)}">➤</button>
</div>`;
  }

  function init() {
    injectStyles();

    /* FAB button */
    const fab = document.createElement('button');
    fab.id = 'kw-fab';
    fab.setAttribute('aria-label', s('btnLabel'));
    fab.innerHTML = `🤖<span class="kw-notify">1</span>`;
    fab.addEventListener('click', toggleWidget);
    document.body.appendChild(fab);

    /* Panel — CSS display:none hides it completely before JS runs */
    const panel = document.createElement('div');
    panel.id = 'kw-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-hidden', 'true');
    panel.setAttribute('aria-label', s('title'));
    panel.innerHTML = buildPanel();
    document.body.appendChild(panel);

    bindPanelEvents();
  }

  function bindPanelEvents() {
    document.getElementById('kw-close').addEventListener('click', () => closeWidget());
    document.getElementById('kw-send').addEventListener('click', send);
    document.getElementById('kw-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    document.querySelectorAll('#kw-panel .kw-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.getElementById('kw-input').value = chip.dataset.q || chip.textContent;
        send();
      });
    });
  }

  function toggleWidget() {
    _open ? closeWidget() : openWidget();
  }

  function openWidget() {
    _open = true;
    const panel = document.getElementById('kw-panel');
    // Step 1: switch from display:none → display:flex so element enters layout
    panel.style.display = 'flex';
    // Step 2: next frame — browser computes from-state, then transition fires
    requestAnimationFrame(function() {
      panel.classList.add('kw-open');
      panel.setAttribute('aria-hidden', 'false');
    });
    // Remove notification badge
    document.querySelector('#kw-fab .kw-notify')?.remove();
    // Show greeting once
    if (!_greeted) {
      _greeted = true;
      addAIMsg(s('greeting'));
    }
    setTimeout(() => document.getElementById('kw-input')?.focus(), 250);
  }

  function closeWidget() {
    _open = false;
    const panel = document.getElementById('kw-panel');
    panel.classList.remove('kw-open');
    panel.setAttribute('aria-hidden', 'true');
    // After transition completes, clear inline display → CSS display:none takes over
    setTimeout(() => {
      if (!_open) panel.style.display = '';
    }, 260);
  }

  /* ─── Send message ────────────────────────────────────────────────────────── */
  async function send() {
    const input = document.getElementById('kw-input');
    const q = (input.value || '').trim();
    if (!q || _busy) return;

    input.value = '';
    // Hide chips after first question
    const chips = document.getElementById('kw-chips');
    if (chips) chips.style.display = 'none';

    addUserMsg(q);
    showTyping();
    _busy = true;
    document.getElementById('kw-send').disabled = true;

    try {
      const result = await callAPI(q);
      hideTyping();
      addAIMsg(result.answer, result.relatedLinks, result.needsHumanSupport);
    } catch (err) {
      hideTyping();
      addAIMsg(s('error'));
    } finally {
      _busy = false;
      document.getElementById('kw-send').disabled = false;
      document.getElementById('kw-input').focus();
    }
  }

  /* ─── API call ─────────────────────────────────────────────────────────────── */
  async function callAPI(question) {
    // If not logged in — return a friendly prompt
    if (!isLoggedIn()) {
      return {
        answer: s('loginPrompt'),
        relatedLinks: [{ label: s('loginBtn'), path: 'login.html' }],
        needsHumanSupport: false,
      };
    }

    const token   = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Try authenticated FAQ endpoint first; fall back to public widget endpoint
    const endpoint = token ? `${BASE}/ai/faq` : `${BASE}/ai/widget`;

    try {
      const res = await fetch(endpoint, {
        method:  'POST',
        headers,
        body:    JSON.stringify({ question }),
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return {
            answer: s('loginPrompt'),
            relatedLinks: [{ label: s('loginBtn'), path: 'login.html' }],
            needsHumanSupport: false,
          };
        }
        throw new Error(`HTTP ${res.status}`);
      }

      return res.json();
    } catch (_netErr) {
      // Backend unreachable — use local demo FAQ
      return _demoFAQ(question);
    }
  }

  /* ─── Demo FAQ (offline fallback) ────────────────────────────────────────── */
  function _demoFAQ(q) {
    const low = (q || '').toLowerCase();
    const ar = getLang() === 'ar';
    const KB = [
      { keys: ['ضمان','escrow','إسكرو','حماية','أموال','دفع'],
        a: ar ? 'نظام الضمان (Escrow) يحمي أموالك — يتم حجز المبلغ حتى اكتمال الخدمة بنجاح. لا يُحوّل المبلغ للمزود إلا بعد تأكيدك.'
             : 'The Escrow system holds your payment until the service is completed successfully. Funds are only released to the provider after your confirmation.',
        links: [{ label: ar ? '💳 كيف يعمل الدفع' : '💳 How payment works', path: 'payment-escrow.html' }] },
      { keys: ['رسوم','عمولة','نسبة','commission','fee','platform'],
        a: ar ? 'عمولة المنصة:\n• خدمات منزلية: 15% من قيمة الضمان\n• المناقصات: 2% من قيمة العقد\n• المعدات: 10% من قيمة الإيجار\n• ضريبة القيمة المضافة: 15% على جميع الفواتير'
             : 'Platform fees:\n• Home Services: 15% of escrow\n• Tenders: 2% of contract value\n• Equipment: 10% of rental\n• VAT: 15% on all invoices',
        links: [] },
      { keys: ['نزاع','شكوى','dispute','مشكل','خلاف'],
        a: ar ? 'لفتح نزاع:\n1. اذهب للوحة التحكم\n2. اختر الطلب\n3. اضغط "فتح نزاع"\n\nفريق خدمة سيراجع الحالة خلال 24 ساعة.'
             : 'To open a dispute:\n1. Go to Dashboard\n2. Select the order\n3. Click "Open Dispute"\n\nOur team will review within 24 hours.',
        links: [{ label: ar ? '📋 لوحة التحكم' : '📋 Dashboard', path: 'customer-dashboard.html' }] },
      { keys: ['تقييم','تقيم','rate','review','نجوم'],
        a: ar ? 'بعد اكتمال الخدمة، ستظهر لك شاشة التقييم تلقائياً. يمكنك تقييم المزود من 1 إلى 5 نجوم مع كتابة ملاحظات.'
             : 'After service completion, the rating screen appears automatically. Rate your provider 1-5 stars with optional comments.',
        links: [{ label: ar ? '⭐ تقييم خدمة' : '⭐ Rate service', path: 'rate-service.html' }] },
      { keys: ['إلغاء','الغاء','cancel','استرداد','refund'],
        a: ar ? 'يمكنك الإلغاء إذا لم تبدأ الخدمة بعد. الإلغاء يعتمد على حالة الطلب:\n• قيد الانتظار / مقبول → إلغاء مباشر\n• المزود في الطريق → إلغاء مع تنبيه\n• بدأت الخدمة → لا يمكن الإلغاء'
             : 'You can cancel if the service hasn\'t started yet. Cancellation depends on request status:\n• Pending/Accepted → direct cancel\n• Provider en route → cancel with warning\n• Service started → cannot cancel',
        links: [{ label: ar ? '📋 طلباتي' : '📋 My orders', path: 'customer-dashboard.html' }] },
      { keys: ['مناقصة','مناقصات','tender','عرض','bid','مشروع'],
        a: ar ? 'منصة المناقصات تتيح لك نشر مشروعك واستقبال عروض من مقاولين موثوقين. العمولة 2% فقط على العقود المُرساة.'
             : 'The Tenders platform lets you post projects and receive bids from verified contractors. Only 2% commission on awarded contracts.',
        links: [{ label: ar ? '📋 المناقصات' : '📋 Tenders', path: 'tenders.html' }] },
      { keys: ['معدات','معده','equipment','إيجار','rent','تأجير'],
        a: ar ? 'يمكنك استئجار معدات ثقيلة (رافعات، حفارات، خلاطات) مباشرة من المنصة. احصل على عروض أسعار فورية.'
             : 'Rent heavy equipment (cranes, excavators, mixers) directly. Get instant price quotes from verified suppliers.',
        links: [{ label: ar ? '🏗️ المعدات' : '🏗️ Equipment', path: 'equipment.html' }] },
      { keys: ['استشارة','استشار','consult','مهندس','هندس'],
        a: ar ? 'احجز استشارة هندسية مع مهندسين معتمدين. يمكنك اختيار جلسة فورية أو مجدولة.'
             : 'Book engineering consultations with certified engineers. Choose instant or scheduled sessions.',
        links: [{ label: ar ? '🧑‍💼 الاستشارات' : '🧑‍💼 Consultations', path: 'consultations.html' }] },
    ];

    // Simulate typing delay
    const match = KB.find(item => item.keys.some(k => low.includes(k)));
    if (match) {
      return { answer: match.a, relatedLinks: match.links || [], needsHumanSupport: false };
    }

    // Default response
    return {
      answer: ar
        ? 'شكراً لسؤالك! حالياً المساعد الذكي يعمل في وضع تجريبي.\n\nيمكنني مساعدتك في:\n• نظام الضمان والدفع\n• الرسوم والعمولات\n• فتح نزاع أو شكوى\n• تقييم الخدمة\n• إلغاء الطلبات\n• المناقصات والمعدات والاستشارات\n\nجرّب سؤالي عن أحد هذه المواضيع!'
        : 'Thanks for your question! The AI assistant is currently in demo mode.\n\nI can help with:\n• Escrow & payments\n• Fees & commissions\n• Opening disputes\n• Rating services\n• Cancellations\n• Tenders, equipment & consultations\n\nTry asking about any of these topics!',
      relatedLinks: [],
      needsHumanSupport: false,
    };
  }

  /* ─── Render messages ─────────────────────────────────────────────────────── */
  function addUserMsg(text) {
    const area = document.getElementById('kw-msgs');
    if (!area) return;
    const dir = isRTL() ? 'rtl' : 'ltr';
    const row = document.createElement('div');
    row.className = 'kw-row kw-me';
    row.innerHTML = `<div class="kw-bubble" dir="${dir}">${esc(text)}</div>`;
    area.appendChild(row);
    area.scrollTop = area.scrollHeight;
  }

  function addAIMsg(text, links, needsHuman) {
    const area = document.getElementById('kw-msgs');
    if (!area) return;
    const dir   = isRTL() ? 'rtl' : 'ltr';
    const html  = esc(text).replace(/\n/g, '<br>');

    let linksHTML = '';
    if (links && links.length) {
      linksHTML = `<div class="kw-links">` +
        links.map(l => `<a href="${esc(l.path || '#')}" class="kw-link">→ ${esc(l.label)}</a>`).join('') +
        `</div>`;
    }

    let escBtn = '';
    if (needsHuman) {
      escBtn = `<button class="kw-esc-btn" onclick="window.location.href='chat.html'">${esc(s('escalate'))}</button>`;
    }

    const row = document.createElement('div');
    row.className = 'kw-row kw-ai';
    row.innerHTML = `
      <div class="kw-avatar-sm">🤖</div>
      <div>
        <div class="kw-bubble" dir="${dir}">${html}</div>
        ${linksHTML}${escBtn}
      </div>`;
    area.appendChild(row);
    area.scrollTop = area.scrollHeight;
  }

  function showTyping() {
    const area = document.getElementById('kw-msgs');
    if (!area) return;
    const ind = document.createElement('div');
    ind.id = 'kw-typing';
    ind.className = 'kw-row kw-ai';
    ind.innerHTML = `<div class="kw-avatar-sm">🤖</div>
      <div class="kw-typing"><div class="kw-dot"></div><div class="kw-dot"></div><div class="kw-dot"></div></div>`;
    area.appendChild(ind);
    area.scrollTop = area.scrollHeight;
  }

  function hideTyping() {
    document.getElementById('kw-typing')?.remove();
  }

  /* ─── React to theme / language changes ─────────────────────────────────── */
  window.addEventListener('khedmah:lang-changed', function () {
    // Rebuild panel only if conversation hasn't started
    if (!_greeted) {
      const panel = document.getElementById('kw-panel');
      if (panel) {
        panel.innerHTML = buildPanel();
        bindPanelEvents();
      }
    }
  });

  /* ─── Boot ───────────────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
