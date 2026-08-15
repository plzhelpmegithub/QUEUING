const client = require('prom-client'); // Prometheus 클라이언트 라이브러리
const redis = require('../config/redis');

// ===== 기본 메트릭 수집 (CPU, 메모리, 이벤트 루프 등) =====
client.collectDefaultMetrics({ prefix: 'queuing_' });

// ===== A파트 커스텀 메트릭 정의 =====

// --- 대기열 관련 ---
const queueEligible = new client.Gauge({
  name: 'queuing_queue_eligible',           // Grafana에서 이 이름으로 조회
  help: '예매 가능 대기열 인원 수',
});

const queueStandby = new client.Gauge({
  name: 'queuing_queue_standby',
  help: '취소표 대기열 인원 수',
});

const queueAdmitted = new client.Gauge({
  name: 'queuing_queue_admitted',
  help: '입장 허용된 사용자 수',
});

// --- 좌석 관련 ---
const seatsAvailable = new client.Gauge({
  name: 'queuing_seats_available',
  help: '예매 가능 좌석 수',
});

const seatsHeld = new client.Gauge({
  name: 'queuing_seats_held',
  help: '선점 중(결제 대기) 좌석 수',
});

const seatsSold = new client.Gauge({
  name: 'queuing_seats_sold',
  help: '판매 완료 좌석 수',
});

// --- 이벤트 카운터 ---
const lockAttempts = new client.Counter({
  name: 'queuing_lock_attempts_total',
  help: '분산 락 시도 횟수',
  labelNames: ['result'],                   // result: success / fail
});

const seatEvents = new client.Counter({
  name: 'queuing_seat_events_total',
  help: '좌석 상태 변경 이벤트 수',
  labelNames: ['type'],                     // type: held / sold / released / cancelled / sold_out
});

const timerExpirations = new client.Counter({
  name: 'queuing_timer_expirations_total',
  help: '결제 타이머 만료 횟수 (자동 좌석 해제)',
});

// --- HTTP 요청 ---
const httpRequestDuration = new client.Histogram({
  name: 'queuing_http_request_duration_seconds',
  help: 'HTTP 요청 응답 시간 (초)',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],   // 10ms ~ 5s 구간
});

/**
 * Redis에서 현재 값을 읽어 Gauge 메트릭 갱신
 * - Prometheus가 /metrics를 scrape할 때마다 호출
 */
async function updateGauges() {
  try {
    // 대기열 수치
    const [eligible, standby, admitted] = await Promise.all([
      redis.zcard('queue:waiting'),
      redis.zcard('queue:standby'),
      redis.scard('queue:admitted'),
    ]);
    queueEligible.set(eligible);
    queueStandby.set(standby);
    queueAdmitted.set(admitted);

    // 좌석 수치 — SCAN으로 전체 좌석 상태 집계
    let available = 0, held = 0, sold = 0;
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'seat:*', 'COUNT', 200);
      cursor = nextCursor;
      for (const key of keys) {
        const status = await redis.hget(key, 'status');
        if (status === 'available') available++;
        else if (status === 'held') held++;
        else if (status === 'sold') sold++;
      }
    } while (cursor !== '0');

    seatsAvailable.set(available);
    seatsHeld.set(held);
    seatsSold.set(sold);
  } catch (err) {
    console.error('[Metrics] Gauge 갱신 실패:', err.message);
  }
}

module.exports = {
  client,
  updateGauges,
  lockAttempts,
  seatEvents,
  timerExpirations,
  httpRequestDuration,
};
