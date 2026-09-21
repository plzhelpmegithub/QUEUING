// 실시간 WebSocket 연결 헬퍼 — 채팅(connectChat)과 좌석 상태(connectSeats)를 담당.
// JWT(HS256)를 순수 JS SHA-256으로 직접 서명해 crypto.subtle 없는 HTTP 환경에서도 동작.
// REALTIME_SECRET은 개발용 더미값 — 운영 배포 시 환경변수로 교체 필요.

import { createRealtimeWebSocketUrl } from '../utils/websocketUrl.js';

const REALTIME_SECRET = 'dev-only-secret-change-me';

// ===== 순수 JS SHA-256 (crypto.subtle 없이 HTTP에서도 동작) =====
function sha256(msgBytes) {
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  const r=(v,n)=>(v>>>n)|(v<<(32-n));
  const len=msgBytes.length;
  const bitLen=len*8;
  const padded=new Uint8Array(((len+9+63)&~63));
  padded.set(msgBytes);
  padded[len]=0x80;
  const dv=new DataView(padded.buffer);
  dv.setUint32(padded.length-4,bitLen,false);
  for(let off=0;off<padded.length;off+=64){
    const w=new Int32Array(64);
    for(let i=0;i<16;i++)w[i]=dv.getInt32(off+i*4,false);
    for(let i=16;i<64;i++){const s0=r(w[i-15]>>>0,7)^r(w[i-15]>>>0,18)^(w[i-15]>>>3);const s1=r(w[i-2]>>>0,17)^r(w[i-2]>>>0,19)^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)|0;}
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for(let i=0;i<64;i++){const S1=r(e>>>0,6)^r(e>>>0,11)^r(e>>>0,25);const ch=(e&f)^(~e&g);const t1=(h+S1+ch+K[i]+w[i])|0;const S0=r(a>>>0,2)^r(a>>>0,13)^r(a>>>0,22);const maj=(a&b)^(a&c)^(b&c);const t2=(S0+maj)|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
    h0=(h0+a)|0;h1=(h1+b)|0;h2=(h2+c)|0;h3=(h3+d)|0;h4=(h4+e)|0;h5=(h5+f)|0;h6=(h6+g)|0;h7=(h7+h)|0;
  }
  const out=new Uint8Array(32);
  new DataView(out.buffer).setUint32(0,h0);new DataView(out.buffer).setUint32(4,h1);new DataView(out.buffer).setUint32(8,h2);new DataView(out.buffer).setUint32(12,h3);
  new DataView(out.buffer).setUint32(16,h4);new DataView(out.buffer).setUint32(20,h5);new DataView(out.buffer).setUint32(24,h6);new DataView(out.buffer).setUint32(28,h7);
  return out;
}

function hmacSha256(keyBytes, msgBytes) {
  const blockSize = 64;
  let k = keyBytes.length > blockSize ? sha256(keyBytes) : keyBytes;
  const pad = new Uint8Array(blockSize);
  pad.set(k);
  const ipad = new Uint8Array(blockSize + msgBytes.length);
  const opad = new Uint8Array(blockSize + 32);
  for (let i = 0; i < blockSize; i++) { ipad[i] = pad[i] ^ 0x36; opad[i] = pad[i] ^ 0x5c; }
  ipad.set(msgBytes, blockSize);
  const inner = sha256(ipad);
  opad.set(inner, blockSize);
  return sha256(opad);
}

// ===== JWT 생성 =====
function bytesToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function jsonToBase64Url(obj) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
}

function getRealtimeToken(userId, nickname) {
  const now = Math.floor(Date.now() / 1000);
  const encHeader = jsonToBase64Url({ alg: 'HS256', typ: 'JWT' });
  const encPayload = jsonToBase64Url({ userId, nickname, iat: now, exp: now + 3600 });
  const data = `${encHeader}.${encPayload}`;
  const sig = hmacSha256(
    new TextEncoder().encode(REALTIME_SECRET),
    new TextEncoder().encode(data)
  );
  return `${data}.${bytesToBase64Url(sig)}`;
}

// ===== 채팅 연결 =====
export function connectChat(eventId, userId, nickname, { onMessage, onOpen, onClose, onError } = {}) {
  const token = getRealtimeToken(userId, nickname);
  const url = createRealtimeWebSocketUrl(`/ws/chat/${encodeURIComponent(eventId)}`, { token });
  console.log('[Chat] 연결 시도:', url.replace(/token=.*/, 'token=***'));
  const ws = new WebSocket(url);
  ws.addEventListener('open', () => { console.log('[Chat] 연결 성공'); onOpen?.(); });
  ws.addEventListener('message', (e) => { try { onMessage?.(JSON.parse(e.data)); } catch (_) {} });
  ws.addEventListener('close', (e) => { console.log('[Chat] 연결 종료 code:', e.code, 'reason:', e.reason); onClose?.(); });
  ws.addEventListener('error', (e) => { console.error('[Chat] 에러 발생:', e); onError?.(); });
  return {
    sendMessage(text) {
      if (ws.readyState === WebSocket.OPEN) ws.send(text);
    },
    close() { ws.close(); },
    get readyState() { return ws.readyState; },
    ws,
  };
}

// ===== 좌석 실시간 연결 =====
export function connectSeats(eventId, userId, nickname, { onMessage, onOpen, onClose } = {}) {
  const token = getRealtimeToken(userId, nickname);
  const url = createRealtimeWebSocketUrl(`/ws/seats/${encodeURIComponent(eventId)}`, { token });
  const ws = new WebSocket(url);
  ws.addEventListener('open', () => onOpen?.());
  ws.addEventListener('message', (e) => { try { onMessage?.(JSON.parse(e.data)); } catch (_) {} });
  ws.addEventListener('close', () => onClose?.());
  return { ws, close() { ws.close(); } };
}

// ===== 좌석 상태 변경 발행 =====
export function publishSeatChange(eventId, seatId, status) {
  return fetch(`/publish/seat/${eventId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seatId, status }),
  });
}
