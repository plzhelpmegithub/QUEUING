const cancelAllocationService = require('../services/cancelAllocationService');
const membershipService = require('../services/membershipService');
const queueService = require('../services/queueService');
const seatService = require('../services/seatService');
const { getRawToken } = require('../services/tokenService');
const { guardRecaptcha } = require('../services/recaptchaService');

function getQueueContext(request, eventId = '') {
  const body = request.body || {};
  const query = request.query || {};
  return {
    eventId: body.eventId || query.eventId || eventId || '',
    sessionDate: body.sessionDate || query.sessionDate || '',
    sessionTime: body.sessionTime || query.sessionTime || '',
  };
}

async function cancelQueueRoutes(fastify) {

  fastify.post('/cancel-queue/join', async (request, reply) => {
    if (!await guardRecaptcha(request, reply, 'cancel_queue_join')) return;
    const { userId } = request.body || {};
    if (!userId) {
      return reply.status(400).send({ error: 'userId는 필수입니다.' });
    }
    const context = getQueueContext(request);
    const result = await queueService.enterStandby(userId, context);
    return reply.status(result.status === 'closed' ? 409 : 200).send(result);
  });

  fastify.get('/cancel-queue/status/:eventId/:userId', async (request, reply) => {
    const { eventId } = request.params;
    const userId = request.query.userId || request.params.userId;
    const context = getQueueContext(request, eventId);

    const [position, membership, allocation] = await Promise.all([
      queueService.getPosition(userId, context),
      membershipService.getMembership(userId),
      cancelAllocationService.getActiveAllocation(userId, eventId),
    ]);

    return reply.send({
      eventId,
      userId,
      queue: position,
      membership: {
        isMembership: membership.isMembership,
        plan: membership.plan || null,
        expiresAt: membership.expiresAt || null,
      },
      secretLink: allocation ? {
        active: true,
        allocationId: allocation.id,
        seatId: allocation.seatId,
        sessionDate: allocation.sessionDate || '',
        sessionTime: allocation.sessionTime || '',
        expiresAt: allocation.expiresAt,
        remainingSeconds: Math.max(0, Math.floor((new Date(allocation.expiresAt).getTime() - Date.now()) / 1000)),
      } : { active: false },
    });
  });

  fastify.post('/cancel-queue/allocate', async (request, reply) => {
    const { eventId, seatId } = request.body || {};
    if (!eventId || !seatId) {
      return reply.status(400).send({ error: 'eventId와 seatId는 필수입니다.' });
    }

    const context = getQueueContext(request, eventId);
    const result = await cancelAllocationService.allocateNextForSeat(eventId, seatId, context, 1);
    return reply.send(result);
  });

  fastify.post('/cancel-queue/allocate-next', async (request, reply) => {
    const { eventId, seatId, maxSkip } = request.body || {};
    if (!eventId || !seatId) {
      return reply.status(400).send({ error: 'eventId와 seatId는 필수입니다.' });
    }

    const context = getQueueContext(request, eventId);
    const result = await cancelAllocationService.allocateNextForSeat(eventId, seatId, context, maxSkip || 10);
    return reply.send(result);
  });

  // Secret Link 보유자만 배정된 좌석을 선점할 수 있게 한다.
  fastify.post('/cancel-queue/hold', async (request, reply) => {
    if (!await guardRecaptcha(request, reply, 'cancel_seat_hold')) return;
    const { userId, eventId, seatId } = request.body || {};
    if (!userId || !eventId || !seatId) {
      return reply.status(400).send({ error: 'userId, eventId, seatId는 필수입니다.' });
    }

    const allocation = await cancelAllocationService.getActiveAllocation(userId, eventId);
    if (!allocation || allocation.seatId !== seatId) {
      return reply.status(409).send({ success: false, reason: 'allocation_required', message: '본인에게 배정된 취소표 좌석이 아닙니다.' });
    }

    const context = {
      eventId,
      sessionDate: allocation.sessionDate || request.body.sessionDate || '',
      sessionTime: allocation.sessionTime || request.body.sessionTime || '',
    };
    const tokenInfo = await getRawToken(userId, context);
    if (!tokenInfo) {
      return reply.status(401).send({ success: false, reason: 'token_unavailable', message: '취소표 입장 토큰이 만료되었거나 유효하지 않습니다.' });
    }

    const result = await seatService.holdSeat(userId, seatId, tokenInfo.token, context);
    const statusCode = result.success ? 200 : result.reason === 'expired' || result.reason === 'no_token' ? 401 : 409;
    return reply.status(statusCode).send({ ...result, allocation });
  });

  // 브라우저가 제한시간 만료를 감지했을 때 할당을 만료시키고 같은 좌석을 다음 사용자에게 넘긴다.
  fastify.post('/cancel-queue/expire', async (request, reply) => {
    const { userId, eventId, seatId } = request.body || {};
    if (!userId || !eventId) {
      return reply.status(400).send({ error: 'userId와 eventId는 필수입니다.' });
    }
    const result = await cancelAllocationService.expireAllocation(userId, eventId, seatId, getQueueContext(request, eventId));
    return reply.status(result.success ? 200 : 409).send(result);
  });

  // 취소표 화면의 Pool 수치를 임의 생성하지 않고 현재 Redis 좌석 상태로 계산한다.
  fastify.get('/cancel-queue/pool/:eventId', async (request, reply) => {
    const { eventId } = request.params;
    const seats = await seatService.getAllSeats(eventId, getQueueContext(request, eventId));
    const sections = {};
    for (const seat of seats) {
      const section = seat.section || '기타';
      if (!sections[section]) sections[section] = { available: 0, held: 0, sold: 0 };
      if (seat.status === 'AVAILABLE') sections[section].available += 1;
      else if (seat.status === 'HELD') sections[section].held += 1;
      else if (seat.status === 'SOLD') sections[section].sold += 1;
    }
    return reply.send({
      eventId,
      total: seats.length,
      available: seats.filter((seat) => seat.status === 'AVAILABLE').length,
      held: seats.filter((seat) => seat.status === 'HELD').length,
      sold: seats.filter((seat) => seat.status === 'SOLD').length,
      sections,
    });
  });

  fastify.post('/cancel-queue/expire-overdue', async (request, reply) => {
    const result = await cancelAllocationService.expireAllOverdue();
    return reply.send(result);
  });

  fastify.get('/cancel-queue/history/:eventId', async (request, reply) => {
    const { eventId } = request.params;
    const history = await cancelAllocationService.getAllocationHistory(eventId);
    return reply.send({ allocations: history, count: history.length });
  });
}

module.exports = cancelQueueRoutes;
