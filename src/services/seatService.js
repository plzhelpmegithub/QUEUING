const redis = require('../config/redis');
const pool = require('../config/mariadb');
const { acquireLock, releaseLock } = require('./lockService');
const { startTimer, cancelTimer, getRemaining } = require('./timerService');
const { publishSeatEvent, EVENT_TYPE } = require('./eventService');
const { saveReservation, cancelReservation } = require('./dbService');
const { syncToMariaDB } = require('./syncRetryService');

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
    `INSERT IGNORE INTO events (event_id, event_name, event_date, venue, total_seats, seating_type, sections, status, emoji, color, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [eventId, e.eventName || '', e.eventDate || '', e.venue || '', e.totalSeats || 0, e.seatingType || 'arena', JSON.stringify(e.sections || []), e.status || 'open', e.emoji || '', e.color || ''],
  );
  console.log(`[Seat] MariaDB events 테이블에 ${eventId} 자동 동기화 완료`);
}

const STATUS = {
  AVAILABLE: 'AVAILABLE',
  HELD: 'HELD',
  SOLD: 'SOLD',
  CANCELLED: 'CANCELLED',
};

async function initSeats(seatIds, section = '', price = 0) {
  const pipeline = redis.pipeline();
  for (const id of seatIds) {
    const key = `${SEAT_PREFIX}${id}`;
    pipeline.hset(key, {
      status: STATUS.AVAILABLE,
      heldBy: '',
      heldAt: '',
      section: section,
      price: price.toString(),
    });
  }
  await pipeline.exec();

  const eventId = seatIds[0]?.split(':')[0] || '';
  const values = seatIds.map(id => [id, eventId, section, price, 'AVAILABLE', '', null]);
  const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
  const flat = values.flat();
  await syncToMariaDB(
    `INSERT IGNORE INTO seats (seat_id, event_id, section, price, status, held_by, held_at) VALUES ${placeholders}`,
    flat,
    `seat:init ${eventId}:${section} (${seatIds.length}석)`,
  );

  return { initialized: seatIds.length, section, price, seats: seatIds };
}

async function holdSeat(userId, seatId, admissionToken) {
  const { verifyToken } = require('./tokenService');

  const tokenResult = await verifyToken(admissionToken, userId);
  if (!tokenResult.valid) {
    return { success: false, reason: tokenResult.reason, message: tokenResult.message };
  }

  const isAdmitted = await redis.sismember(ADMITTED_KEY, userId);
  if (!isAdmitted) {
    return { success: false, reason: 'not_admitted', message: '입장이 허용되지 않은 사용자입니다.' };
  }

  // 분산 락 획득 — 같은 좌석에 동시 요청 시 1명만 통과
  const lock = await acquireLock(seatId);
  if (!lock.acquired) {
    return { success: false, reason: 'lock_failed', message: '다른 사용자가 처리 중입니다. 잠시 후 다시 시도해주세요.' };
  }

  try {
    const seatKey = `${SEAT_PREFIX}${seatId}`;
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
  const [status, heldBy] = await Promise.all([
    redis.hget(seatKey, 'status'),
    redis.hget(seatKey, 'heldBy'),
  ]);

  if (status !== STATUS.HELD) {
    return { success: false, reason: 'not_held', message: '선점 상태가 아닌 좌석입니다.' };
  }
  if (heldBy !== userId) {
    return { success: false, reason: 'not_owner', message: '본인이 선점한 좌석이 아닙니다.' };
  }

  await cancelTimer(seatId);

  const nextUsers = await redis.zrange('queue:standby', 0, 0);
  if (nextUsers.length > 0) {
    const nextUser = nextUsers[0];
    await redis.zrem('queue:standby', nextUser);
    await redis.sadd(ADMITTED_KEY, nextUser);
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

async function getAllSeats(eventId) {
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

  return keys.map((key, i) => ({
    seatId: key.replace(SEAT_PREFIX, ''),
    ...results[i][1],
  }));
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

async function confirmSeat(userId, seatId) {
  const seatKey = `${SEAT_PREFIX}${seatId}`;
  const [status, heldBy] = await Promise.all([
    redis.hget(seatKey, 'status'),
    redis.hget(seatKey, 'heldBy'),
  ]);

  if (status !== STATUS.HELD) {
    return { success: false, reason: 'not_held', message: '선점 상태가 아닌 좌석입니다.' };
  }
  if (heldBy !== userId) {
    return { success: false, reason: 'not_owner', message: '본인이 선점한 좌석이 아닙니다.' };
  }

  // MariaDB에 예매 기록 저장 (Redis 상태 변경보다 먼저 — DB 저장이 실패하면
  // Redis를 롤백할 필요 없이 held 상태가 유지되므로 재시도가 가능)
  const eventId = seatId.split(':')[0] || '';
  await ensureEventInMariaDB(eventId);
  await saveReservation({ seatId, userId, eventId });

  await syncToMariaDB(
    `UPDATE seats SET status = 'SOLD' WHERE seat_id = ?`,
    [seatId],
    `seat:confirm ${seatId}`,
  );

  await redis.hset(seatKey, { status: STATUS.SOLD });
  await cancelTimer(seatId);
  await publishSeatEvent(EVENT_TYPE.SOLD, { seatId, userId });

  const { revokeToken } = require('./tokenService');
  await revokeToken(userId);

  const allSeats = await getAllSeats(eventId);
  const remaining = allSeats.filter(s => s.status === STATUS.AVAILABLE || s.status === STATUS.HELD);
  if (remaining.length === 0) {
    await redis.set(SOLD_OUT_KEY, '1');

    await redis.set('event:ticketing-status', 'sold_out');
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
  const [status, heldBy] = await Promise.all([
    redis.hget(seatKey, 'status'),
    redis.hget(seatKey, 'heldBy'),
  ]);

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

  await redis.del(SOLD_OUT_KEY);
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

async function isSoldOut() {
  const flag = await redis.get(SOLD_OUT_KEY);
  const soldOut = flag === '1';
  return {
    soldOut,
    message: soldOut
      ? '전석 예매 완료되었습니다. 취소표 대기를 원하시면 대기열에 남아주세요.'
      : '아직 예매 가능한 좌석이 있습니다.',
  };
}

async function getAvailableCount() {
  const allSeats = await getAllSeats();
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

async function recoverSeatsFromMariaDB(eventId) {
  if (!eventId) return { recovered: false, message: 'eventId 필요' };

  const [firstKey] = await redis.scan(0, 'MATCH', `${SEAT_PREFIX}${eventId}:*`, 'COUNT', 1);
  const checkKeys = (await redis.scan(0, 'MATCH', `${SEAT_PREFIX}${eventId}:*`, 'COUNT', 10))[1];
  if (checkKeys.length > 0) {
    return { recovered: false, message: 'Redis에 이미 좌석 데이터가 있습니다', existing: checkKeys.length };
  }

  const rows = await pool.query(
    'SELECT seat_id, status, held_by, held_at, section, price FROM seats WHERE event_id = ?',
    [eventId],
  );
  if (rows.length === 0) return { recovered: false, message: 'MariaDB에 좌석 데이터 없음' };

  const pipeline = redis.pipeline();
  let available = 0, held = 0, sold = 0;
  for (const row of rows) {
    const key = `${SEAT_PREFIX}${row.seat_id}`;
    const status = row.status || STATUS.AVAILABLE;
    pipeline.hset(key, {
      status,
      heldBy: row.held_by || '',
      heldAt: row.held_at ? new Date(row.held_at).getTime().toString() : '',
      section: row.section || '',
      price: (row.price || 0).toString(),
    });
    if (status === STATUS.AVAILABLE) available++;
    else if (status === STATUS.HELD) held++;
    else if (status === STATUS.SOLD) sold++;
  }
  await pipeline.exec();

  if (available === 0 && held === 0) {
    await redis.set(SOLD_OUT_KEY, '1');
  }

  console.log(`[Seat Recovery] ${eventId}: ${rows.length}석 복구 (available=${available}, held=${held}, sold=${sold})`);
  return { recovered: true, total: rows.length, available, held, sold };
}

module.exports = { initSeats, holdSeat, confirmSeat, cancelSeat, releaseSeat, getSeatTimer, getAllSeats, isSoldOut, getAvailableCount, cleanupEventSeats, recoverSeatsFromMariaDB, STATUS };
