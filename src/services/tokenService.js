const jwt = require('jsonwebtoken');
const redis = require('../config/redis');

const SECRET_KEY = process.env.JWT_SECRET || 'queuing-admission-secret-key-2026';
const TOKEN_PREFIX = 'admission:';

async function issueToken(userId, ttlSeconds) {
  const ttl = ttlSeconds || parseInt(await redis.get('event:hold-duration'), 10) || 600;

  const payload = {
    userId,
    type: 'admission',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttl,
  };

  const token = jwt.sign(payload, SECRET_KEY);

  await redis.set(`${TOKEN_PREFIX}${userId}`, token, 'EX', ttl);

  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  console.log(`[Token] 발급: ${userId} (${ttl}초, ${expiresAt})`);

  return { token, expiresAt, ttl };
}

async function verifyToken(token, userId) {
  if (!token) {
    return { valid: false, reason: 'no_token', message: 'Admission Token이 필요합니다.' };
  }

  let decoded;
  try {
    decoded = jwt.verify(token, SECRET_KEY);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return { valid: false, reason: 'expired', message: 'Admission Token이 만료되었습니다.' };
    }
    return { valid: false, reason: 'invalid', message: 'Admission Token이 유효하지 않습니다.' };
  }

  if (decoded.userId !== userId) {
    return { valid: false, reason: 'user_mismatch', message: '본인에게 발급된 토큰이 아닙니다.' };
  }

  const storedToken = await redis.get(`${TOKEN_PREFIX}${userId}`);
  if (!storedToken) {
    return { valid: false, reason: 'revoked', message: '토큰이 이미 사용되었거나 무효화되었습니다.' };
  }

  if (storedToken !== token) {
    return { valid: false, reason: 'mismatch', message: '최신 토큰이 아닙니다.' };
  }

  return { valid: true, userId: decoded.userId };
}

async function revokeToken(userId) {
  await redis.del(`${TOKEN_PREFIX}${userId}`);
  console.log(`[Token] 무효화: ${userId}`);
}

async function getTokenInfo(userId) {
  const storedToken = await redis.get(`${TOKEN_PREFIX}${userId}`);
  if (!storedToken) {
    return { exists: false, message: '발급된 토큰이 없습니다.' };
  }

  try {
    const decoded = jwt.verify(storedToken, SECRET_KEY);
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

async function getRawToken(userId) {
  const storedToken = await redis.get(`${TOKEN_PREFIX}${userId}`);
  if (!storedToken) return null;
  try {
    const decoded = jwt.verify(storedToken, SECRET_KEY);
    return { token: storedToken, expiresAt: new Date(decoded.exp * 1000).toISOString() };
  } catch (err) {
    return null;
  }
}

module.exports = { issueToken, verifyToken, revokeToken, getTokenInfo, getRawToken };
