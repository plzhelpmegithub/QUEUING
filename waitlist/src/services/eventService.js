const redis = require('../config/redis');

// 이벤트 채널명 (공용 파트에서 C파트와 합의할 채널)
const SEAT_EVENT_CHANNEL = 'events:seat-status';

// 이벤트 타입
const EVENT_TYPE = {
  HELD: 'seat.held',           // 좌석 선점
  SOLD: 'seat.sold',           // 결제 완료
  RELEASED: 'seat.released',   // 타임아웃으로 해제
};

/**
 * 좌석 상태 변경 이벤트 발행
 *
 * @param {string} type - EVENT_TYPE 중 하나
 * @param {object} payload - { seatId, userId, ... }
 */
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
  console.log(`[Event] ${type} — ${payload.seatId}`);
}

module.exports = { publishSeatEvent, EVENT_TYPE, SEAT_EVENT_CHANNEL };
