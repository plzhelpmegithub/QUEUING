// A파트(찬규님) REST API와의 연결.
// Vite 프록시(/seats → 192.168.0.190:3000)를 통해 호출하므로 CORS 불필요.
// 프록시 설정은 vite.config.js 참고.

const FETCH_TIMEOUT_MS = 3000;

async function getJson(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(path, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// GET /seats — A파트의 seatService.getAllSeats()를 그대로 노출한 API.
// 반환되는 seatId는 "evt-171...:VIP-001" 형태로 이벤트 ID가 접두사로 붙어 있음.
// 여러 이벤트의 좌석이 섞여서 올 수 있으므로(A가 아직 단일 활성 이벤트 구조라
// 실제로는 거의 항상 하나뿐이지만), 호출하는 쪽에서 section/eventId로 걸러 써야 한다.
export async function fetchRealSeats(context = {}) {
  const params = new URLSearchParams();
  Object.entries(context).forEach(([key, value]) => { if (value) params.set(key, value); });
  const data = await getJson(`/seats${params.toString() ? `?${params.toString()}` : ''}`);
  return Array.isArray(data.seats) ? data.seats : [];
}

// POST /seats/hold — 좌석 선점 (분산 락 + Admission Token 검증)
// 성공 시 서버에서 해당 좌석이 held 상태로 전환되고, 다른 유저는 선점 불가.
export async function holdSeatApi(userId, seatId, token, context = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch('/seats/hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, seatId, token, ...context }),
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// POST /seats/release via sendBeacon — 페이지 종료(닫기/새로고침) 시 사용
export function releaseSeatBeacon(userId, seatId) {
  if (!navigator.sendBeacon) return false;
  const blob = new Blob(
    [JSON.stringify({ userId, seatId })],
    { type: 'application/json' },
  );
  return navigator.sendBeacon('/seats/release', blob);
}

// POST /seats/release — 좌석 선점 해제 (held → available)
export async function releaseSeatApi(userId, seatId, context = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch('/seats/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, seatId, ...context }),
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// POST /seats/confirm — 결제 확정 (held → sold)
export async function confirmSeatApi(userId, seatId, context = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch('/seats/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, seatId, ...context }),
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
