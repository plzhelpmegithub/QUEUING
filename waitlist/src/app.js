const fastify = require('fastify')({ logger: true });
const queueRoutes = require('./routes/queueRoutes');
const seatRoutes = require('./routes/seatRoutes');

// 라우트 등록
fastify.register(queueRoutes);
fastify.register(seatRoutes);

// 헬스체크
fastify.get('/health', async () => ({ status: 'ok' }));

const { initExpiryListener, stopExpiryListener } = require('./services/timerService');

// 서버 시작
const start = async () => {
  try {
    await initExpiryListener();  // Redis 만료 이벤트 리스너 시작
    const port = process.env.PORT || 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`[Server] Running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// 종료 시 정리
process.on('SIGINT', async () => {
  await stopExpiryListener();
  await fastify.close();
  process.exit(0);
});

start();
