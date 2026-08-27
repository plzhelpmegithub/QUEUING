const redis = require('../config/redis');
const pool = require('../config/mariadb');
const { acquireLock, releaseLock } = require('./lockService');          // 분산 락
const { startTimer, cancelTimer, getRemaining } = require('./timerService'); // 결제 타이머
const { publishSeatEvent, EVENT_TYPE } = require('./eventService');     // 이벤트 발행
const { saveReservation, cancelReservation } = require('./dbService');  // MariaDB 저장

// ===== Redis 키 정의 =====
const SEAT_PREFIX = 'seat:';              // Hash — 좌석 상태 (예: seat:evt-171...:A-001)
const ADMITTED_KEY = 'queue:admitted';     // Set — 입장 허용된 사용자
const SOLD_OUT_KEY = 'event:sold-out';    // 매진 플래그 (1이면 매진)
const EVENT_KEY = 'event:info';           // 현재 활성 이벤트
const EVENT_LIST_KEY = 'events:list';     // 전체 이벤트 목록 (Redis)

async function ensureEventInMariaDB(eventId) {
  if (!eventId) return;
  const rows = await pool.query('SELECT event_id FROM events WHERE event_id = ?', [eventId]);
  if (rows.length > 0) return;
  const cardStr = await redis.hget(EVENT_LIST_KEY, eventId);
  if (!cardStr) {
    console.warn(`[Seat] Redis에 이벤트 ${eventId} 없음 — events 테이블 동기화 건너뜀`);
    return;
  }
  const e = JSON.parse(cardStr);
  await pool.query(
    `INSERT IGNORE INTO events (event_id, event_name, event_date, venue, total_seats, seating_type, sections, status, emoji, color, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [eventId, e.eventName || '', e.eventDate || '', e.venue || '', e.totalSeats || 0, e.seatingType || 'arena', JSON.stringify(e.sections || []), e.status || 'open', e.emoji || '', e.color || ''],
  );
  console.log(`[Seat] MariaDB events 테이블에 ${eventId} 자동 동기화 완료`);
}

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
 * - 구역(section)과 가격(price) 정보도 함께 저장
 *
 * @param {string[]} seatIds - 예: ["VIP-001", "A-001"]
 * @param {string} section - 구역명 (예: "VIP")
 * @param {number} price - 가격 (예: 150000)
 */
async function initSeats(seatIds, section = '', price = 0) {
  const pipeline = redis.pipeline();
  for (const id of seatIds) {
    const key = `${SEAT_PREFIX}${id}`;
    pipeline.hset(key, {
      status: STATUS.AVAILABLE,
      heldBy: '',
      heldAt: '',
      section: section,
      price: price.toString(),
    });
  }
  await pipeline.exec();

  // MariaDB seats 테이블에도 저장
  // seat_id에서 event_id 추출 (형식: evt-171...:VIP-001)
  const eventId = seatIds[0]?.split(':')[0] || '';
  try {
    const values = seatIds.map(id => [id, eventId, section, price, 'AVAILABLE', '', null]);
    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
    const flat = values.flat();
    await pool.query(
      `INSERT IGNORE INTO seats (seat_id, event_id, section, price, status, held_by, held_at) VALUES ${placeholders}`,
      flat,
    );
  } catch (dbErr) {
    console.error('[Seat] MariaDB 초기화 실패:', dbErr.message);
  }

  return { initialized: seatIds.length, section, price, seats: seatIds };
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
async function holdSeat(userId, seatId, admissionToken) {
  const { verifyToken } = require('./tokenService'); // 토큰 서비스

  // 1) Admission Token 검증
  const tokenResult = await verifyToken(admissionToken, userId);
  if (!tokenResult.valid) {
    return { success: false, reason: tokenResult.reason, message: tokenResult.message };
  }

  // 2) 입장 허용 여부 확인 (이중 검증)
  const isAdmitted = await redis.sismember(ADMITTED_KEY, userId);
  if (!isAdmitted) {
    return { success: false, reason: 'not_admitted', message: '입장이 허용되지 않은 사용자입니다.' };
  }

  // 3) 분산 락 획득 — 같은 좌석에 동시 요청 시 1명만 통과
  const lock = await acquireLock(seatId);
  if (!lock.acquired) {
    return { success: false, reason: 'lock_failed', message: '다른 사용자가 처리 중입니다. 잠시 후 다시 시도해주세요.' };
  }

  try {
    // 4) 좌석 상태 확인
    const seatKey = `${SEAT_PREFIX}${seatId}`;
    const status = await redis.hget(seatKey, 'status');

    if (!status) {
      return { success: false, reason: 'not_found', message: '존재하지 않는 좌석입니다.' };
    }

    if (status !== STATUS.AVAILABLE) {
      return { success: false, reason: 'unavailable', message: `이미 ${status} 상태인 좌석입니다.` };
    }

    // 5) 좌석 선점 처리
    await redis.hset(seatKey, {
      status: STATUS.HELD,
      heldBy: userId,
      heldAt: Date.now().toString(),
    });
    await startTimer(seatId, userId);
    await publishSeatEvent(EVENT_TYPE.HELD, { seatId, userId });

    // MariaDB 동기화
    try {
      await pool.query(
        `UPDATE seats SET status = 'LOCKED', held_by = ?, held_at = NOW() WHERE seat_id = ?`,
        [userId, seatId],
      );
    } catch (dbErr) {
      console.error('[Seat] MariaDB hold 동기화 실패:', dbErr.message);
    }

    // 토큰은 여기서 무효화하지 않음 — 결제를 확정(confirmSeat)하기 전까지는
    // 같은 Admission Token으로 좌석을 바꿔 다시 선점할 수 있어야 함(선점 후
    // 다른 자리로 바꾸는 흐름을 지원하려면 토큰이 세션 동안 계속 살아있어야 함).
    // 재사용 방지는 confirmSeat에서 결제가 실제로 끝났을 때 처리.

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
 * 좌석 선점 해제 (본인이 held 상태로 선점한 좌석을 자발적으로 풀어줄 때)
 * - 결제 전 다른 좌석으로 바꾸거나, 페이지를 벗어나는 경우 호출
 * - held 상태 + 본인이 선점한 좌석일 때만 해제 (sold는 cancelSeat로 별도 처리)
 * - standby 대기자가 있으면 타임아웃 해제와 동일하게 곧바로 다음 사용자에게 배정
 *   (available로 잠깐 열었다가 다시 누가 잡는 경쟁 상태를 피하기 위함)
 */
async function releaseSeat(userId, seatId) {
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

  await cancelTimer(seatId); // 기존 결제 타이머 제거 (중복 만료 이벤트 방지)

  // standby 대기자가 있으면 곧바로 다음 사람에게 배정 — 타임아웃 자동 해제(timerService)와 동일한 정책
  const nextUsers = await redis.zrange('queue:standby', 0, 0);
  if (nextUsers.length > 0) {
    const nextUser = nextUsers[0];
    await redis.zrem('queue:standby', nextUser);
    await redis.sadd(ADMITTED_KEY, nextUser);
    await redis.hset(seatKey, { status: STATUS.HELD, heldBy: nextUser, heldAt: Date.now().toString() });
    await startTimer(seatId, nextUser);
    await publishSeatEvent(EVENT_TYPE.HELD, {
      seatId,
      userId: nextUser,
      reason: 'standby_auto_assign',
      message: `${userId} 선점 해제 → ${nextUser}에게 자동 배정`,
    });
    return {
      success: true,
      seatId,
      status: STATUS.HELD,
      reassignedTo: nextUser,
      message: '선점을 해제했고, 대기 중이던 다음 사용자에게 배정되었습니다.',
    };
  }

  await redis.hset(seatKey, { status: STATUS.AVAILABLE, heldBy: '', heldAt: '' });
  await publishSeatEvent(EVENT_TYPE.RELEASED, { seatId, userId });

  try {
    await pool.query(
      `UPDATE seats SET status = 'AVAILABLE', held_by = '', held_at = NULL WHERE seat_id = ?`,
      [seatId],
    );
  } catch (dbErr) {
    console.error('[Seat] MariaDB release 동기화 실패:', dbErr.message);
  }

  return {
    success: true,
    seatId,
    status: STATUS.AVAILABLE,
    message: '좌석 선점이 해제되었습니다.',
  };
}

/**
 * 현재 활성 이벤트의 좌석만 조회
 * - event:info에서 eventId를 읽어 해당 이벤트 좌석만 SCAN
 * - 다른 이벤트의 잔여 키가 섞이지 않음
 *
 * @param {string} [eventId] - 특정 이벤트 ID (미지정 시 현재 활성 이벤트)
 */
async function getAllSeats(eventId) {
  if (!eventId) {
    const info = await redis.hgetall(EVENT_KEY);
    eventId = info && info.eventId ? info.eventId : null;
  }

  const pattern = eventId
    ? `${SEAT_PREFIX}${eventId}:*`
    : `${SEAT_PREFIX}*`;

  const keys = [];
  let cursor = '0';
  do {
    const [nextCursor, results] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
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
 * 특정 이벤트의 좌석 키를 일괄 삭제
 * - 이벤트 취소/종료 시 호출하여 Redis 메모리 확보
 *
 * @param {string} eventId - 삭제할 이벤트 ID
 * @returns {{ deleted: number }}
 */
async function cleanupEventSeats(eventId) {
  if (!eventId) return { deleted: 0 };

  let deleted = 0;
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${SEAT_PREFIX}${eventId}:*`, 'COUNT', 200);
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
      deleted += keys.length;
    }
  } while (cursor !== '0');

  console.log(`[Seat] cleanup — ${eventId} 좌석 키 ${deleted}개 삭제`);
  return { deleted };
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

  // MariaDB에 예매 기록 저장 (Redis 상태 변경보다 먼저 — DB 저장이 실패하면
  // Redis를 롤백할 필요 없이 held 상태가 유지되므로 재시도가 가능)
  const eventId = seatId.split(':')[0] || '';
  await ensureEventInMariaDB(eventId);
  await saveReservation({ seatId, userId, eventId });

  // MariaDB seats 테이블 동기화
  try {
    await pool.query(`UPDATE seats SET status = 'RESERVED' WHERE seat_id = ?`, [seatId]);
  } catch (dbErr) {
    console.error('[Seat] MariaDB confirm 동기화 실패:', dbErr.message);
  }

  // 좌석 확정 처리 (DB 저장 성공 후에 Redis 상태 변경)
  await redis.hset(seatKey, { status: STATUS.SOLD });
  await cancelTimer(seatId);
  await publishSeatEvent(EVENT_TYPE.SOLD, { seatId, userId });

  // 결제까지 끝났으니 이제 Admission Token 무효화 — 이 시점부터는 재사용 방지
  // (선점만 하고 아직 결제 전인 동안은 좌석을 바꿀 수 있어야 해서 holdSeat에서는
  // 무효화하지 않음)
  const { revokeToken } = require('./tokenService');
  await revokeToken(userId);

  // ===== 매진 체크 =====
  // 남은 좌석 (available + held)이 0이면 전석 매진
  const allSeats = await getAllSeats();
  const remaining = allSeats.filter(s => s.status === STATUS.AVAILABLE || s.status === STATUS.HELD);
  if (remaining.length === 0) {
    await redis.set(SOLD_OUT_KEY, '1'); // 매진 플래그 설정

    // 티켓팅 상태: sold_out (standby 진입은 허용, eligible만 마감)
    // closed가 아니라 sold_out으로 설정 → standby 추가 접수 가능
    await redis.set('event:ticketing-status', 'sold_out');
    console.log('[Ticketing] 전석 매진 → sold_out (standby 대기 접수 계속 가능)');

    // 매진 이벤트 발행 → C파트가 대기 중인 사용자에게 "전석 매진" 알림
    await publishSeatEvent(EVENT_TYPE.SOLD_OUT, {
      seatId: 'ALL',
      message: '전석 매진 — 취소표 대기는 계속 가능합니다.',
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
  // 본인이 구매한 좌석이 아니면 거부 (confirmSeat에서 heldBy를 지우지 않고
  // 그대로 두므로, sold 상태에서도 원 구매자가 누구인지 알 수 있음)
  if (heldBy && heldBy !== userId) {
    return { success: false, reason: 'not_owner', message: '본인이 구매한 좌석이 아닙니다.' };
  }

  // 좌석을 다시 예매 가능 상태로 복구
  await redis.hset(seatKey, {
    status: STATUS.AVAILABLE,
    heldBy: '',
    heldAt: '',
  });

  await redis.del(SOLD_OUT_KEY);
  await publishSeatEvent(EVENT_TYPE.CANCELLED, { seatId, userId });
  await cancelReservation(seatId, userId);

  // MariaDB seats 테이블 동기화
  try {
    await pool.query(
      `UPDATE seats SET status = 'AVAILABLE', held_by = '', held_at = NULL WHERE seat_id = ?`,
      [seatId],
    );
  } catch (dbErr) {
    console.error('[Seat] MariaDB cancel 동기화 실패:', dbErr.message);
  }

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

module.exports = { initSeats, holdSeat, confirmSeat, cancelSeat, releaseSeat, getSeatTimer, getAllSeats, isSoldOut, getAvailableCount, cleanupEventSeats, STATUS };
