// C팀(192.168.0.220) 실시간 좌석 WebSocket 연결 래퍼.
// seatSelect.js에서 사용 — 자동 재연결 + 상태 콜백 제공.

const WS_HOST = '192.168.0.220';
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

export function connectSeatSocketWithRetry(eventId, { onMessage, onStatusChange } = {}) {
  let ws = null;
  let retries = 0;
  let closed = false;

  function connect() {
    if (closed) return;
    try {
      ws = new WebSocket(`ws://${WS_HOST}/ws/seats/${eventId}`);
    } catch (e) {
      console.warn('[SeatSocket] WebSocket 생성 실패:', e.message);
      onStatusChange?.('failed');
      return;
    }

    ws.addEventListener('open', () => {
      console.log(`[SeatSocket] 연결 성공 (${WS_HOST})`);
      retries = 0;
      onStatusChange?.('connected');
    });

    ws.addEventListener('message', (e) => {
      try {
        const data = JSON.parse(e.data);
        onMessage?.(data);
      } catch (_) {}
    });

    ws.addEventListener('close', () => {
      if (closed) return;
      if (retries < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, retries) + Math.random() * 500;
        retries++;
        console.log(`[SeatSocket] 재연결 시도 ${retries}/${MAX_RETRIES} (${Math.round(delay)}ms 후)`);
        onStatusChange?.('reconnecting');
        setTimeout(connect, delay);
      } else {
        console.warn('[SeatSocket] 최대 재연결 횟수 초과');
        onStatusChange?.('failed');
      }
    });

    ws.addEventListener('error', () => {
      // close 이벤트에서 재연결 처리
    });
  }

  connect();

  return {
    close() {
      closed = true;
      if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
    },
  };
}
