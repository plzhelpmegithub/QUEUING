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

// ---- D파트(예지님) 통계 Redis ----
// 접속자 수·좋아요 수 같은 집계값을 실시간으로 화면에 밀어주기 위한 경로.
// D파트는 부하 격리를 위해 팀 공용 Redis 가 아닌 전용 인스턴스를 쓰므로
// (redis-counter-master.redis), 우리가 그쪽 pub/sub 도 함께 구독한다.
// 집계는 D가, 전송은 C가 담당한다는 역할 경계에 맞춘 구성이다.
//
// STATS_REDIS_HOST 가 비어 있으면 이 기능 전체를 건너뛴다. 아직 D파트가
// PUBLISH 를 붙이지 않았거나, 폴링 방식으로 운영하는 동안에는 설정하지
// 않으면 되고, 그 경우 서버는 지금까지와 완전히 동일하게 동작한다.
const STATS_REDIS_HOST = process.env.STATS_REDIS_HOST || '';
const STATS_REDIS_PORT = process.env.STATS_REDIS_PORT || 6379;
const STATS_REDIS_PASSWORD = process.env.STATS_REDIS_PASSWORD || '';

// A파트(eventService.js)와 합의된 좌석 이벤트 채널 — eventId별로 나뉘지 않은
// 고정 채널 하나. seat:{eventId} 패턴이 아니라서 psubscribe('seat:*')로는 안 잡힘.
const SEAT_EVENT_CHANNEL = 'events:seat-status';

// ---- 채팅 기록 보관/재생 정책 ----
// 보관과 재생을 분리한다. 서버는 넉넉히 들고 있되, 새로 접속한 사람에게
// 되돌려주는 양은 화면에 필요한 만큼만으로 제한한다.
//   KEEP   … Redis 리스트에 남겨두는 최대 건수 (ltrim)
//   REPLAY … 접속 직후 되돌려주는 건수 (lrange). 접속 폭주 때 이 값이 그대로 곱해진다
//   TTL    … 리스트 자체의 만료. 공연이 끝나면 알아서 사라진다
const HISTORY_KEEP = 1000;
const HISTORY_REPLAY = 50;
const HISTORY_TTL_SEC = 10800; // 3시간

// 느린 클라이언트에게 브로드캐스트가 계속 쌓이면 소켓 버퍼가 무한정 커진다.
// 컨테이너 메모리 한도(256Mi)를 지키려면 한도를 넘은 연결은 끊는 게 낫다.
const MAX_BUFFERED_BYTES = 1 * 1024 * 1024; // 1MB

// 채팅 도배 방지 — 서버에서도 막는다 (2026-09-16)
// 지금까지 5초 잠금이 브라우저(프론트엔드)에만 있어서, WebSocket 에 직접 붙으면
// 그대로 우회됐다. 같은 값을 서버에서도 강제한다.
// 부하테스트처럼 일부러 빠르게 보내야 할 때는 CHAT_COOLDOWN_MS=0 으로 끌 수 있다.
const CHAT_COOLDOWN_MS = Number(process.env.CHAT_COOLDOWN_MS ?? 5000);

// 좌석 채널은 토큰 없이도 볼 수 있게 한다 (2026-09-16, 팀 결정)
// 좌석 상태는 /seats API 로도 로그인 없이 조회할 수 있는 공개 정보다. 그런데 실시간 채널만
// 토큰을 요구해서, 프론트의 좌석 소켓이 401 로 막혀 "산 좌석이 회색으로 안 바뀌는" 증상이 있었다.
// 채팅은 작성자 이름이 필요하고 도배 방지도 걸려 있어 토큰을 계속 요구한다.
// 다시 잠그려면 SEATS_REQUIRE_TOKEN=true 로 띄운다.
const SEATS_REQUIRE_TOKEN = String(process.env.SEATS_REQUIRE_TOKEN || 'false') === 'true';

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

// Express 4 는 async 핸들러가 던진 오류를 잡아주지 않는다. await 한 Redis 호출이
// 실패하면 그대로 unhandled rejection 이 되고, Node 20 은 프로세스를 종료한다.
// 즉 /rooms 요청 하나로 파드가 내려갈 수 있었다. 모든 async 라우트를 이걸로 감싼다.
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

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
app.post('/rooms', asyncRoute(async (req, res) => {
  const { eventId, name } = req.body || {};
  if (!eventId || !name) return res.status(400).json({ error: 'eventId, name은 필수입니다' });

  await redisPub
    .pipeline()
    .hset(`room:${eventId}`, { name, createdAt: Date.now() })
    .sadd('rooms:index', eventId)
    .exec();
  res.status(201).json({ eventId, name });
}));

// 전체 방 목록
app.get('/rooms', asyncRoute(async (req, res) => {
  const ids = await redisPub.smembers('rooms:index');
  if (ids.length === 0) return res.json([]);

  // 방 하나당 hgetall 을 따로 호출하면 방 수만큼 명령이 나간다. 지금은 방이
  // 몇 개뿐이라 92ms 로 빠르지만, 공연이 늘어나면 그대로 비례해서 느려진다.
  // (A파트 /seats/available 이 좌석 6,600개에서 11초가 된 것과 같은 구조다.)
  // 파이프라인으로 한 번에 보내면 방이 늘어도 왕복은 한 번이다.
  const pipeline = redisPub.pipeline();
  ids.forEach((eventId) => pipeline.hgetall(`room:${eventId}`));
  const results = await pipeline.exec();

  const rooms = ids.map((eventId, i) => {
    const [err, meta] = results[i];
    return {
      eventId,
      name: err ? null : meta.name,
      createdAt: err ? 0 : Number(meta.createdAt),
      chatConnections: channelClients.get(`chat:${eventId}`)?.size || 0,
      seatConnections: channelClients.get(`seats:${eventId}`)?.size || 0,
    };
  });
  res.json(rooms);
}));

// 방 상세
app.get('/rooms/:eventId', asyncRoute(async (req, res) => {
  const meta = await redisPub.hgetall(`room:${req.params.eventId}`);
  if (!meta.name) return res.status(404).json({ error: '존재하지 않는 방입니다' });
  res.json({
    eventId: req.params.eventId,
    ...meta,
    chatConnections: channelClients.get(`chat:${req.params.eventId}`)?.size || 0,
    seatConnections: channelClients.get(`seats:${req.params.eventId}`)?.size || 0,
  });
}));

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

const chatRejectedCounter = new client.Counter({
  name: 'ws_chat_rejected_total',
  help: '서버가 거절한 채팅 수 (도배 방지)',
  labelNames: ['reason'],
  registers: [register],
});

const messagesCounter = new client.Counter({
  name: 'ws_messages_total',
  help: '브로드캐스트로 전달된 메시지 총 개수',
  labelNames: ['kind'],
  registers: [register],
});

// 라벨이 붙은 메트릭은 첫 inc/set 이 일어나기 전까지 시계열 자체가 생기지 않는다.
// 그러면 접속자가 한 명도 없을 때 /metrics 에 ws_active_connections 가 아예
// 안 나오고, Prometheus 에도 없는 값이 되어 이 지표로는 HPA 를 걸 수 없다.
// (커스텀 메트릭 HPA 는 값이 0이어도 "존재"해야 동작한다)
// 그래서 기동 시점에 두 종류를 0으로 초기화해 항상 노출되게 한다.
for (const kind of ['chat', 'seats', 'stats']) {
  wsConnectionsGauge.set({ kind }, 0);
  messagesCounter.inc({ kind }, 0);
}

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

  // 경로가 /ws/<종류>/<이벤트> 라서 두 번째 조각이 채널 종류다.
  const kind = parsedUrl.pathname.split('/').filter(Boolean)[1];
  const anonymousAllowed = kind === 'seats' && !SEATS_REQUIRE_TOKEN;

  if (!user && !anonymousAllowed) {
    // 인증 실패 원인을 서버 로그에 남긴다 (연동팀이 401만 보고 원인을 못 찾는 문제 방지).
    // 흔한 원인: 자기 로그인 mock accessToken을 그대로 재사용 (realtime-ws 전용 토큰이 아님)
    const reason = !token ? 'token 파라미터 없음' : '토큰 검증 실패 (JWT 형식이 아니거나 시크릿 불일치 — 로그인용 accessToken을 그대로 쓴 건 아닌지 확인)';
    console.warn(`[auth-fail] ${request.url} — ${reason}`);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    // 좌석 채널은 토큰 없이 붙을 수 있어 user 가 없을 수 있다. 읽기 전용이라 이름이 필요 없다.
    ws.userId = user ? user.userId : 'anonymous';
    ws.nickname = user ? (user.nickname || user.userId) : 'anonymous';
    ws.isAlive = true;                          // 하트비트 판정용 (아래 heartbeatTimer 참고)
    wss.emit('connection', ws, request);
  });
});

// ---- 하트비트 ----
// 로드밸런서는 일정 시간 조용한 연결을 임의로 끊는다(ALB 기본 유휴 타임아웃 60초).
// 서버는 그 사실을 모른 채 죽은 소켓을 계속 들고 있게 되고, 브로드캐스트는 허공으로
// 나가며 channelClients 에 좀비 연결이 쌓인다. 그래서 두 가지를 함께 한다.
//   1) 주기적으로 ping 을 보내 연결을 살아있게 유지 — 타임아웃보다 짧은 주기여야 한다
//   2) pong 이 안 오면 죽은 것으로 보고 정리
// NodePort 로 직접 접근하는 온프레미스에서는 증상이 없지만, ALB/CloudFront 뒤에
// 들어가는 순간 필요해진다.
const HEARTBEAT_MS = 30000; // ALB 기본 60초의 절반

wss.on('connection', (ws) => {
  // pong 을 받으면 살아있다고 표시. ping 을 보낼 때 다시 false 로 되돌린다.
  ws.on('pong', () => { ws.isAlive = true; });

  // ws 라이브러리의 소켓도 EventEmitter 라서 'error' 리스너가 없으면 예외로 던져진다.
  // 클라이언트가 인사 없이 끊으면(ECONNRESET) 흔히 발생하는데, 수천 개 연결을
  // 다루는 부하 상황에서는 사실상 반드시 일어난다. 리스너가 없으면 그때 파드가 죽는다.
  ws.on('error', (err) => console.error('[ws]', err.message));
});

const heartbeatTimer = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      // 직전 주기에 보낸 ping 에 응답이 없었다 → 끊긴 연결로 판단.
      // terminate() 는 close 이벤트를 발생시키므로 channelClients 에서도 자동 제거된다.
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);

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
    if (c.readyState !== WebSocket.OPEN) continue;

    // 백프레셔: 네트워크가 느린 클라이언트는 보낸 데이터가 소켓 버퍼에 쌓인다.
    // 좌석 이벤트가 초당 수백 건씩 쏟아지는 상황에서 이걸 방치하면 그 한 명 때문에
    // 파드 메모리가 한도(256Mi)까지 차서 OOMKill 이 난다. 밀린 연결은 끊고
    // 재접속하게 두는 편이 전체를 지키는 데 낫다.
    if (c.bufferedAmount > MAX_BUFFERED_BYTES) {
      console.warn(`[backpressure] ${channelKey} 연결 종료 (버퍼 ${c.bufferedAmount} bytes)`);
      c.terminate();
      continue;
    }
    c.send(message);
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
    // 접속하자마자 최근 채팅 기록을 먼저 보내준다.
    //
    // lrange(key, 0, -1) 은 "전부"를 뜻한다. 아래 ltrim 이 HISTORY_KEEP(1,000)건까지
    // 보관하므로, 대화가 활발한 방에 접속하면 한 명당 ws.send() 가 1,000번 일어났다.
    // 티켓팅 오픈처럼 접속이 한꺼번에 몰리면 그대로 곱해진다(1만 명 × 1,000건).
    // 화면에 실제로 필요한 건 최근 몇십 건이므로 재생 개수를 따로 고정한다.
    const historyKey = `chat:history:${eventId}`;
    redisPub
      .lrange(historyKey, -HISTORY_REPLAY, -1) // 뒤에서 HISTORY_REPLAY 건만
      .then((history) => {
        history.forEach((item) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(item);
        });
      })
      .catch((err) => console.error('채팅 기록 조회 실패:', err.message));

    ws.on('message', (data) => {
      // 마지막 전송으로부터 CHAT_COOLDOWN_MS 가 지나지 않았으면 버린다.
      // 연결마다 시각을 들고 있어서 추가 저장소가 필요 없다 (같은 사람이 여러 파드에
      // 동시에 붙으면 각각 따로 계산되지만, 브라우저는 연결을 하나만 쓴다).
      const now = Date.now();
      if (CHAT_COOLDOWN_MS > 0 && ws.lastChatAt && now - ws.lastChatAt < CHAT_COOLDOWN_MS) {
        chatRejectedCounter.inc({ reason: 'cooldown' });
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'error',
            reason: 'cooldown',
            retryAfterMs: CHAT_COOLDOWN_MS - (now - ws.lastChatAt),
            message: `도배 방지를 위해 ${Math.ceil(CHAT_COOLDOWN_MS / 1000)}초에 한 번만 보낼 수 있습니다.`,
          }));
        }
        return;
      }
      ws.lastChatAt = now;

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

      // 채팅 기록 저장 + 다른 pod 로 전파.
      //
      // 파이프라인으로 묶는 이유는 속도가 아니라 실패를 한 곳에서 받기 위해서다.
      // 예전에는 네 명령을 따로 호출하면서 .catch() 를 하나도 안 붙였는데,
      // ioredis 명령은 전부 Promise 를 돌려주므로 Redis 가 잠깐 끊기거나 쓰기가
      // 실패하면 unhandled rejection 이 되고, Node 20 은 그때 프로세스를 종료한다.
      // 즉 채팅 한 건 때문에 파드가 죽을 수 있었다.
      redisPub
        .pipeline()
        .rpush(historyKey, payload)
        .ltrim(historyKey, -HISTORY_KEEP, -1)
        .expire(historyKey, HISTORY_TTL_SEC)
        .publish(channelKey, payload) // 이 pod 외의 다른 pod 에도 전파
        .exec()
        .catch((err) => console.error('채팅 저장/발행 실패:', err.message));
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

// ioredis 는 연결이 끊기거나 재접속에 실패하면 'error' 이벤트를 낸다.
// EventEmitter 의 'error' 는 리스너가 없으면 예외로 던져지므로, 핸들러가 없으면
// Redis 가 잠깐 흔들릴 때마다 프로세스가 죽는다. ioredis 는 스스로 재접속하니
// 로그만 남기고 넘어가면 된다. ElastiCache 는 장애 조치 때 연결을 끊으므로
// AWS 로 옮기면 이 경로를 반드시 타게 된다.
redisPub.on('error', (err) => console.error('[redis:pub]', err.message));
redisSub.on('error', (err) => console.error('[redis:sub]', err.message));

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

// ---- D파트 통계 구독 (선택) ----
// D파트가 자기 Redis 에 stats:{eventId} 로 집계값을 발행하면, 그 채널에 붙어
// 있는 브라우저로 그대로 흘려보낸다. 채널 이름이 곧 channelKey 라서
// 별도 변환이 필요 없다 — seats/chat 과 같은 규약이다.
//
// 브라우저 접속 경로:  wss://.../ws/stats/{eventId}?token=...
//   wss.on('connection') 이 경로를 일반적으로 파싱하므로 이 종류를 위한
//   추가 처리는 없다. 데이터를 넣어줄 구독자만 있으면 된다.
//
// STATS_REDIS_HOST 가 없으면 아무것도 하지 않는다(폴링 방식으로 운영 중인 경우).
let redisStatsSub = null;
if (STATS_REDIS_HOST) {
  redisStatsSub = new Redis({
    host: STATS_REDIS_HOST,
    port: STATS_REDIS_PORT,
    // D파트 Redis 는 requirepass 가 걸려 있다. 팀 공용 Redis 와 달리
    // 비밀번호를 반드시 넘겨야 한다(없으면 NOAUTH 로 거절당한다).
    ...(STATS_REDIS_PASSWORD ? { password: STATS_REDIS_PASSWORD } : {}),
  });

  redisStatsSub.on('error', (err) => console.error('[redis:stats]', err.message));

  redisStatsSub.psubscribe('stats:*', (err, count) => {
    if (err) {
      console.error('통계 Redis psubscribe 실패:', err.message);
      return;
    }
    console.log(`D파트 통계 채널 구독 중 (${STATS_REDIS_HOST}:${STATS_REDIS_PORT}, 패턴 ${count}개)`);
  });

  redisStatsSub.on('pmessage', (pattern, channel, message) => {
    broadcastToChannel(channel, message);
    messagesCounter.inc({ kind: 'stats' });
  });
} else {
  console.log('통계 Redis 미설정 — stats 채널 비활성 (D파트는 폴링으로 조회)');
}

// 좌석 이벤트 처리 — A가 이제 이 Redis에 직접 발행하므로 구독 경로가 하나로 통합됨.
function handleSeatEventMessage(message) {
  let event;
  try {
    event = JSON.parse(message);
  } catch (e) {
    console.error('[seat-event] JSON 파싱 실패:', e.message);
    return;
  }

  // seatId 형식: "evt-30:2026-12-05_18-00:Floor-554"
  //   [0] eventId   [1] 회차(날짜_시간)   [2] 좌석코드
  //
  // ⚠️ 회차까지 봐야 한다 (2026-09-18)
  //   예전에는 split(':')[0] 으로 eventId 만 뽑아 seats:{eventId} 한 곳에 뿌렸다.
  //   그런데 같은 공연에 회차가 여럿이다 — evt-30 은 12-05 18:00 과 12-06 17:00 이
  //   둘 다 있다. A파트는 event_id + 날짜 + 시간으로 좌석을 나누는데 여기서 다시
  //   합쳐버려서, 다른 회차 사람 화면에도 남의 좌석이 잠긴 것처럼 보였다.
  //
  //   회차 채널로만 보내지 않는 이유: 프론트(realtimeChat.js)가 아직
  //   /ws/seats/{eventId} 로만 접속한다. 좁히기만 하면 기존 화면에 아무것도 안 간다.
  //   그래서 둘 다 보낸다. 한 클라이언트는 둘 중 한 채널에만 있으므로 중복 수신은 없다.
  //   프론트가 회차를 실어 보내기 시작하면 그 클라이언트부터 자기 회차만 받는다.
  const parts = event.seatId && event.seatId.includes(':') ? event.seatId.split(':') : [];
  const eventId = parts[0] || null;
  const sessionKey = parts.length >= 3 ? `${parts[0]}:${parts[1]}` : null;

  if (sessionKey) broadcastToChannel(`seats:${sessionKey}`, message);

  if (eventId) {
    broadcastToChannel(`seats:${eventId}`, message);
  } else {
    // seatId 가 'ALL' 인 매진 알림 등 — eventId 를 못 뽑으므로 좌석 채널 전체에 뿌린다.
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

// 마지막 안전망.
// 위에서 경로마다 .catch() 를 달았지만, 놓친 곳이 하나라도 있으면 Node 20 은
// 프로세스를 종료한다. 실시간 연결 서버가 통째로 끊기는 것보다는 로그를 남기고
// 버티는 편이 낫다. 여기에 로그가 찍히면 원인이 되는 경로를 찾아 개별로 처리한다.
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err && err.message ? err.message : err);
});

// Express 에러 핸들러 — asyncRoute 가 next(err) 로 넘긴 오류를 여기서 받는다.
// (인자가 4개여야 Express 가 에러 핸들러로 인식하므로 next 를 지우면 안 된다)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[http] ${req.method} ${req.originalUrl} —`, err.message);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

server.listen(PORT, () => {
  console.log(`WebSocket 서버 시작: 포트 ${PORT}`);
  console.log(`Redis 연결 대상: ${REDIS_HOST}:${REDIS_PORT}`);
  console.log(`채팅 기록: 보관 ${HISTORY_KEEP}건 / 재생 ${HISTORY_REPLAY}건 / TTL ${HISTORY_TTL_SEC}초`);
});

// 커넥션 드레이닝: SIGTERM 받으면 새 연결은 거부하고 기존 연결은 정상 종료 유도
process.on('SIGTERM', () => {
  console.log('SIGTERM 수신: graceful shutdown 시작');
  clearInterval(heartbeatTimer); // 종료 중인 연결에 ping 을 보내지 않도록 먼저 멈춘다
  server.close(() => {
    console.log('HTTP 서버 종료 완료');
  });
  for (const clients of channelClients.values()) {
    for (const ws of clients) {
      ws.close(1001, 'server shutting down, please reconnect');
    }
  }
  // 종료 중에 재접속을 시도하며 에러 로그를 남기지 않도록 구독을 먼저 끊는다
  if (redisStatsSub) redisStatsSub.disconnect();
  setTimeout(() => process.exit(0), 5000);
});
