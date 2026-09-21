const redis = require('../config/redis');
const { seatEvents } = require('./metricsService');
const { broadcast } = require('./sseService');

const SEAT_EVENT_CHANNEL = 'events:seat-status';
const REALTIME_SERVER_URL = process.env.REALTIME_SERVER_URL || '';

const EVENT_TYPE = {
  HELD: 'seat.held',
  SOLD: 'seat.sold',
  RELEASED: 'seat.released',
  CANCELLED: 'seat.cancelled',
  SOLD_OUT: 'seat.sold_out',
};

function extractChannelId(seatId) {
  if (!seatId) return '';
  const parts = seatId.split(':');
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : parts[0];
}

async function notifyRealtimeServer(channelId, event) {
  if (!REALTIME_SERVER_URL || !channelId) return;
  try {
    const url = `${REALTIME_SERVER_URL}/publish/seat/${encodeURIComponent(channelId)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      console.warn(`[Event] 실시간 서버 알림 실패: ${res.status}`);
    }
  } catch (err) {
    console.warn(`[Event] 실시간 서버 연결 실패: ${err.message}`);
  }
}

async function publishSeatEvent(type, payload) {
  const event = {
    type,
    seatId: payload.seatId,
    userId: payload.userId || null,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  const message = JSON.stringify(event);
  await redis.publish(SEAT_EVENT_CHANNEL, message);
  broadcast(type, event);
  seatEvents.inc({ type });

  const channelId = extractChannelId(payload.seatId);
  notifyRealtimeServer(channelId, event);

  console.log(`[Event] ${type} — ${payload.seatId}`);
}

module.exports = { publishSeatEvent, EVENT_TYPE, SEAT_EVENT_CHANNEL };
