const cancelAllocationService = require('../services/cancelAllocationService');
const membershipService = require('../services/membershipService');
const queueService = require('../services/queueService');

async function cancelQueueRoutes(fastify) {

  fastify.get('/cancel-queue/status/:eventId/:userId', async (request, reply) => {
    const { eventId, userId } = request.params;

    const [position, membership, allocation] = await Promise.all([
      queueService.getPosition(userId),
      membershipService.getMembership(userId),
      cancelAllocationService.getActiveAllocation(userId),
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

    const next = await queueService.getNextStandby();
    if (!next.userId) {
      return reply.send({ success: false, message: '취소표 대기자가 없습니다.' });
    }

    const membership = await membershipService.getMembership(next.userId);
    if (!membership.isMembership) {
      return reply.send({
        success: false,
        skippedUserId: next.userId,
        reason: 'no_membership',
        message: '대기 최선순번 사용자가 멤버십 미가입 상태입니다.',
      });
    }

    const allocation = await cancelAllocationService.createAllocation(next.userId, seatId, eventId, 300);
    await queueService.promoteStandby(next.userId);

    return reply.send({
      success: true,
      userId: next.userId,
      allocation,
      message: `${next.userId}에게 Secret Link가 발급되었습니다. (5분 유효)`,
    });
  });

  fastify.post('/cancel-queue/allocate-next', async (request, reply) => {
    const { eventId, seatId, maxSkip } = request.body || {};
    if (!eventId || !seatId) {
      return reply.status(400).send({ error: 'eventId와 seatId는 필수입니다.' });
    }

    const limit = maxSkip || 10;
    const skipped = [];

    for (let i = 0; i < limit; i++) {
      const next = await queueService.getNextStandby();
      if (!next.userId) {
        return reply.send({ success: false, skipped, message: '대기자가 없습니다.' });
      }

      const membership = await membershipService.getMembership(next.userId);
      if (!membership.isMembership) {
        skipped.push(next.userId);
        continue;
      }

      const allocation = await cancelAllocationService.createAllocation(next.userId, seatId, eventId, 300);
      await queueService.promoteStandby(next.userId);

      return reply.send({
        success: true,
        userId: next.userId,
        allocation,
        skipped,
        message: `${next.userId}에게 Secret Link 발급 완료 (${skipped.length}명 스킵)`,
      });
    }

    return reply.send({
      success: false,
      skipped,
      message: `${limit}명 확인했으나 멤버십 회원이 없습니다.`,
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
