const redis = require('../config/redis');
const pool = require('../config/mariadb');
const queueService = require('../services/queueService');
const seatService = require('../services/seatService');
const { notifyEventCancellation, notifyEventUpdate } = require('../services/notificationService');
const { publishSeatEvent, EVENT_TYPE } = require('../services/eventService');

// 이벤트 정보 저장용 Redis 키
const EVENT_KEY = 'event:info';           // 현재 활성 이벤트 (예매 진행 중)
const EVENT_LIST_KEY = 'events:list';     // 전체 이벤트 목록 (홈 카드 표시용)
const SEAT_PREFIX = 'seat:';

// 구역 등급별 기본 색상 (프론트 zoneSelect의 GRADE_COLOR와 동일하게 맞춤)
const GRADE_COLOR = { VIP: '#B5121B', R: '#C98500', S: '#199E70', A: '#3987E5' };
const FALLBACK_PALETTE = ['#B5121B', '#C98500', '#199E70', '#3987E5', '#8E44AD', '#16A085', '#D35400', '#2C3E50'];

/**
 * 부채꼴(아레나) 좌석맵 좌표 자동 계산
 * - 프론트 신규 디자인(zone-fan)은 구역마다 angle/radius/blockW/blockH 좌표가 있어야
 *   무대를 중심으로 부채꼴 형태로 배치할 수 있음
 * - 구역 생성 순서를 무대에서 가까운 순(반지름이 작은 순)으로 간주해
 *   중심을 기준으로 대칭으로 펼쳐 배치
 */
function assignZoneGeometry(sections) {
  const n = sections.length;
  const ANGLE_SPAN = 150; // 무대를 중심으로 펼쳐지는 총 각도(도)
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

  // =============================================
  // 공연 생성
  // =============================================

  /**
   * 공연 생성 API
   *
   * 구역별 생성:
   * {
   *   "eventName": "2026 콘서트",
   *   "eventDate": "2026-12-25",
   *   "venue": "올림픽공원 체조경기장",
   *   "sections": [
   *     { "name": "VIP", "seats": 100, "price": 150000 },
   *     { "name": "R", "seats": 500, "price": 99000 },
   *     { "name": "S", "seats": 400, "price": 77000 }
   *   ]
   * }
   *
   * 단일 구역 간편 생성:
   * { "eventName": "2026 팬미팅", "totalSeats": 5, "price": 88000 }
   */
  fastify.post('/event/create', async (request, reply) => {
    const { eventName, eventDate, venue, sections, totalSeats, price, seatingType } = request.body || {};
    // seatingType: 'arena'(부채꼴, 기본값) | 'standing'(스탠딩 그리드 — 좌표 불필요)
    const resolvedSeatingType = seatingType === 'standing' ? 'standing' : 'arena';

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
      // ===== 구역별 생성 =====
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
      // ===== 단일 구역 간편 생성 =====
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

    // 부채꼴(아레나) 좌석맵일 때만 구역별 좌표(angle/radius/blockW/blockH) 자동 계산
    // — 프론트 신규 디자인의 .zone-fan 렌더링에 필요. standing은 좌표 없이 그리드로 표시.
    const sectionsWithGeometry = resolvedSeatingType === 'arena'
      ? assignZoneGeometry(sectionSummary)
      : sectionSummary;

    // 이벤트 정보 저장 (활성 이벤트)
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
    });

    // MariaDB events 테이블에 영구 저장
    const emojis = ['🎵', '🎭', '🎨', '🎷', '🎤', '🎸', '🎹', '🎻'];
    const colors = ['#667eea,#764ba2', '#f093fb,#f5576c', '#4facfe,#00f2fe', '#a18cd1,#fbc2eb', '#ffecd2,#fcb69f'];
    const chosenEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    const chosenColor = colors[Math.floor(Math.random() * colors.length)];

    try {
      await pool.query(
        `INSERT INTO events (event_id, event_name, event_date, venue, total_seats, seating_type, sections, status, emoji, color, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, NOW())`,
        [eventId, eventName, eventDate || '', venue || '', totalSeatCount, resolvedSeatingType, JSON.stringify(sectionsWithGeometry), chosenEmoji, chosenColor],
      );
    } catch (dbErr) {
      console.error('[Event] MariaDB 저장 실패:', dbErr.message);
    }

    // Redis 캐시에도 저장 (실시간 조회 성능용)
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

  // =============================================
  // 공연 정보 조회
  // =============================================

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
      createdAt: info.createdAt,
    });
  });

  // =============================================
  // 공연 정보 수정
  // =============================================

  /**
   * 공연 정보 수정 API
   * - 공연명, 날짜, 장소, 구역별 가격 수정 가능
   * - 수정 시 예매자에게 이메일/문자 알림 발송
   *
   * 요청 예시:
   * {
   *   "eventDate": "2026-12-31",
   *   "venue": "잠실종합운동장",
   *   "reason": "장소 변경",
   *   "notify": true,
   *   "users": [
   *     { "userId": "user-001", "email": "a@test.com", "phone": "+821012345678" }
   *   ]
   * }
   */
  fastify.patch('/event/update', async (request, reply) => {
    const { eventName, eventDate, venue, reason, notify, users, priceUpdates } = request.body || {};

    // 현재 이벤트 정보 조회
    const info = await redis.hgetall(EVENT_KEY);
    if (!info || !info.eventName) {
      return reply.status(404).send({ message: '등록된 공연이 없습니다.' });
    }

    if (info.status === 'cancelled') {
      return reply.status(409).send({ message: '이미 취소된 공연입니다.' });
    }

    // 변경할 필드만 업데이트
    const updates = {};
    const changes = [];          // 변경 이력

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

      // MariaDB 동기화
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

    // 구역별 가격 수정 (Redis 좌석 데이터 직접 업데이트)
    if (priceUpdates && Array.isArray(priceUpdates)) {
      for (const pu of priceUpdates) {
        // pu = { section: "VIP", price: 180000 }
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

      // sections 정보도 업데이트 (구역 좌표(angle/radius 등)는 그대로 유지됨)
      const sections = JSON.parse(info.sections || '[]');
      for (const pu of priceUpdates) {
        const section = sections.find(s => s.name === pu.section);
        if (section) section.price = pu.price;
      }
      await redis.hset(EVENT_KEY, 'sections', JSON.stringify(sections));
      updates.sections = sections;
    }

    // /events 목록 카드도 동기화 — 프론트가 /events 한 번으로 최신 이름/장소/구역
    // 정보를 받으므로, 여기서 갱신 안 하면 목록 화면에서 옛날 정보가 계속 보임
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

    // 예매자에게 알림 발송
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

  // =============================================
  // 공연 취소
  // =============================================

  /**
   * 공연 취소 API
   * - 전체 좌석 초기화 + 대기열 초기화
   * - 예매자 전원에게 취소 사유 포함 이메일/문자 발송
   *
   * 요청 예시:
   * {
   *   "reason": "아티스트 건강 상의 사유로 공연이 취소되었습니다.",
   *   "users": [
   *     { "userId": "user-001", "email": "a@test.com", "phone": "+821012345678", "seatId": "VIP-01" },
   *     { "userId": "user-002", "email": "b@test.com", "phone": "+821098765432", "seatId": "R-001" }
   *   ]
   * }
   */
  fastify.post('/event/cancel', async (request, reply) => {
    const { reason, users } = request.body || {};

    // 현재 이벤트 정보 조회
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

    // 1) 공연 상태를 cancelled로 변경
    await redis.hset(EVENT_KEY, {
      status: 'cancelled',
      cancelReason: reason,
      cancelledAt: new Date().toISOString(),
    });

    // MariaDB 동기화
    try {
      await pool.query(
        `UPDATE events SET status = 'cancelled', cancel_reason = ?, cancelled_at = NOW() WHERE event_id = ?`,
        [reason, info.eventId],
      );
    } catch (dbErr) {
      console.error('[Event] MariaDB 취소 동기화 실패:', dbErr.message);
    }

    // 2) 해당 이벤트의 좌석 키 일괄 삭제 (Redis 메모리 확보)
    const { deleted: cancelledSeats } = await seatService.cleanupEventSeats(info.eventId);

    // 3) 대기열 초기화
    await redis.del('queue:waiting', 'queue:standby', 'queue:admitted', 'queue:counter');

    // 4) 공연 취소 이벤트 발행 → C파트가 접속 중인 사용자에게 실시간 알림
    await publishSeatEvent(EVENT_TYPE.SOLD_OUT, {
      seatId: 'ALL',
      message: `공연 취소: ${reason}`,
      cancelled: true,
    });

    // 5) 예매자에게 이메일/문자 발송
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

    // 목록에서도 상태 변경
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

  // =============================================
  // 이벤트 목록 (홈 카드용)
  // =============================================

  // 전체 이벤트 목록 조회 (Redis → MariaDB 폴백)
  fastify.get('/events', async (request, reply) => {
    const all = await redis.hgetall(EVENT_LIST_KEY);
    let events = Object.values(all || {}).map(v => JSON.parse(v));

    // Redis에 없으면 MariaDB에서 복구
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
        // Redis 캐시 재구성
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

  // 공연 예매 오픈 시간 수동 설정/변경 (테스트용) — 관리자가 특정 공연의
  // ticketOpenAt을 직접 지정해 예매 오픈 카운트다운 UI를 즉시 검증할 수 있게 함.
  // ticketOpenAt을 null로 보내면 오픈 시간 제한이 해제된다(즉시 예매 가능 상태로 표시).
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

    // 현재 활성 이벤트(event:info)와 같은 공연이면 그쪽 상태도 동기화
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

  // 이벤트 삭제 (목록에서 제거)
  fastify.delete('/events/:eventId', async (request, reply) => {
    const { eventId } = request.params;
    const removed = await redis.hdel(EVENT_LIST_KEY, eventId);
    if (removed === 0) {
      return reply.status(404).send({ message: '해당 이벤트가 없습니다.' });
    }
    await seatService.cleanupEventSeats(eventId);
    try {
      await pool.query(`DELETE FROM events WHERE event_id = ?`, [eventId]);
    } catch (dbErr) {
      console.error('[Event] MariaDB 삭제 동기화 실패:', dbErr.message);
    }
    return reply.send({ success: true, eventId, message: '이벤트가 삭제되었습니다.' });
  });

  // 더미 이벤트 초기화 (홈 화면용)
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

    return reply.send({ seeded: dummyEvents.length, message: '더미 이벤트 5개 생성 완료' });
  });
}

module.exports = eventRoutes;
