const jwt = require('jsonwebtoken');
const redis = require('../config/redis');
const { normalizeSessionContext } = require('./sessionContext');

const TOKEN_PREFIX = 'admission:';
const MIN_SECRET_LENGTH = 32;

function getSecretKey() {
  return String(process.env.JWT_SECRET || '').trim();
}

function isConfigured() {
  return getSecretKey().length >= MIN_SECRET_LENGTH;
}

function assertConfigured() {
  if (String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production' && !isConfigured()) {
    throw new Error(`JWT_SECRET 환경변수가 필요합니다. ${MIN_SECRET_LENGTH}자 이상의 랜덤 값을 사용하세요.`);
  }
}

function tokenKey(userId, context = {}) {
  const session = normalizeSessionContext(context);
  if (!session.scoped) return `${TOKEN_PREFIX}${userId}`;
  return `${TOKEN_PREFIX}${session.eventId || 'event'}:${session.sessionKey}:${userId}`;
}

async function issueToken(userId, ttlSeconds, context = {}) {
  const secretKey = getSecretKey();
  if (secretKey.length < MIN_SECRET_LENGTH) throw new Error(`JWT_SECRET은 ${MIN_SECRET_LENGTH}자 이상의 랜덤 값이어야 합니다.`);
  const ttl = ttlSeconds || parseInt(await redis.get('event:hold-duration'), 10) || 600;
  const session = normalizeSessionContext(context);

  const payload = {
    userId,
    type: 'admission',
    ...(session.scoped ? { eventId: session.eventId, sessionDate: session.sessionDate, sessionTime: session.sessionTime } : {}),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttl,
  };

  const token = jwt.sign(payload, secretKey);

  await redis.set(tokenKey(userId, session), token, 'EX', ttl);

  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  console.log(`[Token] 발급: ${userId} (${ttl}초, ${expiresAt})`);

  return { token, expiresAt, ttl };
}

async function verifyToken(token, userId, context = {}) {
  const secretKey = getSecretKey();
  if (secretKey.length < MIN_SECRET_LENGTH) {
    return { valid: false, reason: 'not_configured', message: 'Admission Token 인증 설정이 완료되지 않았습니다.' };
  }
  if (!token) {
    return { valid: false, reason: 'no_token', message: 'Admission Token이 필요합니다.' };
  }

  let decoded;
  try {
    decoded = jwt.verify(token, secretKey);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return { valid: false, reason: 'expired', message: 'Admission Token이 만료되었습니다.' };
    }
    return { valid: false, reason: 'invalid', message: 'Admission Token이 유효하지 않습니다.' };
  }

  if (decoded.userId !== userId) {
    return { valid: false, reason: 'user_mismatch', message: '본인에게 발급된 토큰이 아닙니다.' };
  }

  const session = normalizeSessionContext(context);
  if (session.scoped && (decoded.eventId !== session.eventId || decoded.sessionDate !== session.sessionDate || decoded.sessionTime !== session.sessionTime)) {
    return { valid: false, reason: 'session_mismatch', message: '선택한 공연 회차와 다른 입장 토큰입니다.' };
  }

  const storedToken = await redis.get(tokenKey(userId, session));
  if (!storedToken) {
    return { valid: false, reason: 'revoked', message: '토큰이 이미 사용되었거나 무효화되었습니다.' };
  }

  if (storedToken !== token) {
    return { valid: false, reason: 'mismatch', message: '최신 토큰이 아닙니다.' };
  }

  return { valid: true, userId: decoded.userId };
}

async function revokeToken(userId, context = {}) {
  await redis.del(tokenKey(userId, context));
  console.log(`[Token] 무효화: ${userId}`);
}

async function getTokenInfo(userId, context = {}) {
  const secretKey = getSecretKey();
  if (secretKey.length < MIN_SECRET_LENGTH) {
    return { exists: false, reason: 'not_configured', message: 'Admission Token 인증 설정이 완료되지 않았습니다.' };
  }
  const storedToken = await redis.get(tokenKey(userId, context));
  if (!storedToken) {
    return { exists: false, message: '발급된 토큰이 없습니다.' };
  }

  try {
    const decoded = jwt.verify(storedToken, secretKey);
    const remaining = decoded.exp - Math.floor(Date.now() / 1000);
    return {
      exists: true,
      userId: decoded.userId,
      remainingSeconds: remaining > 0 ? remaining : 0,
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
    };
  } catch (err) {
    return { exists: true, expired: true, message: '토큰이 만료되었습니다.' };
  }
}

async function getRawToken(userId, context = {}) {
  const secretKey = getSecretKey();
  if (!secretKey) return null;
  const storedToken = await redis.get(tokenKey(userId, context));
  if (!storedToken) return null;
  try {
    const decoded = jwt.verify(storedToken, secretKey);
    return { token: storedToken, expiresAt: new Date(decoded.exp * 1000).toISOString() };
  } catch (err) {
    return null;
  }
}

module.exports = {
  issueToken,
  verifyToken,
  revokeToken,
  getTokenInfo,
  getRawToken,
  tokenKey,
  isConfigured,
  assertConfigured,
};
