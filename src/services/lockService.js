const redis = require('../config/redis');
const crypto = require('crypto');
const { lockAttempts } = require('./metricsService');

const LOCK_TTL = 5; // 락 자동 만료 시간 (초) — 데드락 방지용
const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 200;

async function acquireLock(resource) {
  const lockKey = `lock:${resource}`;
  const token = crypto.randomUUID();

  for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
    const result = await redis.set(lockKey, token, 'EX', LOCK_TTL, 'NX');

    if (result === 'OK') {
      lockAttempts.inc({ result: 'success' });
      return { acquired: true, token };
    }

    if (attempt < RETRY_COUNT) {
      // 지터(jitter) — 랜덤 시간 추가로 동시 재시도 분산 (경합 완화)
      const jitter = Math.floor(Math.random() * 100);
      await sleep(RETRY_DELAY_MS + jitter);
    }
  }

  lockAttempts.inc({ result: 'fail' });
  return { acquired: false, token: null };
}

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
  return result === 1;
}

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
