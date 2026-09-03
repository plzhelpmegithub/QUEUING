const Redis = require('ioredis');
const redis = require('../config/redis');
const pool = require('../config/mariadb');
const { publishSeatEvent, EVENT_TYPE } = require('./eventService');
const { timerExpirations } = require('./metricsService');
const { createAllocation, markExpired } = require('./cancelAllocationService');
const { syncToMariaDB } = require('./syncRetryService');

const TIMER_PREFIX = 'timer:seat:';
const SEAT_PREFIX = 'seat:';
const HOLD_DURATION_KEY = 'event:hold-duration';
const DEFAULT_HOLD_DURATION = parseInt(process.env.HOLD_DURATION, 10) || 600;

// subscribe 모드에 들어가면 다른 명령을 실행할 수 없어서 별도 연결 필요
let subscriber = null;

async function getCurrentHoldDuration() {
  const stored = await redis.get(HOLD_DURATION_KEY);
  return stored ? parseInt(stored, 10) : DEFAULT_HOLD_DURATION;
}

async function startTimer(seatId, userId) {
  const holdDuration = await getCurrentHoldDuration();
  const timerKey = `${TIMER_PREFIX}${seatId}`;
  await redis.set(timerKey, userId, 'EX', holdDuration);
  console.log(`[Timer] ${seatId} 타이머 시작 (${holdDuration}초) — ${userId}`);
}

async function cancelTimer(seatId) {
  const timerKey = `${TIMER_PREFIX}${seatId}`;
  await redis.del(timerKey);
  console.log(`[Timer] ${seatId} 타이머 취소`);
}

async function getRemaining(seatId) {
  const timerKey = `${TIMER_PREFIX}${seatId}`;
  const ttl = await redis.ttl(timerKey);
  return ttl > 0 ? ttl : -1;
}

async function initExpiryListener() {
  await redis.config('SET', 'notify-keyspace-events', 'Ex');

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
    const status = await redis.hget(seatKey, 'status');

    if (status === 'HELD') {
      const heldBy = await redis.hget(seatKey, 'heldBy');
      timerExpirations.inc();

      const STANDBY_KEY = 'queue:standby';
      const ADMITTED_KEY = 'queue:admitted';
      const nextUsers = await redis.zrange(STANDBY_KEY, 0, 0);

      if (nextUsers.length > 0) {
        const nextUser = nextUsers[0];
        await redis.zrem(STANDBY_KEY, nextUser);
        await redis.sadd(ADMITTED_KEY, nextUser);

        await redis.hset(seatKey, {
          status: 'HELD',
          heldBy: nextUser,
          heldAt: Date.now().toString(),
        });

        await startTimer(seatId, nextUser);

        await publishSeatEvent(EVENT_TYPE.HELD, {
          seatId,
          userId: nextUser,
          reason: 'standby_auto_assign',
          message: `${heldBy} 시간 초과 → ${nextUser}에게 자동 배정`,
        });

        const holdDuration = await getCurrentHoldDuration();
        try {
          const eventId = seatId.split(':')[0] || '';
          await createAllocation(nextUser, seatId, eventId, holdDuration);
          await markExpired(heldBy, seatId);
        } catch (allocErr) {
          console.error('[Timer] cancel_allocation 기록 실패:', allocErr.message);
        }

        await syncToMariaDB(
          `UPDATE seats SET status = 'HELD', held_by = ?, held_at = NOW() WHERE seat_id = ?`,
          [nextUser, seatId],
          `timer:reassign ${seatId}→${nextUser}`,
        );

        console.log(`[Timer] ${heldBy} 시간 초과 → ${nextUser}에게 바로 배정 (${seatId} held)`);

      } else {
        await redis.hset(seatKey, {
          status: 'AVAILABLE',
          heldBy: '',
          heldAt: '',
        });
        await publishSeatEvent(EVENT_TYPE.RELEASED, { seatId, userId: heldBy });

        await syncToMariaDB(
          `UPDATE seats SET status = 'AVAILABLE', held_by = '', held_at = NULL WHERE seat_id = ?`,
          [seatId],
          `timer:release ${seatId}`,
        );

        console.log(`[Timer] standby 없음 — ${seatId} → available 복구`);
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
