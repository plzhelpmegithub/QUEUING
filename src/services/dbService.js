const pool = require('../config/mariadb');

// 운영/기존 데이터에서 사용될 수 있는 확정 예약 상태를 모두 허용한다.
// 신규 저장은 CONFIRMED를 사용하지만, 이전 버전에서 RESERVED 또는 PAID로
// 저장된 예약도 소유자 본인이 환불할 수 있어야 한다.
const ACTIVE_RESERVATION_STATUSES = ['CONFIRMED', 'RESERVED', 'PAID'];

async function initTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id VARCHAR(50) PRIMARY KEY,
      password VARCHAR(255) NOT NULL DEFAULT '',
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      email VARCHAR(255) DEFAULT '',
      name VARCHAR(50) DEFAULT '',
      phone VARCHAR(20) DEFAULT '',
      birth_date DATE NULL,
      marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS memberships (
      membership_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(100) NOT NULL,
      tier_name VARCHAR(50) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_membership BOOLEAN NOT NULL DEFAULT TRUE,
      plan VARCHAR(20) NOT NULL DEFAULT 'monthly',
      priority_level INT NOT NULL DEFAULT 1,
      INDEX idx_user (user_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      event_id VARCHAR(100) PRIMARY KEY,
      title VARCHAR(200) NOT NULL DEFAULT '',
      description TEXT NULL,
      event_date VARCHAR(50) DEFAULT '',
      venue VARCHAR(100) DEFAULT '',
      total_seats INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      event_name VARCHAR(200) NOT NULL,
      seating_type VARCHAR(20) DEFAULT 'arena',
      sections JSON NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      ticket_open_at DATETIME NULL,
      emoji VARCHAR(10) DEFAULT '',
      color VARCHAR(50) DEFAULT '',
      cancel_reason TEXT NULL,
      cancelled_at DATETIME NULL,
      updated_at DATETIME NULL,
      ticket_close_at DATETIME NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS seats (
      id INT AUTO_INCREMENT PRIMARY KEY,
      seat_id VARCHAR(100) NOT NULL DEFAULT '',
      event_id VARCHAR(50) NOT NULL DEFAULT '',
      session_date VARCHAR(50) DEFAULT '',
      session_time VARCHAR(10) DEFAULT '',
      section VARCHAR(20) DEFAULT '',
      price INT NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
      held_by VARCHAR(50) DEFAULT '',
      held_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_seat (seat_id),
      INDEX idx_event (event_id),
      INDEX idx_status (status)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS waiting_queue (
      queue_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      event_id VARCHAR(50) NOT NULL DEFAULT '',
      session_date VARCHAR(50) DEFAULT '',
      session_time VARCHAR(10) DEFAULT '',
      queue_type VARCHAR(20) NOT NULL DEFAULT 'eligible',
      queue_index INT NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'WAITING',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL,
      membership_at_join TINYINT(1) NOT NULL DEFAULT 0,
      INDEX idx_user (user_id),
      INDEX idx_event (event_id),
      INDEX idx_status (status)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cancel_allocations (
      allocation_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(100) NOT NULL,
      seat_id VARCHAR(50) NULL,
      event_id VARCHAR(100) NOT NULL,
      hold_duration INT NULL,
      session_date VARCHAR(50) DEFAULT '',
      session_time VARCHAR(10) DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'LINK_SENT',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NULL,
      responded_at DATETIME NULL,
      failed_at DATETIME NULL,
      INDEX idx_user (user_id),
      INDEX idx_status (status),
      INDEX idx_expires (expires_at)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wishlists (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      event_id VARCHAR(50) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_event (user_id, event_id),
      INDEX idx_user (user_id),
      INDEX idx_event (event_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS backups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      backup_type VARCHAR(50) NOT NULL DEFAULT '',
      event_id VARCHAR(50) DEFAULT '',
      data JSON NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_type (backup_type),
      INDEX idx_event (event_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reservations (
      reservation_id INT AUTO_INCREMENT PRIMARY KEY,
      seat_id VARCHAR(100) NOT NULL DEFAULT '',
      user_id VARCHAR(50) NOT NULL DEFAULT '',
      event_id VARCHAR(50) NOT NULL DEFAULT '',
      session_date VARCHAR(50) DEFAULT '',
      session_time VARCHAR(10) DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED',
      reserved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      cancelled_at DATETIME NULL,
      reservation_status VARCHAR(20) DEFAULT 'PENDING',
      payment_method VARCHAR(20) DEFAULT NULL,
      INDEX idx_seat (seat_id),
      INDEX idx_user (user_id),
      INDEX idx_event (event_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cancellation_outbox (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event_payload LONGTEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      attempts INT NOT NULL DEFAULT 0,
      last_error TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME NULL,
      INDEX idx_status (status)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS callback_outbox (
      id INT AUTO_INCREMENT PRIMARY KEY,
      action VARCHAR(50) NOT NULL,
      payload LONGTEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      attempts INT NOT NULL DEFAULT 0,
      last_error TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME NULL,
      INDEX idx_status (status)
    )
  `);
  // [보존 / LAST LOCAL SIMULATION]
  // B파트의 cancel_allocations 스키마를 변경하지 않고, A파트 로컬에서만
  // 회차별 취소표 풀·후보 순번을 재현하기 위한 전용 테이블이다.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cancel_last_campaigns (
      campaign_id VARCHAR(80) PRIMARY KEY,
      event_id VARCHAR(100) NOT NULL,
      session_date VARCHAR(50) NOT NULL DEFAULT '',
      session_time VARCHAR(10) NOT NULL DEFAULT '',
      pool_size INT NOT NULL DEFAULT 100,
      status VARCHAR(30) NOT NULL DEFAULT 'INITIALIZED',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      open_at DATETIME NULL,
      closed_at DATETIME NULL,
      issued_at DATETIME NULL,
      INDEX idx_last_campaign_session (event_id, session_date, session_time),
      INDEX idx_last_campaign_status (status)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cancel_last_pool_seats (
      campaign_id VARCHAR(80) NOT NULL,
      seat_id VARCHAR(100) NOT NULL,
      section VARCHAR(50) DEFAULT '',
      price INT NOT NULL DEFAULT 0,
      original_status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
      status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (campaign_id, seat_id),
      INDEX idx_last_pool_status (campaign_id, status)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cancel_last_candidates (
      campaign_id VARCHAR(80) NOT NULL,
      sequence_no INT NOT NULL,
      queue_id INT NOT NULL,
      user_id VARCHAR(100) NOT NULL,
      queue_index INT NOT NULL DEFAULT 0,
      allocation_id INT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'WAITING',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (campaign_id, user_id),
      UNIQUE KEY uk_last_candidate_sequence (campaign_id, sequence_no),
      INDEX idx_last_candidate_status (campaign_id, status),
      INDEX idx_last_candidate_queue (campaign_id, queue_index)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cancel_last_history (
      history_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      allocation_id INT NULL,
      campaign_id VARCHAR(80) NULL,
      user_id VARCHAR(100) NOT NULL,
      event_id VARCHAR(100) NOT NULL,
      session_date VARCHAR(50) NOT NULL DEFAULT '',
      session_time VARCHAR(10) NOT NULL DEFAULT '',
      seat_id VARCHAR(100) NULL,
      action VARCHAR(30) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_last_history_allocation_action (allocation_id, action),
      INDEX idx_last_history_user (user_id, created_at),
      INDEX idx_last_history_campaign (campaign_id)
    )
  `);
  console.log('[MariaDB] 전체 테이블 + Last 로컬 시뮬레이션 테이블 준비 완료');
}

function toItem(row) {
  return {
    reservationId: row.reservation_id || null,
    seatId: row.seat_id,
    userId: row.user_id,
    eventId: row.event_id || '',
    sessionDate: row.session_date || '',
    sessionTime: row.session_time || '',
    status: row.status,
    reservedAt: row.reserved_at instanceof Date ? row.reserved_at.toISOString() : row.reserved_at,
    cancelledAt: row.cancelled_at instanceof Date ? row.cancelled_at.toISOString() : row.cancelled_at || null,
  };
}

async function saveReservation(data) {
  const reservedAt = new Date();
  const insertResult = await pool.query(
    `INSERT INTO reservations (seat_id, user_id, event_id, session_date, session_time, status, reserved_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [data.seatId, data.userId, data.eventId || '', data.sessionDate || '', data.sessionTime || '', 'CONFIRMED', reservedAt],
  );
  console.log(`[MariaDB] 예약 저장: ${data.seatId} → ${data.userId}`);
  return { reservationId: insertResult.insertId || null, seatId: data.seatId, userId: data.userId, eventId: data.eventId || '', sessionDate: data.sessionDate || '', sessionTime: data.sessionTime || '', status: 'CONFIRMED', reservedAt: reservedAt.toISOString() };
}

async function getReservationsBySeat(seatId) {
  const rows = await pool.query(
    `SELECT reservation_id, seat_id, user_id, event_id, session_date, session_time, status, reserved_at, cancelled_at FROM reservations WHERE seat_id = ? ORDER BY reserved_at`,
    [seatId],
  );
  return rows.map(toItem);
}

async function getAllReservations() {
  const rows = await pool.query(`SELECT reservation_id, seat_id, user_id, event_id, session_date, session_time, status, reserved_at, cancelled_at FROM reservations`);
  return rows.map(toItem);
}

async function getReservationsByUser(userId) {
  const rows = await pool.query(
    `SELECT reservation_id, seat_id, user_id, event_id, session_date, session_time, status, reserved_at, cancelled_at FROM reservations WHERE user_id = ? ORDER BY reserved_at DESC`,
    [userId],
  );
  return rows.map(toItem);
}

async function cancelReservation(seatId, userId) {
  const connection = await pool.getConnection();
  const activeStatusPlaceholders = ACTIVE_RESERVATION_STATUSES.map(() => '?').join(', ');
  try {
    await connection.beginTransaction();

    // Redis의 좌석 상태가 아니라 가장 최근의 MariaDB 확정 예약을 소유권과
    // 환불 가능 여부의 기준으로 사용한다. 같은 좌석이 재판매된 뒤 이전
    // 구매자가 다시 취소하는 경우를 막기 위해 user_id 조건보다 먼저 현재
    // 활성 예약자를 잠근다.
    const activeRows = await connection.query(
      `SELECT reservation_id, seat_id, user_id, event_id, session_date, session_time,
              status, reserved_at, cancelled_at
       FROM reservations
       WHERE seat_id = ? AND status IN (${activeStatusPlaceholders})
       ORDER BY reserved_at DESC, reservation_id DESC
       LIMIT 1 FOR UPDATE`,
      [seatId, ...ACTIVE_RESERVATION_STATUSES],
    );

    if (activeRows.length === 0) {
      const previousRows = await connection.query(
        `SELECT reservation_id, seat_id, user_id, event_id, session_date, session_time,
                status, reserved_at, cancelled_at
         FROM reservations
         WHERE seat_id = ? AND user_id = ?
         ORDER BY reserved_at DESC, reservation_id DESC
         LIMIT 1`,
        [seatId, userId],
      );
      await connection.commit();

      const previous = previousRows[0];
      if (previous && previous.status === 'CANCELLED') {
        return {
          affected: 0,
          idempotent: true,
          reservationId: previous.reservation_id,
          reservation: toItem(previous),
        };
      }
      return { affected: 0, idempotent: false, reason: 'not_found' };
    }

    const active = activeRows[0];
    if (String(active.user_id) !== String(userId)) {
      await connection.rollback();
      return { affected: 0, idempotent: false, reason: 'not_owner' };
    }

    const seatRows = await connection.query(
      `SELECT seat_id, event_id, session_date, session_time, section, price, status
       FROM seats WHERE seat_id = ? LIMIT 1 FOR UPDATE`,
      [seatId],
    );

    const updateResult = await connection.query(
      `UPDATE reservations
       SET status = 'CANCELLED', cancelled_at = NOW()
       WHERE reservation_id = ? AND status IN (${activeStatusPlaceholders})`,
      [active.reservation_id, ...ACTIVE_RESERVATION_STATUSES],
    );
    if (Number(updateResult.affectedRows) !== 1) {
      await connection.rollback();
      return { affected: 0, idempotent: false, reason: 'conflict' };
    }

    await connection.query(
      `UPDATE seats
       SET status = 'AVAILABLE', held_by = '', held_at = NULL
       WHERE seat_id = ?`,
      [seatId],
    );
    await connection.commit();

    const cancelledAt = new Date();
    const reservation = toItem({
      ...active,
      status: 'CANCELLED',
      cancelled_at: cancelledAt,
    });
    const seat = seatRows[0]
      ? {
          seatId: seatRows[0].seat_id,
          eventId: seatRows[0].event_id || reservation.eventId,
          sessionDate: seatRows[0].session_date || reservation.sessionDate,
          sessionTime: seatRows[0].session_time || reservation.sessionTime,
          section: seatRows[0].section || '',
          price: Number(seatRows[0].price) || 0,
          previousStatus: seatRows[0].status || '',
        }
      : null;

    console.log(`[MariaDB] 예약 취소: ${seatId} (${userId}) reservation_id=${active.reservation_id}`);
    return {
      affected: 1,
      idempotent: false,
      reservationId: active.reservation_id,
      reservation,
      seat,
    };
  } catch (err) {
    await connection.rollback().catch(() => {});
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = {
  initTable,
  saveReservation,
  getReservationsBySeat,
  getAllReservations,
  getReservationsByUser,
  cancelReservation,
};
