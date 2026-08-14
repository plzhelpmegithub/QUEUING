const fastify = require('fastify')({ logger: true }); // Fastify 서버 (로깅 활성화)
const queueRoutes = require('./routes/queueRoutes');   // 대기열 API
const seatRoutes = require('./routes/seatRoutes');     // 좌석 API

// ===== 라우트 등록 =====
fastify.register(queueRoutes); // /queue/* 엔드포인트
fastify.register(seatRoutes);  // /seats/*, /reservations/* 엔드포인트

// 헬스체크 — 서버 살아있는지 확인용 (ALB, 쿠버네티스 probe에서 사용)
fastify.get('/health', async () => ({ status: 'ok' }));

const { initExpiryListener, stopExpiryListener } = require('./services/timerService'); // 결제 타이머
const { initTable } = require('./services/dbService'); // DynamoDB 테이블 초기화

// ===== 서버 시작 =====
const start = async () => {
  try {
    await initExpiryListener();  // Redis 키 만료 이벤트 리스너 시작 (좌석 자동 해제)
    await initTable();           // DynamoDB Reservations 테이블 초기화
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
