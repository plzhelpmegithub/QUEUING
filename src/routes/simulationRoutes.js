const redis = require('../config/redis');
const pool = require('../config/mariadb');
const queueService = require('../services/queueService');
const seatService = require('../services/seatService');
const membershipService = require('../services/membershipService');
const cancelAllocationService = require('../services/cancelAllocationService');
const { issueCancelLinkToken } = require('../services/cancelLinkTokenService');
const { sendEmail, wrapEmailHtml, isSmtpConfigured } = require('../services/notificationService');
const {
  isConfigured: isCancellationEventsConfigured,
  publishCancellationEvent,
} = require('../services/cancellationEventPublisher');
const { normalizeSessionContext, getScopedKey } = require('../services/sessionContext');
const { listEventCards } = require('../services/eventCatalogService');
const { authenticate, requireRole } = require('../middleware/auth');

const EVENT_LIST_KEY = 'events:list';
const SEAT_PREFIX = 'seat:';
const SIM_USER_PREFIX = 'sim-user-';
const SIM_INTEGRATED_USER_PREFIX = 'sim-integrated-user-';
const SIM_MEMBER_PREFIX = 'sim-member-';
const WAIT_MINUTES_PER_PERSON = 5;

function simUserPrefix(mode = 'b') {
  return mode === 'integrated' ? SIM_INTEGRATED_USER_PREFIX : SIM_USER_PREFIX;
}

function simUserId(index, mode = 'b') {
  return `${simUserPrefix(mode)}${String(index).padStart(6, '0')}@test.com`;
}

function simMemberPrefix(mode) {
  return `${SIM_MEMBER_PREFIX}${mode}-`;
}

function simMemberUserId(index, mode) {
  return `${simMemberPrefix(mode)}${String(index).padStart(6, '0')}@test.com`;
}

function isSimulationDummyUserId(userId) {
  const value = String(userId || '').trim();
  return value.startsWith(SIM_USER_PREFIX) ||
    value.startsWith(SIM_INTEGRATED_USER_PREFIX) ||
    value.startsWith(SIM_MEMBER_PREFIX);
}

function getContext(body) {
  return normalizeSessionContext({
    eventId: body.eventId || '',
    sessionDate: body.sessionDate || '',
    sessionTime: body.sessionTime || '',
  });
}

function simulationStateKey(eventId, mode = 'b') {
  if (mode === 'local') return `simulation:local:${eventId}`;
  if (mode === 'integrated') return `simulation:integrated:${eventId}`;
  return `simulation:${eventId}`;
}

function simulationStandbyUsersKey(eventId, mode = 'b') {
  return `${simulationStateKey(eventId, mode)}:standby-users`;
}

function isActualSimulationMember(row) {
  const userId = String(row?.user_id || '').trim();
  return Boolean(
    userId &&
    !isSimulationDummyUserId(userId) &&
    Number(row?.membership_at_join) === 1,
  );
}

async function getCurrentSimulationMemberStandby(context, mode = 'b') {
  const [memberRows, trackedUserIds] = await Promise.all([
    queueService.getActiveStandbyMembers(context),
    redis.smembers(simulationStandbyUsersKey(context.eventId, mode)),
  ]);
  const tracked = new Set(trackedUserIds.map(String));
  // 시뮬레이션 Hash가 존재한 뒤 실제 서비스 경로로 진입한 사용자만
  // 후보로 사용한다. 더미 ID·대기열 진입 당시 비회원·다른 테스트의
  // standby 행이 단계4 링크 발급 대상에 섞이지 않도록 이중 방어한다.
  return memberRows.filter((row) => (
    isActualSimulationMember(row) && tracked.has(String(row.user_id))
  ));
}

const adminAuth = { preHandler: [authenticate, requireRole('admin')] };

async function simulationRoutes(fastify, options = {}) {
  const mode = ['local', 'integrated'].includes(options.mode) ? options.mode : 'b';
  const routeRoot = mode === 'local'
    ? '/admin/local-simulation'
    : (mode === 'integrated' ? '/admin/integrated-simulation' : '/admin/simulation');
  const stateKey = (eventId) => simulationStateKey(eventId, mode);
  const trackedUsersKey = (eventId) => simulationStandbyUsersKey(eventId, mode);
  const route = (suffix) => `${routeRoot}${suffix}`;

  function localFrontendBaseUrl() {
    return String(
      process.env.LOCAL_FRONTEND_BASE_URL ||
      process.env.FRONTEND_BASE_URL ||
      'http://localhost:5173',
    ).replace(/\/+$/, '');
  }

  async function createDummyMembershipAccounts(count) {
    const total = Math.max(0, Number(count) || 0);
    if (total === 0) return { requested: 0, created: 0 };

    const prefix = simMemberPrefix(mode);
    const existingRows = await pool.query(
      `SELECT user_id
       FROM memberships
       WHERE user_id LIKE ?
         AND is_membership = TRUE
         AND expires_at > UTC_TIMESTAMP()`,
      [`${prefix}%`],
    );
    const existingMemberships = new Set(existingRows.map((row) => String(row.user_id)));
    const batchSize = 1000;
    let created = 0;

    for (let offset = 0; offset < total; offset += batchSize) {
      const end = Math.min(offset + batchSize, total);
      const users = [];
      const userParams = [];
      const memberships = [];
      const membershipParams = [];

      for (let index = offset + 1; index <= end; index += 1) {
        const userId = simMemberUserId(index, mode);
        users.push('(?, ?, ?, ?, ?)');
        userParams.push(userId, '', 'user', userId, `더미 멤버십 ${index}`);
        if (!existingMemberships.has(userId)) {
          memberships.push('(?, TRUE, \'monthly\', \'SIMULATION\', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY), 1)');
          membershipParams.push(userId);
        }
      }

      if (users.length) {
        await pool.query(
          `INSERT IGNORE INTO users (user_id, password, role, email, name) VALUES ${users.join(',')}`,
          userParams,
        );
      }
      if (memberships.length) {
        const result = await pool.query(
          `INSERT INTO memberships (user_id, is_membership, plan, tier_name, expires_at, priority_level) VALUES ${memberships.join(',')}`,
          membershipParams,
        );
        created += Number(result.affectedRows) || 0;
      }
    }

    return { requested: total, created };
  }

  async function removeDummyMembershipQueue({
    eventId,
    context,
    deleteAccounts = false,
    limit = 0,
  }) {
    const keys = queueService.queueKeys(context);
    const prefix = simMemberPrefix(mode);
    const standbyUsers = await redis.zrange(keys.standbyKey, 0, -1);
    const allDummyUserIds = standbyUsers.filter((userId) => String(userId).startsWith(prefix));
    const dummyUserIds = limit > 0 ? allDummyUserIds.slice(0, limit) : allDummyUserIds;

    if (dummyUserIds.length) {
      const pipeline = redis.pipeline();
      dummyUserIds.forEach((userId) => pipeline.zrem(keys.standbyKey, userId));
      await pipeline.exec();
    }

    let removedFromDatabase = 0;
    if (dummyUserIds.length) {
      const placeholders = dummyUserIds.map(() => '?').join(',');
      const queueResult = await pool.query(
        `DELETE FROM waiting_queue
         WHERE event_id = ?
           AND session_date = ?
           AND session_time = ?
           AND user_id IN (${placeholders})`,
        [eventId, context.sessionDate, context.sessionTime, ...dummyUserIds],
      );
      removedFromDatabase = Number(queueResult.affectedRows) || 0;
    }

    if (deleteAccounts && dummyUserIds.length) {
      const placeholders = dummyUserIds.map(() => '?').join(',');
      await pool.query(`DELETE FROM memberships WHERE user_id IN (${placeholders})`, dummyUserIds);
      await pool.query(`DELETE FROM users WHERE user_id IN (${placeholders})`, dummyUserIds);
    }

    return {
      removedFromRedis: dummyUserIds.length,
      removedFromDatabase,
      remaining: Math.max(0, allDummyUserIds.length - dummyUserIds.length),
    };
  }

  async function removeStandardDummyQueue({ eventId, context }) {
    const keys = queueService.queueKeys(context);
    const standbyUsers = await redis.zrange(keys.standbyKey, 0, -1);
    const allDummyUserIds = standbyUsers.filter((userId) => String(userId).startsWith(simUserPrefix(mode)));
    const dummyUserIds = allDummyUserIds;
    if (dummyUserIds.length) {
      const pipeline = redis.pipeline();
      dummyUserIds.forEach((userId) => pipeline.zrem(keys.standbyKey, userId));
      await pipeline.exec();
    }
    let removedFromDatabase = 0;
    if (dummyUserIds.length) {
      const placeholders = dummyUserIds.map(() => '?').join(',');
      const queueResult = await pool.query(
        `DELETE FROM waiting_queue
         WHERE event_id = ?
           AND session_date = ?
           AND session_time = ?
           AND user_id IN (${placeholders})`,
        [eventId, context.sessionDate, context.sessionTime, ...dummyUserIds],
      );
      removedFromDatabase = Number(queueResult.affectedRows) || 0;
    }
    return {
      removedFromRedis: dummyUserIds.length,
      removedFromDatabase,
      remaining: Math.max(0, allDummyUserIds.length - dummyUserIds.length),
    };
  }

  async function issueLocalSmtpLink({ eventId, context, simData }) {
    if (!isSmtpConfigured()) {
      return {
        statusCode: 503,
        body: {
          success: false,
          code: 'local_smtp_not_configured',
          message: '로컬 SMTP가 설정되지 않았습니다. SMTP_USER와 SMTP_PASS를 API 서버에 설정해주세요.',
        },
      };
    }
    if (String(process.env.JWT_SECRET || '').trim().length < 32) {
      return {
        statusCode: 503,
        body: {
          success: false,
          code: 'jwt_secret_not_configured',
          message: '로컬 Secret Link 발급을 위해 32자 이상의 JWT_SECRET이 필요합니다.',
        },
      };
    }

    let memberStandbyRows;
    try {
      memberStandbyRows = await getCurrentSimulationMemberStandby(context, mode);
    } catch (err) {
      console.error('[LocalSimulation] 멤버십 standby 집계 실패:', err.message);
      return {
        statusCode: 500,
        body: { success: false, code: 'standby_lookup_failed', message: '멤버십 취소표 대기열을 조회하지 못했습니다.' },
      };
    }

    const targetStandby = memberStandbyRows[0];
    if (!targetStandby) {
      return {
        statusCode: 400,
        body: {
          success: false,
          code: 'membership_required',
          message: '현재 회차에 직접 진입한 활성 멤버십 standby 대기자가 없습니다. 실제 멤버십 계정으로 먼저 취소표 대기열에 진입해주세요.',
        },
      };
    }

    let preparedEvents = [];
    try {
      preparedEvents = JSON.parse(simData.cancellationEvents || '[]');
    } catch (_) {
      preparedEvents = [];
    }
    const cancelledSeats = preparedEvents.filter((event) => event && event.seat_id);
    if (!cancelledSeats.length) {
      return {
        statusCode: 400,
        body: { success: false, code: 'no_cancelled_seats', message: '먼저 단계3에서 취소표를 생성해주세요.' },
      };
    }

    // 같은 단계4를 다시 눌러도 이미 발급된 좌석은 재발송하지 않는다.
    // EXPIRED 할당만 다음 대기자에게 재사용할 수 있다.
    let allocationHistory = [];
    try {
      allocationHistory = await cancelAllocationService.getAllocationHistory(eventId);
    } catch (err) {
      console.warn('[LocalSimulation] 기존 취소표 할당 조회 실패:', err.message);
    }
    const sameSession = (allocation) => (
      String(allocation.sessionDate || '') === String(context.sessionDate || '') &&
      String(allocation.sessionTime || '') === String(context.sessionTime || '')
    );
    const isUnexpiredAllocation = (allocation) => {
      if (allocation.status === 'EXPIRED') return false;
      if (allocation.status !== 'LINK_SENT' || !allocation.expiresAt) return true;
      const expiresAtMs = new Date(allocation.expiresAt).getTime();
      return !Number.isFinite(expiresAtMs) || expiresAtMs > Date.now();
    };
    const reusableSeatIds = new Set(
      allocationHistory
        .filter((allocation) => sameSession(allocation) && isUnexpiredAllocation(allocation))
        .map((allocation) => String(allocation.seatId || ''))
        .filter(Boolean),
    );
    const activeUserIds = new Set(
      allocationHistory
        .filter((allocation) => sameSession(allocation) && allocation.status === 'LINK_SENT' && isUnexpiredAllocation(allocation))
        .map((allocation) => String(allocation.userId || ''))
        .filter(Boolean),
    );
    const availableCancelledSeats = cancelledSeats.filter(
      (event) => !reusableSeatIds.has(String(event.seat_id)),
    );
    const availableStandbyRows = memberStandbyRows.filter(
      (row) => !activeUserIds.has(String(row.user_id)),
    );
    const pairCount = Math.min(availableCancelledSeats.length, availableStandbyRows.length);

    if (pairCount === 0) {
      const existingUser = memberStandbyRows.find((row) => activeUserIds.has(String(row.user_id)));
      const existingAllocation = existingUser
        ? await cancelAllocationService.getActiveAllocation(String(existingUser.user_id), eventId)
        : null;
      return {
        statusCode: 200,
        body: {
          success: true,
          local: true,
          idempotent: true,
          targetUserId: existingUser ? String(existingUser.user_id) : '',
          targetUserEmail: existingUser ? String(existingUser.user_id) : '',
          allocation: existingAllocation,
          allocations: existingAllocation ? [existingAllocation] : [],
          linksSent: 0,
          emailSent: false,
          message: '준비된 취소 좌석은 모두 이미 링크가 발급되었습니다. 기존 링크를 확인해주세요.',
        },
      };
    }

    const cardStr = await redis.hget(EVENT_LIST_KEY, eventId);
    let eventName = eventId;
    let venue = '';
    if (cardStr) {
      try {
        const card = JSON.parse(cardStr);
        eventName = card.eventName || eventName;
        venue = card.venue || venue;
      } catch (_) {}
    }

    const results = [];
    for (let index = 0; index < pairCount; index += 1) {
      const cancelledSeat = availableCancelledSeats[index];
      const targetStandbyRow = availableStandbyRows[index];
      const targetUserId = String(targetStandbyRow.user_id);
      let targetUserEmail = targetUserId;
      let targetUserName = targetUserId.split('@')[0];
      try {
        const userRows = await pool.query(
          'SELECT email, name FROM users WHERE user_id = ? OR email = ? LIMIT 1',
          [targetUserId, targetUserId],
        );
        targetUserEmail = userRows[0]?.email || targetUserEmail;
        targetUserName = userRows[0]?.name || targetUserName;
      } catch (err) {
        console.warn('[LocalSimulation] 대상 사용자 이메일 조회 실패:', err.message);
      }

      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      try {
        const allocation = await cancelAllocationService.createAllocation({
          userId: targetUserId,
          seatId: cancelledSeat.seat_id,
          eventId,
          sessionDate: context.sessionDate,
          sessionTime: context.sessionTime,
          holdDuration: 300,
          expiresAt,
        });
        if (!allocation) throw new Error('취소표 할당 생성 결과가 없습니다.');

        const token = issueCancelLinkToken(allocation, expiresAt);
        if (!token) {
          await cancelAllocationService.markExpiredById(allocation.id).catch(() => {});
          throw new Error('로컬 Secret Link 토큰을 발급하지 못했습니다.');
        }

        // Local Gmail 링크도 Last 전용 화면으로 진입시킨다.
        // A파트가 서버에서 발급한 토큰·배정 좌석 규칙은 그대로 유지하고,
        // 화면과 좌석맵만 Last 화면으로 통일한다.
        const link = `${localFrontendBaseUrl()}/#/last-cancel-ticketing?token=${encodeURIComponent(token)}&source=local-simulation`;
        const emailResult = await sendEmail(
          targetUserEmail,
          `[QUEUING][Local] ${eventName} 취소표 Secret Link 발급`,
          wrapEmailHtml({
            title: '취소표 Secret Link 발급',
            subtitle: '취소표 예매 순서가 되었습니다',
            contentHtml: `
              <p style="margin:0 0 16px; font-size:16px; color:#18181b; line-height:1.6;">
                안녕하세요, <strong>${targetUserName}</strong>님.<br>
                취소표 예매 링크가 발급되었습니다.
              </p>
              <div style="background-color:#f9fafb; border-radius:8px; padding:16px; margin:20px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; font-size:14px; color:#374151;">
                  <tr><td style="padding:4px 0;"><strong>공연명</strong></td><td style="padding:4px 0;">${eventName}</td></tr>
                  <tr><td style="padding:4px 0;"><strong>공연장</strong></td><td style="padding:4px 0;">${venue || '미정'}</td></tr>
                  <tr><td style="padding:4px 0;"><strong>공연 일시</strong></td><td style="padding:4px 0;">${context.sessionDate || '미정'} ${context.sessionTime || ''}</td></tr>
                  <tr><td style="padding:4px 0;"><strong>배정 좌석</strong></td><td style="padding:4px 0;">${String(cancelledSeat.seat_id).split(':').pop()}</td></tr>
                </table>
              </div>
              <div style="background-color:#FEF2F2; border:1px solid #FCA5A5; border-radius:8px; padding:14px 16px; margin:20px 0;">
                <span style="color:#B91C1C; font-size:14px; font-weight:600;">⏱ 이 링크는 5분간만 유효합니다</span>
                <div style="color:#7F1D1D; font-size:13px; margin-top:4px;">시간 내 선택하지 않으시면 다음 대기자에게 기회가 넘어갑니다.</div>
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td style="border-radius:8px; background-color:#E11D2E;">
                    <a href="${link}"
                       style="display:inline-block; padding:14px 32px; color:#ffffff; font-size:16px;
                              font-weight:700; text-decoration:none; border-radius:8px;">
                      취소표 예매 입장하기
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0; font-size:12px; color:#a1a1aa; word-break:break-all;">
                버튼이 눌리지 않는다면 아래 링크를 복사해 브라우저에 붙여넣어주세요.<br>${link}
              </p>`,
          }),
        );

        if (!emailResult.success) {
          await cancelAllocationService.markExpiredById(allocation.id).catch(() => {});
          throw new Error(emailResult.error || 'Gmail SMTP 메일 발송에 실패했습니다.');
        }
        results.push({
          success: true,
          targetUserId,
          targetUserEmail,
          allocation,
          emailSent: true,
          expiresAt: allocation.expiresAt,
        });
      } catch (err) {
        results.push({
          success: false,
          targetUserId,
          targetUserEmail,
          seatId: cancelledSeat.seat_id,
          error: err.message,
        });
      }
    }

    const sentResults = results.filter((result) => result.success);
    const failedResults = results.filter((result) => !result.success);
    const firstSent = sentResults[0];
    const requestedAt = new Date().toISOString();
    await redis.hset(stateKey(eventId), {
      stage: 'link_requested',
      localDelivery: 'smtp',
      linksRequestedAt: requestedAt,
      targetUserId: firstSent?.targetUserId || targetStandby.user_id,
      targetUserEmail: firstSent?.targetUserEmail || targetStandby.user_id,
      targetQueueId: String(memberStandbyRows.find((row) => String(row.user_id) === String(firstSent?.targetUserId))?.queue_id || targetStandby.queue_id || ''),
      candidateCount: String(memberStandbyRows.length),
      candidateQueueIds: memberStandbyRows.map((row) => String(row.queue_id || '')).filter(Boolean).join(','),
      localEmailSent: String(sentResults.length),
      cancellationEventsPublished: String(sentResults.length),
      cancellationEventsOutboxed: '0',
      cancellationEventsFailed: String(failedResults.length),
    });

    if (!sentResults.length) {
      return {
        statusCode: 502,
        body: {
          success: false,
          code: 'local_smtp_send_failed',
          results,
          message: `Gmail SMTP 링크 발급에 실패했습니다: ${failedResults[0]?.error || '알 수 없는 오류'}`,
        },
      };
    }

    return {
      statusCode: 200,
      body: {
        success: true,
        local: true,
        delivery: 'smtp',
        idempotent: false,
        targetUserId: firstSent.targetUserId,
        targetUserEmail: firstSent.targetUserEmail,
        allocation: firstSent.allocation,
        allocations: sentResults.map((result) => result.allocation),
        results,
        emailSent: true,
        linksSent: sentResults.length,
        eventsPublished: sentResults.length,
        eventsFailed: failedResults.length,
        expiresAt: firstSent.expiresAt,
        message: `Gmail SMTP로 ${sentResults.length}명의 멤버십 대기자에게 5분 제한 Secret Link를 발송했습니다.`,
      },
    };
  }

  fastify.get(route('/events'), adminAuth, async (request, reply) => {
    const list = await listEventCards();
    return reply.send({ events: list });
  });

  fastify.post(route('/init'), adminAuth, async (request, reply) => {
    const {
      eventId,
      sessionDate,
      sessionTime,
      dummyCount = 10000,
      memberDummyCount = 0,
    } = request.body || {};
    if (!eventId) return reply.status(400).send({ error: 'eventId는 필수입니다.' });

    const total = Math.min(parseInt(dummyCount, 10) || 10000, 50000);
    const memberTotal = Math.min(Math.max(parseInt(memberDummyCount, 10) || 0, 0), 50000);
    const context = getContext(request.body);

    const cardStr = await redis.hget(EVENT_LIST_KEY, eventId);
    if (!cardStr) return reply.status(404).send({ error: '해당 이벤트를 찾을 수 없습니다.' });
    const card = JSON.parse(cardStr);
    const totalSeats = card.totalSeats || 0;

    const BATCH = 2000;
    for (let i = 0; i < total; i += BATCH) {
      const values = [];
      const params = [];
      const batchEnd = Math.min(i + BATCH, total);
      for (let j = i; j < batchEnd; j++) {
        values.push('(?, ?, ?, ?, ?)');
        params.push(simUserId(j + 1, mode), '', 'user', `${simUserId(j + 1, mode)}`, `더미${j + 1}`);
      }
      try {
        await pool.query(
          `INSERT IGNORE INTO users (user_id, password, role, email, name) VALUES ${values.join(',')}`,
          params,
        );
      } catch (e) {
        console.error('[Simulation] 더미 유저 생성 오류:', e.message);
      }
    }

    let memberAccounts;
    try {
      memberAccounts = await createDummyMembershipAccounts(memberTotal);
    } catch (e) {
      console.error('[Simulation] 더미 멤버십 유저 생성 오류:', e.message);
      return reply.status(500).send({
        error: '더미 멤버십 유저를 준비하지 못했습니다.',
      });
    }

    const simulationKey = stateKey(eventId);
    // 이전 버전에서 저장한 지정 사용자 정보가 남아 있으면 새 시뮬레이션이
    // 그 계정을 자동으로 등록·우선 처리하는 것처럼 보일 수 있으므로 제거한다.
    await redis.del(trackedUsersKey(eventId));
    await redis.hdel(
      simulationKey,
      'realUserEmail',
      'realUserId',
      'realUserStandbyPosition',
      'realUserStandbyTicket',
      'realUserQueued',
      'joinedForSimulation',
      'targetUserId',
      'targetUserEmail',
      'targetQueueId',
    );
    await redis.hset(simulationKey, {
      eventId,
      sessionDate: context.sessionDate,
      sessionTime: context.sessionTime,
      dummyCount: total.toString(),
      standardDummiesRemaining: total.toString(),
      memberDummyCount: memberTotal.toString(),
      dummyMembersRemaining: memberTotal.toString(),
      waitMinutesPerPerson: WAIT_MINUTES_PER_PERSON.toString(),
      totalSeats: totalSeats.toString(),
      stage: 'initialized',
      createdAt: new Date().toISOString(),
    });

    console.log(`[Simulation] 초기화 완료: ${eventId}, 좌석 더미 ${total}명, 멤버십 대기 더미 ${memberTotal}명`);
    return reply.send({
      success: true,
      eventId,
      eventName: card.eventName,
      totalSeats,
      dummyCount: total,
      memberDummyCount: memberTotal,
      memberDummyAccountsCreated: memberAccounts.created,
      waitMinutesPerPerson: WAIT_MINUTES_PER_PERSON,
      message: mode === 'integrated'
        ? `통합 시뮬레이션 초기화 완료: 일반 더미 ${total.toLocaleString()}명과 멤버십 더미 ${memberTotal.toLocaleString()}명을 준비했습니다. 다음 단계에서 본 티켓팅 대기열을 구성해주세요.`
        : `시뮬레이션 초기화 완료 — 좌석 더미 ${total.toLocaleString()}명, 멤버십 대기 더미 ${memberTotal.toLocaleString()}명 준비. 단계1 후 실제 멤버십 계정으로 취소표 대기열에 직접 진입해주세요.`,
    });
  });

  if (mode === 'integrated') {
    fastify.post(route('/main-queue'), adminAuth, async (request, reply) => {
      const { eventId, sessionDate, sessionTime } = request.body || {};
      if (!eventId) return reply.status(400).send({ error: 'eventId는 필수입니다.' });

      const simData = await redis.hgetall(stateKey(eventId));
      if (!simData?.stage) {
        return reply.status(400).send({ error: '먼저 통합 시뮬레이션을 초기화해주세요.' });
      }
      if (simData.stage !== 'initialized') {
        return reply.status(409).send({
          success: false,
          code: 'simulation_stage_order',
          message: '초기화 직후에만 본 티켓팅 대기열을 구성할 수 있습니다.',
        });
      }

      const context = getContext({
        eventId,
        sessionDate: sessionDate || simData.sessionDate,
        sessionTime: sessionTime || simData.sessionTime,
      });
      const keys = queueService.queueKeys(context);
      const standardCount = parseInt(simData.dummyCount, 10) || 0;
      const memberCount = parseInt(simData.memberDummyCount, 10) || 0;
      const totalQueueCount = standardCount + memberCount;
      const standardPrefix = simUserPrefix(mode);
      const memberPrefix = simMemberPrefix(mode);

      await pool.query(
        `DELETE FROM waiting_queue
         WHERE event_id = ?
           AND session_date = ?
           AND session_time = ?
           AND (user_id LIKE ? OR user_id LIKE ?)`,
        [eventId, context.sessionDate, context.sessionTime, `${standardPrefix}%`, `${memberPrefix}%`],
      );

      const BATCH = 1000;
      for (let offset = 0; offset < totalQueueCount; offset += BATCH) {
        const end = Math.min(offset + BATCH, totalQueueCount);
        const pipeline = redis.pipeline();
        const values = [];
        const params = [];

        for (let queueIndex = offset + 1; queueIndex <= end; queueIndex += 1) {
          const isMember = queueIndex > standardCount;
          const memberIndex = queueIndex - standardCount;
          const userId = isMember
            ? simMemberUserId(memberIndex, mode)
            : simUserId(queueIndex, mode);
          pipeline.zrem(keys.standbyKey, userId);
          pipeline.srem(keys.admittedKey, userId);
          pipeline.zadd(keys.waitingKey, queueIndex, userId);
          pipeline.sadd(keys.mainParticipantKey, userId);
          values.push("(?, ?, ?, ?, 'eligible', ?, 'WAITING', ?)");
          params.push(
            userId,
            eventId,
            context.sessionDate,
            context.sessionTime,
            queueIndex,
            isMember ? 1 : 0,
          );
        }

        await pipeline.exec();
        if (values.length) {
          await pool.query(
            `INSERT INTO waiting_queue
               (user_id, event_id, session_date, session_time, queue_type, queue_index, status, membership_at_join)
             VALUES ${values.join(',')}`,
            params,
          );
        }
      }

      await redis.set(keys.counterKey, totalQueueCount);
      await redis.set(keys.totalSeatsKey, parseInt(simData.totalSeats, 10) || 0);
      await redis.set(keys.statusKey, 'open');
      await redis.del(getScopedKey('event:sold-out', context));
      await redis.hset(stateKey(eventId), {
        stage: 'main_queue_open',
        mainQueueCount: totalQueueCount.toString(),
        mainQueueStandardCount: standardCount.toString(),
        mainQueueMemberCount: memberCount.toString(),
        mainQueueOpenedAt: new Date().toISOString(),
      });

      return reply.send({
        success: true,
        totalQueueCount,
        standardCount,
        memberCount,
        message: `본 티켓팅 대기열에 일반 더미 ${standardCount.toLocaleString()}명과 멤버십 더미 ${memberCount.toLocaleString()}명을 등록했습니다.`,
      });
    });
  }

  if (mode === 'integrated') {
    fastify.post(route('/drain-queue'), adminAuth, async (request, reply) => {
      const { eventId, sessionDate, sessionTime, batchSize = 1000, releaseSeatCount = 0 } = request.body || {};
      if (!eventId) return reply.status(400).send({ error: 'eventId는 필수입니다.' });

      const simData = await redis.hgetall(stateKey(eventId));
      if (!simData?.stage) {
        return reply.status(400).send({ error: '먼저 통합 시뮬레이션을 초기화해주세요.' });
      }
      if (simData.stage !== 'main_queue_open' && simData.stage !== 'queue_drained') {
        return reply.status(409).send({
          success: false,
          code: 'simulation_stage_order',
          message: '본 티켓팅 대기열을 구성한 뒤 대기열 드레인을 실행해주세요.',
        });
      }

      const context = getContext({
        eventId,
        sessionDate: sessionDate || simData.sessionDate,
        sessionTime: sessionTime || simData.sessionTime,
      });
      const keys = queueService.queueKeys(context);
      const standardPrefix = simUserPrefix(mode);
      const memberPrefix = simMemberPrefix(mode);

      const allWaiting = await redis.zrange(keys.waitingKey, 0, -1);
      const dummyWaiting = allWaiting.filter(
        (userId) => String(userId).startsWith(standardPrefix) || String(userId).startsWith(memberPrefix),
      );

      const drainCount = Math.min(parseInt(batchSize, 10) || 1000, dummyWaiting.length);
      const toDrain = dummyWaiting.slice(0, drainCount);

      if (toDrain.length > 0) {
        const PIPE_BATCH = 1000;
        for (let offset = 0; offset < toDrain.length; offset += PIPE_BATCH) {
          const batch = toDrain.slice(offset, offset + PIPE_BATCH);
          const pipeline = redis.pipeline();
          batch.forEach((userId) => {
            pipeline.zrem(keys.waitingKey, userId);
            pipeline.srem(keys.admittedKey, userId);
          });
          await pipeline.exec();
        }
      }

      const admittedMembers = await redis.smembers(keys.admittedKey);
      const admittedDummies = admittedMembers.filter(
        (userId) => String(userId).startsWith(standardPrefix) || String(userId).startsWith(memberPrefix),
      );
      if (admittedDummies.length > 0) {
        const pipeline = redis.pipeline();
        admittedDummies.forEach((userId) => pipeline.srem(keys.admittedKey, userId));
        await pipeline.exec();
      }

      const releaseCount = parseInt(releaseSeatCount, 10) || 0;
      let seatsReleased = 0;
      if (releaseCount > 0) {
        const allSeats = await seatService.getAllSeats(eventId, context);
        const soldDummySeats = allSeats.filter(
          (s) => s.status === 'SOLD' && s.heldBy && String(s.heldBy).startsWith(standardPrefix),
        );
        const toRelease = Math.min(releaseCount, soldDummySeats.length);
        for (let i = soldDummySeats.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [soldDummySeats[i], soldDummySeats[j]] = [soldDummySeats[j], soldDummySeats[i]];
        }
        const releaseTargets = soldDummySeats.slice(0, toRelease);
        if (releaseTargets.length > 0) {
          const pipeline = redis.pipeline();
          for (const seat of releaseTargets) {
            pipeline.hset(`${SEAT_PREFIX}${seat.seatId}`, { status: 'AVAILABLE', heldBy: '', heldAt: '' });
          }
          await pipeline.exec();
          const seatIds = releaseTargets.map((s) => s.seatId);
          await pool.query(
            `UPDATE seats SET status = 'AVAILABLE', held_by = '', held_at = NULL WHERE seat_id IN (${seatIds.map(() => '?').join(',')})`,
            seatIds,
          );
          await pool.query(
            `UPDATE reservations SET status = 'CANCELLED', cancelled_at = NOW()
             WHERE event_id = ? AND status = 'CONFIRMED'
               AND seat_id IN (${seatIds.map(() => '?').join(',')})`,
            [eventId, ...seatIds],
          );
          seatsReleased = releaseTargets.length;
          await redis.del(getScopedKey('event:sold-out', context));
        }
      }

      const remainingDummies = dummyWaiting.length - drainCount;
      const remainingWaiting = await redis.zcard(keys.waitingKey);

      let admitResult = null;
      if (remainingDummies === 0 && remainingWaiting > 0) {
        admitResult = await queueService.admitBatch(context);
      }

      const totalDrained = parseInt(simData.totalDrained || '0', 10) + drainCount;
      const totalSeatsReleased = parseInt(simData.totalSeatsReleased || '0', 10) + seatsReleased;
      await redis.hset(stateKey(eventId), {
        stage: 'queue_drained',
        totalDrained: totalDrained.toString(),
        totalSeatsReleased: totalSeatsReleased.toString(),
        dummiesRemainingInQueue: remainingDummies.toString(),
        realUsersInQueue: (remainingWaiting - remainingDummies).toString(),
        admittedCount: admitResult ? admitResult.count.toString() : (simData.admittedCount || '0'),
        queueDrainedAt: new Date().toISOString(),
      });

      const admittedCount = admitResult?.count || 0;
      const parts = [`더미 ${drainCount.toLocaleString()}명 처리 (대기열 잔여 더미: ${remainingDummies.toLocaleString()}명)`];
      if (seatsReleased > 0) parts.push(`좌석 ${seatsReleased}석 해제`);
      if (admittedCount > 0) parts.push(`실제 사용자 ${admittedCount}명 입장 승인`);

      console.log(`[Simulation] 대기열 드레인: ${parts.join(', ')}`);
      return reply.send({
        success: true,
        dummiesDrained: drainCount,
        dummiesRemainingInQueue: remainingDummies,
        seatsReleased,
        totalSeatsReleased,
        admitted: admittedCount,
        realUsersInQueue: remainingWaiting - remainingDummies,
        message: parts.join(' · '),
      });
    });
  }

  fastify.post(route('/sellout'), adminAuth, async (request, reply) => {
    const { eventId, sessionDate, sessionTime } = request.body || {};
    if (!eventId) return reply.status(400).send({ error: 'eventId는 필수입니다.' });

    const simData = await redis.hgetall(stateKey(eventId));
    if (!simData || !simData.stage) {
      return reply.status(400).send({ error: '먼저 시뮬레이션을 초기화해주세요.' });
    }
    if (mode === 'integrated' && simData.stage !== 'main_queue_open' && simData.stage !== 'queue_drained') {
      return reply.status(409).send({
        success: false,
        code: 'simulation_stage_order',
        message: '본 티켓팅 대기열을 구성한 뒤 매진과 취소표 전환을 실행해주세요.',
      });
    }

    const context = getContext({
      eventId,
      sessionDate: sessionDate || simData.sessionDate,
      sessionTime: sessionTime || simData.sessionTime,
    });
    const keys = queueService.queueKeys(context);
    const totalSeats = parseInt(simData.totalSeats, 10) || 0;
    const dummyCount = parseInt(simData.dummyCount, 10) || 10000;
    if (totalSeats === 0) {
      return reply.status(400).send({ error: '이벤트 좌석이 0석입니다. 이벤트 설정을 확인해주세요.' });
    }

    const allSeats = await seatService.getAllSeats(eventId, context);
    if (allSeats.length === 0) {
      return reply.status(400).send({ error: '초기화된 좌석이 없습니다. 먼저 공연을 생성해주세요.' });
    }

    const availableSeats = allSeats.filter(s => s.status === 'AVAILABLE');
    const seatCount = availableSeats.length;

    const seatsToSell = Math.min(seatCount, dummyCount);
    const PIPELINE_BATCH = 1000;

    for (let i = 0; i < seatsToSell; i += PIPELINE_BATCH) {
      const pipeline = redis.pipeline();
      const batchEnd = Math.min(i + PIPELINE_BATCH, seatsToSell);
      const dbValues = [];
      const dbParams = [];
      const reservationValues = [];
      const reservationParams = [];

      for (let j = i; j < batchEnd; j++) {
        const seat = availableSeats[j];
        const userId = simUserId(j + 1, mode);
        const seatKey = `${SEAT_PREFIX}${seat.seatId}`;

        pipeline.hset(seatKey, {
          status: 'SOLD',
          heldBy: userId,
          heldAt: Date.now().toString(),
        });

        dbValues.push('(?, ?, ?, ?, ?, ?, ?)');
        dbParams.push(
          seat.seatId, userId, eventId,
          context.sessionDate, context.sessionTime,
          'CONFIRMED', new Date().toISOString().slice(0, 19).replace('T', ' '),
        );

        reservationValues.push('(?, ?)');
        reservationParams.push(seat.seatId, userId);
      }
      await pipeline.exec();

      if (dbValues.length > 0) {
        try {
          await pool.query(
            `INSERT IGNORE INTO reservations (seat_id, user_id, event_id, session_date, session_time, status, reserved_at) VALUES ${dbValues.join(',')}`,
            dbParams,
          );
        } catch (e) {
          console.error('[Simulation] 예약 DB 저장 실패:', e.message);
        }
        try {
          const updateCases = reservationParams.reduce((arr, _, idx) => {
            if (idx % 2 === 0) arr.push(reservationParams[idx]);
            return arr;
          }, []);
          if (updateCases.length > 0) {
            await pool.query(
              `UPDATE seats SET status = 'SOLD', held_by = '' WHERE seat_id IN (${updateCases.map(() => '?').join(',')})`,
              updateCases,
            );
          }
        } catch (e) {
          console.error('[Simulation] 좌석 DB 상태 업데이트 실패:', e.message);
        }
      }
    }

    const memberDummyCount = parseInt(simData.memberDummyCount, 10) || 0;

    const memberQueueBatchSize = 1000;
    let actualMembersTransitioned = 0;
    if (mode === 'integrated') {
      // 통합 모드에서는 본 티켓팅 원장의 멤버십 참여자만 취소표 standby로
      // 전환한다. 일반 사용자의 eligible 행은 본 티켓팅 이력으로 유지한다.
      await pool.query(
        `DELETE FROM waiting_queue
         WHERE event_id = ?
           AND session_date = ?
           AND session_time = ?
           AND queue_type = 'standby'
           AND user_id LIKE ?`,
        [eventId, context.sessionDate, context.sessionTime, `${simMemberPrefix(mode)}%`],
      );

      for (let offset = 0; offset < memberDummyCount; offset += memberQueueBatchSize) {
        const end = Math.min(offset + memberQueueBatchSize, memberDummyCount);
        const pipeline = redis.pipeline();
        const standbyValues = [];
        const standbyParams = [];
        const memberIds = [];

        for (let index = offset + 1; index <= end; index += 1) {
          const userId = simMemberUserId(index, mode);
          const mainQueueIndex = dummyCount + index;
          memberIds.push(userId);
          pipeline.zrem(keys.waitingKey, userId);
          pipeline.zadd(keys.standbyKey, mainQueueIndex, userId);
          standbyValues.push("(?, ?, ?, ?, 'standby', ?, 'WAITING', 1)");
          standbyParams.push(userId, eventId, context.sessionDate, context.sessionTime, mainQueueIndex);
        }

        await pipeline.exec();
        if (memberIds.length) {
          const placeholders = memberIds.map(() => '?').join(',');
          await pool.query(
            `UPDATE waiting_queue
             SET status = 'STANDBY', updated_at = NOW()
             WHERE event_id = ?
               AND session_date = ?
               AND session_time = ?
               AND queue_type = 'eligible'
               AND user_id IN (${placeholders})`,
            [eventId, context.sessionDate, context.sessionTime, ...memberIds],
          );
          await pool.query(
            `INSERT INTO waiting_queue
               (user_id, event_id, session_date, session_time, queue_type, queue_index, status, membership_at_join)
             VALUES ${standbyValues.join(',')}`,
            standbyParams,
          );
        }
      }

      // 단계2에서 실제 서비스 경로로 본 티켓팅 waiting에 들어온 사용자 중
      // 가입 당시와 현재 모두 멤버십이 유효한 사용자도 같은 점수 순서로
      // 취소표 standby로 전환한다. 일반 실제 사용자는 본 대기열 이력만 유지한다.
      const trackedActualUserIds = await redis.smembers(trackedUsersKey(eventId));
      if (trackedActualUserIds.length > 0) {
        const placeholders = trackedActualUserIds.map(() => '?').join(',');
        const actualMemberRows = await pool.query(
          `SELECT w.user_id, MAX(w.queue_index) AS queue_index
           FROM waiting_queue w
           INNER JOIN memberships m ON m.user_id = w.user_id
           WHERE w.event_id = ?
             AND w.session_date = ?
             AND w.session_time = ?
             AND w.queue_type = 'eligible'
             AND w.status = 'WAITING'
             AND w.membership_at_join = 1
             AND m.is_membership = TRUE
             AND m.expires_at > UTC_TIMESTAMP()
             AND w.user_id IN (${placeholders})
           GROUP BY w.user_id`,
          [eventId, context.sessionDate, context.sessionTime, ...trackedActualUserIds],
        );

        const transitions = [];
        for (const row of actualMemberRows) {
          const score = await redis.zscore(keys.waitingKey, row.user_id);
          if (score !== null) transitions.push({ userId: String(row.user_id), score: Number(score) });
        }

        if (transitions.length > 0) {
          const pipeline = redis.pipeline();
          const standbyValues = [];
          const standbyParams = [];
          for (const transition of transitions) {
            pipeline.zrem(keys.waitingKey, transition.userId);
            pipeline.zadd(keys.standbyKey, transition.score, transition.userId);
            standbyValues.push("(?, ?, ?, ?, 'standby', ?, 'WAITING', 1)");
            standbyParams.push(
              transition.userId,
              eventId,
              context.sessionDate,
              context.sessionTime,
              transition.score,
            );
          }
          await pipeline.exec();

          const transitionIds = transitions.map((item) => item.userId);
          const transitionPlaceholders = transitionIds.map(() => '?').join(',');
          await pool.query(
            `UPDATE waiting_queue
             SET status = 'STANDBY', updated_at = NOW()
             WHERE event_id = ?
               AND session_date = ?
               AND session_time = ?
               AND queue_type = 'eligible'
               AND status = 'WAITING'
               AND user_id IN (${transitionPlaceholders})`,
            [eventId, context.sessionDate, context.sessionTime, ...transitionIds],
          );
          await pool.query(
            `INSERT INTO waiting_queue
               (user_id, event_id, session_date, session_time, queue_type, queue_index, status, membership_at_join)
             VALUES ${standbyValues.join(',')}`,
            standbyParams,
          );
          actualMembersTransitioned = transitions.length;
        }
      }
    } else {
      // 기존 AWS·Final 모드는 매진 단계에서 일반·멤버십 더미 standby를
      // 직접 구성한다. 통합 모드의 본 티켓팅 전이와는 상태를 공유하지 않는다.
      await removeStandardDummyQueue({ eventId, context });
      await removeDummyMembershipQueue({ eventId, context, deleteAccounts: false });

      for (let offset = 0; offset < dummyCount; offset += memberQueueBatchSize) {
        const end = Math.min(offset + memberQueueBatchSize, dummyCount);
        const pipeline = redis.pipeline();
        const eligibleValues = [];
        const eligibleParams = [];
        const standbyValues = [];
        const standbyParams = [];

        for (let index = offset + 1; index <= end; index += 1) {
          const userId = simUserId(index, mode);
          const queueIndex = memberDummyCount + index;
          pipeline.zadd(keys.standbyKey, queueIndex, userId);
          eligibleValues.push("(?, ?, ?, ?, 'eligible', ?, 'STANDBY', 0)");
          eligibleParams.push(userId, eventId, context.sessionDate, context.sessionTime, queueIndex);
          standbyValues.push("(?, ?, ?, ?, 'standby', ?, 'WAITING', 0)");
          standbyParams.push(userId, eventId, context.sessionDate, context.sessionTime, queueIndex);
        }

        await pipeline.exec();
        if (eligibleValues.length) {
          await pool.query(
            `INSERT INTO waiting_queue
               (user_id, event_id, session_date, session_time, queue_type, queue_index, status, membership_at_join)
             VALUES ${eligibleValues.join(',')}`,
            eligibleParams,
          );
          await pool.query(
            `INSERT INTO waiting_queue
               (user_id, event_id, session_date, session_time, queue_type, queue_index, status, membership_at_join)
             VALUES ${standbyValues.join(',')}`,
            standbyParams,
          );
        }
      }

      for (let offset = 0; offset < memberDummyCount; offset += memberQueueBatchSize) {
        const end = Math.min(offset + memberQueueBatchSize, memberDummyCount);
        const pipeline = redis.pipeline();
        const eligibleValues = [];
        const eligibleParams = [];
        const standbyValues = [];
        const standbyParams = [];

        for (let index = offset + 1; index <= end; index += 1) {
          const userId = simMemberUserId(index, mode);
          pipeline.zadd(keys.standbyKey, index, userId);
          eligibleValues.push("(?, ?, ?, ?, 'eligible', ?, 'STANDBY', 1)");
          eligibleParams.push(userId, eventId, context.sessionDate, context.sessionTime, index);
          standbyValues.push("(?, ?, ?, ?, 'standby', ?, 'WAITING', 1)");
          standbyParams.push(userId, eventId, context.sessionDate, context.sessionTime, index);
        }

        await pipeline.exec();
        if (eligibleValues.length) {
          await pool.query(
            `INSERT INTO waiting_queue
               (user_id, event_id, session_date, session_time, queue_type, queue_index, status, membership_at_join)
             VALUES ${eligibleValues.join(',')}`,
            eligibleParams,
          );
          await pool.query(
            `INSERT INTO waiting_queue
               (user_id, event_id, session_date, session_time, queue_type, queue_index, status, membership_at_join)
             VALUES ${standbyValues.join(',')}`,
            standbyParams,
          );
        }
      }
    }

    await redis.set(keys.totalSeatsKey, seatCount);

    // 실제 사용자는 단계1 이후 일반 frontend의
    // /cancel-queue/join 경로로 직접 standby에 진입한다.
    await redis.set(keys.counterKey, dummyCount + memberDummyCount);
    await redis.set(keys.statusKey, 'sold_out');
    await redis.set(getScopedKey('event:sold-out', context), '1');

    await redis.hset(stateKey(eventId), {
      stage: 'sold_out',
      seatsSold: seatsToSell.toString(),
      standbyDummies: (mode === 'integrated' ? memberDummyCount : dummyCount + memberDummyCount).toString(),
      standardStandbyDummies: (mode === 'integrated' ? 0 : dummyCount).toString(),
      standardDummiesRemaining: (mode === 'integrated' ? 0 : dummyCount).toString(),
      dummyMembersRemaining: (mode === 'integrated' ? 0 : memberDummyCount).toString(),
      mainQueueRemaining: (mode === 'integrated' ? dummyCount : 0).toString(),
      cancellationQueueCount: (memberDummyCount + actualMembersTransitioned).toString(),
      soldOutAt: new Date().toISOString(),
    });

    console.log(`[Simulation] 매진 완료: ${seatsToSell}석 판매, 일반 더미 ${dummyCount}명, 멤버십 standby 더미 ${memberDummyCount}명`);
    return reply.send({
      success: true,
      seatsSold: seatsToSell,
      standbyDummies: mode === 'integrated' ? memberDummyCount : dummyCount + memberDummyCount,
      standardStandbyDummies: mode === 'integrated' ? 0 : dummyCount,
      memberDummyCount,
      realUserPosition: null,
      totalStandby: mode === 'integrated' ? memberDummyCount + actualMembersTransitioned : dummyCount + memberDummyCount,
      message: mode === 'integrated'
        ? `매진 처리 후 멤버십 더미 ${memberDummyCount.toLocaleString()}명과 실제 멤버십 사용자 ${actualMembersTransitioned.toLocaleString()}명을 취소표 대기열로 전환했습니다.`
        : `매진 연출 완료: ${seatsToSell.toLocaleString()}석 판매, 비회원 더미 ${dummyCount.toLocaleString()}명과 멤버십 더미 ${memberDummyCount.toLocaleString()}명이 대기열에 등록되었습니다. 실제 멤버십 사용자의 예상 대기시간은 앞 멤버십 대기자 1명당 5분으로 표시됩니다.`,
    });
  });

  fastify.post(route('/close'), adminAuth, async (request, reply) => {
    const { eventId, sessionDate, sessionTime } = request.body || {};
    if (!eventId) return reply.status(400).send({ error: 'eventId는 필수입니다.' });

    const simData = await redis.hgetall(stateKey(eventId));
    if (!simData || !simData.stage) {
      return reply.status(400).send({ error: '시뮬레이션 데이터가 없습니다.' });
    }
    if (simData.stage !== 'sold_out') {
      return reply.status(409).send({
        success: false,
        code: 'simulation_stage_order',
        message: '단계1 매진 연출 후에만 조기 마감할 수 있습니다.',
      });
    }

    const context = getContext({
      eventId,
      sessionDate: sessionDate || simData.sessionDate,
      sessionTime: sessionTime || simData.sessionTime,
    });
    const keys = queueService.queueKeys(context);

    await redis.set(keys.statusKey, 'closed');

    const cardStr = await redis.hget(EVENT_LIST_KEY, eventId);
    if (cardStr) {
      try {
        const card = JSON.parse(cardStr);
        card.ticketCloseAt = new Date().toISOString();
        await redis.hset(EVENT_LIST_KEY, eventId, JSON.stringify(card));
      } catch (_) {}
    }
    try {
      await pool.query(
        'UPDATE events SET ticket_close_at = ? WHERE event_id = ?',
        [new Date(), eventId],
      );
    } catch (_) {}

    const standbyMembers = await redis.zrange(keys.standbyKey, 0, -1, 'WITHSCORES');
    const eligibleUsers = [];
    const ineligibleUsers = [];

    for (let i = 0; i < standbyMembers.length; i += 2) {
      const userId = standbyMembers[i];
      const score = parseInt(standbyMembers[i + 1], 10);
      const membership = await membershipService.getMembership(userId);

      if (membership.isMembership) {
        eligibleUsers.push({ userId, score, plan: membership.plan, priority: membership.priorityLevel });
      } else {
        ineligibleUsers.push({ userId, score });
      }

      if (eligibleUsers.length >= 100 && ineligibleUsers.length >= 100) break;
    }

    eligibleUsers.sort((a, b) => a.score - b.score);

    // 실제 사용자는 일반 서비스와 동일하게 /cancel-queue/join으로
    // 직접 들어온다. 조기 마감 단계에서는 그 대기 행을 자동 생성하거나
    // 특정 이메일을 최우선으로 올리지 않고, 이미 등록된 회원만 집계한다.
    let memberStandbyRows = [];
    try {
      memberStandbyRows = await getCurrentSimulationMemberStandby(context, mode);
    } catch (err) {
      console.error('[Simulation] 멤버십 standby 집계 실패:', err.message);
    }

    const standardDummiesRemaining = parseInt(simData.standardDummiesRemaining, 10) || 0;
    const dummyMembersRemaining = parseInt(simData.dummyMembersRemaining, 10) || 0;
    const nextStage = mode === 'integrated'
      ? 'closed'
      : (standardDummiesRemaining > 0
        ? 'closed'
        : (dummyMembersRemaining > 0 ? 'standard_dummies_removed' : 'dummy_members_removed'));
    await redis.hset(stateKey(eventId), {
      stage: nextStage,
      closedAt: new Date().toISOString(),
      eligibleCount: eligibleUsers.length.toString(),
      memberStandbyCount: memberStandbyRows.length.toString(),
    });

    console.log(`[Simulation] 마감 완료: eligible=${eligibleUsers.length}, ineligible=${ineligibleUsers.length}`);
    return reply.send({
      success: true,
      closedAt: new Date().toISOString(),
      eligibleUsers: eligibleUsers.slice(0, 20),
      eligibleCount: eligibleUsers.length,
      ineligibleCount: ineligibleUsers.length,
      totalStandby: memberStandbyRows.length,
      memberStandbyCount: memberStandbyRows.length,
      message: mode === 'integrated'
        ? `통합 티켓팅 마감 완료: 일반 본 티켓팅 대기열과 멤버십 취소표 대기열을 분리한 상태로 확정했습니다.`
        : standardDummiesRemaining > 0
        ? `티켓팅 마감 완료 — 실제 멤버십 standby 대기자 ${memberStandbyRows.length}명. 다음 단계에서 일반 더미 대기열을 비운 뒤 멤버십 더미를 10명씩 삭제할 수 있습니다.`
        : (dummyMembersRemaining > 0
          ? `티켓팅 마감 완료 — 실제 멤버십 standby 대기자 ${memberStandbyRows.length}명. 일반 더미가 없어 멤버십 더미를 10명씩 삭제할 수 있습니다.`
          : `티켓팅 마감 완료 — 실제 멤버십 standby 대기자 ${memberStandbyRows.length}명. 더미 대기자가 없어 단계3 취소표 생성을 진행할 수 있습니다.`),
    });
  });

  fastify.post(route('/remove-standard-dummies'), adminAuth, async (request, reply) => {
    const { eventId, sessionDate, sessionTime } = request.body || {};
    if (!eventId) return reply.status(400).send({ error: 'eventId는 필수입니다.' });

    const simData = await redis.hgetall(stateKey(eventId));
    if (!simData?.stage) {
      return reply.status(400).send({ error: '먼저 시뮬레이션을 초기화해주세요.' });
    }
    if (!['closed', 'standard_dummies_removed', 'dummy_members_removed', 'seats_cancelled', 'link_requested'].includes(simData.stage)) {
      return reply.status(409).send({
        success: false,
        code: 'simulation_stage_order',
        message: '단계2 조기 마감 후에만 일반 더미 대기열을 삭제할 수 있습니다.',
      });
    }

    const context = getContext({
      eventId,
      sessionDate: sessionDate || simData.sessionDate,
      sessionTime: sessionTime || simData.sessionTime,
    });
    const removed = await removeStandardDummyQueue({ eventId, context });
    const hasMemberDummies = (parseInt(simData.dummyMembersRemaining, 10) || 0) > 0;
    await redis.hset(stateKey(eventId), {
      stage: simData.stage === 'closed'
        ? (hasMemberDummies ? 'standard_dummies_removed' : 'dummy_members_removed')
        : simData.stage,
      standardDummiesRemaining: String(removed.remaining),
      standardDummiesRemovedAt: new Date().toISOString(),
    });

    return reply.send({
      success: true,
      ...removed,
      message: `일반 더미 대기자 ${removed.removedFromRedis.toLocaleString()}명을 대기열에서 삭제했습니다.`,
    });
  });

  fastify.post(route('/remove-dummy-members'), adminAuth, async (request, reply) => {
    const { eventId, sessionDate, sessionTime, count } = request.body || {};
    if (!eventId) return reply.status(400).send({ error: 'eventId는 필수입니다.' });

    const simData = await redis.hgetall(stateKey(eventId));
    if (!simData?.stage) {
      return reply.status(400).send({ error: '먼저 시뮬레이션을 초기화해주세요.' });
    }
    const allowedStages = mode === 'integrated'
      ? ['closed', 'dummy_members_removed', 'seats_cancelled', 'link_requested']
      : ['standard_dummies_removed', 'dummy_members_removed', 'seats_cancelled', 'link_requested'];
    if (!allowedStages.includes(simData.stage)) {
      return reply.status(409).send({
        success: false,
        code: 'simulation_stage_order',
        message: mode === 'integrated'
          ? '티켓팅 마감(단계5) 이후에만 더미 멤버십 사용자를 삭제할 수 있습니다.'
          : '일반 더미 대기열을 삭제한 뒤에만 더미 멤버십 사용자를 삭제할 수 있습니다.',
      });
    }

    const limit = Math.max(1, Math.min(10000, Number(count) || 10));
    const context = getContext({
      eventId,
      sessionDate: sessionDate || simData.sessionDate,
      sessionTime: sessionTime || simData.sessionTime,
    });
    const removed = await removeDummyMembershipQueue({
      eventId,
      context,
      deleteAccounts: true,
      limit,
    });
    const isComplete = removed.remaining === 0;
    await redis.hset(stateKey(eventId), {
      stage: isComplete ? 'dummy_members_removed' : simData.stage,
      dummyMembersRemaining: String(removed.remaining),
      dummyMembersRemovedAt: new Date().toISOString(),
    });

    return reply.send({
      success: true,
      ...removed,
      complete: isComplete,
      message: isComplete
        ? `마지막 더미 멤버십 대기자 ${removed.removedFromRedis.toLocaleString()}명을 삭제했습니다. 실제 사용자의 취소표 순번은 남은 실제 대기자 기준으로 다시 계산됩니다.`
        : `더미 멤버십 대기자 ${removed.removedFromRedis.toLocaleString()}명을 삭제했습니다. ${removed.remaining.toLocaleString()}명이 남아 있으며, 실제 사용자의 예상 대기시간이 즉시 다시 계산됩니다.`,
    });
  });

  fastify.post(route('/cancel-seats'), adminAuth, async (request, reply) => {
    const { eventId, sessionDate, sessionTime, count = 10 } = request.body || {};
    if (!eventId) return reply.status(400).send({ error: 'eventId는 필수입니다.' });

    const simData = await redis.hgetall(stateKey(eventId));
    if (!simData) {
      return reply.status(400).send({ error: '시뮬레이션 데이터가 없습니다.' });
    }

    // 단계3은 티켓팅을 닫은 뒤에만 실행한다. 단계2 이전에 취소 좌석을
    // 만들면 아직 열린 본 대기열과 취소표 대기열의 상태가 서로 어긋나고,
    // 실제 사용자가 좌석 선택 페이지로 이동할 수 없는 상태가 된다.
    const allowedCancelStages = mode === 'integrated'
      ? ['closed', 'seats_cancelled']
      : ['dummy_members_removed', 'seats_cancelled'];
    if (!allowedCancelStages.includes(simData.stage)) {
      return reply.status(409).send({
        success: false,
        code: 'simulation_stage_order',
        message: mode === 'integrated'
          ? '통합 티켓팅을 마감한 뒤 취소표를 생성해주세요.'
          : '단계2 조기 마감 후 더미 멤버십 대기자를 삭제한 뒤 단계3 취소표를 생성해주세요.',
      });
    }

    const context = getContext({
      eventId,
      sessionDate: sessionDate || simData.sessionDate,
      sessionTime: sessionTime || simData.sessionTime,
    });

    const allSeats = await seatService.getAllSeats(eventId, context);
    const soldDummySeats = allSeats.filter(
      s => s.status === 'SOLD' && s.heldBy && s.heldBy.startsWith(simUserPrefix(mode)),
    );

    if (soldDummySeats.length === 0) {
      return reply.send({ success: false, message: '취소 가능한 더미 좌석이 없습니다.' });
    }

    const cancelCount = Math.min(parseInt(count, 10) || 10, soldDummySeats.length);

    for (let i = soldDummySeats.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [soldDummySeats[i], soldDummySeats[j]] = [soldDummySeats[j], soldDummySeats[i]];
    }
    const toCancel = soldDummySeats.slice(0, cancelCount);

    const cancelledSeats = [];
    const pipeline = redis.pipeline();
    for (const seat of toCancel) {
      const seatKey = `${SEAT_PREFIX}${seat.seatId}`;
      pipeline.hset(seatKey, { status: 'AVAILABLE', heldBy: '', heldAt: '' });
      cancelledSeats.push(seat.seatId);
    }
    await pipeline.exec();

    if (cancelledSeats.length > 0) {
      try {
        await pool.query(
          `UPDATE seats SET status = 'AVAILABLE', held_by = '', held_at = NULL WHERE seat_id IN (${cancelledSeats.map(() => '?').join(',')})`,
          cancelledSeats,
        );
      } catch (e) {
        console.error('[Simulation] 좌석 DB 취소 실패:', e.message);
      }

      try {
        for (const seat of toCancel) {
          await pool.query(
            `UPDATE reservations SET status = 'CANCELLED', cancelled_at = NOW() WHERE seat_id = ? AND user_id = ? AND status = 'CONFIRMED' ORDER BY reserved_at DESC LIMIT 1`,
            [seat.seatId, seat.heldBy],
          );
        }
      } catch (e) {
        console.error('[Simulation] 예약 DB 취소 실패:', e.message);
      }
    }

    await redis.del(getScopedKey('event:sold-out', context));

    // 시뮬레이션에서는 단계 4를 누르기 전까지 B파트로 보내지 않는다.
    // 실제 사용자가 일반 standby 진입 API로 등록되어 있어야 단계4에서
    // B파트의 순차 배정 대상을 확인할 수 있다.
    const preparedCancellationEvents = toCancel.map((seat) => ({
      event_id: eventId,
      seat_id: seat.seatId,
      reservation_id: null,
      status: 'CANCELLED',
      user_id: seat.heldBy || null,
      session_date: context.sessionDate,
      session_time: context.sessionTime,
      reason: 'simulation_cancelled',
    }));

    await redis.hset(stateKey(eventId), {
      stage: 'seats_cancelled',
      cancelledCount: cancelCount.toString(),
      promotedCount: '0',
      cancellationEventsPrepared: preparedCancellationEvents.length.toString(),
      cancellationEventsPublished: '0',
      cancellationEvents: JSON.stringify(preparedCancellationEvents),
      cancelledAt: new Date().toISOString(),
    });

    console.log(`[Simulation] 좌석 ${cancelCount}석 강제 취소 완료`);
    return reply.send({
      success: true,
      cancelledCount: cancelCount,
      cancelledSeats,
      promotedCount: 0,
      cancellationEventsPrepared: preparedCancellationEvents.length,
      cancellationEventsPublished: 0,
      message: `더미 좌석 ${cancelCount}석이 취소되었습니다. 단계4에서 ${mode === 'local' ? '로컬 SMTP' : 'B파트'} 링크 발급을 실행해주세요.`,
    });
  });

  fastify.post(route('/issue-links'), adminAuth, async (request, reply) => {
    const { eventId, sessionDate, sessionTime } = request.body || {};
    if (!eventId) return reply.status(400).send({ error: 'eventId는 필수입니다.' });

    const simData = await redis.hgetall(stateKey(eventId));
    if (!simData || !simData.stage) {
      return reply.status(400).send({ error: '먼저 시뮬레이션을 초기화해주세요.' });
    }

    const context = getContext({
      eventId,
      sessionDate: sessionDate || simData.sessionDate,
      sessionTime: sessionTime || simData.sessionTime,
    });

    if (mode === 'local') {
      const localResult = await issueLocalSmtpLink({ eventId, context, simData });
      return reply.status(localResult.statusCode).send(localResult.body);
    }

    if (!isCancellationEventsConfigured()) {
      return reply.status(503).send({
        success: false,
        code: 'cancellation_events_not_configured',
        message: 'B파트 SQS 연동이 설정되지 않았습니다. CANCELLATION_EVENTS_QUEUE_URL을 확인해주세요.',
      });
    }

    let memberStandbyRows = [];
    try {
      memberStandbyRows = await getCurrentSimulationMemberStandby(context, mode);
    } catch (err) {
      console.error('[Simulation] B파트 대상 standby 집계 실패:', err.message);
      return reply.status(500).send({
        success: false,
        code: 'standby_lookup_failed',
        message: '멤버십 취소표 대기열을 조회하지 못했습니다.',
      });
    }

    const targetStandby = memberStandbyRows[0];
    if (!targetStandby) {
      return reply.status(400).send({
        success: false,
        code: 'membership_required',
        message: '현재 회차에 직접 진입한 활성 멤버십 standby 대기자가 없습니다. 실제 멤버십 계정으로 먼저 취소표 대기열에 진입해주세요.',
      });
    }

    const targetUserId = String(targetStandby.user_id);
    let targetUserEmail = targetUserId;
    try {
      const userRows = await pool.query(
        'SELECT email FROM users WHERE user_id = ? LIMIT 1',
        [targetUserId],
      );
      targetUserEmail = userRows[0]?.email || targetUserId;
    } catch (err) {
      console.warn('[Simulation] 대상 사용자 이메일 조회 실패:', err.message);
    }

    // B파트 GetNextUser는 waiting_queue의 membership_at_join=1 행을 직접
    // 조회한다. 통합 시뮬레이션의 더미 멤버십 행을 남긴 채 SQS 이벤트를
    // 발행하면 test.com 더미가 실제 링크 대상보다 먼저 선택될 수 있다.
    // 화면에서 순번 변화를 확인하는 동안에는 유지하되, B파트 요청 직전에
    // 통합 모드 더미만 원자적으로 제거해 실제 회원 후보만 남긴다.
    let integratedDummyCleanup = null;
    if (mode === 'integrated') {
      try {
        const integratedMemberPrefix = simMemberPrefix(mode);
        const dbDummyRows = await pool.query(
          `SELECT DISTINCT user_id
           FROM waiting_queue
           WHERE event_id = ?
             AND session_date = ?
             AND session_time = ?
             AND user_id LIKE ?`,
          [eventId, context.sessionDate, context.sessionTime, `${integratedMemberPrefix}%`],
        );
        integratedDummyCleanup = await removeDummyMembershipQueue({
          eventId,
          context,
          deleteAccounts: true,
        });
        // Redis 유실이나 이전 실패로 DB에만 남은 더미 행도 B 후보 조회 전에
        // 접두사 기준으로 한 번 더 정리한다.
        const staleQueueResult = await pool.query(
          `DELETE FROM waiting_queue
           WHERE event_id = ?
             AND session_date = ?
             AND session_time = ?
             AND user_id LIKE ?`,
          [eventId, context.sessionDate, context.sessionTime, `${integratedMemberPrefix}%`],
        );
        await pool.query('DELETE FROM memberships WHERE user_id LIKE ?', [`${integratedMemberPrefix}%`]);
        await pool.query('DELETE FROM users WHERE user_id LIKE ?', [`${integratedMemberPrefix}%`]);
        integratedDummyCleanup.removedUsers = Math.max(
          new Set(dbDummyRows.map((row) => String(row.user_id))).size,
          integratedDummyCleanup.removedFromRedis,
        );
        integratedDummyCleanup.removedFromDatabase += Number(staleQueueResult.affectedRows) || 0;
        await redis.hset(stateKey(eventId), {
          dummyMembersRemaining: '0',
          cancellationQueueCount: '0',
          dummyMembersAutoRemovedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error('[IntegratedSimulation] B파트 요청 전 더미 멤버십 정리 실패:', err.message);
        return reply.status(500).send({
          success: false,
          code: 'integrated_dummy_cleanup_failed',
          message: 'B파트 후보 보호를 위한 더미 멤버십 정리에 실패했습니다. 링크 요청을 중단했습니다.',
        });
      }
    }

    const existingAllocation = await cancelAllocationService.getActiveAllocation(targetUserId, eventId);
    if (existingAllocation) {
      return reply.send({
        success: true,
        idempotent: true,
        delegated: true,
        targetUserEmail,
        targetUserId,
        allocation: existingAllocation,
        dummyMembersRemoved: integratedDummyCleanup?.removedUsers || 0,
        message: '이미 활성 취소표 할당이 있습니다. 사용자 페이지에서 링크 상태를 확인해주세요.',
      });
    }

    let preparedEvents = [];
    try {
      preparedEvents = JSON.parse(simData.cancellationEvents || '[]');
    } catch (_) {
      preparedEvents = [];
    }
    if (!Array.isArray(preparedEvents) || preparedEvents.length === 0) {
      return reply.status(400).send({
        success: false,
        code: 'no_cancelled_seats',
        message: '먼저 단계3에서 취소표를 생성해주세요.',
      });
    }

    let published = 0;
    let outboxed = 0;
    let failed = 0;
    for (const event of preparedEvents) {
      try {
        const result = await publishCancellationEvent({
          eventId: event.event_id || eventId,
          seatId: event.seat_id,
          userId: event.user_id || null,
          reservationId: event.reservation_id || null,
          status: event.status || 'CANCELLED',
          sessionDate: event.session_date || context.sessionDate,
          sessionTime: event.session_time || context.sessionTime,
          reason: 'simulation_link_issue',
        });
        if (result.published) published += 1;
        else if (result.outboxed) outboxed += 1;
        else failed += 1;
      } catch (err) {
        failed += 1;
        console.error(`[Simulation] B파트 링크 이벤트 발행 실패 (${event.seat_id}):`, err.message);
      }
    }

    const requestedAt = new Date().toISOString();
    await redis.hset(stateKey(eventId), {
      stage: 'link_requested',
      linksRequestedAt: requestedAt,
      targetUserId,
      targetUserEmail,
      targetQueueId: String(targetStandby.queue_id || ''),
      candidateCount: String(memberStandbyRows.length),
      candidateQueueIds: memberStandbyRows.map((row) => String(row.queue_id || '')).filter(Boolean).join(','),
      cancellationEventsPublished: published.toString(),
      cancellationEventsOutboxed: outboxed.toString(),
      cancellationEventsFailed: failed.toString(),
    });

    const immediate = published > 0;
    const accepted = immediate || outboxed > 0;
    return reply.status(accepted ? (immediate ? 200 : 202) : 502).send({
      success: accepted,
      delegated: true,
      targetUserEmail,
      targetUserId,
      eventsPrepared: preparedEvents.length,
      eventsPublished: published,
      eventsOutboxed: outboxed,
      eventsFailed: failed,
      dummyMembersRemoved: integratedDummyCleanup?.removedUsers || 0,
      message: immediate
        ? `B파트 SQS로 ${published}건의 취소표 이벤트를 전송했습니다.${mode === 'integrated' ? ` 더미 멤버십 ${integratedDummyCleanup?.removedUsers || 0}명을 후보 원장에서 제외했습니다.` : ''} 대기열 최상위 멤버십 사용자(${targetUserEmail})부터 Secret Link가 발급됩니다.`
        : outboxed > 0
          ? `B파트 전송에 실패한 ${outboxed}건을 재시도 큐에 저장했습니다.`
          : 'B파트로 취소표 이벤트를 전송하지 못했습니다.',
    });
  });

  fastify.post(route('/cleanup'), adminAuth, async (request, reply) => {
    const { eventId } = request.body || {};
    if (!eventId) return reply.status(400).send({ error: 'eventId는 필수입니다.' });

    const simData = await redis.hgetall(stateKey(eventId));
    const context = getContext({
      eventId,
      sessionDate: simData?.sessionDate || '',
      sessionTime: simData?.sessionTime || '',
    });
    const keys = queueService.queueKeys(context);
    let trackedUsers = [];
    try {
      trackedUsers = await redis.smembers(trackedUsersKey(eventId));
    } catch (err) {
      console.warn('[Simulation] 직접 진입 사용자 목록 조회 실패:', err.message);
    }

    const allSeats = await seatService.getAllSeats(eventId, context);
    const simSeats = allSeats.filter(s => s.heldBy && s.heldBy.startsWith(simUserPrefix(mode)));
    if (simSeats.length > 0) {
      const pipeline = redis.pipeline();
      for (const seat of simSeats) {
        pipeline.hset(`${SEAT_PREFIX}${seat.seatId}`, {
          status: 'AVAILABLE',
          heldBy: '',
          heldAt: '',
        });
      }
      await pipeline.exec();

      const seatIds = simSeats.map(s => s.seatId);
      try {
        await pool.query(
          `UPDATE seats SET status = 'AVAILABLE', held_by = '', held_at = NULL WHERE seat_id IN (${seatIds.map(() => '?').join(',')})`,
          seatIds,
        );
      } catch (_) {}
    }

    const pipeline2 = redis.pipeline();
    pipeline2.del(keys.waitingKey);
    pipeline2.del(keys.standbyKey);
    pipeline2.del(keys.admittedKey);
    pipeline2.del(keys.mainParticipantKey);
    pipeline2.del(keys.counterKey);
    pipeline2.del(keys.statusKey);
    pipeline2.del(getScopedKey('event:sold-out', context));
    pipeline2.del(trackedUsersKey(eventId));
    pipeline2.del(stateKey(eventId));
    await pipeline2.exec();

    try {
      await pool.query('DELETE FROM reservations WHERE user_id LIKE ? AND event_id = ?', [`${simUserPrefix(mode)}%`, eventId]);
      await pool.query('DELETE FROM waiting_queue WHERE user_id LIKE ? AND event_id = ?', [`${simUserPrefix(mode)}%`, eventId]);
      await pool.query(
        `DELETE FROM waiting_queue
         WHERE user_id LIKE ?
           AND event_id = ?
           AND session_date = ?
           AND session_time = ?`,
        [`${simMemberPrefix(mode)}%`, eventId, context.sessionDate, context.sessionTime],
      );
      if (trackedUsers.length > 0) {
        const placeholders = trackedUsers.map(() => '?').join(',');
        await pool.query(
          `DELETE FROM waiting_queue
           WHERE user_id IN (${placeholders})
             AND event_id = ?
             AND session_date = ?
             AND session_time = ?
             AND queue_type = 'standby'`,
          [...trackedUsers, context.eventId, context.sessionDate, context.sessionTime],
        );
      }
      if (mode === 'local' && simData?.targetUserId) {
        await pool.query(
          `UPDATE cancel_allocations
           SET status = 'EXPIRED'
           WHERE user_id = ?
             AND event_id = ?
             AND session_date = ?
             AND session_time = ?
             AND status = 'LINK_SENT'`,
          [simData.targetUserId, context.eventId, context.sessionDate, context.sessionTime],
        );
      }
      await pool.query('DELETE FROM cancel_allocations WHERE user_id LIKE ? AND event_id = ?', [`${simUserPrefix(mode)}%`, eventId]);
      if (context.sessionDate && context.sessionTime) {
        const lockKey = `${eventId}|${context.sessionDate}|${context.sessionTime}`;
        await pool.query('DELETE FROM cancel_active_lock WHERE lock_key = ?', [lockKey]);
      }
      await pool.query('DELETE FROM memberships WHERE user_id LIKE ?', [`${simUserPrefix(mode)}%`]);
      await pool.query('DELETE FROM users WHERE user_id LIKE ?', [`${simUserPrefix(mode)}%`]);
      await pool.query('DELETE FROM memberships WHERE user_id LIKE ?', [`${simMemberPrefix(mode)}%`]);
      await pool.query('DELETE FROM users WHERE user_id LIKE ?', [`${simMemberPrefix(mode)}%`]);
    } catch (e) {
      console.error('[Simulation] DB 정리 실패:', e.message);
    }

    console.log(`[Simulation] 클린업 완료: ${eventId}`);
    return reply.send({
      success: true,
      clearedSeats: simSeats.length,
      message: `시뮬레이션 데이터가 삭제되었습니다. (더미 좌석 ${simSeats.length}석 복원)`,
    });
  });

  if (mode === 'b') {
  fastify.post('/admin/dummy/create-users', adminAuth, async (request, reply) => {
    const { count = 100 } = request.body || {};
    const total = Math.min(Math.max(parseInt(count, 10) || 100, 1), 50000);

    const BATCH = 2000;
    let created = 0;
    for (let i = 0; i < total; i += BATCH) {
      const values = [];
      const params = [];
      const batchEnd = Math.min(i + BATCH, total);
      for (let j = i; j < batchEnd; j++) {
        values.push('(?, ?, ?, ?, ?)');
        params.push(simUserId(j + 1), '', 'user', simUserId(j + 1), `더미${j + 1}`);
      }
      try {
        const result = await pool.query(
          `INSERT IGNORE INTO users (user_id, password, role, email, name) VALUES ${values.join(',')}`,
          params,
        );
        created += Number(result.affectedRows) || 0;
      } catch (e) {
        console.error('[Dummy] 더미 유저 생성 오류:', e.message);
      }
    }

    console.log(`[Dummy] 더미 유저 ${created}명 생성 완료 (요청: ${total}명)`);
    return reply.send({
      success: true,
      requested: total,
      created,
      message: `더미 유저 ${created.toLocaleString()}명이 생성되었습니다.`,
    });
  });

  fastify.post('/admin/dummy/distribute-interests', adminAuth, async (request, reply) => {
    const { maxEvents = 5 } = request.body || {};

    const events = await redis.hgetall(EVENT_LIST_KEY);
    if (!events || Object.keys(events).length === 0) {
      return reply.status(400).send({ error: '생성된 공연이 없습니다.' });
    }

    const eventIds = Object.keys(events);
    for (let i = eventIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [eventIds[i], eventIds[j]] = [eventIds[j], eventIds[i]];
    }
    const selectedEvents = eventIds.slice(0, Math.min(parseInt(maxEvents, 10) || 5, eventIds.length));

    const dummyRows = await pool.query(
      `SELECT user_id FROM users WHERE user_id LIKE '${SIM_USER_PREFIX}%' ORDER BY user_id`,
    );
    if (dummyRows.length === 0) {
      return reply.status(400).send({ error: '더미 유저가 없습니다. 먼저 더미 유저를 생성해주세요.' });
    }

    const dummyUserIds = dummyRows.map(r => r.user_id);
    const shuffled = [...dummyUserIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const weights = selectedEvents.map((_, i) => {
      const base = selectedEvents.length - i;
      return base * base + Math.random() * base;
    });
    const weightSum = weights.reduce((s, w) => s + w, 0);
    const boundaries = [];
    let cumulative = 0;
    for (const w of weights) {
      cumulative += w / weightSum;
      boundaries.push(cumulative);
    }
    boundaries[boundaries.length - 1] = 1;

    const distribution = selectedEvents.map(() => []);
    for (const userId of shuffled) {
      const r = Math.random();
      const bucket = boundaries.findIndex(b => r < b);
      distribution[bucket >= 0 ? bucket : distribution.length - 1].push(userId);
    }

    await pool.query(`DELETE FROM wishlists WHERE user_id LIKE '${SIM_USER_PREFIX}%'`);

    const results = [];
    const BATCH = 2000;
    for (let eIdx = 0; eIdx < selectedEvents.length; eIdx++) {
      const eventId = selectedEvents[eIdx];
      const users = distribution[eIdx];
      let inserted = 0;

      for (let i = 0; i < users.length; i += BATCH) {
        const values = [];
        const params = [];
        const batchEnd = Math.min(i + BATCH, users.length);
        for (let j = i; j < batchEnd; j++) {
          values.push('(?, ?)');
          params.push(users[j], eventId);
        }
        try {
          const result = await pool.query(
            `INSERT IGNORE INTO wishlists (user_id, event_id) VALUES ${values.join(',')}`,
            params,
          );
          inserted += Number(result.affectedRows) || 0;
        } catch (e) {
          console.error(`[Dummy] 위시리스트 분배 오류 (${eventId}):`, e.message);
        }
      }

      let eventName = eventId;
      try {
        const card = JSON.parse(events[eventId]);
        eventName = card.eventName || eventId;
      } catch (_) {}

      results.push({ eventId, eventName, count: inserted });
    }

    results.sort((a, b) => b.count - a.count);
    console.log(`[Dummy] 관심 공연 분배 완료: ${results.map(r => `${r.eventName}(${r.count})`).join(', ')}`);
    return reply.send({
      success: true,
      totalUsers: dummyUserIds.length,
      eventsCount: selectedEvents.length,
      distribution: results,
      message: `더미 유저 ${dummyUserIds.length.toLocaleString()}명의 관심 공연이 ${selectedEvents.length}개 공연에 분배되었습니다.`,
    });
  });

  fastify.post('/admin/dummy/cleanup', adminAuth, async (request, reply) => {
    let deletedWishlists = 0;
    let deletedUsers = 0;
    try {
      const wResult = await pool.query(`DELETE FROM wishlists WHERE user_id LIKE '${SIM_USER_PREFIX}%'`);
      deletedWishlists = Number(wResult.affectedRows) || 0;
    } catch (e) {
      console.error('[Dummy] 위시리스트 삭제 실패:', e.message);
    }
    try {
      const uResult = await pool.query(`DELETE FROM users WHERE user_id LIKE '${SIM_USER_PREFIX}%'`);
      deletedUsers = Number(uResult.affectedRows) || 0;
    } catch (e) {
      console.error('[Dummy] 유저 삭제 실패:', e.message);
    }

    console.log(`[Dummy] 정리 완료: 유저 ${deletedUsers}명, 위시리스트 ${deletedWishlists}건 삭제`);
    return reply.send({
      success: true,
      deletedUsers,
      deletedWishlists,
      message: `더미 유저 ${deletedUsers.toLocaleString()}명과 위시리스트 ${deletedWishlists.toLocaleString()}건이 삭제되었습니다.`,
    });
  });
  }

  fastify.get(route('/status'), adminAuth, async (request, reply) => {
    const { eventId, sessionDate, sessionTime } = request.query || {};
    if (!eventId) return reply.status(400).send({ error: 'eventId는 필수입니다.' });

    const simData = await redis.hgetall(stateKey(eventId));
    if (!simData || !simData.stage) {
      return reply.send({ initialized: false, message: '시뮬레이션이 초기화되지 않았습니다.' });
    }

    const context = getContext({
      eventId,
      sessionDate: sessionDate || simData.sessionDate || '',
      sessionTime: sessionTime || simData.sessionTime || '',
    });
    const keys = queueService.queueKeys(context);

    const [standbyCount, admittedCount, waitingCount] = await Promise.all([
      redis.zcard(keys.standbyKey),
      redis.scard(keys.admittedKey),
      redis.zcard(keys.waitingKey),
    ]);

    const allSeats = await seatService.getAllSeats(eventId, context);
    const seatStats = {
      total: allSeats.length,
      available: allSeats.filter(s => s.status === 'AVAILABLE').length,
      held: allSeats.filter(s => s.status === 'HELD').length,
      sold: allSeats.filter(s => s.status === 'SOLD').length,
    };

    let allMemberStandbyRows = [];
    let memberStandbyRows = [];
    try {
      [allMemberStandbyRows, memberStandbyRows] = await Promise.all([
        queueService.getActiveStandbyMembers(context),
        getCurrentSimulationMemberStandby(context, mode),
      ]);
    } catch (err) {
      console.warn('[Simulation] 상태 조회 중 멤버십 standby 집계 실패:', err.message);
    }
    const trackedUserId = simData.targetUserId || memberStandbyRows[0]?.user_id || '';
    let trackedUserStatus = null;
    if (trackedUserId) {
      const rank = await redis.zrank(keys.standbyKey, trackedUserId);
      const isAdmitted = await redis.sismember(keys.admittedKey, trackedUserId);
      const allocation = await cancelAllocationService.getActiveAllocation(trackedUserId, eventId);
      let trackedUserEmail = simData.targetUserEmail || trackedUserId;
      try {
        const userRows = await pool.query(
          'SELECT email FROM users WHERE user_id = ? LIMIT 1',
          [trackedUserId],
        );
        trackedUserEmail = userRows[0]?.email || trackedUserEmail;
      } catch (_) {}
      trackedUserStatus = {
        userId: trackedUserId,
        email: trackedUserEmail,
        standbyPosition: rank !== null ? rank + 1 : null,
        memberStandbyPosition: allMemberStandbyRows.findIndex((row) => String(row.user_id) === String(trackedUserId)) + 1 || null,
        isAdmitted,
        hasAllocation: !!allocation,
        allocation: allocation || null,
      };
    }

    const allocHistory = await cancelAllocationService.getAllocationHistory(eventId);

    return reply.send({
      initialized: true,
      mode,
      delivery: simData.localDelivery || (mode === 'local' ? 'smtp' : 'b-sqs'),
      stage: simData.stage,
      eventId,
      dummyCount: parseInt(simData.dummyCount, 10) || 0,
      standardDummiesRemaining: parseInt(simData.standardDummiesRemaining, 10) || 0,
      memberDummyCount: parseInt(simData.memberDummyCount, 10) || 0,
      dummyMembersRemaining: parseInt(simData.dummyMembersRemaining, 10) || 0,
      mainQueueCount: parseInt(simData.mainQueueCount, 10) || 0,
      mainQueueStandardCount: parseInt(simData.mainQueueStandardCount, 10) || 0,
      mainQueueMemberCount: parseInt(simData.mainQueueMemberCount, 10) || 0,
      mainQueueRemaining: parseInt(simData.mainQueueRemaining, 10) || 0,
      cancellationQueueCount: parseInt(simData.cancellationQueueCount, 10) || 0,
      waitMinutesPerPerson: parseInt(simData.waitMinutesPerPerson, 10) || WAIT_MINUTES_PER_PERSON,
      totalSeats: parseInt(simData.totalSeats, 10) || 0,
      queue: { standby: standbyCount, admitted: admittedCount, waiting: waitingCount },
      seats: seatStats,
      cancellation: {
        prepared: parseInt(simData.cancellationEventsPrepared, 10) || 0,
        published: parseInt(simData.cancellationEventsPublished, 10) || 0,
        outboxed: parseInt(simData.cancellationEventsOutboxed, 10) || 0,
        failed: parseInt(simData.cancellationEventsFailed, 10) || 0,
      },
      realUser: trackedUserStatus,
      candidateCount: memberStandbyRows.length,
      candidateUsers: memberStandbyRows.map((row) => ({
        userId: String(row.user_id),
        queueId: row.queue_id,
        queueIndex: row.queue_index,
      })),
      memberStandbyCount: memberStandbyRows.length,
      allocations: allocHistory.slice(0, 20),
      createdAt: simData.createdAt,
    });
  });
}

module.exports = simulationRoutes;
