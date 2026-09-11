const pool = require('../config/mariadb');

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
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      is_membership BOOLEAN NOT NULL DEFAULT TRUE,
      plan VARCHAR(20) NOT NULL DEFAULT 'monthly',
      expires_at DATETIME NOT NULL,
      priority_level INT NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (user_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      event_id VARCHAR(50) PRIMARY KEY,
      event_name VARCHAR(200) NOT NULL,
      event_date VARCHAR(50) DEFAULT '',
      sessions JSON NULL,
      venue VARCHAR(200) DEFAULT '',
      total_seats INT NOT NULL DEFAULT 0,
      seating_type VARCHAR(20) DEFAULT 'arena',
      sections JSON NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      ticket_open_at DATETIME NULL,
      ticket_close_at DATETIME NULL,
      emoji VARCHAR(10) DEFAULT '',
      color VARCHAR(50) DEFAULT '',
      cancel_reason TEXT NULL,
      cancelled_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL
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
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      event_id VARCHAR(50) NOT NULL DEFAULT '',
      session_date VARCHAR(50) DEFAULT '',
      session_time VARCHAR(10) DEFAULT '',
      queue_type VARCHAR(20) NOT NULL DEFAULT 'eligible',
      queue_index INT NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'WAITING',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL,
      INDEX idx_user (user_id),
      INDEX idx_event (event_id),
      INDEX idx_status (status)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cancel_allocations (
      allocation_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      seat_id VARCHAR(100) NOT NULL DEFAULT '',
      event_id VARCHAR(50) NOT NULL DEFAULT '',
      session_date VARCHAR(50) DEFAULT '',
      session_time VARCHAR(10) DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'LINK_SENT',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NULL,
      responded_at DATETIME NULL,
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
      id INT AUTO_INCREMENT PRIMARY KEY,
      seat_id VARCHAR(100) NOT NULL DEFAULT '',
      user_id VARCHAR(50) NOT NULL DEFAULT '',
      event_id VARCHAR(50) NOT NULL DEFAULT '',
      session_date VARCHAR(50) DEFAULT '',
      session_time VARCHAR(10) DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED',
      reserved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      cancelled_at DATETIME NULL,
      INDEX idx_seat (seat_id),
      INDEX idx_user (user_id),
      INDEX idx_event (event_id)
    )
  `);
  console.log('[MariaDB] 전체 테이블 (9개) 준비 완료');
}

function toItem(row) {
  return {
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
  await pool.query(
    `INSERT INTO reservations (seat_id, user_id, event_id, session_date, session_time, status, reserved_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [data.seatId, data.userId, data.eventId || '', data.sessionDate || '', data.sessionTime || '', 'CONFIRMED', reservedAt],
  );
  console.log(`[MariaDB] 예약 저장: ${data.seatId} → ${data.userId}`);
  return { seatId: data.seatId, userId: data.userId, eventId: data.eventId || '', sessionDate: data.sessionDate || '', sessionTime: data.sessionTime || '', status: 'CONFIRMED', reservedAt: reservedAt.toISOString() };
}

async function getReservationsBySeat(seatId) {
  const rows = await pool.query(
    `SELECT seat_id, user_id, event_id, session_date, session_time, status, reserved_at, cancelled_at FROM reservations WHERE seat_id = ? ORDER BY reserved_at`,
    [seatId],
  );
  return rows.map(toItem);
}

async function getAllReservations() {
  const rows = await pool.query(`SELECT seat_id, user_id, event_id, session_date, session_time, status, reserved_at, cancelled_at FROM reservations`);
  return rows.map(toItem);
}

async function getReservationsByUser(userId) {
  const rows = await pool.query(
    `SELECT seat_id, user_id, event_id, session_date, session_time, status, reserved_at, cancelled_at FROM reservations WHERE user_id = ? ORDER BY reserved_at DESC`,
    [userId],
  );
  return rows.map(toItem);
}

async function cancelReservation(seatId, userId) {
  const result = await pool.query(
    `UPDATE reservations SET status = 'CANCELLED', cancelled_at = NOW()
     WHERE seat_id = ? AND user_id = ? AND status != 'CANCELLED'
     ORDER BY reserved_at DESC LIMIT 1`,
    [seatId, userId],
  );
  console.log(`[MariaDB] 예약 취소: ${seatId} (${userId})`);
  return { affected: result.affectedRows || 0 };
}

module.exports = {
  initTable,
  saveReservation,
  getReservationsBySeat,
  getAllReservations,
  getReservationsByUser,
  cancelReservation,
};
