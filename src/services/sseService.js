// ===== SSE(Server-Sent Events) 서비스 =====
// 브라우저가 /sse에 연결하면 이벤트 발생 시 즉시 푸시
// WebSocket보다 간단하고, 단방향(서버→클라이언트) 실시간 전달에 적합

const clients = new Set(); // 연결된 브라우저 목록

/**
 * SSE 연결 등록 (라우트 핸들러에서 호출)
 * - 브라우저가 EventSource로 /sse에 접속하면 이 함수가 호출됨
 * - reply 객체를 clients Set에 저장해두고, 이벤트 발생 시 전송
 */
function addClient(reply) {
  clients.add(reply);
  console.log(`[SSE] 클라이언트 연결 (현재 ${clients.size}명)`);

  // 연결 종료 시 목록에서 제거
  reply.raw.on('close', () => {
    clients.delete(reply);
    console.log(`[SSE] 클라이언트 연결 해제 (현재 ${clients.size}명)`);
  });
}

/**
 * 모든 연결된 브라우저에 이벤트 전송
 * - eventService에서 Redis Pub/Sub 발행 시 같이 호출
 * - 브라우저의 EventSource.onmessage로 수신됨
 *
 * @param {string} eventType - 이벤트 타입 (예: "seat.held")
 * @param {object} data - 이벤트 데이터
 */
function broadcast(eventType, data) {
  const message = JSON.stringify({ type: eventType, ...data, timestamp: new Date().toISOString() });

  // SSE 형식: "event: 타입\ndata: JSON\n\n"
  const sseMessage = `event: ${eventType}\ndata: ${message}\n\n`;

  clients.forEach((reply) => {
    try {
      reply.raw.write(sseMessage);
    } catch (err) {
      // 연결이 끊긴 클라이언트 제거
      clients.delete(reply);
    }
  });
}

/**
 * 현재 연결된 클라이언트 수
 */
function getClientCount() {
  return clients.size;
}

module.exports = { addClient, broadcast, getClientCount };
