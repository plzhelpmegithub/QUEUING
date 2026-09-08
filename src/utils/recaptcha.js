// Google reCAPTCHA v3 클라이언트 연동.
// VITE_RECAPTCHA_SITE_KEY가 없으면 개발 중인 기존 흐름을 유지한다.

const SITE_KEY = String(import.meta.env.VITE_RECAPTCHA_SITE_KEY || '').trim();
let scriptPromise = null;

export function isRecaptchaConfigured() {
  return Boolean(SITE_KEY);
}

function loadScript() {
  if (!SITE_KEY) return Promise.resolve(null);
  if (window.grecaptcha?.execute) return Promise.resolve(window.grecaptcha);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-queuing-recaptcha]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.grecaptcha), { once: true });
      existing.addEventListener('error', () => reject(new Error('reCAPTCHA 스크립트를 불러오지 못했습니다.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(SITE_KEY)}`;
    script.async = true;
    script.defer = true;
    script.dataset.queuingRecaptcha = '1';
    script.onload = () => resolve(window.grecaptcha);
    script.onerror = () => reject(new Error('reCAPTCHA 스크립트를 불러오지 못했습니다.'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export async function getRecaptchaToken(action) {
  if (!SITE_KEY) return '';
  if (!action) throw new Error('reCAPTCHA action이 필요합니다.');

  const grecaptcha = await loadScript();
  if (!grecaptcha?.ready || !grecaptcha?.execute) {
    throw new Error('reCAPTCHA가 준비되지 않았습니다.');
  }

  return new Promise((resolve, reject) => {
    grecaptcha.ready(() => {
      grecaptcha.execute(SITE_KEY, { action }).then(resolve).catch(reject);
    });
  });
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
