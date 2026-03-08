/* ============================================================
   KHEDMAH — Shared JavaScript
   AOS init, Animated Counters, Toast helper, Utilities
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  /* ─── AOS Init ─────────────────────────────────────────── */
  if (typeof AOS !== 'undefined') {
    AOS.init({
      duration: 700,
      easing: 'ease-out-cubic',
      once: true,
      offset: 60,
      mirror: false
    });
  }

  /* ─── Animated Counters ────────────────────────────────── */
  // Elements: <span class="k-counter" data-target="500" data-suffix="+">0</span>
  function animateCounter(el) {
    const target  = parseInt(el.dataset.target, 10);
    const suffix  = el.dataset.suffix || '';
    const dur     = parseInt(el.dataset.duration, 10) || 2000;
    const start   = performance.now();

    function update(now) {
      const elapsed  = now - start;
      const progress = Math.min(elapsed / dur, 1);
      // Ease out quart
      const eased    = 1 - Math.pow(1 - progress, 4);
      el.textContent = Math.round(eased * target).toLocaleString('ar-SA') + suffix;
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  // Trigger counters when they enter the viewport
  const counterEls = document.querySelectorAll('.k-counter');
  if (counterEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          animateCounter(e.target);
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.4 });
    counterEls.forEach(el => io.observe(el));
  }

  /* ─── Toast Helper ─────────────────────────────────────── */
  window.kToast = function (message, type = 'default', duration = 3500) {
    let container = document.querySelector('.k-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'k-toast-container';
      document.body.appendChild(container);
    }

    const icons = {
      success: '<i class="fas fa-check-circle"></i>',
      danger:  '<i class="fas fa-times-circle"></i>',
      warning: '<i class="fas fa-exclamation-triangle"></i>',
      default: '<i class="fas fa-info-circle"></i>'
    };

    const toast = document.createElement('div');
    toast.className = `k-toast ${type}`;
    toast.innerHTML = `${icons[type] || icons.default} ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastIn 0.3s ease reverse forwards';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  };

  /* ─── Navbar scroll effect ─────────────────────────────── */
  const navbar = document.querySelector('.k-navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        navbar.style.background = 'rgba(15,23,42,0.98)';
      } else {
        navbar.style.background = 'rgba(15,23,42,0.95)';
      }
    }, { passive: true });
  }

  /* ─── OTP auto-advance ─────────────────────────────────── */
  const otpInputs = document.querySelectorAll('.k-otp-input');
  otpInputs.forEach((input, i) => {
    input.addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 1);
      if (this.value) {
        this.classList.add('filled');
        if (i < otpInputs.length - 1) otpInputs[i + 1].focus();
      } else {
        this.classList.remove('filled');
      }
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !this.value && i > 0) {
        otpInputs[i - 1].focus();
        otpInputs[i - 1].classList.remove('filled');
      }
    });
    input.addEventListener('paste', function (e) {
      e.preventDefault();
      const data = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      [...data].slice(0, otpInputs.length).forEach((char, idx) => {
        if (otpInputs[idx]) {
          otpInputs[idx].value = char;
          otpInputs[idx].classList.add('filled');
        }
      });
    });
  });

  /* ─── Upload Zone drag-over feedback ──────────────────── */
  document.querySelectorAll('.k-upload-zone').forEach(zone => {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
    zone.addEventListener('drop',     e    => { e.preventDefault(); zone.classList.remove('drag-over'); });
  });

  /* ─── Clipboard copy helper ────────────────────────────── */
  window.kCopy = function (text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => kToast('تم النسخ!', 'success'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      kToast('تم النسخ!', 'success');
    }
  };

  /* ─── Active nav link ──────────────────────────────────── */
  const currentPath = window.location.pathname.split('/').pop();
  document.querySelectorAll('.k-navbar .nav-link, .k-sidebar .nav-link, .k-admin-sidebar .nav-link')
    .forEach(link => {
      const href = link.getAttribute('href') || '';
      if (href.split('/').pop() === currentPath && currentPath !== '') {
        link.classList.add('active');
      }
    });

  /* ─── Alpine.js helpers (global store helpers) ─────────── */
  // These are called by Alpine components via window
  window.kSocialShare = function (platform, code) {
    const msg = encodeURIComponent(`انضم إلى خدمة واحصل على 50 ريال! استخدم كودي: ${code} https://khedmah.sa/ref/${code}`);
    const urls = {
      whatsapp: `https://wa.me/?text=${msg}`,
      twitter:  `https://twitter.com/intent/tweet?text=${msg}`,
      telegram: `https://t.me/share/url?url=https://khedmah.sa/ref/${code}&text=${msg}`,
      email:    `mailto:?subject=دعوة+خدمة&body=${msg}`
    };
    if (urls[platform]) window.open(urls[platform], '_blank');
  };

});
