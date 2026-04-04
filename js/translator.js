/**
 * Khedmah Chat Auto-Translator
 * Uses MyMemory API (free tier, no API key, 500 req/day)
 * All translations cached in localStorage to minimise API calls.
 *
 * Public API:
 *   Translator.setMyLang('en')          — set current user's preferred language
 *   Translator.getMyLang()              — returns 'ar'|'en'|'ur'|…
 *   Translator.detectLang(text)         — fast heuristic, returns lang code
 *   Translator.translate(text, from, to) → Promise<{ translated, from, to, cached }>
 *   Translator.translateIncoming(text)  → Promise<{ translated, from, to } | null>
 *                                          null = same lang, no translation needed
 *   Translator.isEnabled()              — whether auto-translate is ON
 *   Translator.setEnabled(bool)         — toggle on/off
 *   Translator.LANGUAGES                — supported languages list
 */
(function (window) {
    'use strict';

    // ── Supported Languages ─────────────────────────────────────────
    const LANGUAGES = [
        { code: 'ar', name: 'العربية',   flag: '🇸🇦', nativeName: 'Arabic'  },
        { code: 'en', name: 'English',   flag: '🇺🇸', nativeName: 'English' },
        { code: 'ur', name: 'اردو',      flag: '🇵🇰', nativeName: 'Urdu'    },
        { code: 'hi', name: 'हिन्दी',    flag: '🇮🇳', nativeName: 'Hindi'   },
        { code: 'es', name: 'Español',   flag: '🇲🇽', nativeName: 'Spanish' },
        { code: 'fr', name: 'Français',  flag: '🇫🇷', nativeName: 'French'  },
        { code: 'ms', name: 'Melayu',    flag: '🇲🇾', nativeName: 'Malay'   },
        { code: 'bn', name: 'বাংলা',     flag: '🇧🇩', nativeName: 'Bengali' },
        { code: 'tr', name: 'Türkçe',    flag: '🇹🇷', nativeName: 'Turkish' },
        { code: 'tl', name: 'Filipino',  flag: '🇵🇭', nativeName: 'Tagalog' },
        { code: 'id', name: 'Indonesia', flag: '🇮🇩', nativeName: 'Indonesian' },
        { code: 'fa', name: 'فارسی',     flag: '🇮🇷', nativeName: 'Persian' },
    ];

    const LANG_KEY      = 'khedmah_chat_lang';
    const ENABLED_KEY   = 'khedmah_translate_enabled';
    const CACHE_KEY     = 'khedmah_translate_cache';
    const CACHE_LIMIT   = 300; // max entries before LRU eviction

    // ── State ───────────────────────────────────────────────────────
    let _myLang   = localStorage.getItem(LANG_KEY) || localStorage.getItem('khedmah_lang') || 'ar';
    let _enabled  = localStorage.getItem(ENABLED_KEY) !== 'false'; // default ON

    // ── Cache helpers ───────────────────────────────────────────────
    function _readCache() {
        try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch(e) { return {}; }
    }
    function _writeCache(cache) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch(e) {}
    }
    function _cacheKey(text, from, to) {
        // Simple hash to keep keys short
        let h = 0;
        for (let i = 0; i < Math.min(text.length, 200); i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
        return `${from}_${to}_${(h >>> 0).toString(36)}`;
    }
    function _getCached(text, from, to) {
        const cache = _readCache();
        return cache[_cacheKey(text, from, to)] || null;
    }
    function _setCached(text, from, to, result) {
        const cache = _readCache();
        const keys = Object.keys(cache);
        // LRU eviction
        if (keys.length >= CACHE_LIMIT) {
            const toDelete = keys.slice(0, Math.floor(CACHE_LIMIT / 4));
            toDelete.forEach(k => delete cache[k]);
        }
        cache[_cacheKey(text, from, to)] = result;
        _writeCache(cache);
    }

    // ── Language detection (heuristic) ─────────────────────────────
    // Fast local detection — covers the vast majority of real messages
    const LANG_SCRIPTS = [
        { code: 'ar', rx: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/ },
        { code: 'ur', rx: /[\u0600-\u06FF]/ }, // Urdu overlaps Arabic but check after Arabic
        { code: 'hi', rx: /[\u0900-\u097F]/ },
        { code: 'bn', rx: /[\u0980-\u09FF]/ },
        { code: 'fa', rx: /[\u0600-\u06FF\u200C\u200D]/ }, // Persian (overlaps Arabic)
        { code: 'tr', rx: /[ğüşıöçĞÜŞİÖÇ]/ },
        { code: 'tl', rx: /\b(ang|ng|mga|sa|na|ay|ito|siya)\b/i },
        { code: 'ms', rx: /\b(dan|yang|untuk|dengan|tidak|apa|ini|itu|saya)\b/ },
        { code: 'es', rx: /\b(que|es|de|la|el|en|los|las|por|para)\b/ },
        { code: 'fr', rx: /\b(le|la|les|de|du|des|est|sont|vous|nous)\b/ },
        { code: 'en', rx: /\b(the|is|are|and|for|you|that|this|with|have)\b/i },
    ];

    function detectLang(text) {
        if (!text || typeof text !== 'string') return 'ar';
        const t = text.trim();
        // Arabic unicode check (most common case on this platform)
        if (/[\u0600-\u06FF]/.test(t)) return 'ar';
        // Devanagari = Hindi
        if (/[\u0900-\u097F]/.test(t)) return 'hi';
        // Bengali
        if (/[\u0980-\u09FF]/.test(t)) return 'bn';
        // Try other scripts/patterns
        for (const { code, rx } of LANG_SCRIPTS) {
            if (rx.test(t)) return code;
        }
        // Default: if it's mostly Latin → English
        return 'en';
    }

    // ── MyMemory Translation API ────────────────────────────────────
    // Free tier: 500 req/day per IP (no API key required)
    const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';

    async function _fetchTranslation(text, from, to) {
        const url = `${MYMEMORY_URL}?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (data.responseStatus !== 200 && data.responseStatus !== '200') {
            throw new Error(data.responseMessage || 'Translation failed');
        }
        return data.responseData.translatedText;
    }

    // ── Main translate function ─────────────────────────────────────
    /**
     * Translate `text` from `from` → `to`.
     * Returns { translated, from, to, cached: bool }
     * Throws on network/API error after retry.
     */
    async function translate(text, from, to) {
        if (!text || !text.trim()) return { translated: text, from, to, cached: true };
        // Skip if same language
        if (from === to) return { translated: text, from, to, cached: true };
        // Skip pure emoji / numbers / URLs
        if (/^[\d\s\+\-\.\,\%\@\#\/\:]+$/.test(text.trim())) {
            return { translated: text, from, to, cached: true };
        }

        // Check cache
        const hit = _getCached(text, from, to);
        if (hit) return { translated: hit, from, to, cached: true };

        // Fetch from MyMemory
        const translated = await _fetchTranslation(text, from, to);
        _setCached(text, from, to, translated);
        return { translated, from, to, cached: false };
    }

    // ── translateIncoming: convenience wrapper for chat ────────────
    /**
     * Call this on every incoming message text.
     * Detects sender's language, translates to current user's preference.
     * Returns null if no translation needed (same language).
     * Returns { translated, from, fromName, to, toName, cached } otherwise.
     */
    async function translateIncoming(text) {
        if (!_enabled || !text || !text.trim()) return null;
        const from = detectLang(text);
        const to   = _myLang;
        if (from === to) return null;

        try {
            const result = await translate(text, from, to);
            if (result.translated === text) return null; // API returned same text
            const fromLang = LANGUAGES.find(l => l.code === from);
            const toLang   = LANGUAGES.find(l => l.code === to);
            return {
                ...result,
                fromName: fromLang ? fromLang.name : from,
                toName:   toLang   ? toLang.name   : to,
            };
        } catch (e) {
            return null; // Silent fail — show original
        }
    }

    // ── Getters / setters ───────────────────────────────────────────
    function setMyLang(code) {
        _myLang = code;
        localStorage.setItem(LANG_KEY, code);
    }
    function getMyLang() { return _myLang; }
    function isEnabled() { return _enabled; }
    function setEnabled(bool) {
        _enabled = !!bool;
        localStorage.setItem(ENABLED_KEY, _enabled ? 'true' : 'false');
    }

    // ── Expose ──────────────────────────────────────────────────────
    window.Translator = { translate, translateIncoming, detectLang, setMyLang, getMyLang, isEnabled, setEnabled, LANGUAGES };

})(window);
