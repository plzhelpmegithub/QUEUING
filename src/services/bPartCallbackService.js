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

async function callbackComplete({ userId, eventId, seatId, allocationId }) {
  const res = await fetch(`${B_CALLBACK_BASE_URL}/verify-link/complete`, {
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
    throw new Error(`B callback /complete ${res.status}: ${body}`);
  }
  return res.json();
}

async function callbackExpire({ userId, eventId, seatId, allocationId }) {
  const res = await fetch(`${B_CALLBACK_BASE_URL}/verify-link/expire`, {
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
    throw new Error(`B callback /expire ${res.status}: ${body}`);
  }
  return res.json();
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

module.exports = { isConfigured, callbackComplete, callbackExpire, saveCallbackToOutbox, relayCallbackOutbox };
