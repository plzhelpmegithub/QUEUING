const redis = require('../config/redis');
const pool = require('../config/mariadb');
const { isPriorityUser } = require('./membershipService');
const { syncToMariaDB } = require('./syncRetryService');
const { normalizeSessionContext, getScopedKey } = require('./sessionContext');

const QUEUE_KEY = 'queue:waiting';
const COUNTER_KEY = 'queue:counter';
const ADMITTED_KEY = 'queue:admitted';
const STANDBY_KEY = 'queue:standby';
const TOTAL_SEATS_KEY = 'event:total-seats';
const TICKETING_STATUS_KEY = 'event:ticketing-status';
const HOLD_DURATION_KEY = 'event:hold-duration';

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE, 10) || 100;

function queueKeys(context = {}) {
  const normalized = normalizeSessionContext(context);
  return {
    ...normalized,
    waitingKey: getScopedKey(QUEUE_KEY, normalized),
    counterKey: getScopedKey(COUNTER_KEY, normalized),
    admittedKey: getScopedKey(ADMITTED_KEY, normalized),
    standbyKey: getScopedKey(STANDBY_KEY, normalized),
    totalSeatsKey: getScopedKey(TOTAL_SEATS_KEY, normalized),
    statusKey: getScopedKey(TICKETING_STATUS_KEY, normalized),
  };
}

async function setTotalSeats(count, context = {}) {
  const keys = queueKeys(context);
  await redis.set(keys.totalSeatsKey, count);
  return { totalSeats: count, message: `총 좌석 수 ${count}석으로 설정` };
}

async function enter(userId, context = {}) {
  const requestedContext = Boolean(context.eventId || context.sessionDate || context.sessionTime);
  const eventInfo = await redis.hgetall('event:info');
  const currentEventId = context.eventId || eventInfo?.eventId || '';
  const keys = queueKeys(requestedContext ? { ...context, eventId: currentEventId } : {});
  const ticketingStatus = (await redis.get(keys.statusKey)) || (requestedContext ? await redis.get(TICKETING_STATUS_KEY) : null);
  if (ticketingStatus === 'closed') {
    return { status: 'closed', message: '현재 티켓팅이 마감되었습니다. 더 이상 대기열에 진입할 수 없습니다.' };
  }
  if (!ticketingStatus) {
    if (!currentEventId) {
      return { status: 'closed', message: '등록된 공연이 없습니다.' };
    }
    await redis.set(keys.statusKey, 'open');
  }

  const isAdmitted = await redis.sismember(keys.admittedKey, userId);
  if (isAdmitted) {
    const { getRawToken } = require('./tokenService');
    const existing = await getRawToken(userId, keys);
    if (existing) {
      return { status: 'admitted', token: existing.token, expiresAt: existing.expiresAt, message: '이미 입장이 허용된 상태입니다.' };
    }

    await redis.srem(keys.admittedKey, userId);
    await syncToMariaDB(
      `UPDATE waiting_queue SET status = 'RE_QUEUED', updated_at = NOW() WHERE user_id = ? AND event_id = ? AND session_date = ? AND session_time = ? AND status IN ('ADMITTED','PROMOTED')`,
      [userId, currentEventId, keys.sessionDate, keys.sessionTime],
      `queue:re_queue ${userId}`,
    );
  }

  const existingScore = await redis.zscore(keys.waitingKey, userId);
  if (existingScore !== null) {
    const position = await redis.zrank(keys.waitingKey, userId);
    const totalSeats = parseInt(await redis.get(keys.totalSeatsKey), 10) || 0;
    const type = (position + 1) <= totalSeats ? 'eligible' : 'standby';
    return {
      status: 'waiting',
      type,
      position: position + 1,
      ticket: parseInt(existingScore, 10),
      message: '이미 대기열에 등록되어 있습니다.',
    };
  }

  const standbyScore = await redis.zscore(keys.standbyKey, userId);
  if (standbyScore !== null) {
    const rank = await redis.zrank(keys.standbyKey, userId);
    return {
      status: 'standby',
      type: 'standby',
      standbyPosition: rank + 1,
      message: '취소표 대기 중입니다.',
    };
  }

  const totalSeats = parseInt(await redis.get(keys.totalSeatsKey), 10) || 0;
  if (totalSeats === 0) {
    return { status: 'error', message: '이벤트 좌석이 설정되지 않았습니다.' };
  }

  // INCR은 원자적이라 동시 요청에도 중복 없음
  let ticket = await redis.incr(keys.counterKey);

  let priorityLevel = 0;
  try {
    priorityLevel = await isPriorityUser(userId);
    if (priorityLevel > 0) {
      ticket = Math.max(1, ticket - (priorityLevel * 50));
    }
  } catch (_) {}

  const currentStatus = (await redis.get(keys.statusKey)) || (requestedContext ? await redis.get(TICKETING_STATUS_KEY) : null);

  if (currentStatus === 'sold_out' || ticket > totalSeats) {
    await redis.zadd(keys.standbyKey, ticket, userId);
    const rank = await redis.zrank(keys.standbyKey, userId);

    await syncToMariaDB(
      `INSERT INTO waiting_queue (user_id, event_id, session_date, session_time, queue_type, queue_index, status) VALUES (?, ?, ?, ?, 'standby', ?, 'WAITING')`,
      [userId, currentEventId, keys.sessionDate, keys.sessionTime, ticket],
      `queue:enter:standby ${userId}`,
    );

    return {
      status: 'waiting',
      type: 'standby',
      standbyPosition: rank + 1,
      ticket,
      priority: priorityLevel > 0,
      message: `현재 매진 상태입니다. 취소표 대기 ${rank + 1}번째로 등록되었습니다.`,
    };
  } else {
    await redis.zadd(keys.waitingKey, ticket, userId);
    const position = await redis.zrank(keys.waitingKey, userId);

    await syncToMariaDB(
      `INSERT INTO waiting_queue (user_id, event_id, session_date, session_time, queue_type, queue_index, status) VALUES (?, ?, ?, ?, 'eligible', ?, 'WAITING')`,
      [userId, currentEventId, keys.sessionDate, keys.sessionTime, ticket],
      `queue:enter:eligible ${userId}`,
    );

    return {
      status: 'waiting',
      type: 'eligible',
      position: position + 1,
      ticket,
      priority: priorityLevel > 0,
      message: `대기열에 등록되었습니다. (${position + 1}번째)`,
    };
  }
}

async function getPosition(userId, context = {}) {
  const keys = queueKeys(context);
  const isAdmitted = await redis.sismember(keys.admittedKey, userId);
  if (isAdmitted) {
    return { status: 'admitted', message: '입장이 허용된 상태입니다.' };
  }

  const rank = await redis.zrank(keys.waitingKey, userId);
  if (rank !== null) {
    const totalWaiting = await redis.zcard(keys.waitingKey);
    return {
      status: 'waiting',
      type: 'eligible',
      position: rank + 1,
      totalWaiting,
      message: `현재 ${rank + 1}번째 순서입니다.`,
    };
  }

  const standbyRank = await redis.zrank(keys.standbyKey, userId);
  if (standbyRank !== null) {
    const totalStandby = await redis.zcard(keys.standbyKey);
    return {
      status: 'standby',
      type: 'standby',
      standbyPosition: standbyRank + 1,
      totalStandby,
      message: `취소표 대기 ${standbyRank + 1}번째입니다.`,
    };
  }

  return { status: 'not_found', message: '대기열에 등록되어 있지 않습니다.' };
}

async function admitBatch(context = {}) {
  const { issueToken } = require('./tokenService');
  const keys = queueKeys(context);
  const users = await redis.zrange(keys.waitingKey, 0, BATCH_SIZE - 1);

  if (users.length === 0) {
    return { admitted: [], count: 0, message: '대기 중인 사용자가 없습니다.' };
  }

  const pipeline = redis.pipeline();
  pipeline.zrem(keys.waitingKey, ...users);
  pipeline.sadd(keys.admittedKey, ...users);
  await pipeline.exec();

  const tokens = {};
  for (const userId of users) {
    const { token, expiresAt } = await issueToken(userId, undefined, keys);
    tokens[userId] = { token, expiresAt };
  }

  const placeholders = users.map(() => '?').join(',');
  await syncToMariaDB(
    `UPDATE waiting_queue SET status = 'ADMITTED', updated_at = NOW() WHERE user_id IN (${placeholders}) AND event_id = ? AND session_date = ? AND session_time = ? AND status = 'WAITING'`,
    [...users, keys.eventId, keys.sessionDate, keys.sessionTime],
    `queue:admit batch(${users.length})`,
  );

  const remaining = await redis.zcard(keys.waitingKey);
  return {
    admitted: users,
    tokens,
    count: users.length,
    remaining,
    message: `${users.length}명 입장 허용 + Admission Token 발급 완료`,
  };
}

async function getNextStandby(context = {}) {
  const keys = queueKeys(context);
  const users = await redis.zrange(keys.standbyKey, 0, 0);
  if (users.length === 0) {
    return { userId: null, message: '취소표 대기자가 없습니다.' };
  }
  return { userId: users[0], message: `다음 대기자: ${users[0]}` };
}

async function promoteStandby(userId, context = {}) {
  const { issueToken } = require('./tokenService');
  const keys = queueKeys(context);
  const removed = await redis.zrem(keys.standbyKey, userId);
  if (removed === 0) {
    return { success: false, message: '해당 사용자가 standby에 없습니다.' };
  }
  await redis.sadd(keys.admittedKey, userId);
  const { token, expiresAt } = await issueToken(userId, undefined, keys);

  await syncToMariaDB(
    `UPDATE waiting_queue SET status = 'PROMOTED', updated_at = NOW() WHERE user_id = ? AND event_id = ? AND session_date = ? AND session_time = ? AND queue_type = 'standby' AND status = 'WAITING'`,
    [userId, keys.eventId, keys.sessionDate, keys.sessionTime],
    `queue:promote ${userId}`,
  );

  return { success: true, userId, token, expiresAt, message: `${userId} 입장 허용 + Token 발급` };
}

async function getStats(context = {}) {
  const keys = queueKeys(context);
  const [waiting, standby, admitted, lastTicket, totalSeats] = await Promise.all([
    redis.zcard(keys.waitingKey),
    redis.zcard(keys.standbyKey),
    redis.scard(keys.admittedKey),
    redis.get(keys.counterKey),
    redis.get(keys.totalSeatsKey),
  ]);

  return {
    totalSeats: parseInt(totalSeats, 10) || 0,
    eligible: waiting,
    standby,
    admitted,
    lastTicket: parseInt(lastTicket, 10) || 0,
  };
}

async function isUserAdmitted(userId, context = {}) {
  const keys = queueKeys(context);
  return redis.sismember(keys.admittedKey, userId);
}

async function clearQueuesForEvent(eventId) {
  if (!eventId) return { deleted: 0 };
  let cursor = '0';
  let deleted = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `queue:*:${eventId}:*`, 'COUNT', 200);
    cursor = nextCursor;
    if (keys.length) {
      await redis.del(...keys);
      deleted += keys.length;
    }
  } while (cursor !== '0');
  return { deleted };
}

async function openTicketing() {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  if (standbyCloseTimer) { clearTimeout(standbyCloseTimer); standbyCloseTimer = null; }
  await redis.set(TICKETING_STATUS_KEY, 'open');
  const openedAt = new Date().toISOString();
  console.log(`[Ticketing] 오픈 — ${openedAt}`);
  return { status: 'open', openedAt, message: '티켓팅이 오픈되었습니다.' };
}

async function closeTicketing() {
  await redis.set(TICKETING_STATUS_KEY, 'closed');
  const closedAt = new Date().toISOString();
  console.log(`[Ticketing] 마감 — ${closedAt}`);
  return { status: 'closed', closedAt, message: '티켓팅이 마감되었습니다.' };
}

async function setHoldDuration(seconds) {
  await redis.set(HOLD_DURATION_KEY, seconds);
  console.log(`[Ticketing] 결제 제한 시간: ${seconds}초 (${Math.floor(seconds / 60)}분)`);
  return {
    holdDuration: seconds,
    display: `${Math.floor(seconds / 60)}분 ${seconds % 60}초`,
    message: `결제 제한 시간이 ${seconds}초로 설정되었습니다.`,
  };
}

async function getHoldDuration() {
  const duration = parseInt(await redis.get(HOLD_DURATION_KEY), 10) || parseInt(process.env.HOLD_DURATION, 10) || 600;
  return {
    holdDuration: duration,
    display: `${Math.floor(duration / 60)}분 ${duration % 60}초`,
  };
}

let openTimer = null;
let closeTimer = null;

async function scheduleTicketing(openAt, durationMinutes) {
  const openTime = new Date(openAt).getTime();
  const now = Date.now();
  const delayMs = openTime - now;

  if (delayMs <= 0) {
    return { success: false, message: '오픈 시간이 현재 시간보다 이전입니다.' };
  }

  if (openTimer) clearTimeout(openTimer);
  if (closeTimer) clearTimeout(closeTimer);

  // 예약 시간이 되기 전에는 대기열 진입을 막고, 타이머가 도달하면
  // openTicketing()이 다시 오픈하도록 현재 상태를 closed로 맞춘다.
  await closeTicketing();

  await redis.hset('event:schedule', {
    openAt,
    durationMinutes: (durationMinutes || 0).toString(),
    scheduledAt: new Date().toISOString(),
  });

  openTimer = setTimeout(async () => {
    await openTicketing();
    console.log(`[Schedule] 예약 시간 도달 — 티켓팅 자동 오픈`);

    if (durationMinutes && durationMinutes > 0) {
      const closeDelayMs = durationMinutes * 60 * 1000;
      closeTimer = setTimeout(async () => {
        await closeTicketing();
        console.log(`[Schedule] ${durationMinutes}분 경과 — 티켓팅 자동 마감`);
      }, closeDelayMs);
    }
  }, delayMs);

  const delaySeconds = Math.floor(delayMs / 1000);
  const delayMinutes = Math.floor(delaySeconds / 60);
  const delaySec = delaySeconds % 60;

  return {
    success: true,
    openAt,
    opensIn: `${delayMinutes}분 ${delaySec}초 후`,
    autoClose: durationMinutes ? `오픈 후 ${durationMinutes}분 뒤 자동 마감` : '수동 마감',
    message: `티켓팅이 ${openAt}에 자동 오픈됩니다.`,
  };
}

// Redis 초기화 또는 API 재시작 후 DB에 저장된 오픈 예정 시간을
// Redis 스케줄과 메모리 타이머로 다시 등록한다.
async function restoreTicketingSchedule(openAt, durationMinutes = 0) {
  if (!openAt) {
    await cancelSchedule();
    await openTicketing();
    return { success: true, scheduled: false, status: 'open', message: '예매가 즉시 오픈 상태로 복구되었습니다.' };
  }

  const openTime = new Date(openAt).getTime();
  if (!Number.isFinite(openTime)) {
    return { success: false, scheduled: false, message: '저장된 오픈 시간이 올바르지 않습니다.' };
  }

  if (openTime <= Date.now()) {
    await cancelSchedule();
    await openTicketing();
    return { success: true, scheduled: false, status: 'open', openAt, message: '오픈 시간이 지나 예매중 상태로 복구되었습니다.' };
  }

  return scheduleTicketing(openAt, durationMinutes);
}

async function cancelSchedule() {
  if (openTimer) { clearTimeout(openTimer); openTimer = null; }
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  await redis.del('event:schedule');
  return { success: true, message: '예약된 스케줄이 취소되었습니다.' };
}

async function getSchedule() {
  const schedule = await redis.hgetall('event:schedule');
  if (!schedule || !schedule.openAt) {
    return { scheduled: false, message: '예약된 스케줄이 없습니다.' };
  }
  const openTime = new Date(schedule.openAt).getTime();
  const remaining = openTime - Date.now();
  return {
    scheduled: true,
    openAt: schedule.openAt,
    durationMinutes: parseInt(schedule.durationMinutes, 10) || null,
    remainingSeconds: remaining > 0 ? Math.floor(remaining / 1000) : 0,
    scheduledAt: schedule.scheduledAt,
  };
}

async function getTicketingStatus() {
  let status = await redis.get(TICKETING_STATUS_KEY);
  if (!status) {
    const eventInfo = await redis.hgetall('event:info');
    status = (eventInfo && eventInfo.eventId) ? 'open' : 'closed';
    if (status === 'open') await redis.set(TICKETING_STATUS_KEY, 'open');
  }
  const descriptions = {
    open: '예매 가능 (eligible + standby 진입 가능)',
    sold_out: '전석 매진 (취소표 대기만 가능)',
    closed: '완전 마감 (진입 불가, 기존 standby만 취소표 대기)',
  };
  return { status, description: descriptions[status] || '알 수 없음' };
}

let standbyCloseTimer = null;

async function scheduleStandbyClose(closeAt) {
  const closeTime = new Date(closeAt).getTime();
  const now = Date.now();
  const delayMs = closeTime - now;

  if (delayMs <= 0) {
    return { success: false, message: '마감 시간이 현재 시간보다 이전입니다.' };
  }

  if (standbyCloseTimer) clearTimeout(standbyCloseTimer);

  await redis.hset('event:schedule', {
    standbyCloseAt: closeAt,
  });

  standbyCloseTimer = setTimeout(async () => {
    await redis.set(TICKETING_STATUS_KEY, 'closed');
    console.log(`[Schedule] standby 마감 시간 도달 — 완전 마감 (기존 standby는 유지)`);
  }, delayMs);

  const delayMinutes = Math.floor(delayMs / 60000);
  const delayHours = Math.floor(delayMinutes / 60);
  const remainMin = delayMinutes % 60;

  return {
    success: true,
    standbyCloseAt: closeAt,
    closesIn: `${delayHours}시간 ${remainMin}분 후`,
    message: `${closeAt}에 standby 접수가 마감됩니다. 이후 신규 진입 불가.`,
  };
}

async function scheduleCloseTime(closeAt) {
  const closeTime = new Date(closeAt).getTime();
  const now = Date.now();
  const delayMs = closeTime - now;

  if (delayMs <= 0) {
    await closeTicketing();
    return { success: true, immediate: true, message: '마감 시간이 이미 지났으므로 즉시 마감 처리되었습니다.' };
  }

  if (closeTimer) clearTimeout(closeTimer);

  closeTimer = setTimeout(async () => {
    await closeTicketing();
    console.log(`[Schedule] 예약 마감 시간 도달 — 티켓팅 자동 마감`);
  }, delayMs);

  const delayMinutes = Math.floor(delayMs / 60000);
  const delayHours = Math.floor(delayMinutes / 60);
  const remainMin = delayMinutes % 60;

  return {
    success: true,
    ticketCloseAt: closeAt,
    closesIn: `${delayHours}시간 ${remainMin}분 후`,
    message: `${closeAt}에 티켓팅이 자동 마감됩니다.`,
  };
}

async function cancelCloseSchedule() {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  return { success: true, message: '마감 예약이 취소되었습니다.' };
}

async function recoverQueueFromMariaDB(eventId, context = {}) {
  if (!eventId) return { recovered: false, message: 'eventId 필요' };

  const force = Boolean(context.force);
  const hasSession = Boolean(context.sessionDate || context.sessionTime);
  const keys = queueKeys(hasSession ? { ...context, eventId } : {});
  const sessionClause = hasSession ? ' AND session_date = ? AND session_time = ?' : '';
  const sessionParams = hasSession ? [keys.sessionDate, keys.sessionTime] : [];

  const existingCount = await redis.zcard(keys.waitingKey);
  const existingStandby = await redis.zcard(keys.standbyKey);
  const existingAdmitted = await redis.scard(keys.admittedKey);
  if (existingCount + existingStandby + existingAdmitted > 0 && !force) {
    return { recovered: false, message: 'Redis 대기열에 이미 데이터가 있습니다', existing: { eligible: existingCount, standby: existingStandby, admitted: existingAdmitted } };
  }

  const eligible = await pool.query(
    `SELECT user_id, queue_index FROM waiting_queue WHERE event_id = ?${sessionClause} AND queue_type = ? AND status = ? ORDER BY queue_index`,
    [eventId, ...sessionParams, 'eligible', 'WAITING'],
  );
  if (eligible.length > 0) {
    const pipeline = redis.pipeline();
    for (const row of eligible) {
      pipeline.zadd(keys.waitingKey, row.queue_index, row.user_id);
    }
    await pipeline.exec();
  }

  const standby = await pool.query(
    `SELECT user_id, queue_index FROM waiting_queue WHERE event_id = ?${sessionClause} AND queue_type = ? AND status = ? ORDER BY queue_index`,
    [eventId, ...sessionParams, 'standby', 'WAITING'],
  );
  if (standby.length > 0) {
    const pipeline = redis.pipeline();
    for (const row of standby) {
      pipeline.zadd(keys.standbyKey, row.queue_index, row.user_id);
    }
    await pipeline.exec();
  }

  const admitted = await pool.query(
    `SELECT user_id FROM waiting_queue WHERE event_id = ?${sessionClause} AND status IN (?, ?)`,
    [eventId, ...sessionParams, 'ADMITTED', 'PROMOTED'],
  );
  if (admitted.length > 0) {
    await redis.sadd(keys.admittedKey, ...admitted.map(r => r.user_id));
  }

  const maxRow = await pool.query(
    `SELECT MAX(queue_index) as max_idx FROM waiting_queue WHERE event_id = ?${sessionClause}`,
    [eventId, ...sessionParams],
  );
  const counter = maxRow[0]?.max_idx || 0;
  if (counter > 0) await redis.set(keys.counterKey, counter);

  const eventRow = await pool.query(
    'SELECT total_seats, sessions FROM events WHERE event_id = ?',
    [eventId],
  );
  let totalSeats = eventRow[0]?.total_seats || 0;
  if (hasSession) {
    try {
      const storedSessions = typeof eventRow[0]?.sessions === 'string' ? JSON.parse(eventRow[0].sessions) : eventRow[0]?.sessions;
      const sessionCount = Array.isArray(storedSessions) && storedSessions.length ? storedSessions.length : 1;
      totalSeats = Math.ceil(totalSeats / sessionCount);
    } catch (_) {}
  }
  if (totalSeats > 0) await redis.set(keys.totalSeatsKey, totalSeats);

  console.log(`[Queue Recovery] ${eventId}: eligible=${eligible.length}, standby=${standby.length}, admitted=${admitted.length}, counter=${counter}, totalSeats=${totalSeats}`);
  return {
    recovered: true,
    eligible: eligible.length,
    standby: standby.length,
    admitted: admitted.length,
    counter,
    totalSeats,
  };
}

module.exports = { setTotalSeats, enter, getPosition, admitBatch, getNextStandby, promoteStandby, getStats, isUserAdmitted, clearQueuesForEvent, queueKeys, openTicketing, closeTicketing, getTicketingStatus, setHoldDuration, getHoldDuration, scheduleTicketing, restoreTicketingSchedule, cancelSchedule, getSchedule, scheduleStandbyClose, scheduleCloseTime, cancelCloseSchedule, recoverQueueFromMariaDB };
