const crypto = require('crypto');
const pool = require('../config/mariadb');
const redis = require('../config/redis');
const seatService = require('./seatService');
const queueService = require('./queueService');

const EVENT_KEY = 'event:info';
const EVENT_LIST_KEY = 'events:list';
const EVENT_SEQ_KEY = 'event:seq';
const SEAT_PREFIX = 'seat:';
const RECOVERY_LOCK_KEY = 'lock:redis-recovery';
const RECOVERY_LOCK_TTL = 180;

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_INTERVAL_MS = 60 * 1000;

let recoveryTimer = null;
let recoveryInFlight = null;

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (Buffer.isBuffer(value)) value = value.toString();
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function eventCardFromRow(row) {
  const sessions = parseJson(row.sessions, []);
  const sessionCount = Array.isArray(sessions) && sessions.length > 0 ? sessions.length : 1;
  const card = {
    eventId: row.event_id,
    eventName: row.event_name,
    eventDate: row.event_date || '',
    venue: row.venue || '',
    totalSeats: Number(row.total_seats || 0),
    sessions: Array.isArray(sessions) ? sessions : [],
    seatsPerSession: Math.ceil(Number(row.total_seats || 0) / sessionCount),
    seatingType: row.seating_type || 'arena',
    sections: parseJson(row.sections, []),
    status: row.status || 'open',
    emoji: row.emoji || '🎵',
    color: row.color || '#667eea,#764ba2',
    ticketOpenAt: toIsoDate(row.ticket_open_at),
    ticketCloseAt: toIsoDate(row.ticket_close_at),
    createdAt: toIsoDate(row.created_at),
  };

  for (const field of ['description', 'cast', 'agency', 'runtime', 'ageRating', 'notices']) {
    if (row[field]) card[field] = row[field];
  }
  return card;
}

function getEventSessions(row) {
  const sessions = parseJson(row.sessions, []);
  if (Array.isArray(sessions) && sessions.length > 0) {
    return sessions.map((session) => ({
      date: String(session?.date || ''),
      time: String(session?.time || ''),
    }));
  }
  return [{ date: String(row.event_date || ''), time: '' }];
}

function chooseTargetEvent(rows, currentInfo = {}, preferredEventId = null) {
  if (preferredEventId) {
    const preferred = rows.find((row) => row.event_id === preferredEventId);
    if (preferred) return preferred;
  }

  const current = rows.find((row) => row.event_id === currentInfo.eventId && row.status !== 'cancelled');
  if (current) return current;

  return rows.find((row) => row.status !== 'cancelled') || null;
}

async function countSeatKeys(eventId) {
  let count = 0;
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${SEAT_PREFIX}${eventId}:*`, 'COUNT', 20);
    cursor = nextCursor;
    count += keys.length;
  } while (cursor !== '0');
  return count;
}

async function findQueueGaps() {
  const rows = await pool.query(
    `SELECT event_id, session_date, session_time, COUNT(*) AS queue_count
     FROM waiting_queue
     WHERE status IN ('WAITING', 'ADMITTED', 'PROMOTED')
     GROUP BY event_id, session_date, session_time`,
  );

  const gaps = [];
  for (const row of rows) {
    const hasSession = Boolean(row.session_date || row.session_time);
    const context = hasSession
      ? { eventId: row.event_id, sessionDate: row.session_date || '', sessionTime: row.session_time || '' }
      : {};
    const keys = queueService.queueKeys(context);
    const [waiting, standby, admitted] = await Promise.all([
      redis.zcard(keys.waitingKey),
      redis.zcard(keys.standbyKey),
      redis.scard(keys.admittedKey),
    ]);
    const redisCount = waiting + standby + admitted;
    const dbCount = Number(row.queue_count || 0);
    if (redisCount < dbCount) {
      gaps.push({
        eventId: row.event_id,
        sessionDate: context.sessionDate || '',
        sessionTime: context.sessionTime || '',
        dbCount,
        redisCount,
      });
    }
  }
  return gaps;
}

async function inspectRedisState(rows, preferredEventId = null) {
  const currentInfo = await redis.hgetall(EVENT_KEY);
  const target = chooseTargetEvent(rows, currentInfo, preferredEventId);
  const reasons = [];

  const eventCount = await redis.hlen(EVENT_LIST_KEY);
  if (eventCount !== rows.length) reasons.push(`events:list ${eventCount}/${rows.length}`);

  if (target) {
    const targetCard = eventCardFromRow(target);
    if (currentInfo.eventId !== targetCard.eventId) reasons.push('event:info missing or wrong event');
    if ((currentInfo.ticketOpenAt || null) !== (targetCard.ticketOpenAt || null)) {
      reasons.push('event:info ticketOpenAt mismatch');
    }

    const status = await redis.get('event:ticketing-status');
    const schedule = await redis.hgetall('event:schedule');
    const openTime = targetCard.ticketOpenAt ? new Date(targetCard.ticketOpenAt).getTime() : 0;
    const futureOpen = Number.isFinite(openTime) && openTime > Date.now();

    if (!status) reasons.push('event:ticketing-status missing');
    if (futureOpen) {
      if (schedule.openAt !== targetCard.ticketOpenAt) reasons.push('event:schedule missing or stale');
      if (status && status !== 'closed') reasons.push('future ticketing status is not closed');
    } else if (schedule.openAt) {
      reasons.push('stale event:schedule');
    }
  } else if (currentInfo.eventId || await redis.exists('event:schedule')) {
    reasons.push('no active DB event but Redis event state exists');
  }

  const seatGaps = [];
  for (const row of rows) {
    if (row.status === 'cancelled' || Number(row.total_seats || 0) <= 0) continue;
    const expected = Number(row.total_seats || 0);
    const actual = await countSeatKeys(row.event_id);
    if (actual < expected) {
      seatGaps.push({ eventId: row.event_id, expected, actual });
      reasons.push(`seat data missing: ${row.event_id} (${actual}/${expected})`);
      break;
    }
  }

  const queueGaps = await findQueueGaps();
  if (queueGaps.length > 0) reasons.push(`queue data missing: ${queueGaps.length} session(s)`);

  return {
    needed: reasons.length > 0,
    reasons,
    target,
    currentInfo,
    queueGaps,
    seatGaps,
  };
}

async function acquireRecoveryLock() {
  const token = crypto.randomUUID();
  const result = await redis.set(RECOVERY_LOCK_KEY, token, 'EX', RECOVERY_LOCK_TTL, 'NX');
  return result === 'OK' ? token : null;
}

async function releaseRecoveryLock(token) {
  if (!token) return;
  await redis.eval(
    `if redis.call("GET", KEYS[1]) == ARGV[1] then
       return redis.call("DEL", KEYS[1])
     else
       return 0
     end`,
    1,
    RECOVERY_LOCK_KEY,
    token,
  );
}

async function restoreEventInfo(row) {
  if (!row) {
    await redis.del(EVENT_KEY);
    return null;
  }

  const card = eventCardFromRow(row);
  const ticketOpenAt = card.ticketOpenAt;
  await redis.hset(EVENT_KEY, {
    eventId: card.eventId,
    eventName: card.eventName,
    eventDate: card.eventDate,
    venue: card.venue,
    totalSeats: String(card.totalSeats),
    sessions: JSON.stringify(card.sessions),
    seatsPerSession: String(card.seatsPerSession),
    sections: JSON.stringify(card.sections),
    seatingType: card.seatingType,
    status: card.status,
    emoji: card.emoji,
    color: card.color,
    createdAt: card.createdAt || '',
    ...(ticketOpenAt ? { ticketOpenAt } : {}),
  });
  if (!ticketOpenAt) await redis.hdel(EVENT_KEY, 'ticketOpenAt');
  return card;
}

async function restoreEventSequence(rows) {
  const maxSequence = rows.reduce((max, row) => {
    const match = String(row.event_id || '').match(/^evt-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  if (maxSequence <= 0) return;
  const current = Number(await redis.get(EVENT_SEQ_KEY) || 0);
  if (current < maxSequence) await redis.set(EVENT_SEQ_KEY, String(maxSequence));
}

async function restoreTicketingState(targetCard) {
  if (!targetCard || targetCard.status === 'cancelled') {
    await queueService.cancelSchedule();
    await queueService.closeTicketing();
    return { status: 'closed', scheduled: false };
  }

  return queueService.restoreTicketingSchedule(targetCard.ticketOpenAt);
}

async function recoverAll({ eventId = null, reason = 'manual', force = false } = {}) {
  if (recoveryInFlight) return recoveryInFlight;

  recoveryInFlight = (async () => {
    const lockToken = await acquireRecoveryLock();
    if (!lockToken) return { recovered: false, skipped: true, reason: 'another recovery is running' };

    try {
      const rows = await pool.query('SELECT * FROM events ORDER BY created_at DESC');
      if (rows.length === 0) {
        await redis.del(EVENT_LIST_KEY, EVENT_KEY, 'event:schedule', 'event:ticketing-status');
        return { recovered: true, reason, events: 0, message: 'MariaDB에 이벤트가 없어 Redis 이벤트 상태를 정리했습니다.' };
      }

      const inspection = force
        ? { needed: true, target: chooseTargetEvent(rows, {}, eventId), reasons: ['forced'] }
        : await inspectRedisState(rows, eventId);
      if (!inspection.needed && !eventId) {
        return { recovered: false, skipped: true, reason: 'Redis state is complete', checkedEvents: rows.length };
      }

      const dbEventIds = new Set(rows.map((row) => row.event_id));
      const allRedisFields = await redis.hkeys(EVENT_LIST_KEY);
      const staleFields = allRedisFields.filter((field) => !dbEventIds.has(field));

      const pipeline = redis.pipeline();
      rows.forEach((row) => {
        const card = eventCardFromRow(row);
        pipeline.hset(EVENT_LIST_KEY, card.eventId, JSON.stringify(card));
      });
      if (staleFields.length > 0) {
        staleFields.forEach((field) => pipeline.hdel(EVENT_LIST_KEY, field));
        console.log(`[Redis Auto Recovery] DB에 없는 events:list 항목 ${staleFields.length}건 제거: ${staleFields.join(', ')}`);
      }
      await pipeline.exec();
      await restoreEventSequence(rows);

      const targetRow = eventId
        ? rows.find((row) => row.event_id === eventId) || inspection.target
        : inspection.target || chooseTargetEvent(rows);
      const targetCard = await restoreEventInfo(targetRow);

      const seats = [];
      for (const row of rows) {
        if (row.status === 'cancelled') continue;
        const seatGap = (inspection.seatGaps || []).some((gap) => gap.eventId === row.event_id);
        seats.push({
          eventId: row.event_id,
          ...(await seatService.recoverSeatsFromMariaDB(row.event_id, { force: force || seatGap })),
        });
      }

      const queues = [];
      for (const row of rows) {
        if (row.status === 'cancelled') continue;
        for (const session of getEventSessions(row)) {
          const sessionContext = session.date || session.time
            ? { eventId: row.event_id, sessionDate: session.date, sessionTime: session.time }
            : {};
          const queueGap = (inspection.queueGaps || []).some((gap) => (
            gap.eventId === row.event_id
            && gap.sessionDate === session.date
            && gap.sessionTime === session.time
          ));
          queues.push({
            eventId: row.event_id,
            sessionDate: session.date,
            sessionTime: session.time,
            ...(await queueService.recoverQueueFromMariaDB(row.event_id, {
              ...sessionContext,
              force: force || queueGap,
            })),
          });
        }
      }

      const ticketing = await restoreTicketingState(targetCard);
      const result = {
        recovered: true,
        reason,
        events: rows.length,
        eventInfo: targetCard ? { recovered: true, eventId: targetCard.eventId } : { recovered: false },
        seats,
        queues,
        ticketing,
        reasons: inspection.reasons || [],
      };
      console.log(`[Redis Auto Recovery] reason=${reason}`, JSON.stringify({
        events: result.events,
        eventInfo: result.eventInfo,
        seatEvents: result.seats.length,
        queueContexts: result.queues.length,
        ticketing: result.ticketing,
        reasons: result.reasons,
      }));
      return result;
    } finally {
      await releaseRecoveryLock(lockToken);
    }
  })();

  try {
    return await recoveryInFlight;
  } finally {
    recoveryInFlight = null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function recoverWithRetry({ reason = 'startup', eventId = null, force = false } = {}) {
  const attempts = Math.max(1, Number(process.env.REDIS_RECOVERY_ATTEMPTS) || DEFAULT_ATTEMPTS);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await redis.ping();
      const result = await recoverAll({ reason, eventId, force });
      if (attempt > 1) result.attempt = attempt;
      return result;
    } catch (err) {
      lastError = err;
      console.error(`[Redis Auto Recovery] ${reason} ${attempt}/${attempts} 실패:`, err.message);
      if (attempt < attempts) await sleep(Math.min(1000 * attempt, 3000));
    }
  }

  return {
    recovered: false,
    reason,
    attempts,
    error: lastError?.message || 'Redis 자동 복구 실패',
  };
}

function startAutoRecovery(intervalMs = Number(process.env.REDIS_RECOVERY_INTERVAL_MS) || DEFAULT_INTERVAL_MS) {
  if (recoveryTimer) return;
  recoveryTimer = setInterval(() => {
    recoverWithRetry({ reason: 'periodic' }).catch((err) => {
      console.error('[Redis Auto Recovery] periodic 오류:', err.message);
    });
  }, Math.max(5000, intervalMs));
  if (typeof recoveryTimer.unref === 'function') recoveryTimer.unref();
  console.log(`[Redis Auto Recovery] 주기적 점검 시작 (${Math.max(5000, intervalMs) / 1000}초 간격)`);
}

function stopAutoRecovery() {
  if (recoveryTimer) {
    clearInterval(recoveryTimer);
    recoveryTimer = null;
  }
}

module.exports = {
  recoverAll,
  recoverWithRetry,
  startAutoRecovery,
  stopAutoRecovery,
  inspectRedisState,
  eventCardFromRow,
};
