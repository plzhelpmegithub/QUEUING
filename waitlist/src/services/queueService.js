const redis = require('../config/redis');

// Redis 키
const QUEUE_KEY = 'queue:waiting';       // Sorted Set — 대기열 본체
const COUNTER_KEY = 'queue:counter';     // 순번 발급용 원자 카운터
const ADMITTED_KEY = 'queue:admitted';   // Set — 입장 허용된 사용자

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE, 10) || 100;

/**
 * 대기열 진입
 * - 이미 대기 중이면 기존 순번 반환 (중복 진입 방지)
 * - 이미 입장 허용 상태면 바로 admitted 반환
 * - score = 원자 카운터 (INCR) → 선착순 FIFO 보장
 */
async function enter(userId) {
  // 1) 이미 입장 허용된 사용자인지 확인
  const isAdmitted = await redis.sismember(ADMITTED_KEY, userId);
  if (isAdmitted) {
    return { status: 'admitted', message: '이미 입장이 허용된 상태입니다.' };
  }

  // 2) 이미 대기열에 있는지 확인
  const existingScore = await redis.zscore(QUEUE_KEY, userId);
  if (existingScore !== null) {
    const position = await redis.zrank(QUEUE_KEY, userId);
    return {
      status: 'waiting',
      position: position + 1,
      ticket: parseInt(existingScore, 10),
      message: '이미 대기열에 등록되어 있습니다.',
    };
  }

  // 3) 새 순번 발급 후 Sorted Set에 등록
  const ticket = await redis.incr(COUNTER_KEY);
  await redis.zadd(QUEUE_KEY, ticket, userId);

  const position = await redis.zrank(QUEUE_KEY, userId);
  return {
    status: 'waiting',
    position: position + 1,
    ticket,
    message: '대기열에 등록되었습니다.',
  };
}

/**
 * 내 순번 조회
 * - 대기 중이면 position(1-based)과 앞에 남은 인원 수 반환
 */
async function getPosition(userId) {
  // 입장 허용 상태 확인
  const isAdmitted = await redis.sismember(ADMITTED_KEY, userId);
  if (isAdmitted) {
    return { status: 'admitted', message: '입장이 허용된 상태입니다.' };
  }

  const rank = await redis.zrank(QUEUE_KEY, userId);
  if (rank === null) {
    return { status: 'not_found', message: '대기열에 등록되어 있지 않습니다.' };
  }

  const totalWaiting = await redis.zcard(QUEUE_KEY);
  return {
    status: 'waiting',
    position: rank + 1,
    totalWaiting,
    message: `현재 ${rank + 1}번째 순서입니다.`,
  };
}

/**
 * 입장 허용 (배치)
 * - Sorted Set 앞쪽에서 BATCH_SIZE명을 꺼내 admitted Set으로 이동
 * - 실제 운영에선 스케줄러나 이벤트 트리거로 호출
 */
async function admitBatch() {
  // 상위 BATCH_SIZE명 조회
  const users = await redis.zrange(QUEUE_KEY, 0, BATCH_SIZE - 1);

  if (users.length === 0) {
    return { admitted: [], count: 0, message: '대기 중인 사용자가 없습니다.' };
  }

  // 파이프라인으로 원자적 처리: 대기열에서 제거 + admitted에 추가
  const pipeline = redis.pipeline();
  pipeline.zrem(QUEUE_KEY, ...users);
  if (users.length > 0) {
    pipeline.sadd(ADMITTED_KEY, ...users);
  }
  await pipeline.exec();

  const remaining = await redis.zcard(QUEUE_KEY);
  return {
    admitted: users,
    count: users.length,
    remaining,
    message: `${users.length}명 입장 허용. 남은 대기: ${remaining}명`,
  };
}

/**
 * 대기열 현황 (모니터링용)
 */
async function getStats() {
  const [waiting, admitted, lastTicket] = await Promise.all([
    redis.zcard(QUEUE_KEY),
    redis.scard(ADMITTED_KEY),
    redis.get(COUNTER_KEY),
  ]);

  return {
    waiting,
    admitted,
    lastTicket: parseInt(lastTicket, 10) || 0,
  };
}

module.exports = { enter, getPosition, admitBatch, getStats };
