const pool = require('../config/mariadb');

async function markRespondedById(allocationId, seatId) {
  const seatUpdate = seatId ? ', seat_id = ?' : '';
  const params = seatId ? [allocationId, seatId] : [allocationId];
  const result = await pool.query(
    `UPDATE cancel_allocations SET status = 'RESPONDED', responded_at = NOW()${seatUpdate}
     WHERE allocation_id = ? AND status = 'LINK_SENT'`,
    seatId ? [seatId, allocationId] : [allocationId],
  );
  return { affected: result.affectedRows || 0 };
}

async function markResponded(userId, seatId, eventId = '') {
  const allocation = await getAllocation(userId, eventId, false);
  if (!allocation) return { affected: 0 };
  return markRespondedById(allocation.id, seatId);
}

async function markExpiredById(allocationId) {
  const result = await pool.query(
    `UPDATE cancel_allocations SET status = 'EXPIRED'
     WHERE allocation_id = ? AND status = 'LINK_SENT'`,
    [allocationId],
  );
  return { affected: result.affectedRows || 0 };
}

async function markExpired(userId, seatId, eventId = '') {
  const allocation = await getAllocation(userId, eventId, true);
  if (!allocation) return { affected: 0 };
  return markExpiredById(allocation.id);
}

async function expireAllOverdue() {
  const result = await pool.query(
    `UPDATE cancel_allocations SET status = 'EXPIRED'
     WHERE status = 'LINK_SENT' AND expires_at < UTC_TIMESTAMP()`,
  );
  const expired = result.affectedRows || 0;
  if (expired > 0) {
    console.log(`[CancelAlloc] 만료 일괄 처리: ${expired}건`);
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
  if (!allocation) {
    return { success: false, message: '활성화된 취소표 할당이 없습니다.' };
  }
  if (seatId && allocation.seatId && allocation.seatId !== seatId) {
    return { success: false, message: '활성화된 취소표 할당이 없습니다.' };
  }

  const effectiveSeatId = seatId || allocation.seatId;
  if (effectiveSeatId) {
    try {
      await require('./seatService').releaseSeat(userId, effectiveSeatId);
    } catch (err) {
      console.error('[CancelAlloc] 만료 좌석 해제 실패:', err.message);
    }
  }

  const result = await markExpiredById(allocation.id);
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
  markResponded,
  markRespondedById,
  markExpired,
  markExpiredById,
  expireAllOverdue,
  getActiveAllocation,
  getAllocation,
  getAllocationHistory,
  expireAllocation,
};
