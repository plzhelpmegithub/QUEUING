const redis = require('../config/redis');
const { seatEvents } = require('./metricsService'); // Prometheus 메트릭

// 이벤트 채널명 — C파트와 합의한 Pub/Sub 채널
// C파트가 이 채널을 구독해서 사용자에게 실시간 브로드캐스트
const SEAT_EVENT_CHANNEL = 'events:seat-status';

// ===== 이벤트 타입 정의 =====
const EVENT_TYPE = {
  HELD: 'seat.held',           // 좌석 선점 — 다른 사용자 화면에서 "선택불가" 표시
  SOLD: 'seat.sold',           // 결제 완료 — "매진" 표시
  RELEASED: 'seat.released',   // 타임아웃 해제 — "다시 선택가능" 표시
  CANCELLED: 'seat.cancelled', // 사용자 취소 — B파트 재판매 트리거
  SOLD_OUT: 'seat.sold_out',   // 전석 매진 — standby 사용자에게 "매진" 알림
};

/**
 * 좌석 상태 변경 이벤트 발행
 * - Redis Pub/Sub으로 채널에 메시지 발행
 * - C파트가 구독해서 WebSocket으로 사용자에게 실시간 전달
 * - B파트가 구독해서 취소표 재판매 처리
 *
 * @param {string} type - EVENT_TYPE 중 하나
 * @param {object} payload - { seatId, userId, ... }
 */
async function publishSeatEvent(type, payload) {
  const event = {
    type,                                    // 이벤트 종류
    seatId: payload.seatId,                  // 어떤 좌석인지
    userId: payload.userId || null,          // 누가 했는지
    timestamp: new Date().toISOString(),     // 언제 발생했는지
    ...payload,                              // 추가 데이터
  };

  const message = JSON.stringify(event);           // JSON 문자열로 변환
  await redis.publish(SEAT_EVENT_CHANNEL, message); // 채널에 발행
  seatEvents.inc({ type });                          // Prometheus 카운터 증가
  console.log(`[Event] ${type} — ${payload.seatId}`);
}

module.exports = { publishSeatEvent, EVENT_TYPE, SEAT_EVENT_CHANNEL };
