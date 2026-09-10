import { openModal } from '../components/modal.js';
import { authHeaders } from './authToken.js';

const V3_SITE_KEY = String(import.meta.env.VITE_RECAPTCHA_SITE_KEY || '').trim();
const V2_SITE_KEY = String(import.meta.env.VITE_RECAPTCHA_V2_SITE_KEY || '').trim();

let v3ScriptPromise = null;
let v2ScriptPromise = null;

export function isRecaptchaConfigured() {
  return Boolean(V3_SITE_KEY);
}

export function isV2Configured() {
  return Boolean(V2_SITE_KEY);
}

function loadV3Script() {
  if (!V3_SITE_KEY) return Promise.resolve(null);
  if (v3ScriptPromise) return v3ScriptPromise;

  v3ScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-queuing-recaptcha]');
    if (existing) {
      if (window.grecaptcha?.execute) { resolve(window.grecaptcha); return; }
      existing.addEventListener('load', () => waitForReady(resolve, reject), { once: true });
      existing.addEventListener('error', () => reject(new Error('reCAPTCHA 스크립트를 불러오지 못했습니다.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(V3_SITE_KEY)}`;
    script.async = true;
    script.defer = true;
    script.dataset.queuingRecaptcha = '1';
    script.onload = () => waitForReady(resolve, reject);
    script.onerror = () => reject(new Error('reCAPTCHA 스크립트를 불러오지 못했습니다.'));
    document.head.appendChild(script);
  });

  return v3ScriptPromise;
}

function waitForReady(resolve, reject) {
  if (window.grecaptcha?.ready) {
    window.grecaptcha.ready(() => resolve(window.grecaptcha));
  } else {
    reject(new Error('reCAPTCHA가 준비되지 않았습니다.'));
  }
}

if (V3_SITE_KEY) loadV3Script();

export async function getRecaptchaToken(action) {
  if (!V3_SITE_KEY) return '';
  if (!action) throw new Error('reCAPTCHA action이 필요합니다.');

  const grecaptcha = await loadV3Script();
  if (!grecaptcha?.execute) {
    throw new Error('reCAPTCHA가 준비되지 않았습니다.');
  }

  return grecaptcha.execute(V3_SITE_KEY, { action });
}

export async function withRecaptcha(payload, action) {
  const token = await getRecaptchaToken(action);
  if (!token) return payload;
  return {
    ...payload,
    recaptchaToken: token,
    recaptchaAction: action,
  };
}

function loadV2Script() {
  if (!V2_SITE_KEY) return Promise.resolve(null);
  if (v2ScriptPromise) return v2ScriptPromise;

  v2ScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-queuing-recaptcha-v2]');
    if (existing) {
      if (window.grecaptcha?.render) { resolve(window.grecaptcha); return; }
      existing.addEventListener('load', () => waitForReady(resolve, reject), { once: true });
      existing.addEventListener('error', () => reject(new Error('reCAPTCHA v2 스크립트를 불러오지 못했습니다.')), { once: true });
      return;
    }

    const cbName = '__onRecaptchaV2Load_' + Date.now();
    window[cbName] = () => {
      delete window[cbName];
      if (window.grecaptcha?.render) resolve(window.grecaptcha);
      else reject(new Error('reCAPTCHA v2가 준비되지 않았습니다.'));
    };

    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?onload=${cbName}&render=explicit`;
    script.async = true;
    script.defer = true;
    script.dataset.queuingRecaptchaV2 = '1';
    script.onerror = () => {
      delete window[cbName];
      reject(new Error('reCAPTCHA v2 스크립트를 불러오지 못했습니다.'));
    };
    document.head.appendChild(script);
  });

  return v2ScriptPromise;
}

export async function renderV2Checkbox(containerEl) {
  if (!V2_SITE_KEY) return Promise.reject(new Error('reCAPTCHA v2 Site Key가 설정되지 않았습니다.'));

  const grecaptcha = await loadV2Script();
  if (!grecaptcha?.render) throw new Error('reCAPTCHA v2를 로드할 수 없습니다.');

  return new Promise((resolve, reject) => {
    try {
      grecaptcha.render(containerEl, {
        sitekey: V2_SITE_KEY,
        callback: (token) => resolve(token),
        'expired-callback': () => reject(new Error('reCAPTCHA 인증이 만료되었습니다. 다시 시도해주세요.')),
        'error-callback': () => reject(new Error('reCAPTCHA 인증 중 오류가 발생했습니다.')),
      });
    } catch (e) {
      reject(e);
    }
  });
}

export function isV2Required(response) {
  return response?.code === 'recaptcha_v2_required';
}

export function showV2Challenge() {
  if (!V2_SITE_KEY) return Promise.reject(new Error('reCAPTCHA v2 Site Key가 설정되지 않았습니다.'));

  return new Promise((resolve, reject) => {
    const modal = openModal({
      title: '추가 보안 인증',
      bodyHtml: `
        <p style="font-size:14px;color:var(--color-text-secondary);margin-bottom:16px;">보안 확인을 위해 아래 체크박스를 클릭해주세요.</p>
        <div data-v2-modal-widget style="display:flex;justify-content:center;"></div>
        <div data-v2-modal-msg style="font-size:12px;margin-top:12px;text-align:center;"></div>
      `,
      onClose: () => reject(new Error('사용자가 보안 인증을 취소했습니다.')),
    });

    const widgetEl = modal.el.querySelector('[data-v2-modal-widget]');
    const msgEl = modal.el.querySelector('[data-v2-modal-msg]');

    renderV2Checkbox(widgetEl)
      .then((token) => {
        msgEl.textContent = '인증 완료! 요청을 다시 처리합니다...';
        msgEl.style.color = 'var(--color-success, #27ae60)';
        setTimeout(() => {
          modal.close = () => {};
          modal.el.remove();
          document.body.classList.remove('modal-open');
          resolve(token);
        }, 600);
      })
      .catch(() => {
        msgEl.textContent = '인증에 실패했습니다. 모달을 닫고 다시 시도해주세요.';
        msgEl.style.color = 'var(--color-danger, #e74c3c)';
      });
  });
}

export async function fetchWithRecaptcha(url, body, action) {
  const v3Body = await withRecaptcha(body, action);
  const headers = { 'Content-Type': 'application/json', ...authHeaders() };
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(v3Body),
  });
  const data = await res.json().catch(() => ({}));

  if (res.status === 403 && isV2Required(data) && isV2Configured()) {
    const v2Token = await showV2Challenge();
    const v2Body = { ...body, recaptchaV2Token: v2Token };
    const retryRes = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(v2Body),
    });
    const retryData = await retryRes.json().catch(() => ({}));
    return { status: retryRes.status, data: retryData };
  }

  return { status: res.status, data };
}
