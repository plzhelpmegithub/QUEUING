const redis = require('../config/redis');
const crypto = require('crypto');

// ===== 락 설정 =====
const LOCK_TTL = 5;          // 락 자동 만료 시간 (초) — 데드락 방지용
const RETRY_COUNT = 3;       // 락 획득 실패 시 재시도 횟수
const RETRY_DELAY_MS = 200;  // 재시도 간격 (밀리초)

/**
 * 락 획득
 * - 같은 좌석에 동시에 여러 사용자가 요청해도 1명만 성공
 * - SET NX EX 사용: 키가 없을 때만 생성 + 자동 만료
 * - value에 고유 토큰 저장 → 본인이 건 락만 해제 가능
 *
 * @param {string} resource - 잠글 대상 (예: "A-001")
 * @returns {{ acquired: boolean, token: string|null }}
 */
async function acquireLock(resource) {
  const lockKey = `lock:${resource}`;        // 락 키 (예: lock:A-001)
  const token = crypto.randomUUID();         // 고유 토큰 — 누가 건 락인지 식별

  for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
    // SET key value NX EX — 키 없을 때만(NX) 생성 + 5초 후 자동 삭제(EX)
    const result = await redis.set(lockKey, token, 'EX', LOCK_TTL, 'NX');

    if (result === 'OK') {
      return { acquired: true, token }; // 락 획득 성공
    }

    // 마지막 시도가 아니면 대기 후 재시도
    if (attempt < RETRY_COUNT) {
      // 지터(jitter) — 랜덤 시간 추가로 동시 재시도 분산 (경합 완화)
      const jitter = Math.floor(Math.random() * 100);
      await sleep(RETRY_DELAY_MS + jitter);
    }
  }

  return { acquired: false, token: null }; // 3번 다 실패
}

/**
 * 락 해제
 * - Lua 스크립트로 "내 토큰일 때만 삭제"를 원자적으로 처리
 * - 다른 사용자가 건 락을 실수로 해제하는 것 방지
 * - GET + DEL을 따로 하면 그 사이에 다른 요청이 끼어들 수 있어서 Lua 필수
 *
 * @param {string} resource - 잠근 대상
 * @param {string} token - acquireLock에서 받은 토큰
 */
async function releaseLock(resource, token) {
  const lockKey = `lock:${resource}`;

  // Lua 스크립트 — Redis 서버에서 원자적으로 실행
  // 현재 값이 내 토큰과 같을 때만 삭제
  const luaScript = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;

  const result = await redis.eval(luaScript, 1, lockKey, token);
  return result === 1; // 1이면 삭제 성공, 0이면 이미 만료되었거나 다른 토큰
}

/**
 * 락 상태 확인 (디버깅/모니터링용)
 */
async function getLockInfo(resource) {
  const lockKey = `lock:${resource}`;
  const [token, ttl] = await Promise.all([
    redis.get(lockKey),   // 현재 락을 건 토큰
    redis.ttl(lockKey),   // 남은 만료 시간
  ]);

  return {
    locked: token !== null,
    ttl: ttl > 0 ? ttl : 0,
  };
}

// 대기 함수
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { acquireLock, releaseLock, getLockInfo };
