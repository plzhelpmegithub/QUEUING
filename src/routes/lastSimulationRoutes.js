// [보존 / LAST LOCAL SIMULATION]
// B파트 SQS/Lambda를 호출하지 않고 A파트만으로 취소표 "공용 풀" 흐름을
// 검증하는 관리자·취소표 전용 API다. 기존 simulationRoutes와 테이블을
// 공유하지 않으며, cancel_last_* 테이블만 사용한다.
const crypto = require('crypto');
const redis = require('../config/redis');
const pool = require('../config/mariadb');
const seatService = require('../services/seatService');
const cancelAllocationService = require('../services/cancelAllocationService');
const { issueCancelLinkToken, verifyCancelLinkToken } = require('../services/cancelLinkTokenService');
const { issueScopedCancelToken } = require('../services/authTokenService');
const { listEventCards } = require('../services/eventCatalogService');
const { sendEmail, wrapEmailHtml, isSmtpConfigured } = require('../services/notificationService');
const { authenticate, requireRole, allowUserOrCancelLink, requireSelfOrLink } = require('../middleware/auth');

const adminAuth = { preHandler: [authenticate, requireRole('admin')] };
const userAuth = { preHandler: [allowUserOrCancelLink, requireSelfOrLink] };
// Last 로컬 시뮬레이션은 링크를 한 명씩만 발급한다. API 프로세스가 살아
// 있는 동안에는 이 타이머가 링크 미접속 만료도 다음 순번으로 넘기고,
// 프로세스 재시작 시에는 currentCandidate()의 DB 만료 정리가 보완한다.
const lastLinkExpiryTimers = new Map();
let lastLinkExpirySweepTimer = null;
let lastLinkExpirySweepRunning = false;
function frontendBaseUrl() {
  return String(
    process.env.LOCAL_FRONTEND_BASE_URL || process.env.FRONTEND_BASE_URL || process.env.SITE_URL || 'http://localhost:5173',
  ).replace(/\/+$/, '');
}

function campaignId() {
  return `last-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toUtcSql(milliseconds) {
  return new Date(milliseconds).toISOString().slice(0, 19).replace('T', ' ');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function displaySeatLabel(seatId) {
  const shortId = String(seatId || '').split(':').pop() || '-';
  const dash = shortId.lastIndexOf('-');
  if (dash < 0) return shortId;
  const section = shortId.slice(0, dash);
  const number = Number(shortId.slice(dash + 1));
  return `${section}구역 ${Number.isFinite(number) ? number : shortId.slice(dash + 1)}번`;
}

async function getEventCard(eventId) {
  const events = await listEventCards();
  return events.find((event) => String(event.eventId) === String(eventId)) || {
    eventId,
    eventName: eventId,
    venue: '',
  };
}

async function completeStandbyQueue({ queueId, userId, eventId, sessionDate, sessionTime }) {
  if (queueId) {
    return pool.query(
      `UPDATE waiting_queue
       SET status = 'COMPLETED'
       WHERE queue_id = ? AND queue_type = 'standby' AND status IN ('WAITING', 'STANDBY')`,
      [queueId],
    );
  }
  return pool.query(
    `UPDATE waiting_queue
     SET status = 'COMPLETED'
     WHERE user_id = ? AND event_id = ? AND session_date = ? AND session_time = ?
       AND queue_type = 'standby' AND status IN ('WAITING', 'STANDBY')`,
    [userId, eventId, sessionDate || '', sessionTime || ''],
  );
}

async function saveLastHistory({ allocationId, campaignId = null, userId, eventId, sessionDate, sessionTime, seatId = null, action }) {
  await pool.query(
    `INSERT IGNORE INTO cancel_last_history
       (allocation_id, campaign_id, user_id, event_id, session_date, session_time, seat_id, action)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [allocationId || null, campaignId, userId, eventId, sessionDate || '', sessionTime || '', seatId, action],
  );
}

async function savePaymentMethod(seatId, userId, paymentMethod) {
  if (!seatId || !userId || !paymentMethod) return;
  await pool.query(
    `UPDATE reservations
     SET payment_method = ?
     WHERE seat_id = ? AND user_id = ? AND status = 'CONFIRMED'
     ORDER BY reserved_at DESC, reservation_id DESC LIMIT 1`,
    [String(paymentMethod).slice(0, 20), seatId, userId],
  );
}

async function sendLastBookingEmail({ userId, eventId, sessionDate, sessionTime, seatId, paymentMethod }) {
  try {
    const [user] = await pool.query('SELECT email, name FROM users WHERE user_id = ? LIMIT 1', [userId]);
    const recipient = user?.email || userId;
    if (!recipient) return { success: false, reason: 'recipient_missing' };
    const event = await getEventCard(eventId);
    const methodLabel = String(paymentMethod).toLowerCase() === 'easy' ? '간편결제' : '카드 결제';
    return sendEmail(recipient, `[QUEUING] 취소표 예매 완료 안내 — ${event.eventName || eventId}`, wrapEmailHtml({
      title: '취소표 예매 완료',
      contentHtml: `
        <p style="margin:0 0 16px; font-size:16px; color:#18181b; line-height:1.6;">
          안녕하세요, <strong>${escapeHtml(user?.name || userId)}</strong>님.<br>
          취소표 전용 결제 화면에서 선택한 좌석의 예매가 정상적으로 완료되었습니다.
        </p>
        <div style="background-color:#f9fafb; border-radius:8px; padding:16px; margin:20px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; font-size:14px; color:#374151;">
            <tr><td style="padding:4px 0;"><strong>공연명</strong></td><td style="padding:4px 0;">${escapeHtml(event.eventName || eventId)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>일시</strong></td><td style="padding:4px 0;">${escapeHtml(sessionDate)} ${escapeHtml(sessionTime)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>장소</strong></td><td style="padding:4px 0;">${escapeHtml(event.venue || '미정')}</td></tr>
            <tr><td style="padding:4px 0;"><strong>좌석</strong></td><td style="padding:4px 0;">${escapeHtml(displaySeatLabel(seatId))}</td></tr>
            <tr><td style="padding:4px 0;"><strong>결제수단</strong></td><td style="padding:4px 0;">${methodLabel}</td></tr>
          </table>
        </div>
        <p style="margin:0; font-size:13px; color:#71717a; line-height:1.6;">
          마이페이지의 예매내역에서 티켓과 환불 정보를 확인할 수 있습니다.
        </p>`,
    }));
  } catch (err) {
    console.error('[LastSimulation] 취소표 예매 완료 메일 준비 실패:', err.message);
    return { success: false, error: err.message };
  }
}

async function getOpenGate(campaignIdValue) {
  const rows = await pool.query(
    `SELECT open_at,
            (open_at IS NOT NULL AND open_at > UTC_TIMESTAMP()) AS not_open
     FROM cancel_last_campaigns WHERE campaign_id = ? LIMIT 1`,
    [campaignIdValue],
  );
  return rows[0] || null;
}

async function getCampaign(id) {
  if (!id) return null;
  const rows = await pool.query('SELECT * FROM cancel_last_campaigns WHERE campaign_id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function latestCampaign(eventId = '') {
  const rows = await pool.query(
    `SELECT * FROM cancel_last_campaigns ${eventId ? 'WHERE event_id = ?' : ''}
     ORDER BY created_at DESC LIMIT 1`,
    eventId ? [eventId] : [],
  );
  return rows[0] || null;
}

async function activeCandidates(campaign) {
  return pool.query(
    `SELECT w.user_id, w.queue_id, w.queue_index, w.created_at
     FROM waiting_queue w
     INNER JOIN memberships m ON m.user_id = w.user_id
     WHERE w.event_id = ?
       AND w.session_date = ?
       AND w.session_time = ?
       AND w.queue_type = 'standby'
       AND w.status IN ('WAITING', 'STANDBY')
       AND w.membership_at_join = 1
       AND w.user_id NOT LIKE 'sim-user-%'
       AND w.user_id NOT LIKE 'sim-member-%'
       AND m.is_membership = TRUE
       AND m.expires_at > UTC_TIMESTAMP()
       AND w.created_at >= ?
       AND EXISTS (
         SELECT 1 FROM waiting_queue main_queue
         WHERE main_queue.user_id = w.user_id
           AND main_queue.event_id = w.event_id
           AND main_queue.session_date = w.session_date
           AND main_queue.session_time = w.session_time
           AND main_queue.queue_type = 'eligible'
           AND main_queue.status IN ('WAITING', 'ADMITTED', 'PROMOTED', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'STANDBY')
       )
     ORDER BY w.queue_index ASC, w.queue_id ASC`,
    [campaign.event_id, campaign.session_date, campaign.session_time, campaign.created_at],
  );
}

async function candidateForAllocation(allocationId) {
  const rows = await pool.query(
    `SELECT c.*, p.event_id, p.session_date, p.session_time, p.status AS campaign_status,
            p.open_at, p.pool_size
     FROM cancel_last_candidates c
     INNER JOIN cancel_last_campaigns p ON p.campaign_id = c.campaign_id
     WHERE c.allocation_id = ? LIMIT 1`,
    [allocationId],
  );
  return rows[0] || null;
}

function clearLastLinkExpiryTimer(allocationId) {
  const timer = lastLinkExpiryTimers.get(String(allocationId));
  if (timer) clearTimeout(timer);
  lastLinkExpiryTimers.delete(String(allocationId));
}

async function expireLastCandidate(candidate, allocation) {
  if (!candidate || !allocation) return { expired: false };
  clearLastLinkExpiryTimer(allocation.id);
  if (allocation.seatId) await seatService.releaseSeat(candidate.user_id, allocation.seatId).catch(() => {});
  await cancelAllocationService.markExpiredById(allocation.id).catch(() => {});
  await pool.query(
    `UPDATE cancel_last_candidates SET status = 'EXPIRED'
     WHERE campaign_id = ? AND allocation_id = ? AND status IN ('LINK_SENT', 'HELD')`,
    [candidate.campaign_id, allocation.id],
  );
  if (allocation.seatId) {
    await pool.query(
      `UPDATE cancel_last_pool_seats SET status = 'AVAILABLE'
       WHERE campaign_id = ? AND seat_id = ?`,
      [candidate.campaign_id, allocation.seatId],
    );
  }
  return { expired: true };
}

// 과거의 일괄 발급 데이터가 남아 있거나 동시 요청이 꼬인 경우에도 현재
// 순번 뒤에 미리 발급된 링크는 유효하면 안 된다. 다음 순번 링크는 앞 순번이
// 종료된 뒤 새로 발급하는 것이 순차 배정의 기준이다.
async function resetFutureIssuedCandidates(campaignIdValue, afterSequenceNo) {
  const rows = await pool.query(
    `SELECT c.*, a.seat_id
     FROM cancel_last_candidates c
     LEFT JOIN cancel_allocations a ON a.allocation_id = c.allocation_id
     WHERE c.campaign_id = ? AND c.sequence_no > ?
       AND c.status IN ('LINK_SENT', 'HELD')`,
    [campaignIdValue, afterSequenceNo],
  );
  for (const row of rows) {
    clearLastLinkExpiryTimer(row.allocation_id);
    if (row.seat_id) await seatService.releaseSeat(row.user_id, row.seat_id).catch(() => {});
    if (row.allocation_id) await cancelAllocationService.markExpiredById(row.allocation_id).catch(() => {});
    if (row.seat_id) {
      await pool.query(
        `UPDATE cancel_last_pool_seats SET status = 'AVAILABLE'
         WHERE campaign_id = ? AND seat_id = ?`,
        [row.campaign_id, row.seat_id],
      );
    }
    await pool.query(
      `UPDATE cancel_last_candidates SET status = 'WAITING', allocation_id = NULL
       WHERE campaign_id = ? AND user_id = ?`,
      [row.campaign_id, row.user_id],
    );
  }
  return rows.length;
}

function scheduleLastLinkExpiry(campaign, allocation) {
  const allocationId = String(allocation?.id || '');
  const expiresAt = new Date(allocation?.expiresAt).getTime();
  if (!allocationId || !Number.isFinite(expiresAt)) return;
  clearLastLinkExpiryTimer(allocationId);
  const delay = Math.max(0, expiresAt - Date.now()) + 1000;
  const timer = setTimeout(async () => {
    lastLinkExpiryTimers.delete(allocationId);
    try {
      const [freshAllocation, candidate] = await Promise.all([
        cancelAllocationService.getAllocationById(allocationId),
        candidateForAllocation(allocationId),
      ]);
      if (!freshAllocation || !candidate || freshAllocation.status !== 'LINK_SENT') return;
      if (new Date(freshAllocation.expiresAt).getTime() > Date.now()) {
        scheduleLastLinkExpiry(campaign, freshAllocation);
        return;
      }
      await expireLastCandidate(candidate, freshAllocation);
      await resetFutureIssuedCandidates(candidate.campaign_id, candidate.sequence_no);
      await issueNextCandidateLink(await getCampaign(candidate.campaign_id)).catch((err) => {
        console.error('[LastSimulation] 만료 후 다음 링크 발급 실패:', err.message);
      });
    } catch (err) {
      console.error('[LastSimulation] 링크 만료 타이머 처리 실패:', err.message);
    }
  }, delay);
  timer.unref?.();
  lastLinkExpiryTimers.set(allocationId, timer);
}

async function issueNextCandidateLink(campaign, { allowInitialIssue = false } = {}) {
  if (!campaign) return { success: false, reason: 'campaign_missing' };
  if (!isSmtpConfigured()) return { success: false, reason: 'smtp_not_configured' };
  if (campaign.status !== 'LINKS_SENT' && !(allowInitialIssue && campaign.status === 'POOL_READY')) {
    return { success: false, reason: 'campaign_not_ready' };
  }
  const openGate = await getOpenGate(campaign.campaign_id);
  if (Number(openGate?.not_open) === 1) return { success: false, reason: 'pool_not_open', openAt: toIso(openGate.open_at) };

  // 이미 유효한 링크가 있으면 그 사용자가 현재 순번이다. 다음 사람에게
  // 중복 메일을 보내지 않는다.
  const activeRows = await pool.query(
    `SELECT sequence_no, user_id, allocation_id FROM cancel_last_candidates
     WHERE campaign_id = ? AND status IN ('LINK_SENT', 'HELD')
     ORDER BY sequence_no ASC`,
    [campaign.campaign_id],
  );
  const active = activeRows[0] || null;
  if (active && activeRows.length > 1) {
    await resetFutureIssuedCandidates(campaign.campaign_id, active.sequence_no);
  }
  if (active) return { success: true, issued: false, reason: 'active_candidate', active };

  const [next] = await pool.query(
    `SELECT * FROM cancel_last_candidates
     WHERE campaign_id = ? AND status = 'WAITING'
     ORDER BY sequence_no ASC LIMIT 1`,
    [campaign.campaign_id],
  );
  if (!next) return { success: true, issued: false, reason: 'no_waiting_candidate' };

  // 관리자 재시도·만료 타이머·사용자 완료 요청이 겹쳐도 한 요청만 후보를
  // 점유하도록 상태를 잠시 ISSUING으로 원자적으로 전환한다.
  const claim = await pool.query(
    `UPDATE cancel_last_candidates SET status = 'ISSUING'
     WHERE campaign_id = ? AND user_id = ? AND status = 'WAITING'`,
    [campaign.campaign_id, next.user_id],
  );
  if (!(claim.affectedRows || 0)) return { success: true, issued: false, reason: 'issue_in_progress' };

  let allocation = null;
  try {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    allocation = await cancelAllocationService.createAllocation({
      userId: next.user_id,
      seatId: null,
      eventId: campaign.event_id,
      sessionDate: campaign.session_date,
      sessionTime: campaign.session_time,
      holdDuration: 300,
      expiresAt,
    });
    const token = issueCancelLinkToken(allocation, expiresAt);
    if (!token) throw new Error('jwt_not_configured');

    const event = await getEventCard(campaign.event_id);
    const eventName = event.eventName || campaign.event_id;
    const [recipientUser] = await pool.query('SELECT email FROM users WHERE user_id = ? LIMIT 1', [next.user_id]);
    const recipient = recipientUser?.email || next.user_id;
    const link = `${frontendBaseUrl()}/#/last-cancel-ticketing?token=${encodeURIComponent(token)}`;
    const mail = await sendEmail(recipient, `[QUEUING] 취소표 예매 링크 안내 — ${eventName}`, wrapEmailHtml({
      title: '취소표 예매 안내',
      subtitle: '취소표 예매 순서가 되었습니다',
      contentHtml: `
        <p style="margin:0 0 16px; font-size:16px; color:#18181b; line-height:1.6;">
          회원님의 본 티켓팅 대기열 참여 이력이 확인되어<br>
          <strong>취소표 예매 링크</strong>를 발급했습니다.
        </p>
        <div style="background-color:#f9fafb; border-radius:8px; padding:16px; margin:20px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; font-size:14px; color:#374151;">
            <tr><td style="padding:4px 0;"><strong>공연명</strong></td><td style="padding:4px 0;">${escapeHtml(eventName)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>회차</strong></td><td style="padding:4px 0;">${campaign.session_date} ${campaign.session_time}</td></tr>
            <tr><td style="padding:4px 0;"><strong>취소표 풀</strong></td><td style="padding:4px 0;">${campaign.pool_size}석 중 선택</td></tr>
          </table>
        </div>
        <div style="background-color:#FEF2F2; border:1px solid #FCA5A5; border-radius:8px; padding:14px 16px; margin:20px 0;">
          <span style="color:#B91C1C; font-size:14px; font-weight:600;">⏱ 링크를 받은 시점부터 5분간만 유효합니다</span>
          <div style="color:#7F1D1D; font-size:13px; margin-top:4px;">시간 내 선택하지 않으시면 다음 대기자에게 기회가 넘어갑니다.</div>
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
          <tr>
            <td style="border-radius:8px; background-color:#E11D2E;">
              <a href="${link}"
                 style="display:inline-block; padding:14px 32px; color:#ffffff; font-size:16px;
                        font-weight:700; text-decoration:none; border-radius:8px;">
                취소표 예매 페이지 열기
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:0; font-size:12px; color:#a1a1aa; word-break:break-all;">
          버튼이 눌리지 않는다면 아래 링크를 복사해 브라우저에 붙여넣어주세요.<br>${link}
        </p>`,
    }));
    if (!mail.success) throw new Error(mail.error || 'email_failed');

    await pool.query(
      `UPDATE cancel_last_candidates SET status = 'LINK_SENT', allocation_id = ?
       WHERE campaign_id = ? AND user_id = ? AND status = 'ISSUING'`,
      [allocation.id, campaign.campaign_id, next.user_id],
    );
    await pool.query(
      `UPDATE cancel_last_campaigns
       SET status = 'LINKS_SENT', issued_at = COALESCE(issued_at, UTC_TIMESTAMP())
       WHERE campaign_id = ?`,
      [campaign.campaign_id],
    );
    scheduleLastLinkExpiry(campaign, allocation);
    return {
      success: true,
      issued: true,
      sent: {
        userId: next.user_id,
        sequenceNo: next.sequence_no,
        allocationId: allocation.id,
        expiresAt: expiresAt.toISOString(),
      },
    };
  } catch (err) {
    if (allocation?.id) await cancelAllocationService.markExpiredById(allocation.id).catch(() => {});
    await pool.query(
      `UPDATE cancel_last_candidates SET status = 'WAITING', allocation_id = NULL
       WHERE campaign_id = ? AND user_id = ? AND status = 'ISSUING'`,
      [campaign.campaign_id, next.user_id],
    ).catch(() => {});
    return { success: false, issued: false, reason: err.message || 'link_issue_failed', userId: next.user_id };
  }
}

function ensureLastLinkExpirySweep() {
  if (lastLinkExpirySweepTimer) return;
  const sweep = async () => {
    if (lastLinkExpirySweepRunning) return;
    lastLinkExpirySweepRunning = true;
    try {
      const campaigns = await pool.query(
        `SELECT * FROM cancel_last_campaigns WHERE status = 'LINKS_SENT'`,
      );
      for (const campaign of campaigns) {
        await currentCandidate(campaign.campaign_id);
      }
    } catch (err) {
      console.error('[LastSimulation] 링크 만료 점검 실패:', err.message);
    } finally {
      lastLinkExpirySweepRunning = false;
    }
  };
  lastLinkExpirySweepTimer = setInterval(sweep, 10 * 1000);
  lastLinkExpirySweepTimer.unref?.();
  sweep().catch(() => {});
}

async function currentCandidate(campaignIdValue) {
  // 링크를 열지 않은 사용자의 5분 제한도 다음 순번을 막지 않도록
  // 상태 조회 시 만료 allocation을 정리한다. 별도 B파트 워커 없이도
  // 테스트에서 링크 만료 → 다음 순번 승계가 재현된다.
  const overdue = await pool.query(
    `SELECT c.user_id, c.sequence_no, c.allocation_id, a.seat_id
     FROM cancel_last_candidates c
     INNER JOIN cancel_allocations a ON a.allocation_id = c.allocation_id
     WHERE c.campaign_id = ? AND c.status IN ('LINK_SENT', 'HELD')
       AND a.status = 'LINK_SENT' AND a.expires_at <= UTC_TIMESTAMP()`,
    [campaignIdValue],
  );
  for (const row of overdue) {
    const allocation = await cancelAllocationService.getAllocationById(row.allocation_id);
    if (allocation) await expireLastCandidate(row, allocation);
  }
  if (overdue.length > 0) {
    await resetFutureIssuedCandidates(
      campaignIdValue,
      Math.min(...overdue.map((row) => Number(row.sequence_no) || Number.MAX_SAFE_INTEGER)),
    );
    const campaign = await getCampaign(campaignIdValue);
    await issueNextCandidateLink(campaign).catch((err) => {
      console.error('[LastSimulation] 만료 후보의 다음 링크 발급 실패:', err.message);
    });
  }
  const rows = await pool.query(
    `SELECT * FROM cancel_last_candidates
     WHERE campaign_id = ? AND status IN ('LINK_SENT', 'HELD')
     ORDER BY sequence_no ASC LIMIT 1`,
    [campaignIdValue],
  );
  return rows[0] || null;
}

async function poolRows(campaignIdValue) {
  return pool.query(
    `SELECT campaign_id, seat_id, section, price, original_status, status
     FROM cancel_last_pool_seats WHERE campaign_id = ? ORDER BY section, seat_id`,
    [campaignIdValue],
  );
}

async function statusOf(campaign) {
  if (!campaign) return { initialized: false, campaign: null };
  const [seats, candidates] = await Promise.all([
    poolRows(campaign.campaign_id),
    pool.query('SELECT * FROM cancel_last_candidates WHERE campaign_id = ? ORDER BY sequence_no', [campaign.campaign_id]),
  ]);
  const count = (list, value) => list.filter((row) => row.status === value).length;
  const current = await currentCandidate(campaign.campaign_id);
  return {
    initialized: true,
    campaign: {
      campaignId: campaign.campaign_id,
      eventId: campaign.event_id,
      sessionDate: campaign.session_date,
      sessionTime: campaign.session_time,
      poolSize: Number(campaign.pool_size) || 0,
      status: campaign.status,
      createdAt: toIso(campaign.created_at),
      openAt: toIso(campaign.open_at),
      closedAt: toIso(campaign.closed_at),
      issuedAt: toIso(campaign.issued_at),
    },
    pool: {
      total: seats.length,
      available: count(seats, 'AVAILABLE'),
      held: count(seats, 'HELD'),
      sold: count(seats, 'SOLD'),
    },
    candidates: {
      total: candidates.length,
      waiting: count(candidates, 'WAITING'),
      linkSent: count(candidates, 'LINK_SENT'),
      held: count(candidates, 'HELD'),
      completed: count(candidates, 'COMPLETED'),
      expired: count(candidates, 'EXPIRED'),
      passed: count(candidates, 'PASSED'),
      current: current ? { sequenceNo: current.sequence_no, userId: current.user_id } : null,
      rows: candidates.slice(0, 30).map((row) => ({
        sequenceNo: row.sequence_no,
        userId: row.user_id,
        queueIndex: row.queue_index,
        status: row.status,
      })),
    },
  };
}

async function lastSimulationRoutes(fastify) {
  // 관리자 패널이 별도 서버 재기동 없이도 새 테이블을 사용할 수 있도록
  // 첫 요청에서 한 번 더 보장한다. 정상 기동 시 dbService.initTable이 먼저 실행된다.
  let tablesReady = false;
  async function ensureTables() {
    if (tablesReady) return;
    await pool.query(`CREATE TABLE IF NOT EXISTS cancel_last_campaigns (
      campaign_id VARCHAR(80) PRIMARY KEY, event_id VARCHAR(100) NOT NULL,
      session_date VARCHAR(50) NOT NULL DEFAULT '', session_time VARCHAR(10) NOT NULL DEFAULT '',
      pool_size INT NOT NULL DEFAULT 100, status VARCHAR(30) NOT NULL DEFAULT 'INITIALIZED',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, open_at DATETIME NULL,
      closed_at DATETIME NULL, issued_at DATETIME NULL,
      INDEX idx_last_campaign_session (event_id, session_date, session_time), INDEX idx_last_campaign_status (status)
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS cancel_last_pool_seats (
      campaign_id VARCHAR(80) NOT NULL, seat_id VARCHAR(100) NOT NULL, section VARCHAR(50) DEFAULT '',
      price INT NOT NULL DEFAULT 0, original_status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
      status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (campaign_id, seat_id), INDEX idx_last_pool_status (campaign_id, status)
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS cancel_last_candidates (
      campaign_id VARCHAR(80) NOT NULL, sequence_no INT NOT NULL, queue_id INT NOT NULL,
      user_id VARCHAR(100) NOT NULL, queue_index INT NOT NULL DEFAULT 0, allocation_id INT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'WAITING', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (campaign_id, user_id), UNIQUE KEY uk_last_candidate_sequence (campaign_id, sequence_no),
      INDEX idx_last_candidate_status (campaign_id, status), INDEX idx_last_candidate_queue (campaign_id, queue_index)
    )`);
    // Final 테스트에서 “다음 순번에게 넘기기”를 누른 사실은 실제 예약과
    // 구분해 남긴다. 결제가 없으므로 reservations를 만들지 않고, 마이페이지의
    // 취소/환불내역에서만 안내 기록으로 사용한다.
    await pool.query(`CREATE TABLE IF NOT EXISTS cancel_last_history (
      history_id BIGINT AUTO_INCREMENT PRIMARY KEY, allocation_id INT NULL,
      campaign_id VARCHAR(80) NULL, user_id VARCHAR(100) NOT NULL,
      event_id VARCHAR(100) NOT NULL, session_date VARCHAR(50) NOT NULL DEFAULT '',
      session_time VARCHAR(10) NOT NULL DEFAULT '', seat_id VARCHAR(100) NULL,
      action VARCHAR(30) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_last_history_allocation_action (allocation_id, action),
      INDEX idx_last_history_user (user_id, created_at),
      INDEX idx_last_history_campaign (campaign_id)
    )`);
    tablesReady = true;
    ensureLastLinkExpirySweep();
  }

  async function cleanupCampaignData(campaign) {
    if (!campaign?.campaign_id) {
      return { deleted: 0, allocationsDeleted: 0, poolSeatsDeleted: 0, historyDeleted: 0, seatsReleased: 0 };
    }

    const campaignIdValue = campaign.campaign_id;
    const poolCountRows = await pool.query(
      'SELECT COUNT(*) AS count FROM cancel_last_pool_seats WHERE campaign_id = ?',
      [campaignIdValue],
    );
    const poolSeatsDeleted = Number(poolCountRows[0]?.count) || 0;
    const historyCountRows = await pool.query(
      'SELECT COUNT(*) AS count FROM cancel_last_history WHERE campaign_id = ?',
      [campaignIdValue],
    );
    const historyDeleted = Number(historyCountRows[0]?.count) || 0;
    const allocations = await pool.query(
      `SELECT DISTINCT allocation_id, user_id
       FROM cancel_last_candidates
       WHERE campaign_id = ? AND allocation_id IS NOT NULL`,
      [campaignIdValue],
    );
    const disposableAllocationIds = [];
    let seatsReleased = 0;

    for (const row of allocations) {
      const allocation = await cancelAllocationService.getAllocationById(row.allocation_id);
      const status = String(allocation?.status || '').toUpperCase();
      // Final 시뮬레이션으로 선점했지만 아직 결제 확정되지 않은 좌석만 복원한다.
      // 이미 확정된 RESPONDED/COMPLETED 좌석은 실제 예약과 연결될 수 있으므로
      // 삭제 과정에서 강제로 AVAILABLE로 되돌리지 않는다.
      if (allocation && ['LINK_SENT', 'HELD'].includes(status)) {
        if (allocation.seatId) {
          await seatService.releaseSeat(row.user_id, allocation.seatId).catch(() => {});
          seatsReleased += 1;
        }
        await cancelAllocationService.markExpiredById(row.allocation_id).catch(() => {});
        disposableAllocationIds.push(row.allocation_id);
      } else if (allocation && status === 'EXPIRED') {
        disposableAllocationIds.push(row.allocation_id);
      }
    }

    if (disposableAllocationIds.length > 0) {
      const placeholders = disposableAllocationIds.map(() => '?').join(',');
      await pool.query(
        `DELETE FROM cancel_allocations WHERE allocation_id IN (${placeholders})`,
        disposableAllocationIds,
      );
    }
    await pool.query('DELETE FROM cancel_last_candidates WHERE campaign_id = ?', [campaignIdValue]);
    await pool.query('DELETE FROM cancel_last_pool_seats WHERE campaign_id = ?', [campaignIdValue]);
    await pool.query('DELETE FROM cancel_last_history WHERE campaign_id = ?', [campaignIdValue]);
    await pool.query('DELETE FROM cancel_last_campaigns WHERE campaign_id = ?', [campaignIdValue]);

    return {
      deleted: 1,
      allocationsDeleted: disposableAllocationIds.length,
      poolSeatsDeleted,
      historyDeleted,
      seatsReleased,
    };
  }

  fastify.get('/admin/last-simulation/status', adminAuth, async (request, reply) => {
    await ensureTables();
    const campaign = await getCampaign(request.query?.campaignId) || await latestCampaign(request.query?.eventId || '');
    return reply.send(await statusOf(campaign));
  });

  fastify.get('/admin/last-simulation/events', adminAuth, async (_request, reply) => {
    // 공연 목록은 Last 전용 테이블과 무관하다.
    // 테이블 생성 권한/기존 스키마 문제 때문에 드롭다운까지 막히지 않도록
    // Last 실행 API에서만 ensureTables()를 수행한다.
    const events = await listEventCards();
    return reply.send({ events });
  });

  fastify.post('/admin/last-simulation/init', adminAuth, async (request, reply) => {
    await ensureTables();
    const body = request.body || {};
    const eventId = String(body.eventId || '');
    const sessionDate = String(body.sessionDate || '');
    const sessionTime = String(body.sessionTime || '');
    const requestedSize = Math.min(Math.max(parseInt(body.poolSize, 10) || 100, 1), 1000);
    if (!eventId || !sessionDate || !sessionTime) return reply.status(400).send({ success: false, message: 'eventId, sessionDate, sessionTime은 필수입니다.' });

    const seats = await seatService.getAllSeats(eventId, { eventId, sessionDate, sessionTime });
    const available = seats.filter((seat) => String(seat.status).toUpperCase() === 'AVAILABLE');
    if (available.length < requestedSize) {
      return reply.status(409).send({ success: false, code: 'not_enough_available_seats', message: `현재 AVAILABLE 좌석이 ${available.length}석입니다. ${requestedSize}석을 만들 수 없습니다.` });
    }

    const id = campaignId();
    // Final 통합 흐름에서는 실제 멤버십 사용자가 Local 단계의 초기화
    // 직후 본 대기열에 들어온다. Last 풀을 만드는 시점은 그보다 늦으므로
    // 후보 기준 시각을 Last 초기화 시각으로 잡으면 이미 참여한 사용자가
    // 누락된다. Local 시뮬레이션 시작 시각이 있으면 그 시각부터 조회한다.
    const localState = await redis.hgetall(`simulation:local:${eventId}`);
    const sourceCreatedAt = localState?.createdAt ? new Date(localState.createdAt) : null;
    const campaignCreatedAt = sourceCreatedAt && Number.isFinite(sourceCreatedAt.getTime())
      ? sourceCreatedAt
      : new Date();
    await pool.query(
      `INSERT INTO cancel_last_campaigns (campaign_id, event_id, session_date, session_time, pool_size, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'INITIALIZED', ?)`,
      [id, eventId, sessionDate, sessionTime, requestedSize, campaignCreatedAt.toISOString().slice(0, 19).replace('T', ' ')],
    );
    const chosen = available.slice(0, requestedSize);
    const values = chosen.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const params = chosen.flatMap((seat) => [id, seat.seatId, seat.section || '', Number(seat.price) || 0, seat.status || 'AVAILABLE', 'AVAILABLE']);
    await pool.query(
      `INSERT INTO cancel_last_pool_seats (campaign_id, seat_id, section, price, original_status, status) VALUES ${values}`,
      params,
    );
    return reply.send({ success: true, campaignId: id, poolSize: requestedSize, availableSource: available.length, message: `Last 시뮬레이션 초기화 완료 — ${requestedSize}석 취소표 풀을 준비했습니다.` });
  });

  fastify.post('/admin/last-simulation/close', adminAuth, async (request, reply) => {
    await ensureTables();
    const campaign = await getCampaign(request.body?.campaignId);
    if (!campaign) return reply.status(404).send({ success: false, message: 'Last 시뮬레이션을 먼저 초기화해주세요.' });
    if (['CANDIDATES_READY', 'POOL_READY', 'LINKS_SENT'].includes(campaign.status)) return reply.send({ success: true, idempotent: true, ...(await statusOf(campaign)) });

    const delaySeconds = Math.min(Math.max(parseInt(request.body?.openDelaySeconds, 10) || 0, 0), 3600);
    const openAtMs = Date.now() + delaySeconds * 1000;
    const openAt = new Date(openAtMs);
    // DATETIME 컬럼에 JS Date를 그대로 넘기면 DB 세션 타임존에 따라
    // 9시간이 어긋날 수 있다. UTC 문자열로 저장하고 공개 여부는
    // MariaDB의 UTC_TIMESTAMP()와 비교한다.
    const openAtSql = toUtcSql(openAtMs);
    const rows = await activeCandidates(campaign);
    const candidates = rows.slice(0, Number(campaign.pool_size) || 100);
    if (candidates.length === 0) return reply.status(409).send({ success: false, code: 'no_membership_candidates', message: '본 티켓팅 대기열에 참여한 활성 멤버십 standby 사용자가 없습니다.' });

    const values = candidates.map(() => '(?, ?, ?, ?, ?, \'WAITING\')').join(', ');
    const params = candidates.flatMap((row, index) => [campaign.campaign_id, index + 1, row.queue_id, row.user_id, Number(row.queue_index) || 0]);
    await pool.query('DELETE FROM cancel_last_candidates WHERE campaign_id = ?', [campaign.campaign_id]);
    await pool.query(
      `INSERT INTO cancel_last_candidates (campaign_id, sequence_no, queue_id, user_id, queue_index, status) VALUES ${values}`,
      params,
    );
    await pool.query(
      `UPDATE cancel_last_campaigns SET status = 'CANDIDATES_READY', open_at = ?, closed_at = UTC_TIMESTAMP() WHERE campaign_id = ?`,
      [openAtSql, campaign.campaign_id],
    );
    return reply.send({ success: true, campaignId: campaign.campaign_id, candidateCount: candidates.length, openAt: openAt.toISOString(), message: delaySeconds ? `${delaySeconds}초 후 취소표 풀을 열고 멤버십 후보 순번을 확정합니다.` : `멤버십 후보 ${candidates.length}명을 순번대로 확정했습니다.` });
  });

  fastify.post('/admin/last-simulation/open-pool', adminAuth, async (request, reply) => {
    await ensureTables();
    const campaign = await getCampaign(request.body?.campaignId);
    if (!campaign) return reply.status(404).send({ success: false, message: 'Last 시뮬레이션을 찾을 수 없습니다.' });
    if (!['CANDIDATES_READY', 'POOL_READY'].includes(campaign.status)) return reply.status(409).send({ success: false, message: '먼저 멤버십 후보 확정을 실행해주세요.' });
    const openGate = await getOpenGate(campaign.campaign_id);
    if (Number(openGate?.not_open) === 1) return reply.status(409).send({ success: false, code: 'pool_not_open', openAt: toIso(openGate.open_at), message: '아직 취소표 공개 시간이 되지 않았습니다.' });
    await pool.query(`UPDATE cancel_last_campaigns SET status = 'POOL_READY' WHERE campaign_id = ?`, [campaign.campaign_id]);
    return reply.send({ success: true, ...(await statusOf(await getCampaign(campaign.campaign_id))), message: '회차별 취소표 풀이 공개되었습니다.' });
  });

  fastify.post('/admin/last-simulation/issue-links', adminAuth, async (request, reply) => {
    await ensureTables();
    if (!isSmtpConfigured()) return reply.status(503).send({ success: false, code: 'local_smtp_not_configured', message: 'Last 시뮬레이션은 Gmail SMTP 설정이 필요합니다.' });
    const campaign = await getCampaign(request.body?.campaignId);
    if (!campaign) return reply.status(404).send({ success: false, message: 'Last 시뮬레이션을 찾을 수 없습니다.' });
    const openGate = await getOpenGate(campaign.campaign_id);
    if (Number(openGate?.not_open) === 1) return reply.status(409).send({ success: false, code: 'pool_not_open', openAt: toIso(openGate.open_at), message: '아직 취소표 공개 시간이 되지 않았습니다.' });
    if (!['POOL_READY', 'LINKS_SENT'].includes(campaign.status)) return reply.status(409).send({ success: false, message: '먼저 취소표 풀 공개를 실행해주세요.' });

    const issued = await issueNextCandidateLink(campaign, { allowInitialIssue: true });
    if (!issued.success) {
      return reply.status(503).send({
        success: false,
        code: issued.reason,
        message: issued.reason === 'smtp_not_configured'
          ? 'Last 시뮬레이션은 Gmail SMTP 설정이 필요합니다.'
          : '다음 순번 사용자에게 Secret Link를 발급하지 못했습니다.',
      });
    }
    if (!issued.issued) {
      return reply.send({
        success: true,
        linksSent: 0,
        sent: [],
        active: issued.active || null,
        message: issued.reason === 'active_candidate'
          ? `현재 ${issued.active.sequence_no}번 사용자에게 이미 유효한 Secret Link가 발급되어 있습니다.`
          : '발급 대기 중인 다음 멤버십 후보가 없습니다.',
      });
    }
    return reply.send({
      success: true,
      linksSent: 1,
      sent: [issued.sent],
      message: `${issued.sent.sequenceNo}번 멤버십 후보에게 5분 Secret Link를 발급했습니다. 다음 후보는 현재 링크의 결제·양도·만료 후 자동 발급됩니다.`,
    });
  });

  fastify.post('/admin/last-simulation/cleanup', adminAuth, async (request, reply) => {
    await ensureTables();
    const id = String(request.body?.campaignId || '');
    const campaign = await getCampaign(id);
    if (!campaign) return reply.send({ success: true, idempotent: true, deleted: 0 });
    const result = await cleanupCampaignData(campaign);
    return reply.send({
      success: true,
      ...result,
      message: `Last 시뮬레이션 전용 데이터와 미처리 링크를 삭제했습니다. (공용 풀 ${result.poolSeatsDeleted}석 포함)`,
    });
  });

  // Final 화면은 새로고침 후에도 이전 campaignId를 잃을 수 있다.
  // 따라서 선택한 공연의 모든 Last 테스트 캠페인을 event_id 기준으로 정리한다.
  // 실제 공연·회원·일반 예약은 이 API의 삭제 대상이 아니다.
  fastify.post('/admin/last-simulation/cleanup-event', adminAuth, async (request, reply) => {
    await ensureTables();
    const eventId = String(request.body?.eventId || '').trim();
    if (!eventId) return reply.status(400).send({ success: false, message: 'eventId는 필수입니다.' });

    const campaigns = await pool.query(
      'SELECT * FROM cancel_last_campaigns WHERE event_id = ? ORDER BY created_at ASC',
      [eventId],
    );
    const summary = { campaignsDeleted: 0, allocationsDeleted: 0, poolSeatsDeleted: 0, historyDeleted: 0, seatsReleased: 0 };
    for (const campaign of campaigns) {
      const result = await cleanupCampaignData(campaign);
      summary.campaignsDeleted += result.deleted;
      summary.allocationsDeleted += result.allocationsDeleted;
      summary.poolSeatsDeleted += result.poolSeatsDeleted;
      summary.historyDeleted += result.historyDeleted;
      summary.seatsReleased += result.seatsReleased;
    }

    return reply.send({
      success: true,
      idempotent: campaigns.length === 0,
      eventId,
      ...summary,
      message: campaigns.length
        ? `선택한 공연의 Last 시뮬레이션 더미 데이터 ${summary.campaignsDeleted}건과 공용 풀 ${summary.poolSeatsDeleted}석을 삭제했습니다.`
        : '선택한 공연에 삭제할 Last 시뮬레이션 데이터가 없습니다.',
    });
  });

  // 아래 4개 API는 첨부 mock 화면과 연결된다. B파트 콜백을 호출하지 않고
  // A파트의 좌석 분산 락·MariaDB 예약 저장·allocation 상태를 사용한다.
  fastify.post('/last-simulation/verify-link', async (request, reply) => {
    await ensureTables();
    const result = verifyCancelLinkToken(request.body?.token);
    if (!result.valid) return reply.status(result.reason === 'expired' ? 410 : 401).send({ valid: false, reason: result.reason, message: '취소표 링크가 유효하지 않거나 만료되었습니다.' });
    let allocation = await cancelAllocationService.getAllocationById(result.allocationId);
    const candidate = await candidateForAllocation(result.allocationId);
    if (!allocation || String(allocation.userId) !== String(result.userId) || String(allocation.eventId) !== String(result.eventId)) {
      return reply.status(410).send({ valid: false, reason: 'expired', message: '취소표 할당이 만료되었거나 이미 처리되었습니다.' });
    }
    if (allocation.status !== 'LINK_SENT') {
      return reply.status(410).send({ valid: false, reason: 'expired', message: '취소표 할당이 만료되었거나 이미 처리되었습니다.' });
    }
    const expiresMs = new Date(allocation.expiresAt).getTime();
    const remainingSeconds = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
    if (remainingSeconds <= 0) return reply.status(410).send({ valid: false, reason: 'expired', message: '취소표 입장 시간이 만료되었습니다.' });

    // Local Gmail SMTP 링크는 Last 전용 후보 테이블을 사용하지 않는다.
    // 기존 Local 시뮬레이션의 allocation을 그대로 인정하되, Last 화면과
    // 좌석맵을 사용하도록 호환 응답을 반환한다.
    if (!candidate) {
      const localSeatInfo = allocation.seatId ? await redis.hgetall(`seat:${allocation.seatId}`) : {};
      const localHeldSeatId = localSeatInfo.status === seatService.STATUS.HELD
        && String(localSeatInfo.heldBy || '') === String(allocation.userId)
        ? allocation.seatId
        : null;
      const accessToken = issueScopedCancelToken(allocation.userId, allocation.eventId, allocation.id, remainingSeconds);
      return reply.send({
        valid: true,
        mode: 'local',
        userId: allocation.userId,
        eventId: allocation.eventId,
        allocationId: allocation.id,
        seatId: allocation.seatId || null,
        heldSeatId: localHeldSeatId,
        sessionDate: allocation.sessionDate,
        sessionTime: allocation.sessionTime,
        expiresAt: new Date(expiresMs).toISOString(),
        remainingSeconds,
        accessToken,
        pool: allocation.seatId ? [{ seatId: allocation.seatId, section: '', price: 0, status: 'AVAILABLE' }] : [],
      });
    }

    if (candidate.user_id !== allocation.userId) return reply.status(410).send({ valid: false, reason: 'expired', message: '취소표 할당이 만료되었거나 이미 처리되었습니다.' });

    // 브라우저를 닫거나 결제 단계에서 이전 화면으로 돌아온 뒤에도 Secret Link는
    // 유효해야 한다. Redis에 실제 HELD 상태가 남아 있지 않은데 allocation에만
    // seat_id가 남은 경우에는 이전 선택의 흔적이므로 정리해 다시 고를 수 있게 한다.
    let heldSeatId = null;
    if (allocation.seatId) {
      const seatInfo = await redis.hgetall(`seat:${allocation.seatId}`);
      const isHeldByLinkUser = seatInfo.status === seatService.STATUS.HELD
        && String(seatInfo.heldBy || '') === String(allocation.userId);
      if (isHeldByLinkUser) {
        heldSeatId = allocation.seatId;
      } else {
        await cancelAllocationService.clearSeatAssignmentById(allocation.id, allocation.seatId);
        await pool.query(
          `UPDATE cancel_last_pool_seats SET status = 'AVAILABLE'
           WHERE campaign_id = ? AND seat_id = ? AND status = 'HELD'`,
          [candidate.campaign_id, allocation.seatId],
        );
        await pool.query(
          `UPDATE cancel_last_candidates SET status = 'LINK_SENT'
           WHERE campaign_id = ? AND allocation_id = ? AND status = 'HELD'`,
          [candidate.campaign_id, allocation.id],
        );
        allocation = await cancelAllocationService.getAllocationById(result.allocationId);
      }
    }
    const sessionPool = await poolRows(candidate.campaign_id);
    const currentRows = await pool.query(
      `SELECT sequence_no FROM cancel_last_candidates
       WHERE campaign_id = ? AND status IN ('LINK_SENT', 'HELD')
       ORDER BY sequence_no ASC LIMIT 1`,
      [candidate.campaign_id],
    );
    const currentSeqNo = currentRows[0]?.sequence_no ?? null;
    const accessToken = issueScopedCancelToken(allocation.userId, allocation.eventId, allocation.id, remainingSeconds);
    return reply.send({ valid: true, userId: allocation.userId, eventId: allocation.eventId, allocationId: allocation.id, seatId: allocation.seatId || null, heldSeatId, sessionDate: allocation.sessionDate, sessionTime: allocation.sessionTime, expiresAt: new Date(expiresMs).toISOString(), remainingSeconds, accessToken, campaignId: candidate.campaign_id, sequenceNo: candidate.sequence_no, currentSequenceNo: currentSeqNo, canSelect: currentSeqNo !== null && currentSeqNo === candidate.sequence_no, pool: sessionPool.map((seat) => ({ seatId: seat.seat_id, section: seat.section, price: Number(seat.price) || 0, status: seat.status })) });
  });

  fastify.get('/last-simulation/pool', userAuth, async (request, reply) => {
    await ensureTables();
    const auth = request.authUser || request.cancelLink;
    const allocationId = String(request.query?.allocationId || auth?.allocationId || '');
    const candidate = await candidateForAllocation(allocationId);
    if (!candidate) {
      // Local Gmail 링크도 Last 화면의 폴링 API를 사용한다. 이 경우에는
      // Last 전용 풀 테이블 대신 해당 회차의 실제 좌석 상태를 반환한다.
      const allocation = await cancelAllocationService.getAllocationById(allocationId);
      if (!allocation || String(allocation.userId) !== String(auth?.userId) || allocation.status !== 'LINK_SENT') {
        return reply.status(403).send({ success: false, code: 'allocation_mismatch', message: '취소표 할당을 확인할 수 없습니다.' });
      }
      const expiresMs = new Date(allocation.expiresAt).getTime();
      if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) {
        return reply.status(410).send({ success: false, code: 'allocation_expired', message: '취소표 링크가 만료되었습니다.' });
      }
      const seats = await seatService.getAllSeats(allocation.eventId, {
        eventId: allocation.eventId,
        sessionDate: allocation.sessionDate,
        sessionTime: allocation.sessionTime,
      });
      return reply.send({
        success: true,
        mode: 'local',
        campaignId: null,
        sequenceNo: null,
        currentSequenceNo: null,
        canSelect: Boolean(allocation.seatId),
        seats: seats.map((seat) => ({
          seatId: seat.seatId,
          section: seat.section,
          price: Number(seat.price) || 0,
          status: seat.status,
        })),
      });
    }
    if (String(candidate.user_id) !== String(auth?.userId)) return reply.status(403).send({ success: false, code: 'allocation_mismatch', message: 'Last 시뮬레이션 할당을 확인할 수 없습니다.' });
    const current = await currentCandidate(candidate.campaign_id);
    const rows = await poolRows(candidate.campaign_id);
    return reply.send({ success: true, campaignId: candidate.campaign_id, sequenceNo: candidate.sequence_no, currentSequenceNo: current?.sequence_no || null, canSelect: current && current.sequence_no === candidate.sequence_no, seats: rows.map((seat) => ({ seatId: seat.seat_id, section: seat.section, price: Number(seat.price) || 0, status: seat.status })) });
  });

  fastify.post('/last-simulation/hold', userAuth, async (request, reply) => {
    await ensureTables();
    const body = request.body || {};
    const auth = request.authUser || request.cancelLink;
    const userId = String(body.userId || auth?.userId || '');
    const allocationId = String(body.allocationId || auth?.allocationId || '');
    if (!userId || !body.eventId || !body.seatId) return reply.status(400).send({ success: false, message: 'userId, eventId, seatId가 필요합니다.' });
    if (String(auth?.userId) !== userId || String(auth?.allocationId || allocationId) !== allocationId) return reply.status(403).send({ success: false, reason: 'allocation_mismatch', message: '본인에게 발급된 Last 링크만 사용할 수 있습니다.' });
    const allocation = await cancelAllocationService.getAllocationById(allocationId);
    const candidate = await candidateForAllocation(allocationId);
    const current = candidate ? await currentCandidate(candidate.campaign_id) : null;
    if (!candidate) {
      // Final 화면은 기존 Local SMTP 링크도 사용한다. Local 링크에는
      // Last 후보 행이 없으므로 후보 순번 검사를 건너뛰되, allocation과
      // 회차·사용자·만료·배정 좌석 검증은 동일하게 적용한다.
      if (!allocation || String(allocation.userId) !== userId || String(allocation.eventId) !== String(body.eventId) || allocation.status !== 'LINK_SENT') {
        return reply.status(409).send({ success: false, reason: 'allocation_invalid', message: '유효한 취소표 할당이 없습니다.' });
      }
      const expiresMs = new Date(allocation.expiresAt).getTime();
      if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) {
        return reply.status(401).send({ success: false, reason: 'expired', message: '취소표 링크가 만료되었습니다.' });
      }
      if (allocation.seatId && String(allocation.seatId) !== String(body.seatId)) {
        return reply.status(409).send({ success: false, reason: 'seat_mismatch', message: '배정된 좌석과 요청한 좌석이 다릅니다.' });
      }

      let claimedByRequest = false;
      if (!allocation.seatId) {
        const context = {
          eventId: body.eventId,
          sessionDate: body.sessionDate || allocation.sessionDate,
          sessionTime: body.sessionTime || allocation.sessionTime,
        };
        const sessionSeats = await seatService.getAllSeats(body.eventId, context);
        const requestedSeat = sessionSeats.find((seat) => String(seat.seatId) === String(body.seatId));
        if (!requestedSeat) return reply.status(409).send({ success: false, reason: 'seat_session_mismatch', message: '선택한 좌석이 해당 공연 회차에 없습니다.' });
        if (String(requestedSeat.status).toUpperCase() !== 'AVAILABLE') return reply.status(409).send({ success: false, reason: 'unavailable', message: '이미 선택할 수 없는 좌석입니다.' });
        const assignment = await cancelAllocationService.assignSeatById(allocationId, body.seatId);
        if (!assignment.success) return reply.status(409).send({ success: false, reason: assignment.reason, message: assignment.message || '취소표 좌석을 할당할 수 없습니다.' });
        claimedByRequest = !assignment.idempotent;
      }

      const context = {
        eventId: body.eventId,
        sessionDate: body.sessionDate || allocation.sessionDate,
        sessionTime: body.sessionTime || allocation.sessionTime,
      };
      let result;
      try {
        result = await seatService.holdSeat(userId, body.seatId, '', context, { cancelLink: true });
      } catch (err) {
        if (claimedByRequest) await cancelAllocationService.clearSeatAssignmentById(allocationId, body.seatId).catch(() => {});
        throw err;
      }
      if (!result.success && claimedByRequest) await cancelAllocationService.clearSeatAssignmentById(allocationId, body.seatId).catch(() => {});
      return reply.status(result.success ? 200 : 409).send({ ...result, allocation: await cancelAllocationService.getAllocationById(allocationId), mode: 'local' });
    }
    if (!allocation || allocation.status !== 'LINK_SENT') return reply.status(409).send({ success: false, reason: 'allocation_invalid', message: '유효한 취소표 할당이 없습니다.' });
    if (!current || current.sequence_no !== candidate.sequence_no) return reply.status(409).send({ success: false, reason: 'not_your_turn', message: `현재 ${current?.sequence_no || '-'}번째 취소표 순번을 처리 중입니다.` });
    const poolSeat = (await pool.query('SELECT * FROM cancel_last_pool_seats WHERE campaign_id = ? AND seat_id = ? LIMIT 1', [candidate.campaign_id, body.seatId]))[0];
    if (!poolSeat || poolSeat.status !== 'AVAILABLE') return reply.status(409).send({ success: false, reason: 'unavailable', message: 'Last 취소표 풀에서 선택 가능한 좌석이 아닙니다.' });
    const assignment = await cancelAllocationService.assignSeatById(allocationId, body.seatId);
    if (!assignment.success) return reply.status(409).send({ success: false, reason: assignment.reason, message: assignment.message || '좌석 할당에 실패했습니다.' });
    let result;
    try {
      result = await seatService.holdSeat(userId, body.seatId, '', { eventId: body.eventId, sessionDate: body.sessionDate || candidate.session_date, sessionTime: body.sessionTime || candidate.session_time }, { cancelLink: true });
    } catch (err) {
      if (!assignment.idempotent) await cancelAllocationService.clearSeatAssignmentById(allocationId, body.seatId).catch(() => {});
      throw err;
    }
    if (!result.success) {
      if (!assignment.idempotent) await cancelAllocationService.clearSeatAssignmentById(allocationId, body.seatId).catch(() => {});
      return reply.status(409).send(result);
    }
    await pool.query(`UPDATE cancel_last_pool_seats SET status = 'HELD' WHERE campaign_id = ? AND seat_id = ?`, [candidate.campaign_id, body.seatId]);
    await pool.query(`UPDATE cancel_last_candidates SET status = 'HELD' WHERE campaign_id = ? AND user_id = ?`, [candidate.campaign_id, userId]);
    return reply.send({ ...result, allocationId, campaignId: candidate.campaign_id });
  });

  // 결제 전에 좌석 선택 화면으로 되돌아갈 때 쓰는 비파괴 해제 API다.
  // allocation과 Secret Link는 유지하고, Last 공용 풀에서만 선택 좌석을 반납한다.
  fastify.post('/last-simulation/release', userAuth, async (request, reply) => {
    await ensureTables();
    const body = request.body || {};
    const auth = request.authUser || request.cancelLink;
    const allocationId = String(body.allocationId || auth?.allocationId || '');
    const allocation = await cancelAllocationService.getAllocationById(allocationId);
    const candidate = await candidateForAllocation(allocationId);

    if (auth?.allocationId && String(auth.allocationId) !== allocationId) {
      return reply.status(403).send({ success: false, reason: 'allocation_mismatch', message: '본인에게 발급된 Last 링크만 사용할 수 있습니다.' });
    }
    if (!allocation || String(allocation.userId) !== String(auth?.userId) || allocation.status !== 'LINK_SENT') {
      return reply.status(409).send({ success: false, reason: 'allocation_invalid', message: '해제할 활성 취소표 할당이 없습니다.' });
    }

    // 이미 해제된 경우도 링크를 다시 사용할 수 있어야 하므로 멱등 성공으로 응답한다.
    if (!allocation.seatId) {
      return reply.send({ success: true, idempotent: true, allocationId, message: '선점된 좌석이 없습니다.' });
    }

    const release = await seatService.releaseSeat(allocation.userId, allocation.seatId);
    if (!release.success && release.reason !== 'not_held') {
      return reply.status(409).send({ ...release, message: release.message || '좌석 선점을 해제할 수 없습니다.' });
    }

    // Local 링크는 사전 배정 좌석을 유지한다. Last 공용 풀 후보만 allocation의
    // 좌석 연결을 지우고, 후보와 풀을 다시 선택 가능한 상태로 되돌린다.
    if (candidate) {
      await cancelAllocationService.clearSeatAssignmentById(allocationId, allocation.seatId);
      await pool.query(
        `UPDATE cancel_last_pool_seats SET status = 'AVAILABLE'
         WHERE campaign_id = ? AND seat_id = ?`,
        [candidate.campaign_id, allocation.seatId],
      );
      await pool.query(
        `UPDATE cancel_last_candidates SET status = 'LINK_SENT'
         WHERE campaign_id = ? AND allocation_id = ? AND status = 'HELD'`,
        [candidate.campaign_id, allocationId],
      );
    }

    return reply.send({
      success: true,
      idempotent: !release.success,
      allocationId,
      seatId: allocation.seatId,
      message: '좌석 선점이 해제되었습니다. 링크 유효 시간 안에 다른 좌석을 다시 선택할 수 있습니다.',
    });
  });

  fastify.post('/last-simulation/confirm', userAuth, async (request, reply) => {
    await ensureTables();
    const body = request.body || {};
    const auth = request.authUser || request.cancelLink;
    const allocationId = String(body.allocationId || auth?.allocationId || '');
    const allocation = await cancelAllocationService.getAllocationById(allocationId);
    const candidate = await candidateForAllocation(allocationId);
    const current = candidate ? await currentCandidate(candidate.campaign_id) : null;
    if (!candidate) {
      if (!allocation || String(allocation.userId) !== String(auth?.userId) || String(allocation.eventId) !== String(body.eventId) || allocation.status !== 'LINK_SENT' || !allocation.seatId) {
        return reply.status(409).send({ success: false, reason: 'allocation_invalid', message: '결제할 좌석 선점 정보를 찾을 수 없습니다.' });
      }
      const expiresMs = new Date(allocation.expiresAt).getTime();
      if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) {
        return reply.status(409).send({ success: false, reason: 'expired', message: '취소표 링크가 만료되었습니다.' });
      }
      if (String(body.seatId || allocation.seatId) !== String(allocation.seatId)) {
        return reply.status(409).send({ success: false, reason: 'seat_mismatch', message: '결제 좌석과 취소표 할당 좌석이 다릅니다.' });
      }
      const result = await seatService.confirmSeat(
        allocation.userId,
        allocation.seatId,
        { eventId: allocation.eventId, sessionDate: body.sessionDate || allocation.sessionDate, sessionTime: body.sessionTime || allocation.sessionTime },
        { skipBCallback: true },
      );
      if (!result.success) return reply.status(409).send(result);
      await completeStandbyQueue({
        userId: allocation.userId,
        eventId: allocation.eventId,
        sessionDate: allocation.sessionDate,
        sessionTime: allocation.sessionTime,
      });
      await savePaymentMethod(allocation.seatId, allocation.userId, body.paymentMethod).catch((err) => {
        console.warn('[LastSimulation] 결제수단 저장 실패:', err.message);
      });
      await saveLastHistory({
        allocationId,
        userId: allocation.userId,
        eventId: allocation.eventId,
        sessionDate: allocation.sessionDate,
        sessionTime: allocation.sessionTime,
        seatId: allocation.seatId,
        action: 'COMPLETED',
      });
      const mail = await sendLastBookingEmail({
        userId: allocation.userId,
        eventId: allocation.eventId,
        sessionDate: allocation.sessionDate,
        sessionTime: allocation.sessionTime,
        seatId: allocation.seatId,
        paymentMethod: body.paymentMethod,
      });
      return reply.send({ ...result, allocationId, mode: 'local', emailSent: Boolean(mail.success) });
    }
    if (!allocation || allocation.status !== 'LINK_SENT' || !allocation.seatId) return reply.status(409).send({ success: false, reason: 'allocation_invalid', message: '결제할 좌석 선점 정보를 찾을 수 없습니다.' });
    if (!current || current.sequence_no !== candidate.sequence_no) return reply.status(409).send({ success: false, reason: 'not_your_turn', message: '아직 결제 순서가 아닙니다.' });
    const result = await seatService.confirmSeat(allocation.userId, allocation.seatId, { eventId: candidate.event_id, sessionDate: candidate.session_date, sessionTime: candidate.session_time }, { skipBCallback: true });
    if (!result.success) return reply.status(409).send(result);
    await pool.query(`UPDATE cancel_last_pool_seats SET status = 'SOLD' WHERE campaign_id = ? AND seat_id = ?`, [candidate.campaign_id, allocation.seatId]);
    await pool.query(`UPDATE cancel_last_candidates SET status = 'COMPLETED' WHERE campaign_id = ? AND user_id = ?`, [candidate.campaign_id, candidate.user_id]);
    await completeStandbyQueue({
      queueId: candidate.queue_id,
      userId: candidate.user_id,
      eventId: candidate.event_id,
      sessionDate: candidate.session_date,
      sessionTime: candidate.session_time,
    });
    await savePaymentMethod(allocation.seatId, allocation.userId, body.paymentMethod).catch((err) => {
      console.warn('[LastSimulation] 결제수단 저장 실패:', err.message);
    });
    await saveLastHistory({
      allocationId,
      campaignId: candidate.campaign_id,
      userId: candidate.user_id,
      eventId: candidate.event_id,
      sessionDate: candidate.session_date,
      sessionTime: candidate.session_time,
      seatId: allocation.seatId,
      action: 'COMPLETED',
    });
    const mail = await sendLastBookingEmail({
      userId: candidate.user_id,
      eventId: candidate.event_id,
      sessionDate: candidate.session_date,
      sessionTime: candidate.session_time,
      seatId: allocation.seatId,
      paymentMethod: body.paymentMethod,
    });
    clearLastLinkExpiryTimer(allocationId);
    await resetFutureIssuedCandidates(candidate.campaign_id, candidate.sequence_no);
    const nextLink = await issueNextCandidateLink(await getCampaign(candidate.campaign_id)).catch((err) => {
      console.error('[LastSimulation] 결제 완료 후 다음 링크 발급 실패:', err.message);
      return { success: false, reason: 'next_link_issue_failed' };
    });
    return reply.send({
      ...result,
      allocationId,
      campaignId: candidate.campaign_id,
      emailSent: Boolean(mail.success),
      nextLinkIssued: Boolean(nextLink?.issued),
      nextCandidate: nextLink?.sent || null,
      message: 'Last 취소표 결제가 완료되었습니다.',
    });
  });

  // 일반 로그인 세션으로만 읽는다. Secret Link 세션은 좌석 선택 범위로
  // 제한하고, 마이페이지의 취소/환불내역은 실제 계정 소유자만 조회한다.
  fastify.get('/last-simulation/history/mine', { preHandler: [authenticate] }, async (request, reply) => {
    await ensureTables();
    const rows = await pool.query(
      `SELECT h.history_id, h.allocation_id, h.campaign_id, h.event_id,
              h.session_date, h.session_time, h.seat_id, h.action, h.created_at,
              e.event_name, e.venue
       FROM cancel_last_history h
       LEFT JOIN events e ON e.event_id = h.event_id
       WHERE h.user_id = ? AND h.action = 'PASSED'
       ORDER BY h.created_at DESC`,
      [request.authUser.userId],
    );
    return reply.send({
      history: rows.map((row) => ({
        historyId: row.history_id,
        allocationId: row.allocation_id,
        campaignId: row.campaign_id,
        eventId: row.event_id,
        eventName: row.event_name || row.event_id,
        venue: row.venue || '',
        sessionDate: row.session_date || '',
        sessionTime: row.session_time || '',
        seatId: row.seat_id || null,
        action: row.action,
        createdAt: toIso(row.created_at),
      })),
    });
  });

  // 선택할 좌석이 없을 때 사용자가 명시적으로 순번을 반납한다. 선점 좌석은
  // 즉시 풀로 돌리고, standby 행을 COMPLETED로 종료해 마이페이지 대기열에서
  // 사라지게 한다. 결제되지 않았으므로 reservations 대신 전용 이력에 기록한다.
  fastify.post('/last-simulation/pass', userAuth, async (request, reply) => {
    await ensureTables();
    const auth = request.authUser || request.cancelLink;
    const allocationId = String(request.body?.allocationId || auth?.allocationId || '');
    const allocation = await cancelAllocationService.getAllocationById(allocationId);
    const candidate = await candidateForAllocation(allocationId);
    if (!allocation) return reply.status(404).send({ success: false, reason: 'allocation_missing', message: '취소표 할당을 찾을 수 없습니다.' });
    if (String(allocation.userId) !== String(auth?.userId)) return reply.status(403).send({ success: false, reason: 'allocation_mismatch', message: '본인에게 발급된 취소표 링크만 사용할 수 있습니다.' });
    if (allocation.status === 'RESPONDED') return reply.status(409).send({ success: false, reason: 'already_completed', message: '이미 결제가 완료된 취소표입니다.' });
    if (allocation.status === 'EXPIRED') return reply.send({ success: true, idempotent: true, status: candidate?.status || 'EXPIRED', message: '이미 취소표 순번이 종료되었습니다.' });
    if (allocation.status !== 'LINK_SENT') return reply.status(409).send({ success: false, reason: 'allocation_invalid', message: '순번을 넘길 수 있는 취소표 할당이 아닙니다.' });

    clearLastLinkExpiryTimer(allocationId);
    if (allocation.seatId) await seatService.releaseSeat(allocation.userId, allocation.seatId).catch(() => {});
    await cancelAllocationService.markExpiredById(allocationId);
    if (candidate) {
      await pool.query(`UPDATE cancel_last_candidates SET status = 'PASSED' WHERE campaign_id = ? AND user_id = ?`, [candidate.campaign_id, candidate.user_id]);
      if (allocation.seatId) {
        await pool.query(`UPDATE cancel_last_pool_seats SET status = 'AVAILABLE' WHERE campaign_id = ? AND seat_id = ?`, [candidate.campaign_id, allocation.seatId]);
      }
      await completeStandbyQueue({
        queueId: candidate.queue_id,
        userId: candidate.user_id,
        eventId: candidate.event_id,
        sessionDate: candidate.session_date,
        sessionTime: candidate.session_time,
      });
      await saveLastHistory({
        allocationId,
        campaignId: candidate.campaign_id,
        userId: candidate.user_id,
        eventId: candidate.event_id,
        sessionDate: candidate.session_date,
        sessionTime: candidate.session_time,
        seatId: allocation.seatId || null,
        action: 'PASSED',
      });
    } else {
      await completeStandbyQueue({
        userId: allocation.userId,
        eventId: allocation.eventId,
        sessionDate: allocation.sessionDate,
        sessionTime: allocation.sessionTime,
      });
      await saveLastHistory({
        allocationId,
        userId: allocation.userId,
        eventId: allocation.eventId,
        sessionDate: allocation.sessionDate,
        sessionTime: allocation.sessionTime,
        seatId: allocation.seatId || null,
        action: 'PASSED',
      });
    }
    const nextLink = candidate
      ? await (async () => {
        await resetFutureIssuedCandidates(candidate.campaign_id, candidate.sequence_no);
        return issueNextCandidateLink(await getCampaign(candidate.campaign_id));
      })().catch((err) => {
        console.error('[LastSimulation] 순번 양도 후 다음 링크 발급 실패:', err.message);
        return { success: false, reason: 'next_link_issue_failed' };
      })
      : null;
    return reply.send({
      success: true,
      status: 'PASSED',
      nextLinkIssued: Boolean(nextLink?.issued),
      nextCandidate: nextLink?.sent || null,
      message: nextLink?.issued
        ? `${nextLink.sent.sequenceNo}번 사용자에게 다음 Secret Link를 발급했습니다.`
        : '취소표 순번을 다음 사용자에게 넘겼습니다.',
    });
  });

  fastify.post('/last-simulation/expire', userAuth, async (request, reply) => {
    await ensureTables();
    const auth = request.authUser || request.cancelLink;
    const allocationId = String(request.body?.allocationId || auth?.allocationId || '');
    const allocation = await cancelAllocationService.getAllocationById(allocationId);
    const candidate = await candidateForAllocation(allocationId);
    if (!candidate) {
      if (!allocation) return reply.send({ success: true, idempotent: true, status: 'EXPIRED' });
      if (String(allocation.userId) !== String(auth?.userId)) return reply.status(403).send({ success: false, reason: 'allocation_mismatch', message: '본인에게 발급된 취소표 링크만 사용할 수 있습니다.' });
      if (allocation.status === 'EXPIRED') return reply.send({ success: true, idempotent: true, status: 'EXPIRED' });
      if (allocation.status !== 'LINK_SENT') return reply.status(409).send({ success: false, reason: 'already_completed', message: '이미 완료된 할당입니다.' });
      if (allocation.seatId) await seatService.releaseSeat(allocation.userId, allocation.seatId).catch(() => {});
      const expired = await cancelAllocationService.markExpiredById(allocationId);
      return reply.send({ success: true, idempotent: Boolean(expired.idempotent), status: 'EXPIRED', message: '링크가 만료되어 취소표 할당을 종료했습니다.' });
    }
    if (allocation.status === 'EXPIRED') return reply.send({ success: true, idempotent: true, status: 'EXPIRED' });
    if (allocation.status !== 'LINK_SENT') return reply.status(409).send({ success: false, reason: 'already_completed', message: '이미 완료된 할당입니다.' });
    await expireLastCandidate(candidate, allocation);
    await resetFutureIssuedCandidates(candidate.campaign_id, candidate.sequence_no);
    const nextLink = await issueNextCandidateLink(await getCampaign(candidate.campaign_id)).catch((err) => {
      console.error('[LastSimulation] 링크 만료 후 다음 링크 발급 실패:', err.message);
      return { success: false, reason: 'next_link_issue_failed' };
    });
    return reply.send({
      success: true,
      idempotent: false,
      status: 'EXPIRED',
      nextLinkIssued: Boolean(nextLink?.issued),
      nextCandidate: nextLink?.sent || null,
      message: nextLink?.issued
        ? `링크가 만료되어 ${nextLink.sent.sequenceNo}번 사용자에게 다음 Secret Link를 발급했습니다.`
        : '링크가 만료되어 다음 순번으로 넘어갑니다.',
    });
  });
}

module.exports = lastSimulationRoutes;
