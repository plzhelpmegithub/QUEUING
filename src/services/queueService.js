const redis = require('../config/redis');

// ===== Redis 키 정의 =====
const QUEUE_KEY = 'queue:waiting';           // Sorted Set — eligible(예매 가능) 대기열
const COUNTER_KEY = 'queue:counter';         // 순번 발급용 원자 카운터 (INCR로 1씩 증가)
const ADMITTED_KEY = 'queue:admitted';       // Set — 입장 허용된 사용자 목록
const STANDBY_KEY = 'queue:standby';        // Sorted Set — 취소표 대기자 (1001번~)
const TOTAL_SEATS_KEY = 'event:total-seats'; // 총 좌석 수 (eligible/standby 분류 기준)
const TICKETING_STATUS_KEY = 'event:ticketing-status'; // 티켓팅 상태 (open/closed)
const HOLD_DURATION_KEY = 'event:hold-duration';       // 결제 제한 시간 (초)

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE, 10) || 100; // 한 번에 입장시킬 인원 (100명씩)

/**
 * 총 좌석 수 설정
 * - 이벤트(콘서트) 생성 시 호출
 * - 이 값 기준으로 eligible(예매 가능)/standby(취소표 대기) 분리
 * - 예: 1000석이면 1~1000번은 eligible, 1001번부터 standby
 */
async function setTotalSeats(count) {
  await redis.set(TOTAL_SEATS_KEY, count); // Redis에 총 좌석 수 저장
  return { totalSeats: count, message: `총 좌석 수 ${count}석으로 설정` };
}

/**
 * 대기열 진입
 * - 사용자가 예매 페이지에 접속하면 호출
 * - 순번을 발급하고 eligible/standby로 자동 분류
 * - 중복 진입 방지 (이미 있으면 기존 순번 반환)
 */
async function enter(userId) {
  // 0) 티켓팅이 오픈 상태인지 확인 — closed면 진입 차단
  const ticketingStatus = await redis.get(TICKETING_STATUS_KEY);
  if (ticketingStatus !== 'open') {
    return { status: 'closed', message: '현재 티켓팅이 오픈되지 않았습니다.' };
  }

  // 1) 이미 입장 허용된 사용자 → 다시 대기열에 넣지 않음
  const isAdmitted = await redis.sismember(ADMITTED_KEY, userId);
  if (isAdmitted) {
    return { status: 'admitted', message: '이미 입장이 허용된 상태입니다.' };
  }

  // 2) 이미 eligible 대기열에 있는지 확인 → 중복 진입 방지
  const existingScore = await redis.zscore(QUEUE_KEY, userId);
  if (existingScore !== null) {
    const position = await redis.zrank(QUEUE_KEY, userId);           // 현재 순서 (0-based)
    const totalSeats = parseInt(await redis.get(TOTAL_SEATS_KEY), 10) || 0;
    const type = (position + 1) <= totalSeats ? 'eligible' : 'standby'; // 좌석 수와 비교
    return {
      status: 'waiting',
      type,
      position: position + 1,       // 1-based로 변환
      ticket: parseInt(existingScore, 10),
      message: '이미 대기열에 등록되어 있습니다.',
    };
  }

  // 3) 이미 standby 대기열에 있는지 확인
  const standbyScore = await redis.zscore(STANDBY_KEY, userId);
  if (standbyScore !== null) {
    const rank = await redis.zrank(STANDBY_KEY, userId);
    return {
      status: 'standby',
      type: 'standby',
      standbyPosition: rank + 1,
      message: '취소표 대기 중입니다.',
    };
  }

  // 4) 총 좌석 수 확인 — 설정 안 되어있으면 진입 불가
  const totalSeats = parseInt(await redis.get(TOTAL_SEATS_KEY), 10) || 0;
  if (totalSeats === 0) {
    return { status: 'error', message: '이벤트 좌석이 설정되지 않았습니다.' };
  }

  // 5) 새 순번 발급 — INCR은 원자적이라 동시 요청에도 중복 없음
  const ticket = await redis.incr(COUNTER_KEY);

  // 6) eligible / standby 분류
  if (ticket <= totalSeats) {
    // ===== 예매 가능 대기열에 등록 =====
    await redis.zadd(QUEUE_KEY, ticket, userId);  // score = 순번, member = userId
    const position = await redis.zrank(QUEUE_KEY, userId);
    return {
      status: 'waiting',
      type: 'eligible',              // 좌석을 확보할 수 있는 사용자
      position: position + 1,
      ticket,
      message: `대기열에 등록되었습니다. (${position + 1}번째)`,
    };
  } else {
    // ===== 취소표 대기열에 등록 (1001번~) =====
    await redis.zadd(STANDBY_KEY, ticket, userId);
    const rank = await redis.zrank(STANDBY_KEY, userId);
    return {
      status: 'waiting',
      type: 'standby',               // 취소표가 나야 기회가 오는 사용자
      standbyPosition: rank + 1,
      ticket,
      message: `현재 매진 상태입니다. 취소표 대기 ${rank + 1}번째로 등록되었습니다.`,
    };
  }
}

/**
 * 내 순번 조회
 * - 사용자가 "내 순서가 몇 번째야?" 확인할 때 호출
 * - eligible/standby/admitted 상태를 구분해서 반환
 */
async function getPosition(userId) {
  // 이미 입장 허용된 상태
  const isAdmitted = await redis.sismember(ADMITTED_KEY, userId);
  if (isAdmitted) {
    return { status: 'admitted', message: '입장이 허용된 상태입니다.' };
  }

  // eligible 대기열에서 찾기
  const rank = await redis.zrank(QUEUE_KEY, userId);  // ZRANK: 0-based 순위 반환
  if (rank !== null) {
    const totalWaiting = await redis.zcard(QUEUE_KEY); // ZCARD: 전체 대기 인원 수
    return {
      status: 'waiting',
      type: 'eligible',
      position: rank + 1,
      totalWaiting,
      message: `현재 ${rank + 1}번째 순서입니다.`,
    };
  }

  // standby 대기열에서 찾기
  const standbyRank = await redis.zrank(STANDBY_KEY, userId);
  if (standbyRank !== null) {
    const totalStandby = await redis.zcard(STANDBY_KEY);
    return {
      status: 'standby',
      type: 'standby',
      standbyPosition: standbyRank + 1,
      totalStandby,
      message: `취소표 대기 ${standbyRank + 1}번째입니다.`,
    };
  }

  // 어디에도 없음
  return { status: 'not_found', message: '대기열에 등록되어 있지 않습니다.' };
}

/**
 * 입장 허용 (배치)
 * - eligible 대기열 앞에서 100명씩 꺼내서 입장 허용
 * - standby는 건드리지 않음 (취소표 발생 시에만 B파트가 처리)
 * - 실제 운영에서는 스케줄러가 주기적으로 호출
 */
async function admitBatch() {
  const users = await redis.zrange(QUEUE_KEY, 0, BATCH_SIZE - 1); // 상위 100명 조회

  if (users.length === 0) {
    return { admitted: [], count: 0, message: '대기 중인 사용자가 없습니다.' };
  }

  // 파이프라인 — 여러 명령을 묶어서 한 번에 실행 (네트워크 왕복 최소화)
  const pipeline = redis.pipeline();
  pipeline.zrem(QUEUE_KEY, ...users);     // 대기열에서 제거
  pipeline.sadd(ADMITTED_KEY, ...users);  // admitted Set에 추가
  await pipeline.exec();

  const remaining = await redis.zcard(QUEUE_KEY); // 남은 eligible 대기 인원
  return {
    admitted: users,
    count: users.length,
    remaining,
    message: `${users.length}명 입장 허용. 남은 eligible 대기: ${remaining}명`,
  };
}

/**
 * 다음 취소표 대기자 조회 (B파트 연동용)
 * - B파트가 취소표 발생 시 "다음 순번 누구야?" 확인할 때 호출
 * - standby Sorted Set의 0번째(가장 앞) 사용자 반환
 */
async function getNextStandby() {
  const users = await redis.zrange(STANDBY_KEY, 0, 0); // 1순위만 조회
  if (users.length === 0) {
    return { userId: null, message: '취소표 대기자가 없습니다.' };
  }
  return { userId: users[0], message: `다음 대기자: ${users[0]}` };
}

/**
 * 취소표 대기자를 입장 허용으로 전환 (B파트 연동용)
 * - B파트가 Secret Link 발급 후 호출
 * - standby에서 제거 → admitted에 추가
 * - 이후 해당 사용자가 /seats/hold로 취소 좌석 선점 가능
 */
async function promoteStandby(userId) {
  const removed = await redis.zrem(STANDBY_KEY, userId); // standby에서 제거
  if (removed === 0) {
    return { success: false, message: '해당 사용자가 standby에 없습니다.' };
  }
  await redis.sadd(ADMITTED_KEY, userId); // admitted에 추가
  return { success: true, userId, message: `${userId} 입장 허용으로 전환` };
}

/**
 * 대기열 현황 (모니터링용)
 * - Grafana 대시보드에서 표시할 수치
 */
async function getStats() {
  const [waiting, standby, admitted, lastTicket, totalSeats] = await Promise.all([
    redis.zcard(QUEUE_KEY),       // eligible 대기 인원
    redis.zcard(STANDBY_KEY),     // standby 대기 인원
    redis.scard(ADMITTED_KEY),    // 입장 허용된 인원
    redis.get(COUNTER_KEY),       // 마지막 발급 순번
    redis.get(TOTAL_SEATS_KEY),   // 총 좌석 수
  ]);

  return {
    totalSeats: parseInt(totalSeats, 10) || 0,
    eligible: waiting,
    standby,
    admitted,
    lastTicket: parseInt(lastTicket, 10) || 0,
  };
}

/**
 * 티켓팅 오픈
 * - 관리자가 버튼을 누르면 호출
 * - 이 시점부터 사용자가 대기열에 진입 가능
 */
async function openTicketing() {
  await redis.set(TICKETING_STATUS_KEY, 'open');
  const openedAt = new Date().toISOString();
  console.log(`[Ticketing] 오픈 — ${openedAt}`);
  return { status: 'open', openedAt, message: '티켓팅이 오픈되었습니다.' };
}

/**
 * 티켓팅 마감
 * - 관리자가 수동으로 마감하거나 전석 매진 시 호출
 * - 이후 대기열 진입 차단
 */
async function closeTicketing() {
  await redis.set(TICKETING_STATUS_KEY, 'closed');
  const closedAt = new Date().toISOString();
  console.log(`[Ticketing] 마감 — ${closedAt}`);
  return { status: 'closed', closedAt, message: '티켓팅이 마감되었습니다.' };
}

/**
 * 티켓팅 상태 조회
 */
async function getTicketingStatus() {
  const status = await redis.get(TICKETING_STATUS_KEY) || 'closed';
  return { status };
}

/**
 * 결제 제한 시간 설정 (관리자)
 * - 공연별로 결제 시간을 다르게 설정 가능
 * - 예: 인기 공연은 5분, 일반 공연은 10분
 *
 * @param {number} seconds - 결제 제한 시간 (초)
 */
async function setHoldDuration(seconds) {
  await redis.set(HOLD_DURATION_KEY, seconds);
  console.log(`[Ticketing] 결제 제한 시간: ${seconds}초 (${Math.floor(seconds / 60)}분)`);
  return {
    holdDuration: seconds,
    display: `${Math.floor(seconds / 60)}분 ${seconds % 60}초`,
    message: `결제 제한 시간이 ${seconds}초로 설정되었습니다.`,
  };
}

/**
 * 결제 제한 시간 조회
 */
async function getHoldDuration() {
  const duration = parseInt(await redis.get(HOLD_DURATION_KEY), 10) || parseInt(process.env.HOLD_DURATION, 10) || 600;
  return {
    holdDuration: duration,
    display: `${Math.floor(duration / 60)}분 ${duration % 60}초`,
  };
}

// ===== 자동 오픈/마감 타이머 =====
let openTimer = null;   // 자동 오픈 타이머 핸들
let closeTimer = null;  // 자동 마감 타이머 핸들

/**
 * 티켓팅 예약 오픈 설정 (자동 오픈 타이머)
 * - 관리자가 "12월 25일 오후 8시에 오픈" 설정
 * - 해당 시간이 되면 자동으로 open 상태로 전환
 * - 오픈 후 duration(분)이 지나면 자동 마감 (선택)
 *
 * @param {string} openAt - 오픈 시간 (ISO 8601, 예: "2026-12-25T20:00:00")
 * @param {number} durationMinutes - 오픈 유지 시간 (분, 선택. 예: 30 → 30분 후 자동 마감)
 */
async function scheduleTicketing(openAt, durationMinutes) {
  const openTime = new Date(openAt).getTime();
  const now = Date.now();
  const delayMs = openTime - now;  // 오픈까지 남은 시간 (밀리초)

  if (delayMs <= 0) {
    return { success: false, message: '오픈 시간이 현재 시간보다 이전입니다.' };
  }

  // 기존 타이머가 있으면 취소
  if (openTimer) clearTimeout(openTimer);
  if (closeTimer) clearTimeout(closeTimer);

  // Redis에 스케줄 정보 저장 (서버 재시작 시 참고용)
  await redis.hset('event:schedule', {
    openAt,
    durationMinutes: (durationMinutes || 0).toString(),
    scheduledAt: new Date().toISOString(),
  });

  // 자동 오픈 타이머 설정
  openTimer = setTimeout(async () => {
    await openTicketing();
    console.log(`[Schedule] 예약 시간 도달 — 티켓팅 자동 오픈`);

    // 자동 마감 설정 (durationMinutes가 있으면)
    if (durationMinutes && durationMinutes > 0) {
      const closeDelayMs = durationMinutes * 60 * 1000;
      closeTimer = setTimeout(async () => {
        await closeTicketing();
        console.log(`[Schedule] ${durationMinutes}분 경과 — 티켓팅 자동 마감`);
      }, closeDelayMs);
    }
  }, delayMs);

  const delaySeconds = Math.floor(delayMs / 1000);
  const delayMinutes = Math.floor(delaySeconds / 60);
  const delaySec = delaySeconds % 60;

  return {
    success: true,
    openAt,
    opensIn: `${delayMinutes}분 ${delaySec}초 후`,
    autoClose: durationMinutes ? `오픈 후 ${durationMinutes}분 뒤 자동 마감` : '수동 마감',
    message: `티켓팅이 ${openAt}에 자동 오픈됩니다.`,
  };
}

/**
 * 예약 스케줄 취소
 */
async function cancelSchedule() {
  if (openTimer) { clearTimeout(openTimer); openTimer = null; }
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  await redis.del('event:schedule');
  return { success: true, message: '예약된 스케줄이 취소되었습니다.' };
}

/**
 * 예약 스케줄 조회
 */
async function getSchedule() {
  const schedule = await redis.hgetall('event:schedule');
  if (!schedule || !schedule.openAt) {
    return { scheduled: false, message: '예약된 스케줄이 없습니다.' };
  }
  const openTime = new Date(schedule.openAt).getTime();
  const remaining = openTime - Date.now();
  return {
    scheduled: true,
    openAt: schedule.openAt,
    durationMinutes: parseInt(schedule.durationMinutes, 10) || null,
    remainingSeconds: remaining > 0 ? Math.floor(remaining / 1000) : 0,
    scheduledAt: schedule.scheduledAt,
  };
}

module.exports = { setTotalSeats, enter, getPosition, admitBatch, getNextStandby, promoteStandby, getStats, openTicketing, closeTicketing, getTicketingStatus, setHoldDuration, getHoldDuration, scheduleTicketing, cancelSchedule, getSchedule };
