(function () {
  'use strict';

  var COOKIE_NAME = 'gpm_cookie_consent';
  var COOKIE_DAYS = 365;

  // Troque pelo ID real do Google Analytics 4 (ex.: "G-ABC1234XYZ") quando disponível.
  // Enquanto o valor abaixo permanecer como placeholder, o GA4 nunca é carregado,
  // mesmo que o visitante aceite todos os cookies.
  var GA_MEASUREMENT_ID = 'G-XXXXXXXXXX';

  var CONSENT_TEXT = 'Li e concordo com a <a href="politica-privacidade.html" target="_blank" rel="noopener noreferrer">Política de Privacidade</a> e autorizo o Grupo GPM a tratar meus dados conforme descrito.';

  // ── Utilitários de cookie ──

  function setCookie(name, value, days) {
    var expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + expires.toUTCString() + ';path=/;SameSite=Lax';
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  // ── Google Analytics 4 (carregado só com consentimento "all") ──

  function loadGA4() {
    if (!GA_MEASUREMENT_ID || GA_MEASUREMENT_ID.indexOf('XXXXXXXXXX') !== -1) return;
    if (window.__gpmGA4Loaded) return;
    window.__gpmGA4Loaded = true;

    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID, { anonymize_ip: true });
  }

  // ── Banner de cookies ──

  function buildBanner() {
    var banner = document.createElement('div');
    banner.className = 'gpm-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Aviso de cookies');
    banner.innerHTML =
      '<p class="gpm-cookie-banner__text">' +
        'Usamos cookies essenciais para o site funcionar e cookies analíticos (com o seu consentimento) para entender como você navega. ' +
        'Saiba mais na nossa <a href="politica-cookies.html">Política de Cookies</a>.' +
      '</p>' +
      '<div class="gpm-cookie-banner__actions">' +
        '<button type="button" class="gpm-cookie-btn gpm-cookie-btn--outline" data-gpm-action="essential">Apenas essenciais</button>' +
        '<button type="button" class="gpm-cookie-btn gpm-cookie-btn--solid" data-gpm-action="all">Aceitar todos</button>' +
      '</div>';
    document.body.appendChild(banner);

    requestAnimationFrame(function () {
      banner.classList.add('gpm-cookie-banner--visible');
    });

    banner.querySelector('[data-gpm-action="all"]').addEventListener('click', function () {
      setCookie(COOKIE_NAME, 'all', COOKIE_DAYS);
      closeBanner(banner);
      loadGA4();
    });

    banner.querySelector('[data-gpm-action="essential"]').addEventListener('click', function () {
      setCookie(COOKIE_NAME, 'essential', COOKIE_DAYS);
      closeBanner(banner);
    });
  }

  function closeBanner(banner) {
    banner.classList.remove('gpm-cookie-banner--visible');
    setTimeout(function () {
      banner.remove();
    }, 500);
  }

  function initBanner() {
    var consent = getCookie(COOKIE_NAME);
    if (!consent) {
      buildBanner();
    } else if (consent === 'all') {
      loadGA4();
    }
  }

  // ── Checkbox de consentimento nos formulários ──

  function injectConsentField(form) {
    if (form.querySelector('.gpm-consent-field')) return;

    var submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');

    var field = document.createElement('div');
    field.className = 'gpm-consent-field';

    var inputId = 'gpm-consent-' + Math.random().toString(36).slice(2, 9);

    var input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'gpm-consent-checkbox-input';
    input.id = inputId;
    input.name = 'consentimento_dados';

    var box = document.createElement('span');
    box.className = 'gpm-consent-checkbox';
    box.setAttribute('aria-hidden', 'true');

    var label = document.createElement('label');
    label.className = 'gpm-consent-label';
    label.setAttribute('for', inputId);
    label.innerHTML = CONSENT_TEXT;

    field.appendChild(input);
    field.appendChild(box);
    field.appendChild(label);

    input.addEventListener('change', function () {
      if (input.checked) field.classList.remove('gpm-consent-field--error');
    });

    if (submitBtn && submitBtn.parentNode === form) {
      form.insertBefore(field, submitBtn);
    } else if (submitBtn) {
      submitBtn.parentNode.insertBefore(field, submitBtn);
    } else {
      form.appendChild(field);
    }
  }

  function guardFormSubmit(form) {
    form.addEventListener('submit', function (e) {
      var input = form.querySelector('.gpm-consent-checkbox-input');
      if (!input) return;

      if (!input.checked) {
        e.preventDefault();
        e.stopImmediatePropagation();
        var field = form.querySelector('.gpm-consent-field');
        if (field) {
          field.classList.add('gpm-consent-field--error');
          field.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      var timestampField = form.querySelector('input[name="consent_timestamp"]');
      if (!timestampField) {
        timestampField = document.createElement('input');
        timestampField.type = 'hidden';
        timestampField.name = 'consent_timestamp';
        form.appendChild(timestampField);
      }
      timestampField.value = new Date().toISOString();
    }, true); // capture: roda antes de outros handlers de submit do próprio formulário
  }

  function initFormConsent() {
    var forms = document.querySelectorAll('form');
    forms.forEach(function (form) {
      injectConsentField(form);
      guardFormSubmit(form);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initBanner();
    initFormConsent();
  });
})();
