const clients = new Set();

function addClient(reply) {
  clients.add(reply);
  console.log(`[SSE] 클라이언트 연결 (현재 ${clients.size}명)`);

  reply.raw.on('close', () => {
    clients.delete(reply);
    console.log(`[SSE] 클라이언트 연결 해제 (현재 ${clients.size}명)`);
  });
}

function broadcast(eventType, data) {
  const message = JSON.stringify({ type: eventType, ...data, timestamp: new Date().toISOString() });

  const sseMessage = `event: ${eventType}\ndata: ${message}\n\n`;

  clients.forEach((reply) => {
    try {
      reply.raw.write(sseMessage);
    } catch (err) {
      clients.delete(reply);
    }
  });
}

function getClientCount() {
  return clients.size;
}

module.exports = { addClient, broadcast, getClientCount };
