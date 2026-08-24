// server.js
// 실시간 커넥션 플랫폼 (C 파트)
// - 채팅방별 WebSocket 연결 관리 (닉네임 / 최근 기록 / 욕설 필터링 포함)
// - 좌석 상태 변경 이벤트 실시간 브로드캐스트
// - Redis Pub/Sub으로 여러 pod 간 메시지 팬아웃
const { verifyToken } = require('./auth');
const { filterMessage } = require('./profanity');

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Redis = require('ioredis');
const client = require('prom-client');

const PORT = process.env.PORT || 8080;
const REDIS_HOST = process.env.REDIS_HOST || 'redis-master.realtime.svc.cluster.local';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

const app = express();

// 다른 팀의 프론트엔드(각자 다른 IP/포트의 dev 서버)에서 fetch로 REST API를 호출할 수 있게
// CORS를 전체 허용한다. 개발 단계에서 여러 팀이 각자 다른 origin으로 붙기 때문에 origin을
// 화이트리스트로 좁히지 않고 전체 허용으로 둔다 (WebSocket 자체는 CORS 영향을 받지 않음).
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

// 헬스체크 (K8s readiness/liveness probe용)
app.get('/healthz', (req, res) => res.status(200).send('ok'));

// A 파트에서 좌석 상태 변경 시 이 API를 호출해 이벤트를 발행한다고 가정
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
  labelNames: ['kind'],
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
// 예: ws://호스트/ws/chat/{eventId}?token=...
//     ws://호스트/ws/seats/{eventId}?token=...
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const parsedUrl = new URL(request.url, `http://${request.headers.host}`);
  const token = parsedUrl.searchParams.get('token');
  const user = verifyToken(token);

  if (!user) {
    // 인증 실패 원인을 서버 로그에 남긴다 (연동팀이 401만 보고 원인을 못 찾는 문제 방지).
    // 흔한 원인: 자기 로그인 mock accessToken을 그대로 재사용 (realtime-ws 전용 토큰이 아님)
    const reason = !token ? 'token 파라미터 없음' : '토큰 검증 실패 (JWT 형식이 아니거나 시크릿 불일치 — 로그인용 accessToken을 그대로 쓴 건 아닌지 확인)';
    console.warn(`[auth-fail] ${request.url} — ${reason}`);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    ws.userId = user.userId;
    ws.nickname = user.nickname || user.userId; // 토큰에 닉네임 있으면 그걸, 없으면 userId 사용
    wss.emit('connection', ws, request);
  });
});

// 채널별로 연결된 클라이언트를 관리 (chat:eventId / seats:eventId)
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
  for (const c of set) {
    if (c.readyState === WebSocket.OPEN) {
      c.send(message);
    }
  }
}

wss.on('connection', (ws, request) => {
  const parsedUrl = new URL(request.url, `http://${request.headers.host}`);
  const parts = parsedUrl.pathname.split('/').filter(Boolean); // ['ws','chat','eventId']

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
    // 접속하자마자 최근 채팅 기록(최대 100개, 1시간 이내)을 먼저 보내준다
    const historyKey = `chat:history:${eventId}`;
    redisPub
      .lrange(historyKey, 0, -1)
      .then((history) => {
        history.forEach((item) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(item);
        });
      })
      .catch((err) => console.error('채팅 기록 조회 실패:', err));

    ws.on('message', (data) => {
      // 욕설/비하 발언 필터링
      const { filtered, matched } = filterMessage(data.toString());

      const payload = JSON.stringify({
        type: 'chat',
        eventId,
        author: ws.nickname, // 닉네임 적용
        message: filtered,
        filtered: matched,
        ts: Date.now(),
      });

      // 채팅 기록 저장 (최대 1000개, 3시간 유지)
      redisPub.rpush(historyKey, payload);
      redisPub.ltrim(historyKey, -1000, -1);
      redisPub.expire(historyKey, 10800);

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