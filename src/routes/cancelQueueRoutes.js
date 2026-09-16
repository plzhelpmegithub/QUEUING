const cancelAllocationService = require('../services/cancelAllocationService');
const pool = require('../config/mariadb');
const redis = require('../config/redis');
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

async function cancelQueueRoutes(fastify) {

  fastify.post('/cancel-queue/join', userAuth, async (request, reply) => {
    if (!await guardRecaptcha(request, reply, 'cancel_queue_join')) return;
    const { userId } = request.body || {};
    if (!userId) {
      return reply.status(400).send({ error: 'userId는 필수입니다.' });
    }
    const context = getQueueContext(request);
    const result = await queueService.enterStandby(userId, context);
    return reply.status(result.status === 'closed' ? 409 : 200).send(result);
  });

  fastify.get('/cancel-queue/status/:eventId/:userId', userAuth, async (request, reply) => {
    const { eventId } = request.params;
    const userId = request.query.userId || request.params.userId;
    const context = getQueueContext(request, eventId);

    const [position, membership, allocation] = await Promise.all([
      queueService.getPosition(userId, context),
      membershipService.getMembership(userId),
      cancelAllocationService.getActiveAllocation(userId, eventId),
    ]);

    return reply.send({
      eventId,
      userId,
      queue: position,
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
    const rows = await pool.query(
      `SELECT w.id, w.event_id, w.session_date, w.session_time, w.queue_index,
              w.status, w.created_at,
              e.event_name, e.title, e.event_date, e.venue, e.status AS event_status,
              a.allocation_id, a.seat_id AS allocation_seat_id, a.expires_at AS allocation_expires_at
       FROM waiting_queue w
       LEFT JOIN events e ON e.event_id = w.event_id
       LEFT JOIN cancel_allocations a
         ON a.user_id = w.user_id
        AND a.event_id = w.event_id
        AND a.session_date = w.session_date
        AND a.session_time = w.session_time
        AND a.status = 'LINK_SENT'
        AND (a.expires_at IS NULL OR a.expires_at > UTC_TIMESTAMP())
       WHERE w.user_id = ?
         AND w.queue_type = 'standby'
         AND (w.status = 'WAITING' OR a.allocation_id IS NOT NULL)
       ORDER BY w.created_at DESC, w.id DESC`,
      [userId],
    );

    const queues = await Promise.all(rows.map(async (row) => {
      const context = {
        eventId: row.event_id,
        sessionDate: row.session_date || '',
        sessionTime: row.session_time || '',
      };
      const keys = queueService.queueKeys(context);
      let position = Number(row.queue_index || 0);
      let total = 0;

      try {
        const [rank, totalStandby] = await Promise.all([
          redis.zrank(keys.standbyKey, userId),
          redis.zcard(keys.standbyKey),
        ]);
        if (rank !== null) position = rank + 1;
        total = totalStandby;
      } catch (err) {
        console.warn(`[CancelQueue] 마이페이지 순번 Redis 보정 실패 (${row.event_id}):`, err.message);
      }

      return {
        queueId: row.id,
        eventId: row.event_id,
        eventName: row.event_name || row.title || row.event_id,
        eventDate: row.event_date || '',
        venue: row.venue || '',
        eventStatus: row.event_status || '',
        sessionDate: row.session_date || '',
        sessionTime: row.session_time || '',
        queueType: 'standby',
        queueStatus: row.status,
        myNumber: position > 0 ? position : null,
        total,
        joinedAt: toIso(row.created_at),
        allocation: row.allocation_id ? {
          active: true,
          allocationId: row.allocation_id,
          seatId: row.allocation_seat_id || null,
          expiresAt: toIso(row.allocation_expires_at),
        } : null,
        status: row.allocation_id ? 'allocated' : row.status,
      };
    }));

    return reply.send({ userId, queues, count: queues.length });
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

  // Secret Link 보유자만 배정된 좌석을 선점할 수 있게 한다.
  fastify.post('/cancel-queue/hold', userAuth, async (request, reply) => {
    if (!await guardRecaptcha(request, reply, 'cancel_seat_hold')) return;
    const { userId, eventId, seatId } = request.body || {};
    if (!userId || !eventId || !seatId) {
      return reply.status(400).send({ error: 'userId, eventId, seatId는 필수입니다.' });
    }

    const allocation = await cancelAllocationService.getActiveAllocation(userId, eventId);
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
    const tokenInfo = await getRawToken(userId, context);
    if (!tokenInfo) {
      return reply.status(401).send({ success: false, reason: 'token_unavailable', message: '취소표 입장 토큰이 만료되었거나 유효하지 않습니다.' });
    }

    const result = await seatService.holdSeat(userId, seatId, tokenInfo.token, context);
    const statusCode = result.success ? 200 : result.reason === 'expired' || result.reason === 'no_token' ? 401 : 409;
    return reply.status(statusCode).send({ ...result, allocation });
  });

  // 브라우저가 제한시간 만료를 감지했을 때 할당을 만료시키고 선점을 해제한다.
  // 같은 요청이 여러 번 도착해도 동일 allocation_id의 terminal 상태를 성공으로 반환한다.
  // 다음 사용자에게 넘기는 작업은 B파트 파이프라인이 담당한다.
  fastify.post('/cancel-queue/expire', userAuth, async (request, reply) => {
    const body = request.body || {};
    const { userId, eventId, seatId } = body;
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
      return reply.send({
        success: true,
        idempotent: true,
        alreadyProcessed: true,
        allocationId: allocation.id,
        status: allocation.status,
        message: '이미 만료 처리된 취소표 할당입니다.',
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
        return reply.send({
          success: true,
          idempotent: !!stateResult.idempotent,
          alreadyProcessed: !!stateResult.idempotent,
          allocationId: allocation.id,
          status: stateResult.status || 'EXPIRED',
          message: stateResult.idempotent
            ? '이미 만료 처리된 취소표 할당입니다.'
            : '취소표 만료가 B파트 파이프라인으로 전달되었습니다.',
        });
      } catch (err) {
        console.error('[CancelQueue] B callback /expire 실패 → 재시도 큐 저장:', err.message);
        await bCallback.saveCallbackToOutbox('expire', payload, err.message);
        return reply.status(202).send({ success: true, queued: true, idempotent: false, allocationId: allocation.id, message: '콜백 전달에 실패하여 재시도 큐에 저장되었습니다.' });
      }
    }

    const result = await cancelAllocationService.expireAllocation(userId, eventId, seatId, getQueueContext(request, eventId));
    return reply.status(result.success ? 200 : 409).send(result);
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

    let result;
    if (bCallback.isConfigured()) {
      try {
        const bResult = await bCallback.callbackVerifyLink(token);
        const source = bResult && typeof bResult === 'object'
          ? (bResult.data && typeof bResult.data === 'object' ? bResult.data : bResult)
          : {};
        const pick = (...keys) => keys.map((key) => source[key]).find((value) => value !== undefined && value !== null && value !== '');
        result = {
          valid: source.valid === true,
          reason: source.reason || '',
          message: source.message || '',
          allocationId: pick('allocationId', 'allocation_id') ? String(pick('allocationId', 'allocation_id')) : '',
          userId: pick('userId', 'user_id'),
          eventId: pick('eventId', 'event_id') || '',
          seatId: pick('seatId', 'seat_id') || '',
          expiresAt: pick('expiresAt', 'expires_at') || '',
        };
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
    } else {
      // 로컬 개발 환경에서만 A파트 자체 JWT 검증을 사용한다.
      result = verifyCancelLinkToken(token);
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
    });
  });
}

module.exports = cancelQueueRoutes;
