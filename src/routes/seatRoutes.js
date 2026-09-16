const seatService = require('../services/seatService');
const { getReservationsBySeat, getAllReservations, getReservationsByUser } = require('../services/dbService');
const { sendEmail } = require('../services/notificationService');
const redis = require('../config/redis');
const pool = require('../config/mariadb');
const { guardRecaptcha } = require('../services/recaptchaService');
const { bookingOperations } = require('../services/metricsService');
const {
  authenticate,
  requireRole,
  allowUserOrCancelLink,
  requireSelfOrLink,
} = require('../middleware/auth');

const adminAuth = { preHandler: [authenticate, requireRole('admin')] };
const userAuth = { preHandler: [allowUserOrCancelLink, requireSelfOrLink] };

async function executeBookingOperation(operation, handler) {
  try {
    const result = await handler();
    bookingOperations.inc({
      operation,
      result: result.success ? 'success' : 'rejected',
    });
    return result;
  } catch (err) {
    bookingOperations.inc({ operation, result: 'error' });
    throw err;
  }
}

const GRADE_MAP = {
  Floor: 'VIP', A1: 'S', A2: 'S', A3: 'S', A4: 'S',
  B1: 'R', B2: 'R', D1: 'R', D2: 'R',
  E1: 'S', E2: 'S', E3: 'S', E4: 'S',
  F1: 'R', F2: 'R', F3: 'R', G: 'S', H: 'S',
};

function formatSeatLabel(seatId, seatSection) {
  const lastColon = seatId.lastIndexOf(':');
  const seatPart = lastColon >= 0 ? seatId.slice(lastColon + 1) : seatId;
  const dashIdx = seatPart.lastIndexOf('-');
  const section = dashIdx >= 0 ? seatPart.slice(0, dashIdx) : seatPart;
  const num = dashIdx >= 0 ? parseInt(seatPart.slice(dashIdx + 1), 10) : '';
  const resolvedSection = seatSection || section;
  const grade = GRADE_MAP[resolvedSection] || '';
  const gradeLabel = grade ? ` ${grade}석` : '';
  return `${resolvedSection}구역${gradeLabel} ${num}번`;
}

async function getEmailContext(seatId, userId, extraEventId, extraSessionDate, extraSessionTime) {
  const rows = await pool.query('SELECT email, name FROM users WHERE user_id = ?', [userId]);
  const user = rows[0];
  if (!user || !user.email) return null;

  const resolvedEventId = extraEventId || seatId.split(':')[0];
  let eventName = '';
  let venue = '';
  let eventDate = '';
  const card = await redis.hget('events:list', resolvedEventId);
  if (card) {
    const parsed = JSON.parse(card);
    eventName = parsed.eventName || parsed.title || '';
    venue = parsed.venue || '';
    eventDate = parsed.eventDate || '';
  }

  const seatHash = await redis.hgetall(`seat:${seatId}`);
  const seatLabel = formatSeatLabel(seatId, seatHash.section || '');
  const displayDate = extraSessionDate || seatHash.sessionDate || eventDate || '미정';
  const displayTime = extraSessionTime || seatHash.sessionTime || '';

  return { user, eventName, venue, resolvedEventId, seatLabel, displayDate, displayTime };
}

async function seatRoutes(fastify) {

  fastify.post('/seats/init', adminAuth, async (request, reply) => {
    const { seatIds } = request.body || {};
    if (!Array.isArray(seatIds) || seatIds.length === 0) {
      return reply.status(400).send({ error: 'seatIds 배열이 필요합니다.' });
    }
    const result = await seatService.initSeats(seatIds);
    return reply.send(result);
  });

  fastify.post('/seats/hold', userAuth, async (request, reply) => {
    if (!await guardRecaptcha(request, reply, 'seat_hold')) return;
    const { userId, seatId, token, eventId, sessionDate, sessionTime } = request.body || {};
    if (!userId || !seatId) {
      return reply.status(400).send({ error: 'userId와 seatId는 필수입니다.' });
    }
    if (!token) {
      return reply.status(401).send({ error: 'Admission Token(token)은 필수입니다.' });
    }
    const result = await executeBookingOperation(
      'hold',
      () => seatService.holdSeat(userId, seatId, token, { eventId, sessionDate, sessionTime }),
    );
    const statusCode = result.success ? 200 : result.reason === 'no_token' || result.reason === 'expired' ? 401 : 409;
    return reply.status(statusCode).send(result);
  });

  fastify.post('/seats/confirm', userAuth, async (request, reply) => {
    if (!await guardRecaptcha(request, reply, 'seat_confirm')) return;
    const { userId, seatId, eventId, sessionDate, sessionTime, paymentMethod } = request.body || {};
    if (!userId || !seatId) {
      return reply.status(400).send({ error: 'userId와 seatId는 필수입니다.' });
    }
    const result = await executeBookingOperation(
      'confirm',
      () => seatService.confirmSeat(userId, seatId, { eventId, sessionDate, sessionTime }),
    );
    const statusCode = result.success ? 200 : 409;

    if (result.success && !result.idempotent) {
      try {
        const ctx = await getEmailContext(seatId, userId, eventId, sessionDate, sessionTime);
        if (ctx) {
          const timeStr = ctx.displayTime ? ` ${ctx.displayTime}` : '';
          const isBankTransfer = ['vbank', 'bank', 'bank_transfer', 'bank-transfer'].includes(
            String(paymentMethod || '').toLowerCase()
          );
          const subject = isBankTransfer
            ? `[QUEUING] 무통장 입금 예매 접수 안내 — ${ctx.eventName || ctx.resolvedEventId}`
            : `[QUEUING] 예매 완료 안내 — ${ctx.eventName || ctx.resolvedEventId}`;
          const body = isBankTransfer
            ? `
            <h2>무통장 입금 예매가 접수되었습니다</h2>
            <p>안녕하세요, ${ctx.user.name || userId}님.</p>
            <p>아래 공연의 무통장 입금 예매가 접수되었습니다.</p>
            <p><strong>24시간 이내에 입금이 확인되어야 좌석이 최종 확정됩니다.</strong></p>
            <p>입금 기한 내 입금이 확인되지 않으면 예매가 자동 취소되고 좌석이 다시 예매 가능한 상태로 변경될 수 있습니다.</p>
            <hr>
            <p><strong>공연명:</strong> ${ctx.eventName || ctx.resolvedEventId}</p>
            <p><strong>일시:</strong> ${ctx.displayDate}${timeStr}</p>
            <p><strong>장소:</strong> ${ctx.venue || '미정'}</p>
            <p><strong>좌석:</strong> ${ctx.seatLabel}</p>
            <p><strong>예매자:</strong> ${ctx.user.name || userId}</p>
            <p><strong>입금 기한:</strong> 예매 접수 시각부터 24시간 이내</p>
            <hr>
            <p>가상계좌와 입금 금액은 QUEUING 마이페이지의 예매내역에서 확인해주세요.</p>
            <p>— QUEUING 팀</p>
          `
            : `
            <h2>예매가 완료되었습니다!</h2>
            <p>안녕하세요, ${ctx.user.name || userId}님.</p>
            <p>아래 공연의 예매가 성공적으로 확정되었습니다.</p>
            <hr>
            <p><strong>공연명:</strong> ${ctx.eventName || ctx.resolvedEventId}</p>
            <p><strong>일시:</strong> ${ctx.displayDate}${timeStr}</p>
            <p><strong>장소:</strong> ${ctx.venue || '미정'}</p>
            <p><strong>좌석:</strong> ${ctx.seatLabel}</p>
            <p><strong>예매자:</strong> ${ctx.user.name || userId}</p>
            <p><strong>확정 시각:</strong> ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
            <hr>
            <p>공연 당일 즐거운 시간 보내세요!</p>
            <p>— QUEUING 팀</p>
          `;
          sendEmail(ctx.user.email, subject, body);
        }
      } catch (emailErr) {
        console.error('[Email] 예매 완료 메일 발송 실패:', emailErr.message);
      }
    }

    return reply.status(statusCode).send(result);
  });

  fastify.post('/seats/cancel', userAuth, async (request, reply) => {
    const { userId, seatId } = request.body || {};
    if (!userId || !seatId) {
      return reply.status(400).send({ error: 'userId와 seatId는 필수입니다.' });
    }
    const result = await executeBookingOperation(
      'cancel',
      () => seatService.cancelSeat(userId, seatId),
    );
    const statusCode = result.success ? 200 : 409;

    // 재시도된 동일 환불 요청은 성공으로 응답하되 안내 메일은 한 번만 보낸다.
    if (result.success && !result.idempotent) {
      try {
        const ctx = await getEmailContext(seatId, userId);
        if (ctx) {
          const timeStr = ctx.displayTime ? ` ${ctx.displayTime}` : '';
          sendEmail(ctx.user.email, `[QUEUING] 예매 취소 및 환불 안내 — ${ctx.eventName || ctx.resolvedEventId}`, `
            <h2>예매가 취소되었습니다</h2>
            <p>안녕하세요, ${ctx.user.name || userId}님.</p>
            <p>아래 공연의 예매가 취소 처리되었습니다.</p>
            <hr>
            <p><strong>공연명:</strong> ${ctx.eventName || ctx.resolvedEventId}</p>
            <p><strong>일시:</strong> ${ctx.displayDate}${timeStr}</p>
            <p><strong>장소:</strong> ${ctx.venue || '미정'}</p>
            <p><strong>좌석:</strong> ${ctx.seatLabel}</p>
            <p><strong>취소 시각:</strong> ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
            <hr>
            <p>결제하신 금액은 영업일 기준 3~5일 내 환불 처리됩니다.</p>
            <p>문의 사항이 있으시면 고객센터로 연락해 주세요.</p>
            <p>— QUEUING 팀</p>
          `);
        }
      } catch (emailErr) {
        console.error('[Email] 예매 취소 메일 발송 실패:', emailErr.message);
      }
    }

    return reply.status(statusCode).send(result);
  });

  fastify.post('/seats/release', userAuth, async (request, reply) => {
    const { userId, seatId } = request.body || {};
    if (!userId || !seatId) {
      return reply.status(400).send({ error: 'userId와 seatId는 필수입니다.' });
    }
    const result = await seatService.releaseSeat(userId, seatId);
    const statusCode = result.success ? 200 : 409;
    return reply.status(statusCode).send(result);
  });

  fastify.get('/seats/timer/:seatId', async (request, reply) => {
    const { seatId } = request.params;
    const result = await seatService.getSeatTimer(seatId);
    return reply.send(result);
  });

  fastify.get('/seats/sold-out', async (request, reply) => {
    const { eventId, sessionDate, sessionTime } = request.query || {};
    const result = await seatService.isSoldOut({ eventId, sessionDate, sessionTime });
    return reply.send(result);
  });

  fastify.get('/seats/available', async (request, reply) => {
    const { eventId, sessionDate, sessionTime } = request.query || {};
    const result = await seatService.getAvailableCount(eventId, { sessionDate, sessionTime });
    return reply.send(result);
  });

  fastify.post('/seats/reconcile', adminAuth, async (request, reply) => {
    const { eventId, sessionDate, sessionTime } = request.body || {};
    if (!eventId) return reply.status(400).send({ error: 'eventId가 필요합니다.' });
    const result = await seatService.reconcileSeatCounters(eventId, { sessionDate, sessionTime });
    return reply.send({ success: true, ...result });
  });

  fastify.get('/seats', async (request, reply) => {
    const { eventId, sessionDate, sessionTime } = request.query || {};
    const seats = await seatService.getAllSeats(eventId || undefined, { sessionDate, sessionTime });
    const first = seats[0];
    const meta = {
      eventId: eventId || (first && first.seatId ? first.seatId.split(':')[0] : '') || '',
      sessionDate: first ? first.sessionDate : (sessionDate || ''),
      sessionTime: first ? first.sessionTime : (sessionTime || ''),
    };
    const slim = seats.map(({ sessionDate: _sd, sessionTime: _st, ...rest }) => rest);
    return reply.send({ ...meta, seats: slim, count: slim.length });
  });

  fastify.get('/reservations', adminAuth, async (request, reply) => {
    const reservations = await getAllReservations();
    return reply.send({ reservations, count: reservations.length });
  });

  fastify.get('/reservations/:seatId', adminAuth, async (request, reply) => {
    const { seatId } = request.params;
    const reservations = await getReservationsBySeat(seatId);
    return reply.send({ seatId, reservations });
  });

  fastify.get('/reservations/user/:userId', userAuth, async (request, reply) => {
    const { userId } = request.params;
    const reservations = await getReservationsByUser(userId);
    return reply.send({ userId, reservations, count: reservations.length });
  });
}

module.exports = seatRoutes;
