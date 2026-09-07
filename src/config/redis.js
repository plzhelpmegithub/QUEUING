const Redis = require('ioredis'); // Redis 클라이언트 라이브러리

// Redis 연결 설정 — 환경변수로 호스트/포트 주입 가능
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',     // Redis 서버 주소
  port: process.env.REDIS_PORT || 6379,            // Redis 포트
  maxRetriesPerRequest: 3,                         // 요청당 최대 재시도 횟수
  retryStrategy(times) {                           // 재연결 전략
    if (times > 3) return null;                    // 3번 초과 시 포기
    return Math.min(times * 200, 2000);            // 점진적 대기 (200ms → 400ms → 600ms)
  },
});

redis.on('connect', () => console.log('[Redis] Connected'));              // 연결 성공 로그
redis.on('error', (err) => console.error('[Redis] Error:', err.message)); // 에러 로그

module.exports = redis;
