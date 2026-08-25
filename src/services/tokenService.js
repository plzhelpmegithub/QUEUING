const jwt = require('jsonwebtoken');
const redis = require('../config/redis');

// ===== 토큰 설정 =====
const SECRET_KEY = process.env.JWT_SECRET || 'queuing-admission-secret-key-2026'; // 서명 키
const TOKEN_PREFIX = 'admission:';  // Redis에 발급된 토큰 저장 (1회용 검증 + 무효화용)

/**
 * Admission Token 발급
 * - 대기열 순번 도달 시 호출
 * - JWT에 userId, 발급 시간, 만료 시간 포함
 * - Redis에도 저장 (1회용 검증 + 강제 무효화 지원)
 *
 * @param {string} userId - 사용자 ID
 * @param {number} ttlSeconds - 토큰 유효 시간 (초, 기본 600초 = 10분)
 * @returns {{ token: string, expiresAt: string }}
 */
async function issueToken(userId, ttlSeconds) {
  // 관리자 설정 결제 시간 또는 기본값
  const ttl = ttlSeconds || parseInt(await redis.get('event:hold-duration'), 10) || 600;

  const payload = {
    userId,                                    // 누구에게 발급했는지
    type: 'admission',                         // 토큰 용도
    iat: Math.floor(Date.now() / 1000),        // 발급 시간 (초)
    exp: Math.floor(Date.now() / 1000) + ttl,  // 만료 시간 (초)
  };

  // JWT 서명
  const token = jwt.sign(payload, SECRET_KEY);

  // Redis에 토큰 저장 (TTL 설정 — 만료 시 자동 삭제)
  await redis.set(`${TOKEN_PREFIX}${userId}`, token, 'EX', ttl);

  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  console.log(`[Token] 발급: ${userId} (${ttl}초, ${expiresAt})`);

  return { token, expiresAt, ttl };
}

/**
 * Admission Token 검증
 * - 좌석 선점(hold) 요청 시 호출
 * - JWT 서명 위변조 검사 + 만료 검사 + Redis 존재 확인
 *
 * @param {string} token - 사용자가 보낸 토큰
 * @param {string} userId - 요청한 사용자 ID
 * @returns {{ valid: boolean, reason?: string }}
 */
async function verifyToken(token, userId) {
  // 1) 토큰이 없으면 거부
  if (!token) {
    return { valid: false, reason: 'no_token', message: 'Admission Token이 필요합니다.' };
  }

  // 2) JWT 서명 + 만료 검증
  let decoded;
  try {
    decoded = jwt.verify(token, SECRET_KEY);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return { valid: false, reason: 'expired', message: 'Admission Token이 만료되었습니다.' };
    }
    return { valid: false, reason: 'invalid', message: 'Admission Token이 유효하지 않습니다.' };
  }

  // 3) 토큰의 userId와 요청 userId 일치 확인
  if (decoded.userId !== userId) {
    return { valid: false, reason: 'user_mismatch', message: '본인에게 발급된 토큰이 아닙니다.' };
  }

  // 4) Redis에 토큰이 존재하는지 확인 (무효화된 토큰 방지)
  const storedToken = await redis.get(`${TOKEN_PREFIX}${userId}`);
  if (!storedToken) {
    return { valid: false, reason: 'revoked', message: '토큰이 이미 사용되었거나 무효화되었습니다.' };
  }

  // 5) 저장된 토큰과 일치하는지 확인
  if (storedToken !== token) {
    return { valid: false, reason: 'mismatch', message: '최신 토큰이 아닙니다.' };
  }

  return { valid: true, userId: decoded.userId };
}

/**
 * 토큰 무효화 (사용 후 또는 관리자 강제 취소)
 * - 좌석 선점 성공 후 호출 → 토큰 재사용 방지
 *
 * @param {string} userId - 사용자 ID
 */
async function revokeToken(userId) {
  await redis.del(`${TOKEN_PREFIX}${userId}`);
  console.log(`[Token] 무효화: ${userId}`);
}

/**
 * 토큰 정보 조회 (디버깅/관리용)
 *
 * @param {string} userId - 사용자 ID
 */
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

/**
 * 유효한 원본 토큰 조회 (재발급 없이) — 서버에는 여전히 유효한 토큰이 있는데
 * 클라이언트가 새로고침 등으로 잃어버린 경우, /queue/enter가 이걸로 그대로
 * 돌려줘서 재사용할 수 있게 함. Redis에는 원문 JWT 자체가 저장돼 있어서
 * (1회용 검증·강제 무효화용) 재조회가 가능함 — getTokenInfo()는 메타데이터만
 * 주고 원문은 안 주므로 별도로 둠.
 *
 * @param {string} userId - 사용자 ID
 * @returns {{ token: string, expiresAt: string } | null}
 */
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
