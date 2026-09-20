const pool = require('../config/mariadb');

const B_CALLBACK_BASE_URL = (process.env.B_CALLBACK_BASE_URL || '').replace(/\/+$/, '');
const B_CALLBACK_SECRET = (process.env.B_CALLBACK_SECRET || '').trim();
const MAX_RETRY = 5;

function isConfigured() {
  return !!B_CALLBACK_BASE_URL;
}

function buildHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (B_CALLBACK_SECRET) {
    headers['X-Callback-Secret'] = B_CALLBACK_SECRET;
  }
  return headers;
}

async function readJsonBody(res) {
  const text = await res.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    return {};
  }
}

async function callbackVerifyLink(token) {
  const res = await fetch(`${B_CALLBACK_BASE_URL}/b-callback/verify-link`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ token }),
  });

  const bodyText = await res.text().catch(() => '');
  let body = {};
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch (_) {
    body = {};
  }

  if (!res.ok) {
    const error = new Error(`B callback /b-callback/verify-link ${res.status}`);
    error.status = res.status;
    error.reason = body.reason || '';
    throw error;
  }
  return body;
}

async function resolveReservationId({ reservationId, userId, eventId, seatId }) {
  if (reservationId !== undefined && reservationId !== null && reservationId !== '') {
    return reservationId;
  }

  // 이전 버전이 reservationId 없이 저장한 outbox도 재시도 시 복구한다.
  // 완료 콜백은 실제 확정 예약이 있는 경우에만 B파트로 전달해야 한다.
  const rows = await pool.query(
    `SELECT reservation_id
     FROM reservations
     WHERE reservation_id IS NOT NULL
       AND user_id = ?
       AND event_id = ?
       AND seat_id = ?
       AND status = 'CONFIRMED'
     ORDER BY reserved_at DESC, reservation_id DESC
     LIMIT 1`,
    [userId, eventId, seatId],
  );
  return rows[0]?.reservation_id || null;
}

async function callbackComplete(payload = {}) {
  const {
    userId,
    eventId,
    seatId,
    allocationId,
  } = payload;
  const reservationId = await resolveReservationId({
    reservationId: payload.reservationId ?? payload.reservation_id,
    userId,
    eventId,
    seatId,
  });
  if (!reservationId) {
    const error = new Error('B complete callback requires a confirmed reservation_id');
    error.code = 'reservation_id_missing';
    throw error;
  }

  // ALB listener rules expose all B Lambda callbacks below /b-callback.
  // Keep this prefix aligned with callbackVerifyLink so completion requests
  // do not fall through to the frontend/API default target group.
  const res = await fetch(`${B_CALLBACK_BASE_URL}/b-callback/verify-link/complete`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      user_id: userId,
      event_id: eventId,
      seat_id: seatId,
      allocation_id: allocationId,
      reservation_id: reservationId,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`B callback /b-callback/verify-link/complete ${res.status}: ${body}`);
  }
  return readJsonBody(res);
}

async function callbackExpire({ userId, eventId, seatId, allocationId }) {
  const res = await fetch(`${B_CALLBACK_BASE_URL}/b-callback/verify-link/expire`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      user_id: userId,
      event_id: eventId,
      seat_id: seatId,
      allocation_id: allocationId,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`B callback /b-callback/verify-link/expire ${res.status}: ${body}`);
  }
  return readJsonBody(res);
}

async function saveCallbackToOutbox(action, payload, errorMessage = '') {
  try {
    await pool.query(
      `INSERT INTO callback_outbox (action, payload, status, attempts, last_error)
       VALUES (?, ?, 'PENDING', 0, ?)`,
      [action, JSON.stringify(payload), errorMessage],
    );
    console.warn(`[BCallback] outbox 저장: ${action} allocation=${payload.allocationId}`);
  } catch (err) {
    console.error(`[BCallback] outbox 저장 실패:`, err.message);
  }
}

async function relayCallbackOutbox() {
  if (!B_CALLBACK_BASE_URL) return { relayed: 0, failed: 0 };

  let pending;
  try {
    pending = await pool.query(
      `SELECT id, action, payload, attempts FROM callback_outbox
       WHERE status = 'PENDING' AND attempts < ?
       ORDER BY created_at LIMIT 50`,
      [MAX_RETRY],
    );
  } catch (err) {
    return { relayed: 0, failed: 0 };
  }

  let relayed = 0;
  let failed = 0;

  for (const row of pending) {
    const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    const callbackFn = row.action === 'complete' ? callbackComplete : callbackExpire;
    try {
      await callbackFn(payload);
      await pool.query(
        `UPDATE callback_outbox SET status = 'SENT', sent_at = UTC_TIMESTAMP() WHERE id = ?`,
        [row.id],
      );
      relayed += 1;
    } catch (err) {
      const newAttempts = (row.attempts || 0) + 1;
      const newStatus = newAttempts >= MAX_RETRY ? 'FAILED' : 'PENDING';
      await pool.query(
        `UPDATE callback_outbox SET attempts = ?, last_error = ?, status = ? WHERE id = ?`,
        [newAttempts, err.message, newStatus, row.id],
      );
      failed += 1;
    }
  }

  if (relayed > 0 || failed > 0) {
    console.log(`[BCallback] outbox relay: ${relayed}건 발행, ${failed}건 실패`);
  }
  return { relayed, failed };
}

module.exports = {
  isConfigured,
  callbackVerifyLink,
  callbackComplete,
  callbackExpire,
  saveCallbackToOutbox,
  relayCallbackOutbox,
};
