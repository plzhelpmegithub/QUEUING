require('dotenv').config(); // .env 파일을 process.env로 로드 — 다른 require보다 반드시 먼저 실행돼야 함
const fastify = require('fastify')({ logger: true });
const path = require('path');
const fs = require('fs');
const queueRoutes = require('./routes/queueRoutes');
const seatRoutes = require('./routes/seatRoutes');
const eventRoutes = require('./routes/eventRoutes');

const {
  client,
  updateGauges,
  initializeSeatMetricAggregate,
  httpRequestDuration,
} = require('./services/metricsService');

fastify.get('/', async (request, reply) => {
  const htmlPath = path.join(__dirname, 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf-8');
  reply.header('Content-Type', 'text/html; charset=utf-8');
  return html;
});

fastify.addHook('onRequest', (request, reply, done) => {
  request.startTime = process.hrtime();
  done();
});

fastify.addHook('onResponse', (request, reply, done) => {
  const [sec, nano] = process.hrtime(request.startTime);
  const duration = sec + nano / 1e9;
  httpRequestDuration.observe(
    { method: request.method, route: request.routeOptions?.url || 'unknown', status: reply.statusCode },
    duration,
  );
  done();
});

fastify.register(eventRoutes);
fastify.register(queueRoutes);
fastify.register(seatRoutes);
const authRoutes = require('./routes/authRoutes');
fastify.register(authRoutes);
const membershipRoutes = require('./routes/membershipRoutes');
fastify.register(membershipRoutes);
const wishlistRoutes = require('./routes/wishlistRoutes');
fastify.register(wishlistRoutes);
const backupRoutes = require('./routes/backupRoutes');
fastify.register(backupRoutes);
const cancelQueueRoutes = require('./routes/cancelQueueRoutes');
fastify.register(cancelQueueRoutes);
const simulationRoutes = require('./routes/simulationRoutes');
fastify.register(simulationRoutes);
fastify.register(simulationRoutes, { mode: 'local' });
// Final 공용 풀 시뮬레이션은 로컬 검증용이다. 개발 환경에서는 기존 테스트
// 흐름을 보존하기 위해 기본 활성화하고, production에서는 명시적으로 켜지 않는
// 한 라우트·만료 스위퍼·전용 테이블 초기화를 등록하지 않는다.
const lastSimulationEnabledValue = String(
  process.env.LAST_SIMULATION_ENABLED ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true'),
).trim().toLowerCase();
const lastSimulationEnabled = ['true', '1', 'yes', 'on'].includes(lastSimulationEnabledValue);

if (lastSimulationEnabled) {
  // B파트 연동/기존 Local 시뮬레이션과 분리된 100석 공용 풀 로컬 검증 흐름.
  const lastSimulationRoutes = require('./routes/lastSimulationRoutes');
  fastify.register(lastSimulationRoutes);
} else {
  fastify.log.info('Final 취소표 시뮬레이션은 LAST_SIMULATION_ENABLED=false로 비활성화되었습니다.');
}

fastify.get('/health', async () => ({ status: 'ok' }));

const { addClient, getClientCount } = require('./services/sseService');
fastify.get('/sse', (request, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  reply.raw.write(`data: ${JSON.stringify({ type: 'connected', clients: getClientCount() + 1 })}\n\n`);
  addClient(reply);
});

fastify.get('/metrics', async (request, reply) => {
  await updateGauges();
  reply.header('Content-Type', client.register.contentType);
  return client.register.metrics();
});

const { initExpiryListener, stopExpiryListener } = require('./services/timerService');
const { initTable } = require('./services/dbService');
const { startRetryWorker, stopRetryWorker } = require('./services/syncRetryService');
const { startAdmissionWorker, stopAdmissionWorker } = require('./services/admissionWorker');
const {
  startAdmissionTimeoutWorker,
  stopAdmissionTimeoutWorker,
} = require('./services/admissionTimeoutService');
const { relayCancellationOutbox } = require('./services/cancellationEventPublisher');
const { relayCallbackOutbox } = require('./services/bPartCallbackService');
const {
  recoverWithRetry,
  startAutoRecovery,
  stopAutoRecovery,
} = require('./services/redisRecoveryService');

const { initUsersTable } = require('./services/authService');
const { assertConfigured: assertAuthTokenConfigured } = require('./services/authTokenService');
const { assertConfigured: assertAdmissionTokenConfigured } = require('./services/tokenService');
const start = async () => {
  try {
    assertAuthTokenConfigured();
    assertAdmissionTokenConfigured();
    await initExpiryListener();
    await initTable({ includeLastSimulation: lastSimulationEnabled });
    await initUsersTable();
    const recovery = await recoverWithRetry({ reason: 'startup' });
    console.log('[Server] Redis 시작 복구 결과:', JSON.stringify(recovery));
    try {
      await initializeSeatMetricAggregate();
    } catch (err) {
      // 메트릭 초기화 실패가 예매 API 자체의 기동을 막지 않도록 한다.
      console.error('[Metrics] 좌석 집계 초기화 실패:', err.message);
    }
    startAutoRecovery();
    startRetryWorker();
    startAdmissionWorker();
    startAdmissionTimeoutWorker();
    const outboxRelayId = setInterval(() => relayCancellationOutbox().catch(e => console.error('[Outbox] relay error:', e.message)), 30000);
    const callbackRelayId = setInterval(() => relayCallbackOutbox().catch(e => console.error('[CallbackOutbox] relay error:', e.message)), 30000);
    process.once('beforeExit', () => { clearInterval(outboxRelayId); clearInterval(callbackRelayId); });
    const port = process.env.PORT || 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`[Server] Running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

process.on('SIGINT', async () => {
  stopAutoRecovery();
  stopRetryWorker();
  stopAdmissionWorker();
  stopAdmissionTimeoutWorker();
  await stopExpiryListener();
  await fastify.close();
  process.exit(0);
});

start();
