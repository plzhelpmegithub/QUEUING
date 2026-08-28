require('dotenv').config(); // .env 파일을 process.env로 로드 — 다른 require보다 반드시 먼저 실행돼야 함
const fastify = require('fastify')({ logger: true }); // Fastify 서버 (로깅 활성화)
const path = require('path');                          // 경로 처리
const fs = require('fs');                              // 파일 시스템
const queueRoutes = require('./routes/queueRoutes');   // 대기열 API
const seatRoutes = require('./routes/seatRoutes');     // 좌석 API
const eventRoutes = require('./routes/eventRoutes');   // 공연 생성 API

const { client, updateGauges, httpRequestDuration } = require('./services/metricsService'); // Prometheus

// ===== 시연용 웹 UI 서빙 =====
// 브라우저에서 http://서버IP:3000 접속 시 시연 페이지 표시
fastify.get('/', async (request, reply) => {
  const htmlPath = path.join(__dirname, 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf-8');
  reply.header('Content-Type', 'text/html; charset=utf-8');
  return html;
});

// ===== HTTP 요청 측정 미들웨어 =====
// 모든 요청의 응답 시간을 Prometheus에 기록
fastify.addHook('onRequest', (request, reply, done) => {
  request.startTime = process.hrtime();  // 요청 시작 시간 기록
  done();
});

fastify.addHook('onResponse', (request, reply, done) => {
  const [sec, nano] = process.hrtime(request.startTime);  // 경과 시간 계산
  const duration = sec + nano / 1e9;                        // 초 단위로 변환
  httpRequestDuration.observe(
    { method: request.method, route: request.url, status: reply.statusCode },
    duration,
  );
  done();
});

// ===== 라우트 등록 =====
fastify.register(eventRoutes);       // /event/* 엔드포인트 (공연 생성)
fastify.register(queueRoutes);       // /queue/* 엔드포인트
fastify.register(seatRoutes);        // /seats/*, /reservations/* 엔드포인트
const authRoutes = require('./routes/authRoutes');
fastify.register(authRoutes);        // /auth/* 엔드포인트 (회원가입/로그인)
const membershipRoutes = require('./routes/membershipRoutes');
fastify.register(membershipRoutes);  // /membership/* 엔드포인트
const wishlistRoutes = require('./routes/wishlistRoutes');
fastify.register(wishlistRoutes);    // /wishlist/* 엔드포인트
const backupRoutes = require('./routes/backupRoutes');
fastify.register(backupRoutes);      // /admin/backup/* 엔드포인트
const cancelQueueRoutes = require('./routes/cancelQueueRoutes');
fastify.register(cancelQueueRoutes); // /cancel-queue/* 엔드포인트

// 헬스체크 — 서버 살아있는지 확인용 (ALB, 쿠버네티스 probe에서 사용)
fastify.get('/health', async () => ({ status: 'ok' }));

// ===== SSE 엔드포인트 — 브라우저 실시간 이벤트 스트림 =====
const { addClient, getClientCount } = require('./services/sseService');
fastify.get('/sse', (request, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',   // SSE 형식
    'Cache-Control': 'no-cache',            // 캐시 비활성화
    'Connection': 'keep-alive',             // 연결 유지
    'Access-Control-Allow-Origin': '*',     // CORS 허용
  });
  reply.raw.write(`data: ${JSON.stringify({ type: 'connected', clients: getClientCount() + 1 })}\n\n`);
  addClient(reply);  // 클라이언트 목록에 등록
});

// ===== Prometheus 메트릭 엔드포인트 =====
// D파트 Prometheus가 이 URL을 주기적으로 scrape
fastify.get('/metrics', async (request, reply) => {
  await updateGauges();                              // Redis에서 최신 값 갱신
  reply.header('Content-Type', client.register.contentType); // Prometheus 형식
  return client.register.metrics();                  // 메트릭 텍스트 반환
});

const { initExpiryListener, stopExpiryListener } = require('./services/timerService'); // 결제 타이머
const { initTable } = require('./services/dbService'); // MariaDB 테이블 초기화

// ===== 서버 시작 =====
const { initUsersTable } = require('./services/authService');
const start = async () => {
  try {
    await initExpiryListener();  // Redis 키 만료 이벤트 리스너 시작 (좌석 자동 해제)
    await initTable();           // MariaDB 전체 테이블 9개 초기화
    await initUsersTable();      // 기본 관리자 계정 생성
    const port = process.env.PORT || 3000;
    await fastify.listen({ port, host: '0.0.0.0' }); // 모든 인터페이스에서 수신
    console.log(`[Server] Running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// ===== 종료 처리 =====
// Ctrl+C(SIGINT) 시 리소스 정리 후 종료
process.on('SIGINT', async () => {
  await stopExpiryListener(); // Redis 구독 해제
  await fastify.close();      // Fastify 서버 종료
  process.exit(0);
});

start();
