/**
 * Khedmah Cancellation System
 * Shared modal + status-based logic for all service modules.
 *
 * Usage:
 *   CancelSystem.show({
 *       module: 'home' | 'tenders' | 'equipment' | 'consultations',
 *       requestId: '...',
 *       status: 'PENDING',          // current request status
 *       onConfirm(reason, note) {}, // called after user confirms
 *   });
 */
(function (window) {
    'use strict';

    // ── Cancellable statuses per module ────────────────────────────────
    const CANCELLABLE = {
        home:           ['PENDING', 'QUOTED', 'AWAITING_CONFIRMATION', 'CONFIRMED', 'PROVIDER_ASSIGNED', 'ACCEPTED'],
        tenders:        ['PENDING', 'SUBMITTED', 'SHORTLISTED'],
        equipment:      ['PENDING', 'QUOTED', 'ACCEPTED'],
        consultations:  ['PENDING', 'ACCEPTED', 'SCHEDULED'],
    };

    // Statuses that need a warning (provider already en route / preparing)
    const WARN_STATUSES = ['PROVIDER_ASSIGNED', 'ON_THE_WAY', 'SHORTLISTED', 'ACCEPTED'];

    // ── Reasons per module ─────────────────────────────────────────────
    const REASONS = {
        home: [
            { key: 'not_home',       label: 'غير متواجد في المنزل' },
            { key: 'changed_mind',   label: 'غيرت رأيي' },
            { key: 'better_provider',label: 'وجدت مزود أفضل' },
            { key: 'booked_mistake', label: 'حجزت بالخطأ' },
            { key: 'price_issue',    label: 'مشكلة في السعر' },
            { key: 'wrong_time',     label: 'الوقت المحدد غير مناسب' },
            { key: 'no_need',        label: 'لم أعد بحاجة للخدمة' },
            { key: 'other',          label: 'سبب آخر' },
        ],
        tenders: [
            { key: 'project_postponed', label: 'تأجيل المشروع' },
            { key: 'project_cancelled', label: 'إلغاء المشروع' },
            { key: 'posted_mistake',    label: 'نُشرت بالخطأ' },
            { key: 'scope_changed',     label: 'تغيّر نطاق العمل' },
            { key: 'budget_issue',      label: 'مشكلة في الميزانية' },
            { key: 'no_need_bids',      label: 'لم أعد بحاجة للعروض' },
            { key: 'other',             label: 'سبب آخر' },
        ],
        equipment: [
            { key: 'no_need',          label: 'لم أعد بحاجة للمعدات' },
            { key: 'schedule_changed', label: 'تغيّر جدول المشروع' },
            { key: 'found_other',      label: 'وجدت مورداً آخر' },
            { key: 'wrong_booking',    label: 'حجز خاطئ' },
            { key: 'budget_issue',     label: 'مشكلة في الميزانية' },
            { key: 'type_changed',     label: 'نوع المعدة لم يعد مطلوباً' },
            { key: 'other',            label: 'سبب آخر' },
        ],
        consultations: [
            { key: 'no_need',          label: 'لم أعد بحاجة للاستشارة' },
            { key: 'booked_mistake',   label: 'حجزت بالخطأ' },
            { key: 'found_other',      label: 'وجدت مستشاراً آخر' },
            { key: 'wrong_time',       label: 'الوقت غير مناسب' },
            { key: 'price_issue',      label: 'مشكلة في السعر' },
            { key: 'resolved',         label: 'تم حل المشكلة' },
            { key: 'other',            label: 'سبب آخر' },
        ],
    };

    // ── Status labels (Arabic) ─────────────────────────────────────────
    const STATUS_AR = {
        PENDING: 'قيد الانتظار', QUOTED: 'عرض سعر', AWAITING_CONFIRMATION: 'بانتظار التأكيد',
        CONFIRMED: 'مؤكد', PROVIDER_ASSIGNED: 'تم تعيين المزود', ACCEPTED: 'مقبول',
        ON_THE_WAY: 'في الطريق', STARTED: 'بدأ', IN_PROGRESS: 'قيد التنفيذ',
        COMPLETED: 'مكتمل', CANCELLED: 'ملغي', SUBMITTED: 'تم التقديم',
        SHORTLISTED: 'في القائمة المختصرة', SCHEDULED: 'مجدولة', IN_SESSION: 'جلسة نشطة',
    };

    // ── Blocked reasons (Arabic) ───────────────────────────────────────
    const BLOCK_MESSAGES = {
        STARTED:      'لا يمكن الإلغاء — الخدمة بدأت بالفعل',
        IN_PROGRESS:  'لا يمكن الإلغاء — الخدمة قيد التنفيذ',
        COMPLETED:    'لا يمكن الإلغاء — الخدمة اكتملت',
        CANCELLED:    'تم إلغاء هذا الطلب مسبقاً',
        IN_SESSION:   'لا يمكن الإلغاء — الجلسة بدأت',
        REJECTED:     'تم رفض هذا الطلب',
    };

    // ── Check if cancellation allowed ──────────────────────────────────
    function canCancel(module, status) {
        const s = (status || '').toUpperCase();
        const list = CANCELLABLE[module] || [];
        return list.includes(s);
    }

    function getBlockMessage(status) {
        return BLOCK_MESSAGES[(status || '').toUpperCase()] || 'لا يمكن إلغاء هذا الطلب في حالته الحالية';
    }

    function needsWarning(status) {
        return WARN_STATUSES.includes((status || '').toUpperCase());
    }

    // ── Inject modal CSS (once) ────────────────────────────────────────
    let _cssInjected = false;
    function _injectCSS() {
        if (_cssInjected) return;
        _cssInjected = true;
        const style = document.createElement('style');
        style.textContent = `
/* ── Cancel Modal ── */
.cancel-overlay {
    display:none; position:fixed; inset:0; width:100%; height:100%;
    background:rgba(0,0,0,0.5); z-index:9000;
    align-items:center; justify-content:center;
}
.cancel-overlay.open { display:flex; }
.cancel-modal {
    background:white; width:100%; max-width:480px; border-radius:20px;
    max-height:90vh; overflow-y:auto; animation:cancelIn .2s ease;
    box-shadow:0 20px 60px rgba(0,0,0,.2); font-family:'Tajawal',sans-serif;
}
@keyframes cancelIn { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
@media(max-width:599px){ .cancel-modal { border-radius:20px 20px 0 0; align-self:flex-end; max-height:95vh; } }
.cancel-header {
    padding:1.25rem 1.5rem; border-bottom:1px solid #f1f5f9;
    display:flex; align-items:center; justify-content:space-between;
}
.cancel-title { font-size:1.05rem; font-weight:800; color:#1e293b; }
.cancel-close {
    width:32px; height:32px; background:#f1f5f9; border:none; border-radius:50%;
    cursor:pointer; font-size:1rem; display:flex; align-items:center; justify-content:center;
}
.cancel-body { padding:1rem 1.5rem; }
.cancel-warn {
    background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25);
    border-radius:12px; padding:0.75rem 1rem; margin-bottom:1rem;
    font-size:0.85rem; color:#92400e; line-height:1.6;
}
.cancel-blocked {
    background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.2);
    border-radius:12px; padding:1.25rem 1rem; text-align:center;
    font-size:0.95rem; color:#dc2626; font-weight:600; line-height:1.6;
}
.cancel-reasons { display:flex; flex-direction:column; gap:0.4rem; margin-bottom:1rem; }
.cancel-reason {
    display:flex; align-items:center; gap:0.65rem; padding:0.7rem 0.9rem;
    border:1.5px solid #e2e8f0; border-radius:12px; cursor:pointer;
    transition:all .15s; background:white; font-size:0.9rem; color:#1e293b;
}
.cancel-reason:hover { border-color:#028090; }
.cancel-reason.selected { border-color:#028090; background:rgba(2,128,144,0.06); }
.cancel-radio {
    width:18px; height:18px; border-radius:50%; border:2px solid #cbd5e1;
    flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:all .15s;
}
.cancel-reason.selected .cancel-radio { border-color:#028090; background:#028090; }
.cancel-reason.selected .cancel-radio::after { content:''; width:7px; height:7px; border-radius:50%; background:white; }
.cancel-note {
    width:100%; border:1.5px solid #e2e8f0; border-radius:12px; padding:0.75rem 1rem;
    font-family:'Tajawal',sans-serif; font-size:0.9rem; resize:none; min-height:80px;
    outline:none; transition:border-color .15s; color:#1e293b; background:white;
}
.cancel-note:focus { border-color:#028090; }
.cancel-footer {
    padding:1rem 1.5rem; border-top:1px solid #f1f5f9;
    display:flex; gap:0.75rem;
}
.cancel-btn {
    flex:1; padding:0.8rem; border-radius:12px; font-family:'Tajawal',sans-serif;
    font-size:0.95rem; font-weight:700; cursor:pointer; border:none; transition:all .15s;
}
.cancel-btn-back { background:#f1f5f9; color:#1e293b; }
.cancel-btn-confirm { background:#ef4444; color:white; }
.cancel-btn-confirm:hover { background:#dc2626; }
.cancel-btn-confirm:disabled { opacity:.5; cursor:not-allowed; }
.cancel-result { text-align:center; padding:1.5rem; }
.cancel-result-icon { font-size:2.5rem; margin-bottom:0.75rem; }
.cancel-result-text { font-size:1rem; font-weight:700; color:#1e293b; margin-bottom:0.25rem; }
.cancel-result-sub { font-size:0.85rem; color:#64748b; }

/* Dark mode */
html.dark .cancel-modal { background:#1e293b; }
html.dark .cancel-header { border-color:#334155; }
html.dark .cancel-title { color:#e2e8f0; }
html.dark .cancel-close { background:#0f172a; color:#e2e8f0; }
html.dark .cancel-reason { background:#0f172a; border-color:#334155; color:#e2e8f0; }
html.dark .cancel-reason.selected { border-color:#028090; background:rgba(2,128,144,0.1); }
html.dark .cancel-note { background:#0f172a; color:#e2e8f0; border-color:#334155; }
html.dark .cancel-footer { border-color:#334155; }
html.dark .cancel-btn-back { background:#0f172a; color:#e2e8f0; }
html.dark .cancel-warn { background:rgba(245,158,11,0.06); border-color:rgba(245,158,11,0.2); color:#fcd34d; }
html.dark .cancel-blocked { background:rgba(239,68,68,0.08); border-color:rgba(239,68,68,0.15); color:#fca5a5; }
html.dark .cancel-result-text { color:#e2e8f0; }
html.dark .cancel-result-sub { color:#94a3b8; }
`;
        document.head.appendChild(style);
    }

    // ── State ──────────────────────────────────────────────────────────
    let _opts = {};
    let _selectedReason = null;

    // ── Build & show modal ─────────────────────────────────────────────
    function show(opts) {
        _opts = opts;
        _selectedReason = null;
        _injectCSS();

        // Remove existing modal if any
        document.getElementById('cancelOverlay')?.remove();

        const module = opts.module || 'home';
        const status = (opts.status || '').toUpperCase();
        const allowed = canCancel(module, status);

        const overlay = document.createElement('div');
        overlay.id = 'cancelOverlay';
        overlay.className = 'cancel-overlay open';
        overlay.onclick = function (e) { if (e.target === overlay) _close(); };

        const moduleLabels = { home: 'الطلب', tenders: 'العرض', equipment: 'الحجز', consultations: 'الاستشارة' };
        const titleText = 'إلغاء ' + (moduleLabels[module] || 'الطلب');

        let bodyHTML;
        if (!allowed) {
            bodyHTML = `<div class="cancel-blocked">🚫 ${getBlockMessage(status)}</div>`;
        } else {
            const reasons = REASONS[module] || REASONS.home;
            const warn = needsWarning(status);
            bodyHTML = '';
            if (warn) {
                bodyHTML += `<div class="cancel-warn">⚠️ تنبيه: المزود تم تعيينه بالفعل. الإلغاء في هذه المرحلة قد يؤثر على تقييمك.</div>`;
            }
            bodyHTML += '<div class="cancel-reasons">';
            reasons.forEach(r => {
                bodyHTML += `<div class="cancel-reason" data-reason="${r.key}" onclick="CancelSystem._selectReason(this)">
                    <div class="cancel-radio"></div>
                    <span>${r.label}</span>
                </div>`;
            });
            bodyHTML += '</div>';
            bodyHTML += '<div id="cancelNoteWrap" style="display:none;margin-bottom:0.5rem;">';
            bodyHTML += '<textarea class="cancel-note" id="cancelNote" placeholder="اكتب السبب هنا..."></textarea>';
            bodyHTML += '</div>';
        }

        const footerHTML = allowed
            ? `<button class="cancel-btn cancel-btn-back" onclick="CancelSystem._close()">رجوع</button>
               <button class="cancel-btn cancel-btn-confirm" id="cancelConfirmBtn" disabled onclick="CancelSystem._confirm()">تأكيد الإلغاء</button>`
            : `<button class="cancel-btn cancel-btn-back" style="flex:1;" onclick="CancelSystem._close()">حسناً</button>`;

        overlay.innerHTML = `
            <div class="cancel-modal">
                <div class="cancel-header">
                    <div class="cancel-title">❌ ${titleText}</div>
                    <button class="cancel-close" onclick="CancelSystem._close()">✕</button>
                </div>
                <div class="cancel-body" id="cancelBody">${bodyHTML}</div>
                <div class="cancel-footer" id="cancelFooter">${footerHTML}</div>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
    }

    function _selectReason(el) {
        document.querySelectorAll('.cancel-reason').forEach(r => r.classList.remove('selected'));
        el.classList.add('selected');
        _selectedReason = el.dataset.reason;

        // Show/hide custom note field
        const noteWrap = document.getElementById('cancelNoteWrap');
        if (noteWrap) noteWrap.style.display = _selectedReason === 'other' ? '' : 'none';

        // Enable confirm button
        const btn = document.getElementById('cancelConfirmBtn');
        if (btn) btn.disabled = false;
    }

    function _close() {
        const overlay = document.getElementById('cancelOverlay');
        if (overlay) {
            overlay.classList.remove('open');
            setTimeout(() => overlay.remove(), 200);
        }
        document.body.style.overflow = '';
    }

    async function _confirm() {
        const btn = document.getElementById('cancelConfirmBtn');
        if (!btn || btn.disabled) return;
        btn.disabled = true;
        btn.textContent = '⏳ جارٍ الإلغاء...';

        const note = _selectedReason === 'other'
            ? (document.getElementById('cancelNote')?.value?.trim() || '')
            : '';

        const cancelData = {
            requestId: _opts.requestId,
            module: _opts.module,
            reason: _selectedReason,
            customNote: note,
            statusAtCancel: _opts.status,
            cancelledAt: new Date().toISOString(),
            cancelledBy: 'customer',
        };

        // Store cancellation log
        try {
            const logs = JSON.parse(localStorage.getItem('khedmah_cancel_log') || '[]');
            logs.push(cancelData);
            localStorage.setItem('khedmah_cancel_log', JSON.stringify(logs));
        } catch (e) {}

        // Call the callback
        try {
            if (_opts.onConfirm) await _opts.onConfirm(_selectedReason, note, cancelData);
        } catch (e) {
            btn.disabled = false;
            btn.textContent = 'تأكيد الإلغاء';
            return;
        }

        // Show success
        const body = document.getElementById('cancelBody');
        const footer = document.getElementById('cancelFooter');
        if (body) {
            body.innerHTML = `
                <div class="cancel-result">
                    <div class="cancel-result-icon">✅</div>
                    <div class="cancel-result-text">تم الإلغاء بنجاح</div>
                    <div class="cancel-result-sub">سيتم إشعار المزود والإدارة بالإلغاء</div>
                </div>`;
        }
        if (footer) {
            footer.innerHTML = `<button class="cancel-btn cancel-btn-back" style="flex:1;" onclick="CancelSystem._close(); if(CancelSystem._opts.onComplete) CancelSystem._opts.onComplete();">إغلاق</button>`;
        }
    }

    // ── Helper: render cancel button HTML ──────────────────────────────
    // Returns HTML string for a cancel button, or empty string if not allowed
    function renderButton(module, status, requestId, opts) {
        const s = (status || '').toUpperCase();
        if (!canCancel(module, s)) return '';
        const label = (opts && opts.label) || 'إلغاء';
        const cls = (opts && opts.className) || '';
        return `<button class="cancel-trigger-btn ${cls}" onclick="CancelSystem.show({module:'${module}',requestId:'${requestId}',status:'${s}',onConfirm:${opts && opts.onConfirm ? opts.onConfirm : 'null'},onComplete:${opts && opts.onComplete ? opts.onComplete : 'null'}})">❌ ${label}</button>`;
    }

    // ── Public API ─────────────────────────────────────────────────────
    window.CancelSystem = {
        show,
        canCancel,
        getBlockMessage,
        renderButton,
        REASONS,
        CANCELLABLE,
        _selectReason,
        _close,
        _confirm,
        _opts,
    };

})(window);
