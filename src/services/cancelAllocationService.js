const pool = require('../config/mariadb');
const { issueCancelLinkToken } = require('./cancelLinkTokenService');

async function createAllocation(userId, seatId, eventId, ttlSeconds = 600, context = {}) {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const sessionDate = context.sessionDate || context.date || '';
  const sessionTime = context.sessionTime || context.time || '';
  const result = await pool.query(
    `INSERT INTO cancel_allocations (user_id, seat_id, event_id, session_date, session_time, status, expires_at)
     VALUES (?, ?, ?, ?, ?, 'LINK_SENT', ?)`,
    [userId, seatId, eventId || '', sessionDate, sessionTime, expiresAt],
  );
  console.log(`[CancelAlloc] 링크 발급: ${userId} → ${seatId} (만료: ${expiresAt.toISOString()})`);
  const allocation = {
    id: Number(result.insertId),
    userId,
    seatId,
    eventId: eventId || '',
    sessionDate,
    sessionTime,
    status: 'LINK_SENT',
    expiresAt: expiresAt.toISOString(),
  };
  allocation.linkToken = issueCancelLinkToken(allocation, expiresAt);
  return allocation;
}

async function markResponded(userId, seatId, eventId = '') {
  const eventFilter = eventId ? ' AND event_id = ?' : '';
  const params = eventId ? [userId, seatId, eventId] : [userId, seatId];
  const result = await pool.query(
    `UPDATE cancel_allocations SET status = 'RESPONDED', responded_at = NOW()
     WHERE user_id = ? AND seat_id = ?${eventFilter} AND status = 'LINK_SENT'
     ORDER BY created_at DESC LIMIT 1`,
    params,
  );
  return { affected: result.affectedRows || 0 };
}

async function markExpired(userId, seatId, eventId = '') {
  const eventFilter = eventId ? ' AND event_id = ?' : '';
  const params = eventId ? [userId, seatId, eventId] : [userId, seatId];
  const result = await pool.query(
    `UPDATE cancel_allocations SET status = 'EXPIRED'
     WHERE user_id = ? AND seat_id = ?${eventFilter} AND status = 'LINK_SENT'
     ORDER BY created_at DESC LIMIT 1`,
    params,
  );
  return { affected: result.affectedRows || 0 };
}

async function expireAllOverdue() {
  const overdue = await pool.query(
    `SELECT user_id, seat_id, event_id, session_date, session_time
     FROM cancel_allocations
     WHERE status = 'LINK_SENT' AND expires_at < UTC_TIMESTAMP()`,
  );
  let expired = 0;
  for (const row of overdue) {
    const result = await markExpired(row.user_id, row.seat_id, row.event_id);
    if (!result.affected) continue;
    expired += 1;
  }
  return {
    expired,
    reassigned: 0,
    message: '만료 처리만 완료했습니다. 다음 취소표 배정은 B파트 파이프라인이 담당합니다.',
  };
}

async function getAllocation(userId, eventId = '', includeExpired = false) {
  const eventFilter = eventId ? ' AND event_id = ?' : '';
  const params = eventId ? [userId, eventId] : [userId];
  const expiryFilter = includeExpired ? '' : ' AND expires_at > UTC_TIMESTAMP()';
  const rows = await pool.query(
    `SELECT allocation_id AS id, user_id, seat_id, event_id, status, created_at, expires_at
     , session_date, session_time
     FROM cancel_allocations
     WHERE user_id = ?${eventFilter} AND status = 'LINK_SENT'${expiryFilter}
     ORDER BY created_at DESC LIMIT 1`,
    params,
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    userId: r.user_id,
    seatId: r.seat_id,
    eventId: r.event_id,
    sessionDate: r.session_date || '',
    sessionTime: r.session_time || '',
    status: r.status,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    expiresAt: r.expires_at instanceof Date ? r.expires_at.toISOString() : r.expires_at,
  };
}

async function getActiveAllocation(userId, eventId = '') {
  return getAllocation(userId, eventId, false);
}

async function expireAllocation(userId, eventId, seatId, context = {}) {
  const allocation = await getAllocation(userId, eventId, true);
  if (!allocation || (seatId && allocation.seatId !== seatId)) {
    return { success: false, message: '활성화된 취소표 할당이 없습니다.' };
  }

  // 결제 화면에서 이미 좌석을 선점했다면 기존 사용자의 선점만 해제한다.
  // 다음 취소표 사용자 배정은 B파트 Step Functions 파이프라인이 담당한다.
  try {
    await require('./seatService').releaseSeat(userId, allocation.seatId);
  } catch (err) {
    console.error('[CancelAlloc] 만료 좌석 해제 실패:', err.message);
  }

  const result = await markExpired(userId, allocation.seatId, eventId);
  if (!result.affected) {
    return { success: false, message: '이미 처리된 취소표 할당입니다.' };
  }

  return {
    success: true,
    expired: allocation,
    next: null,
    message: '취소표 할당이 만료되었습니다. 다음 배정은 B파트 파이프라인이 처리합니다.',
  };
}

async function getAllocationHistory(eventId) {
  const rows = await pool.query(
    `SELECT allocation_id AS id, user_id, seat_id, event_id, session_date, session_time, status, created_at, expires_at, responded_at
     FROM cancel_allocations WHERE event_id = ? ORDER BY created_at DESC`,
    [eventId || ''],
  );
  return rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    seatId: r.seat_id,
    eventId: r.event_id,
    sessionDate: r.session_date || '',
    sessionTime: r.session_time || '',
    status: r.status,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    expiresAt: r.expires_at instanceof Date ? r.expires_at.toISOString() : r.expires_at,
    respondedAt: r.responded_at instanceof Date ? r.responded_at.toISOString() : r.responded_at || null,
  }));
}

module.exports = {
  createAllocation,
  markResponded,
  markExpired,
  expireAllOverdue,
  getActiveAllocation,
  getAllocation,
  getAllocationHistory,
  expireAllocation,
};
