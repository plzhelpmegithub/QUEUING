const redis = require('../config/redis');

// ===== Redis 키 정의 =====
const QUEUE_KEY = 'queue:waiting';           // Sorted Set — eligible(예매 가능) 대기열
const COUNTER_KEY = 'queue:counter';         // 순번 발급용 원자 카운터 (INCR로 1씩 증가)
const ADMITTED_KEY = 'queue:admitted';       // Set — 입장 허용된 사용자 목록
const STANDBY_KEY = 'queue:standby';        // Sorted Set — 취소표 대기자 (1001번~)
const TOTAL_SEATS_KEY = 'event:total-seats'; // 총 좌석 수 (eligible/standby 분류 기준)

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

module.exports = { setTotalSeats, enter, getPosition, admitBatch, getNextStandby, promoteStandby, getStats };
