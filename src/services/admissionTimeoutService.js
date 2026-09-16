const redis = require('../config/redis');
const queueService = require('./queueService');
const { normalizeSessionContext } = require('./sessionContext');
const { acquireLock, releaseLock } = require('./lockService');

const DEFAULT_CHECK_INTERVAL_MS = 1000;
let timeoutTimer = null;
let cycleRunning = false;

function getCheckIntervalMs() {
  const configured = Number.parseInt(process.env.ADMISSION_TIMEOUT_CHECK_INTERVAL_MS, 10);
  return Number.isFinite(configured)
    ? Math.max(250, configured)
    : DEFAULT_CHECK_INTERVAL_MS;
}

function parseDeadlineMeta(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.userId) return null;

    const context = {
      eventId: parsed.eventId || '',
      sessionDate: parsed.sessionDate || '',
      sessionTime: parsed.sessionTime || '',
    };
    const normalized = normalizeSessionContext(context);
    return {
      userId: String(parsed.userId),
      context: normalized.scoped ? context : {},
    };
  } catch (_) {
    return null;
  }
}

async function isExpiredDeadline(field, rawMeta) {
  const deadlineKey = `${queueService.ADMISSION_DEADLINE_PREFIX}${field}`;
  const script = `
    local current = redis.call('HGET', KEYS[1], ARGV[1])
    if current ~= ARGV[2] then return 0 end
    if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
    return 1
  `;

  const result = await redis.eval(
    script,
    2,
    queueService.ADMISSION_DEADLINE_META,
    deadlineKey,
    field,
    rawMeta,
  );
  return Number(result) === 1;
}

function contextResource(context) {
  const normalized = normalizeSessionContext(context);
  return `admission:${normalized.eventId || 'default'}:${normalized.sessionKey}`;
}

async function expireOnce() {
  if (cycleRunning) return { expired: 0, backfilled: 0 };
  cycleRunning = true;

  let expired = 0;
  let backfilled = 0;
  try {
    const deadlines = await redis.hgetall(queueService.ADMISSION_DEADLINE_META);

    for (const [field, rawMeta] of Object.entries(deadlines)) {
      const meta = parseDeadlineMeta(rawMeta);
      if (!meta) {
        await redis.hdel(queueService.ADMISSION_DEADLINE_META, field);
        continue;
      }

      const resource = contextResource(meta.context);
      const lock = await acquireLock(resource);
      if (!lock.acquired) continue;

      try {
        const deadlineExpired = await isExpiredDeadline(field, rawMeta);
        if (!deadlineExpired) continue;

        const removed = await queueService.removeAdmitted(meta.userId, meta.context);
        await redis.hdel(queueService.ADMISSION_DEADLINE_META, field);
        if (!removed) continue;

        expired += 1;
        // An expired admitted user frees one admission slot. Only the eligible
        // queue is backfilled here; standby is a separate cancellation-ticket
        // flow and must not receive a normal admission token accidentally.
        const refill = await queueService.backfillOne(meta.context);
        if (refill) backfilled += 1;
      } catch (err) {
        console.error(`[AdmissionTimeout] 처리 실패 (${meta.userId}):`, err.message);
      } finally {
        await releaseLock(resource, lock.token).catch((err) => {
          console.warn('[AdmissionTimeout] 락 해제 실패:', err.message);
        });
      }
    }
  } finally {
    cycleRunning = false;
  }

  if (expired > 0) {
    console.log(`[AdmissionTimeout] 만료 ${expired}명, 재입장 ${backfilled}명`);
  }
  return { expired, backfilled };
}

function startAdmissionTimeoutWorker() {
  if (timeoutTimer) return;

  const intervalMs = getCheckIntervalMs();
  timeoutTimer = setInterval(() => {
    expireOnce().catch((err) => {
      console.error('[AdmissionTimeout] 워커 오류:', err.message);
    });
  }, intervalMs);

  expireOnce().catch((err) => {
    console.error('[AdmissionTimeout] 초기 점검 오류:', err.message);
  });
  console.log(`[AdmissionTimeout] 워커 시작 (${intervalMs}ms 간격)`);
}

function stopAdmissionTimeoutWorker() {
  if (!timeoutTimer) return;
  clearInterval(timeoutTimer);
  timeoutTimer = null;
}

module.exports = {
  expireOnce,
  startAdmissionTimeoutWorker,
  stopAdmissionTimeoutWorker,
};
