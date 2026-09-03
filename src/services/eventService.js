const redis = require('../config/redis');
const { seatEvents } = require('./metricsService');
const { broadcast } = require('./sseService');

const SEAT_EVENT_CHANNEL = 'events:seat-status';

const EVENT_TYPE = {
  HELD: 'seat.held',
  SOLD: 'seat.sold',
  RELEASED: 'seat.released',
  CANCELLED: 'seat.cancelled',
  SOLD_OUT: 'seat.sold_out',
};

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
  console.log(`[Event] ${type} — ${payload.seatId}`);
}

module.exports = { publishSeatEvent, EVENT_TYPE, SEAT_EVENT_CHANNEL };
