const cancelAllocationService = require('../services/cancelAllocationService');
const membershipService = require('../services/membershipService');
const queueService = require('../services/queueService');
const seatService = require('../services/seatService');
const { getRawToken } = require('../services/tokenService');
const { guardRecaptcha } = require('../services/recaptchaService');
const bCallback = require('../services/bPartCallbackService');
const { verifyCancelLinkToken } = require('../services/cancelLinkTokenService');
const { issueScopedCancelToken } = require('../services/authTokenService');
const {
  authenticate,
  requireRole,
  allowUserOrCancelLink,
  requireSelfOrLink,
} = require('../middleware/auth');

const adminAuth = { preHandler: [authenticate, requireRole('admin')] };
const userAuth = { preHandler: [allowUserOrCancelLink, requireSelfOrLink] };

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

  fastify.post('/cancel-queue/join', userAuth, async (request, reply) => {
    if (!await guardRecaptcha(request, reply, 'cancel_queue_join')) return;
    const { userId } = request.body || {};
    if (!userId) {
      return reply.status(400).send({ error: 'userId는 필수입니다.' });
    }
    const context = getQueueContext(request);
    const result = await queueService.enterStandby(userId, context);
    return reply.status(result.status === 'closed' ? 409 : 200).send(result);
  });

  fastify.get('/cancel-queue/status/:eventId/:userId', userAuth, async (request, reply) => {
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

  // 취소표 순차 배정은 B파트 Step Functions + SQS 파이프라인의 단일 책임이다.
  // 과거 운영 도구가 이 엔드포인트를 호출해도 A파트에서 이중 배정하지 않도록 명시적으로 차단한다.
  const allocationDelegated = async (_request, reply) => reply.status(410).send({
    success: false,
    code: 'allocation_delegated',
    message: '취소표 배정은 B파트 Step Functions 파이프라인에서 처리합니다.',
  });
  fastify.post('/cancel-queue/allocate', adminAuth, allocationDelegated);
  fastify.post('/cancel-queue/allocate-next', adminAuth, allocationDelegated);

  // Secret Link 보유자만 배정된 좌석을 선점할 수 있게 한다.
  fastify.post('/cancel-queue/hold', userAuth, async (request, reply) => {
    if (!await guardRecaptcha(request, reply, 'cancel_seat_hold')) return;
    const { userId, eventId, seatId } = request.body || {};
    if (!userId || !eventId || !seatId) {
      return reply.status(400).send({ error: 'userId, eventId, seatId는 필수입니다.' });
    }

    const allocation = await cancelAllocationService.getActiveAllocation(userId, eventId);
    if (!allocation) {
      return reply.status(409).send({ success: false, reason: 'allocation_required', message: '본인에게 배정된 취소표 할당이 없습니다.' });
    }
    if (allocation.seatId && allocation.seatId !== seatId) {
      return reply.status(409).send({ success: false, reason: 'seat_mismatch', message: '배정된 좌석과 요청한 좌석이 다릅니다.' });
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

  // 브라우저가 제한시간 만료를 감지했을 때 할당을 만료시키고 선점을 해제한다.
  // 다음 사용자에게 넘기는 작업은 B파트 파이프라인이 담당한다.
  fastify.post('/cancel-queue/expire', userAuth, async (request, reply) => {
    const { userId, eventId, seatId } = request.body || {};
    if (!userId || !eventId) {
      return reply.status(400).send({ error: 'userId와 eventId는 필수입니다.' });
    }

    if (bCallback.isConfigured()) {
      const allocation = await cancelAllocationService.getActiveAllocation(userId, eventId);
      if (!allocation) {
        return reply.status(409).send({ success: false, message: '활성화된 취소표 할당이 없습니다.' });
      }
      const payload = { userId, eventId, seatId: seatId || allocation.seatId, allocationId: allocation.id };
      try {
        await bCallback.callbackExpire(payload);
        return reply.send({ success: true, message: '취소표 만료가 B파트 파이프라인으로 전달되었습니다.' });
      } catch (err) {
        console.error('[CancelQueue] B callback /expire 실패 → 재시도 큐 저장:', err.message);
        await bCallback.saveCallbackToOutbox('expire', payload, err.message);
        return reply.status(202).send({ success: true, queued: true, message: '콜백 전달에 실패하여 재시도 큐에 저장되었습니다.' });
      }
    }

    const result = await cancelAllocationService.expireAllocation(userId, eventId, seatId, getQueueContext(request, eventId));
    return reply.status(result.success ? 200 : 409).send(result);
  });

  fastify.post('/cancel-queue/respond', userAuth, async (request, reply) => {
    const { userId, eventId, seatId } = request.body || {};
    if (!userId || !eventId || !seatId) {
      return reply.status(400).send({ error: 'userId, eventId, seatId는 필수입니다.' });
    }

    if (bCallback.isConfigured()) {
      const allocation = await cancelAllocationService.getActiveAllocation(userId, eventId);
      if (!allocation) {
        return reply.status(409).send({ success: false, message: '활성화된 취소표 할당이 없습니다.' });
      }
      const payload = { userId, eventId, seatId, allocationId: allocation.id };
      try {
        await bCallback.callbackComplete(payload);
        return reply.send({ success: true, message: '좌석 확정이 B파트 파이프라인으로 전달되었습니다.' });
      } catch (err) {
        console.error('[CancelQueue] B callback /complete 실패 → 재시도 큐 저장:', err.message);
        await bCallback.saveCallbackToOutbox('complete', payload, err.message);
        return reply.status(202).send({ success: true, queued: true, message: '콜백 전달에 실패하여 재시도 큐에 저장되었습니다.' });
      }
    }

    const result = await cancelAllocationService.markResponded(userId, seatId, eventId);
    return reply.send({ success: result.affected > 0, ...result });
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

  fastify.post('/cancel-queue/expire-overdue', adminAuth, async (request, reply) => {
    const result = await cancelAllocationService.expireAllOverdue();
    return reply.send(result);
  });

  fastify.get('/cancel-queue/history/:eventId', adminAuth, async (request, reply) => {
    const { eventId } = request.params;
    const history = await cancelAllocationService.getAllocationHistory(eventId);
    return reply.send({ allocations: history, count: history.length });
  });

  fastify.post('/verify-link', async (request, reply) => {
    const { token } = request.body || {};
    if (!token) {
      return reply.status(400).send({ valid: false, reason: 'missing', message: 'token은 필수입니다.' });
    }

    const result = verifyCancelLinkToken(token);
    if (!result.valid) {
      return reply.status(401).send(result);
    }

    const allocation = await cancelAllocationService.getActiveAllocation(result.userId, result.eventId);
    if (!allocation) {
      return reply.status(410).send({ valid: false, reason: 'expired', message: '할당이 만료되었거나 존재하지 않습니다.' });
    }

    const remainingSeconds = Math.max(0, Math.floor((new Date(allocation.expiresAt).getTime() - Date.now()) / 1000));

    const availableSeats = allocation.seatId
      ? [allocation.seatId]
      : (await seatService.getAllSeats(result.eventId, {
          eventId: result.eventId,
          sessionDate: allocation.sessionDate,
          sessionTime: allocation.sessionTime,
        })).filter(s => s.status === 'AVAILABLE').map(s => s.seatId);

    const scopedToken = issueScopedCancelToken(
      allocation.userId,
      allocation.eventId,
      allocation.id,
      remainingSeconds,
    );

    return reply.send({
      valid: true,
      userId: allocation.userId,
      eventId: allocation.eventId,
      allocationId: allocation.id,
      seatId: allocation.seatId || null,
      availableSeats,
      sessionDate: allocation.sessionDate,
      sessionTime: allocation.sessionTime,
      expiresAt: allocation.expiresAt,
      remainingSeconds,
      accessToken: scopedToken,
    });
  });
}

module.exports = cancelQueueRoutes;
