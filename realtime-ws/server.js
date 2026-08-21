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

// ---- Redis Pub/Sub 연결 및 에러 핸들링 ----
const redisPub = new Redis({ host: REDIS_HOST, port: REDIS_PORT });
const redisSub = new Redis({ host: REDIS_HOST, port: REDIS_PORT });

redisPub.on('error', (err) => console.error('Redis Pub 에러:', err));
redisSub.on('error', (err) => console.error('Redis Sub 에러:', err));

// 헬스체크 (K8s readiness/liveness probe용)
app.get('/healthz', (req, res) => res.status(200).send('ok'));

// 좌석 상태 변경 이벤트 발행 엔드포인트
app.post('/publish/seat/:eventId', (req, res) => {
  const { eventId } = req.params;
  const payload = JSON.stringify(req.body);
  redisPub.publish(`seat:${eventId}`, payload);
  res.status(200).json({ published: true });
});

// 방 생성
app.post('/rooms', async (req, res) => {
  const { eventId, name } = req.body;
  if (!eventId || !name) return res.status(400).json({ error: 'eventId, name은 필수입니다' });

  await redisPub.hset(`room:${eventId}`, { name, createdAt: Date.now() });
  await redisPub.sadd('rooms:index', eventId);
  res.status(201).json({ eventId, name });
});

// 전체 방 목록
app.get('/rooms', async (req, res) => {
  const ids = await redisPub.smembers('rooms:index');
  const rooms = await Promise.all(
    ids.map(async (eventId) => {
      const meta = await redisPub.hgetall(`room:${eventId}`);
      return {
        eventId,
        name: meta.name,
        createdAt: Number(meta.createdAt),
        chatConnections: channelClients.get(`chat:${eventId}`)?.size || 0,
        seatConnections: channelClients.get(`seats:${eventId}`)?.size || 0,
      };
    })
  );
  res.json(rooms);
});

// 방 상세
app.get('/rooms/:eventId', async (req, res) => {
  const meta = await redisPub.hgetall(`room:${req.params.eventId}`);
  if (!meta.name) return res.status(404).json({ error: '존재하지 않는 방입니다' });
  res.json({ eventId: req.params.eventId, ...meta });
});

const server = http.createServer(app);

// ---- Prometheus 메트릭 정의 ----
const register = new client.Registry();
client.collectDefaultMetrics({ register });

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

// ---- WebSocket 서버 설정 ----
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// 채널별 클라이언트 관리 (chat:eventId / seats:eventId)
const channelClients = new Map();

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
  for (const clientWs of set) {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(message);
    }
  }
}

wss.on('connection', (ws, request) => {
  const parsedUrl = new URL(request.url, `http://${request.headers.host}`);
  const parts = parsedUrl.pathname.split('/').filter(Boolean); // ['ws', 'chat', 'eventId']

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

  if (kind === 'chat') {
    ws.on('message', (data) => {
      const payload = JSON.stringify({
        type: 'chat',
        eventId,
        message: data.toString(),
        ts: Date.now(),
      });
      redisPub.publish(channelKey, payload);
    });
  }

  ws.on('close', () => {
    removeClient(channelKey, ws);
    console.log(`[disconnect] ${channelKey}`);
  });
});

// ---- Redis Pub/Sub 패턴 구독 ----
redisSub.psubscribe('chat:*', 'seat:*', 'seats:*', (err, count) => {
  if (err) {
    console.error('Redis psubscribe 실패:', err);
    return;
  }
  console.log(`Redis 채널 ${count}개 패턴 구독 중`);
});

redisSub.on('pmessage', (pattern, channel, message) => {
  const [kind, id] = channel.split(':');
  const wsKind = kind === 'seat' ? 'seats' : kind;
  const channelKey = `${wsKind}:${id}`;
  
  broadcastToChannel(channelKey, message);
  messagesCounter.inc({ kind: wsKind });
});

// ---- 서버 실행 및 Graceful Shutdown ----
server.listen(PORT, () => {
  console.log(`WebSocket 서버 시작: 포트 ${PORT}`);
  console.log(`Redis 연결 대상: ${REDIS_HOST}:${REDIS_PORT}`);
});

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