const redis = require('../config/redis');
const { acquireLock, releaseLock } = require('./lockService');          // 분산 락
const { startTimer, cancelTimer, getRemaining } = require('./timerService'); // 결제 타이머
const { publishSeatEvent, EVENT_TYPE } = require('./eventService');     // 이벤트 발행
const { saveReservation } = require('./dbService');                     // DynamoDB 저장

// ===== Redis 키 정의 =====
const SEAT_PREFIX = 'seat:';              // Hash — 좌석 상태 (예: seat:A-001)
const ADMITTED_KEY = 'queue:admitted';     // Set — 입장 허용된 사용자
const SOLD_OUT_KEY = 'event:sold-out';    // 매진 플래그 (1이면 매진)

// ===== 좌석 상태값 =====
const STATUS = {
  AVAILABLE: 'available',    // 예매 가능
  HELD: 'held',              // 선점 중 (결제 대기 — 10분 제한)
  SOLD: 'sold',              // 판매 완료
  CANCELLED: 'cancelled',    // 취소됨
};

/**
 * 좌석 초기화 (이벤트 세팅용)
 * - 콘서트 등록 시 좌석들을 available 상태로 생성
 * - 파이프라인으로 한 번에 처리 (네트워크 효율)
 *
 * @param {string[]} seatIds - 예: ["A-001", "A-002", ..., "A-1000"]
 */
async function initSeats(seatIds) {
  const pipeline = redis.pipeline();
  for (const id of seatIds) {
    pipeline.hset(`${SEAT_PREFIX}${id}`, {
      status: STATUS.AVAILABLE,  // 초기 상태: 예매 가능
      heldBy: '',                // 선점한 사용자 없음
      heldAt: '',                // 선점 시간 없음
    });
  }
  await pipeline.exec();
  return { initialized: seatIds.length, seats: seatIds };
}

/**
 * 좌석 선점 (핵심 — 분산 락 적용)
 * - 동시에 같은 좌석을 요청해도 정확히 1명만 성공
 *
 * 흐름:
 * 1. admitted 사용자인지 확인 (입장 허용된 사용자만 선점 가능)
 * 2. 해당 좌석에 분산 락 획득 시도
 * 3. 좌석 상태가 available인지 확인
 * 4. held로 변경 + 결제 타이머 시작 + 이벤트 발행
 * 5. 락 해제 (finally에서 — 성공이든 실패든 반드시)
 */
async function holdSeat(userId, seatId) {
  // 1) 입장 허용 여부 확인
  const isAdmitted = await redis.sismember(ADMITTED_KEY, userId);
  if (!isAdmitted) {
    return { success: false, reason: 'not_admitted', message: '입장이 허용되지 않은 사용자입니다.' };
  }

  // 2) 분산 락 획득 — 같은 좌석에 동시 요청 시 1명만 통과
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

    // 4) 좌석 선점 처리
    await redis.hset(seatKey, {
      status: STATUS.HELD,              // 상태 변경: available → held
      heldBy: userId,                   // 누가 잡았는지 기록
      heldAt: Date.now().toString(),    // 언제 잡았는지 기록
    });
    await startTimer(seatId, userId);   // 결제 타이머 시작 (10분)
    await publishSeatEvent(EVENT_TYPE.HELD, { seatId, userId }); // 이벤트 발행

    return {
      success: true,
      seatId,
      status: STATUS.HELD,
      message: '좌석이 선점되었습니다. 10분 내에 결제를 완료해주세요.',
    };
  } finally {
    // 5) 락 해제 — 성공이든 실패든 반드시 해제 (데드락 방지)
    await releaseLock(seatId, lock.token);
  }
}

/**
 * 전체 좌석 현황 조회
 * - SCAN으로 seat:* 키를 순회하며 전체 좌석 상태 반환
 * - 매진 체크, 남은 좌석 수 계산 등에 사용
 */
async function getAllSeats() {
  const keys = [];
  let cursor = '0';
  do {
    // SCAN — 전체 키를 한 번에 가져오지 않고 나눠서 조회 (성능 안전)
    const [nextCursor, results] = await redis.scan(cursor, 'MATCH', `${SEAT_PREFIX}*`, 'COUNT', 100);
    cursor = nextCursor;
    keys.push(...results);
  } while (cursor !== '0');

  if (keys.length === 0) return [];

  // 파이프라인으로 모든 좌석 상태를 한 번에 조회
  const pipeline = redis.pipeline();
  for (const key of keys) {
    pipeline.hgetall(key); // Hash 전체 값 조회
  }
  const results = await pipeline.exec();

  return keys.map((key, i) => ({
    seatId: key.replace(SEAT_PREFIX, ''), // 키에서 접두사 제거 → 좌석 ID
    ...results[i][1],                      // 좌석 상태 데이터
  }));
}

/**
 * 결제 확인 → 좌석 확정 (held → sold)
 * - held 상태 + 본인이 선점한 좌석일 때만 확정
 * - 타이머 취소 + 이벤트 발행 + DynamoDB에 예약 기록 저장
 * - 마지막 좌석이면 seat.sold_out 이벤트 발행
 */
async function confirmSeat(userId, seatId) {
  const seatKey = `${SEAT_PREFIX}${seatId}`;
  const [status, heldBy] = await Promise.all([
    redis.hget(seatKey, 'status'),   // 현재 상태
    redis.hget(seatKey, 'heldBy'),   // 누가 잡고 있는지
  ]);

  // 선점 상태가 아니면 거부
  if (status !== STATUS.HELD) {
    return { success: false, reason: 'not_held', message: '선점 상태가 아닌 좌석입니다.' };
  }
  // 본인이 아니면 거부
  if (heldBy !== userId) {
    return { success: false, reason: 'not_owner', message: '본인이 선점한 좌석이 아닙니다.' };
  }

  // 좌석 확정 처리
  await redis.hset(seatKey, { status: STATUS.SOLD });           // 상태 변경: held → sold
  await cancelTimer(seatId);                                      // 타이머 취소 (만료 이벤트 방지)
  await publishSeatEvent(EVENT_TYPE.SOLD, { seatId, userId });   // 판매 완료 이벤트
  await saveReservation({ seatId, userId });                      // DynamoDB에 예약 기록 영구 저장

  // ===== 매진 체크 =====
  // 남은 좌석 (available + held)이 0이면 전석 매진
  const allSeats = await getAllSeats();
  const remaining = allSeats.filter(s => s.status === STATUS.AVAILABLE || s.status === STATUS.HELD);
  if (remaining.length === 0) {
    await redis.set(SOLD_OUT_KEY, '1'); // 매진 플래그 설정
    // 매진 이벤트 발행 → C파트가 대기 중인 사용자에게 "전석 매진" 알림
    await publishSeatEvent(EVENT_TYPE.SOLD_OUT, {
      seatId: 'ALL',
      message: '전석 매진',
      totalSold: allSeats.filter(s => s.status === STATUS.SOLD).length,
    });
  }

  return {
    success: true,
    seatId,
    status: STATUS.SOLD,
    message: '결제가 완료되었습니다. (DB 저장 완료)',
  };
}

/**
 * 좌석 남은 시간 조회
 * - 프론트에서 "결제까지 X분 X초 남았습니다" 카운트다운에 사용
 */
async function getSeatTimer(seatId) {
  const remaining = await getRemaining(seatId);
  return { seatId, remainingSeconds: remaining };
}

/**
 * 좌석 취소 (재판매 트리거)
 * - sold 상태인 좌석을 취소 → available로 복구
 * - seat.cancelled 이벤트 발행 → B파트가 구독해서 standby 대기자에게 Secret Link 발급
 * - 매진 플래그 해제 (취소표가 생겼으니)
 */
async function cancelSeat(userId, seatId) {
  const seatKey = `${SEAT_PREFIX}${seatId}`;
  const [status, heldBy] = await Promise.all([
    redis.hget(seatKey, 'status'),
    redis.hget(seatKey, 'heldBy'),
  ]);

  // 판매 완료 상태가 아니면 취소 불가
  if (status !== STATUS.SOLD) {
    return { success: false, reason: 'not_sold', message: '판매 완료 상태가 아닌 좌석입니다.' };
  }

  // 좌석을 다시 예매 가능 상태로 복구
  await redis.hset(seatKey, {
    status: STATUS.AVAILABLE,
    heldBy: '',
    heldAt: '',
  });

  await redis.del(SOLD_OUT_KEY); // 매진 플래그 해제 (취소표 발생)

  // 취소 이벤트 발행 → B파트가 이걸 받아서 재판매 순차배정 시작
  await publishSeatEvent(EVENT_TYPE.CANCELLED, { seatId, userId });

  return {
    success: true,
    seatId,
    status: STATUS.AVAILABLE,
    message: '좌석이 취소되었습니다. 취소표 대기자에게 기회가 부여됩니다.',
  };
}

/**
 * 매진 여부 확인
 * - 프론트에서 폴링하거나 C파트가 sold_out 이벤트로 브로드캐스트
 * - standby 사용자에게 "전석 매진. 취소표 대기하시겠습니까?" 표시에 사용
 */
async function isSoldOut() {
  const flag = await redis.get(SOLD_OUT_KEY);
  const soldOut = flag === '1';
  return {
    soldOut,
    message: soldOut
      ? '전석 예매 완료되었습니다. 취소표 대기를 원하시면 대기열에 남아주세요.'
      : '아직 예매 가능한 좌석이 있습니다.',
  };
}

/**
 * 남은 좌석 수 조회
 * - 현재 available/held/sold 각각 몇 석인지 반환
 * - 프론트에서 "잔여 좌석: X석" 표시에 사용
 */
async function getAvailableCount() {
  const allSeats = await getAllSeats();
  const available = allSeats.filter(s => s.status === STATUS.AVAILABLE);
  const held = allSeats.filter(s => s.status === STATUS.HELD);
  const sold = allSeats.filter(s => s.status === STATUS.SOLD);
  return {
    total: allSeats.length,       // 전체 좌석 수
    available: available.length,  // 예매 가능
    held: held.length,            // 선점 중 (결제 대기)
    sold: sold.length,            // 판매 완료
  };
}

module.exports = { initSeats, holdSeat, confirmSeat, cancelSeat, getSeatTimer, getAllSeats, isSoldOut, getAvailableCount, STATUS };
