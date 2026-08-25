const pool = require('../config/mariadb');

async function subscribe(userId, plan = 'monthly') {
  const durationDays = plan === 'yearly' ? 365 : 30;
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

  const existing = await pool.query(
    `SELECT id FROM memberships WHERE user_id = ? AND is_membership = TRUE AND expires_at > NOW()`,
    [userId],
  );
  if (existing.length > 0) {
    return { success: false, message: '이미 활성 멤버십이 있습니다.' };
  }

  await pool.query(
    `INSERT INTO memberships (user_id, is_membership, plan, expires_at, priority_level) VALUES (?, TRUE, ?, ?, ?)`,
    [userId, plan, expiresAt, plan === 'yearly' ? 2 : 1],
  );
  console.log(`[Membership] 구독: ${userId} (${plan})`);
  return { success: true, userId, plan, expiresAt: expiresAt.toISOString(), message: '멤버십 구독이 완료되었습니다.' };
}

async function getMembership(userId) {
  const rows = await pool.query(
    `SELECT id, user_id, is_membership, plan, expires_at, priority_level, created_at
     FROM memberships WHERE user_id = ? AND is_membership = TRUE AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  if (rows.length === 0) {
    return { isMembership: false, message: '활성 멤버십이 없습니다.' };
  }
  const m = rows[0];
  return {
    isMembership: true,
    plan: m.plan,
    priorityLevel: m.priority_level,
    expiresAt: m.expires_at instanceof Date ? m.expires_at.toISOString() : m.expires_at,
    createdAt: m.created_at instanceof Date ? m.created_at.toISOString() : m.created_at,
  };
}

async function cancelMembership(userId) {
  const result = await pool.query(
    `UPDATE memberships SET is_membership = FALSE WHERE user_id = ? AND is_membership = TRUE AND expires_at > NOW()`,
    [userId],
  );
  if (result.affectedRows === 0) {
    return { success: false, message: '활성 멤버십이 없습니다.' };
  }
  console.log(`[Membership] 해지: ${userId}`);
  return { success: true, message: '멤버십이 해지되었습니다.' };
}

async function isPriorityUser(userId) {
  const rows = await pool.query(
    `SELECT priority_level FROM memberships WHERE user_id = ? AND is_membership = TRUE AND expires_at > NOW() LIMIT 1`,
    [userId],
  );
  return rows.length > 0 ? rows[0].priority_level : 0;
}

module.exports = { subscribe, getMembership, cancelMembership, isPriorityUser };
