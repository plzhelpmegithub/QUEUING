const Redis = require('ioredis');
const redis = require('../config/redis');
const pool = require('../config/mariadb');
const { publishSeatEvent, EVENT_TYPE } = require('./eventService');
const { timerExpirations } = require('./metricsService');
const { createAllocation, markExpired } = require('./cancelAllocationService');

// ===== 타이머 설정 =====
const TIMER_PREFIX = 'timer:seat:';  // 타이머 키 접두사 (예: timer:seat:A-001)
const SEAT_PREFIX = 'seat:';         // 좌석 상태 키 접두사
const HOLD_DURATION_KEY = 'event:hold-duration'; // 관리자 설정 결제 제한 시간
const DEFAULT_HOLD_DURATION = parseInt(process.env.HOLD_DURATION, 10) || 600; // 환경변수 또는 기본 10분

// keyspace notification 구독 전용 연결
// subscribe 모드에 들어가면 다른 명령을 실행할 수 없어서 별도 연결 필요
let subscriber = null;

/**
 * 현재 설정된 결제 제한 시간 조회
 * - Redis에 관리자가 설정한 값이 있으면 그 값 사용
 * - 없으면 환경변수 또는 기본값(600초) 사용
 */
async function getCurrentHoldDuration() {
  const stored = await redis.get(HOLD_DURATION_KEY);
  return stored ? parseInt(stored, 10) : DEFAULT_HOLD_DURATION;
}

/**
 * 타이머 시작
 * - 좌석 선점 시 호출
 * - 관리자가 설정한 결제 제한 시간만큼 TTL 부여
 *
 * @param {string} seatId - 좌석 ID (예: "A-001")
 * @param {string} userId - 선점한 사용자 ID
 */
async function startTimer(seatId, userId) {
  const holdDuration = await getCurrentHoldDuration(); // 관리자 설정값 또는 기본값
  const timerKey = `${TIMER_PREFIX}${seatId}`;
  await redis.set(timerKey, userId, 'EX', holdDuration);
  console.log(`[Timer] ${seatId} 타이머 시작 (${holdDuration}초) — ${userId}`);
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
    console.log(`[Timer] ${seatId} 만료 — 결제 시간 초과`);

    const seatKey = `${SEAT_PREFIX}${seatId}`;
    const status = await redis.hget(seatKey, 'status'); // 현재 좌석 상태 확인

    // held 상태일 때만 처리 (이미 sold면 건드리지 않음)
    if (status === 'held') {
      const heldBy = await redis.hget(seatKey, 'heldBy'); // 누가 잡고 있었는지
      timerExpirations.inc(); // Prometheus 만료 카운터 증가

      // ===== standby 확인 =====
      const STANDBY_KEY = 'queue:standby';
      const ADMITTED_KEY = 'queue:admitted';
      const nextUsers = await redis.zrange(STANDBY_KEY, 0, 0); // standby 1순위 조회

      if (nextUsers.length > 0) {
        // ===== standby 있음 → available 거치지 않고 바로 다음 사용자에게 held 전환 =====
        const nextUser = nextUsers[0];
        await redis.zrem(STANDBY_KEY, nextUser);     // standby에서 제거
        await redis.sadd(ADMITTED_KEY, nextUser);     // admitted에 추가

        // 좌석을 바로 다음 사용자의 held로 전환
        await redis.hset(seatKey, {
          status: 'held',
          heldBy: nextUser,
          heldAt: Date.now().toString(),
        });

        // 새 타이머 시작 (다음 사용자에게도 결제 시간 부여)
        await startTimer(seatId, nextUser);

        await publishSeatEvent(EVENT_TYPE.HELD, {
          seatId,
          userId: nextUser,
          reason: 'standby_auto_assign',
          message: `${heldBy} 시간 초과 → ${nextUser}에게 자동 배정`,
        });

        // cancel_allocations에 링크 발급 기록
        const holdDuration = await getCurrentHoldDuration();
        try {
          const eventId = seatId.split(':')[0] || '';
          await createAllocation(nextUser, seatId, eventId, holdDuration);
          await markExpired(heldBy, seatId);
        } catch (allocErr) {
          console.error('[Timer] cancel_allocation 기록 실패:', allocErr.message);
        }

        // MariaDB seats 동기화
        try {
          await pool.query(
            `UPDATE seats SET status = 'LOCKED', held_by = ?, held_at = NOW() WHERE seat_id = ?`,
            [nextUser, seatId],
          );
        } catch (dbErr) {
          console.error('[Timer] MariaDB 좌석 동기화 실패:', dbErr.message);
        }

        console.log(`[Timer] ${heldBy} 시간 초과 → ${nextUser}에게 바로 배정 (${seatId} held)`);

      } else {
        // ===== standby 없음 → 기존처럼 available로 복구 =====
        await redis.hset(seatKey, {
          status: 'available',
          heldBy: '',
          heldAt: '',
        });
        await publishSeatEvent(EVENT_TYPE.RELEASED, { seatId, userId: heldBy });

        try {
          await pool.query(
            `UPDATE seats SET status = 'AVAILABLE', held_by = '', held_at = NULL WHERE seat_id = ?`,
            [seatId],
          );
        } catch (dbErr) {
          console.error('[Timer] MariaDB 복구 동기화 실패:', dbErr.message);
        }

        console.log(`[Timer] standby 없음 — ${seatId} → available 복구`);
      }
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
