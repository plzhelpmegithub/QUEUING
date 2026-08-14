const queueService = require('../services/queueService');

async function queueRoutes(fastify) {
  // 대기열 진입
  fastify.post('/queue/enter', async (request, reply) => {
    const { userId } = request.body || {};
    if (!userId) {
      return reply.status(400).send({ error: 'userId는 필수입니다.' });
    }
    const result = await queueService.enter(userId);
    return reply.send(result);
  });

  // 내 순번 조회
  fastify.get('/queue/position/:userId', async (request, reply) => {
    const { userId } = request.params;
    const result = await queueService.getPosition(userId);
    if (result.status === 'not_found') {
      return reply.status(404).send(result);
    }
    return reply.send(result);
  });

  // 입장 허용 (배치 — 운영/스케줄러 호출용)
  fastify.post('/queue/admit', async (request, reply) => {
    const result = await queueService.admitBatch();
    return reply.send(result);
  });

  // 대기열 현황 조회 (모니터링용)
  fastify.get('/queue/stats', async (request, reply) => {
    const result = await queueService.getStats();
    return reply.send(result);
  });
}

module.exports = queueRoutes;
