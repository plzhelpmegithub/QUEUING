const redis = require('../config/redis');
const pool = require('../config/mariadb');
const { getMembership } = require('./membershipService');
const { syncToMariaDB } = require('./syncRetryService');
const { normalizeSessionContext, getScopedKey } = require('./sessionContext');

const QUEUE_KEY = 'queue:waiting';
const COUNTER_KEY = 'queue:counter';
const ADMITTED_KEY = 'queue:admitted';
const STANDBY_KEY = 'queue:standby';
const MAIN_PARTICIPANT_KEY = 'queue:main-participants';
const TOTAL_SEATS_KEY = 'event:total-seats';
const TICKETING_STATUS_KEY = 'event:ticketing-status';
const HOLD_DURATION_KEY = 'event:hold-duration';
const EVENT_LIST_KEY = 'events:list';

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE, 10) || 100;

const ADMISSION_DEADLINE_PREFIX = 'admission:deadline:';
const ADMISSION_DEADLINE_META = 'admission:deadline:meta';
const ADMISSION_TIMEOUT_KEY = 'event:admission-timeout';
const DEFAULT_ADMISSION_TIMEOUT = parseInt(process.env.ADMISSION_TIMEOUT, 10) || 420;

function admissionDeadlineKey(userId, context = {}) {
  const session = normalizeSessionContext(context);
  if (!session.scoped) return `${ADMISSION_DEADLINE_PREFIX}${userId}`;
  return `${ADMISSION_DEADLINE_PREFIX}${session.eventId || 'event'}:${session.sessionKey}:${userId}`;
}

async function getAdmissionTimeout() {
  const stored = await redis.get(ADMISSION_TIMEOUT_KEY);
  const parsed = Number.parseInt(stored, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ADMISSION_TIMEOUT;
}

async function setAdmissionTimeout(seconds) {
  const normalizedSeconds = Number.parseInt(seconds, 10);
  if (!Number.isFinite(normalizedSeconds) || normalizedSeconds < 10) {
    throw new Error('입장 제한시간은 10초 이상의 정수여야 합니다.');
  }

  await redis.set(ADMISSION_TIMEOUT_KEY, normalizedSeconds);
  console.log(`[Queue] 입장 제한시간: ${normalizedSeconds}초 (${Math.floor(normalizedSeconds / 60)}분)`);
  return {
    admissionTimeout: normalizedSeconds,
    display: `${Math.floor(normalizedSeconds / 60)}분 ${normalizedSeconds % 60}초`,
    message: `입장 제한시간이 ${normalizedSeconds}초로 설정되었습니다.`,
  };
}

async function setAdmissionDeadline(userId, context = {}) {
  const timeout = await getAdmissionTimeout();
  const key = admissionDeadlineKey(userId, context);
  const metaField = key.slice(ADMISSION_DEADLINE_PREFIX.length);
  const session = normalizeSessionContext(context);
  const meta = JSON.stringify({
    userId,
    eventId: session.eventId,
    sessionDate: session.sessionDate,
    sessionTime: session.sessionTime,
  });

  await redis.pipeline()
    .set(key, '1', 'EX', timeout)
    .hset(ADMISSION_DEADLINE_META, metaField, meta)
    .exec();
}

async function cancelAdmissionDeadline(userId, context = {}) {
  const key = admissionDeadlineKey(userId, context);
  const metaField = key.slice(ADMISSION_DEADLINE_PREFIX.length);

  await redis.pipeline()
    .del(key)
    .hdel(ADMISSION_DEADLINE_META, metaField)
    .exec();
}

// 본 티켓팅 대기열에 실제로 참여한 사용자만 취소표 대기열로 이동할 수
// 있도록 참여 이력을 확인한다. Redis 세트는 빠른 경로이고, Redis 재구성
// 또는 재시작 뒤에는 MariaDB waiting_queue를 기준으로 보완한다.
async function hasMainQueueParticipation(userId, context = {}) {
  const keys = queueKeys(context);

  try {
    if (await redis.sismember(keys.mainParticipantKey, userId)) {
      return true;
    }
  } catch (err) {
    console.warn(`[Queue] 본 대기열 참여 Redis 조회 실패 (${userId}):`, err.message);
  }

  if (!keys.eventId) return false;

  try {
    const rows = await pool.query(
      `SELECT queue_id
       FROM waiting_queue
       WHERE user_id = ?
         AND event_id = ?
         AND session_date = ?
         AND session_time = ?
         AND queue_type = 'eligible'
         AND status IN ('WAITING', 'ADMITTED', 'PROMOTED', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'STANDBY')
       ORDER BY queue_id DESC
       LIMIT 1`,
      [userId, keys.eventId, keys.sessionDate, keys.sessionTime],
    );
    return rows.length > 0;
  } catch (err) {
    // 참여 여부를 확인하지 못한 경우에는 직접 취소표 진입을 허용하지
    // 않는다. 잘못된 직접 진입을 막는 fail-closed 정책이다.
    console.warn(`[Queue] 본 대기열 참여 DB 조회 실패 (${userId}):`, err.message);
    return false;
  }
}

async function isMainTicketingOpen(context = {}) {
  const keys = queueKeys(context);
  const scopedStatus = await redis.get(keys.statusKey);
  const status = scopedStatus || (!keys.scoped ? await redis.get(TICKETING_STATUS_KEY) : null);

  if (status === 'closed') return false;

  if (keys.eventId) {
    const eventCard = await redis.hget(EVENT_LIST_KEY, keys.eventId);
    if (eventCard) {
      try {
        const parsed = JSON.parse(eventCard);
        if (parsed.status === 'closed' || parsed.status === 'cancelled') return false;
        const closeTime = parsed.ticketCloseAt ? new Date(parsed.ticketCloseAt).getTime() : NaN;
        if (Number.isFinite(closeTime) && closeTime <= Date.now()) return false;
      } catch (_) {}
    }
  }

  // open/sold_out 또는 아직 명시적인 마감 상태가 없는 경우는 본 티켓팅
  // 중으로 간주한다. sold_out은 좌석이 없다는 뜻이지, 마감 후 Secret Link
  // 전용 상태라는 뜻이 아니다.
  return true;
}

async function removeAdmitted(userId, context = {}, options = {}) {
  const { revokeToken } = require('./tokenService');
  const keys = queueKeys(context);
  const finalStatus = options.finalStatus || 'EXPIRED';

  const removed = await redis.srem(keys.admittedKey, userId);
  if (removed > 0) {
    await revokeToken(userId, context);
    await cancelAdmissionDeadline(userId, context);

    await syncToMariaDB(
      `UPDATE waiting_queue
       SET status = ?,
           updated_at = NOW()
       WHERE user_id = ?
         AND event_id = ?
         AND session_date = ?
         AND session_time = ?
         AND status IN ('ADMITTED', 'PROMOTED')`,
       [finalStatus, userId, keys.eventId, keys.sessionDate, keys.sessionTime],
      `queue:remove-admitted ${userId}`,
    );

    console.log(`[Queue] ${userId} admitted에서 제거`);
    return true;
  }
  return false;
}

async function backfillOne(context = {}) {
  const { issueToken, revokeToken } = require('./tokenService');
  const keys = queueKeys(context);
  const admissionTimeout = await getAdmissionTimeout();

  const admittedCount = await redis.scard(keys.admittedKey);
  if (admittedCount >= BATCH_SIZE) return null;

  const waiting = await redis.zrange(keys.waitingKey, 0, 0);
  let source = 'eligible';
  let userId = waiting[0] || null;

  // 오픈 중 좌석이 취소되었거나 입장 슬롯이 비면, 본 대기열 참여자 중
  // sold_out 시점에 standby로 밀린 사용자도 일반 Admission Token을 받는다.
  // 마감 후에는 standby를 이 경로로 승격하지 않아 B파트 Secret Link 흐름과
  // 섞이지 않도록 한다.
  if (!userId && await isMainTicketingOpen(context)) {
    const standbyUsers = await redis.zrange(keys.standbyKey, 0, -1);
    for (const candidate of standbyUsers) {
      if (await redis.sismember(keys.mainParticipantKey, candidate)) {
        userId = candidate;
        source = 'standby';
        break;
      }
    }
  }

  if (userId) {

    let tokenInfo;
    try {
      tokenInfo = await issueToken(userId, admissionTimeout, keys);
    } catch (err) {
      console.error(`[Backfill] Token 발급 실패 (${userId}):`, err.message);
      return null;
    }

    try {
      const pipeline = redis.pipeline();
      pipeline.zrem(source === 'standby' ? keys.standbyKey : keys.waitingKey, userId);
      pipeline.sadd(keys.admittedKey, userId);
      await pipeline.exec();
    } catch (err) {
      await revokeToken(userId, keys).catch(() => {});
      throw err;
    }

    await setAdmissionDeadline(userId, context);

    await syncToMariaDB(
      `UPDATE waiting_queue
       SET status = 'ADMITTED',
           updated_at = NOW()
       WHERE user_id = ?
         AND event_id = ?
         AND session_date = ?
         AND session_time = ?
         AND queue_type = ?
         AND status = 'WAITING'`,
      [userId, keys.eventId, keys.sessionDate, keys.sessionTime, source],
      `queue:backfill:eligible ${userId}`,
    );

    console.log(`[Backfill] ${userId} ${source} → admitted`);
    return { userId, type: 'eligible', promotedFrom: source };
  }

  // 마감 후 standby는 별도 취소표 흐름으로 남기며, 오픈 중에만
  // mainParticipant 표식이 있는 사용자를 일반 입장으로 승격한다.
  return null;
}

function queueKeys(context = {}) {
  const normalized = normalizeSessionContext(context);

  return {
    ...normalized,
    waitingKey: getScopedKey(QUEUE_KEY, normalized),
    counterKey: getScopedKey(COUNTER_KEY, normalized),
    admittedKey: getScopedKey(ADMITTED_KEY, normalized),
    standbyKey: getScopedKey(STANDBY_KEY, normalized),
    mainParticipantKey: getScopedKey(MAIN_PARTICIPANT_KEY, normalized),
    totalSeatsKey: getScopedKey(TOTAL_SEATS_KEY, normalized),
    statusKey: getScopedKey(TICKETING_STATUS_KEY, normalized),
  };
}

// B파트 Secret Link 후보와 취소표 대기 순번은 본 티켓팅에 참여한
// 활성 멤버십 회원만 대상으로 한다.
async function getActiveStandbyMembers(context = {}) {
  const keys = queueKeys(context);
  if (!keys.eventId) return [];

  const params = [keys.eventId, keys.sessionDate, keys.sessionTime];
  try {
    return await pool.query(
      `SELECT w.user_id, w.queue_id, w.queue_index, w.membership_at_join
       FROM waiting_queue w
       INNER JOIN memberships m ON m.user_id = w.user_id
       WHERE w.event_id = ?
         AND w.session_date = ?
         AND w.session_time = ?
         AND w.queue_type = 'standby'
         AND w.status = 'WAITING'
         AND w.membership_at_join = 1
         AND w.user_id NOT LIKE 'sim-user-%'
         AND m.is_membership = TRUE
         AND m.expires_at > UTC_TIMESTAMP()
         AND EXISTS (
           SELECT 1
           FROM waiting_queue main_queue
           WHERE main_queue.user_id = w.user_id
             AND main_queue.event_id = w.event_id
             AND main_queue.session_date = w.session_date
             AND main_queue.session_time = w.session_time
             AND main_queue.queue_type = 'eligible'
             AND main_queue.status IN ('WAITING', 'ADMITTED', 'PROMOTED', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'STANDBY')
         )
       ORDER BY w.queue_index ASC, w.queue_id ASC`,
      params,
    );
  } catch (err) {
    // 구버전 DB에 memberships.expires_at 또는 조인 컬럼이 없는 경우에도
    // 대기열 API 전체를 중단하지 않고, 가입 당시 저장한 플래그로 보완한다.
    console.warn('[Queue] 활성 멤버십 standby 집계 fallback:', err.message);
    return pool.query(
        `SELECT user_id, queue_id, queue_index, membership_at_join
         FROM waiting_queue
         WHERE event_id = ?
         AND session_date = ?
         AND session_time = ?
         AND queue_type = 'standby'
         AND status = 'WAITING'
         AND membership_at_join = 1
         AND user_id NOT LIKE 'sim-user-%'
         AND EXISTS (
           SELECT 1
           FROM waiting_queue main_queue
           WHERE main_queue.user_id = waiting_queue.user_id
             AND main_queue.event_id = waiting_queue.event_id
             AND main_queue.session_date = waiting_queue.session_date
             AND main_queue.session_time = waiting_queue.session_time
             AND main_queue.queue_type = 'eligible'
             AND main_queue.status IN ('WAITING', 'ADMITTED', 'PROMOTED', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'STANDBY')
         )
        ORDER BY queue_index ASC, queue_id ASC`,
      params,
    );
  }
}

async function isActiveSimulationContext(context = {}) {
  const keys = queueKeys(context);
  if (!keys.eventId) return false;

  // MariaDB의 TIME/VARCHAR 값은 환경에 따라 `18:00` 또는 `18:00:00`으로
  // 돌아올 수 있다. 표시용 시뮬레이션 판정에서는 초 단위를 무시해야
  // 같은 회차가 일반 대기열 집계로 잘못 떨어지지 않는다.
  const comparableDate = (value) => String(value || '').slice(0, 10);
  const comparableTime = (value) => String(value || '').slice(0, 5);

  try {
    const states = await Promise.all([
      redis.hgetall(`simulation:${keys.eventId}`),
      redis.hgetall(`simulation:local:${keys.eventId}`),
    ]);
    return states.some((state) => (
      state?.stage &&
      comparableDate(state.sessionDate) === comparableDate(keys.sessionDate) &&
      comparableTime(state.sessionTime) === comparableTime(keys.sessionTime)
    ));
  } catch (err) {
    console.warn('[Queue] 시뮬레이션 상태 확인 실패:', err.message);
    return false;
  }
}

async function getStandbyMemberStats(userId, context = {}) {
  const keys = queueKeys(context);
  // 취소표 대기열은 일반 standby의 Redis rank를 그대로 사용하지 않는다.
  // 활성 멤버십·본 티켓팅 참여 이력이 모두 확인된 사용자만 다시 집계한다.
  const rows = await getActiveStandbyMembers(context);
  const index = rows.findIndex((row) => String(row.user_id) === String(userId));
  return {
    position: index >= 0 ? index + 1 : null,
    total: rows.length,
    simulationQueue: await isActiveSimulationContext(keys),
  };
}

async function getStandbyMemberCount(context = {}) {
  return (await getActiveStandbyMembers(context)).length;
}

async function isIntegratedMainQueueOpen(context = {}) {
  const keys = queueKeys(context);
  if (!keys.eventId) return false;
  const comparableDate = (value) => String(value || '').slice(0, 10);
  const comparableTime = (value) => String(value || '').slice(0, 5);

  try {
    const state = await redis.hgetall(`simulation:integrated:${keys.eventId}`);
    return Boolean(
      state?.stage === 'main_queue_open'
      && comparableDate(state.sessionDate) === comparableDate(keys.sessionDate)
      && comparableTime(state.sessionTime) === comparableTime(keys.sessionTime),
    );
  } catch (err) {
    console.warn('[Queue] 통합 본 대기열 상태 확인 실패:', err.message);
    return false;
  }
}

async function recordSimulationParticipant(userId, context = {}) {
  const keys = queueKeys(context);
  if (!keys.eventId || !userId) return;

  // 관리자 시뮬레이션이 활성화된 동안 일반 사용자가 실제 서비스의
  // /queue/enter 또는 /cancel-queue/join 경로로 들어온 사실을 추적한다.
  // 통합 모드는 매진 시 멤버십 참여자를 standby로 전환할 때도 사용한다.
  try {
    // B파트 연동 시뮬레이션과 온프레미스 SMTP 시뮬레이션은 상태 해시를
    // 별도로 사용한다. 어느 모드가 활성화되어 있든 실제 사용자가
    // 정상 사용자 경로로 들어오면 해당 모드의 대상 목록에 기록한다.
    const simulationKeys = [
      `simulation:${keys.eventId}`,
      `simulation:local:${keys.eventId}`,
      `simulation:integrated:${keys.eventId}`,
    ];
    for (const simulationKey of simulationKeys) {
      if (await redis.exists(simulationKey)) {
        await redis.sadd(`${simulationKey}:standby-users`, userId);
      }
    }
  } catch (err) {
    // 시뮬레이션 추적 실패가 정상 취소표 대기열 진입을 막아서는 안 된다.
    console.warn('[Queue] 시뮬레이션 참여 사용자 추적 실패:', err.message);
  }
}

async function setTotalSeats(count, context = {}) {
  const keys = queueKeys(context);

  await redis.set(keys.totalSeatsKey, count);

  return {
    totalSeats: count,
    message: `총 좌석 수 ${count}석으로 설정`,
  };
}

async function enter(userId, context = {}) {
  const requestedContext = Boolean(
    context.eventId ||
    context.sessionDate ||
    context.sessionTime
  );

  const eventInfo = await redis.hgetall('event:info');
  const currentEventId = context.eventId || eventInfo?.eventId || '';

  const keys = queueKeys(
    requestedContext
      ? { ...context, eventId: currentEventId }
      : {}
  );
  let eventClosed = false;

  // 조기 마감 이후에도 이미 standby에 등록된 사용자의 Redis/MariaDB
  // 대기열 기록은 유지해야 한다. 다만 프론트에는 마감 상태를 알려
  // 멤버십 안내 알럿을 표시할 수 있도록 별도의 closed 응답을 반환한다.
  let existingStandbyScore = await redis.zscore(
    keys.standbyKey,
    userId
  );
  const integratedMainQueueOpen = await isIntegratedMainQueueOpen(keys);

  // 이전 코드에서 통합 단계2의 실제 사용자가 좌석 수 초과 규칙 때문에
  // standby로 들어간 경우에도 새 초기화 없이 본 티켓팅 waiting으로 복구한다.
  // 통합 단계3 전에는 실제·더미 사용자가 같은 본 대기열에 있어야 한다.
  if (integratedMainQueueOpen && existingStandbyScore !== null) {
    await redis.pipeline()
      .zrem(keys.standbyKey, userId)
      .zadd(keys.waitingKey, existingStandbyScore, userId)
      .sadd(keys.mainParticipantKey, userId)
      .exec();
    await syncToMariaDB(
      `UPDATE waiting_queue
       SET status = CASE WHEN queue_type = 'eligible' THEN 'WAITING' ELSE 'LEFT' END,
           updated_at = NOW()
       WHERE user_id = ?
         AND event_id = ?
         AND session_date = ?
         AND session_time = ?
         AND queue_type IN ('eligible', 'standby')
         AND status IN ('WAITING', 'STANDBY')`,
      [userId, keys.eventId, keys.sessionDate, keys.sessionTime],
      `queue:integrated-restore ${userId}`,
    );
    existingStandbyScore = null;
  }

  if (requestedContext && currentEventId) {
    const eventCard = await redis.hget(
      EVENT_LIST_KEY,
      currentEventId
    );

    if (eventCard) {
      try {
        const parsedCard = JSON.parse(eventCard);

        eventClosed = parsedCard.status === 'closed' || parsedCard.status === 'cancelled';

        const openTime = parsedCard.ticketOpenAt
          ? new Date(parsedCard.ticketOpenAt).getTime()
          : NaN;

        if (
          Number.isFinite(openTime) &&
          openTime > Date.now()
        ) {
          return {
            status: 'closed',
            code: 'ticketing_not_open',
            openAt: parsedCard.ticketOpenAt,
            message: `예매 오픈 전입니다. ${parsedCard.ticketOpenAt}부터 예매할 수 있습니다.`,
          };
        }

        const closeTime = parsedCard.ticketCloseAt
          ? new Date(parsedCard.ticketCloseAt).getTime()
          : NaN;

        if (Number.isFinite(closeTime) && closeTime <= Date.now()) {
          eventClosed = true;
        }

        if (
          eventClosed &&
          existingStandbyScore === null
        ) {
          return {
            status: 'closed',
            code: 'ticketing_closed',
            closeAt: parsedCard.ticketCloseAt,
            message: `예매가 마감되었습니다. (${parsedCard.ticketCloseAt} 마감)`,
          };
        }
      } catch (_) {}
    }
  }

  const ticketingStatus =
    (await redis.get(keys.statusKey)) ||
    (!requestedContext
      ? await redis.get(TICKETING_STATUS_KEY)
      : null);

  // 기존 standby 사용자는 대기열에서 제거하지 않은 채 마감 안내만
  // 표시한다. 프론트의 showClosedUI()는 이 응답을 받아 호출되며,
  // pagehide/이탈 처리로 waiting_queue를 LEFT로 바꾸지 않는다.
  if (
    existingStandbyScore !== null &&
    (ticketingStatus === 'closed' || eventClosed)
  ) {
    return {
      status: 'closed',
      type: 'standby',
      code: 'ticketing_closed',
      preserveStandby: true,
      message: '본 티켓팅이 마감되었습니다. 취소표 대기열 안내를 확인해주세요.',
    };
  }

  if (ticketingStatus === 'closed' && existingStandbyScore === null) {
    return {
      status: 'closed',
      message:
        '현재 티켓팅이 마감되었습니다. 더 이상 대기열에 진입할 수 없습니다.',
    };
  }

  if (!ticketingStatus) {
    if (!currentEventId) {
      return {
        status: 'closed',
        message: '등록된 공연이 없습니다.',
      };
    }

    await redis.set(keys.statusKey, 'open');
  }

  const isAdmitted = await redis.sismember(
    keys.admittedKey,
    userId
  );

  if (isAdmitted) {
    await redis.sadd(keys.mainParticipantKey, userId);
    const { getRawToken, issueToken } = require('./tokenService');

    const existing = await getRawToken(
      userId,
      keys
    );

    if (existing) {
      return {
        status: 'admitted',
        token: existing.token,
        expiresAt: existing.expiresAt,
        message: '이미 입장이 허용된 상태입니다.',
      };
    }

    // The admission set can become visible a few milliseconds before the
    // token write when an older worker is still finishing its cycle. Do not
    // immediately remove the user and put them back in the queue; re-issue
    // the token while the admission is still valid.
    try {
      const refreshed = await issueToken(
        userId,
        undefined,
        keys
      );

      return {
        status: 'admitted',
        token: refreshed.token,
        expiresAt: refreshed.expiresAt,
        message: '입장이 허용되었습니다. Admission Token을 재발급했습니다.',
      };
    } catch (err) {
      console.warn(`[Queue] 승인 토큰 준비 중 — ${userId}: ${err.message}`);
      return {
        status: 'admitting',
        code: 'admission_token_pending',
        message: '입장 승인 처리가 진행 중입니다. 잠시 후 다시 확인해주세요.',
      };
    }
  }

  const existingScore = await redis.zscore(
    keys.waitingKey,
    userId
  );

  if (existingScore !== null) {
    await redis.sadd(keys.mainParticipantKey, userId);
    const position = await redis.zrank(
      keys.waitingKey,
      userId
    );

    const totalSeats =
      parseInt(
        await redis.get(keys.totalSeatsKey),
        10
      ) || 0;

    const type =
      integratedMainQueueOpen || position + 1 <= totalSeats
        ? 'eligible'
        : 'standby';

    return {
      status: 'waiting',
      type,
      position: position + 1,
      ticket: parseInt(existingScore, 10),
      message:
        '이미 대기열에 등록되어 있습니다.',
    };
  }

  const standbyScore = existingStandbyScore;

  if (standbyScore !== null) {
    const rank = await redis.zrank(
      keys.standbyKey,
      userId
    );

    return {
      status: 'standby',
      type: 'standby',
      standbyPosition: rank + 1,
      message: '취소표 대기 중입니다.',
    };
  }

  const totalSeats =
    parseInt(
      await redis.get(keys.totalSeatsKey),
      10
    ) || 0;

  if (totalSeats === 0) {
    return {
      status: 'error',
      message: '이벤트 좌석이 설정되지 않았습니다.',
    };
  }

  const ticket = await redis.incr(
    keys.counterKey
  );

  let membershipAtJoin = 0;
  try {
    const membership = await getMembership(userId);
    membershipAtJoin = membership.isMembership ? 1 : 0;
  } catch (_) {}

  const currentStatus =
    (await redis.get(keys.statusKey)) ||
    (!requestedContext
      ? await redis.get(TICKETING_STATUS_KEY)
      : null);

  // 본 티켓팅 참여 표식은 멤버십 우선순위와 무관하게 모든 사용자에게
  // 동일하게 기록한다. 이 표식은 마감 후 취소표 대기열 자격 확인에만
  // 사용되며, 본 대기열의 순번에는 영향을 주지 않는다.
  await redis.sadd(keys.mainParticipantKey, userId);

  if (
    currentStatus === 'sold_out' ||
    (!integratedMainQueueOpen && ticket > totalSeats)
  ) {
    await redis.zadd(
      keys.standbyKey,
      ticket,
      userId
    );

    const rank = await redis.zrank(
      keys.standbyKey,
      userId
    );

    await syncToMariaDB(
      `INSERT INTO waiting_queue
       (
         user_id,
         event_id,
         session_date,
         session_time,
         queue_type,
         queue_index,
         status,
         membership_at_join
       )
       VALUES (?, ?, ?, ?, 'standby', ?, 'WAITING', ?)`,
      [
        userId,
        currentEventId,
        keys.sessionDate,
        keys.sessionTime,
        ticket,
        membershipAtJoin,
      ],
      `queue:enter:standby ${userId}`,
    );

    // sold_out 시점에 본 대기열에서 standby로 이동한 사용자도
    // '본 티켓팅 참여자'라는 사실을 MariaDB에 남긴다. Redis가 재시작되어도
    // 직접 취소표 진입을 허용할 근거를 복구할 수 있다.
    await syncToMariaDB(
      `INSERT INTO waiting_queue
       (
         user_id,
         event_id,
         session_date,
         session_time,
         queue_type,
         queue_index,
         status,
         membership_at_join
       )
       VALUES (?, ?, ?, ?, 'eligible', ?, 'STANDBY', ?)`,
      [
        userId,
        currentEventId,
        keys.sessionDate,
        keys.sessionTime,
        ticket,
        membershipAtJoin,
      ],
      `queue:enter:main-participant ${userId}`,
    );

    await recordSimulationParticipant(userId, keys);

    return {
      status: 'waiting',
      type: 'standby',
      standbyPosition: rank + 1,
      ticket,
      priority: false,
      membershipAtJoin: Boolean(
        membershipAtJoin
      ),
      message:
        `현재 매진 상태입니다. 취소표 대기 ${rank + 1}번째로 등록되었습니다.`,
    };
  }

  await redis.zadd(
    keys.waitingKey,
    ticket,
    userId
  );

  const position = await redis.zrank(
    keys.waitingKey,
    userId
  );

  await syncToMariaDB(
    `INSERT INTO waiting_queue
     (
       user_id,
       event_id,
       session_date,
       session_time,
       queue_type,
       queue_index,
       status,
       membership_at_join
     )
     VALUES (?, ?, ?, ?, 'eligible', ?, 'WAITING', ?)`,
    [
      userId,
      currentEventId,
      keys.sessionDate,
      keys.sessionTime,
      ticket,
      membershipAtJoin,
    ],
    `queue:enter:eligible ${userId}`,
  );

  // 통합 시뮬레이션은 단계3에서 실제 멤버십 참여자를 취소표 standby로
  // 전환해야 하므로 본 티켓팅 waiting 진입 시점부터 실제 사용자를 추적한다.
  await recordSimulationParticipant(userId, keys);

  return {
    status: 'waiting',
    type: 'eligible',
    position: position + 1,
    ticket,
    priority: false,
    membershipAtJoin: Boolean(
      membershipAtJoin
    ),
    message:
      `대기열에 등록되었습니다. (${position + 1}번째)`,
  };
}

async function enterStandby(
  userId,
  context = {}
) {
  const { revokeToken } = require('./tokenService');

  const keys = queueKeys(context);

  const membership = await getMembership(userId);
  if (!membership.isMembership) {
    return {
      status: 'closed',
      code: 'membership_required',
      message: '취소표 대기열은 활성 멤버십 회원만 이용할 수 있습니다.',
    };
  }

  const membershipAtJoin = membership.isMembership ? 1 : 0;

  // 활성 멤버십만으로는 충분하지 않다. 본 티켓팅 대기열을 거치지 않고
  // /cancel-queue/join을 직접 호출한 사용자는 취소표 대기열에 등록하지
  // 못하도록 동일 공연·회차의 본 대기열 참여 이력을 먼저 확인한다.
  const participatedInMainQueue = await hasMainQueueParticipation(userId, context);
  if (!participatedInMainQueue) {
    return {
      status: 'closed',
      code: 'main_queue_required',
      message: '본 티켓팅 대기열에 참여한 활성 멤버십 회원만 취소표 대기열을 이용할 수 있습니다.',
    };
  }

  // 본 티켓팅이 closed가 된 뒤에도, 본 대기열 참여를 확인한 멤버십
  // 사용자는 자신의 취소표 대기열 등록을 완료할 수 있다. 참여 이력이 없는
  // 사용자는 위의 게이트에서 이미 차단되므로 직접 진입할 수 없다.
  const existingStandby =
    await redis.zscore(
      keys.standbyKey,
      userId
    );

  if (existingStandby !== null) {
    await recordSimulationParticipant(userId, keys);
    const rank =
      await redis.zrank(
        keys.standbyKey,
        userId
      );

    let memberStats;
    try {
      memberStats = await getStandbyMemberStats(userId, context);
    } catch (err) {
      console.warn('[Queue] 기존 standby 멤버십 순번 집계 실패:', err.message);
      memberStats = { position: rank + 1, total: 0 };
    }

    return {
      status: 'waiting',
      type: 'standby',
      standbyPosition: memberStats.position || rank + 1,
      totalStandby: memberStats.total,
      ticket: parseInt(
        existingStandby,
        10
      ),
      message:
        '이미 취소표 대기열에 등록되어 있습니다.',
    };
  }

  const currentStatus = await redis.get(
    keys.statusKey
  );

  if (
    currentStatus &&
    currentStatus !== 'sold_out' &&
    currentStatus !== 'closed'
  ) {
    return {
      status: 'closed',
      code: 'not_sold_out',
      message:
        '현재 취소표 대기 접수 상태가 아닙니다.',
    };
  }

  if (
    !currentStatus &&
    keys.eventId
  ) {
    const seatService = require('./seatService');

    const counts =
      await seatService.getAvailableCount(
        keys.eventId,
        {
          sessionDate: keys.sessionDate,
          sessionTime: keys.sessionTime,
        }
      );

    if (
      counts.available > 0 ||
      counts.held > 0
    ) {
      return {
        status: 'closed',
        code: 'not_sold_out',
        message:
          '아직 취소표 대기 접수 상태가 아닙니다.',
      };
    }
  }

  await redis.zrem(
    keys.waitingKey,
    userId
  );

  await redis.srem(
    keys.admittedKey,
    userId
  );

  await revokeToken(
    userId,
    keys
  );

  const ticket = await redis.incr(
    keys.counterKey
  );

  await redis.zadd(
    keys.standbyKey,
    ticket,
    userId
  );

  const rank = await redis.zrank(
    keys.standbyKey,
    userId
  );

  let memberStats;
  try {
    memberStats = await getStandbyMemberStats(userId, context);
  } catch (err) {
    console.warn('[Queue] standby 멤버십 순번 집계 실패:', err.message);
    memberStats = { position: rank + 1, total: 0 };
  }

  await syncToMariaDB(
    `UPDATE waiting_queue
     SET status = 'CANCELLED',
         updated_at = NOW()
     WHERE user_id = ?
       AND event_id = ?
       AND session_date = ?
       AND session_time = ?
       AND queue_type = 'eligible'
       AND status IN ('WAITING', 'ADMITTED')`,
    [
      userId,
      keys.eventId,
      keys.sessionDate,
      keys.sessionTime,
    ],
    `queue:move-to-standby ${userId}`,
  );

  await syncToMariaDB(
    `INSERT INTO waiting_queue
     (
       user_id,
       event_id,
       session_date,
       session_time,
       queue_type,
       queue_index,
       status,
       membership_at_join
     )
     VALUES (?, ?, ?, ?, 'standby', ?, 'WAITING', ?)`,
    [
      userId,
      keys.eventId,
      keys.sessionDate,
      keys.sessionTime,
      ticket,
      membershipAtJoin,
    ],
    `queue:enter:standby ${userId}`,
  );

  await recordSimulationParticipant(userId, keys);

  return {
    status: 'waiting',
    type: 'standby',
    standbyPosition: memberStats.position || rank + 1,
    totalStandby: memberStats.total,
    ticket,
    membershipAtJoin: Boolean(
      membershipAtJoin
    ),
      message:
        `취소표 대기 ${memberStats.position || rank + 1}번째로 등록되었습니다.`,
  };
}

async function getPosition(
  userId,
  context = {}
) {
  const keys = queueKeys(context);

  const isAdmitted =
    await redis.sismember(
      keys.admittedKey,
      userId
    );

  if (isAdmitted) {
    return {
      status: 'admitted',
      message:
        '입장이 허용된 상태입니다.',
    };
  }

  const rank =
    await redis.zrank(
      keys.waitingKey,
      userId
    );

  if (rank !== null) {
    const totalWaiting =
      await redis.zcard(
        keys.waitingKey
      );

    return {
      status: 'waiting',
      type: 'eligible',
      position: rank + 1,
      totalWaiting,
      message:
        `현재 ${rank + 1}번째 순서입니다.`,
    };
  }

  const standbyRank =
    await redis.zrank(
      keys.standbyKey,
      userId
    );

  if (standbyRank !== null) {
    let memberStats = null;
    try {
      memberStats = await getStandbyMemberStats(userId, context);
    } catch (err) {
      console.warn('[Queue] 취소표 멤버십 순번 집계 실패:', err.message);
    }
    const standbyPosition = memberStats?.position || null;
    const totalStandby = memberStats ? memberStats.total : 0;

    return {
      status: 'standby',
      type: 'standby',
      standbyPosition:
        standbyPosition,
      totalStandby,
      message:
        standbyPosition ? `취소표 대기 ${standbyPosition}번째입니다.` : '취소표 대기 중입니다.',
    };
  }

  return {
    status: 'not_found',
    message:
      '대기열에 등록되어 있지 않습니다.',
  };
}

async function admitBatch(
  context = {}
) {
  const { issueToken, revokeToken } =
    require('./tokenService');

  const keys = queueKeys(context);
  const admissionTimeout = await getAdmissionTimeout();

  const admittedCount = await redis.scard(keys.admittedKey);
  const availableSlots = Math.max(0, BATCH_SIZE - admittedCount);
  if (availableSlots === 0) {
    return {
      admitted: [],
      count: 0,
      remaining: await redis.zcard(keys.waitingKey),
      message: `현재 입장 슬롯이 가득 찼습니다. (최대 ${BATCH_SIZE}명)`,
    };
  }

  const users =
    await redis.zrange(
      keys.waitingKey,
      0,
      availableSlots - 1
    );

  if (users.length === 0) {
    return {
      admitted: [],
      count: 0,
      message:
        '대기 중인 사용자가 없습니다.',
    };
  }

  const tokens = {};

  try {
    for (const userId of users) {
      const {
        token,
        expiresAt,
      } = await issueToken(
        userId,
        admissionTimeout,
        keys
      );

      tokens[userId] = {
        token,
        expiresAt,
      };
    }
  } catch (err) {
    await Promise.all(
      Object.keys(tokens).map((userId) =>
        revokeToken(userId, keys).catch(() => {})
      )
    );
    throw err;
  }

  try {
    const pipeline =
      redis.pipeline();

    pipeline.zrem(
      keys.waitingKey,
      ...users
    );

    pipeline.sadd(
      keys.admittedKey,
      ...users
    );

    await pipeline.exec();
  } catch (err) {
    await Promise.all(
      users.map((userId) =>
        revokeToken(userId, keys).catch(() => {})
      )
    );
    throw err;
  }

  const placeholders =
    users.map(() => '?').join(',');

  await syncToMariaDB(
    `UPDATE waiting_queue
     SET status = 'ADMITTED',
         updated_at = NOW()
     WHERE user_id IN (${placeholders})
       AND event_id = ?
       AND session_date = ?
       AND session_time = ?
       AND status = 'WAITING'`,
    [
      ...users,
      keys.eventId,
      keys.sessionDate,
      keys.sessionTime,
    ],
    `queue:admit batch(${users.length})`,
  );

  const session = normalizeSessionContext(context);
  const deadlinePipeline = redis.pipeline();
  for (const userId of users) {
    const dKey = admissionDeadlineKey(userId, context);
    const metaField = dKey.slice(ADMISSION_DEADLINE_PREFIX.length);
    deadlinePipeline.set(dKey, '1', 'EX', admissionTimeout);
    deadlinePipeline.hset(ADMISSION_DEADLINE_META, metaField, JSON.stringify({
      userId, eventId: session.eventId, sessionDate: session.sessionDate, sessionTime: session.sessionTime,
    }));
  }
  await deadlinePipeline.exec();

  const remaining =
    await redis.zcard(
      keys.waitingKey
    );

  return {
    admitted: users,
    tokens,
    count: users.length,
    remaining,
    message:
      `${users.length}명 입장 허용 + Admission Token 발급 완료`,
  };
}

async function getNextStandby(
  context = {}
) {
  const keys = queueKeys(context);

  const users =
    await redis.zrange(
      keys.standbyKey,
      0,
      0
    );

  if (users.length === 0) {
    return {
      userId: null,
      message:
        '취소표 대기자가 없습니다.',
    };
  }

  return {
    userId: users[0],
    message:
      `다음 대기자: ${users[0]}`,
  };
}

async function skipStandby(
  userId,
  context = {}
) {
  const keys = queueKeys(context);

  const removed =
    await redis.zrem(
      keys.standbyKey,
      userId
    );

  if (removed > 0) {
    await syncToMariaDB(
      `UPDATE waiting_queue
       SET status = 'SKIPPED',
           updated_at = NOW()
       WHERE user_id = ?
         AND event_id = ?
         AND session_date = ?
         AND session_time = ?
         AND queue_type = 'standby'
         AND status = 'WAITING'`,
      [
        userId,
        keys.eventId,
        keys.sessionDate,
        keys.sessionTime,
      ],
      `queue:skip-standby ${userId}`,
    );
  }

  return {
    success: removed > 0,
    userId,
    removed,
  };
}

async function promoteStandby(
  userId,
  context = {}
) {
  const { issueToken, revokeToken } =
    require('./tokenService');

  const keys = queueKeys(context);
  const admissionTimeout = await getAdmissionTimeout();

  const standbyScore = await redis.zscore(
    keys.standbyKey,
    userId
  );

  const removed =
    await redis.zrem(
      keys.standbyKey,
      userId
    );

  if (removed === 0) {
    return {
      success: false,
      message:
        '해당 사용자가 standby에 없습니다.',
    };
  }

  let tokenInfo;
  try {
    tokenInfo = await issueToken(
      userId,
      admissionTimeout,
      keys
    );

    await redis.sadd(
      keys.admittedKey,
      userId
    );

    await setAdmissionDeadline(userId, context);
  } catch (err) {
    if (standbyScore !== null) {
      await redis.zadd(
        keys.standbyKey,
        standbyScore,
        userId
      ).catch(() => {});
    }
    await revokeToken(userId, keys).catch(() => {});
    throw err;
  }

  await syncToMariaDB(
    `UPDATE waiting_queue
     SET status = 'PROMOTED',
         updated_at = NOW()
     WHERE user_id = ?
       AND event_id = ?
       AND session_date = ?
       AND session_time = ?
       AND queue_type = 'standby'
       AND status = 'WAITING'`,
    [
      userId,
      keys.eventId,
      keys.sessionDate,
      keys.sessionTime,
    ],
    `queue:promote ${userId}`,
  );

  return {
    success: true,
    userId,
    token: tokenInfo.token,
    expiresAt: tokenInfo.expiresAt,
    message:
      `${userId} 입장 허용 + Token 발급`,
  };
}

async function getStats(
  context = {}
) {
  const keys = queueKeys(context);

  const memberStandbyPromise = keys.eventId
    ? getStandbyMemberCount(context).catch((err) => {
      console.warn('[Queue] 관리자 취소표 멤버십 집계 실패:', err.message);
      return null;
    })
    : Promise.resolve(null);

  const [
    waiting,
    standby,
    admitted,
    lastTicket,
    totalSeats,
    memberStandby,
  ] = await Promise.all([
    redis.zcard(keys.waitingKey),
    redis.zcard(keys.standbyKey),
    redis.scard(keys.admittedKey),
    redis.get(keys.counterKey),
    redis.get(keys.totalSeatsKey),
    memberStandbyPromise,
  ]);

  return {
    totalSeats:
      parseInt(totalSeats, 10) || 0,
    eligible: waiting,
    standby: memberStandby === null ? standby : memberStandby,
    admitted,
    lastTicket:
      parseInt(lastTicket, 10) || 0,
  };
}

async function isUserAdmitted(
  userId,
  context = {}
) {
  const keys = queueKeys(context);

  return redis.sismember(
    keys.admittedKey,
    userId
  );
}

async function clearQueuesForEvent(
  eventId
) {
  if (!eventId) {
    return { deleted: 0 };
  }

  let cursor = '0';
  let deleted = 0;

  do {
    const [
      nextCursor,
      keys,
    ] = await redis.scan(
      cursor,
      'MATCH',
      `queue:*:${eventId}:*`,
      'COUNT',
      200
    );

    cursor = nextCursor;

    if (keys.length) {
      await redis.del(...keys);
      deleted += keys.length;
    }
  } while (cursor !== '0');

  return { deleted };
}

async function openTicketing() {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }

  if (standbyCloseTimer) {
    clearTimeout(standbyCloseTimer);
    standbyCloseTimer = null;
  }

  await redis.set(
    TICKETING_STATUS_KEY,
    'open'
  );

  const openedAt =
    new Date().toISOString();

  console.log(
    `[Ticketing] 오픈 — ${openedAt}`
  );

  return {
    status: 'open',
    openedAt,
    message:
      '티켓팅이 오픈되었습니다.',
  };
}

async function closeTicketing() {
  await redis.set(
    TICKETING_STATUS_KEY,
    'closed'
  );

  const closedAt =
    new Date().toISOString();

  console.log(
    `[Ticketing] 마감 — ${closedAt}`
  );

  return {
    status: 'closed',
    closedAt,
    message:
      '티켓팅이 마감되었습니다.',
  };
}

async function setHoldDuration(
  seconds
) {
  await redis.set(
    HOLD_DURATION_KEY,
    seconds
  );

  console.log(
    `[Ticketing] 결제 제한 시간: ${seconds}초 (${Math.floor(seconds / 60)}분)`
  );

  return {
    holdDuration: seconds,
    display:
      `${Math.floor(seconds / 60)}분 ${seconds % 60}초`,
    message:
      `결제 제한 시간이 ${seconds}초로 설정되었습니다.`,
  };
}

async function getHoldDuration() {
  const duration =
    parseInt(
      await redis.get(HOLD_DURATION_KEY),
      10
    ) ||
    parseInt(
      process.env.HOLD_DURATION,
      10
    ) ||
    600;

  return {
    holdDuration: duration,
    display:
      `${Math.floor(duration / 60)}분 ${duration % 60}초`,
  };
}

let openTimer = null;
let closeTimer = null;

async function scheduleTicketing(
  openAt,
  durationMinutes
) {
  const openTime =
    new Date(openAt).getTime();

  const now = Date.now();
  const delayMs =
    openTime - now;

  if (delayMs <= 0) {
    return {
      success: false,
      message:
        '오픈 시간이 현재 시간보다 이전입니다.',
    };
  }

  if (openTimer) {
    clearTimeout(openTimer);
  }

  if (closeTimer) {
    clearTimeout(closeTimer);
  }

  await closeTicketing();

  await redis.hset(
    'event:schedule',
    {
      openAt,
      durationMinutes:
        (durationMinutes || 0).toString(),
      scheduledAt:
        new Date().toISOString(),
    }
  );

  openTimer = setTimeout(
    async () => {
      await openTicketing();

      console.log(
        `[Schedule] 예약 시간 도달 — 티켓팅 자동 오픈`
      );

      if (
        durationMinutes &&
        durationMinutes > 0
      ) {
        const closeDelayMs =
          durationMinutes *
          60 *
          1000;

        closeTimer = setTimeout(
          async () => {
            await closeTicketing();

            console.log(
              `[Schedule] ${durationMinutes}분 경과 — 티켓팅 자동 마감`
            );
          },
          closeDelayMs
        );
      }
    },
    delayMs
  );

  const delaySeconds =
    Math.floor(delayMs / 1000);

  const delayMinutes =
    Math.floor(delaySeconds / 60);

  const delaySec =
    delaySeconds % 60;

  return {
    success: true,
    openAt,
    opensIn:
      `${delayMinutes}분 ${delaySec}초 후`,
    autoClose: durationMinutes
      ? `오픈 후 ${durationMinutes}분 뒤 자동 마감`
      : '수동 마감',
    message:
      `티켓팅이 ${openAt}에 자동 오픈됩니다.`,
  };
}

async function restoreTicketingSchedule(
  openAt,
  durationMinutes = 0
) {
  if (!openAt) {
    await cancelSchedule();
    await openTicketing();

    return {
      success: true,
      scheduled: false,
      status: 'open',
      message:
        '예매가 즉시 오픈 상태로 복구되었습니다.',
    };
  }

  const openTime =
    new Date(openAt).getTime();

  if (!Number.isFinite(openTime)) {
    return {
      success: false,
      scheduled: false,
      message:
        '저장된 오픈 시간이 올바르지 않습니다.',
    };
  }

  if (openTime <= Date.now()) {
    await cancelSchedule();
    await openTicketing();

    return {
      success: true,
      scheduled: false,
      status: 'open',
      openAt,
      message:
        '오픈 시간이 지나 예매중 상태로 복구되었습니다.',
    };
  }

  return scheduleTicketing(
    openAt,
    durationMinutes
  );
}

async function cancelSchedule() {
  if (openTimer) {
    clearTimeout(openTimer);
    openTimer = null;
  }

  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }

  await redis.del(
    'event:schedule'
  );

  return {
    success: true,
    message:
      '예약된 스케줄이 취소되었습니다.',
  };
}

async function getSchedule() {
  const schedule =
    await redis.hgetall(
      'event:schedule'
    );

  if (
    !schedule ||
    !schedule.openAt
  ) {
    return {
      scheduled: false,
      message:
        '예약된 스케줄이 없습니다.',
    };
  }

  const openTime =
    new Date(
      schedule.openAt
    ).getTime();

  const remaining =
    openTime - Date.now();

  return {
    scheduled: true,
    openAt: schedule.openAt,
    durationMinutes:
      parseInt(
        schedule.durationMinutes,
        10
      ) || null,
    remainingSeconds:
      remaining > 0
        ? Math.floor(
            remaining / 1000
          )
        : 0,
    scheduledAt:
      schedule.scheduledAt,
  };
}

async function getTicketingStatus() {
  let status =
    await redis.get(
      TICKETING_STATUS_KEY
    );

  if (!status) {
    const eventInfo =
      await redis.hgetall(
        'event:info'
      );

    status =
      eventInfo &&
      eventInfo.eventId
        ? 'open'
        : 'closed';

    if (status === 'open') {
      await redis.set(
        TICKETING_STATUS_KEY,
        'open'
      );
    }
  }

  const descriptions = {
    open:
      '예매 가능 (eligible + standby 진입 가능)',

    sold_out:
      '전석 매진 (취소표 대기만 가능)',

    closed:
      '완전 마감 (진입 불가, 기존 standby만 취소표 대기)',
  };

  return {
    status,
    description:
      descriptions[status] ||
      '알 수 없음',
  };
}

let standbyCloseTimer = null;

async function scheduleStandbyClose(
  closeAt
) {
  const closeTime =
    new Date(closeAt).getTime();

  const now = Date.now();

  const delayMs =
    closeTime - now;

  if (delayMs <= 0) {
    return {
      success: false,
      message:
        '마감 시간이 현재 시간보다 이전입니다.',
    };
  }

  if (standbyCloseTimer) {
    clearTimeout(
      standbyCloseTimer
    );
  }

  await redis.hset(
    'event:schedule',
    {
      standbyCloseAt: closeAt,
    }
  );

  standbyCloseTimer = setTimeout(
    async () => {
      await redis.set(
        TICKETING_STATUS_KEY,
        'closed'
      );

      console.log(
        `[Schedule] standby 마감 시간 도달 — 완전 마감 (기존 standby는 유지)`
      );
    },
    delayMs
  );

  const delayMinutes =
    Math.floor(
      delayMs / 60000
    );

  const delayHours =
    Math.floor(
      delayMinutes / 60
    );

  const remainMin =
    delayMinutes % 60;

  return {
    success: true,
    standbyCloseAt: closeAt,
    closesIn:
      `${delayHours}시간 ${remainMin}분 후`,
    message:
      `${closeAt}에 standby 접수가 마감됩니다. 이후 신규 진입 불가.`,
  };
}

async function scheduleCloseTime(
  closeAt
) {
  const closeTime =
    new Date(closeAt).getTime();

  const now = Date.now();

  const delayMs =
    closeTime - now;

  if (delayMs <= 0) {
    await closeTicketing();

    return {
      success: true,
      immediate: true,
      message:
        '마감 시간이 이미 지났으므로 즉시 마감 처리되었습니다.',
    };
  }

  if (closeTimer) {
    clearTimeout(closeTimer);
  }

  closeTimer = setTimeout(
    async () => {
      await closeTicketing();

      console.log(
        `[Schedule] 예약 마감 시간 도달 — 티켓팅 자동 마감`
      );
    },
    delayMs
  );

  const delayMinutes =
    Math.floor(delayMs / 60000);

  const delayHours =
    Math.floor(
      delayMinutes / 60
    );

  const remainMin =
    delayMinutes % 60;

  return {
    success: true,
    ticketCloseAt: closeAt,
    closesIn:
      `${delayHours}시간 ${remainMin}분 후`,
    message:
      `${closeAt}에 티켓팅이 자동 마감됩니다.`,
  };
}

async function cancelCloseSchedule() {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }

  return {
    success: true,
    message:
      '마감 예약이 취소되었습니다.',
  };
}

async function recoverQueueFromMariaDB(
  eventId,
  context = {}
) {
  if (!eventId) {
    return {
      recovered: false,
      message: 'eventId 필요',
    };
  }

  const force =
    Boolean(context.force);

  const hasSession =
    Boolean(
      context.sessionDate ||
      context.sessionTime
    );

  const keys = queueKeys(
    hasSession
      ? {
          ...context,
          eventId,
        }
      : {}
  );

  const sessionClause =
    hasSession
      ? ' AND session_date = ? AND session_time = ?'
      : '';

  const sessionParams =
    hasSession
      ? [
          keys.sessionDate,
          keys.sessionTime,
        ]
      : [];

  const existingCount =
    await redis.zcard(
      keys.waitingKey
    );

  const existingStandby =
    await redis.zcard(
      keys.standbyKey
    );

  const existingAdmitted =
    await redis.scard(
      keys.admittedKey
    );

  if (
    existingCount +
      existingStandby +
      existingAdmitted >
      0 &&
    !force
  ) {
    return {
      recovered: false,
      message:
        'Redis 대기열에 이미 데이터가 있습니다',
      existing: {
        eligible:
          existingCount,
        standby:
          existingStandby,
        admitted:
          existingAdmitted,
      },
    };
  }

  const eligible =
    await pool.query(
      `SELECT
         user_id,
         queue_index
       FROM waiting_queue
       WHERE event_id = ?
         ${sessionClause}
         AND queue_type = ?
         AND status = ?
       ORDER BY queue_index`,
      [
        eventId,
        ...sessionParams,
        'eligible',
        'WAITING',
      ],
    );

  if (eligible.length > 0) {
    const pipeline =
      redis.pipeline();

    for (const row of eligible) {
      pipeline.zadd(
        keys.waitingKey,
        row.queue_index,
        row.user_id
      );
    }

    await pipeline.exec();
  }

  const standby =
    await pool.query(
      `SELECT
         user_id,
         queue_index
       FROM waiting_queue
       WHERE event_id = ?
         ${sessionClause}
         AND queue_type = ?
         AND status = ?
       ORDER BY queue_index`,
      [
        eventId,
        ...sessionParams,
        'standby',
        'WAITING',
      ],
    );

  if (standby.length > 0) {
    const pipeline =
      redis.pipeline();

    for (const row of standby) {
      pipeline.zadd(
        keys.standbyKey,
        row.queue_index,
        row.user_id
      );
    }

    await pipeline.exec();
  }

  const admitted =
    await pool.query(
      `SELECT
         user_id
       FROM waiting_queue
       WHERE event_id = ?
         ${sessionClause}
         AND status IN (?, ?)`,
      [
        eventId,
        ...sessionParams,
        'ADMITTED',
        'PROMOTED',
      ],
    );

  if (admitted.length > 0) {
    await redis.sadd(
      keys.admittedKey,
      ...admitted.map(
        row => row.user_id
      )
    );
  }

  const maxRow =
    await pool.query(
      `SELECT
         MAX(queue_index) AS max_idx
       FROM waiting_queue
       WHERE event_id = ?
         ${sessionClause}`,
      [
        eventId,
        ...sessionParams,
      ],
    );

  const counter =
    maxRow[0]?.max_idx || 0;

  if (counter > 0) {
    await redis.set(
      keys.counterKey,
      counter
    );
  }

  const eventRow =
    await pool.query(
      `SELECT
         total_seats,
         sessions
       FROM events
       WHERE event_id = ?`,
      [eventId],
    );

  let totalSeats =
    eventRow[0]?.total_seats || 0;

  if (hasSession) {
    try {
      const storedSessions =
        typeof eventRow[0]?.sessions === 'string'
          ? JSON.parse(
              eventRow[0].sessions
            )
          : eventRow[0]?.sessions;

      const sessionCount =
        Array.isArray(
          storedSessions
        ) &&
        storedSessions.length
          ? storedSessions.length
          : 1;

      totalSeats =
        Math.ceil(
          totalSeats /
            sessionCount
        );
    } catch (_) {}
  }

  if (totalSeats > 0) {
    await redis.set(
      keys.totalSeatsKey,
      totalSeats
    );
  }

  console.log(
    `[Queue Recovery] ${eventId}: eligible=${eligible.length}, standby=${standby.length}, admitted=${admitted.length}, counter=${counter}, totalSeats=${totalSeats}`
  );

  return {
    recovered: true,
    eligible:
      eligible.length,
    standby:
      standby.length,
    admitted:
      admitted.length,
    counter,
    totalSeats,
  };
}

module.exports = {
  setTotalSeats,
  enter,
  enterStandby,
  getActiveStandbyMembers,
  getPosition,
  admitBatch,
  getNextStandby,
  skipStandby,
  promoteStandby,
  getStats,
  getStandbyMemberStats,
  getStandbyMemberCount,
  recordSimulationParticipant,
  isUserAdmitted,
  clearQueuesForEvent,
  queueKeys,
  openTicketing,
  closeTicketing,
  getTicketingStatus,
  setHoldDuration,
  getHoldDuration,
  getAdmissionTimeout,
  setAdmissionTimeout,
  setAdmissionDeadline,
  cancelAdmissionDeadline,
  removeAdmitted,
  backfillOne,
  hasMainQueueParticipation,
  isMainTicketingOpen,
  scheduleTicketing,
  restoreTicketingSchedule,
  cancelSchedule,
  getSchedule,
  scheduleStandbyClose,
  scheduleCloseTime,
  cancelCloseSchedule,
  recoverQueueFromMariaDB,
  ADMISSION_DEADLINE_PREFIX,
  ADMISSION_DEADLINE_META,
};
