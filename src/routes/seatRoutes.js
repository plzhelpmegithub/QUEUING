const seatService = require('../services/seatService');
const { getReservationsBySeat, getAllReservations, getReservationsByUser } = require('../services/dbService');

async function seatRoutes(fastify) {

  // ===== 좌석 관리 =====

  // 좌석 초기화 — 콘서트 등록 시 좌석 목록 생성
  fastify.post('/seats/init', async (request, reply) => {
    const { seatIds } = request.body || {};
    if (!Array.isArray(seatIds) || seatIds.length === 0) {
      return reply.status(400).send({ error: 'seatIds 배열이 필요합니다.' });
    }
    const result = await seatService.initSeats(seatIds);
    return reply.send(result);
  });

  // ===== 예매 핵심 흐름 =====

  // 좌석 선점 — Admission Token 검증 + 분산 락으로 1명만 성공
  fastify.post('/seats/hold', async (request, reply) => {
    const { userId, seatId, token } = request.body || {};
    if (!userId || !seatId) {
      return reply.status(400).send({ error: 'userId와 seatId는 필수입니다.' });
    }
    if (!token) {
      return reply.status(401).send({ error: 'Admission Token(token)은 필수입니다.' });
    }
    const result = await seatService.holdSeat(userId, seatId, token);
    const statusCode = result.success ? 200 : result.reason === 'no_token' || result.reason === 'expired' ? 401 : 409;
    return reply.status(statusCode).send(result);
  });

  // 결제 확인 — held → sold 확정 + DynamoDB 저장 + 매진 체크
  fastify.post('/seats/confirm', async (request, reply) => {
    const { userId, seatId } = request.body || {};
    if (!userId || !seatId) {
      return reply.status(400).send({ error: 'userId와 seatId는 필수입니다.' });
    }
    const result = await seatService.confirmSeat(userId, seatId);
    const statusCode = result.success ? 200 : 409;
    return reply.status(statusCode).send(result);
  });

  // 좌석 취소 — sold → available 복구 + B파트 재판매 트리거
  fastify.post('/seats/cancel', async (request, reply) => {
    const { userId, seatId } = request.body || {};
    if (!userId || !seatId) {
      return reply.status(400).send({ error: 'userId와 seatId는 필수입니다.' });
    }
    const result = await seatService.cancelSeat(userId, seatId);
    const statusCode = result.success ? 200 : 409;
    return reply.status(statusCode).send(result);
  });

  // 좌석 선점 해제 — held → available (결제 전 사용자가 다른 좌석으로 바꾸거나 이탈할 때)
  fastify.post('/seats/release', async (request, reply) => {
    const { userId, seatId } = request.body || {};
    if (!userId || !seatId) {
      return reply.status(400).send({ error: 'userId와 seatId는 필수입니다.' });
    }
    const result = await seatService.releaseSeat(userId, seatId);
    const statusCode = result.success ? 200 : 409;
    return reply.status(statusCode).send(result);
  });

  // ===== 상태 조회 =====

  // 결제 남은 시간 — 프론트 카운트다운용
  fastify.get('/seats/timer/:seatId', async (request, reply) => {
    const { seatId } = request.params;
    const result = await seatService.getSeatTimer(seatId);
    return reply.send(result);
  });

  // 매진 여부 — "전석 매진. 취소표 대기하시겠습니까?" 표시용
  fastify.get('/seats/sold-out', async (request, reply) => {
    const result = await seatService.isSoldOut();
    return reply.send(result);
  });

  // 남은 좌석 수 — "잔여 좌석: X석" 표시용
  fastify.get('/seats/available', async (request, reply) => {
    const result = await seatService.getAvailableCount();
    return reply.send(result);
  });

  // 전체 좌석 현황 — 관리자/모니터링용
  fastify.get('/seats', async (request, reply) => {
    const seats = await seatService.getAllSeats();
    return reply.send({ seats, count: seats.length });
  });

  // ===== 예약 기록 (DynamoDB) =====

  // 전체 예약 기록 조회 — 관리자용
  fastify.get('/reservations', async (request, reply) => {
    const reservations = await getAllReservations();
    return reply.send({ reservations, count: reservations.length });
  });

  // 특정 좌석 예약 이력 — 좌석별 예약/취소/재예약 히스토리
  fastify.get('/reservations/:seatId', async (request, reply) => {
    const { seatId } = request.params;
    const reservations = await getReservationsBySeat(seatId);
    return reply.send({ seatId, reservations });
  });

  // 특정 사용자의 예약 목록 — 마이페이지 "예매내역"용 (DB 기반이라 새로고침해도 유지)
  fastify.get('/reservations/user/:userId', async (request, reply) => {
    const { userId } = request.params;
    const reservations = await getReservationsByUser(userId);
    return reply.send({ userId, reservations, count: reservations.length });
  });
}

module.exports = seatRoutes;
