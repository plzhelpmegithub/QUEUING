const Redis = require('ioredis');
const redis = require('../config/redis');
const { publishSeatEvent, EVENT_TYPE } = require('./eventService');

// ===== 타이머 설정 =====
const TIMER_PREFIX = 'timer:seat:';  // 타이머 키 접두사 (예: timer:seat:A-001)
const SEAT_PREFIX = 'seat:';         // 좌석 상태 키 접두사
const HOLD_DURATION = parseInt(process.env.HOLD_DURATION, 10) || 600; // 기본 10분 (600초), 테스트 시 15초

// keyspace notification 구독 전용 연결
// subscribe 모드에 들어가면 다른 명령을 실행할 수 없어서 별도 연결 필요
let subscriber = null;

/**
 * 타이머 시작
 * - 좌석 선점 시 호출
 * - timer:seat:{seatId} 키를 TTL로 생성
 * - TTL 만료 시 Redis가 자동으로 keyspace notification 발생
 *
 * @param {string} seatId - 좌석 ID (예: "A-001")
 * @param {string} userId - 선점한 사용자 ID
 */
async function startTimer(seatId, userId) {
  const timerKey = `${TIMER_PREFIX}${seatId}`;
  await redis.set(timerKey, userId, 'EX', HOLD_DURATION); // EX = 만료 시간 설정
  console.log(`[Timer] ${seatId} 타이머 시작 (${HOLD_DURATION}초) — ${userId}`);
}

/**
 * 타이머 취소
 * - 결제 완료 시 호출 → 만료 이벤트가 발생하지 않도록 키 삭제
 *
 * @param {string} seatId - 좌석 ID
 */
async function cancelTimer(seatId) {
  const timerKey = `${TIMER_PREFIX}${seatId}`;
  await redis.del(timerKey); // 키 삭제 → TTL 만료 이벤트 방지
  console.log(`[Timer] ${seatId} 타이머 취소`);
}

/**
 * 남은 시간 조회
 * - 사용자에게 "결제까지 X분 남았습니다" 보여줄 때 사용
 *
 * @param {string} seatId - 좌석 ID
 * @returns {number} 남은 초 (-1이면 타이머 없음)
 */
async function getRemaining(seatId) {
  const timerKey = `${TIMER_PREFIX}${seatId}`;
  const ttl = await redis.ttl(timerKey); // TTL 조회 (남은 초)
  return ttl > 0 ? ttl : -1;
}

/**
 * keyspace notification 리스너 초기화
 * - 서버 시작 시 1번 호출
 * - Redis의 키 만료 이벤트를 구독해서 좌석 자동 해제
 *
 * 동작 원리:
 * 1. timer:seat:A-001 키가 TTL 만료로 삭제됨
 * 2. Redis가 __keyevent@0__:expired 채널에 이벤트 발행
 * 3. subscriber가 수신 → 좌석 상태를 available로 복구
 */
async function initExpiryListener() {
  // 1) Redis 설정 — Ex = 만료 이벤트 활성화
  await redis.config('SET', 'notify-keyspace-events', 'Ex');

  // 2) 구독 전용 Redis 연결 생성 (기존 연결은 다른 명령에 계속 사용)
  subscriber = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  });

  // 3) DB 0의 만료 이벤트 채널 구독
  const channel = '__keyevent@0__:expired';
  await subscriber.subscribe(channel);

  // 4) 만료 이벤트 수신 시 처리
  subscriber.on('message', async (ch, expiredKey) => {
    // timer:seat:* 키만 처리 (다른 키 만료는 무시)
    if (!expiredKey.startsWith(TIMER_PREFIX)) return;

    const seatId = expiredKey.replace(TIMER_PREFIX, ''); // 좌석 ID 추출
    console.log(`[Timer] ${seatId} 만료 — 좌석 자동 해제`);

    const seatKey = `${SEAT_PREFIX}${seatId}`;
    const status = await redis.hget(seatKey, 'status'); // 현재 좌석 상태 확인

    // held 상태일 때만 해제 (이미 sold면 건드리지 않음)
    if (status === 'held') {
      const heldBy = await redis.hget(seatKey, 'heldBy'); // 누가 잡고 있었는지
      await redis.hset(seatKey, {
        status: 'available',  // 다시 예매 가능 상태로 복구
        heldBy: '',
        heldAt: '',
      });
      // 해제 이벤트 발행 → C파트가 구독해서 실시간 브로드캐스트
      await publishSeatEvent(EVENT_TYPE.RELEASED, { seatId, userId: heldBy });
      console.log(`[Timer] ${seatId} → available 복구 완료`);
    }
  });

  console.log('[Timer] 만료 리스너 시작');
}

/**
 * 리스너 종료 (서버 셧다운 시)
 */
async function stopExpiryListener() {
  if (subscriber) {
    await subscriber.unsubscribe();
    subscriber.disconnect();
  }
}

module.exports = { startTimer, cancelTimer, getRemaining, initExpiryListener, stopExpiryListener };
