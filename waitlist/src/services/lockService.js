const redis = require('../config/redis');
const crypto = require('crypto');

// 락 기본 설정
const LOCK_TTL = 5;          // 락 만료 시간 (초) — 데드락 방지
const RETRY_COUNT = 3;       // 재시도 횟수
const RETRY_DELAY_MS = 200;  // 재시도 간격 (ms)

/**
 * 락 획득
 * - Redis SET NX EX 사용 (키가 없을 때만 생성 + TTL)
 * - value에 고유 토큰 저장 → 본인 락만 해제 가능 (안전한 릴리즈)
 * - 실패 시 RETRY_COUNT만큼 재시도
 *
 * @param {string} resource - 잠글 대상 (예: "seat:A-12")
 * @returns {{ acquired: boolean, token: string|null }}
 */
async function acquireLock(resource) {
  const lockKey = `lock:${resource}`;
  const token = crypto.randomUUID();  // 고유 토큰

  for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
    // SET key value NX EX ttl — 키 없을 때만 생성 + 자동 만료
    const result = await redis.set(lockKey, token, 'EX', LOCK_TTL, 'NX');

    if (result === 'OK') {
      return { acquired: true, token };
    }

    // 마지막 시도가 아니면 대기 후 재시도
    if (attempt < RETRY_COUNT) {
      // 지터(jitter) 추가 — 동시 요청이 같은 타이밍에 재시도하는 것 방지
      const jitter = Math.floor(Math.random() * 100);
      await sleep(RETRY_DELAY_MS + jitter);
    }
  }

  return { acquired: false, token: null };
}

/**
 * 락 해제
 * - Lua 스크립트로 "내 토큰일 때만 삭제" 를 원자적으로 처리
 * - 다른 사용자의 락을 실수로 해제하는 것 방지
 *
 * @param {string} resource - 잠근 대상
 * @param {string} token - acquireLock에서 받은 토큰
 * @returns {boolean} 해제 성공 여부
 */
async function releaseLock(resource, token) {
  const lockKey = `lock:${resource}`;

  // Lua: 값이 내 토큰과 일치할 때만 DEL → 원자적 비교+삭제
  const luaScript = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;

  const result = await redis.eval(luaScript, 1, lockKey, token);
  return result === 1;
}

/**
 * 락 상태 확인 (디버깅/모니터링용)
 */
async function getLockInfo(resource) {
  const lockKey = `lock:${resource}`;
  const [token, ttl] = await Promise.all([
    redis.get(lockKey),
    redis.ttl(lockKey),
  ]);

  return {
    locked: token !== null,
    ttl: ttl > 0 ? ttl : 0,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { acquireLock, releaseLock, getLockInfo };
