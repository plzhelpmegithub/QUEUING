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

  // ===== 관리자 — 티켓팅 제어 =====

  // 티켓팅 오픈 — 관리자가 버튼 누르면 예매 시작
  fastify.post('/admin/ticketing/open', async (request, reply) => {
    const result = await queueService.openTicketing();
    return reply.send(result);
  });

  // 티켓팅 마감 — 관리자가 수동 마감
  fastify.post('/admin/ticketing/close', async (request, reply) => {
    const result = await queueService.closeTicketing();
    return reply.send(result);
  });

  // 티켓팅 상태 조회
  fastify.get('/admin/ticketing/status', async (request, reply) => {
    const result = await queueService.getTicketingStatus();
    return reply.send(result);
  });

  // 결제 제한 시간 설정 — 관리자가 공연별로 설정
  fastify.post('/admin/hold-duration', async (request, reply) => {
    const { seconds } = request.body || {};
    if (!seconds || seconds < 10) {
      return reply.status(400).send({ error: '결제 제한 시간은 10초 이상이어야 합니다.' });
    }
    const result = await queueService.setHoldDuration(seconds);
    return reply.send(result);
  });

  // 결제 제한 시간 조회
  fastify.get('/admin/hold-duration', async (request, reply) => {
    const result = await queueService.getHoldDuration();
    return reply.send(result);
  });

  // ===== 관리자 — 자동 오픈 스케줄 =====

  // 티켓팅 예약 오픈 설정 — "몇 시에 자동 오픈, 몇 분 후 자동 마감"
  fastify.post('/admin/ticketing/schedule', async (request, reply) => {
    const { openAt, durationMinutes } = request.body || {};
    if (!openAt) {
      return reply.status(400).send({ error: 'openAt(오픈 시간)은 필수입니다. 예: "2026-12-25T20:00:00"' });
    }
    const result = await queueService.scheduleTicketing(openAt, durationMinutes);
    const statusCode = result.success ? 200 : 400;
    return reply.status(statusCode).send(result);
  });

  // 예약 스케줄 취소
  fastify.post('/admin/ticketing/cancel-schedule', async (request, reply) => {
    const result = await queueService.cancelSchedule();
    return reply.send(result);
  });

  // 예약 스케줄 조회
  fastify.get('/admin/ticketing/schedule', async (request, reply) => {
    const result = await queueService.getSchedule();
    return reply.send(result);
  });
}

module.exports = queueRoutes;
