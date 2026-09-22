const cancelAllocationService = require('../services/cancelAllocationService');
const pool = require('../config/mariadb');
const membershipService = require('../services/membershipService');
const queueService = require('../services/queueService');
const seatService = require('../services/seatService');
const { getRawToken } = require('../services/tokenService');
const { guardRecaptcha } = require('../services/recaptchaService');
const bCallback = require('../services/bPartCallbackService');
const { verifyCancelLinkToken } = require('../services/cancelLinkTokenService');
const { issueScopedCancelToken } = require('../services/authTokenService');
const {
  authenticate,
  requireRole,
  allowUserOrCancelLink,
  requireSelfOrLink,
} = require('../middleware/auth');

const adminAuth = { preHandler: [authenticate, requireRole('admin')] };
const userAuth = { preHandler: [allowUserOrCancelLink, requireSelfOrLink] };
const ESTIMATED_WAIT_MINUTES_PER_PERSON = 5;

function getQueueContext(request, eventId = '') {
  const body = request.body || {};
  const query = request.query || {};
  return {
    eventId: body.eventId || query.eventId || eventId || '',
    sessionDate: body.sessionDate || query.sessionDate || '',
    sessionTime: body.sessionTime || query.sessionTime || '',
  };
}

function getRequestedAllocationId(body) {
  const value = body.allocationId ?? body.allocation_id;
  return value === undefined || value === null || value === '' ? '' : String(value);
}

function isPastExpiry(allocation) {
  if (!allocation || allocation.status !== 'LINK_SENT' || !allocation.expiresAt) return false;
  const expiresAtMs = new Date(allocation.expiresAt).getTime();
  return Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();
}

async function resolveAllocation(userId, eventId, requestedAllocationId = '') {
  const allocation = requestedAllocationId
    ? await cancelAllocationService.getAllocationById(requestedAllocationId)
    : await cancelAllocationService.getActionAllocation(userId, eventId);

  if (!allocation) return { allocation: null, reason: 'not_found' };
  if (allocation.userId !== userId || (eventId && allocation.eventId !== eventId)) {
    return { allocation: null, reason: 'mismatch' };
  }
  return { allocation, reason: '' };
}

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function cancelQueueKey(eventId, sessionDate, sessionTime) {
  return [eventId || '', sessionDate || '', sessionTime || ''].map(String).join('::');
}

let cancelQueueHistoryReady = null;

// B파트 Secret Link의 수동 양도는 결제가 발생하지 않는다. 예약·환불 테이블을
// 만들지 않고, 취소표 순번 종료 사실만 마이페이지에 보여 줄 전용 이력으로 남긴다.
async function ensureCancelQueueHistory() {
  if (!cancelQueueHistoryReady) {
    cancelQueueHistoryReady = pool.query(`CREATE TABLE IF NOT EXISTS cancel_queue_history (
      history_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      allocation_id INT NOT NULL,
      user_id VARCHAR(100) NOT NULL,
      event_id VARCHAR(100) NOT NULL,
      session_date VARCHAR(50) NOT NULL DEFAULT '',
      session_time VARCHAR(10) NOT NULL DEFAULT '',
      seat_id VARCHAR(100) NULL,
      action VARCHAR(30) NOT NULL,
      reason VARCHAR(30) NOT NULL DEFAULT 'manual',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_cancel_queue_history_allocation_action (allocation_id, action),
      INDEX idx_cancel_queue_history_user (user_id, created_at)
    )`).catch((err) => {
      cancelQueueHistoryReady = null;
      throw err;
    });
  }
  return cancelQueueHistoryReady;
}

// 대기열 종료와 이력 저장은 같은 DB 트랜잭션으로 처리한다. 콜백 재시도 시에도
// COMPLETED 갱신과 UNIQUE KEY가 멱등성을 보장한다.
async function completeManualPass(allocation) {
  await ensureCancelQueueHistory();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const queueResult = await conn.query(
      `UPDATE waiting_queue
       SET status = 'COMPLETED', updated_at = NOW()
       WHERE user_id = ?
         AND event_id = ?
         AND queue_type = 'standby'
         AND COALESCE(session_date, '') = ?
         AND COALESCE(session_time, '') = ?
         AND status NOT IN ('COMPLETED', 'LEFT')`,
      [
        allocation.userId,
        allocation.eventId,
        allocation.sessionDate || '',
        allocation.sessionTime || '',
      ],
    );
    await conn.query(
      `INSERT INTO cancel_queue_history
       (allocation_id, user_id, event_id, session_date, session_time, seat_id, action, reason)
       VALUES (?, ?, ?, ?, ?, ?, 'PASSED', 'manual')
       ON DUPLICATE KEY UPDATE history_id = history_id`,
      [
        allocation.id,
        allocation.userId,
        allocation.eventId,
        allocation.sessionDate || '',
        allocation.sessionTime || '',
        allocation.seatId || null,
      ],
    );
    await conn.commit();
    return { queueRemoved: (queueResult.affectedRows || 0) > 0, historyRecorded: true };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

async function cancelQueueRoutes(fastify) {

  fastify.post('/cancel-queue/join', userAuth, async (request, reply) => {
    if (!await guardRecaptcha(request, reply, 'cancel_queue_join')) return;
    const { userId } = request.body || {};
    if (!userId) {
      return reply.status(400).send({ error: 'userId는 필수입니다.' });
    }
    const context = getQueueContext(request);
    // 취소표 대기열은 활성 멤버십 사용자의 본 티켓팅 참여 이력을 기준으로
    // 별도로 등록한다. 일반 본 티켓팅 대기열과 섞이지 않도록 유지한다.
    const result = await queueService.enterStandby(userId, context);
    return reply.status(result.status === 'closed' ? 409 : 200).send(result);
  });

  fastify.get('/cancel-queue/status/:eventId/:userId', userAuth, async (request, reply) => {
    const { eventId } = request.params;
    const userId = request.query.userId || request.params.userId;
    const context = getQueueContext(request, eventId);

    const [position, membership, allocation, participatedInMainQueue] = await Promise.all([
      queueService.getPosition(userId, context),
      membershipService.getMembership(userId),
      cancelAllocationService.getActiveAllocation(userId, eventId),
      queueService.hasMainQueueParticipation(userId, context),
    ]);

    if (!membership.isMembership) {
      return reply.status(403).send({
        success: false,
        code: 'membership_required',
        message: '취소표 대기열은 활성 멤버십 회원만 이용할 수 있습니다.',
      });
    }

    if (!participatedInMainQueue) {
      return reply.status(403).send({
        success: false,
        code: 'main_queue_required',
        message: '본 티켓팅 대기열에 참여한 활성 멤버십 회원만 취소표 상태를 조회할 수 있습니다.',
      });
    }

    return reply.send({
      eventId,
      userId,
      queue: position,
      estimatedWaitMinutes: position?.standbyPosition
        ? Math.max(0, Number(position.standbyPosition) - 1) * ESTIMATED_WAIT_MINUTES_PER_PERSON
        : null,
      waitMinutesPerPerson: ESTIMATED_WAIT_MINUTES_PER_PERSON,
      membership: {
        isMembership: membership.isMembership,
        plan: membership.plan || null,
        expiresAt: membership.expiresAt || null,
      },
      secretLink: allocation ? {
        active: true,
        allocationId: allocation.id,
        seatId: allocation.seatId,
        sessionDate: allocation.sessionDate || '',
        sessionTime: allocation.sessionTime || '',
        expiresAt: allocation.expiresAt,
        remainingSeconds: Math.max(0, Math.floor((new Date(allocation.expiresAt).getTime() - Date.now()) / 1000)),
      } : { active: false },
    });
  });

  // 마이페이지에서 사용자가 실제로 참여 중인 취소표 대기열을 복원한다.
  // 브라우저 메모리(state.cancelQueues)에 의존하지 않고 MariaDB를 기준으로
  // 목록을 만들며, 활성 cancel_allocations가 있으면 대기 행의 상태가 바뀌어도
  // 목록에 남긴다. Redis가 살아 있으면 현재 순번만 실시간으로 보정한다.
  fastify.get('/cancel-queue/mine', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = request.authUser.userId;
    let stage = 'identity';

    try {
      const membership = await membershipService.getMembership(userId);

      // 마이페이지의 취소표 대기열은 멤버십 전용 서비스다. 비회원에게
      // 대기열 행이나 순번을 노출하지 않고 빈 목록을 반환한다.
      if (!membership.isMembership) {
        return reply.send({ userId, queues: [], count: 0 });
      }

      // 시뮬레이션 입력값 또는 구버전 데이터가 이메일을 user_id로 저장한 경우에도
      // 현재 로그인 계정의 user_id와 email을 함께 후보로 사용한다. users 조회는
      // 보조 조회이므로 컬럼 차이가 있는 DB에서는 로그인 ID만으로 계속 진행한다.
      let identity = {};
      try {
        const identityRows = await pool.query(
          'SELECT user_id, email FROM users WHERE user_id = ? OR email = ? LIMIT 1',
          [userId, userId],
        );
        identity = identityRows[0] || {};
      } catch (err) {
        console.warn('[CancelQueue] users identity 보조 조회 실패:', err.message);
      }

      const userIds = [...new Set([userId, identity.user_id, identity.email].filter(Boolean).map(String))];
      const userPlaceholders = userIds.map(() => '?').join(',');

      // waiting_queue 자체가 목록의 기준이다. events/cancel_allocations를 LEFT JOIN한
      // 단일 SQL은 두 테이블의 컬럼 차이 하나만 있어도 전체 API가 500이 되므로,
      // 먼저 waiting_queue의 공통 컬럼만 조회하고 부가 정보는 별도로 보강한다.
      stage = 'waiting_queue';
      const candidateRows = await pool.query(
        `SELECT user_id, queue_id, event_id, session_date, session_time, queue_index, status, created_at
         FROM waiting_queue
         WHERE user_id IN (${userPlaceholders})
           AND queue_type = 'standby'
           AND status NOT IN ('COMPLETED', 'LEFT')
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
         ORDER BY created_at DESC, queue_id DESC`,
        userIds,
      );

      const eventIds = [...new Set(candidateRows.map((row) => row.event_id).filter(Boolean).map(String))];
      const eventById = new Map();
      if (eventIds.length) {
        stage = 'events';
        try {
          const eventPlaceholders = eventIds.map(() => '?').join(',');
          const eventRows = await pool.query(
            `SELECT event_id, event_name, event_date, venue, status
             FROM events WHERE event_id IN (${eventPlaceholders})`,
            eventIds,
          );
          eventRows.forEach((event) => eventById.set(String(event.event_id), event));
        } catch (err) {
          // 공연 상세정보는 화면 표시용이다. 대기열 본문까지 숨기지 않는다.
          console.warn('[CancelQueue] events 보조 조회 실패:', err.message);
        }
      }

      const latestAllocationByKey = new Map();
      const legacyAllocationsByEvent = new Map();
      if (userIds.length) {
        stage = 'cancel_allocations';
        try {
          const allocationRows = await pool.query(
            `SELECT allocation_id, user_id, event_id, session_date, session_time, seat_id,
                    status, expires_at,
                    CASE
                      WHEN status = 'LINK_SENT'
                       AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP())
                      THEN 1 ELSE 0
                    END AS is_active
             FROM cancel_allocations
             WHERE user_id IN (${userPlaceholders})
             ORDER BY allocation_id DESC`,
            userIds,
          );
          allocationRows.forEach((allocation) => {
            const key = cancelQueueKey(allocation.event_id, allocation.session_date, allocation.session_time);
            const userKey = `${String(allocation.user_id)}::${key}`;
            if (!latestAllocationByKey.has(userKey)) latestAllocationByKey.set(userKey, allocation);

            // 초기 AWS B파트 발급본 중에는 회차 컬럼이 비어 있는 행이 있다.
            // 회차가 하나뿐인 대기열에서만 최신 할당 상태를 연결하고,
            // 여러 회차가 있으면 어느 회차의 할당인지 추측하지 않는다.
            if (!String(allocation.session_date || '').trim() && !String(allocation.session_time || '').trim()) {
              const eventKey = String(allocation.event_id || '');
              const entries = legacyAllocationsByEvent.get(eventKey) || [];
              entries.push(allocation);
              legacyAllocationsByEvent.set(eventKey, entries);
            }
          });
        } catch (err) {
          // B파트 링크 발급 전에는 할당 행이 없어도 정상이다. 이 조회 실패가
          // waiting_queue 목록 조회 자체를 실패로 만들지 않도록 빈 보조정보로 진행한다.
          console.warn('[CancelQueue] cancel_allocations 보조 조회 실패:', err.message);
        }
      }

      const candidateSessionKeysByEvent = new Map();
      candidateRows.forEach((row) => {
        const eventKey = String(row.event_id || '');
        const sessionKeys = candidateSessionKeysByEvent.get(eventKey) || new Set();
        sessionKeys.add(cancelQueueKey(row.event_id, row.session_date, row.session_time));
        candidateSessionKeysByEvent.set(eventKey, sessionKeys);
      });

      const findLatestAllocationForRow = (row) => {
        const key = cancelQueueKey(row.event_id, row.session_date, row.session_time);
        const matched = userIds
          .map((candidateId) => latestAllocationByKey.get(`${candidateId}::${key}`))
          .find(Boolean);
        if (matched) return matched;

        const eventKey = String(row.event_id || '');
        const legacy = legacyAllocationsByEvent.get(eventKey) || [];
        const sessionCount = candidateSessionKeysByEvent.get(eventKey)?.size || 0;
        return legacy.length === 1 && sessionCount === 1 ? legacy[0] : null;
      };

      const rows = candidateRows.filter((row) => {
        const latestAllocation = findLatestAllocationForRow(row);
        const hasActiveAllocation = Boolean(Number(latestAllocation?.is_active));

        // B파트가 제한시간 만료를 처리하면 cancel_allocations는 EXPIRED가 되지만
        // waiting_queue의 standby 행은 WAITING으로 남을 수 있다. 최신 할당이
        // 종료 상태이거나 DB 만료시각을 지났다면 다시 대기 중으로 되살리지 않는다.
        if (latestAllocation && !hasActiveAllocation) return false;
        return String(row.status || '').toUpperCase() === 'WAITING' || hasActiveAllocation;
      });

      const queues = await Promise.all(rows.map(async (row) => {
        const context = {
          eventId: row.event_id,
          sessionDate: row.session_date || '',
          sessionTime: row.session_time || '',
        };
        let position = Number(row.queue_index || 0);
        let total = 0;
        const latestAllocation = findLatestAllocationForRow(row);
        const allocation = Number(latestAllocation?.is_active) ? latestAllocation : null;
        const event = eventById.get(String(row.event_id)) || {};

        let memberStats = null;
        try {
          memberStats = await queueService.getStandbyMemberStats(row.user_id, context);
        } catch (err) {
          console.warn(`[CancelQueue] 멤버십 대기자 집계 실패 (${row.event_id}):`, err.message);
        }

        if (memberStats) {
          position = memberStats.position || position;
          total = memberStats.total;
        } else {
          // 멤버십 대기자 집계가 실패한 경우 Redis 전체 standby 수를
          // 대신 표시하지 않는다. 비회원이 섞인 수치를 노출하지 않기 위해
          // DB의 queue_index만 유지하고 전체 인원은 미확인으로 둔다.
          total = 0;
        }

        return {
          queueId: row.queue_id,
          eventId: row.event_id,
          eventName: event.event_name || row.event_id,
          eventDate: event.event_date || '',
          venue: event.venue || '',
          eventStatus: event.status || '',
          sessionDate: row.session_date || '',
          sessionTime: row.session_time || '',
          queueType: 'standby',
          queueStatus: row.status || 'WAITING',
          myNumber: position > 0 ? position : null,
          total,
          simulationQueue: Boolean(memberStats?.simulationQueue),
          membershipEligible: Boolean(membership.isMembership),
          estimatedWaitMinutes: position > 0
            ? Math.max(0, position - 1) * ESTIMATED_WAIT_MINUTES_PER_PERSON
            : null,
          waitMinutesPerPerson: ESTIMATED_WAIT_MINUTES_PER_PERSON,
          joinedAt: toIso(row.created_at),
          allocation: allocation ? {
            active: true,
            allocationId: allocation.allocation_id,
            seatId: allocation.seat_id || null,
            sessionDate: allocation.session_date || row.session_date || '',
            sessionTime: allocation.session_time || row.session_time || '',
            expiresAt: toIso(allocation.expires_at),
          } : null,
          status: allocation ? 'allocated' : row.status || 'WAITING',
        };
      }));

      return reply.send({ userId, queues, count: queues.length });
    } catch (err) {
      console.error(`[CancelQueue] /cancel-queue/mine 실패 (stage=${stage}):`, err.message);
      return reply.status(503).send({
        success: false,
        code: 'cancel_queue_unavailable',
        message: '취소표 대기열 정보를 일시적으로 불러오지 못했습니다.',
      });
    }
  });

  // 취소표 순차 배정은 B파트 Step Functions + SQS 파이프라인의 단일 책임이다.
  // 과거 운영 도구가 이 엔드포인트를 호출해도 A파트에서 이중 배정하지 않도록 명시적으로 차단한다.
  const allocationDelegated = async (_request, reply) => reply.status(410).send({
    success: false,
    code: 'allocation_delegated',
    message: '취소표 배정은 B파트 Step Functions 파이프라인에서 처리합니다.',
  });
  fastify.post('/cancel-queue/allocate', adminAuth, allocationDelegated);
  fastify.post('/cancel-queue/allocate-next', adminAuth, allocationDelegated);

  // [보존 / DO NOT DELETE] 취소표 전용 좌석 흐름.
  // B파트가 별도 취소표 사이트를 제공하더라도 A파트의 기존 로컬 SMTP/
  // fallback Secret Link 페이지와 이 API는 삭제하거나 일반 예매 흐름과 합치지 않는다.
  // seat_id가 있으면 서버 배정 좌석만, NULL이면 사용자가 고른 회차 좌석을 처리한다.
  fastify.post('/cancel-queue/hold', userAuth, async (request, reply) => {
    if (!await guardRecaptcha(request, reply, 'cancel_seat_hold')) return;
    const { userId, eventId, seatId } = request.body || {};
    if (!userId || !eventId || !seatId) {
      return reply.status(400).send({ error: 'userId, eventId, seatId는 필수입니다.' });
    }

    let allocation = await cancelAllocationService.getActiveAllocation(userId, eventId);
    if (!allocation) {
      return reply.status(409).send({ success: false, reason: 'allocation_required', message: '본인에게 배정된 취소표 할당이 없습니다.' });
    }
    if (allocation.seatId && allocation.seatId !== seatId) {
      return reply.status(409).send({ success: false, reason: 'seat_mismatch', message: '배정된 좌석과 요청한 좌석이 다릅니다.' });
    }

    const context = {
      eventId,
      sessionDate: allocation.sessionDate || request.body.sessionDate || '',
      sessionTime: allocation.sessionTime || request.body.sessionTime || '',
    };

    // verify-link 성공 후 발급된 JWT는 특정 allocation에만 사용할 수 있는
    // 취소표 전용 세션이다. 이 세션에서는 일반 대기열 Admission Token을
    // Redis에서 다시 찾으면 안 된다(로컬 SMTP 흐름에는 일반 토큰이 없음).
    const isScopedCancelSession = request.authUser?.scope === 'cancel_queue';
    const isCancelLinkSession = isScopedCancelSession || !!request.cancelLink;
    if (isScopedCancelSession) {
      const tokenEventId = String(request.authUser.eventId || '');
      const tokenAllocationId = String(request.authUser.allocationId || '');
      if (tokenEventId !== String(eventId) || tokenAllocationId !== String(allocation.id)) {
        return reply.status(403).send({
          success: false,
          reason: 'allocation_mismatch',
          message: '취소표 입장 토큰과 할당 정보가 일치하지 않습니다.',
        });
      }
    }

    let admissionToken = '';
    if (!isCancelLinkSession) {
      const tokenInfo = await getRawToken(userId, context);
      if (!tokenInfo) {
        return reply.status(401).send({ success: false, reason: 'token_unavailable', message: '취소표 입장 토큰이 만료되었거나 유효하지 않습니다.' });
      }
      admissionToken = tokenInfo.token;
    }

    let claimedByRequest = false;
    if (!allocation.seatId) {
      // 인증·토큰 검증을 통과한 뒤 사용자가 고른 좌석을 allocation에 기록한다.
      // 해당 공연·회차의 inventory와 AVAILABLE 상태는 여기서 먼저 확인하고,
      // 최종 동시성 처리는 seatService의 좌석 분산 락에서 다시 수행한다.
      const sessionSeats = await seatService.getAllSeats(eventId, context);
      const requestedSeat = sessionSeats.find((seat) => seat.seatId === seatId);
      if (!requestedSeat) {
        return reply.status(409).send({ success: false, reason: 'seat_session_mismatch', message: '선택한 좌석이 해당 공연 회차에 없습니다.' });
      }
      if (requestedSeat.status !== 'AVAILABLE') {
        return reply.status(409).send({ success: false, reason: 'unavailable', message: `이미 ${requestedSeat.status} 상태인 좌석입니다.` });
      }

      const assignment = await cancelAllocationService.assignSeatById(allocation.id, seatId);
      if (!assignment.success) {
        return reply.status(assignment.reason === 'already_expired' ? 401 : 409).send({
          success: false,
          reason: assignment.reason,
          status: assignment.status,
          message: assignment.reason === 'seat_mismatch'
            ? '이미 다른 좌석을 선택한 취소표 할당입니다.'
            : assignment.message || '취소표 좌석을 배정할 수 없습니다.',
        });
      }
      allocation = assignment.allocation || allocation;
      claimedByRequest = !assignment.idempotent;
    }

    const holdDuration = allocation.expiresAt
      ? Math.max(60, Math.floor((new Date(allocation.expiresAt).getTime() - Date.now()) / 1000))
      : undefined;

    let result;
    try {
      result = await seatService.holdSeat(
        userId,
        seatId,
        admissionToken,
        context,
        { cancelLink: isCancelLinkSession, holdDuration },
      );
    } catch (err) {
      if (claimedByRequest) {
        await cancelAllocationService.clearSeatAssignmentById(allocation.id, seatId).catch(() => {});
      }
      throw err;
    }
    if (!result.success && claimedByRequest) {
      await cancelAllocationService.clearSeatAssignmentById(allocation.id, seatId).catch(() => {});
    }
    const statusCode = result.success ? 200 : result.reason === 'expired' || result.reason === 'no_token' ? 401 : 409;
    return reply.status(statusCode).send({ ...result, allocation });
  });

  // 브라우저가 제한시간 만료를 감지했을 때 할당을 만료시키고 선점을 해제한다.
  // 같은 요청이 여러 번 도착해도 동일 allocation_id의 terminal 상태를 성공으로 반환한다.
  // 다음 사용자에게 넘기는 작업은 B파트 파이프라인이 담당한다.
  fastify.post('/cancel-queue/expire', userAuth, async (request, reply) => {
    const body = request.body || {};
    const { userId, eventId, seatId } = body;
    const isManualPass = body.reason === 'manual';
    const requestedAllocationId = getRequestedAllocationId(body);
    if (!userId || !eventId) {
      return reply.status(400).send({ error: 'userId와 eventId는 필수입니다.' });
    }

    const resolved = await resolveAllocation(userId, eventId, requestedAllocationId);
    if (resolved.reason === 'mismatch') {
      return reply.status(403).send({ success: false, reason: 'allocation_mismatch', message: '취소표 할당 정보가 본인 요청과 일치하지 않습니다.' });
    }
    if (!resolved.allocation) {
      return reply.status(409).send({ success: false, reason: 'not_found', message: '활성화된 취소표 할당이 없습니다.' });
    }

    const allocation = resolved.allocation;
    if (seatId && allocation.seatId && allocation.seatId !== seatId) {
      return reply.status(409).send({ success: false, reason: 'seat_mismatch', message: '취소표 할당의 좌석과 요청한 좌석이 다릅니다.' });
    }
    if (allocation.status === 'EXPIRED') {
      const passResult = isManualPass ? await completeManualPass(allocation) : null;
      return reply.send({
        success: true,
        idempotent: true,
        alreadyProcessed: true,
        allocationId: allocation.id,
        status: isManualPass ? 'PASSED' : allocation.status,
        ...passResult,
        message: isManualPass
          ? '이미 종료된 취소표 순번을 양도 이력에 반영했습니다.'
          : '이미 만료 처리된 취소표 할당입니다.',
      });
    }
    if (allocation.status === 'RESPONDED' || allocation.status === 'COMPLETED') {
      return reply.status(409).send({
        success: false,
        reason: 'already_completed',
        allocationId: allocation.id,
        status: allocation.status,
        message: '이미 완료된 취소표 할당은 만료 처리할 수 없습니다.',
      });
    }
    if (allocation.status !== 'LINK_SENT') {
      return reply.status(409).send({ success: false, reason: 'invalid_status', status: allocation.status, message: '처리할 수 없는 취소표 할당 상태입니다.' });
    }

    if (bCallback.isConfigured()) {
      const payload = { userId, eventId, seatId: seatId || allocation.seatId, allocationId: allocation.id };
      try {
        await bCallback.callbackExpire(payload);
        const effectiveSeatId = seatId || allocation.seatId;
        if (effectiveSeatId) {
          await seatService.releaseSeat(userId, effectiveSeatId).catch((err) => {
            console.error('[CancelQueue] B callback 후 만료 좌석 해제 실패:', err.message);
          });
        }
        // B가 같은 MariaDB를 갱신하는 경우에는 idempotent=true가 되고,
        // B가 별도 상태 저장소만 갱신하는 경우에는 A도 동일 allocation을 마감한다.
        const stateResult = await cancelAllocationService.markExpiredById(allocation.id);
        if (!stateResult.affected && !stateResult.idempotent) {
          return reply.status(502).send({ success: false, reason: 'local_state_sync_failed', message: 'B파트 처리 후 A파트 할당 상태 동기화에 실패했습니다.' });
        }
        const passResult = isManualPass ? await completeManualPass(allocation) : null;
        return reply.send({
          success: true,
          idempotent: !!stateResult.idempotent,
          alreadyProcessed: !!stateResult.idempotent,
          allocationId: allocation.id,
          status: isManualPass ? 'PASSED' : (stateResult.status || 'EXPIRED'),
          ...passResult,
          message: isManualPass
            ? '취소표 순번을 다음 대기자에게 넘기고, 취소·환불내역에 기록했습니다.'
            : (stateResult.idempotent
              ? '이미 만료 처리된 취소표 할당입니다.'
              : '취소표 만료가 B파트 파이프라인으로 전달되었습니다.'),
        });
      } catch (err) {
        console.error('[CancelQueue] B callback /expire 실패 → 재시도 큐 저장:', err.message);
        await bCallback.saveCallbackToOutbox('expire', payload, err.message);
        return reply.status(202).send({ success: true, queued: true, idempotent: false, allocationId: allocation.id, message: '콜백 전달에 실패하여 재시도 큐에 저장되었습니다.' });
      }
    }

    const result = await cancelAllocationService.expireAllocation(userId, eventId, seatId, getQueueContext(request, eventId));
    if (result.success && isManualPass) {
      const passResult = await completeManualPass(result.expired || allocation);
      return reply.send({
        ...result,
        status: 'PASSED',
        ...passResult,
        message: '취소표 순번을 다음 대기자에게 넘기고, 취소·환불내역에 기록했습니다.',
      });
    }
    return reply.status(result.success ? 200 : 409).send(result);
  });

  // 결제가 없는 수동 양도 내역도 마이페이지의 취소·환불내역에서 확인한다.
  // 일반 로그인 세션만 허용해 Secret Link 범위 토큰으로 타인의 이력을 읽지 못하게 한다.
  fastify.get('/cancel-queue/history/mine', { preHandler: [authenticate] }, async (request, reply) => {
    const rows = await pool.query(
      `SELECT h.history_id, h.allocation_id, h.event_id, h.session_date, h.session_time,
              h.seat_id, h.action, h.reason, h.created_at
       FROM cancel_queue_history h
       WHERE h.user_id = ? AND h.action = 'PASSED'
       ORDER BY h.created_at DESC`,
      [request.authUser.userId],
    );
    return reply.send({
      history: rows.map((row) => ({
        historyId: row.history_id,
        allocationId: row.allocation_id,
        eventId: row.event_id,
        eventName: '',
        venue: '',
        sessionDate: row.session_date || '',
        sessionTime: row.session_time || '',
        seatId: row.seat_id || null,
        action: row.action,
        reason: row.reason || 'manual',
        createdAt: toIso(row.created_at),
      })),
    });
  });

  // 결제 완료 콜백도 중복 호출을 허용한다. 이미 RESPONDED/COMPLETED이면
  // B파트를 다시 호출하지 않고 성공 응답을 반환한다.
  fastify.post('/cancel-queue/respond', userAuth, async (request, reply) => {
    const body = request.body || {};
    const { userId, eventId, seatId } = body;
    const requestedAllocationId = getRequestedAllocationId(body);
    if (!userId || !eventId || !seatId) {
      return reply.status(400).send({ error: 'userId, eventId, seatId는 필수입니다.' });
    }

    const resolved = await resolveAllocation(userId, eventId, requestedAllocationId);
    if (resolved.reason === 'mismatch') {
      return reply.status(403).send({ success: false, reason: 'allocation_mismatch', message: '취소표 할당 정보가 본인 요청과 일치하지 않습니다.' });
    }
    if (!resolved.allocation) {
      return reply.status(409).send({ success: false, reason: 'not_found', message: '활성화된 취소표 할당이 없습니다.' });
    }

    const allocation = resolved.allocation;
    if (allocation.seatId && allocation.seatId !== seatId) {
      return reply.status(409).send({ success: false, reason: 'seat_mismatch', message: '취소표 할당의 좌석과 요청한 좌석이 다릅니다.' });
    }
    if (allocation.status === 'RESPONDED' || allocation.status === 'COMPLETED') {
      return reply.send({
        success: true,
        idempotent: true,
        alreadyProcessed: true,
        allocationId: allocation.id,
        status: allocation.status,
        message: '이미 완료 처리된 취소표 할당입니다.',
      });
    }
    if (allocation.status === 'EXPIRED' || isPastExpiry(allocation)) {
      return reply.status(409).send({ success: false, reason: 'already_expired', allocationId: allocation.id, status: allocation.status, message: '이미 만료된 취소표 할당입니다.' });
    }
    if (allocation.status !== 'LINK_SENT') {
      return reply.status(409).send({ success: false, reason: 'invalid_status', status: allocation.status, message: '처리할 수 없는 취소표 할당 상태입니다.' });
    }

    if (bCallback.isConfigured()) {
      const payload = { userId, eventId, seatId, allocationId: allocation.id };
      try {
        await bCallback.callbackComplete(payload);
        // B가 공유 DB를 먼저 바꿔도, A가 별도 DB를 사용해도 같은 결과가 되도록
        // allocation_id 기준으로 A 상태도 동기화한다.
        const stateResult = await cancelAllocationService.markRespondedById(allocation.id, seatId);
        if (!stateResult.affected && !stateResult.idempotent) {
          return reply.status(502).send({ success: false, reason: 'local_state_sync_failed', message: 'B파트 처리 후 A파트 할당 상태 동기화에 실패했습니다.' });
        }
        return reply.send({
          success: true,
          idempotent: !!stateResult.idempotent,
          alreadyProcessed: !!stateResult.idempotent,
          allocationId: allocation.id,
          status: stateResult.status || 'RESPONDED',
          message: stateResult.idempotent
            ? '이미 완료 처리된 취소표 할당입니다.'
            : '좌석 확정이 B파트 파이프라인으로 전달되었습니다.',
        });
      } catch (err) {
        console.error('[CancelQueue] B callback /complete 실패 → 재시도 큐 저장:', err.message);
        await bCallback.saveCallbackToOutbox('complete', payload, err.message);
        return reply.status(202).send({ success: true, queued: true, idempotent: false, allocationId: allocation.id, message: '콜백 전달에 실패하여 재시도 큐에 저장되었습니다.' });
      }
    }

    const result = await cancelAllocationService.markRespondedById(allocation.id, seatId);
    return reply.status(result.affected > 0 || result.idempotent ? 200 : 409).send({ success: result.affected > 0 || result.idempotent, ...result });
  });

  // 취소표 화면의 Pool 수치를 임의 생성하지 않고 현재 Redis 좌석 상태로 계산한다.
  fastify.get('/cancel-queue/pool/:eventId', async (request, reply) => {
    const { eventId } = request.params;
    const seats = await seatService.getAllSeats(eventId, getQueueContext(request, eventId));
    const sections = {};
    for (const seat of seats) {
      const section = seat.section || '기타';
      if (!sections[section]) sections[section] = { available: 0, held: 0, sold: 0 };
      if (seat.status === 'AVAILABLE') sections[section].available += 1;
      else if (seat.status === 'HELD') sections[section].held += 1;
      else if (seat.status === 'SOLD') sections[section].sold += 1;
    }
    return reply.send({
      eventId,
      total: seats.length,
      available: seats.filter((seat) => seat.status === 'AVAILABLE').length,
      held: seats.filter((seat) => seat.status === 'HELD').length,
      sold: seats.filter((seat) => seat.status === 'SOLD').length,
      sections,
    });
  });

  fastify.post('/cancel-queue/expire-overdue', adminAuth, async (request, reply) => {
    const result = await cancelAllocationService.expireAllOverdue();
    return reply.send(result);
  });

  fastify.get('/cancel-queue/history/:eventId', adminAuth, async (request, reply) => {
    const { eventId } = request.params;
    const history = await cancelAllocationService.getAllocationHistory(eventId);
    return reply.send({ allocations: history, count: history.length });
  });

  fastify.post('/verify-link', async (request, reply) => {
    const { token } = request.body || {};
    if (!token) {
      return reply.status(400).send({ valid: false, reason: 'missing', message: 'token은 필수입니다.' });
    }

    // 로컬 SMTP 시뮬레이션에서 A가 발급한 토큰은 B파트로 보내지 않는다.
    // B 연동이 설정되어 있어도 먼저 A 토큰을 검증하고, 유효하지 않은 경우에만
    // B파트 토큰 검증으로 넘겨 온프레미스와 운영 흐름을 함께 지원한다.
    let verificationSource = 'local';
    let result = verifyCancelLinkToken(token);
    if (!result.valid && bCallback.isConfigured()) {
      try {
        const bResult = await bCallback.callbackVerifyLink(token);
        const source = bResult && typeof bResult === 'object'
          ? (bResult.data && typeof bResult.data === 'object' ? bResult.data : bResult)
          : {};
        const pick = (...keys) => keys.map((key) => source[key]).find((value) => value !== undefined && value !== null && value !== '');
        result = {
          // B파트 ALB 검증 Lambda는 기존 계약의 valid 외에 success: true를
          // 성공 신호로 반환한다. 둘 중 하나만 명시적으로 true일 때만
          // 통과시켜 실패 응답이나 임의 truthy 값을 성공으로 오인하지 않는다.
          valid: source.valid === true || source.success === true,
          reason: source.reason || '',
          message: source.message || '',
          allocationId: pick('allocationId', 'allocation_id') ? String(pick('allocationId', 'allocation_id')) : '',
          userId: pick('userId', 'user_id'),
          eventId: pick('eventId', 'event_id') || '',
          seatId: pick('seatId', 'seat_id') || '',
          expiresAt: pick('expiresAt', 'expires_at') || '',
        };
        verificationSource = 'b';
      } catch (err) {
        console.error('[CancelQueue] B callback /b-callback/verify-link 실패:', err.message);
        const upstreamStatus = Number(err.status);
        const statusCode = upstreamStatus === 401 || upstreamStatus === 410 ? upstreamStatus : 502;
        return reply.status(statusCode).send({
          valid: false,
          reason: upstreamStatus === 410 || err.reason === 'expired' ? 'expired' : 'verification_unavailable',
          message: statusCode === 502
            ? '취소표 링크 검증 서버에 연결할 수 없습니다.'
            : '취소표 링크가 유효하지 않거나 만료되었습니다.',
        });
      }
    }

    if (!result.valid) {
      return reply.status(result.reason === 'expired' ? 410 : 401).send({
        valid: false,
        reason: result.reason || 'invalid',
        message: result.message || (result.reason === 'expired'
          ? '취소표 링크가 만료되었습니다.'
          : '취소표 링크가 유효하지 않습니다.'),
      });
    }

    if (!result.userId || !result.eventId || !result.allocationId) {
      console.error('[CancelQueue] B verify-link 응답 필수 식별자 누락');
      return reply.status(502).send({
        valid: false,
        reason: 'verification_response_invalid',
        message: '취소표 링크 검증 응답 형식이 올바르지 않습니다.',
      });
    }

    const allocation = await cancelAllocationService.getActiveAllocation(result.userId, result.eventId);
    if (!allocation) {
      return reply.status(410).send({ valid: false, reason: 'expired', message: '할당이 만료되었거나 존재하지 않습니다.' });
    }

    if (String(allocation.id) !== String(result.allocationId)) {
      console.error('[CancelQueue] B verify-link allocation 불일치');
      return reply.status(403).send({ valid: false, reason: 'allocation_mismatch', message: '취소표 할당 정보를 확인할 수 없습니다.' });
    }

    const dbExpiresAtMs = new Date(allocation.expiresAt).getTime();
    const bExpiresAtMs = result.expiresAt ? new Date(result.expiresAt).getTime() : NaN;
    const effectiveExpiresAtMs = Number.isFinite(bExpiresAtMs)
      ? Math.min(dbExpiresAtMs, bExpiresAtMs)
      : dbExpiresAtMs;
    const remainingSeconds = Math.max(0, Math.floor((effectiveExpiresAtMs - Date.now()) / 1000));
    if (remainingSeconds <= 0) {
      return reply.status(410).send({ valid: false, reason: 'expired', message: '취소표 링크가 만료되었습니다.' });
    }

    const availableSeats = allocation.seatId
      ? [allocation.seatId]
      : (await seatService.getAllSeats(result.eventId, {
          eventId: result.eventId,
          sessionDate: allocation.sessionDate,
          sessionTime: allocation.sessionTime,
        })).filter(s => s.status === 'AVAILABLE').map(s => s.seatId);

    const scopedToken = issueScopedCancelToken(
      allocation.userId,
      allocation.eventId,
      allocation.id,
      remainingSeconds,
    );

    return reply.send({
      valid: true,
      userId: allocation.userId,
      eventId: allocation.eventId,
      allocationId: allocation.id,
      seatId: allocation.seatId || null,
      availableSeats,
      sessionDate: allocation.sessionDate,
      sessionTime: allocation.sessionTime,
      expiresAt: new Date(effectiveExpiresAtMs).toISOString(),
      remainingSeconds,
      accessToken: scopedToken,
      // 화면만 검증 주체에 맞게 나눈다. local SMTP 링크는 기존 화면을,
      // B 링크는 Last 스타일 통합 화면을 사용하며 API 책임은 그대로 유지한다.
      source: verificationSource,
    });
  });
}

module.exports = cancelQueueRoutes;
