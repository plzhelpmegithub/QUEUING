const redis = require('../config/redis');
const pool = require('../config/mariadb');

const RETRY_KEY = 'sync:retry';
const MAX_RETRIES = 3;
let retryTimer = null;

async function queueRetry(query, params, label) {
  const item = JSON.stringify({ query, params, label, attempts: 0, queuedAt: Date.now() });
  await redis.rpush(RETRY_KEY, item);
  console.warn(`[SyncRetry] 큐에 추가: ${label}`);
}

async function syncToMariaDB(query, params, label) {
  try {
    await pool.query(query, params);
    return true;
  } catch (err) {
    console.error(`[SyncRetry] ${label} 실패: ${err.message}`);
    try {
      await queueRetry(query, params, label);
    } catch (_) {}
    return false;
  }
}

async function processRetryQueue() {
  const len = await redis.llen(RETRY_KEY);
  if (len === 0) return { processed: 0, succeeded: 0, failed: 0, remaining: 0 };

  let processed = 0, succeeded = 0, failed = 0;
  const requeue = [];

  const batchSize = Math.min(len, 50);
  for (let i = 0; i < batchSize; i++) {
    const raw = await redis.lpop(RETRY_KEY);
    if (!raw) break;
    processed++;

    let item;
    try { item = JSON.parse(raw); } catch { continue; }

    try {
      await pool.query(item.query, item.params);
      succeeded++;
      console.log(`[SyncRetry] 재시도 성공: ${item.label}`);
    } catch (err) {
      item.attempts = (item.attempts || 0) + 1;
      if (item.attempts < MAX_RETRIES) {
        requeue.push(JSON.stringify(item));
      } else {
        failed++;
        console.error(`[SyncRetry] 최종 실패 (${MAX_RETRIES}회 초과): ${item.label} — ${err.message}`);
      }
    }
  }

  if (requeue.length > 0) {
    await redis.rpush(RETRY_KEY, ...requeue);
  }

  const remaining = await redis.llen(RETRY_KEY);
  return { processed, succeeded, failed, remaining };
}

function startRetryWorker(intervalMs = 30000) {
  if (retryTimer) return;
  retryTimer = setInterval(async () => {
    try {
      const len = await redis.llen(RETRY_KEY);
      if (len > 0) {
        const result = await processRetryQueue();
        if (result.processed > 0) {
          console.log(`[SyncRetry] Worker: ${result.succeeded}/${result.processed} 성공, 남은 ${result.remaining}건`);
        }
      }
    } catch (err) {
      console.error('[SyncRetry] Worker 오류:', err.message);
    }
  }, intervalMs);
  console.log(`[SyncRetry] Worker 시작 (${intervalMs / 1000}초 간격)`);
}

function stopRetryWorker() {
  if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
}

let pausedRetryIntervalMs = null;

function pauseRetryWorker() {
  if (!retryTimer) return false;
  pausedRetryIntervalMs = 30000;
  stopRetryWorker();
  console.log('[SyncRetry] Worker 일시 정지');
  return true;
}

function resumeRetryWorker() {
  if (retryTimer) return false;
  if (!pausedRetryIntervalMs) return false;
  startRetryWorker(pausedRetryIntervalMs);
  pausedRetryIntervalMs = null;
  console.log('[SyncRetry] Worker 재개');
  return true;
}

function isRetryWorkerRunning() {
  return retryTimer !== null;
}

module.exports = { syncToMariaDB, processRetryQueue, startRetryWorker, stopRetryWorker, pauseRetryWorker, resumeRetryWorker, isRetryWorkerRunning };
