const Redis = require('ioredis');
const redis = require('../config/redis');
const { timerExpirations, timerStarts, timerCancellations } = require('./metricsService');
const { normalizeSessionContext } = require('./sessionContext');

const TIMER_PREFIX = 'timer:seat:';
const SEAT_PREFIX = 'seat:';
const HOLD_DURATION_KEY = 'event:hold-duration';
const DEFAULT_HOLD_DURATION = parseInt(process.env.HOLD_DURATION, 10) || 60;

// subscribe 모드에 들어가면 다른 명령을 실행할 수 없어서 별도 연결 필요
let subscriber = null;

async function getCurrentHoldDuration() {
  const stored = await redis.get(HOLD_DURATION_KEY);
  return stored ? parseInt(stored, 10) : DEFAULT_HOLD_DURATION;
}

async function startTimer(seatId, userId, customDuration) {
  const holdDuration = customDuration || await getCurrentHoldDuration();
  const timerKey = `${TIMER_PREFIX}${seatId}`;
  await redis.set(timerKey, userId, 'EX', holdDuration);
  timerStarts.inc();
  console.log(`[Timer] ${seatId} 타이머 시작 (${holdDuration}초) — ${userId}`);
}

async function cancelTimer(seatId) {
  const timerKey = `${TIMER_PREFIX}${seatId}`;
  const deleted = await redis.del(timerKey);
  if (deleted > 0) timerCancellations.inc();
  console.log(`[Timer] ${seatId} 타이머 취소`);
}

async function getRemaining(seatId) {
  const timerKey = `${TIMER_PREFIX}${seatId}`;
  const ttl = await redis.ttl(timerKey);
  return ttl > 0 ? ttl : -1;
}

async function initExpiryListener() {
  try {
    await redis.config('SET', 'notify-keyspace-events', 'Ex');
  } catch (e) {
    console.warn('[Timer] notify-keyspace-events 설정 생략:', e.message);
  }

  subscriber = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  });

  const channel = '__keyevent@0__:expired';
  await subscriber.subscribe(channel);

  subscriber.on('message', async (ch, expiredKey) => {
    if (!expiredKey.startsWith(TIMER_PREFIX)) return;

    const seatId = expiredKey.replace(TIMER_PREFIX, '');
    console.log(`[Timer] ${seatId} 만료 — 결제 시간 초과`);

    const seatKey = `${SEAT_PREFIX}${seatId}`;
    const seatInfo = await redis.hgetall(seatKey);
    const status = seatInfo.status;

    if (status === 'HELD') {
      const heldBy = seatInfo.heldBy;
      timerExpirations.inc();

      try {
        const result = await require('./seatService').releaseSeat(heldBy, seatId);
        if (result.success) {
          console.log(`[Timer] ${heldBy} 시간 초과 — ${seatId} available 복구`);
        } else {
          console.warn(`[Timer] ${seatId} 만료 후 좌석 해제 실패: ${result.message || result.reason}`);
        }
      } catch (err) {
        console.error(`[Timer] ${seatId} 만료 좌석 해제 실패:`, err.message);
      }

      const { sessionFromSeat } = require('./sessionContext');
      const { acquireLock, releaseLock } = require('./lockService');
      const queueService = require('./queueService');
      const context = sessionFromSeat(seatId, seatInfo);
      try {
        const removed = await queueService.removeAdmitted(heldBy, context);
        if (removed) {
          const normalized = normalizeSessionContext(context);
          const resource = `admission:${normalized.eventId || 'default'}:${normalized.sessionKey}`;
          const lock = await acquireLock(resource);
          if (lock.acquired) {
            try {
              await queueService.backfillOne(context);
            } finally {
              await releaseLock(resource, lock.token).catch(() => {});
            }
          }
        }
      } catch (err) {
        console.error(`[Timer] ${heldBy} admitted 제거/backfill 실패:`, err.message);
      }
    }
  });

  console.log('[Timer] 만료 리스너 시작');
}

async function stopExpiryListener() {
  if (subscriber) {
    await subscriber.unsubscribe();
    subscriber.disconnect();
  }
}

module.exports = { startTimer, cancelTimer, getRemaining, initExpiryListener, stopExpiryListener };
