const pool = require('../config/mariadb');

const COMPLETED_STATUSES = new Set(['RESPONDED', 'COMPLETED']);

function isPastExpiry(allocation) {
  if (!allocation || allocation.status !== 'LINK_SENT' || !allocation.expiresAt) return false;
  const expiresAtMs = new Date(allocation.expiresAt).getTime();
  return Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();
}

function toAllocation(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    seatId: row.seat_id,
    eventId: row.event_id,
    sessionDate: row.session_date || '',
    sessionTime: row.session_time || '',
    status: row.status,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at,
    respondedAt: row.responded_at instanceof Date ? row.responded_at.toISOString() : row.responded_at || null,
  };
}

async function getAllocationById(allocationId) {
  if (allocationId === undefined || allocationId === null || allocationId === '') return null;
  const rows = await pool.query(
    `SELECT allocation_id AS id, user_id, seat_id, event_id, status,
            created_at, expires_at, responded_at, session_date, session_time
     FROM cancel_allocations
     WHERE allocation_id = ? LIMIT 1`,
    [allocationId],
  );
  return rows.length ? toAllocation(rows[0]) : null;
}

async function createAllocation({ userId, seatId = null, eventId, sessionDate = '', sessionTime = '', holdDuration = 300, expiresAt }) {
  if (!userId || !eventId || !expiresAt) {
    throw new Error('userId, eventId, expiresAt는 취소표 할당 생성에 필요합니다.');
  }

  const result = await pool.query(
    `INSERT INTO cancel_allocations
       (user_id, seat_id, event_id, hold_duration, session_date, session_time, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 'LINK_SENT', UTC_TIMESTAMP(), ?)`,
    [userId, seatId, eventId, holdDuration, sessionDate, sessionTime, expiresAt],
  );
  return getAllocationById(result.insertId);
}

async function getLatestAllocation(userId, eventId = '') {
  const eventFilter = eventId ? ' AND event_id = ?' : '';
  const params = eventId ? [userId, eventId] : [userId];
  const rows = await pool.query(
    `SELECT allocation_id AS id, user_id, seat_id, event_id, status,
            created_at, expires_at, responded_at, session_date, session_time
     FROM cancel_allocations
     WHERE user_id = ?${eventFilter}
     ORDER BY created_at DESC, allocation_id DESC LIMIT 1`,
    params,
  );
  return rows.length ? toAllocation(rows[0]) : null;
}

async function getActionAllocation(userId, eventId = '') {
  // 아직 처리되지 않은 할당을 우선하고, 없으면 terminal 상태도 반환한다.
  // 중복 complete/expire 요청을 멱등하게 처리하기 위한 조회 순서다.
  return (await getAllocation(userId, eventId, false)) || getLatestAllocation(userId, eventId);
}

async function markRespondedById(allocationId, seatId) {
  const seatUpdate = seatId ? ', seat_id = ?' : '';
  const result = await pool.query(
    `UPDATE cancel_allocations SET status = 'RESPONDED', responded_at = COALESCE(responded_at, UTC_TIMESTAMP())${seatUpdate}
     WHERE allocation_id = ? AND status = 'LINK_SENT'
       AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP())`,
    seatId ? [seatId, allocationId] : [allocationId],
  );

  if ((result.affectedRows || 0) > 0) {
    return {
      affected: result.affectedRows,
      idempotent: false,
      status: 'RESPONDED',
      allocation: await getAllocationById(allocationId),
    };
  }

  const current = await getAllocationById(allocationId);
  if (!current) {
    return { affected: 0, idempotent: false, reason: 'not_found', message: '취소표 할당을 찾을 수 없습니다.' };
  }
  if (COMPLETED_STATUSES.has(current.status)) {
    if (seatId && current.seatId && current.seatId !== seatId) {
      return { affected: 0, idempotent: false, reason: 'seat_mismatch', status: current.status, allocation: current };
    }
    return {
      affected: 0,
      idempotent: true,
      alreadyProcessed: true,
      status: current.status,
      allocation: current,
      message: '이미 완료 처리된 취소표 할당입니다.',
    };
  }
  if (current.status === 'EXPIRED') {
    return {
      affected: 0,
      idempotent: false,
      reason: 'already_expired',
      status: current.status,
      allocation: current,
      message: '이미 만료된 취소표 할당입니다.',
    };
  }
  if (isPastExpiry(current)) {
    return {
      affected: 0,
      idempotent: false,
      reason: 'already_expired',
      status: current.status,
      allocation: current,
      message: '취소표 할당의 제한 시간이 만료되었습니다.',
    };
  }
  return { affected: 0, idempotent: false, reason: 'invalid_status', status: current.status, allocation: current };
}

async function markResponded(userId, seatId, eventId = '') {
  const allocation = await getActionAllocation(userId, eventId);
  if (!allocation) return { affected: 0 };
  return markRespondedById(allocation.id, seatId);
}

async function markExpiredById(allocationId) {
  const result = await pool.query(
    `UPDATE cancel_allocations SET status = 'EXPIRED'
     WHERE allocation_id = ? AND status = 'LINK_SENT'`,
    [allocationId],
  );

  if ((result.affectedRows || 0) > 0) {
    return {
      affected: result.affectedRows,
      idempotent: false,
      status: 'EXPIRED',
      allocation: await getAllocationById(allocationId),
    };
  }

  const current = await getAllocationById(allocationId);
  if (!current) {
    return { affected: 0, idempotent: false, reason: 'not_found', message: '취소표 할당을 찾을 수 없습니다.' };
  }
  if (current.status === 'EXPIRED') {
    return {
      affected: 0,
      idempotent: true,
      alreadyProcessed: true,
      status: current.status,
      allocation: current,
      message: '이미 만료 처리된 취소표 할당입니다.',
    };
  }
  if (COMPLETED_STATUSES.has(current.status)) {
    return {
      affected: 0,
      idempotent: false,
      reason: 'already_completed',
      status: current.status,
      allocation: current,
      message: '이미 완료된 취소표 할당은 만료 처리할 수 없습니다.',
    };
  }
  return { affected: 0, idempotent: false, reason: 'invalid_status', status: current.status, allocation: current };
}

async function markExpired(userId, seatId, eventId = '') {
  const allocation = await getActionAllocation(userId, eventId);
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
    `SELECT allocation_id AS id, user_id, seat_id, event_id, status, created_at, expires_at,
            responded_at, session_date, session_time
     FROM cancel_allocations
     WHERE user_id = ?${eventFilter} AND status = 'LINK_SENT'${expiryFilter}
     ORDER BY created_at DESC LIMIT 1`,
    params,
  );
  if (rows.length === 0) return null;
  return toAllocation(rows[0]);
}

async function getActiveAllocation(userId, eventId = '') {
  return getAllocation(userId, eventId, false);
}

// [보존 / DO NOT DELETE] A파트 좌석 직접 선택 로직.
// B파트가 별도 취소표 사이트를 만들더라도 A파트 API의 local SMTP/fallback
// 흐름을 제거하지 않는다. seat_id가 NULL인 취소표 할당에 사용자가 고른 좌석을 원자적으로 기록한다.
// 이미 다른 좌석이 기록된 동시 요청은 seat_mismatch로 거부하고,
// 같은 좌석의 재시도는 멱등 성공으로 처리한다.
async function assignSeatById(allocationId, seatId) {
  if (allocationId === undefined || allocationId === null || allocationId === '' || !seatId) {
    return { success: false, reason: 'invalid_request', message: 'allocationId와 seatId가 필요합니다.' };
  }

  const result = await pool.query(
    `UPDATE cancel_allocations
     SET seat_id = ?
     WHERE allocation_id = ?
       AND status = 'LINK_SENT'
       AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP())
       AND (seat_id IS NULL OR seat_id = ?)`,
    [seatId, allocationId, seatId],
  );

  if ((result.affectedRows || 0) > 0) {
    return {
      success: true,
      idempotent: false,
      allocation: await getAllocationById(allocationId),
    };
  }

  const current = await getAllocationById(allocationId);
  if (!current) {
    return { success: false, reason: 'not_found', message: '취소표 할당을 찾을 수 없습니다.' };
  }
  if (current.status !== 'LINK_SENT') {
    return {
      success: false,
      reason: current.status === 'EXPIRED' ? 'already_expired' : 'invalid_status',
      status: current.status,
      allocation: current,
    };
  }
  if (isPastExpiry(current)) {
    return { success: false, reason: 'already_expired', status: current.status, allocation: current };
  }
  if (current.seatId && current.seatId === seatId) {
    return { success: true, idempotent: true, allocation: current };
  }
  return { success: false, reason: 'seat_mismatch', allocation: current };
}

async function clearSeatAssignmentById(allocationId, seatId) {
  if (allocationId === undefined || allocationId === null || allocationId === '' || !seatId) return false;
  const result = await pool.query(
    `UPDATE cancel_allocations
     SET seat_id = NULL
     WHERE allocation_id = ? AND status = 'LINK_SENT' AND seat_id = ?`,
    [allocationId, seatId],
  );
  return (result.affectedRows || 0) > 0;
}

async function expireAllocation(userId, eventId, seatId, context = {}) {
  const allocation = await getActionAllocation(userId, eventId);
  if (!allocation) {
    return { success: false, message: '활성화된 취소표 할당이 없습니다.' };
  }
  if (seatId && allocation.seatId && allocation.seatId !== seatId) {
    return { success: false, message: '활성화된 취소표 할당이 없습니다.' };
  }

  if (allocation.status !== 'LINK_SENT') {
    if (allocation.status === 'EXPIRED') {
      return {
        success: true,
        idempotent: true,
        alreadyProcessed: true,
        expired: allocation,
        next: null,
        message: '이미 만료 처리된 취소표 할당입니다.',
      };
    }
    return {
      success: false,
      reason: 'already_completed',
      status: allocation.status,
      message: '이미 완료된 취소표 할당은 만료 처리할 수 없습니다.',
    };
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
  if (!result.affected && !result.idempotent) {
    return { success: false, message: '이미 처리된 취소표 할당입니다.' };
  }

  return {
    success: true,
    idempotent: !!result.idempotent,
    alreadyProcessed: !!result.idempotent,
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
  markRespondedById,
  markExpired,
  markExpiredById,
  expireAllOverdue,
  getActiveAllocation,
  assignSeatById,
  clearSeatAssignmentById,
  getAllocationById,
  getAllocation,
  getActionAllocation,
  getLatestAllocation,
  getAllocationHistory,
  expireAllocation,
};
