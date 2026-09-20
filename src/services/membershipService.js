const pool = require('../config/mariadb');
const { sendEmail, wrapEmailHtml } = require('./notificationService');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatKoreanDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '미정');
  return date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

async function getUserContact(userId) {
  const rows = await pool.query(
    `SELECT email, name FROM users WHERE user_id = ? LIMIT 1`,
    [userId],
  );
  return rows[0] || null;
}

async function sendMembershipEmail({ userId, type, plan, expiresAt }) {
  try {
    const user = await getUserContact(userId);
    if (!user?.email) {
      console.warn(`[Membership] ${type} 안내 메일 수신자 이메일 없음: ${userId}`);
      return { emailSent: false, emailReason: 'recipient_email_missing' };
    }

    const displayName = escapeHtml(user.name || userId);
    const planLabel = plan === 'yearly' ? '연간 멤버십' : '월간 멤버십';
    const subject = type === 'subscribed'
      ? '[QUEUING] 멤버십 가입 완료 안내'
      : '[QUEUING] 멤버십 해지 완료 안내';
    const body = type === 'subscribed'
      ? wrapEmailHtml({
          title: '멤버십 가입 완료',
          contentHtml: `
            <p style="margin:0 0 16px; font-size:16px; color:#18181b; line-height:1.6;">
              안녕하세요, <strong>${displayName}</strong>님.<br>
              QUEUING ${planLabel} 가입이 정상적으로 완료되었습니다.
            </p>
            <div style="background-color:#f9fafb; border-radius:8px; padding:16px; margin:20px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; font-size:14px; color:#374151;">
                <tr><td style="padding:4px 0;"><strong>가입 유형</strong></td><td style="padding:4px 0;">${planLabel}</td></tr>
                <tr><td style="padding:4px 0;"><strong>이용 만료일</strong></td><td style="padding:4px 0;">${escapeHtml(formatKoreanDate(expiresAt))}</td></tr>
              </table>
            </div>
            <p style="margin:0; font-size:14px; color:#18181b; line-height:1.6;">
              멤버십 전용 취소표 대기열 및 관련 혜택을 이용하실 수 있습니다.
            </p>`,
        })
      : wrapEmailHtml({
          title: '멤버십 해지 완료',
          contentHtml: `
            <p style="margin:0 0 16px; font-size:16px; color:#18181b; line-height:1.6;">
              안녕하세요, <strong>${displayName}</strong>님.<br>
              QUEUING 멤버십 해지가 정상적으로 처리되었습니다.
            </p>
            <div style="background-color:#f9fafb; border-radius:8px; padding:16px; margin:20px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; font-size:14px; color:#374151;">
                <tr><td style="padding:4px 0;"><strong>해지 처리일</strong></td><td style="padding:4px 0;">${escapeHtml(formatKoreanDate(new Date()))}</td></tr>
              </table>
            </div>
            <p style="margin:0; font-size:14px; color:#18181b; line-height:1.6;">
              해지 후에는 멤버십 전용 취소표 대기열 및 관련 혜택을 이용하실 수 없습니다.<br>
              필요한 경우 멤버십 페이지에서 다시 가입하실 수 있습니다.
            </p>`,
        });

    const result = await sendEmail(user.email, subject, body);
    if (!result?.success) {
      console.warn(`[Membership] ${type} 안내 메일 발송 실패: ${user.email}`);
      return { emailSent: false, emailReason: 'send_failed' };
    }
    return { emailSent: true };
  } catch (err) {
    // 메일 실패가 가입/해지 DB 처리를 되돌리지는 않는다.
    console.error(`[Membership] ${type} 안내 메일 처리 실패:`, err.message);
    return { emailSent: false, emailReason: 'notification_error' };
  }
}

async function subscribe(userId, plan = 'monthly') {
  const durationDays = plan === 'yearly' ? 365 : 30;
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

  const existing = await pool.query(
    `SELECT user_id FROM memberships WHERE user_id = ?`,
    [userId],
  );
  if (existing.length > 0) {
    return { success: false, message: '이미 활성 멤버십이 있습니다.' };
  }

  const tierName = plan === 'yearly' ? 'ANNUAL' : 'MONTHLY';
  await pool.query(
    `INSERT INTO memberships (user_id, is_membership, plan, tier_name, expires_at, priority_level) VALUES (?, TRUE, ?, ?, ?, ?)`,
    [userId, plan, tierName, expiresAt, plan === 'yearly' ? 2 : 1],
  );
  console.log(`[Membership] 구독: ${userId} (${plan})`);
  const notification = await sendMembershipEmail({
    userId,
    type: 'subscribed',
    plan,
    expiresAt,
  });
  return {
    success: true,
    userId,
    plan,
    expiresAt: expiresAt.toISOString(),
    ...notification,
    message: '멤버십 구독이 완료되었습니다.',
  };
}

async function getMembership(userId) {
  const rows = await pool.query(
    `SELECT user_id, is_membership, plan, expires_at, priority_level, created_at
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
  const membershipRows = await pool.query(
    `SELECT plan, expires_at FROM memberships WHERE user_id = ? LIMIT 1`,
    [userId],
  );
  const result = await pool.query(
    `DELETE FROM memberships WHERE user_id = ?`,
    [userId],
  );
  if (result.affectedRows === 0) {
    return { success: false, message: '활성 멤버십이 없습니다.' };
  }
  console.log(`[Membership] 해지(삭제): ${userId}`);
  const notification = await sendMembershipEmail({
    userId,
    type: 'cancelled',
    plan: membershipRows[0]?.plan || 'monthly',
    expiresAt: membershipRows[0]?.expires_at || null,
  });
  return {
    success: true,
    ...notification,
    message: '멤버십이 해지되었습니다.',
  };
}

async function isPriorityUser(userId) {
  const rows = await pool.query(
    `SELECT priority_level FROM memberships WHERE user_id = ? AND is_membership = TRUE AND expires_at > NOW() LIMIT 1`,
    [userId],
  );
  return rows.length > 0 ? rows[0].priority_level : 0;
}

module.exports = { subscribe, getMembership, cancelMembership, isPriorityUser };
