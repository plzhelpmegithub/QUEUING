const Redis = require('ioredis');
const redis = require('../config/redis');
const { publishSeatEvent, EVENT_TYPE } = require('./eventService');

const TIMER_PREFIX = 'timer:seat:';
const SEAT_PREFIX = 'seat:';
const HOLD_DURATION = parseInt(process.env.HOLD_DURATION, 10) || 600; // 기본 10분 (초)

// keyspace notification 구독 전용 연결 (subscribe 모드 진입하면 다른 명령 불가)
let subscriber = null;

/**
 * 타이머 시작
 * - 좌석 선점 시 호출
 * - timer:seat:{seatId} 키를 TTL로 생성 → 만료 시 자동 이벤트 발생
 *
 * @param {string} seatId
 * @param {string} userId
 */
async function startTimer(seatId, userId) {
  const timerKey = `${TIMER_PREFIX}${seatId}`;
  await redis.set(timerKey, userId, 'EX', HOLD_DURATION);
  console.log(`[Timer] ${seatId} 타이머 시작 (${HOLD_DURATION}초) — ${userId}`);
}

/**
 * 타이머 취소
 * - 결제 완료 시 호출 → 만료 이벤트 방지
 *
 * @param {string} seatId
 */
async function cancelTimer(seatId) {
  const timerKey = `${TIMER_PREFIX}${seatId}`;
  await redis.del(timerKey);
  console.log(`[Timer] ${seatId} 타이머 취소`);
}

/**
 * 남은 시간 조회
 *
 * @param {string} seatId
 * @returns {number} 남은 초 (-1이면 타이머 없음)
 */
async function getRemaining(seatId) {
  const timerKey = `${TIMER_PREFIX}${seatId}`;
  const ttl = await redis.ttl(timerKey);
  return ttl > 0 ? ttl : -1;
}

/**
 * keyspace notification 리스너 초기화
 * - Redis의 만료 이벤트를 구독해서 좌석 자동 해제
 * - 서버 시작 시 1번 호출
 */
async function initExpiryListener() {
  // 1) keyspace notification 활성화 (Ex = 만료 이벤트)
  await redis.config('SET', 'notify-keyspace-events', 'Ex');

  // 2) 구독 전용 Redis 연결 생성
  subscriber = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  });

  // 3) DB 0의 만료 이벤트 채널 구독
  const channel = '__keyevent@0__:expired';
  await subscriber.subscribe(channel);

  subscriber.on('message', async (ch, expiredKey) => {
    // timer:seat:* 키만 처리
    if (!expiredKey.startsWith(TIMER_PREFIX)) return;

    const seatId = expiredKey.replace(TIMER_PREFIX, '');
    console.log(`[Timer] ${seatId} 만료 — 좌석 자동 해제`);

    // 좌석 상태를 available로 되돌림
    const seatKey = `${SEAT_PREFIX}${seatId}`;
    const status = await redis.hget(seatKey, 'status');

    // held 상태일 때만 해제 (이미 sold면 건드리지 않음)
    if (status === 'held') {
      const heldBy = await redis.hget(seatKey, 'heldBy');
      await redis.hset(seatKey, {
        status: 'available',
        heldBy: '',
        heldAt: '',
      });
      await publishSeatEvent(EVENT_TYPE.RELEASED, { seatId, userId: heldBy });
      console.log(`[Timer] ${seatId} → available 복구 완료`);
    }
  });

  console.log('[Timer] 만료 리스너 시작');
}

/**
 * 리스너 종료 (서버 셧다운 시)
 */
async function stopExpiryListener() {
  if (subscriber) {
    await subscriber.unsubscribe();
    subscriber.disconnect();
  }
}

module.exports = { startTimer, cancelTimer, getRemaining, initExpiryListener, stopExpiryListener };
