const redis = require('../config/redis');
const queueService = require('../services/queueService');
const seatService = require('../services/seatService');
const { notifyEventCancellation, notifyEventUpdate } = require('../services/notificationService');
const { publishSeatEvent, EVENT_TYPE } = require('../services/eventService');

// 이벤트 정보 저장용 Redis 키
const EVENT_KEY = 'event:info';
const SEAT_PREFIX = 'seat:';

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
    const { eventName, eventDate, venue, sections, totalSeats, price } = request.body || {};

    if (!eventName) {
      return reply.status(400).send({ error: 'eventName은 필수입니다.' });
    }

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
          seatIds.push(`${section.name}-${String(i).padStart(padLength, '0')}`);
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
        allSeatIds.push(`A-${String(i).padStart(padLength, '0')}`);
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

    // 이벤트 정보 저장
    await redis.hset(EVENT_KEY, {
      eventName,
      eventDate: eventDate || '',
      venue: venue || '',
      totalSeats: totalSeatCount.toString(),
      sections: JSON.stringify(sectionSummary),
      status: 'open',                              // 공연 상태: open
      createdAt: new Date().toISOString(),
    });

    return reply.send({
      eventName,
      eventDate: eventDate || null,
      venue: venue || null,
      totalSeats: totalSeatCount,
      sections: sectionSummary,
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
      status: info.status || 'open',
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
    }

    // 구역별 가격 수정 (Redis 좌석 데이터 직접 업데이트)
    if (priceUpdates && Array.isArray(priceUpdates)) {
      for (const pu of priceUpdates) {
        // pu = { section: "VIP", price: 180000 }
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${SEAT_PREFIX}${pu.section}-*`, 'COUNT', 200);
          cursor = nextCursor;
          const pipeline = redis.pipeline();
          for (const key of keys) {
            pipeline.hset(key, 'price', pu.price.toString());
          }
          await pipeline.exec();
        } while (cursor !== '0');
        changes.push(`${pu.section}석 가격: → ${pu.price.toLocaleString()}원`);
      }

      // sections 정보도 업데이트
      const sections = JSON.parse(info.sections || '[]');
      for (const pu of priceUpdates) {
        const section = sections.find(s => s.name === pu.section);
        if (section) section.price = pu.price;
      }
      await redis.hset(EVENT_KEY, 'sections', JSON.stringify(sections));
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

    // 2) 모든 좌석 상태 초기화
    let cancelledSeats = 0;
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${SEAT_PREFIX}*`, 'COUNT', 200);
      cursor = nextCursor;
      const pipeline = redis.pipeline();
      for (const key of keys) {
        pipeline.hset(key, { status: 'cancelled', heldBy: '', heldAt: '' });
        cancelledSeats++;
      }
      await pipeline.exec();
    } while (cursor !== '0');

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
  });
}

module.exports = eventRoutes;
