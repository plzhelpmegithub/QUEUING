const https = require('node:https');

const VERIFY_HOST = 'www.google.com';
const VERIFY_PATH = '/recaptcha/api/siteverify';
const VERIFY_TIMEOUT_MS = 5000;
const DEFAULT_SCORE_THRESHOLD = 0.5;

let missingSecretWarningShown = false;

function envFlag(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function getSecretKey() {
  return String(process.env.RECAPTCHA_SECRET_KEY || '').trim();
}

function getV2SecretKey() {
  return String(process.env.RECAPTCHA_V2_SECRET_KEY || '').trim();
}

function isEnabled() {
  if (String(process.env.RECAPTCHA_REQUIRED || '').trim().toLowerCase() === 'false') return false;
  return Boolean(getSecretKey());
}

function isV2Enabled() {
  return Boolean(getV2SecretKey());
}

function allowedHostnames() {
  return String(process.env.RECAPTCHA_ALLOWED_HOSTNAMES || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function verifyWithGoogle(token, secretKey, remoteIp) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      secret: secretKey,
      response: token,
    });
    if (remoteIp) params.set('remoteip', remoteIp);

    const request = https.request({
      hostname: VERIFY_HOST,
      path: VERIFY_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(params.toString()),
      },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (_) {
          reject(new Error('Google reCAPTCHA 응답을 해석할 수 없습니다.'));
        }
      });
    });

    request.setTimeout(VERIFY_TIMEOUT_MS, () => {
      request.destroy(new Error('Google reCAPTCHA 검증 시간이 초과되었습니다.'));
    });
    request.on('error', reject);
    request.write(params.toString());
    request.end();
  });
}

async function verifyRecaptcha({ token, expectedAction, remoteIp } = {}) {
  if (!isEnabled()) {
    if (!getSecretKey() && !missingSecretWarningShown) {
      missingSecretWarningShown = true;
      console.warn('[reCAPTCHA] RECAPTCHA_SECRET_KEY가 없어 검증을 비활성화한 상태입니다. 개발 키를 설정하면 자동으로 활성화됩니다.');
    }
    return { ok: true, disabled: true };
  }

  if (!token) {
    return { ok: false, reason: 'missing-token', message: 'reCAPTCHA 인증이 필요합니다.' };
  }

  let result;
  try {
    result = await verifyWithGoogle(token, getSecretKey(), remoteIp);
  } catch (error) {
    console.error('[reCAPTCHA] Google 검증 요청 실패:', error.message);
    return { ok: false, reason: 'verification-unavailable', message: '보안 인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.' };
  }

  if (!result.success) {
    return { ok: false, reason: 'verification-failed', message: '보안 인증에 실패했습니다. 잠시 후 다시 시도해주세요.' };
  }

  if (expectedAction && result.action !== expectedAction) {
    return { ok: false, reason: 'action-mismatch', message: '보안 인증 요청이 올바르지 않습니다.' };
  }

  const scoreThreshold = Number(process.env.RECAPTCHA_SCORE_THRESHOLD || DEFAULT_SCORE_THRESHOLD);
  if (Number.isFinite(scoreThreshold) && Number(result.score) < scoreThreshold) {
    if (isV2Enabled()) {
      return { ok: false, reason: 'low-score', needsV2: true, message: '추가 보안 인증이 필요합니다.' };
    }
    return { ok: false, reason: 'low-score', message: '자동화된 요청으로 판단되어 요청을 진행할 수 없습니다.' };
  }

  const hosts = allowedHostnames();
  if (hosts.length > 0 && (!result.hostname || !hosts.includes(String(result.hostname).toLowerCase()))) {
    return { ok: false, reason: 'hostname-mismatch', message: '등록되지 않은 사이트에서 발생한 요청입니다.' };
  }

  return {
    ok: true,
    score: result.score,
    action: result.action,
    hostname: result.hostname,
  };
}

async function verifyRecaptchaV2({ token, remoteIp } = {}) {
  if (!isV2Enabled()) {
    return { ok: false, reason: 'v2-not-configured', message: 'reCAPTCHA v2가 설정되지 않았습니다.' };
  }

  if (!token) {
    return { ok: false, reason: 'missing-token', message: 'reCAPTCHA v2 인증이 필요합니다.' };
  }

  let result;
  try {
    result = await verifyWithGoogle(token, getV2SecretKey(), remoteIp);
  } catch (error) {
    console.error('[reCAPTCHA v2] Google 검증 요청 실패:', error.message);
    return { ok: false, reason: 'verification-unavailable', message: '보안 인증 서버에 연결하지 못했습니다.' };
  }

  if (!result.success) {
    return { ok: false, reason: 'verification-failed', message: '체크박스 인증에 실패했습니다. 다시 시도해주세요.' };
  }

  const hosts = allowedHostnames();
  if (hosts.length > 0 && (!result.hostname || !hosts.includes(String(result.hostname).toLowerCase()))) {
    return { ok: false, reason: 'hostname-mismatch', message: '등록되지 않은 사이트에서 발생한 요청입니다.' };
  }

  return { ok: true, hostname: result.hostname };
}

async function guardRecaptcha(request, reply, expectedAction) {
  const body = request.body || {};

  if (body.recaptchaV2Token) {
    const v2Result = await verifyRecaptchaV2({
      token: body.recaptchaV2Token,
      remoteIp: request.ip,
    });
    if (v2Result.ok) return true;
    reply.status(403).send({
      success: false,
      code: 'recaptcha_failed',
      reason: v2Result.reason,
      message: v2Result.message,
    });
    return false;
  }

  const result = await verifyRecaptcha({
    token: body.recaptchaToken,
    expectedAction,
    remoteIp: request.ip,
  });

  if (result.ok) return true;

  if (result.needsV2) {
    reply.status(403).send({
      success: false,
      code: 'recaptcha_v2_required',
      message: result.message,
    });
    return false;
  }

  reply.status(403).send({
    success: false,
    code: 'recaptcha_failed',
    reason: result.reason,
    message: result.message,
  });
  return false;
}

module.exports = {
  guardRecaptcha,
  isEnabled,
  isV2Enabled,
  verifyRecaptcha,
  verifyRecaptchaV2,
};
