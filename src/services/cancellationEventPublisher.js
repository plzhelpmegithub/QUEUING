const {
  SQSClient,
  SendMessageCommand,
} = require('@aws-sdk/client-sqs');

const pool = require('../config/mariadb');

const QUEUE_URL = process.env.CANCELLATION_EVENTS_QUEUE_URL
  || process.env.SQS_CANCELLATION_EVENTS_QUEUE_URL
  || '';

const MAX_RETRY = 3;

function createClient() {
  const config = {
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-northeast-2',
  };

  if (process.env.AWS_ENDPOINT) config.endpoint = process.env.AWS_ENDPOINT;
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }

  return new SQSClient(config);
}

function isConfigured() {
  return Boolean(QUEUE_URL);
}

const sqsClient = createClient();

async function sendToSQS(event) {
  return sqsClient.send(new SendMessageCommand({
    QueueUrl: QUEUE_URL,
    MessageBody: JSON.stringify(event),
  }));
}

async function saveToOutbox(event, errorMessage = '') {
  try {
    await pool.query(
      `INSERT INTO cancellation_outbox (event_payload, status, attempts, last_error)
       VALUES (?, 'PENDING', 1, ?)`,
      [JSON.stringify(event), errorMessage],
    );
    console.warn(`[CancellationEvent] outbox 저장: ${event.dedup_key}`);
  } catch (err) {
    console.error(`[CancellationEvent] outbox 저장 실패:`, err.message);
  }
}

async function publishCancellationEvent({
  eventId,
  seatId,
  userId,
  reservationId = null,
  status = 'CANCELLED',
  sessionDate = '',
  sessionTime = '',
  reason = 'reservation_cancelled',
}) {
  const dedupKey = `${eventId || ''}#${seatId || ''}#${reservationId || ''}`;

  const event = {
    event_id: eventId || '',
    seat_id: seatId || '',
    reservation_id: reservationId,
    dedup_key: dedupKey,
    status,
    timestamp: new Date().toISOString(),
    user_id: userId || null,
    session_date: sessionDate || '',
    session_time: sessionTime || '',
    reason,
  };

  if (!QUEUE_URL) {
    await saveToOutbox(event, 'CANCELLATION_EVENTS_QUEUE_URL 미설정');
    return { published: false, skipped: true, reason: 'queue_not_configured' };
  }

  try {
    const result = await sendToSQS(event);
    console.log(`[CancellationEvent] SQS 발행 완료: ${dedupKey} (${event.status})`);
    return { published: true, messageId: result.MessageId || null, event };
  } catch (err) {
    console.error(`[CancellationEvent] SQS 발행 실패 → outbox 저장: ${err.message}`);
    await saveToOutbox(event, err.message);
    return { published: false, outboxed: true, event };
  }
}

async function relayCancellationOutbox() {
  if (!QUEUE_URL) return { relayed: 0, failed: 0 };

  const pending = await pool.query(
    `SELECT id, event_payload, attempts FROM cancellation_outbox
     WHERE status = 'PENDING' AND attempts < ?
     ORDER BY created_at LIMIT 50`,
    [MAX_RETRY],
  );

  let relayed = 0;
  let failed = 0;

  for (const row of pending) {
    const event = typeof row.event_payload === 'string'
      ? JSON.parse(row.event_payload)
      : row.event_payload;
    try {
      await sendToSQS(event);
      await pool.query(
        `UPDATE cancellation_outbox SET status = 'SENT', sent_at = UTC_TIMESTAMP() WHERE id = ?`,
        [row.id],
      );
      relayed += 1;
    } catch (err) {
      const newAttempts = (row.attempts || 0) + 1;
      const newStatus = newAttempts >= MAX_RETRY ? 'FAILED' : 'PENDING';
      await pool.query(
        `UPDATE cancellation_outbox SET attempts = ?, last_error = ?, status = ? WHERE id = ?`,
        [newAttempts, err.message, newStatus, row.id],
      );
      failed += 1;
    }
  }

  if (relayed > 0 || failed > 0) {
    console.log(`[CancellationEvent] outbox relay: ${relayed}건 발행, ${failed}건 실패`);
  }
  return { relayed, failed };
}

module.exports = { isConfigured, publishCancellationEvent, relayCancellationOutbox };
