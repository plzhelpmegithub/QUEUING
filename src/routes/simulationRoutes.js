const redis = require('../config/redis');
const pool = require('../config/mariadb');
const queueService = require('../services/queueService');
const seatService = require('../services/seatService');
const membershipService = require('../services/membershipService');
const cancelAllocationService = require('../services/cancelAllocationService');
const { publishCancellationEvent } = require('../services/cancellationEventPublisher');
const { normalizeSessionContext, getScopedKey } = require('../services/sessionContext');
const { authenticate, requireRole } = require('../middleware/auth');

const EVENT_LIST_KEY = 'events:list';
const SEAT_PREFIX = 'seat:';
const SIM_USER_PREFIX = 'sim-user-';

function simUserId(index) {
  return `${SIM_USER_PREFIX}${String(index).padStart(6, '0')}@test.com`;
}

function getContext(body) {
  return normalizeSessionContext({
    eventId: body.eventId || '',
    sessionDate: body.sessionDate || '',
    sessionTime: body.sessionTime || '',
  });
}

const adminAuth = { preHandler: [authenticate, requireRole('admin')] };

async function simulationRoutes(fastify) {

  fastify.get('/admin/simulation/events', adminAuth, async (request, reply) => {
    const events = await redis.hgetall(EVENT_LIST_KEY);
    if (!events || Object.keys(events).length === 0) {
      return reply.send({ events: [] });
    }
    const list = Object.entries(events).map(([id, json]) => {
      try {
        const e = JSON.parse(json);
        return {
          eventId: id,
          eventName: e.eventName || id,
          eventDate: e.eventDate || '',
          venue: e.venue || '',
          totalSeats: e.totalSeats || 0,
          sessions: e.sessions || [],
        };
      } catch (_) {
        return { eventId: id, eventName: id };
      }
    });
    return reply.send({ events: list });
  });

  fastify.post('/admin/simulation/init', adminAuth, async (request, reply) => {
    const { eventId, sessionDate, sessionTime, realUserEmail, dummyCount = 10000 } = request.body || {};
    if (!eventId) return reply.status(400).send({ error: 'eventId는 필수입니다.' });
    if (!realUserEmail) return reply.status(400).send({ error: '실제 멤버십 유저 이메일은 필수입니다.' });

    const total = Math.min(parseInt(dummyCount, 10) || 10000, 50000);
    const context = getContext(request.body);

    const cardStr = await redis.hget(EVENT_LIST_KEY, eventId);
    if (!cardStr) return reply.status(404).send({ error: '해당 이벤트를 찾을 수 없습니다.' });
    const card = JSON.parse(cardStr);
    const totalSeats = card.totalSeats || 0;

    const existingUser = await pool.query('SELECT user_id FROM users WHERE user_id = ?', [realUserEmail]);
    if (existingUser.length === 0) {
      const { hash: argon2Hash, Algorithm } = require('@node-rs/argon2');
      const hashed = await argon2Hash('test1234', {
        algorithm: Algorithm.Argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
        outputLen: 32,
      });
      await pool.query(
        `INSERT IGNORE INTO users (user_id, password, role, email, name) VALUES (?, ?, 'user', ?, ?)`,
        [realUserEmail, hashed, realUserEmail, '테스트유저'],
      );
    }

    const existingMembership = await membershipService.getMembership(realUserEmail);
    if (!existingMembership.isMembership) {
      await membershipService.subscribe(realUserEmail, 'monthly');
    }

    const BATCH = 2000;
    for (let i = 0; i < total; i += BATCH) {
      const values = [];
      const params = [];
      const batchEnd = Math.min(i + BATCH, total);
      for (let j = i; j < batchEnd; j++) {
        values.push('(?, ?, ?, ?, ?)');
        params.push(simUserId(j + 1), '', 'user', `${simUserId(j + 1)}`, `더미${j + 1}`);
      }
      try {
        await pool.query(
          `INSERT IGNORE INTO users (user_id, password, role, email, name) VALUES ${values.join(',')}`,
          params,
        );
      } catch (e) {
        console.error('[Simulation] 더미 유저 생성 오류:', e.message);
      }
    }

    await redis.hset(`simulation:${eventId}`, {
      eventId,
      sessionDate: context.sessionDate,
      sessionTime: context.sessionTime,
      realUserEmail,
      dummyCount: total.toString(),
      totalSeats: totalSeats.toString(),
      stage: 'initialized',
      createdAt: new Date().toISOString(),
    });

    console.log(`[Simulation] 초기화 완료: ${eventId}, 더미 ${total}명, 실제유저 ${realUserEmail}`);
    return reply.send({
      success: true,
      eventId,
      eventName: card.eventName,
      totalSeats,
      dummyCount: total,
      realUserEmail,
      message: `시뮬레이션 초기화 완료 — 더미 ${total.toLocaleString()}명 생성, 실제 유저(${realUserEmail}) 멤버십 확인됨`,
    });
  });

  fastify.post('/admin/simulation/sellout', adminAuth, async (request, reply) => {
    const { eventId, sessionDate, sessionTime } = request.body || {};
    if (!eventId) return reply.status(400).send({ error: 'eventId는 필수입니다.' });

    const simData = await redis.hgetall(`simulation:${eventId}`);
    if (!simData || !simData.realUserEmail) {
      return reply.status(400).send({ error: '먼저 시뮬레이션을 초기화해주세요.' });
    }

    const context = getContext({
      eventId,
      sessionDate: sessionDate || simData.sessionDate,
      sessionTime: sessionTime || simData.sessionTime,
    });
    const keys = queueService.queueKeys(context);
    const totalSeats = parseInt(simData.totalSeats, 10) || 0;
    const dummyCount = parseInt(simData.dummyCount, 10) || 10000;
    const realUserEmail = simData.realUserEmail;

    if (totalSeats === 0) {
      return reply.status(400).send({ error: '이벤트 좌석이 0석입니다. 이벤트 설정을 확인해주세요.' });
    }

    const allSeats = await seatService.getAllSeats(eventId, context);
    if (allSeats.length === 0) {
      return reply.status(400).send({ error: '초기화된 좌석이 없습니다. 먼저 공연을 생성해주세요.' });
    }

    const availableSeats = allSeats.filter(s => s.status === 'AVAILABLE');
    const seatCount = availableSeats.length;

    const seatsToSell = Math.min(seatCount, dummyCount);
    const PIPELINE_BATCH = 1000;

    for (let i = 0; i < seatsToSell; i += PIPELINE_BATCH) {
      const pipeline = redis.pipeline();
      const batchEnd = Math.min(i + PIPELINE_BATCH, seatsToSell);
      const dbValues = [];
      const dbParams = [];
      const reservationValues = [];
      const reservationParams = [];

      for (let j = i; j < batchEnd; j++) {
        const seat = availableSeats[j];
        const userId = simUserId(j + 1);
        const seatKey = `${SEAT_PREFIX}${seat.seatId}`;

        pipeline.hset(seatKey, {
          status: 'SOLD',
          heldBy: userId,
          heldAt: Date.now().toString(),
        });

        dbValues.push('(?, ?, ?, ?, ?, ?, ?)');
        dbParams.push(
          seat.seatId, userId, eventId,
          context.sessionDate, context.sessionTime,
          'CONFIRMED', new Date().toISOString().slice(0, 19).replace('T', ' '),
        );

        reservationValues.push('(?, ?)');
        reservationParams.push(seat.seatId, userId);
      }
      await pipeline.exec();

      if (dbValues.length > 0) {
        try {
          await pool.query(
            `INSERT IGNORE INTO reservations (seat_id, user_id, event_id, session_date, session_time, status, reserved_at) VALUES ${dbValues.join(',')}`,
            dbParams,
          );
        } catch (e) {
          console.error('[Simulation] 예약 DB 저장 실패:', e.message);
        }
        try {
          const updateCases = reservationParams.reduce((arr, _, idx) => {
            if (idx % 2 === 0) arr.push(reservationParams[idx]);
            return arr;
          }, []);
          if (updateCases.length > 0) {
            await pool.query(
              `UPDATE seats SET status = 'SOLD', held_by = '' WHERE seat_id IN (${updateCases.map(() => '?').join(',')})`,
              updateCases,
            );
          }
        } catch (e) {
          console.error('[Simulation] 좌석 DB 상태 업데이트 실패:', e.message);
        }
      }
    }

    const standbyStart = seatsToSell + 1;
    const standbyEnd = dummyCount;
    const standbyDummyCount = Math.max(0, standbyEnd - standbyStart + 1);

    await redis.set(keys.totalSeatsKey, seatCount);

    for (let i = standbyStart; i <= standbyEnd; i += PIPELINE_BATCH) {
      const pipeline = redis.pipeline();
      const batchEnd = Math.min(i + PIPELINE_BATCH, standbyEnd + 1);
      for (let j = i; j < batchEnd; j++) {
        pipeline.zadd(keys.standbyKey, j, simUserId(j));
      }
      await pipeline.exec();
    }

    // The real user must join through the normal frontend flow after the
    // sellout stage. Pre-registering the account here makes the simulation
    // appear to complete the user's cancellation-queue entry before the user
    // has actually called /queue/enter.
    await redis.set(keys.counterKey, dummyCount);
    await redis.set(keys.statusKey, 'sold_out');
    await redis.set(getScopedKey('event:sold-out', context), '1');

    await redis.hset(`simulation:${eventId}`, {
      stage: 'sold_out',
      seatsSold: seatsToSell.toString(),
      standbyDummies: standbyDummyCount.toString(),
      soldOutAt: new Date().toISOString(),
    });

    console.log(`[Simulation] 매진 완료: ${seatsToSell}석 판매, standby 더미 ${standbyDummyCount}명 (실제유저는 /queue/enter 호출 시 등록)`);
    return reply.send({
      success: true,
      seatsSold: seatsToSell,
      standbyDummies: standbyDummyCount,
      realUserPosition: null,
      totalStandby: standbyDummyCount,
      message: `매진 연출 완료 — ${seatsToSell.toLocaleString()}석 판매, 더미 취소표 대기 ${standbyDummyCount.toLocaleString()}명. 실제 유저는 예매 화면에서 직접 대기열에 진입해주세요.`,
    });
  });

  fastify.post('/admin/simulation/close', adminAuth, async (request, reply) => {
    const { eventId, sessionDate, sessionTime } = request.body || {};
    if (!eventId) return reply.status(400).send({ error: 'eventId는 필수입니다.' });

    const simData = await redis.hgetall(`simulation:${eventId}`);
    if (!simData || !simData.realUserEmail) {
      return reply.status(400).send({ error: '시뮬레이션 데이터가 없습니다.' });
    }

    const context = getContext({
      eventId,
      sessionDate: sessionDate || simData.sessionDate,
      sessionTime: sessionTime || simData.sessionTime,
    });
    const keys = queueService.queueKeys(context);

    await redis.set(keys.statusKey, 'closed');

    const cardStr = await redis.hget(EVENT_LIST_KEY, eventId);
    if (cardStr) {
      try {
        const card = JSON.parse(cardStr);
        card.ticketCloseAt = new Date().toISOString();
        await redis.hset(EVENT_LIST_KEY, eventId, JSON.stringify(card));
      } catch (_) {}
    }
    try {
      await pool.query(
        'UPDATE events SET ticket_close_at = ? WHERE event_id = ?',
        [new Date(), eventId],
      );
    } catch (_) {}

    const standbyMembers = await redis.zrange(keys.standbyKey, 0, -1, 'WITHSCORES');
    const eligibleUsers = [];
    const ineligibleUsers = [];

    for (let i = 0; i < standbyMembers.length; i += 2) {
      const userId = standbyMembers[i];
      const score = parseInt(standbyMembers[i + 1], 10);
      const membership = await membershipService.getMembership(userId);

      if (membership.isMembership) {
        eligibleUsers.push({ userId, score, plan: membership.plan, priority: membership.priorityLevel });
      } else {
        ineligibleUsers.push({ userId, score });
      }

      if (eligibleUsers.length >= 100 && ineligibleUsers.length >= 100) break;
    }

    eligibleUsers.sort((a, b) => a.score - b.score);

    await redis.hset(`simulation:${eventId}`, {
      stage: 'closed',
      closedAt: new Date().toISOString(),
      eligibleCount: eligibleUsers.length.toString(),
    });

    console.log(`[Simulation] 마감 완료: eligible=${eligibleUsers.length}, ineligible=${ineligibleUsers.length}`);
    return reply.send({
      success: true,
      closedAt: new Date().toISOString(),
      eligibleUsers: eligibleUsers.slice(0, 20),
      eligibleCount: eligibleUsers.length,
      ineligibleCount: ineligibleUsers.length,
      totalStandby: Math.floor(standbyMembers.length / 2),
      message: `티켓팅 마감 완료 — 멤버십 적격자 ${eligibleUsers.length}명, 비적격자 ${ineligibleUsers.length}명`,
    });
  });

  fastify.post('/admin/simulation/cancel-seats', adminAuth, async (request, reply) => {
    const { eventId, sessionDate, sessionTime, count = 10 } = request.body || {};
    if (!eventId) return reply.status(400).send({ error: 'eventId는 필수입니다.' });

    const simData = await redis.hgetall(`simulation:${eventId}`);
    if (!simData) {
      return reply.status(400).send({ error: '시뮬레이션 데이터가 없습니다.' });
    }

    const context = getContext({
      eventId,
      sessionDate: sessionDate || simData.sessionDate,
      sessionTime: sessionTime || simData.sessionTime,
    });

    const allSeats = await seatService.getAllSeats(eventId, context);
    const soldDummySeats = allSeats.filter(
      s => s.status === 'SOLD' && s.heldBy && s.heldBy.startsWith(SIM_USER_PREFIX),
    );

    if (soldDummySeats.length === 0) {
      return reply.send({ success: false, message: '취소 가능한 더미 좌석이 없습니다.' });
    }

    const cancelCount = Math.min(parseInt(count, 10) || 10, soldDummySeats.length);

    for (let i = soldDummySeats.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [soldDummySeats[i], soldDummySeats[j]] = [soldDummySeats[j], soldDummySeats[i]];
    }
    const toCancel = soldDummySeats.slice(0, cancelCount);

    const cancelledSeats = [];
    const pipeline = redis.pipeline();
    for (const seat of toCancel) {
      const seatKey = `${SEAT_PREFIX}${seat.seatId}`;
      pipeline.hset(seatKey, { status: 'AVAILABLE', heldBy: '', heldAt: '' });
      cancelledSeats.push(seat.seatId);
    }
    await pipeline.exec();

    if (cancelledSeats.length > 0) {
      try {
        await pool.query(
          `UPDATE seats SET status = 'AVAILABLE', held_by = '', held_at = NULL WHERE seat_id IN (${cancelledSeats.map(() => '?').join(',')})`,
          cancelledSeats,
        );
      } catch (e) {
        console.error('[Simulation] 좌석 DB 취소 실패:', e.message);
      }

      try {
        for (const seat of toCancel) {
          await pool.query(
            `UPDATE reservations SET status = 'CANCELLED', cancelled_at = NOW() WHERE seat_id = ? AND user_id = ? AND status = 'CONFIRMED' ORDER BY reserved_at DESC LIMIT 1`,
            [seat.seatId, seat.heldBy],
          );
        }
      } catch (e) {
        console.error('[Simulation] 예약 DB 취소 실패:', e.message);
      }
    }

    await redis.del(getScopedKey('event:sold-out', context));

    // 시뮬레이션도 실제 취소와 동일하게 좌석 반환 이벤트만 발행한다.
    // standby 승격·Secret Link 발급은 B파트 Step Functions가 순차 처리한다.
    let cancellationEventsPublished = 0;
    for (const seat of toCancel) {
      try {
        const eventResult = await publishCancellationEvent({
          eventId,
          seatId: seat.seatId,
          userId: seat.heldBy,
          status: 'CANCELLED',
          sessionDate: context.sessionDate,
          sessionTime: context.sessionTime,
          reason: 'simulation_cancelled',
        });
        if (eventResult.published) cancellationEventsPublished += 1;
      } catch (err) {
        console.error(`[Simulation] 취소 이벤트 SQS 발행 실패 (${seat.seatId}):`, err.message);
      }
    }

    await redis.hset(`simulation:${eventId}`, {
      stage: 'seats_cancelled',
      cancelledCount: cancelCount.toString(),
      promotedCount: '0',
      cancellationEventsPublished: cancellationEventsPublished.toString(),
      cancelledAt: new Date().toISOString(),
    });

    console.log(`[Simulation] 좌석 ${cancelCount}석 강제 취소 완료`);
    return reply.send({
      success: true,
      cancelledCount: cancelCount,
      cancelledSeats,
      promotedCount: 0,
      cancellationEventsPublished,
      message: `더미 좌석 ${cancelCount}석이 취소되었습니다. SQS 이벤트를 B파트 파이프라인으로 전달했습니다.`,
    });
  });

  fastify.post('/admin/simulation/issue-links', adminAuth, async (request, reply) => {
    return reply.status(410).send({
      success: false,
      code: 'allocation_delegated',
      message: '시크릿 링크 발급은 B파트 Step Functions 파이프라인이 SQS 취소 이벤트를 처리합니다.',
    });
  });

  fastify.post('/admin/simulation/cleanup', adminAuth, async (request, reply) => {
    const { eventId } = request.body || {};
    if (!eventId) return reply.status(400).send({ error: 'eventId는 필수입니다.' });

    const simData = await redis.hgetall(`simulation:${eventId}`);
    const context = getContext({
      eventId,
      sessionDate: simData?.sessionDate || '',
      sessionTime: simData?.sessionTime || '',
    });
    const keys = queueService.queueKeys(context);

    const allSeats = await seatService.getAllSeats(eventId, context);
    const simSeats = allSeats.filter(s => s.heldBy && s.heldBy.startsWith(SIM_USER_PREFIX));
    if (simSeats.length > 0) {
      const pipeline = redis.pipeline();
      for (const seat of simSeats) {
        pipeline.hset(`${SEAT_PREFIX}${seat.seatId}`, {
          status: 'AVAILABLE',
          heldBy: '',
          heldAt: '',
        });
      }
      await pipeline.exec();

      const seatIds = simSeats.map(s => s.seatId);
      try {
        await pool.query(
          `UPDATE seats SET status = 'AVAILABLE', held_by = '', held_at = NULL WHERE seat_id IN (${seatIds.map(() => '?').join(',')})`,
          seatIds,
        );
      } catch (_) {}
    }

    const pipeline2 = redis.pipeline();
    pipeline2.del(keys.waitingKey);
    pipeline2.del(keys.standbyKey);
    pipeline2.del(keys.admittedKey);
    pipeline2.del(keys.counterKey);
    pipeline2.del(keys.statusKey);
    pipeline2.del(getScopedKey('event:sold-out', context));
    pipeline2.del(`simulation:${eventId}`);
    await pipeline2.exec();

    try {
      await pool.query(`DELETE FROM reservations WHERE user_id LIKE '${SIM_USER_PREFIX}%' AND event_id = ?`, [eventId]);
      await pool.query(`DELETE FROM waiting_queue WHERE user_id LIKE '${SIM_USER_PREFIX}%' AND event_id = ?`, [eventId]);
      await pool.query(`DELETE FROM cancel_allocations WHERE user_id LIKE '${SIM_USER_PREFIX}%' AND event_id = ?`, [eventId]);
      await pool.query(`DELETE FROM memberships WHERE user_id LIKE '${SIM_USER_PREFIX}%'`);
      await pool.query(`DELETE FROM users WHERE user_id LIKE '${SIM_USER_PREFIX}%'`);
    } catch (e) {
      console.error('[Simulation] DB 정리 실패:', e.message);
    }

    console.log(`[Simulation] 클린업 완료: ${eventId}`);
    return reply.send({
      success: true,
      clearedSeats: simSeats.length,
      message: `시뮬레이션 데이터가 삭제되었습니다. (더미 좌석 ${simSeats.length}석 복원)`,
    });
  });

  fastify.post('/admin/dummy/create-users', adminAuth, async (request, reply) => {
    const { count = 100 } = request.body || {};
    const total = Math.min(Math.max(parseInt(count, 10) || 100, 1), 50000);

    const BATCH = 2000;
    let created = 0;
    for (let i = 0; i < total; i += BATCH) {
      const values = [];
      const params = [];
      const batchEnd = Math.min(i + BATCH, total);
      for (let j = i; j < batchEnd; j++) {
        values.push('(?, ?, ?, ?, ?)');
        params.push(simUserId(j + 1), '', 'user', simUserId(j + 1), `더미${j + 1}`);
      }
      try {
        const result = await pool.query(
          `INSERT IGNORE INTO users (user_id, password, role, email, name) VALUES ${values.join(',')}`,
          params,
        );
        created += Number(result.affectedRows) || 0;
      } catch (e) {
        console.error('[Dummy] 더미 유저 생성 오류:', e.message);
      }
    }

    console.log(`[Dummy] 더미 유저 ${created}명 생성 완료 (요청: ${total}명)`);
    return reply.send({
      success: true,
      requested: total,
      created,
      message: `더미 유저 ${created.toLocaleString()}명이 생성되었습니다.`,
    });
  });

  fastify.post('/admin/dummy/distribute-interests', adminAuth, async (request, reply) => {
    const { maxEvents = 5 } = request.body || {};

    const events = await redis.hgetall(EVENT_LIST_KEY);
    if (!events || Object.keys(events).length === 0) {
      return reply.status(400).send({ error: '생성된 공연이 없습니다.' });
    }

    const eventIds = Object.keys(events);
    for (let i = eventIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [eventIds[i], eventIds[j]] = [eventIds[j], eventIds[i]];
    }
    const selectedEvents = eventIds.slice(0, Math.min(parseInt(maxEvents, 10) || 5, eventIds.length));

    const dummyRows = await pool.query(
      `SELECT user_id FROM users WHERE user_id LIKE '${SIM_USER_PREFIX}%' ORDER BY user_id`,
    );
    if (dummyRows.length === 0) {
      return reply.status(400).send({ error: '더미 유저가 없습니다. 먼저 더미 유저를 생성해주세요.' });
    }

    const dummyUserIds = dummyRows.map(r => r.user_id);
    const shuffled = [...dummyUserIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const weights = selectedEvents.map((_, i) => {
      const base = selectedEvents.length - i;
      return base * base + Math.random() * base;
    });
    const weightSum = weights.reduce((s, w) => s + w, 0);
    const boundaries = [];
    let cumulative = 0;
    for (const w of weights) {
      cumulative += w / weightSum;
      boundaries.push(cumulative);
    }
    boundaries[boundaries.length - 1] = 1;

    const distribution = selectedEvents.map(() => []);
    for (const userId of shuffled) {
      const r = Math.random();
      const bucket = boundaries.findIndex(b => r < b);
      distribution[bucket >= 0 ? bucket : distribution.length - 1].push(userId);
    }

    await pool.query(`DELETE FROM wishlists WHERE user_id LIKE '${SIM_USER_PREFIX}%'`);

    const results = [];
    const BATCH = 2000;
    for (let eIdx = 0; eIdx < selectedEvents.length; eIdx++) {
      const eventId = selectedEvents[eIdx];
      const users = distribution[eIdx];
      let inserted = 0;

      for (let i = 0; i < users.length; i += BATCH) {
        const values = [];
        const params = [];
        const batchEnd = Math.min(i + BATCH, users.length);
        for (let j = i; j < batchEnd; j++) {
          values.push('(?, ?)');
          params.push(users[j], eventId);
        }
        try {
          const result = await pool.query(
            `INSERT IGNORE INTO wishlists (user_id, event_id) VALUES ${values.join(',')}`,
            params,
          );
          inserted += Number(result.affectedRows) || 0;
        } catch (e) {
          console.error(`[Dummy] 위시리스트 분배 오류 (${eventId}):`, e.message);
        }
      }

      let eventName = eventId;
      try {
        const card = JSON.parse(events[eventId]);
        eventName = card.eventName || eventId;
      } catch (_) {}

      results.push({ eventId, eventName, count: inserted });
    }

    results.sort((a, b) => b.count - a.count);
    console.log(`[Dummy] 관심 공연 분배 완료: ${results.map(r => `${r.eventName}(${r.count})`).join(', ')}`);
    return reply.send({
      success: true,
      totalUsers: dummyUserIds.length,
      eventsCount: selectedEvents.length,
      distribution: results,
      message: `더미 유저 ${dummyUserIds.length.toLocaleString()}명의 관심 공연이 ${selectedEvents.length}개 공연에 분배되었습니다.`,
    });
  });

  fastify.post('/admin/dummy/cleanup', adminAuth, async (request, reply) => {
    let deletedWishlists = 0;
    let deletedUsers = 0;
    try {
      const wResult = await pool.query(`DELETE FROM wishlists WHERE user_id LIKE '${SIM_USER_PREFIX}%'`);
      deletedWishlists = Number(wResult.affectedRows) || 0;
    } catch (e) {
      console.error('[Dummy] 위시리스트 삭제 실패:', e.message);
    }
    try {
      const uResult = await pool.query(`DELETE FROM users WHERE user_id LIKE '${SIM_USER_PREFIX}%'`);
      deletedUsers = Number(uResult.affectedRows) || 0;
    } catch (e) {
      console.error('[Dummy] 유저 삭제 실패:', e.message);
    }

    console.log(`[Dummy] 정리 완료: 유저 ${deletedUsers}명, 위시리스트 ${deletedWishlists}건 삭제`);
    return reply.send({
      success: true,
      deletedUsers,
      deletedWishlists,
      message: `더미 유저 ${deletedUsers.toLocaleString()}명과 위시리스트 ${deletedWishlists.toLocaleString()}건이 삭제되었습니다.`,
    });
  });

  fastify.get('/admin/simulation/status', adminAuth, async (request, reply) => {
    const { eventId, sessionDate, sessionTime } = request.query || {};
    if (!eventId) return reply.status(400).send({ error: 'eventId는 필수입니다.' });

    const simData = await redis.hgetall(`simulation:${eventId}`);
    if (!simData || !simData.stage) {
      return reply.send({ initialized: false, message: '시뮬레이션이 초기화되지 않았습니다.' });
    }

    const context = getContext({
      eventId,
      sessionDate: sessionDate || simData.sessionDate || '',
      sessionTime: sessionTime || simData.sessionTime || '',
    });
    const keys = queueService.queueKeys(context);

    const [standbyCount, admittedCount, waitingCount] = await Promise.all([
      redis.zcard(keys.standbyKey),
      redis.scard(keys.admittedKey),
      redis.zcard(keys.waitingKey),
    ]);

    const allSeats = await seatService.getAllSeats(eventId, context);
    const seatStats = {
      total: allSeats.length,
      available: allSeats.filter(s => s.status === 'AVAILABLE').length,
      held: allSeats.filter(s => s.status === 'HELD').length,
      sold: allSeats.filter(s => s.status === 'SOLD').length,
    };

    const realUserEmail = simData.realUserEmail;
    let realUserStatus = null;
    if (realUserEmail) {
      const rank = await redis.zrank(keys.standbyKey, realUserEmail);
      const isAdmitted = await redis.sismember(keys.admittedKey, realUserEmail);
      const allocation = await cancelAllocationService.getActiveAllocation(realUserEmail, eventId);
      realUserStatus = {
        email: realUserEmail,
        standbyPosition: rank !== null ? rank + 1 : null,
        isAdmitted,
        hasAllocation: !!allocation,
        allocation: allocation || null,
      };
    }

    const allocHistory = await cancelAllocationService.getAllocationHistory(eventId);

    return reply.send({
      initialized: true,
      stage: simData.stage,
      eventId,
      realUserEmail,
      dummyCount: parseInt(simData.dummyCount, 10) || 0,
      totalSeats: parseInt(simData.totalSeats, 10) || 0,
      queue: { standby: standbyCount, admitted: admittedCount, waiting: waitingCount },
      seats: seatStats,
      realUser: realUserStatus,
      allocations: allocHistory.slice(0, 20),
      createdAt: simData.createdAt,
    });
  });
}

module.exports = simulationRoutes;
