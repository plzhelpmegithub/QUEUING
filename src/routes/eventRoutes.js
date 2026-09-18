const redis = require('../config/redis');
const pool = require('../config/mariadb');
const queueService = require('../services/queueService');
const seatService = require('../services/seatService');
const { recoverAll } = require('../services/redisRecoveryService');
const { sendEmail, notifyEventCancellation, notifyEventUpdate } = require('../services/notificationService');
const { publishSeatEvent, EVENT_TYPE } = require('../services/eventService');
const { buildSeatId } = require('../services/sessionContext');
const { listEventCards } = require('../services/eventCatalogService');
const { authenticate, requireRole } = require('../middleware/auth');

const adminAuth = { preHandler: [authenticate, requireRole('admin')] };

const EVENT_KEY = 'event:info';
const EVENT_LIST_KEY = 'events:list';
const EVENT_SEQ_KEY = 'event:seq';
const SEAT_PREFIX = 'seat:';

const GRADE_COLOR = { VIP: '#B5121B', R: '#C98500', S: '#199E70', A: '#3987E5' };
const FALLBACK_PALETTE = ['#B5121B', '#C98500', '#199E70', '#3987E5', '#8E44AD', '#16A085', '#D35400', '#2C3E50'];

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

// MariaDB의 이벤트 행을 Redis events:list 카드 형태로 변환한다.
// 오픈 예정 시간도 이 변환 경로를 거쳐 복구하므로 Redis 초기화 후에도 유지된다.
function eventCardFromRow(row) {
  const sessions = parseJson(row.sessions, []);
  const sessionCount = Array.isArray(sessions) && sessions.length > 0 ? sessions.length : 1;
  const card = {
    eventId: row.event_id,
    eventName: row.event_name,
    eventDate: row.event_date || '',
    venue: row.venue || '',
    totalSeats: Number(row.total_seats || 0),
    sessions,
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

function normalizeEventSessions(sessions) {
  if (!Array.isArray(sessions)) return [];
  return sessions
    .filter((session) => session && (session.date || session.time || session.sessionDate || session.sessionTime))
    .map((session) => ({
      ...session,
      date: String(session.date || session.sessionDate || ''),
      time: String(session.time || session.sessionTime || ''),
    }));
}

function sessionsFromSeatRows(rows) {
  const roundByDate = new Map();
  return rows.map((row) => {
    const date = String(row.session_date || '');
    const time = String(row.session_time || '');
    const round = (roundByDate.get(date) || 0) + 1;
    roundByDate.set(date, round);
    return { date, time, round };
  });
}

function assignZoneGeometry(sections) {
  const n = sections.length;
  const ANGLE_SPAN = 150;
  return sections.map((s, i) => {
    const angle = n === 1 ? 0 : Math.round(-ANGLE_SPAN / 2 + (i * ANGLE_SPAN) / (n - 1));
    const radius = 100 + i * 65;
    const blockW = Math.max(58, 92 - i * 6);
    const blockH = Math.max(46, 44 + i * 4);
    const color = GRADE_COLOR[s.name] || FALLBACK_PALETTE[i % FALLBACK_PALETTE.length];
    return { ...s, angle, radius, blockW, blockH, color, short: s.name.slice(0, 3) };
  });
}

// 이벤트 1건의 Redis 좌석/목록과 MariaDB 연동 데이터를 정리한다.
// 배치 삭제에서도 이 함수를 순차 호출해 Redis·DB에 순간 부하가 몰리지 않게 한다.
async function deleteEventData(eventId) {
  const removed = await redis.hdel(EVENT_LIST_KEY, eventId);
  if (removed === 0) {
    return { success: false, eventId, statusCode: 404, message: '해당 이벤트가 없습니다.' };
  }

  const deletedSeats = await seatService.cleanupEventSeats(eventId);
  await queueService.clearQueuesForEvent(eventId);
  let dbSynced = true;
  try {
    await pool.query(`DELETE FROM wishlists WHERE event_id = ?`, [eventId]);
    await pool.query(`DELETE FROM cancel_allocations WHERE event_id = ?`, [eventId]);
    await pool.query(`DELETE FROM seats WHERE event_id = ?`, [eventId]);
    await pool.query(`DELETE FROM reservations WHERE event_id = ?`, [eventId]);
    await pool.query(`DELETE FROM events WHERE event_id = ?`, [eventId]);
  } catch (dbErr) {
    dbSynced = false;
    console.error('[Event] MariaDB 삭제 동기화 실패:', dbErr.message);
  }

  return {
    success: true,
    eventId,
    deletedSeats: deletedSeats.deleted,
    dbSynced,
    message: dbSynced ? '이벤트가 삭제되었습니다.' : 'Redis에서는 삭제했지만 MariaDB 동기화에 실패했습니다.',
  };
}

async function eventRoutes(fastify) {

  fastify.post('/event/create', adminAuth, async (request, reply) => {
    const { eventName, eventDate, venue, sections, totalSeats, price, seatingType, description, cast, agency, runtime, ageRating, notices, sessions } = request.body || {};
    const VALID_SEATING = new Set(['arena', 'standing', 'theater']);
    const resolvedSeatingType = VALID_SEATING.has(seatingType) ? seatingType : 'arena';

    if (!eventName) {
      return reply.status(400).send({ error: 'eventName은 필수입니다.' });
    }

    // 이벤트 ID를 좌석 생성보다 먼저 만들어서, 좌석 ID 자체에 이벤트 ID를 심어둠
    // — 안 그러면 서로 다른 공연이 같은 구역명(VIP 등)을 쓸 때 Redis 키가 겹침
    const seq = await redis.incr(EVENT_SEQ_KEY);
    const eventId = `evt-${seq}`;

    const eventSessions = Array.isArray(sessions) && sessions.length > 0
      ? sessions
        .filter((s) => s && (s.date || s.time))
        .map((s) => ({ ...s, date: String(s.date || ''), time: String(s.time || '') }))
      : [{ date: String(eventDate || ''), time: '' }];
    if (eventSessions.length === 0) eventSessions.push({ date: String(eventDate || ''), time: '' });

    const sectionDefinitions = [];
    if (sections && Array.isArray(sections)) {
      for (const section of sections) {
        if (!section.name || !section.seats || section.seats < 1) {
          return reply.status(400).send({ error: '각 section에 name과 seats(1 이상)가 필요합니다.' });
        }
        sectionDefinitions.push({
          name: section.name,
          seats: Number(section.seats),
          price: Number(section.price || 0),
        });
      }
    } else if (totalSeats && totalSeats >= 1) {
      sectionDefinitions.push({ name: 'A', seats: Number(totalSeats), price: Number(price || 0) });
    } else {
      return reply.status(400).send({ error: 'sections 배열 또는 totalSeats가 필요합니다.' });
    }

    const seatsPerSession = sectionDefinitions.reduce((sum, section) => sum + section.seats, 0);
    const totalEventSeatCount = seatsPerSession * eventSessions.length;
    const firstSession = eventSessions[0];
    const sectionSummary = sectionDefinitions.map((section) => {
      const padLength = String(section.seats).length;
      const firstSeat = buildSeatId(eventId, firstSession, section.name, 1, padLength);
      const lastSeat = buildSeatId(eventId, firstSession, section.name, section.seats, padLength);
      return { ...section, range: `${firstSeat} ~ ${lastSeat}` };
    });

    // 공연의 각 회차마다 동일한 좌석 배치를 별도 좌석 inventory로 만든다.
    // 예: 3,322석 × 2회차 = 6,644개의 독립 좌석.
    for (const session of eventSessions) {
      for (const section of sectionDefinitions) {
        const padLength = String(section.seats).length;
        const seatIds = [];
        for (let i = 1; i <= section.seats; i++) {
          seatIds.push(buildSeatId(eventId, session, section.name, i, padLength));
        }
        await seatService.initSeats(seatIds, section.name, section.price, session);
      }
      await queueService.setTotalSeats(seatsPerSession, { eventId, sessionDate: session.date, sessionTime: session.time });
    }
    // 기존 관리자 시뮬레이션/레거시 API도 계속 동작하도록 기본 키에는 회차당 수용량을 유지한다.
    await queueService.setTotalSeats(seatsPerSession);
    await queueService.openTicketing();

    const sectionsWithGeometry = resolvedSeatingType === 'arena'
      ? assignZoneGeometry(sectionSummary)
      : sectionSummary;

    const extraFields = {};
    if (description) extraFields.description = description;
    if (cast) extraFields.cast = cast;
    if (agency) extraFields.agency = agency;
    if (runtime) extraFields.runtime = runtime;
    if (ageRating) extraFields.ageRating = ageRating;
    if (notices) extraFields.notices = notices;
    extraFields.sessions = eventSessions;
    extraFields.seatsPerSession = seatsPerSession;
    const hashExtras = {};
    for (const [k, v] of Object.entries(extraFields)) {
      hashExtras[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
    }
    await redis.hset(EVENT_KEY, {
      eventId,
      eventName,
      eventDate: eventDate || '',
      venue: venue || '',
      totalSeats: totalEventSeatCount.toString(),
      sections: JSON.stringify(sectionsWithGeometry),
      seatingType: resolvedSeatingType,
      status: 'open',
      createdAt: new Date().toISOString(),
      ...hashExtras,
    });

    const emojis = ['🎵', '🎭', '🎨', '🎷', '🎤', '🎸', '🎹', '🎻'];
    const colors = ['#667eea,#764ba2', '#f093fb,#f5576c', '#4facfe,#00f2fe', '#a18cd1,#fbc2eb', '#ffecd2,#fcb69f'];
    const chosenEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    const chosenColor = colors[Math.floor(Math.random() * colors.length)];

    try {
      await pool.query(
        `INSERT INTO events (event_id, event_name, title, event_date, venue, total_seats, seating_type, sections, status, emoji, color, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, NOW())`,
        [eventId, eventName, eventName, eventDate || '', venue || '', totalEventSeatCount, resolvedSeatingType, JSON.stringify(sectionsWithGeometry), chosenEmoji, chosenColor],
      );
    } catch (dbErr) {
      console.error('[Event] MariaDB 저장 실패:', dbErr.message);
    }

    const eventCard = JSON.stringify({
      eventId,
      eventName,
      eventDate: eventDate || '',
      venue: venue || '',
      totalSeats: totalEventSeatCount,
      seatsPerSession,
      price: sectionSummary[0]?.price || 0,
      sections: sectionsWithGeometry,
      seatingType: resolvedSeatingType,
      emoji: chosenEmoji,
      color: chosenColor,
      status: 'open',
      createdAt: new Date().toISOString(),
      ...extraFields,
    });
    await redis.hset(EVENT_LIST_KEY, eventId, eventCard);

    return reply.send({
      eventId,
      eventName,
      eventDate: eventDate || null,
      venue: venue || null,
      totalSeats: totalEventSeatCount,
      seatsPerSession,
      sessions: eventSessions,
      sections: sectionsWithGeometry,
      seatingType: resolvedSeatingType,
      message: `"${eventName}" 생성 완료 — ${eventSessions.length}회차, 총 ${totalEventSeatCount}석 (회차당 ${seatsPerSession}석)`,
    });
  });

  fastify.get('/event/info', async (request, reply) => {
    const info = await redis.hgetall(EVENT_KEY);
    if (!info || !info.eventName) {
      return reply.status(404).send({ message: '등록된 공연이 없습니다.' });
    }
    return reply.send({
      eventName: info.eventName,
      eventDate: info.eventDate || null,
      venue: info.venue || null,
      totalSeats: parseInt(info.totalSeats, 10),
      seatsPerSession: parseInt(info.seatsPerSession, 10) || parseInt(info.totalSeats, 10),
      sessions: JSON.parse(info.sessions || '[]'),
      sections: JSON.parse(info.sections || '[]'),
      seatingType: info.seatingType || 'arena',
      status: info.status || 'open',
      ticketOpenAt: info.ticketOpenAt || null,
      ticketCloseAt: info.ticketCloseAt || null,
      createdAt: info.createdAt,
    });
  });

  fastify.patch('/event/update', adminAuth, async (request, reply) => {
    const { eventName, eventDate, venue, reason, notify, users, priceUpdates } = request.body || {};

    const info = await redis.hgetall(EVENT_KEY);
    if (!info || !info.eventName) {
      return reply.status(404).send({ message: '등록된 공연이 없습니다.' });
    }

    if (info.status === 'cancelled') {
      return reply.status(409).send({ message: '이미 취소된 공연입니다.' });
    }

    const updates = {};
    const changes = [];

    if (eventName) {
      updates.eventName = eventName;
      changes.push(`공연명: ${info.eventName} → ${eventName}`);
    }
    if (eventDate) {
      updates.eventDate = eventDate;
      changes.push(`날짜: ${info.eventDate || '미정'} → ${eventDate}`);
    }
    if (venue) {
      updates.venue = venue;
      changes.push(`장소: ${info.venue || '미정'} → ${venue}`);
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date().toISOString();
      await redis.hset(EVENT_KEY, updates);

      try {
        const setClauses = [];
        const params = [];
        if (updates.eventName) { setClauses.push('event_name = ?'); params.push(updates.eventName); }
        if (updates.eventDate) { setClauses.push('event_date = ?'); params.push(updates.eventDate); }
        if (updates.venue) { setClauses.push('venue = ?'); params.push(updates.venue); }
        setClauses.push('updated_at = NOW()');
        if (setClauses.length > 0 && info.eventId) {
          params.push(info.eventId);
          await pool.query(`UPDATE events SET ${setClauses.join(', ')} WHERE event_id = ?`, params);
        }
      } catch (dbErr) {
        console.error('[Event] MariaDB 수정 동기화 실패:', dbErr.message);
      }
    }

    if (priceUpdates && Array.isArray(priceUpdates)) {
      for (const pu of priceUpdates) {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${SEAT_PREFIX}${info.eventId}:*${pu.section}-*`, 'COUNT', 200);
          cursor = nextCursor;
          const pipeline = redis.pipeline();
          for (const key of keys) {
            pipeline.hset(key, 'price', pu.price.toString());
          }
          await pipeline.exec();
        } while (cursor !== '0');
        changes.push(`${pu.section}석 가격: → ${pu.price.toLocaleString()}원`);
      }

      const sections = JSON.parse(info.sections || '[]');
      for (const pu of priceUpdates) {
        const section = sections.find(s => s.name === pu.section);
        if (section) section.price = pu.price;
      }
      await redis.hset(EVENT_KEY, 'sections', JSON.stringify(sections));
      updates.sections = sections;
    }

    if (info.eventId && (Object.keys(updates).length > 0)) {
      const cardStr = await redis.hget(EVENT_LIST_KEY, info.eventId);
      if (cardStr) {
        const card = JSON.parse(cardStr);
        if (updates.eventName) card.eventName = updates.eventName;
        if (updates.eventDate) card.eventDate = updates.eventDate;
        if (updates.venue) card.venue = updates.venue;
        if (updates.sections) {
          card.sections = updates.sections;
          card.price = updates.sections[0]?.price ?? card.price;
        }
        await redis.hset(EVENT_LIST_KEY, info.eventId, JSON.stringify(card));
      }
    }

    const changeDetail = changes.join(', ');

    let notificationResult = null;
    if (notify && users && users.length > 0) {
      notificationResult = await notifyEventUpdate(
        { eventName: updates.eventName || info.eventName },
        reason || changeDetail,
        users,
      );
    }

    return reply.send({
      changes,
      notification: notificationResult,
      message: `공연 정보 수정 완료: ${changeDetail}`,
    });
  });

  fastify.post('/event/cancel', adminAuth, async (request, reply) => {
    const { reason, users } = request.body || {};

    const info = await redis.hgetall(EVENT_KEY);
    if (!info || !info.eventName) {
      return reply.status(404).send({ message: '등록된 공연이 없습니다.' });
    }

    if (info.status === 'cancelled') {
      return reply.status(409).send({ message: '이미 취소된 공연입니다.' });
    }

    if (!reason) {
      return reply.status(400).send({ error: '취소 사유(reason)는 필수입니다.' });
    }

    await redis.hset(EVENT_KEY, {
      status: 'cancelled',
      cancelReason: reason,
      cancelledAt: new Date().toISOString(),
    });

    try {
      await pool.query(
        `UPDATE events SET status = 'cancelled', cancel_reason = ?, cancelled_at = NOW() WHERE event_id = ?`,
        [reason, info.eventId],
      );
    } catch (dbErr) {
      console.error('[Event] MariaDB 취소 동기화 실패:', dbErr.message);
    }

    const { deleted: cancelledSeats } = await seatService.cleanupEventSeats(info.eventId);

    await queueService.clearQueuesForEvent(info.eventId);
    await redis.del('queue:waiting', 'queue:standby', 'queue:admitted', 'queue:counter');

    await publishSeatEvent(EVENT_TYPE.SOLD_OUT, {
      seatId: 'ALL',
      message: `공연 취소: ${reason}`,
      cancelled: true,
    });

    let notificationResult = null;
    if (users && users.length > 0) {
      notificationResult = await notifyEventCancellation(
        {
          eventName: info.eventName,
          eventDate: info.eventDate,
          venue: info.venue,
        },
        reason,
        users,
      );
    }

    return reply.send({
      eventName: info.eventName,
      reason,
      cancelledSeats,
      notification: notificationResult,
      message: `"${info.eventName}" 공연이 취소되었습니다. ${cancelledSeats}석 초기화 완료.`,
    });

    const eventId = info.eventId;
    if (eventId) {
      const cardStr = await redis.hget(EVENT_LIST_KEY, eventId);
      if (cardStr) {
        const card = JSON.parse(cardStr);
        card.status = 'cancelled';
        await redis.hset(EVENT_LIST_KEY, eventId, JSON.stringify(card));
      }
    }
  });

  fastify.get('/events', async (request, reply) => {
    const events = await listEventCards();
    return reply.send({ events, count: events.length });
  });

  // 특정 공연의 회차 목록을 제공한다.
  // Redis 이벤트 카드에 저장된 회차를 우선 사용하고, Redis에 회차가 없으면
  // MariaDB seats의 session_date/session_time을 distinct 조회해 복원한다.
  fastify.get('/events/:eventId/sessions', async (request, reply) => {
    const eventId = String(request.params.eventId || '').trim();
    if (!eventId) {
      return reply.status(400).send({ error: 'eventId는 필수입니다.' });
    }

    let eventCard = null;
    try {
      const rawCard = await redis.hget(EVENT_LIST_KEY, eventId);
      eventCard = rawCard ? JSON.parse(rawCard) : null;
    } catch (err) {
      console.warn(`[Event] 회차 Redis 조회 실패 (${eventId}):`, err.message);
    }

    let sessions = normalizeEventSessions(eventCard?.sessions);
    let source = sessions.length > 0 ? 'redis' : '';
    let dbEvent = null;
    let dbError = null;

    // Redis에 완전한 회차 목록이 있으면 MariaDB를 추가 조회하지 않는다.
    // Redis 복구 상황이나 레거시 이벤트처럼 회차가 비어 있을 때만 DB를 사용한다.
    if (sessions.length === 0 || !eventCard) {
      try {
        const eventRows = await pool.query(
          `SELECT event_id, event_name, event_date
           FROM events WHERE event_id = ? LIMIT 1`,
          [eventId],
        );
        dbEvent = eventRows[0] || null;

        if (dbEvent) {
          const dbSessionRows = await pool.query(
            `SELECT DISTINCT session_date, session_time
             FROM seats
             WHERE event_id = ?
               AND (session_date <> '' OR session_time <> '')
             ORDER BY session_date, session_time`,
            [eventId],
          );
          if (dbSessionRows.length > 0) {
            sessions = sessionsFromSeatRows(dbSessionRows);
            source = 'mariadb.seats';
          }
        }
      } catch (err) {
        dbError = err;
        console.warn(`[Event] 회차 MariaDB 조회 실패 (${eventId}):`, err.message);
      }
    }

    const eventName = eventCard?.eventName || dbEvent?.event_name || '';
    const eventDate = eventCard?.eventDate || dbEvent?.event_date || '';
    if (sessions.length === 0 && eventDate) {
      sessions = [{ date: String(eventDate), time: '' }];
      source = 'event_date';
    }

    if (!eventCard && !dbEvent) {
      return reply.status(dbError ? 503 : 404).send({
        error: dbError ? '회차 정보를 조회할 수 없습니다.' : '해당 이벤트가 없습니다.',
      });
    }

    return reply.send({
      eventId,
      eventName,
      eventDate,
      sessions,
      count: sessions.length,
      source,
    });
  });

  fastify.patch('/events/:eventId/open-time', adminAuth, async (request, reply) => {
    const { eventId } = request.params;
    const { ticketOpenAt } = request.body || {};
    const parsedOpenAt = ticketOpenAt ? new Date(ticketOpenAt) : null;

    if (ticketOpenAt !== null && ticketOpenAt !== undefined) {
      if (Number.isNaN(parsedOpenAt?.getTime())) {
        return reply.status(400).send({ error: 'ticketOpenAt이 올바른 날짜/시간 형식이 아닙니다.' });
      }
    }

    const cardStr = await redis.hget(EVENT_LIST_KEY, eventId);
    if (!cardStr) {
      return reply.status(404).send({ message: '해당 이벤트가 없습니다.' });
    }
    const card = JSON.parse(cardStr);
    const normalizedOpenAt = parsedOpenAt ? parsedOpenAt.toISOString() : null;

    // 오픈 예정 시간은 Redis 캐시뿐 아니라 MariaDB에도 저장해야
    // Redis 초기화(resync/recover) 후에도 같은 설정을 복구할 수 있다.
    try {
      const dbEvents = await pool.query(
        'SELECT event_id FROM events WHERE event_id = ?',
        [eventId],
      );
      if (dbEvents.length === 0) {
        return reply.status(404).send({ error: 'MariaDB에 해당 이벤트가 없습니다.' });
      }
      await pool.query(
        'UPDATE events SET ticket_open_at = ? WHERE event_id = ?',
        [parsedOpenAt, eventId],
      );
    } catch (dbErr) {
      console.error('[Event] 예매 오픈 시간 MariaDB 저장 실패:', dbErr.message);
      return reply.status(500).send({ error: '예매 오픈 시간을 DB에 저장하지 못했습니다.' });
    }

    card.ticketOpenAt = normalizedOpenAt;
    await redis.hset(EVENT_LIST_KEY, eventId, JSON.stringify(card));

    const info = await redis.hgetall(EVENT_KEY);
    if (info && info.eventId === eventId) {
      if (card.ticketOpenAt) {
        await redis.hset(EVENT_KEY, 'ticketOpenAt', card.ticketOpenAt);
      } else {
        await redis.hdel(EVENT_KEY, 'ticketOpenAt');
      }
    }

    return reply.send({
      success: true,
      eventId,
      ticketOpenAt: card.ticketOpenAt,
      message: card.ticketOpenAt
        ? `예매 오픈 시간이 ${card.ticketOpenAt}로 설정되었습니다.`
        : '예매 오픈 시간 제한이 해제되었습니다.',
    });
  });

  fastify.patch('/events/:eventId/close-time', adminAuth, async (request, reply) => {
    const { eventId } = request.params;
    const { ticketCloseAt } = request.body || {};

    if (ticketCloseAt !== null && ticketCloseAt !== undefined) {
      const parsed = new Date(ticketCloseAt);
      if (Number.isNaN(parsed.getTime())) {
        return reply.status(400).send({ error: 'ticketCloseAt이 올바른 날짜/시간 형식이 아닙니다.' });
      }
    }

    const cardStr = await redis.hget(EVENT_LIST_KEY, eventId);
    if (!cardStr) {
      return reply.status(404).send({ message: '해당 이벤트가 없습니다.' });
    }
    const card = JSON.parse(cardStr);
    card.ticketCloseAt = ticketCloseAt || null;

    const isImmediatelyClosed = card.ticketCloseAt
      && new Date(card.ticketCloseAt).getTime() <= Date.now();

    if (isImmediatelyClosed && card.status !== 'cancelled' && card.status !== 'sold_out') {
      card.status = 'closed';
    }

    await redis.hset(EVENT_LIST_KEY, eventId, JSON.stringify(card));

    const info = await redis.hgetall(EVENT_KEY);
    if (info && info.eventId === eventId) {
      if (card.ticketCloseAt) {
        await redis.hset(EVENT_KEY, 'ticketCloseAt', card.ticketCloseAt);
      } else {
        await redis.hdel(EVENT_KEY, 'ticketCloseAt');
      }
      if (isImmediatelyClosed) {
        await redis.hset(EVENT_KEY, 'status', 'closed');
      }
    }

    try {
      const parsedCloseAt = card.ticketCloseAt ? new Date(card.ticketCloseAt) : null;
      if (isImmediatelyClosed) {
        await pool.query(
          'UPDATE events SET ticket_close_at = ?, status = ? WHERE event_id = ?',
          [parsedCloseAt, 'closed', eventId],
        );
      } else {
        await pool.query(
          'UPDATE events SET ticket_close_at = ? WHERE event_id = ?',
          [parsedCloseAt, eventId],
        );
      }
    } catch (dbErr) {
      console.error('[Event] 마감 시간 MariaDB 저장 실패:', dbErr.message);
    }

    return reply.send({
      success: true,
      eventId,
      ticketCloseAt: card.ticketCloseAt,
      status: card.status,
      message: card.ticketCloseAt
        ? `마감 시간이 ${card.ticketCloseAt}로 설정되었습니다.`
        : '마감 시간 제한이 해제되었습니다 (수동 마감).',
    });
  });

  // 최대 5개를 한 번에 받되, 내부 처리는 순차적으로 진행한다.
  // 단일 삭제 API보다 빠르게 여러 건을 정리하면서도 DB/Redis 동시 요청 폭증은 피한다.
  fastify.post('/events/batch-delete', adminAuth, async (request, reply) => {
    const rawEventIds = request.body?.eventIds;
    if (!Array.isArray(rawEventIds) || rawEventIds.length === 0) {
      return reply.status(400).send({ success: false, message: '삭제할 eventIds 배열이 필요합니다.' });
    }

    const eventIds = [...new Set(rawEventIds.map((id) => String(id).trim()).filter(Boolean))];
    if (eventIds.length > 5) {
      return reply.status(400).send({ success: false, message: '한 번에 최대 5개 공연까지만 삭제할 수 있습니다.' });
    }

    const results = [];
    for (const eventId of eventIds) {
      try {
        results.push(await deleteEventData(eventId));
      } catch (err) {
        console.error(`[Event] 배치 삭제 실패 (${eventId}):`, err.message);
        results.push({ success: false, eventId, statusCode: 500, message: '삭제 처리 중 오류가 발생했습니다.' });
      }
    }

    const deleted = results.filter((result) => result.success);
    const failed = results.filter((result) => !result.success || result.dbSynced === false);
    return reply.send({
      success: failed.length === 0,
      deletedCount: deleted.length,
      failedCount: failed.length,
      results,
      message: failed.length === 0 ? `${deleted.length}개 공연이 삭제되었습니다.` : '일부 공연 삭제 또는 DB 동기화에 실패했습니다.',
    });
  });

  fastify.delete('/events/:eventId', adminAuth, async (request, reply) => {
    const result = await deleteEventData(request.params.eventId);
    if (!result.success) return reply.status(result.statusCode || 404).send(result);
    return reply.send(result);
  });

  fastify.post('/events/seed', adminAuth, async (request, reply) => {
    const dummyEvents = [
      { eventId: 'demo-1', eventName: '2026 연말 콘서트', eventDate: '2026-12-25', venue: '올림픽공원 체조경기장', totalSeats: 1000, price: 99000, emoji: '🎵', color: '#667eea,#764ba2', status: 'open' },
      { eventId: 'demo-2', eventName: '현대미술 특별전', eventDate: '상시', venue: '국립현대미술관', totalSeats: 500, price: 15000, emoji: '🎨', color: '#f093fb,#f5576c', status: 'open' },
      { eventId: 'demo-3', eventName: '뮤지컬 팬텀', eventDate: '2027-01-15', venue: '블루스퀘어', totalSeats: 800, price: 120000, emoji: '🎭', color: '#4facfe,#00f2fe', status: 'open' },
      { eventId: 'demo-4', eventName: '재즈 페스티벌', eventDate: '2026-09-15', venue: '예술의전당', totalSeats: 600, price: 77000, emoji: '🎷', color: '#a18cd1,#fbc2eb', status: 'open' },
      { eventId: 'demo-5', eventName: 'K-POP 콘서트', eventDate: '2026-11-20', venue: '고척스카이돔', totalSeats: 2000, price: 110000, emoji: '🎤', color: '#ffecd2,#fcb69f', status: 'open' },
    ];

    const pipeline = redis.pipeline();
    dummyEvents.forEach(e => {
      e.createdAt = new Date().toISOString();
      pipeline.hset(EVENT_LIST_KEY, e.eventId, JSON.stringify(e));
    });
    await pipeline.exec();

    let dbSaved = 0;
    let dbError = null;
    try {
      for (const e of dummyEvents) {
        await pool.query(
          `INSERT INTO events (event_id, event_name, title, event_date, venue, total_seats, seating_type, status, emoji, color, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'arena', 'open', ?, ?, NOW())
           ON DUPLICATE KEY UPDATE event_name = VALUES(event_name), title = VALUES(title), event_date = VALUES(event_date),
             venue = VALUES(venue), total_seats = VALUES(total_seats), status = 'open',
             emoji = VALUES(emoji), color = VALUES(color)`,
          [e.eventId, e.eventName, e.eventName, e.eventDate, e.venue, e.totalSeats, e.emoji, e.color],
        );
        dbSaved++;
      }
    } catch (dbErr) {
      dbError = dbErr.message;
      console.error('[Event] MariaDB 시드 저장 실패:', dbErr.message);
    }

    return reply.send({ seeded: dummyEvents.length, dbSaved, dbError, message: '더미 이벤트 5개 생성 완료' });
  });

  fastify.post('/admin/redis/reset', adminAuth, async (request, reply) => {
    const { mode = 'soft' } = request.body || {};
    const cleared = [];

    await redis.del(EVENT_KEY);
    cleared.push('event:info');

    await redis.del('queue:waiting', 'queue:standby', 'queue:admitted', 'queue:counter');
    cleared.push('queue:waiting', 'queue:standby', 'queue:admitted', 'queue:counter');

    let cursor = '0';
    let scopedQueueCount = 0;
    cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'queue:*:*:*', 'COUNT', 200);
      cursor = next;
      if (keys.length > 0) {
        await redis.del(...keys);
        scopedQueueCount += keys.length;
      }
    } while (cursor !== '0');
    if (scopedQueueCount > 0) cleared.push(`session queue keys (${scopedQueueCount})`);

    await redis.del('event:sold-out', 'event:ticketing-status');
    cleared.push('event:sold-out', 'event:ticketing-status');

    let scopedEventKeyCount = 0;
    cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'event:*:*:*', 'COUNT', 200);
      cursor = next;
      const scopedKeys = keys.filter((key) => key.startsWith('event:sold-out:') || key.startsWith('event:ticketing-status:') || key.startsWith('event:total-seats:'));
      if (scopedKeys.length > 0) {
        await redis.del(...scopedKeys);
        scopedEventKeyCount += scopedKeys.length;
      }
    } while (cursor !== '0');
    if (scopedEventKeyCount > 0) cleared.push(`session event keys (${scopedEventKeyCount})`);

    let tokenCount = 0;
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'admission:*', 'COUNT', 200);
      cursor = next;
      if (keys.length > 0) {
        await redis.del(...keys);
        tokenCount += keys.length;
      }
    } while (cursor !== '0');
    if (tokenCount > 0) cleared.push(`admission tokens (${tokenCount})`);

    let seatCount = 0;
    if (mode === 'hard') {
      cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', `${SEAT_PREFIX}*`, 'COUNT', 200);
        cursor = next;
        if (keys.length > 0) {
          await redis.del(...keys);
          seatCount += keys.length;
        }
      } while (cursor !== '0');
      cleared.push(`seat keys (${seatCount})`);
    }

    let resynced = 0;
    if (mode === 'resync' || mode === 'hard') {
      await redis.del(EVENT_LIST_KEY);
      try {
      const rows = await pool.query('SELECT * FROM events ORDER BY created_at DESC');
      const pipeline = redis.pipeline();
      rows.forEach((r) => {
          const card = eventCardFromRow(r);
          pipeline.hset(EVENT_LIST_KEY, card.eventId, JSON.stringify(card));
          resynced++;
        });
        await pipeline.exec();
      } catch (dbErr) {
        console.error('[Redis Reset] MariaDB resync 실패:', dbErr.message);
      }
      cleared.push(`events:list resync (${resynced})`);
    }

    console.log(`[Redis Reset] mode=${mode} — ${cleared.join(', ')}`);
    return reply.send({
      success: true,
      mode,
      cleared,
      seatCount,
      resynced,
      message: `Redis 초기화 완료 (${mode})`,
    });
  });

  fastify.post('/admin/redis/recover', adminAuth, async (request, reply) => {
    const { eventId } = request.body || {};
    try {
      const results = await recoverAll({ eventId: eventId || null, reason: 'manual', force: true });
      if (results.skipped && results.reason === 'another recovery is running') {
        return reply.status(409).send({ success: false, message: '다른 Redis 복구 작업이 진행 중입니다.' });
      }
      return reply.send({
        success: results.recovered,
        eventId: results.eventInfo?.eventId || eventId || null,
        results,
        message: results.recovered ? 'MariaDB → Redis 전체 복구 완료' : 'Redis 복구가 필요하지 않습니다.',
      });
    } catch (err) {
      console.error('[Redis Recover] 전체 복구 실패:', err.message);
      return reply.status(500).send({ success: false, message: 'MariaDB → Redis 복구에 실패했습니다.', error: err.message });
    }
  });

  fastify.post('/admin/test-email', adminAuth, async (request, reply) => {
    const { to, subject, body } = request.body || {};
    if (!to) return reply.status(400).send({ success: false, message: '수신자 이메일(to)을 입력해주세요.' });

    const result = await sendEmail(
      to,
      subject || '[QUEUING] 테스트 메일',
      body || `
        <h2>QUEUING 테스트 메일</h2>
        <p>이 메일은 이메일 발송 기능 테스트를 위해 전송되었습니다.</p>
        <p><strong>발송 시각:</strong> ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
        <hr>
        <p>— QUEUING 팀</p>
      `,
    );
    return reply.send(result);
  });
}

module.exports = eventRoutes;
