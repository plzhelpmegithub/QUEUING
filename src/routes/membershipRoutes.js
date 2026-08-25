const membershipService = require('../services/membershipService');

async function membershipRoutes(fastify) {

  fastify.post('/membership/subscribe', async (request, reply) => {
    const { userId, plan } = request.body || {};
    if (!userId) {
      return reply.status(400).send({ error: 'userId는 필수입니다.' });
    }
    if (plan && !['monthly', 'yearly'].includes(plan)) {
      return reply.status(400).send({ error: 'plan은 monthly 또는 yearly여야 합니다.' });
    }
    const result = await membershipService.subscribe(userId, plan || 'monthly');
    const statusCode = result.success ? 201 : 409;
    return reply.status(statusCode).send(result);
  });

  fastify.get('/membership/:userId', async (request, reply) => {
    const { userId } = request.params;
    const result = await membershipService.getMembership(userId);
    return reply.send(result);
  });

  fastify.post('/membership/cancel', async (request, reply) => {
    const { userId } = request.body || {};
    if (!userId) {
      return reply.status(400).send({ error: 'userId는 필수입니다.' });
    }
    const result = await membershipService.cancelMembership(userId);
    const statusCode = result.success ? 200 : 404;
    return reply.status(statusCode).send(result);
  });
}

module.exports = membershipRoutes;
