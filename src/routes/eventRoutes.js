const redis = require('../config/redis');
const pool = require('../config/mariadb');
const queueService = require('../services/queueService');
const seatService = require('../services/seatService');
const { notifyEventCancellation, notifyEventUpdate } = require('../services/notificationService');
const { publishSeatEvent, EVENT_TYPE } = require('../services/eventService');

const EVENT_KEY = 'event:info';
const EVENT_LIST_KEY = 'events:list';
const SEAT_PREFIX = 'seat:';

const GRADE_COLOR = { VIP: '#B5121B', R: '#C98500', S: '#199E70', A: '#3987E5' };
const FALLBACK_PALETTE = ['#B5121B', '#C98500', '#199E70', '#3987E5', '#8E44AD', '#16A085', '#D35400', '#2C3E50'];

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

async function eventRoutes(fastify) {

  fastify.post('/event/create', async (request, reply) => {
    const { eventName, eventDate, venue, sections, totalSeats, price, seatingType, description, cast, agency, runtime, ageRating, notices, sessions } = request.body || {};
    const VALID_SEATING = new Set(['arena', 'standing', 'theater']);
    const resolvedSeatingType = VALID_SEATING.has(seatingType) ? seatingType : 'arena';

    if (!eventName) {
      return reply.status(400).send({ error: 'eventName은 필수입니다.' });
    }

    // 이벤트 ID를 좌석 생성보다 먼저 만들어서, 좌석 ID 자체에 이벤트 ID를 심어둠
    // (evt-171...:VIP-001) — 안 그러면 서로 다른 공연이 같은 구역명(VIP 등)을
    // 쓸 때 Redis 키가 겹쳐서 좌석 데이터가 섞이는 문제가 있었음
    const eventId = 'evt-' + Date.now();

    let allSeatIds = [];
    let totalSeatCount = 0;
    let sectionSummary = [];

    if (sections && Array.isArray(sections)) {
      for (const section of sections) {
        if (!section.name || !section.seats || section.seats < 1) {
          return reply.status(400).send({ error: '각 section에 name과 seats(1 이상)가 필요합니다.' });
        }
        const padLength = String(section.seats).length;
        const seatIds = [];
        for (let i = 1; i <= section.seats; i++) {
          seatIds.push(`${eventId}:${section.name}-${String(i).padStart(padLength, '0')}`);
        }
        await seatService.initSeats(seatIds, section.name, section.price || 0);
        allSeatIds.push(...seatIds);
        totalSeatCount += section.seats;
        sectionSummary.push({
          name: section.name,
          seats: section.seats,
          price: section.price || 0,
          range: `${seatIds[0]} ~ ${seatIds[seatIds.length - 1]}`,
        });
      }
    } else if (totalSeats && totalSeats >= 1) {
      const padLength = String(totalSeats).length;
      for (let i = 1; i <= totalSeats; i++) {
        allSeatIds.push(`${eventId}:A-${String(i).padStart(padLength, '0')}`);
      }
      await seatService.initSeats(allSeatIds, 'A', price || 0);
      totalSeatCount = totalSeats;
      sectionSummary.push({
        name: 'A',
        seats: totalSeats,
        price: price || 0,
        range: `${allSeatIds[0]} ~ ${allSeatIds[allSeatIds.length - 1]}`,
      });
    } else {
      return reply.status(400).send({ error: 'sections 배열 또는 totalSeats가 필요합니다.' });
    }

    await queueService.setTotalSeats(totalSeatCount);
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
    if (sessions) extraFields.sessions = sessions;
    const hashExtras = {};
    for (const [k, v] of Object.entries(extraFields)) {
      hashExtras[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
    }
    await redis.hset(EVENT_KEY, {
      eventId,
      eventName,
      eventDate: eventDate || '',
      venue: venue || '',
      totalSeats: totalSeatCount.toString(),
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
        [eventId, eventName, eventName, eventDate || '', venue || '', totalSeatCount, resolvedSeatingType, JSON.stringify(sectionsWithGeometry), chosenEmoji, chosenColor],
      );
    } catch (dbErr) {
      console.error('[Event] MariaDB 저장 실패:', dbErr.message);
    }

    const eventCard = JSON.stringify({
      eventId,
      eventName,
      eventDate: eventDate || '',
      venue: venue || '',
      totalSeats: totalSeatCount,
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
      totalSeats: totalSeatCount,
      sections: sectionsWithGeometry,
      seatingType: resolvedSeatingType,
      message: `"${eventName}" 생성 완료 — 총 ${totalSeatCount}석`,
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
      sections: JSON.parse(info.sections || '[]'),
      seatingType: info.seatingType || 'arena',
      status: info.status || 'open',
      ticketOpenAt: info.ticketOpenAt || null,
      ticketCloseAt: info.ticketCloseAt || null,
      createdAt: info.createdAt,
    });
  });

  fastify.patch('/event/update', async (request, reply) => {
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
          const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${SEAT_PREFIX}${info.eventId}:${pu.section}-*`, 'COUNT', 200);
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

  fastify.post('/event/cancel', async (request, reply) => {
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
    const all = await redis.hgetall(EVENT_LIST_KEY);
    let events = Object.values(all || {}).map(v => JSON.parse(v));

    if (events.length === 0) {
      try {
        const rows = await pool.query(`SELECT * FROM events ORDER BY created_at DESC`);
        events = rows.map(r => ({
          eventId: r.event_id,
          eventName: r.event_name,
          eventDate: r.event_date || '',
          venue: r.venue || '',
          totalSeats: r.total_seats,
          seatingType: r.seating_type || 'arena',
          sections: typeof r.sections === 'string' ? JSON.parse(r.sections) : r.sections || [],
          status: r.status || 'open',
          emoji: r.emoji || '🎵',
          color: r.color || '#667eea,#764ba2',
          ticketOpenAt: r.ticket_open_at || null,
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
        }));
        if (events.length > 0) {
          const pipeline = redis.pipeline();
          events.forEach(e => pipeline.hset(EVENT_LIST_KEY, e.eventId, JSON.stringify(e)));
          await pipeline.exec();
        }
      } catch (dbErr) {
        console.error('[Event] MariaDB 폴백 조회 실패:', dbErr.message);
      }
    }

    events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return reply.send({ events, count: events.length });
  });

  fastify.patch('/events/:eventId/open-time', async (request, reply) => {
    const { eventId } = request.params;
    const { ticketOpenAt } = request.body || {};

    if (ticketOpenAt !== null && ticketOpenAt !== undefined) {
      const parsed = new Date(ticketOpenAt);
      if (Number.isNaN(parsed.getTime())) {
        return reply.status(400).send({ error: 'ticketOpenAt이 올바른 날짜/시간 형식이 아닙니다.' });
      }
    }

    const cardStr = await redis.hget(EVENT_LIST_KEY, eventId);
    if (!cardStr) {
      return reply.status(404).send({ message: '해당 이벤트가 없습니다.' });
    }
    const card = JSON.parse(cardStr);
    card.ticketOpenAt = ticketOpenAt || null;
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

  fastify.patch('/events/:eventId/close-time', async (request, reply) => {
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
    await redis.hset(EVENT_LIST_KEY, eventId, JSON.stringify(card));

    const info = await redis.hgetall(EVENT_KEY);
    if (info && info.eventId === eventId) {
      if (card.ticketCloseAt) {
        await redis.hset(EVENT_KEY, 'ticketCloseAt', card.ticketCloseAt);
        await queueService.scheduleCloseTime(card.ticketCloseAt);
      } else {
        await redis.hdel(EVENT_KEY, 'ticketCloseAt');
        await queueService.cancelCloseSchedule();
      }
    }

    return reply.send({
      success: true,
      eventId,
      ticketCloseAt: card.ticketCloseAt,
      message: card.ticketCloseAt
        ? `마감 시간이 ${card.ticketCloseAt}로 설정되었습니다.`
        : '마감 시간 제한이 해제되었습니다 (수동 마감).',
    });
  });

  fastify.delete('/events/:eventId', async (request, reply) => {
    const { eventId } = request.params;
    const removed = await redis.hdel(EVENT_LIST_KEY, eventId);
    if (removed === 0) {
      return reply.status(404).send({ message: '해당 이벤트가 없습니다.' });
    }
    await seatService.cleanupEventSeats(eventId);
    try {
      await pool.query(`DELETE FROM wishlists WHERE event_id = ?`, [eventId]);
      await pool.query(`DELETE FROM seats WHERE event_id = ?`, [eventId]);
      await pool.query(`DELETE FROM reservations WHERE event_id = ?`, [eventId]);
      await pool.query(`DELETE FROM events WHERE event_id = ?`, [eventId]);
    } catch (dbErr) {
      console.error('[Event] MariaDB 삭제 동기화 실패:', dbErr.message);
    }
    return reply.send({ success: true, eventId, message: '이벤트가 삭제되었습니다.' });
  });

  fastify.post('/events/seed', async (request, reply) => {
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

  fastify.post('/admin/redis/reset', async (request, reply) => {
    const { mode = 'soft' } = request.body || {};
    const cleared = [];

    await redis.del(EVENT_KEY);
    cleared.push('event:info');

    await redis.del('queue:waiting', 'queue:standby', 'queue:admitted', 'queue:counter');
    cleared.push('queue:waiting', 'queue:standby', 'queue:admitted', 'queue:counter');

    await redis.del('event:sold-out', 'event:ticketing-status');
    cleared.push('event:sold-out', 'event:ticketing-status');

    let tokenCount = 0;
    let cursor = '0';
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
          const card = {
            eventId: r.event_id,
            eventName: r.event_name,
            eventDate: r.event_date || '',
            venue: r.venue || '',
            totalSeats: r.total_seats,
            seatingType: r.seating_type || 'arena',
            sections: typeof r.sections === 'string' ? JSON.parse(r.sections) : r.sections || [],
            status: r.status || 'open',
            emoji: r.emoji || '',
            color: r.color || '#667eea,#764ba2',
            ticketOpenAt: r.ticket_open_at || null,
            ticketCloseAt: r.ticket_close_at || null,
            createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
          };
          if (r.description) card.description = r.description;
          if (r.cast) card.cast = r.cast;
          if (r.sessions) {
            try { card.sessions = typeof r.sessions === 'string' ? JSON.parse(r.sessions) : r.sessions; } catch {}
          }
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

  fastify.post('/admin/redis/recover', async (request, reply) => {
    const { eventId } = request.body || {};

    let targetEventId = eventId;
    if (!targetEventId) {
      const rows = await pool.query(
        "SELECT event_id FROM events WHERE status = 'open' ORDER BY created_at DESC LIMIT 1",
      );
      if (rows.length === 0) {
        return reply.status(400).send({ success: false, message: 'open 상태의 이벤트가 없습니다. eventId를 직접 지정해주세요.' });
      }
      targetEventId = rows[0].event_id;
    }

    const results = {};

    try {
      const allEvents = await pool.query('SELECT * FROM events ORDER BY created_at DESC');
      if (allEvents.length > 0) {
        const pipeline = redis.pipeline();
        allEvents.forEach((r) => {
          const card = {
            eventId: r.event_id,
            eventName: r.event_name,
            eventDate: r.event_date || '',
            venue: r.venue || '',
            totalSeats: r.total_seats,
            seatingType: r.seating_type || 'arena',
            sections: typeof r.sections === 'string' ? JSON.parse(r.sections) : r.sections || [],
            status: r.status || 'open',
            emoji: r.emoji || '',
            color: r.color || '#667eea,#764ba2',
            ticketOpenAt: r.ticket_open_at || null,
            ticketCloseAt: r.ticket_close_at || null,
            createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
          };
          if (r.description) card.description = r.description;
          pipeline.hset(EVENT_LIST_KEY, card.eventId, JSON.stringify(card));
        });
        await pipeline.exec();
        results.events = { recovered: true, count: allEvents.length };
      }
    } catch (err) {
      results.events = { recovered: false, error: err.message };
    }

    try {
      const evtRows = await pool.query('SELECT * FROM events WHERE event_id = ?', [targetEventId]);
      if (evtRows.length > 0) {
        const e = evtRows[0];
        await redis.hset(EVENT_KEY, {
          eventId: e.event_id,
          eventName: e.event_name,
          eventDate: e.event_date || '',
          venue: e.venue || '',
          totalSeats: (e.total_seats || 0).toString(),
          seatingType: e.seating_type || 'arena',
          status: e.status || 'open',
        });
        results.eventInfo = { recovered: true, eventId: targetEventId };
      }
    } catch (err) {
      results.eventInfo = { recovered: false, error: err.message };
    }

    try {
      results.seats = await seatService.recoverSeatsFromMariaDB(targetEventId);
    } catch (err) {
      results.seats = { recovered: false, error: err.message };
    }

    try {
      results.queue = await queueService.recoverQueueFromMariaDB(targetEventId);
    } catch (err) {
      results.queue = { recovered: false, error: err.message };
    }

    const ticketingStatus = await redis.get('event:ticketing-status');
    if (!ticketingStatus) {
      await redis.set('event:ticketing-status', 'open');
      results.ticketingStatus = 'open (기본값 설정)';
    } else {
      results.ticketingStatus = `${ticketingStatus} (기존 유지)`;
    }

    console.log(`[Redis Recover] eventId=${targetEventId}`, JSON.stringify(results));
    return reply.send({
      success: true,
      eventId: targetEventId,
      results,
      message: `MariaDB → Redis 복구 완료 (${targetEventId})`,
    });
  });
}

module.exports = eventRoutes;
