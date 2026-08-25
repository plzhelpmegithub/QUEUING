const wishlistService = require('../services/wishlistService');

async function wishlistRoutes(fastify) {

  fastify.post('/wishlist/add', async (request, reply) => {
    const { userId, eventId } = request.body || {};
    if (!userId || !eventId) {
      return reply.status(400).send({ error: 'userId와 eventId는 필수입니다.' });
    }
    const result = await wishlistService.addWishlist(userId, eventId);
    const statusCode = result.success ? 201 : 409;
    return reply.status(statusCode).send(result);
  });

  fastify.post('/wishlist/remove', async (request, reply) => {
    const { userId, eventId } = request.body || {};
    if (!userId || !eventId) {
      return reply.status(400).send({ error: 'userId와 eventId는 필수입니다.' });
    }
    const result = await wishlistService.removeWishlist(userId, eventId);
    const statusCode = result.success ? 200 : 404;
    return reply.status(statusCode).send(result);
  });

  fastify.get('/wishlist/:userId', async (request, reply) => {
    const { userId } = request.params;
    const items = await wishlistService.getWishlistByUser(userId);
    return reply.send({ userId, wishlists: items, count: items.length });
  });

  fastify.get('/wishlist/check/:userId/:eventId', async (request, reply) => {
    const { userId, eventId } = request.params;
    const wishlisted = await wishlistService.isWishlisted(userId, eventId);
    return reply.send({ wishlisted });
  });

  fastify.get('/wishlist/count/:eventId', async (request, reply) => {
    const { eventId } = request.params;
    const count = await wishlistService.getWishlistCount(eventId);
    return reply.send({ eventId, count });
  });
}

module.exports = wishlistRoutes;
