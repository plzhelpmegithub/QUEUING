const seatService = require('../services/seatService');

async function seatRoutes(fastify) {
  // 좌석 초기화 (이벤트 세팅용)
  fastify.post('/seats/init', async (request, reply) => {
    const { seatIds } = request.body || {};
    if (!Array.isArray(seatIds) || seatIds.length === 0) {
      return reply.status(400).send({ error: 'seatIds 배열이 필요합니다.' });
    }
    const result = await seatService.initSeats(seatIds);
    return reply.send(result);
  });

  // 좌석 선점 (분산 락 적용)
  fastify.post('/seats/hold', async (request, reply) => {
    const { userId, seatId } = request.body || {};
    if (!userId || !seatId) {
      return reply.status(400).send({ error: 'userId와 seatId는 필수입니다.' });
    }
    const result = await seatService.holdSeat(userId, seatId);
    const statusCode = result.success ? 200 : 409;
    return reply.status(statusCode).send(result);
  });

  // 결제 확인 → 좌석 확정
  fastify.post('/seats/confirm', async (request, reply) => {
    const { userId, seatId } = request.body || {};
    if (!userId || !seatId) {
      return reply.status(400).send({ error: 'userId와 seatId는 필수입니다.' });
    }
    const result = await seatService.confirmSeat(userId, seatId);
    const statusCode = result.success ? 200 : 409;
    return reply.status(statusCode).send(result);
  });

  // 좌석 남은 시간 조회
  fastify.get('/seats/timer/:seatId', async (request, reply) => {
    const { seatId } = request.params;
    const result = await seatService.getSeatTimer(seatId);
    return reply.send(result);
  });

  // 전체 좌석 현황
  fastify.get('/seats', async (request, reply) => {
    const seats = await seatService.getAllSeats();
    return reply.send({ seats, count: seats.length });
  });
}

module.exports = seatRoutes;
