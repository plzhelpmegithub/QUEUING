const redis = require('../config/redis');
const pool = require('../config/mariadb');
const { acquireLock, releaseLock } = require('./lockService');
const { startTimer, cancelTimer, getRemaining } = require('./timerService');
const { publishSeatEvent, EVENT_TYPE } = require('./eventService');
const { publishCancellationEvent } = require('./cancellationEventPublisher');
const { SEAT_METRICS_KEY } = require('./metricsService');
const { saveReservation, cancelReservation } = require('./dbService');
const { syncToMariaDB } = require('./syncRetryService');
const { normalizeSessionContext, getScopedKey, sessionFromSeat } = require('./sessionContext');
const queueService = require('./queueService');
const bCallback = require('./bPartCallbackService');

const SEAT_PREFIX = 'seat:';
const SEAT_INDEX_PREFIX = 'seat:index:';
const ADMITTED_KEY = 'queue:admitted';
const SOLD_OUT_KEY = 'event:sold-out';
const EVENT_KEY = 'event:info';
const EVENT_LIST_KEY = 'events:list';

const SEATS_CACHE_TTL = 1500;
const seatsCache = new Map();

function invalidateSeatsCache(eventId) {
  if (eventId) {
    seatsCache.delete(eventId);
  } else {
    seatsCache.clear();
  }
}

function seatIndexKey(eventId) {
  return `${SEAT_INDEX_PREFIX}${eventId}`;
}

async function ensureEventInMariaDB(eventId) {
  if (!eventId) return;
  const rows = await pool.query('SELECT event_id FROM events WHERE event_id = ?', [eventId]);
  if (rows.length > 0) return;
  const cardStr = await redis.hget(EVENT_LIST_KEY, eventId);
  if (!cardStr) {
    console.warn(`[Seat] Redis에 이벤트 ${eventId} 없음 — events 테이블 동기화 건너뜀`);
    return;
  }
  const e = JSON.parse(cardStr);
  await pool.query(
    `INSERT IGNORE INTO events (event_id, event_name, title, event_date, venue, total_seats, seating_type, sections, status, emoji, color, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [eventId, e.eventName || '', e.eventName || '', e.eventDate || '', e.venue || '', e.totalSeats || 0, e.seatingType || 'arena', JSON.stringify(e.sections || []), e.status || 'open', e.emoji || '', e.color || ''],
  );
  console.log(`[Seat] MariaDB events 테이블에 ${eventId} 자동 동기화 완료`);
}

const STATUS = {
  AVAILABLE: 'AVAILABLE',
  HELD: 'HELD',
  SOLD: 'SOLD',
  CANCELLED: 'CANCELLED',
};

function seatCounterKey(eventId, context = {}) {
  const n = normalizeSessionContext({ eventId, ...context });
  return `seat:counter:${eventId}:${n.sessionDate}:${n.sessionTime}`;
}

async function adjustSeatCounter(eventId, context, from, to) {
  const key = seatCounterKey(eventId, context);
  const exists = await redis.exists(key);
  if (!exists) return;
  const pipe = redis.pipeline();
  if (from) {
    pipe.hincrby(key, from, -1);
    pipe.hincrby(SEAT_METRICS_KEY, from, -1);
  }
  if (to) {
    pipe.hincrby(key, to, 1);
    pipe.hincrby(SEAT_METRICS_KEY, to, 1);
  }
  await pipe.exec();
}

async function initSeats(seatIds, section = '', price = 0, session = {}) {
  const eventId = seatIds[0]?.split(':')[0] || '';
  const sessionContext = normalizeSessionContext({ eventId, ...session });
  const pipeline = redis.pipeline();
  for (const id of seatIds) {
    const key = `${SEAT_PREFIX}${id}`;
    pipeline.hset(key, {
      status: STATUS.AVAILABLE,
      heldBy: '',
      heldAt: '',
      section: section,
      price: price.toString(),
      eventId,
      sessionDate: sessionContext.sessionDate,
      sessionTime: sessionContext.sessionTime,
    });
  }
  await pipeline.exec();

  const seatKeys = seatIds.map(id => `${SEAT_PREFIX}${id}`);
  if (eventId) {
    await redis.sadd(seatIndexKey(eventId), ...seatKeys);
  }

  const cKey = seatCounterKey(eventId, sessionContext);
  const counterPipeline = redis.pipeline();
  counterPipeline.hincrby(cKey, 'total', seatIds.length);
  counterPipeline.hincrby(cKey, 'available', seatIds.length);
  counterPipeline.hincrby(SEAT_METRICS_KEY, 'total', seatIds.length);
  counterPipeline.hincrby(SEAT_METRICS_KEY, 'available', seatIds.length);
  await counterPipeline.exec();

  const values = seatIds.map(id => [id, eventId, sessionContext.sessionDate, sessionContext.sessionTime, section, price, 'AVAILABLE', '', null]);
  const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
  const flat = values.flat();
  await syncToMariaDB(
    `INSERT IGNORE INTO seats (seat_id, event_id, session_date, session_time, section, price, status, held_by, held_at) VALUES ${placeholders}`,
    flat,
    `seat:init ${eventId}:${section} (${seatIds.length}석)`,
  );

  invalidateSeatsCache(eventId);
  return { initialized: seatIds.length, section, price, seats: seatIds };
}

async function holdSeat(userId, seatId, admissionToken, requestedContext = {}) {
  const { verifyToken } = require('./tokenService');
  const seatKey = `${SEAT_PREFIX}${seatId}`;
  const seatInfo = await redis.hgetall(seatKey);
  const inferredContext = sessionFromSeat(seatId, seatInfo);
  const sessionContext = seatInfo.sessionDate || seatInfo.sessionTime
    ? inferredContext
    : normalizeSessionContext({ eventId: inferredContext.eventId, ...requestedContext });

  const tokenResult = await verifyToken(admissionToken, userId, sessionContext);
  if (!tokenResult.valid) {
    return { success: false, reason: tokenResult.reason, message: tokenResult.message };
  }

  const isAdmitted = await queueService.isUserAdmitted(userId, sessionContext);
  if (!isAdmitted) {
    return { success: false, reason: 'not_admitted', message: '입장이 허용되지 않은 사용자입니다.' };
  }

  // 분산 락 획득 — 같은 좌석에 동시 요청 시 1명만 통과
  const lock = await acquireLock(seatId);
  if (!lock.acquired) {
    return { success: false, reason: 'lock_failed', message: '다른 사용자가 처리 중입니다. 잠시 후 다시 시도해주세요.' };
  }

  try {
    const status = await redis.hget(seatKey, 'status');

    if (!status) {
      return { success: false, reason: 'not_found', message: '존재하지 않는 좌석입니다.' };
    }

    if (status !== STATUS.AVAILABLE) {
      return { success: false, reason: 'unavailable', message: `이미 ${status} 상태인 좌석입니다.` };
    }

    await redis.hset(seatKey, {
      status: STATUS.HELD,
      heldBy: userId,
      heldAt: Date.now().toString(),
    });
    await startTimer(seatId, userId);
    await queueService.cancelAdmissionDeadline(userId, sessionContext);
    await publishSeatEvent(EVENT_TYPE.HELD, { seatId, userId });

    await syncToMariaDB(
      `UPDATE seats SET status = 'HELD', held_by = ?, held_at = NOW() WHERE seat_id = ?`,
      [userId, seatId],
      `seat:hold ${seatId}`,
    );

    await adjustSeatCounter(sessionContext.eventId, sessionContext, 'available', 'held');
    invalidateSeatsCache(sessionContext.eventId);

    return {
      success: true,
      seatId,
      status: STATUS.HELD,
      message: '좌석이 선점되었습니다. 10분 내에 결제를 완료해주세요.',
    };
  } finally {
    // 락 해제 — 성공이든 실패든 반드시 해제 (데드락 방지)
    await releaseLock(seatId, lock.token);
  }
}

async function releaseSeat(userId, seatId) {
  const seatKey = `${SEAT_PREFIX}${seatId}`;
  const seatInfo = await redis.hgetall(seatKey);
  const status = seatInfo.status;
  const heldBy = seatInfo.heldBy;
  const sessionContext = sessionFromSeat(seatId, seatInfo);

  if (status !== STATUS.HELD) {
    return { success: false, reason: 'not_held', message: '선점 상태가 아닌 좌석입니다.' };
  }
  if (heldBy !== userId) {
    return { success: false, reason: 'not_owner', message: '본인이 선점한 좌석이 아닙니다.' };
  }

  await cancelTimer(seatId);

  await redis.hset(seatKey, { status: STATUS.AVAILABLE, heldBy: '', heldAt: '' });
  await adjustSeatCounter(sessionContext.eventId, sessionContext, 'held', 'available');
  invalidateSeatsCache(sessionContext.eventId);
  await publishSeatEvent(EVENT_TYPE.RELEASED, { seatId, userId });

  await syncToMariaDB(
    `UPDATE seats SET status = 'AVAILABLE', held_by = '', held_at = NULL WHERE seat_id = ?`,
    [seatId],
    `seat:release ${seatId}`,
  );

  return {
    success: true,
    seatId,
    status: STATUS.AVAILABLE,
    message: '좌석 선점이 해제되었습니다.',
  };
}

async function fetchAllSeats(eventId) {
  let keys;
  if (eventId) {
    keys = await redis.smembers(seatIndexKey(eventId));
  } else {
    keys = [];
    let cursor = '0';
    do {
      const [nextCursor, results] = await redis.scan(cursor, 'MATCH', `${SEAT_PREFIX}*`, 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...results);
    } while (cursor !== '0');
  }

  if (keys.length === 0) return [];

  const FIELDS = ['status', 'heldBy', 'heldAt', 'section', 'price', 'sessionDate', 'sessionTime'];
  const pipeline = redis.pipeline();
  for (const key of keys) {
    pipeline.hmget(key, ...FIELDS);
  }
  const results = await pipeline.exec();

  return keys.map((key, i) => {
    const vals = results[i][1];
    return {
      seatId: key.replace(SEAT_PREFIX, ''),
      status: vals[0] || '',
      heldBy: vals[1] || '',
      heldAt: vals[2] || '',
      section: vals[3] || '',
      price: vals[4] || '',
      sessionDate: vals[5] || '',
      sessionTime: vals[6] || '',
    };
  });
}

async function getAllSeats(eventId, context = {}) {
  if (!eventId) {
    const info = await redis.hgetall(EVENT_KEY);
    eventId = info && info.eventId ? info.eventId : null;
  }

  const cacheKey = eventId || '__all__';
  let seats;
  const cached = seatsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SEATS_CACHE_TTL) {
    seats = cached.data;
  } else {
    seats = await fetchAllSeats(eventId);
    seatsCache.set(cacheKey, { data: seats, ts: Date.now() });
  }

  const hasRequestedSession = Boolean(context.sessionDate || context.date || context.sessionTime || context.time);
  if (!hasRequestedSession) return seats;
  const requested = normalizeSessionContext({ eventId, ...context });
  const filtered = seats.filter((seat) => (
    (seat.sessionDate || '') === requested.sessionDate
    && (seat.sessionTime || '') === requested.sessionTime
  ));
  return filtered.length > 0 ? filtered : seats.filter((seat) => !seat.sessionDate && !seat.sessionTime);
}

async function cleanupEventSeats(eventId) {
  if (!eventId) return { deleted: 0 };

  const indexKey = seatIndexKey(eventId);
  const keys = await redis.smembers(indexKey);

  let deleted = 0;
  if (keys.length > 0) {
    await redis.del(...keys);
    deleted = keys.length;
  }
  await redis.del(indexKey);

  invalidateSeatsCache(eventId);
  console.log(`[Seat] cleanup — ${eventId} 좌석 키 ${deleted}개 삭제`);

  let counterCursor = '0';
  do {
    const [nextCursor, cKeys] = await redis.scan(counterCursor, 'MATCH', `seat:counter:${eventId}:*`, 'COUNT', 100);
    counterCursor = nextCursor;
    if (cKeys.length > 0) {
      const readPipeline = redis.pipeline();
      cKeys.forEach((key) => readPipeline.hgetall(key));
      const counterResults = await readPipeline.exec();

      const deletePipeline = redis.pipeline();
      cKeys.forEach((key, index) => {
        const counts = counterResults[index]?.[1] || {};
        for (const field of ['total', 'available', 'held', 'sold']) {
          const value = Number(counts[field]) || 0;
          if (value > 0) deletePipeline.hincrby(SEAT_METRICS_KEY, field, -value);
        }
        deletePipeline.del(key);
      });
      await deletePipeline.exec();
    }
  } while (counterCursor !== '0');

  return { deleted };
}

async function confirmSeat(userId, seatId, requestedContext = {}) {
  const seatKey = `${SEAT_PREFIX}${seatId}`;
  const seatInfo = await redis.hgetall(seatKey);
  const status = seatInfo.status;
  const heldBy = seatInfo.heldBy;

  if (status !== STATUS.HELD) {
    return { success: false, reason: 'not_held', message: '선점 상태가 아닌 좌석입니다.' };
  }
  if (heldBy !== userId) {
    return { success: false, reason: 'not_owner', message: '본인이 선점한 좌석이 아닙니다.' };
  }

  // MariaDB에 예매 기록 저장 (Redis 상태 변경보다 먼저 — DB 저장이 실패하면
  // Redis를 롤백할 필요 없이 held 상태가 유지되므로 재시도가 가능)
  const inferredContext = sessionFromSeat(seatId, seatInfo);
  const sessionContext = seatInfo.sessionDate || seatInfo.sessionTime
    ? inferredContext
    : normalizeSessionContext({ eventId: inferredContext.eventId, ...requestedContext });
  const eventId = sessionContext.eventId;
  await ensureEventInMariaDB(eventId);
  await saveReservation({ seatId, userId, eventId, sessionDate: sessionContext.sessionDate, sessionTime: sessionContext.sessionTime });

  await syncToMariaDB(
    `UPDATE seats SET status = 'SOLD' WHERE seat_id = ?`,
    [seatId],
    `seat:confirm ${seatId}`,
  );

  await redis.hset(seatKey, { status: STATUS.SOLD });
  await adjustSeatCounter(sessionContext.eventId, sessionContext, 'held', 'sold');
  invalidateSeatsCache(eventId);
  await cancelTimer(seatId);
  await publishSeatEvent(EVENT_TYPE.SOLD, { seatId, userId });

  const { revokeToken } = require('./tokenService');
  await revokeToken(userId, sessionContext);

  // 예매를 완료한 사용자는 admission 풀에서 빠져야 다음 대기자가
  // 빈 슬롯을 이어받을 수 있다. DB 상태는 만료가 아닌 완료로 남긴다.
  const admissionReleased = await queueService.removeAdmitted(
    userId,
    sessionContext,
    { finalStatus: 'COMPLETED' },
  );
  if (admissionReleased) {
    const resource = `admission:${sessionContext.eventId || 'default'}:${sessionContext.sessionKey}`;
    const admissionLock = await acquireLock(resource);
    if (admissionLock.acquired) {
      try {
        await queueService.backfillOne(sessionContext);
      } finally {
        await releaseLock(resource, admissionLock.token).catch(() => {});
      }
    }
  }

  // 취소표 좌석도 일반 예매와 동일하게 백엔드에서 확정하고,
  // 해당 Secret Link 할당을 RESPONDED로 마감한다. B파트 연동 시
  // 결제 확정 자체가 complete 콜백의 실제 트리거가 된다.
  try {
    const cancelAllocationService = require('./cancelAllocationService');
    const allocation = await cancelAllocationService.getActiveAllocation(userId, eventId);
    if (allocation) {
      const payload = { userId, eventId, seatId, allocationId: allocation.id };
      if (bCallback.isConfigured()) {
        try {
          await bCallback.callbackComplete(payload);
        } catch (err) {
          console.error('[CancelAlloc] B callback /complete 실패 → 재시도 큐 저장:', err.message);
          await bCallback.saveCallbackToOutbox('complete', payload, err.message);
        }
      }

      const result = await cancelAllocationService.markRespondedById(allocation.id, seatId);
      if (!result.affected && !result.idempotent) {
        console.error('[CancelAlloc] 예매 확정 상태 반영 실패:', result.reason || 'unknown');
      }
    }
  } catch (err) {
    console.error('[CancelAlloc] 예매 확정 상태 반영 실패:', err.message);
  }

  const allSeats = await getAllSeats(eventId, sessionContext);
  const remaining = allSeats.filter(s => s.status === STATUS.AVAILABLE || s.status === STATUS.HELD);
  if (remaining.length === 0) {
    await redis.set(getScopedKey(SOLD_OUT_KEY, sessionContext), '1');

    await redis.set(getScopedKey('event:ticketing-status', sessionContext), 'sold_out');
    console.log('[Ticketing] 전석 매진 → sold_out (standby 대기 접수 계속 가능)');

    await publishSeatEvent(EVENT_TYPE.SOLD_OUT, {
      seatId: 'ALL',
      message: '전석 매진 — 취소표 대기는 계속 가능합니다.',
      totalSold: allSeats.filter(s => s.status === STATUS.SOLD).length,
    });
  }

  return {
    success: true,
    seatId,
    status: STATUS.SOLD,
    message: '결제가 완료되었습니다. (DB 저장 완료)',
  };
}

async function getSeatTimer(seatId) {
  const remaining = await getRemaining(seatId);
  return { seatId, remainingSeconds: remaining };
}

async function cancelSeat(userId, seatId) {
  const seatKey = `${SEAT_PREFIX}${seatId}`;
  const cancelResult = await cancelReservation(seatId, userId);

  if (!cancelResult.affected) {
    if (cancelResult.idempotent) {
      return {
        success: true,
        idempotent: true,
        seatId,
        status: STATUS.AVAILABLE,
        message: '이미 취소 및 환불 처리된 예약입니다.',
      };
    }
    const notOwner = cancelResult.reason === 'not_owner';
    return {
      success: false,
      reason: cancelResult.reason || 'not_reserved',
      message: notOwner
        ? '본인이 구매한 좌석이 아닙니다.'
        : '취소 가능한 확정 예약을 찾을 수 없습니다.',
    };
  }

  const reservation = cancelResult.reservation || {};
  const durableSeat = cancelResult.seat || {};
  const inferredContext = sessionFromSeat(seatId, {});
  const sessionContext = normalizeSessionContext({
    eventId: reservation.eventId || durableSeat.eventId || inferredContext.eventId,
    sessionDate: reservation.sessionDate || durableSeat.sessionDate || inferredContext.sessionDate,
    sessionTime: reservation.sessionTime || durableSeat.sessionTime || inferredContext.sessionTime,
  });

  // MariaDB 트랜잭션이 이미 성공했으므로 Redis는 실시간 조회용 캐시로
  // 동기화한다. Redis가 일시적으로 실패해도 환불 자체는 성공 상태를
  // 유지하며, 이후 MariaDB 기반 복구가 좌석 상태를 재구성한다.
  let redisSynced = true;
  try {
    const seatInfo = await redis.hgetall(seatKey);
    const redisSeatExists = Object.keys(seatInfo).length > 0;
    if (redisSeatExists) {
      await redis.hset(seatKey, {
        status: STATUS.AVAILABLE,
        heldBy: '',
        heldAt: '',
      });
    } else if (durableSeat.eventId) {
      await redis.hset(seatKey, {
        status: STATUS.AVAILABLE,
        heldBy: '',
        heldAt: '',
        section: durableSeat.section || '',
        price: String(durableSeat.price || 0),
        eventId: durableSeat.eventId,
        sessionDate: durableSeat.sessionDate || '',
        sessionTime: durableSeat.sessionTime || '',
      });
      await redis.sadd(seatIndexKey(durableSeat.eventId), seatKey);
    }

    const previousStatus = seatInfo.status || durableSeat.previousStatus;
    if (previousStatus === STATUS.SOLD) {
      await adjustSeatCounter(sessionContext.eventId, sessionContext, 'sold', 'available');
    }
    await redis.del(getScopedKey(SOLD_OUT_KEY, sessionContext));
    await redis.del(getScopedKey('event:ticketing-status', sessionContext));
    await publishSeatEvent(EVENT_TYPE.CANCELLED, { seatId, userId });
  } catch (err) {
    redisSynced = false;
    console.error(`[Seat] 환불 후 Redis 동기화 실패 (${seatId}):`, err.message);
  }
  invalidateSeatsCache(sessionContext.eventId);

  let cancellationEvent = null;
  try {
    cancellationEvent = await publishCancellationEvent({
      eventId: sessionContext.eventId,
      seatId,
      userId,
      reservationId: cancelResult.reservationId || null,
      status: 'CANCELLED',
      sessionDate: sessionContext.sessionDate,
      sessionTime: sessionContext.sessionTime,
      reason: 'reservation_cancelled',
    });
  } catch (err) {
    console.error('[CancellationEvent] 취소 이벤트 SQS 발행 실패:', err.message);
  }

  return {
    success: true,
    idempotent: false,
    seatId,
    status: STATUS.AVAILABLE,
    redisSynced,
    cancellationEvent,
    message: '좌석이 취소되었습니다. 취소표 대기자에게 기회가 부여됩니다.',
  };
}

async function isSoldOut(context = {}) {
  const flag = await redis.get(getScopedKey(SOLD_OUT_KEY, context));
  const soldOut = flag === '1';
  return {
    soldOut,
    message: soldOut
      ? '전석 예매 완료되었습니다. 취소표 대기를 원하시면 대기열에 남아주세요.'
      : '아직 예매 가능한 좌석이 있습니다.',
  };
}

async function reconcileSeatCounters(eventId, context = {}) {
  const allSeats = await getAllSeats(eventId, context);
  const counts = { total: 0, available: 0, held: 0, sold: 0 };
  for (const s of allSeats) {
    counts.total++;
    if (s.status === STATUS.AVAILABLE) counts.available++;
    else if (s.status === STATUS.HELD) counts.held++;
    else if (s.status === STATUS.SOLD) counts.sold++;
  }
  if (eventId) {
    const key = seatCounterKey(eventId, context);
    const previous = await redis.hgetall(key);
    const pipeline = redis.pipeline();
    pipeline.hset(key, counts);
    for (const field of ['total', 'available', 'held', 'sold']) {
      const delta = counts[field] - (Number(previous[field]) || 0);
      if (delta !== 0) pipeline.hincrby(SEAT_METRICS_KEY, field, delta);
    }
    await pipeline.exec();
  }
  console.log(`[SeatCounter] reconcile ${eventId}: total=${counts.total} avail=${counts.available} held=${counts.held} sold=${counts.sold}`);
  return counts;
}

async function getAvailableCount(eventId, context = {}) {
  if (!eventId) {
    const info = await redis.hgetall(EVENT_KEY);
    eventId = info && info.eventId ? info.eventId : null;
  }
  if (eventId) {
    const key = seatCounterKey(eventId, context);
    const counter = await redis.hgetall(key);
    if (counter && counter.total !== undefined) {
      return {
        total: Number(counter.total),
        available: Math.max(0, Number(counter.available) || 0),
        held: Math.max(0, Number(counter.held) || 0),
        sold: Math.max(0, Number(counter.sold) || 0),
      };
    }
  }
  return reconcileSeatCounters(eventId, context);
}

async function recoverSeatsFromMariaDB(eventId, options = {}) {
  if (!eventId) return { recovered: false, message: 'eventId 필요' };

  const rows = await pool.query(
    'SELECT seat_id, status, held_by, held_at, section, price, session_date, session_time FROM seats WHERE event_id = ?',
    [eventId],
  );
  if (rows.length === 0) return { recovered: false, message: 'MariaDB에 좌석 데이터 없음' };

  const existingKeys = await redis.smembers(seatIndexKey(eventId));

  const force = Boolean(options.force);
  if (!force && existingKeys.length >= rows.length) {
    return { recovered: false, message: 'Redis에 좌석 데이터가 이미 충분합니다', existing: existingKeys.length, expected: rows.length };
  }

  const pipeline = redis.pipeline();
  const recoveredKeys = [];
  let available = 0, held = 0, sold = 0;
  const sessionStats = new Map();
  for (const row of rows) {
    const key = `${SEAT_PREFIX}${row.seat_id}`;
    recoveredKeys.push(key);
    const status = row.status || STATUS.AVAILABLE;
    pipeline.hset(key, {
      status,
      heldBy: row.held_by || '',
      heldAt: row.held_at ? new Date(row.held_at).getTime().toString() : '',
      section: row.section || '',
      price: (row.price || 0).toString(),
      eventId,
      sessionDate: row.session_date || '',
      sessionTime: row.session_time || '',
    });
    if (status === STATUS.AVAILABLE) available++;
    else if (status === STATUS.HELD) held++;
    else if (status === STATUS.SOLD) sold++;
    const sessionKey = `${row.session_date || ''}|${row.session_time || ''}`;
    const stats = sessionStats.get(sessionKey) || { date: row.session_date || '', time: row.session_time || '', total: 0, available: 0, held: 0, sold: 0 };
    stats.total++;
    if (status === STATUS.AVAILABLE) stats.available++;
    else if (status === STATUS.HELD) stats.held++;
    else if (status === STATUS.SOLD) stats.sold++;
    sessionStats.set(sessionKey, stats);
  }
  await pipeline.exec();

  const indexKey = seatIndexKey(eventId);
  await redis.del(indexKey);
  if (recoveredKeys.length > 0) {
    await redis.sadd(indexKey, ...recoveredKeys);
  }

  for (const stats of sessionStats.values()) {
    const cKey = seatCounterKey(eventId, { sessionDate: stats.date, sessionTime: stats.time });
    const previous = await redis.hgetall(cKey);
    const counterPipeline = redis.pipeline();
    counterPipeline.hset(cKey, {
      total: stats.total,
      available: stats.available,
      held: stats.held,
      sold: stats.sold,
    });
    for (const field of ['total', 'available', 'held', 'sold']) {
      const delta = stats[field] - (Number(previous[field]) || 0);
      if (delta !== 0) counterPipeline.hincrby(SEAT_METRICS_KEY, field, delta);
    }
    await counterPipeline.exec();
  }

  for (const stats of sessionStats.values()) {
    if (stats.available === 0 && stats.held === 0) {
      await redis.set(getScopedKey(SOLD_OUT_KEY, {
        eventId,
        sessionDate: stats.date,
        sessionTime: stats.time,
      }), '1');
      await redis.set(getScopedKey('event:ticketing-status', {
        eventId,
        sessionDate: stats.date,
        sessionTime: stats.time,
      }), 'sold_out');
    }
  }

  invalidateSeatsCache(eventId);
  console.log(`[Seat Recovery] ${eventId}: ${rows.length}석 복구 (available=${available}, held=${held}, sold=${sold})`);
  return { recovered: true, total: rows.length, available, held, sold, existing: existingKeys.length };
}

module.exports = { initSeats, holdSeat, confirmSeat, cancelSeat, releaseSeat, getSeatTimer, getAllSeats, isSoldOut, getAvailableCount, cleanupEventSeats, recoverSeatsFromMariaDB, reconcileSeatCounters, STATUS };
