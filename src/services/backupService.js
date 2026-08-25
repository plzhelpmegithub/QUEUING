const pool = require('../config/mariadb');
const redis = require('../config/redis');

async function saveQueueSnapshot(eventId) {
  const [eligible, standby, admitted, lastTicket, totalSeats] = await Promise.all([
    redis.zrange('queue:waiting', 0, -1, 'WITHSCORES'),
    redis.zrange('queue:standby', 0, -1, 'WITHSCORES'),
    redis.smembers('queue:admitted'),
    redis.get('queue:counter'),
    redis.get('event:total-seats'),
  ]);

  const snapshot = {
    eligible: pairScores(eligible),
    standby: pairScores(standby),
    admitted,
    lastTicket: parseInt(lastTicket, 10) || 0,
    totalSeats: parseInt(totalSeats, 10) || 0,
    capturedAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO backups (backup_type, event_id, data) VALUES ('QUEUE_SNAPSHOT', ?, ?)`,
    [eventId || '', JSON.stringify(snapshot)],
  );
  console.log(`[Backup] 대기열 스냅샷 저장 (eligible: ${snapshot.eligible.length}, standby: ${snapshot.standby.length}, admitted: ${admitted.length})`);
  return { type: 'QUEUE_SNAPSHOT', eventId, snapshot };
}

async function saveSeatSnapshot(eventId) {
  const keys = [];
  let cursor = '0';
  do {
    const [nextCursor, results] = await redis.scan(cursor, 'MATCH', 'seat:*', 'COUNT', 200);
    cursor = nextCursor;
    keys.push(...results);
  } while (cursor !== '0');

  const seats = [];
  if (keys.length > 0) {
    const pipeline = redis.pipeline();
    for (const key of keys) pipeline.hgetall(key);
    const results = await pipeline.exec();
    keys.forEach((key, i) => {
      seats.push({ seatId: key.replace('seat:', ''), ...results[i][1] });
    });
  }

  await pool.query(
    `INSERT INTO backups (backup_type, event_id, data) VALUES ('SEAT_SNAPSHOT', ?, ?)`,
    [eventId || '', JSON.stringify({ seats, capturedAt: new Date().toISOString() })],
  );
  console.log(`[Backup] 좌석 스냅샷 저장 (${seats.length}석)`);
  return { type: 'SEAT_SNAPSHOT', eventId, count: seats.length };
}

async function getLatestBackup(backupType, eventId) {
  const rows = await pool.query(
    `SELECT id, backup_type, event_id, data, created_at FROM backups
     WHERE backup_type = ? AND event_id = ? ORDER BY created_at DESC LIMIT 1`,
    [backupType, eventId || ''],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    backupType: r.backup_type,
    eventId: r.event_id,
    data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}

async function listBackups(eventId, limit = 20) {
  const rows = await pool.query(
    `SELECT id, backup_type, event_id, created_at FROM backups
     WHERE event_id = ? ORDER BY created_at DESC LIMIT ?`,
    [eventId || '', limit],
  );
  return rows.map(r => ({
    id: r.id,
    backupType: r.backup_type,
    eventId: r.event_id,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  }));
}

async function restoreQueueSnapshot(backupId) {
  const rows = await pool.query(
    `SELECT data FROM backups WHERE id = ? AND backup_type = 'QUEUE_SNAPSHOT'`,
    [backupId],
  );
  if (rows.length === 0) return { success: false, message: '해당 백업을 찾을 수 없습니다.' };

  const snapshot = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;

  await redis.del('queue:waiting', 'queue:standby', 'queue:admitted', 'queue:counter');

  if (snapshot.eligible.length > 0) {
    const args = snapshot.eligible.flatMap(e => [e.score, e.userId]);
    await redis.zadd('queue:waiting', ...args);
  }
  if (snapshot.standby.length > 0) {
    const args = snapshot.standby.flatMap(e => [e.score, e.userId]);
    await redis.zadd('queue:standby', ...args);
  }
  if (snapshot.admitted.length > 0) {
    await redis.sadd('queue:admitted', ...snapshot.admitted);
  }
  if (snapshot.lastTicket) {
    await redis.set('queue:counter', snapshot.lastTicket);
  }
  if (snapshot.totalSeats) {
    await redis.set('event:total-seats', snapshot.totalSeats);
  }

  console.log(`[Backup] 대기열 복구 완료 (backupId: ${backupId})`);
  return { success: true, message: '대기열이 복구되었습니다.', snapshot };
}

function pairScores(arr) {
  const result = [];
  for (let i = 0; i < arr.length; i += 2) {
    result.push({ userId: arr[i], score: parseInt(arr[i + 1], 10) });
  }
  return result;
}

module.exports = { saveQueueSnapshot, saveSeatSnapshot, getLatestBackup, listBackups, restoreQueueSnapshot };
