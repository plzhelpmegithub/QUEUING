const redis = require('../config/redis');
const pool = require('../config/mariadb');
const { acquireLock, releaseLock } = require('./lockService');
const { startTimer, cancelTimer, getRemaining } = require('./timerService');
const { publishSeatEvent, EVENT_TYPE } = require('./eventService');
const { saveReservation, cancelReservation } = require('./dbService');
const { syncToMariaDB } = require('./syncRetryService');
const { normalizeSessionContext, getScopedKey, sessionFromSeat } = require('./sessionContext');
const queueService = require('./queueService');

const SEAT_PREFIX = 'seat:';
const ADMITTED_KEY = 'queue:admitted';
const SOLD_OUT_KEY = 'event:sold-out';
const EVENT_KEY = 'event:info';
const EVENT_LIST_KEY = 'events:list';

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
    `INSERT IGNORE INTO events (event_id, event_name, event_date, sessions, venue, total_seats, seating_type, sections, status, emoji, color, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [eventId, e.eventName || '', e.eventDate || '', JSON.stringify(e.sessions || []), e.venue || '', e.totalSeats || 0, e.seatingType || 'arena', JSON.stringify(e.sections || []), e.status || 'open', e.emoji || '', e.color || ''],
  );
  console.log(`[Seat] MariaDB events 테이블에 ${eventId} 자동 동기화 완료`);
}

const STATUS = {
  AVAILABLE: 'AVAILABLE',
  HELD: 'HELD',
  SOLD: 'SOLD',
  CANCELLED: 'CANCELLED',
};

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

  const values = seatIds.map(id => [id, eventId, sessionContext.sessionDate, sessionContext.sessionTime, section, price, 'AVAILABLE', '', null]);
  const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
  const flat = values.flat();
  await syncToMariaDB(
    `INSERT IGNORE INTO seats (seat_id, event_id, session_date, session_time, section, price, status, held_by, held_at) VALUES ${placeholders}`,
    flat,
    `seat:init ${eventId}:${section} (${seatIds.length}석)`,
  );

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
    await publishSeatEvent(EVENT_TYPE.HELD, { seatId, userId });

    await syncToMariaDB(
      `UPDATE seats SET status = 'HELD', held_by = ?, held_at = NOW() WHERE seat_id = ?`,
      [userId, seatId],
      `seat:hold ${seatId}`,
    );

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

  const next = await queueService.getNextStandby(sessionContext);
  if (next.userId) {
    const nextUser = next.userId;
    const promoted = await queueService.promoteStandby(nextUser, sessionContext);
    if (!promoted.success) {
      return { success: false, reason: 'standby_promote_failed', message: promoted.message };
    }
    await redis.hset(seatKey, { status: STATUS.HELD, heldBy: nextUser, heldAt: Date.now().toString() });
    await startTimer(seatId, nextUser);
    await publishSeatEvent(EVENT_TYPE.HELD, {
      seatId,
      userId: nextUser,
      reason: 'standby_auto_assign',
      message: `${userId} 선점 해제 → ${nextUser}에게 자동 배정`,
    });
    return {
      success: true,
      seatId,
      status: STATUS.HELD,
      reassignedTo: nextUser,
      message: '선점을 해제했고, 대기 중이던 다음 사용자에게 배정되었습니다.',
    };
  }

  await redis.hset(seatKey, { status: STATUS.AVAILABLE, heldBy: '', heldAt: '' });
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

async function getAllSeats(eventId, context = {}) {
  if (!eventId) {
    const info = await redis.hgetall(EVENT_KEY);
    eventId = info && info.eventId ? info.eventId : null;
  }

  const pattern = eventId
    ? `${SEAT_PREFIX}${eventId}:*`
    : `${SEAT_PREFIX}*`;

  const keys = [];
  let cursor = '0';
  do {
    const [nextCursor, results] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    keys.push(...results);
  } while (cursor !== '0');

  if (keys.length === 0) return [];

  const pipeline = redis.pipeline();
  for (const key of keys) {
    pipeline.hgetall(key);
  }
  const results = await pipeline.exec();

  const seats = keys.map((key, i) => ({
    seatId: key.replace(SEAT_PREFIX, ''),
    ...results[i][1],
  }));

  const hasRequestedSession = Boolean(context.sessionDate || context.date || context.sessionTime || context.time);
  if (!hasRequestedSession) return seats;
  const requested = normalizeSessionContext({ eventId, ...context });
  const filtered = seats.filter((seat) => (
    (seat.sessionDate || '') === requested.sessionDate
    && (seat.sessionTime || '') === requested.sessionTime
  ));
  // 기존 공연은 회차 컬럼 없이 공연 전체에 하나의 좌석 목록만 사용했다.
  return filtered.length > 0 ? filtered : seats.filter((seat) => !seat.sessionDate && !seat.sessionTime);
}

async function cleanupEventSeats(eventId) {
  if (!eventId) return { deleted: 0 };

  let deleted = 0;
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${SEAT_PREFIX}${eventId}:*`, 'COUNT', 200);
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
      deleted += keys.length;
    }
  } while (cursor !== '0');

  console.log(`[Seat] cleanup — ${eventId} 좌석 키 ${deleted}개 삭제`);
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
  await cancelTimer(seatId);
  await publishSeatEvent(EVENT_TYPE.SOLD, { seatId, userId });

  const { revokeToken } = require('./tokenService');
  await revokeToken(userId, sessionContext);

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
  const seatInfo = await redis.hgetall(seatKey);
  const status = seatInfo.status;
  const heldBy = seatInfo.heldBy;
  const sessionContext = sessionFromSeat(seatId, seatInfo);

  if (status !== STATUS.SOLD) {
    return { success: false, reason: 'not_sold', message: '판매 완료 상태가 아닌 좌석입니다.' };
  }
  if (heldBy && heldBy !== userId) {
    return { success: false, reason: 'not_owner', message: '본인이 구매한 좌석이 아닙니다.' };
  }

  await redis.hset(seatKey, {
    status: STATUS.AVAILABLE,
    heldBy: '',
    heldAt: '',
  });

  await redis.del(getScopedKey(SOLD_OUT_KEY, sessionContext));
  await redis.del(getScopedKey('event:ticketing-status', sessionContext));
  await publishSeatEvent(EVENT_TYPE.CANCELLED, { seatId, userId });
  await cancelReservation(seatId, userId);

  await syncToMariaDB(
    `UPDATE seats SET status = 'AVAILABLE', held_by = '', held_at = NULL WHERE seat_id = ?`,
    [seatId],
    `seat:cancel ${seatId}`,
  );

  return {
    success: true,
    seatId,
    status: STATUS.AVAILABLE,
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

async function getAvailableCount(eventId, context = {}) {
  const allSeats = await getAllSeats(eventId, context);
  const available = allSeats.filter(s => s.status === STATUS.AVAILABLE);
  const held = allSeats.filter(s => s.status === STATUS.HELD);
  const sold = allSeats.filter(s => s.status === STATUS.SOLD);
  return {
    total: allSeats.length,
    available: available.length,
    held: held.length,
    sold: sold.length,
  };
}

async function recoverSeatsFromMariaDB(eventId, options = {}) {
  if (!eventId) return { recovered: false, message: 'eventId 필요' };

  const rows = await pool.query(
    'SELECT seat_id, status, held_by, held_at, section, price, session_date, session_time FROM seats WHERE event_id = ?',
    [eventId],
  );
  if (rows.length === 0) return { recovered: false, message: 'MariaDB에 좌석 데이터 없음' };

  const existingKeys = [];
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${SEAT_PREFIX}${eventId}:*`, 'COUNT', 200);
    cursor = nextCursor;
    existingKeys.push(...keys);
  } while (cursor !== '0');

  const force = Boolean(options.force);
  if (!force && existingKeys.length >= rows.length) {
    return { recovered: false, message: 'Redis에 좌석 데이터가 이미 충분합니다', existing: existingKeys.length, expected: rows.length };
  }

  const pipeline = redis.pipeline();
  let available = 0, held = 0, sold = 0;
  const sessionStats = new Map();
  for (const row of rows) {
    const key = `${SEAT_PREFIX}${row.seat_id}`;
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
    const stats = sessionStats.get(sessionKey) || { date: row.session_date || '', time: row.session_time || '', available: 0, held: 0 };
    if (status === STATUS.AVAILABLE) stats.available++;
    else if (status === STATUS.HELD) stats.held++;
    sessionStats.set(sessionKey, stats);
  }
  await pipeline.exec();

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

  console.log(`[Seat Recovery] ${eventId}: ${rows.length}석 복구 (available=${available}, held=${held}, sold=${sold})`);
  return { recovered: true, total: rows.length, available, held, sold, existing: existingKeys.length };
}

module.exports = { initSeats, holdSeat, confirmSeat, cancelSeat, releaseSeat, getSeatTimer, getAllSeats, isSoldOut, getAvailableCount, cleanupEventSeats, recoverSeatsFromMariaDB, STATUS };
