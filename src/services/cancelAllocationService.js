const pool = require('../config/mariadb');

async function createAllocation(userId, seatId, eventId, ttlSeconds = 600) {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const result = await pool.query(
    `INSERT INTO cancel_allocations (user_id, seat_id, event_id, status, expires_at) VALUES (?, ?, ?, 'LINK_SENT', ?)`,
    [userId, seatId, eventId || '', expiresAt],
  );
  console.log(`[CancelAlloc] 링크 발급: ${userId} → ${seatId} (만료: ${expiresAt.toISOString()})`);
  return {
    id: Number(result.insertId),
    userId,
    seatId,
    status: 'LINK_SENT',
    expiresAt: expiresAt.toISOString(),
  };
}

async function markResponded(userId, seatId) {
  const result = await pool.query(
    `UPDATE cancel_allocations SET status = 'RESPONDED', responded_at = NOW()
     WHERE user_id = ? AND seat_id = ? AND status = 'LINK_SENT'
     ORDER BY created_at DESC LIMIT 1`,
    [userId, seatId],
  );
  return { affected: result.affectedRows || 0 };
}

async function markExpired(userId, seatId) {
  const result = await pool.query(
    `UPDATE cancel_allocations SET status = 'EXPIRED'
     WHERE user_id = ? AND seat_id = ? AND status = 'LINK_SENT'
     ORDER BY created_at DESC LIMIT 1`,
    [userId, seatId],
  );
  return { affected: result.affectedRows || 0 };
}

async function expireAllOverdue() {
  const result = await pool.query(
    `UPDATE cancel_allocations SET status = 'EXPIRED'
     WHERE status = 'LINK_SENT' AND expires_at < NOW()`,
  );
  return { expired: result.affectedRows || 0 };
}

async function getActiveAllocation(userId) {
  const rows = await pool.query(
    `SELECT id, user_id, seat_id, event_id, status, created_at, expires_at
     FROM cancel_allocations
     WHERE user_id = ? AND status = 'LINK_SENT' AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    userId: r.user_id,
    seatId: r.seat_id,
    eventId: r.event_id,
    status: r.status,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    expiresAt: r.expires_at instanceof Date ? r.expires_at.toISOString() : r.expires_at,
  };
}

async function getAllocationHistory(eventId) {
  const rows = await pool.query(
    `SELECT id, user_id, seat_id, status, created_at, expires_at, responded_at
     FROM cancel_allocations WHERE event_id = ? ORDER BY created_at DESC`,
    [eventId || ''],
  );
  return rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    seatId: r.seat_id,
    status: r.status,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    expiresAt: r.expires_at instanceof Date ? r.expires_at.toISOString() : r.expires_at,
    respondedAt: r.responded_at instanceof Date ? r.responded_at.toISOString() : r.responded_at || null,
  }));
}

module.exports = { createAllocation, markResponded, markExpired, expireAllOverdue, getActiveAllocation, getAllocationHistory };
