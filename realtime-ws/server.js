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

// A파트(eventService.js)와 합의된 좌석 이벤트 채널 — eventId별로 나뉘지 않은
// 고정 채널 하나. seat:{eventId} 패턴이 아니라서 psubscribe('seat:*')로는 안 잡힘.
const SEAT_EVENT_CHANNEL = 'events:seat-status';

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

// 테스트용 — A파트(eventService.js)는 실제로는 이 API를 안 쓰고 Redis에 직접
// publish 한다. 이 엔드포인트는 A 없이도 events:seat-status 채널로 같은 형식의
// 이벤트를 흉내내서 테스트하기 위한 것.
//
// body: { seatId, type, userId? }
//   - seatId에 eventId 접두사(evt-...:)가 없으면 URL의 :eventId를 자동으로 붙여줌
//   - type은 'seat.held' | 'seat.sold' | 'seat.released' | 'seat.cancelled' | 'seat.sold_out'
//   - 예전 테스트 습관대로 { status: 'available'|'holding'|'sold' }를 보내도 type으로 변환해줌
app.post('/publish/seat/:eventId', (req, res) => {
  const { eventId } = req.params;
  const { seatId, type, userId, status } = req.body || {};
  if (!seatId) {
    return res.status(400).json({ error: 'seatId는 필수입니다.' });
  }

  const STATUS_TO_TYPE = { available: 'seat.released', holding: 'seat.held', held: 'seat.held', sold: 'seat.sold' };
  const resolvedType = type || STATUS_TO_TYPE[status] || 'seat.held';
  const fullSeatId = seatId.includes(':') ? seatId : `${eventId}:${seatId}`;

  const event = {
    type: resolvedType,
    seatId: fullSeatId,
    userId: userId || null,
    timestamp: new Date().toISOString(),
  };
  redisPub.publish(SEAT_EVENT_CHANNEL, JSON.stringify(event));
  res.status(200).json({ published: true, event });
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
  res.json({
    eventId: req.params.eventId,
    ...meta,
    chatConnections: channelClients.get(`chat:${req.params.eventId}`)?.size || 0,
    seatConnections: channelClients.get(`seats:${req.params.eventId}`)?.size || 0,
  });
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
// A(찬규)파트도 이제 같은 클러스터 안에서 이 Redis(REDIS_HOST)에 직접 발행하도록
// 통합됨 — 예전엔 A가 클러스터 밖(본인 PC, 192.168.0.190)에 있어서 별도로 그쪽
// Redis에 아웃바운드 구독을 붙이는 브릿지가 필요했지만, 이제 A/C가 같은 Redis를
// 쓰므로 구독도 하나로 합침 (2026-08-27 온프레미스 통합 테스트에서 이 경로로
// 정상 수신 확인됨 — PUBLISH 시 구독자 2 확인, ws_messages_total{kind="seats"} 증가).
const redisPub = new Redis({ host: REDIS_HOST, port: REDIS_PORT });
const redisSub = new Redis({ host: REDIS_HOST, port: REDIS_PORT });

// 채팅은 우리 Redis에서 chat:{eventId} 패턴 구독
redisSub.psubscribe('chat:*', (err, count) => {
  if (err) {
    console.error('Redis psubscribe 실패:', err);
    return;
  }
  console.log(`Redis 패턴 채널 ${count}개 구독 중`);
});

redisSub.on('pmessage', (pattern, channel, message) => {
  // 여기로는 chat:{eventId}만 들어옴
  broadcastToChannel(channel, message);
  messagesCounter.inc({ kind: 'chat' });
});

// 좌석 이벤트 처리 — A가 이제 이 Redis에 직접 발행하므로 구독 경로가 하나로 통합됨.
function handleSeatEventMessage(message) {
  let event;
  try {
    event = JSON.parse(message);
  } catch (e) {
    console.error('[seat-event] JSON 파싱 실패:', e.message);
    return;
  }

  // seatId 형식: "evt-171...:VIP-001" → 앞부분이 eventId, 이걸로 어느 콘서트
  // 화면에 브로드캐스트할지 결정. seat.sold_out처럼 seatId가 'ALL'이면(A쪽 코드가
  // eventId를 안 실어보냄) eventId를 못 뽑으므로, 현재 좌석 채널에 붙어있는
  // 모든 방에 그냥 다 뿌린다 (A가 활성 이벤트 1개만 가정하고 만든 구조라 임시로는 안전함).
  const eventId = event.seatId && event.seatId.includes(':') ? event.seatId.split(':')[0] : null;

  if (eventId) {
    broadcastToChannel(`seats:${eventId}`, message);
  } else {
    for (const key of channelClients.keys()) {
      if (key.startsWith('seats:')) broadcastToChannel(key, message);
    }
  }
  messagesCounter.inc({ kind: 'seats' });
}

// 좌석 이벤트 구독 — A파트가 실제로 발행하는 채널, 같은 Redis를 씀
redisSub.subscribe(SEAT_EVENT_CHANNEL, (err) => {
  if (err) {
    console.error('Redis subscribe 실패 (좌석 이벤트):', err);
    return;
  }
  console.log(`Redis 채널 구독 중 (좌석 이벤트): ${SEAT_EVENT_CHANNEL}`);
});
redisSub.on('message', (channel, message) => {
  if (channel !== SEAT_EVENT_CHANNEL) return;
  handleSeatEventMessage(message);
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
