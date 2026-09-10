const jwt = require('jsonwebtoken');

const ACCESS_TTL = 60 * 60 * 4; // 4시간
const REFRESH_TTL = 60 * 60 * 24 * 7; // 7일
const MIN_SECRET_LENGTH = 32;

function getSecret() {
  return String(process.env.JWT_AUTH_SECRET || '').trim();
}

function isEnabled() {
  return getSecret().length >= MIN_SECRET_LENGTH;
}

function assertConfigured() {
  if (String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production' && !isEnabled()) {
    throw new Error(`JWT_AUTH_SECRET 환경변수가 필요합니다. ${MIN_SECRET_LENGTH}자 이상의 랜덤 값을 사용하세요.`);
  }
}

function issueAccessToken(userId, role) {
  const secret = getSecret();
  if (secret.length < MIN_SECRET_LENGTH) return null;
  return jwt.sign({ userId, role, type: 'access' }, secret, { expiresIn: ACCESS_TTL });
}

function issueRefreshToken(userId, role) {
  const secret = getSecret();
  if (secret.length < MIN_SECRET_LENGTH) return null;
  return jwt.sign({ userId, role, type: 'refresh' }, secret, { expiresIn: REFRESH_TTL });
}

function verifyAccessToken(token) {
  const secret = getSecret();
  if (secret.length < MIN_SECRET_LENGTH) return { valid: false, reason: 'not_configured' };
  if (!token) return { valid: false, reason: 'missing' };

  try {
    const decoded = jwt.verify(token, secret);
    if (decoded.type !== 'access') return { valid: false, reason: 'wrong_type' };
    return { valid: true, userId: decoded.userId, role: decoded.role };
  } catch (err) {
    if (err.name === 'TokenExpiredError') return { valid: false, reason: 'expired' };
    return { valid: false, reason: 'invalid' };
  }
}

function verifyRefreshToken(token) {
  const secret = getSecret();
  if (secret.length < MIN_SECRET_LENGTH) return { valid: false, reason: 'not_configured' };
  if (!token) return { valid: false, reason: 'missing' };

  try {
    const decoded = jwt.verify(token, secret);
    if (decoded.type !== 'refresh') return { valid: false, reason: 'wrong_type' };
    return { valid: true, userId: decoded.userId, role: decoded.role };
  } catch (err) {
    if (err.name === 'TokenExpiredError') return { valid: false, reason: 'expired' };
    return { valid: false, reason: 'invalid' };
  }
}

function issueTokenPair(userId, role) {
  return {
    accessToken: issueAccessToken(userId, role),
    refreshToken: issueRefreshToken(userId, role),
  };
}

module.exports = {
  isEnabled,
  assertConfigured,
  issueTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  issueAccessToken,
  issueRefreshToken,
};
