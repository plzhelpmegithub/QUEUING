// server.js
// 실시간 커넥션 플랫폼 (C 파트)
// - 채팅방별 WebSocket 연결 관리
// - 좌석 상태 변경 이벤트 실시간 브로드캐스트
// - Redis Pub/Sub으로 여러 pod 간 메시지 팬아웃

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Redis = require('ioredis');
const client = require('prom-client');

const PORT = process.env.PORT || 8080;
const REDIS_HOST = process.env.REDIS_HOST || 'redis-master.realtime.svc.cluster.local';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

const app = express();
app.use(express.json());

// 헬스체크 (K8s readiness/liveness probe용)
app.get('/healthz', (req, res) => res.status(200).send('ok'));

// A 파트에서 좌석 상태 변경 시 이 API를 호출해 이벤트를 발행한다고 가정
// (실제로는 A가 Redis에 직접 publish 하거나, 이 엔드포인트를 통해 발행할 수 있음)
app.post('/publish/seat/:eventId', (req, res) => {
  const { eventId } = req.params;
  const payload = JSON.stringify(req.body);
  redisPub.publish(`seat:${eventId}`, payload);
  res.status(200).json({ published: true });
});

const server = http.createServer(app);

// ---- Prometheus 메트릭 정의 ----
const register = new client.Registry();
client.collectDefaultMetrics({ register }); // CPU, 메모리 등 기본 지표도 같이 수집

const wsConnectionsGauge = new client.Gauge({
  name: 'ws_active_connections',
  help: '현재 활성 WebSocket 연결 수',
  labelNames: ['kind'], // 'chat' 또는 'seats'
  registers: [register],
});

const messagesCounter = new client.Counter({
  name: 'ws_messages_total',
  help: '브로드캐스트로 전달된 메시지 총 개수',
  labelNames: ['kind'],
  registers: [register],
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// 클라이언트가 접속할 WebSocket 서버 (경로로 채팅/좌석 구분)
// 예: ws://호스트/ws/chat/{eventId}
//     ws://호스트/ws/seats/{eventId}
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// 채널별로 연결된 클라이언트를 관리 (chat:eventId / seat:eventId)
const channelClients = new Map(); // channelKey -> Set<ws>

function addClient(channelKey, ws) {
  if (!channelClients.has(channelKey)) {
    channelClients.set(channelKey, new Set());
  }
  channelClients.get(channelKey).add(ws);
  wsConnectionsGauge.inc({ kind: ws.kind });
}

function removeClient(channelKey, ws) {
  const set = channelClients.get(channelKey);
  if (set) {
    set.delete(ws);
    if (set.size === 0) channelClients.delete(channelKey);
  }
  wsConnectionsGauge.dec({ kind: ws.kind });
}

function broadcastToChannel(channelKey, message) {
  const set = channelClients.get(channelKey);
  if (!set) return;
  for (const client of set) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

wss.on('connection', (ws, request) => {
  // URL 형태: /ws/chat/{eventId} 또는 /ws/seats/{eventId}
  const url = new URL(request.url, `http://${request.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean); // ['ws','chat','eventId']

  if (parts.length < 3) {
    ws.close(1008, 'invalid path');
    return;
  }

  const kind = parts[1]; // 'chat' | 'seats'
  const eventId = parts[2];
  const channelKey = `${kind}:${eventId}`;

  ws.channelKey = channelKey;
  ws.kind = kind;
  addClient(channelKey, ws);

  console.log(`[connect] ${channelKey} (현재 접속자: ${channelClients.get(channelKey).size})`);

  // 채팅 채널만 클라이언트로부터 메시지를 받아서 같은 방에 브로드캐스트
  if (kind === 'chat') {
    ws.on('message', (data) => {
      const payload = JSON.stringify({
        type: 'chat',
        eventId,
        message: data.toString(),
        ts: Date.now(),
      });
      // 이 pod에 붙은 클라이언트뿐 아니라 다른 pod에도 전파되도록 Redis에 발행
      redisPub.publish(channelKey, payload);
    });
  }
  // seats 채널은 서버(A파트 이벤트)만 메시지를 보내고, 클라이언트는 받기만 함

  ws.on('close', () => {
    removeClient(channelKey, ws);
    console.log(`[disconnect] ${channelKey}`);
  });
});

// ---- Redis Pub/Sub 연결 ----
const redisPub = new Redis({ host: REDIS_HOST, port: REDIS_PORT });
const redisSub = new Redis({ host: REDIS_HOST, port: REDIS_PORT });

// 패턴 구독: chat:* 과 seat:* 채널을 모두 감시
redisSub.psubscribe('chat:*', 'seat:*', (err, count) => {
  if (err) {
    console.error('Redis psubscribe 실패:', err);
    return;
  }
  console.log(`Redis 채널 ${count}개 패턴 구독 중`);
});

redisSub.on('pmessage', (pattern, channel, message) => {
  // channel 예: 'chat:123' 또는 'seat:456'
  // WebSocket 접속 시 사용한 channelKey와 동일한 형식으로 맞춰서 브로드캐스트
  const [kind, id] = channel.split(':');
  const wsKind = kind === 'seat' ? 'seats' : kind; // seat -> seats 로 맞춤
  const channelKey = `${wsKind}:${id}`;
  broadcastToChannel(channelKey, message);
  messagesCounter.inc({ kind: wsKind });
});

server.listen(PORT, () => {
  console.log(`WebSocket 서버 시작: 포트 ${PORT}`);
  console.log(`Redis 연결 대상: ${REDIS_HOST}:${REDIS_PORT}`);
});

// 커넥션 드레이닝: SIGTERM 받으면 새 연결은 거부하고 기존 연결은 정상 종료 유도
process.on('SIGTERM', () => {
  console.log('SIGTERM 수신: graceful shutdown 시작');
  server.close(() => {
    console.log('HTTP 서버 종료 완료');
  });
  for (const clients of channelClients.values()) {
    for (const ws of clients) {
      ws.close(1001, 'server shutting down, please reconnect');
    }
  }
  setTimeout(() => process.exit(0), 5000);
});
