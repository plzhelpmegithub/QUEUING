const redis = require('../config/redis');
const pool = require('../config/mariadb');
const queueService = require('../services/queueService');
const seatService = require('../services/seatService');
const membershipService = require('../services/membershipService');
const cancelAllocationService = require('../services/cancelAllocationService');
const {
  isConfigured: isCancellationEventsConfigured,
  publishCancellationEvent,
} = require('../services/cancellationEventPublisher');
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

async function registerSimulationUserForStandby(userId, context, membershipAtJoin) {
  const keys = queueService.queueKeys(context);
  let score = await redis.zscore(keys.standbyKey, userId);

  if (score === null) {
    score = await redis.incr(keys.counterKey);
    await redis.zadd(keys.standbyKey, score, userId);
  }

  const existingRows = await pool.query(
    `SELECT id FROM waiting_queue
     WHERE user_id = ?
       AND event_id = ?
       AND session_date = ?
       AND session_time = ?
       AND queue_type = 'standby'
       AND status = 'WAITING'
     ORDER BY id DESC LIMIT 1`,
    [userId, keys.eventId, keys.sessionDate, keys.sessionTime],
  );

  if (existingRows.length === 0) {
    try {
      await pool.query(
        `INSERT INTO waiting_queue
         (user_id, event_id, session_date, session_time, queue_type, queue_index, status, membership_at_join)
         VALUES (?, ?, ?, ?, 'standby', ?, 'WAITING', ?)`,
        [userId, keys.eventId, keys.sessionDate, keys.sessionTime, Number(score), membershipAtJoin ? 1 : 0],
      );
    } catch (err) {
      // 초기 waiting_queue 스키마에는 membership_at_join이 없을 수 있다.
      // 해당 컬럼만 없는 경우에 한해 필수 공통 컬럼으로 재시도한다.
      if (err.code !== 'ER_BAD_FIELD_ERROR' && err.errno !== 1054) throw err;
      await pool.query(
        `INSERT INTO waiting_queue
         (user_id, event_id, session_date, session_time, queue_type, queue_index, status)
         VALUES (?, ?, ?, ?, 'standby', ?, 'WAITING')`,
        [userId, keys.eventId, keys.sessionDate, keys.sessionTime, Number(score)],
      );
    }
  }

  const [rank, totalStandby] = await Promise.all([
    redis.zrank(keys.standbyKey, userId),
    redis.zcard(keys.standbyKey),
  ]);

  return {
    ticket: Number(score),
    standbyPosition: rank === null ? null : rank + 1,
    totalStandby,
    inserted: existingRows.length === 0,
  };
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

    // 시뮬레이션에서 지정한 실제 사용자는 마감 시점에 취소표 standby에
    // 등록되어야 한다. 그래야 사용자가 마이페이지에 들어갔을 때 DB의
    // waiting_queue와 Redis 순번을 기준으로 해당 공연을 확인할 수 있다.
    const realUserEmail = simData.realUserEmail;
    const realMembership = await membershipService.getMembership(realUserEmail);
    let realUserStandby = null;
    try {
      realUserStandby = await registerSimulationUserForStandby(
        realUserEmail,
        context,
        realMembership.isMembership,
      );
    } catch (err) {
      console.error('[Simulation] 실제 유저 standby 등록 실패:', err.message);
      return reply.status(500).send({
        error: '실제 유저를 취소표 대기열에 등록하지 못했습니다.',
        detail: err.message,
      });
    }

    await redis.hset(`simulation:${eventId}`, {
      stage: 'closed',
      closedAt: new Date().toISOString(),
      eligibleCount: eligibleUsers.length.toString(),
      realUserStandbyPosition: String(realUserStandby.standbyPosition || ''),
      realUserStandbyTicket: String(realUserStandby.ticket),
    });

    console.log(`[Simulation] 마감 완료: eligible=${eligibleUsers.length}, ineligible=${ineligibleUsers.length}`);
    return reply.send({
      success: true,
      closedAt: new Date().toISOString(),
      eligibleUsers: eligibleUsers.slice(0, 20),
      eligibleCount: eligibleUsers.length,
      ineligibleCount: ineligibleUsers.length,
      totalStandby: realUserStandby.totalStandby,
      realUserStandby,
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

    // 시뮬레이션에서는 단계 4를 누르기 전까지 B파트로 보내지 않는다.
    // 실제 취소표 흐름과 달리, 테스트 사용자를 standby에 먼저 등록한 뒤
    // B파트가 이벤트를 소비하게 해야 링크 대상이 누락되지 않는다.
    const preparedCancellationEvents = toCancel.map((seat) => ({
      event_id: eventId,
      seat_id: seat.seatId,
      reservation_id: null,
      status: 'CANCELLED',
      user_id: seat.heldBy || null,
      session_date: context.sessionDate,
      session_time: context.sessionTime,
      reason: 'simulation_cancelled',
    }));

    await redis.hset(`simulation:${eventId}`, {
      stage: 'seats_cancelled',
      cancelledCount: cancelCount.toString(),
      promotedCount: '0',
      cancellationEventsPrepared: preparedCancellationEvents.length.toString(),
      cancellationEventsPublished: '0',
      cancellationEvents: JSON.stringify(preparedCancellationEvents),
      cancelledAt: new Date().toISOString(),
    });

    console.log(`[Simulation] 좌석 ${cancelCount}석 강제 취소 완료`);
    return reply.send({
      success: true,
      cancelledCount: cancelCount,
      cancelledSeats,
      promotedCount: 0,
      cancellationEventsPrepared: preparedCancellationEvents.length,
      cancellationEventsPublished: 0,
      message: `더미 좌석 ${cancelCount}석이 취소되었습니다. 단계4에서 B파트 링크 발급을 실행해주세요.`,
    });
  });

  fastify.post('/admin/simulation/issue-links', adminAuth, async (request, reply) => {
    const { eventId, sessionDate, sessionTime } = request.body || {};
    if (!eventId) return reply.status(400).send({ error: 'eventId는 필수입니다.' });

    const simData = await redis.hgetall(`simulation:${eventId}`);
    if (!simData || !simData.realUserEmail) {
      return reply.status(400).send({ error: '먼저 시뮬레이션을 초기화해주세요.' });
    }

    if (!isCancellationEventsConfigured()) {
      return reply.status(503).send({
        success: false,
        code: 'cancellation_events_not_configured',
        message: 'B파트 SQS 연동이 설정되지 않았습니다. CANCELLATION_EVENTS_QUEUE_URL을 확인해주세요.',
      });
    }

    const context = getContext({
      eventId,
      sessionDate: sessionDate || simData.sessionDate,
      sessionTime: sessionTime || simData.sessionTime,
    });
    const keys = queueService.queueKeys(context);
    const realUserEmail = simData.realUserEmail;
    const membership = await membershipService.getMembership(realUserEmail);

    if (!membership.isMembership) {
      return reply.status(400).send({
        success: false,
        code: 'membership_required',
        message: `${realUserEmail}에 활성 멤버십이 없어 링크를 발급할 수 없습니다.`,
      });
    }

    const existingAllocation = await cancelAllocationService.getActiveAllocation(realUserEmail, eventId);
    if (existingAllocation) {
      return reply.send({
        success: true,
        idempotent: true,
        delegated: true,
        realUserEmail,
        allocation: existingAllocation,
        message: '이미 활성 취소표 할당이 있습니다. 사용자 페이지에서 링크 상태를 확인해주세요.',
      });
    }

    let preparedEvents = [];
    try {
      preparedEvents = JSON.parse(simData.cancellationEvents || '[]');
    } catch (_) {
      preparedEvents = [];
    }
    if (!Array.isArray(preparedEvents) || preparedEvents.length === 0) {
      return reply.status(400).send({
        success: false,
        code: 'no_cancelled_seats',
        message: '먼저 단계3에서 취소표를 생성해주세요.',
      });
    }

    // 실제 유저가 취소표 페이지를 아직 열지 않았어도 시뮬레이션에서는
    // 활성 멤버십 유저를 standby 최상위에 등록해 B파트가 바로 찾도록 한다.
    const existingStandbyScore = await redis.zscore(keys.standbyKey, realUserEmail);
    let joinedForSimulation = false;
    if (existingStandbyScore === null) {
      const originalStatus = await redis.get(keys.statusKey);
      if (originalStatus !== 'sold_out') await redis.set(keys.statusKey, 'sold_out');
      try {
        const joined = await queueService.enterStandby(realUserEmail, context);
        if (!joined || joined.status !== 'waiting') {
          return reply.status(409).send({
            success: false,
            code: 'standby_join_failed',
            message: joined?.message || '실제 멤버십 유저를 취소표 대기열에 등록하지 못했습니다.',
          });
        }
        joinedForSimulation = true;
      } finally {
        if (originalStatus === 'closed') await redis.set(keys.statusKey, 'closed');
        else if (originalStatus && originalStatus !== 'sold_out') await redis.set(keys.statusKey, originalStatus);
      }
    }

    // 수동 시뮬레이션의 실제 테스트 사용자가 즉시 검증되도록 최상위에 둔다.
    // 일반 서비스의 FIFO 순서는 변경하지 않고 이 admin 전용 경로에서만 적용한다.
    await redis.zadd(keys.standbyKey, 0, realUserEmail);

    let published = 0;
    let outboxed = 0;
    let failed = 0;
    for (const event of preparedEvents) {
      try {
        const result = await publishCancellationEvent({
          eventId: event.event_id || eventId,
          seatId: event.seat_id,
          userId: event.user_id || null,
          reservationId: event.reservation_id || null,
          status: event.status || 'CANCELLED',
          sessionDate: event.session_date || context.sessionDate,
          sessionTime: event.session_time || context.sessionTime,
          reason: 'simulation_link_issue',
        });
        if (result.published) published += 1;
        else if (result.outboxed) outboxed += 1;
        else failed += 1;
      } catch (err) {
        failed += 1;
        console.error(`[Simulation] B파트 링크 이벤트 발행 실패 (${event.seat_id}):`, err.message);
      }
    }

    const requestedAt = new Date().toISOString();
    await redis.hset(`simulation:${eventId}`, {
      stage: 'link_requested',
      linksRequestedAt: requestedAt,
      realUserQueued: '1',
      joinedForSimulation: joinedForSimulation ? '1' : '0',
      cancellationEventsPublished: published.toString(),
      cancellationEventsOutboxed: outboxed.toString(),
      cancellationEventsFailed: failed.toString(),
    });

    const immediate = published > 0;
    const accepted = immediate || outboxed > 0;
    return reply.status(accepted ? (immediate ? 200 : 202) : 502).send({
      success: accepted,
      delegated: true,
      realUserEmail,
      eventsPrepared: preparedEvents.length,
      eventsPublished: published,
      eventsOutboxed: outboxed,
      eventsFailed: failed,
      message: immediate
        ? `B파트 SQS로 ${published}건의 취소표 이벤트를 전송했습니다. ${realUserEmail}의 멤버십·대기열을 기준으로 Secret Link가 발급됩니다.`
        : outboxed > 0
          ? `B파트 전송에 실패한 ${outboxed}건을 재시도 큐에 저장했습니다.`
          : 'B파트로 취소표 이벤트를 전송하지 못했습니다.',
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
      if (simData?.realUserEmail) {
        await pool.query(
          `DELETE FROM waiting_queue
           WHERE user_id = ? AND event_id = ? AND session_date = ? AND session_time = ?
             AND queue_type = 'standby'`,
          [simData.realUserEmail, eventId, context.sessionDate, context.sessionTime],
        );
      }
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
      cancellation: {
        prepared: parseInt(simData.cancellationEventsPrepared, 10) || 0,
        published: parseInt(simData.cancellationEventsPublished, 10) || 0,
        outboxed: parseInt(simData.cancellationEventsOutboxed, 10) || 0,
        failed: parseInt(simData.cancellationEventsFailed, 10) || 0,
      },
      realUser: realUserStatus,
      allocations: allocHistory.slice(0, 20),
      createdAt: simData.createdAt,
    });
  });
}

module.exports = simulationRoutes;
