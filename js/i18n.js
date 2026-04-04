/**
 * Khedmah i18n — Bilingual Arabic/English Translation System
 * Usage:
 *   t('key')                 → translated string (may contain HTML)
 *   t('key', {name:'Ahmed'}) → with variable interpolation: {{name}}
 *   switchLanguage('en')     → live-switch entire page
 *   getCurrentLang()         → 'ar' | 'en'
 *
 * Elements with data-i18n="key" are auto-translated on load and on switch.
 * Elements with data-i18n-placeholder="key" get placeholder= translated.
 * Elements with data-i18n-title="key" get title= translated.
 */

(function (window) {
    'use strict';

    // ── Storage key ────────────────────────────────────────────────
    const LANG_KEY = 'khedmah_lang';

    // ── In-memory locale cache ──────────────────────────────────────
    const _cache = {};

    // ── Detect default language ───────────────────────────────���─────
    function detectDefaultLang() {
        const stored = localStorage.getItem(LANG_KEY);
        if (stored === 'ar' || stored === 'en') return stored;
        // Browser / OS language hint
        const browser = (navigator.language || navigator.userLanguage || 'ar').toLowerCase();
        return browser.startsWith('ar') ? 'ar' : 'en';
    }

    let _currentLang = detectDefaultLang();

    // ── Load locale JSON (cached, synchronous fallback for same origin) ─
    function _loadLocale(lang) {
        if (_cache[lang]) return _cache[lang];
        try {
            const req = new XMLHttpRequest();
            req.open('GET', `locales/${lang}.json`, false); // synchronous
            req.send();
            if (req.status === 200) {
                _cache[lang] = JSON.parse(req.responseText);
            }
        } catch (e) {
            _cache[lang] = {};
        }
        return _cache[lang] || {};
    }

    // Pre-load both locales in background after page load
    function _preload() {
        ['ar', 'en'].forEach(l => {
            if (!_cache[l]) {
                fetch(`locales/${l}.json`)
                    .then(r => r.json())
                    .then(d => { _cache[l] = d; })
                    .catch(() => {});
            }
        });
    }

    // ── Core translate function ─────────────────────────────────────
    function t(key, vars) {
        const locale = _loadLocale(_currentLang);
        let str = locale[key];
        if (str === undefined) {
            // Fallback: try other language
            const fallback = _loadLocale(_currentLang === 'ar' ? 'en' : 'ar');
            str = fallback[key];
        }
        if (str === undefined) return key; // last resort: return the key itself
        // Variable interpolation: {{varName}}
        if (vars) {
            str = str.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ''));
        }
        return str;
    }

    // ── Apply translations to DOM ───────────────────────────────────
    function _applyToDOM() {
        // Text/HTML content
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translated = t(key);
            // Use innerHTML for keys that may contain HTML tags (e.g. <span>)
            if (translated !== key) {
                if (/<[a-z][\s\S]*>/i.test(translated)) {
                    el.innerHTML = translated;
                } else {
                    el.textContent = translated;
                }
            }
        });
        // Placeholder
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            const translated = t(key);
            if (translated !== key) el.placeholder = translated;
        });
        // Title attribute
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            const translated = t(key);
            if (translated !== key) el.title = translated;
        });
        // Page <title>
        const pageTitleKey = document.documentElement.getAttribute('data-page-title');
        if (pageTitleKey) {
            const translated = t(pageTitleKey);
            if (translated !== pageTitleKey) document.title = translated;
        }
    }

    // ── Apply document direction ────────────────────────────────────
    function _applyDir(lang) {
        const meta = (_cache[lang] || {})['_meta'] || {};
        const dir = meta.dir || (lang === 'ar' ? 'rtl' : 'ltr');
        document.documentElement.setAttribute('dir', dir);
        document.documentElement.setAttribute('lang', lang);
    }

    // ── Switch language ─────────────────────────────────────────────
    function switchLanguage(lang) {
        if (lang !== 'ar' && lang !== 'en') return;
        _currentLang = lang;
        localStorage.setItem(LANG_KEY, lang);
        _loadLocale(lang); // ensure loaded
        _applyDir(lang);
        _applyToDOM();
        // Update any language-toggle buttons on the page
        document.querySelectorAll('[data-lang-btn]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-lang-btn') === lang);
        });
        // Dispatch event so pages can react (e.g. re-render dynamic lists)
        window.dispatchEvent(new CustomEvent('khedmah:lang-changed', { detail: { lang } }));
    }

    // ── getCurrentLang ──────────────────────────────────────────────
    function getCurrentLang() { return _currentLang; }

    // ── Language switcher widget HTML ───────────────────────────────
    // Call renderLangSwitcher('targetElementId') to inject a toggle button
    function renderLangSwitcher(containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = `
            <div class="lang-switcher" style="display:flex;align-items:center;gap:4px;border:1.5px solid #e2e8f0;border-radius:10px;padding:3px;background:white;">
                <button data-lang-btn="ar" onclick="I18n.switchLanguage('ar')"
                    style="border:none;background:transparent;padding:3px 9px;border-radius:7px;font-family:'Tajawal',sans-serif;font-size:.8rem;font-weight:700;cursor:pointer;transition:all .15s;">
                    ع
                </button>
                <button data-lang-btn="en" onclick="I18n.switchLanguage('en')"
                    style="border:none;background:transparent;padding:3px 9px;border-radius:7px;font-family:'Tajawal',sans-serif;font-size:.8rem;font-weight:700;cursor:pointer;transition:all .15s;">
                    EN
                </button>
            </div>`;
        // Style active button
        el.querySelectorAll('[data-lang-btn]').forEach(btn => {
            if (btn.getAttribute('data-lang-btn') === _currentLang) {
                btn.style.background = 'var(--primary, #028090)';
                btn.style.color = 'white';
            }
        });
    }

    // ── Auto-init on DOMContentLoaded ──────────────────────────────
    function _init() {
        _loadLocale(_currentLang);
        _applyDir(_currentLang);
        _applyToDOM();
        _preload();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

    // ── Public API ─────────────────────────────────────────────────
    window.I18n = { t, switchLanguage, getCurrentLang, renderLangSwitcher };
    window.t = t; // shorthand

})(window);
