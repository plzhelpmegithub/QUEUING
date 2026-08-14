const queueService = require('../services/queueService');

async function queueRoutes(fastify) {

  // ===== 이벤트 설정 =====

  // 총 좌석 수 설정 — 콘서트 생성 시 1회 호출
  fastify.post('/queue/set-seats', async (request, reply) => {
    const { totalSeats } = request.body || {};
    if (!totalSeats || totalSeats < 1) {
      return reply.status(400).send({ error: '총 좌석 수(totalSeats)는 1 이상이어야 합니다.' });
    }
    const result = await queueService.setTotalSeats(totalSeats);
    return reply.send(result);
  });

  // ===== 대기열 =====

  // 대기열 진입 — 사용자 접속 시 호출, eligible/standby 자동 분류
  fastify.post('/queue/enter', async (request, reply) => {
    const { userId } = request.body || {};
    if (!userId) {
      return reply.status(400).send({ error: 'userId는 필수입니다.' });
    }
    const result = await queueService.enter(userId);
    return reply.send(result);
  });

  // 내 순번 조회 — 프론트에서 "현재 N번째" 표시에 사용
  fastify.get('/queue/position/:userId', async (request, reply) => {
    const { userId } = request.params;
    const result = await queueService.getPosition(userId);
    if (result.status === 'not_found') {
      return reply.status(404).send(result);
    }
    return reply.send(result);
  });

  // 입장 허용 (배치) — 100명씩 eligible 대기열에서 꺼내서 입장 허용
  fastify.post('/queue/admit', async (request, reply) => {
    const result = await queueService.admitBatch();
    return reply.send(result);
  });

  // ===== 취소표 대기 (B파트 연동) =====

  // 다음 취소표 대기자 조회 — B파트가 "다음 순번 누구?" 확인할 때
  fastify.get('/queue/standby/next', async (request, reply) => {
    const result = await queueService.getNextStandby();
    return reply.send(result);
  });

  // 취소표 대기자 입장 전환 — B파트가 Secret Link 발급 후 호출
  fastify.post('/queue/standby/promote', async (request, reply) => {
    const { userId } = request.body || {};
    if (!userId) {
      return reply.status(400).send({ error: 'userId는 필수입니다.' });
    }
    const result = await queueService.promoteStandby(userId);
    return reply.send(result);
  });

  // ===== 모니터링 =====

  // 대기열 현황 — Grafana 대시보드용
  fastify.get('/queue/stats', async (request, reply) => {
    const result = await queueService.getStats();
    return reply.send(result);
  });
}

module.exports = queueRoutes;
