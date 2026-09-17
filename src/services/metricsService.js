const client = require('prom-client'); // Prometheus 클라이언트 라이브러리
const redis = require('../config/redis');

// 좌석 상태 변경 시 seatService가 HINCRBY로 유지하는 전역 집계 해시.
// /metrics 요청에서는 이 키만 읽고 좌석 개별 키를 조회하지 않는다.
const SEAT_METRICS_KEY = 'seat:metrics:aggregate';
const SEAT_METRICS_LOCK_KEY = 'lock:seat-metrics-migration';
const SEAT_METRIC_FIELDS = ['total', 'available', 'held', 'sold'];
const QUEUE_METRIC_KEYS = {
  eligible: 'queue:waiting',
  standby: 'queue:standby',
  admitted: 'queue:admitted',
};
const QUEUE_SCAN_COUNT = 200;

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

// --- 예매 업무 처리 ---
// seat_events_total은 Redis 좌석 상태 이벤트용이고, 이 메트릭은 API 업무
// 처리 결과용이다. 따라서 좌석 상태 이벤트와 예매 요청 결과를 구분해서
// Grafana에서 집계할 수 있다.
const bookingOperations = new client.Counter({
  name: 'queuing_booking_operations_total',
  help: '좌석 선점·예매 확정·환불 업무 처리 결과 수',
  labelNames: ['operation', 'result'], // operation: hold/confirm/cancel, result: success/rejected/error
});

// --- 좌석 타이머 동작 ---
const timerStarts = new client.Counter({
  name: 'queuing_timer_starts_total',
  help: '좌석 선점 결제 타이머 시작 횟수',
});

const timerCancellations = new client.Counter({
  name: 'queuing_timer_cancellations_total',
  help: '결제 완료·좌석 해제로 실제 삭제된 타이머 수',
});

// --- HTTP 요청 ---
const httpRequestDuration = new client.Histogram({
  name: 'queuing_http_request_duration_seconds',
  help: 'HTTP 요청 응답 시간 (초)',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],   // 10ms ~ 5s 구간
});

/**
 * 기존 회차별 좌석 카운터를 전역 집계 해시로 한 번만 이관한다.
 *
 * 이 작업은 Prometheus scrape 경로에서 실행하지 않는다. 새 키가 없는
 * 구버전 Redis에서만 서버 시작 시 수행되며, 이후 좌석 상태 변경은
 * seatService가 전역 집계를 직접 갱신한다.
 */
async function initializeSeatMetricAggregate() {
  const current = await redis.hlen(SEAT_METRICS_KEY);
  if (current > 0) return { initialized: false, skipped: true, reason: 'already initialized' };

  const token = `${process.pid}:${Date.now()}:${Math.random()}`;
  const acquired = await redis.set(SEAT_METRICS_LOCK_KEY, token, 'EX', 60, 'NX');
  if (acquired !== 'OK') return { initialized: false, skipped: true, reason: 'another migration is running' };

  try {
    // 여러 파드가 동시에 시작해도 첫 번째 파드만 이관한다.
    if (await redis.hlen(SEAT_METRICS_KEY) > 0) {
      return { initialized: false, skipped: true, reason: 'initialized by another pod' };
    }

    let cursor = '0';
    const counterKeys = [];
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'seat:counter:*', 'COUNT', 100);
      cursor = nextCursor;
      counterKeys.push(...keys);
    } while (cursor !== '0');

    const counts = { total: 0, available: 0, held: 0, sold: 0 };
    if (counterKeys.length > 0) {
      const pipeline = redis.pipeline();
      counterKeys.forEach((key) => pipeline.hgetall(key));
      const results = await pipeline.exec();
      results.forEach(([, value]) => {
        SEAT_METRIC_FIELDS.forEach((field) => {
          counts[field] += Number(value?.[field]) || 0;
        });
      });
    }

    await redis.hset(SEAT_METRICS_KEY, counts);
    console.log(`[Metrics] 좌석 집계 초기화 완료 (${counterKeys.length}개 카운터, total=${counts.total})`);
    return { initialized: true, counterKeys: counterKeys.length, counts };
  } finally {
    await redis.eval(
      'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
      1,
      SEAT_METRICS_LOCK_KEY,
      token,
    );
  }
}

/**
 * Redis에서 기본 대기열 키와 회차별 대기열 키를 찾는다.
 *
 * 회차 컨텍스트가 있는 일반 대기열은 다음 형태로 저장된다.
 *   queue:waiting:{eventId}:{sessionKey}
 *   queue:standby:{eventId}:{sessionKey}
 *   queue:admitted:{eventId}:{sessionKey}
 *
 * 기본 키도 함께 조회해 레거시 시뮬레이션/무회차 요청과의 호환성을
 * 유지한다. 사용자 목록은 읽지 않고 각 Sorted Set/Set의 cardinality만
 * pipeline으로 조회하므로, 사용자의 수에 비례한 응답 payload는 만들지 않는다.
 */
async function scanScopedQueueKeys(baseKey) {
  const keys = [baseKey];
  let cursor = '0';

  do {
    const [nextCursor, scannedKeys] = await redis.scan(
      cursor,
      'MATCH',
      `${baseKey}:*`,
      'COUNT',
      QUEUE_SCAN_COUNT,
    );
    cursor = nextCursor;
    keys.push(...scannedKeys);
  } while (cursor !== '0');

  return [...new Set(keys)];
}

async function sumQueueCardinality(baseKey, command) {
  const keys = await scanScopedQueueKeys(baseKey);
  const pipeline = redis.pipeline();

  keys.forEach((key) => {
    if (command === 'zcard') pipeline.zcard(key);
    else pipeline.scard(key);
  });

  const results = await pipeline.exec();
  return results.reduce((total, [error, value]) => {
    if (error) throw error;
    return total + (Number(value) || 0);
  }, 0);
}

/**
 * Redis에 저장된 값을 읽어 Gauge 메트릭 갱신.
 * - 기본 키와 모든 회차별 queue:*:{eventId}:{sessionKey} 키를 합산
 * - 사용자 목록은 읽지 않고 SCAN + cardinality pipeline만 실행
 * - Prometheus scrape 시점의 전체 이벤트/회차 대기열 스냅샷을 제공
 */
async function updateGauges() {
  try {
    // 대기열 수치
    const [eligible, standby, admitted] = await Promise.all([
      sumQueueCardinality(QUEUE_METRIC_KEYS.eligible, 'zcard'),
      sumQueueCardinality(QUEUE_METRIC_KEYS.standby, 'zcard'),
      sumQueueCardinality(QUEUE_METRIC_KEYS.admitted, 'scard'),
    ]);
    queueEligible.set(eligible);
    queueStandby.set(standby);
    queueAdmitted.set(admitted);

    const seatCounts = await redis.hgetall(SEAT_METRICS_KEY);
    seatsAvailable.set(Math.max(0, Number(seatCounts.available) || 0));
    seatsHeld.set(Math.max(0, Number(seatCounts.held) || 0));
    seatsSold.set(Math.max(0, Number(seatCounts.sold) || 0));
  } catch (err) {
    console.error('[Metrics] Gauge 갱신 실패:', err.message);
  }
}

module.exports = {
  client,
  updateGauges,
  initializeSeatMetricAggregate,
  SEAT_METRICS_KEY,
  lockAttempts,
  seatEvents,
  timerExpirations,
  bookingOperations,
  timerStarts,
  timerCancellations,
  httpRequestDuration,
};
