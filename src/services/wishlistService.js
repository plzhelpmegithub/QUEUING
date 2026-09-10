const pool = require('../config/mariadb');

async function addWishlist(userId, eventId) {
  try {
    await pool.query(
      `INSERT INTO wishlists (user_id, event_id) VALUES (?, ?)`,
      [userId, eventId],
    );
    return { success: true, message: '위시리스트에 추가되었습니다.' };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return { success: false, message: '이미 위시리스트에 등록된 공연입니다.' };
    }
    throw err;
  }
}

async function removeWishlist(userId, eventId) {
  const result = await pool.query(
    `DELETE FROM wishlists WHERE user_id = ? AND event_id = ?`,
    [userId, eventId],
  );
  if (result.affectedRows === 0) {
    return { success: false, message: '위시리스트에 없는 공연입니다.' };
  }
  return { success: true, message: '위시리스트에서 제거되었습니다.' };
}

async function getWishlistByUser(userId) {
  const rows = await pool.query(
    `SELECT event_id, created_at FROM wishlists WHERE user_id = ? ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map(r => ({
    eventId: r.event_id,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  }));
}

async function isWishlisted(userId, eventId) {
  const rows = await pool.query(
    `SELECT id FROM wishlists WHERE user_id = ? AND event_id = ? LIMIT 1`,
    [userId, eventId],
  );
  return rows.length > 0;
}

async function getWishlistCount(eventId) {
  const rows = await pool.query(
    `SELECT COUNT(*) as cnt FROM wishlists WHERE event_id = ?`,
    [eventId],
  );
  return Number(rows[0]?.cnt) || 0;
}

async function getAllWishlistCounts() {
  const rows = await pool.query(
    `SELECT event_id, COUNT(*) as cnt FROM wishlists GROUP BY event_id`,
  );
  const counts = {};
  for (const row of rows) {
    counts[row.event_id] = Number(row.cnt) || 0;
  }
  return counts;
}

module.exports = { addWishlist, removeWishlist, getWishlistByUser, isWishlisted, getWishlistCount, getAllWishlistCounts };
