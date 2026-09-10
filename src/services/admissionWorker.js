const redis = require('../config/redis');
const pool = require('../config/mariadb');
const queueService = require('./queueService');
const { normalizeSessionContext } = require('./sessionContext');
const { acquireLock, releaseLock } = require('./lockService');
const { isConfigured: isAdmissionTokenConfigured } = require('./tokenService');

const DEFAULT_INTERVAL_MS = 1000;
let admissionTimer = null;
let cycleRunning = false;
let tokenWarningShown = false;

function asBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function isEnabled() {
  // AUTO_ADMIT is kept as a short alias for local development compatibility.
  return asBoolean(process.env.AUTO_ADMISSION_ENABLED || process.env.AUTO_ADMIT);
}

function getIntervalMs() {
  const configured = Number.parseInt(process.env.AUTO_ADMISSION_INTERVAL_MS, 10);
  return Number.isFinite(configured) ? Math.max(250, configured) : DEFAULT_INTERVAL_MS;
}

function contextIdentity(context = {}) {
  const normalized = normalizeSessionContext(context);
  return [normalized.eventId, normalized.sessionDate, normalized.sessionTime].join('|');
}

async function getWaitingContexts() {
  const contexts = [];
  const seen = new Set();

  // Keep support for the legacy unscoped queue used by the demo/admin API.
  if ((await redis.zcard('queue:waiting')) > 0) {
    contexts.push({});
    seen.add(contextIdentity({}));
  }

  // The database is the durable source for event/session information. Redis
  // queue keys contain a sanitized session key, so reading the DB avoids trying
  // to reconstruct the original date/time from that key.
  const rows = await pool.query(`
    SELECT DISTINCT event_id, session_date, session_time
    FROM waiting_queue
    WHERE queue_type = 'eligible'
      AND status = 'WAITING'
  `);

  for (const row of rows) {
    const context = {
      eventId: row.event_id || '',
      sessionDate: row.session_date || '',
      sessionTime: row.session_time || '',
    };
    const identity = contextIdentity(context);
    if (!seen.has(identity)) {
      contexts.push(context);
      seen.add(identity);
    }
  }

  return contexts;
}

async function admitContext(context) {
  const normalized = normalizeSessionContext(context);
  const resource = `admission:${normalized.eventId || 'default'}:${normalized.sessionKey}`;
  const lock = await acquireLock(resource);
  if (!lock.acquired) return null;

  try {
    const result = await queueService.admitBatch(context);
    if (result.count > 0) {
      console.log(
        `[Admission] 자동 승인: ${result.count}명 `
        + `(${normalized.eventId || 'default'} ${normalized.sessionDate || '-'} ${normalized.sessionTime || '-'}) `
        + `잔여 ${result.remaining ?? 0}명`,
      );
    }
    return result;
  } catch (err) {
    console.error(
      `[Admission] 자동 승인 실패 (${normalized.eventId || 'default'} ${normalized.sessionKey}):`,
      err.message,
    );
    return null;
  } finally {
    try {
      await releaseLock(resource, lock.token);
    } catch (err) {
      console.warn('[Admission] 자동 승인 락 해제 실패:', err.message);
    }
  }
}

async function runAdmissionCycle() {
  if (cycleRunning) return;
  if (!isAdmissionTokenConfigured()) {
    if (!tokenWarningShown) {
      tokenWarningShown = true;
      console.warn('[Admission] JWT_SECRET이 32자 이상 설정되지 않아 자동 승인을 건너뜁니다.');
    }
    return;
  }
  cycleRunning = true;

  try {
    const contexts = await getWaitingContexts();
    for (const context of contexts) {
      await admitContext(context);
    }
  } catch (err) {
    console.error('[Admission] 자동 승인 워커 오류:', err.message);
  } finally {
    cycleRunning = false;
  }
}

function startAdmissionWorker() {
  if (!isEnabled() || admissionTimer) return;

  const intervalMs = getIntervalMs();
  admissionTimer = setInterval(() => {
    runAdmissionCycle();
  }, intervalMs);

  // Do not wait for the first interval after a user joins the queue.
  runAdmissionCycle();
  console.log(`[Admission] 자동 승인 워커 시작 (${intervalMs}ms 간격)`);
}

function stopAdmissionWorker() {
  if (admissionTimer) {
    clearInterval(admissionTimer);
    admissionTimer = null;
  }
}

module.exports = {
  isEnabled,
  runAdmissionCycle,
  startAdmissionWorker,
  stopAdmissionWorker,
};
