const seatService = require('../services/seatService');
const { getReservationsBySeat, getAllReservations, getReservationsByUser } = require('../services/dbService');

async function seatRoutes(fastify) {

  fastify.post('/seats/init', async (request, reply) => {
    const { seatIds } = request.body || {};
    if (!Array.isArray(seatIds) || seatIds.length === 0) {
      return reply.status(400).send({ error: 'seatIds 배열이 필요합니다.' });
    }
    const result = await seatService.initSeats(seatIds);
    return reply.send(result);
  });

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

  fastify.post('/seats/confirm', async (request, reply) => {
    const { userId, seatId } = request.body || {};
    if (!userId || !seatId) {
      return reply.status(400).send({ error: 'userId와 seatId는 필수입니다.' });
    }
    const result = await seatService.confirmSeat(userId, seatId);
    const statusCode = result.success ? 200 : 409;
    return reply.status(statusCode).send(result);
  });

  fastify.post('/seats/cancel', async (request, reply) => {
    const { userId, seatId } = request.body || {};
    if (!userId || !seatId) {
      return reply.status(400).send({ error: 'userId와 seatId는 필수입니다.' });
    }
    const result = await seatService.cancelSeat(userId, seatId);
    const statusCode = result.success ? 200 : 409;
    return reply.status(statusCode).send(result);
  });

  fastify.post('/seats/release', async (request, reply) => {
    const { userId, seatId } = request.body || {};
    if (!userId || !seatId) {
      return reply.status(400).send({ error: 'userId와 seatId는 필수입니다.' });
    }
    const result = await seatService.releaseSeat(userId, seatId);
    const statusCode = result.success ? 200 : 409;
    return reply.status(statusCode).send(result);
  });

  fastify.get('/seats/timer/:seatId', async (request, reply) => {
    const { seatId } = request.params;
    const result = await seatService.getSeatTimer(seatId);
    return reply.send(result);
  });

  fastify.get('/seats/sold-out', async (request, reply) => {
    const result = await seatService.isSoldOut();
    return reply.send(result);
  });

  fastify.get('/seats/available', async (request, reply) => {
    const result = await seatService.getAvailableCount();
    return reply.send(result);
  });

  fastify.get('/seats', async (request, reply) => {
    const { eventId } = request.query || {};
    const seats = await seatService.getAllSeats(eventId || undefined);
    return reply.send({ seats, count: seats.length });
  });

  fastify.get('/reservations', async (request, reply) => {
    const reservations = await getAllReservations();
    return reply.send({ reservations, count: reservations.length });
  });

  fastify.get('/reservations/:seatId', async (request, reply) => {
    const { seatId } = request.params;
    const reservations = await getReservationsBySeat(seatId);
    return reply.send({ seatId, reservations });
  });

  fastify.get('/reservations/user/:userId', async (request, reply) => {
    const { userId } = request.params;
    const reservations = await getReservationsByUser(userId);
    return reply.send({ userId, reservations, count: reservations.length });
  });
}

module.exports = seatRoutes;
