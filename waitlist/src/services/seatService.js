const redis = require('../config/redis');
const { acquireLock, releaseLock } = require('./lockService');
const { startTimer, cancelTimer, getRemaining } = require('./timerService');
const { publishSeatEvent, EVENT_TYPE } = require('./eventService');

// Redis 키
const SEAT_PREFIX = 'seat:';          // Hash — 좌석 상태
const ADMITTED_KEY = 'queue:admitted'; // Set — 입장 허용된 사용자

// 좌석 상태값
const STATUS = {
  AVAILABLE: 'available',
  HELD: 'held',         // 선점 중 (결제 대기)
  SOLD: 'sold',         // 판매 완료
};

/**
 * 좌석 초기화 (테스트/이벤트 세팅용)
 * - 지정한 좌석들을 available 상태로 생성
 *
 * @param {string[]} seatIds - 예: ["A-1", "A-2", "B-1"]
 */
async function initSeats(seatIds) {
  const pipeline = redis.pipeline();
  for (const id of seatIds) {
    pipeline.hset(`${SEAT_PREFIX}${id}`, {
      status: STATUS.AVAILABLE,
      heldBy: '',
      heldAt: '',
    });
  }
  await pipeline.exec();
  return { initialized: seatIds.length, seats: seatIds };
}

/**
 * 좌석 선점 (핵심 — 분산 락 적용)
 *
 * 흐름:
 * 1. 입장 허용된 사용자인지 확인
 * 2. 해당 좌석에 락 획득 시도
 * 3. 좌석 상태가 available인지 확인
 * 4. held로 변경 + 사용자 기록
 * 5. 락 해제
 *
 * @param {string} userId
 * @param {string} seatId
 */
async function holdSeat(userId, seatId) {
  // 1) 입장 허용 확인
  const isAdmitted = await redis.sismember(ADMITTED_KEY, userId);
  if (!isAdmitted) {
    return { success: false, reason: 'not_admitted', message: '입장이 허용되지 않은 사용자입니다.' };
  }

  // 2) 락 획득
  const lock = await acquireLock(seatId);
  if (!lock.acquired) {
    return { success: false, reason: 'lock_failed', message: '다른 사용자가 처리 중입니다. 잠시 후 다시 시도해주세요.' };
  }

  try {
    // 3) 좌석 상태 확인
    const seatKey = `${SEAT_PREFIX}${seatId}`;
    const status = await redis.hget(seatKey, 'status');

    if (!status) {
      return { success: false, reason: 'not_found', message: '존재하지 않는 좌석입니다.' };
    }

    if (status !== STATUS.AVAILABLE) {
      return { success: false, reason: 'unavailable', message: `이미 ${status} 상태인 좌석입니다.` };
    }

    // 4) 좌석 선점 + 타이머 시작
    await redis.hset(seatKey, {
      status: STATUS.HELD,
      heldBy: userId,
      heldAt: Date.now().toString(),
    });
    await startTimer(seatId, userId);
    await publishSeatEvent(EVENT_TYPE.HELD, { seatId, userId });

    return {
      success: true,
      seatId,
      status: STATUS.HELD,
      message: '좌석이 선점되었습니다. 10분 내에 결제를 완료해주세요.',
    };
  } finally {
    // 5) 락 해제 — 성공이든 실패든 반드시 해제
    await releaseLock(seatId, lock.token);
  }
}

/**
 * 전체 좌석 현황 조회
 */
async function getAllSeats() {
  // seat:* 키 스캔
  const keys = [];
  let cursor = '0';
  do {
    const [nextCursor, results] = await redis.scan(cursor, 'MATCH', `${SEAT_PREFIX}*`, 'COUNT', 100);
    cursor = nextCursor;
    keys.push(...results);
  } while (cursor !== '0');

  if (keys.length === 0) return [];

  const pipeline = redis.pipeline();
  for (const key of keys) {
    pipeline.hgetall(key);
  }
  const results = await pipeline.exec();

  return keys.map((key, i) => ({
    seatId: key.replace(SEAT_PREFIX, ''),
    ...results[i][1],
  }));
}

/**
 * 결제 확인 → 좌석 확정 (sold)
 * - held 상태 + 본인 좌석일 때만 확정
 * - 타이머 취소
 */
async function confirmSeat(userId, seatId) {
  const seatKey = `${SEAT_PREFIX}${seatId}`;
  const [status, heldBy] = await Promise.all([
    redis.hget(seatKey, 'status'),
    redis.hget(seatKey, 'heldBy'),
  ]);

  if (status !== STATUS.HELD) {
    return { success: false, reason: 'not_held', message: '선점 상태가 아닌 좌석입니다.' };
  }
  if (heldBy !== userId) {
    return { success: false, reason: 'not_owner', message: '본인이 선점한 좌석이 아닙니다.' };
  }

  await redis.hset(seatKey, { status: STATUS.SOLD });
  await cancelTimer(seatId);
  await publishSeatEvent(EVENT_TYPE.SOLD, { seatId, userId });

  return {
    success: true,
    seatId,
    status: STATUS.SOLD,
    message: '결제가 완료되었습니다.',
  };
}

/**
 * 좌석 남은 시간 조회
 */
async function getSeatTimer(seatId) {
  const remaining = await getRemaining(seatId);
  return { seatId, remainingSeconds: remaining };
}

module.exports = { initSeats, holdSeat, confirmSeat, getSeatTimer, getAllSeats, STATUS };
