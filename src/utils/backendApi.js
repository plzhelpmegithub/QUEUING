// A파트(찬규님) REST API와의 연결.
// Vite 프록시(/seats → 192.168.0.190:3000)를 통해 호출하므로 CORS 불필요.
// 프록시 설정은 vite.config.js 참고.

import { fetchWithRecaptcha } from './recaptcha.js';
import { authHeaders } from './authToken.js';

const FETCH_TIMEOUT_MS = 3000;

async function getJson(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(path, { headers: { ...authHeaders() }, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data.message || `HTTP ${res.status}`);
      error.status = res.status;
      error.code = data.code || '';
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(path, body, recaptchaAction = '') {
  if (recaptchaAction) {
    const { status, data } = await fetchWithRecaptcha(path, body, recaptchaAction);
    return { ok: status >= 200 && status < 300, data };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } finally {
    clearTimeout(timer);
  }
}

export async function enterQueueApi(userId, context = {}) {
  return postJson('/queue/enter', { userId, ...context }, 'queue_enter');
}

export async function joinCancelQueueApi(userId, context = {}) {
  return postJson('/cancel-queue/join', { userId, ...context }, 'cancel_queue_join');
}

export async function fetchCancelQueueStatus(eventId, userId, context = {}) {
  const params = new URLSearchParams(context);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return getJson(`/cancel-queue/status/${encodeURIComponent(eventId)}/${encodeURIComponent(userId)}${suffix}`);
}

// 마이페이지용 취소표 대기열 목록. 서버가 인증 토큰에서 사용자를 확인하므로
// userId를 URL에 노출하거나 브라우저의 임시 상태만으로 목록을 만들지 않는다.
export async function fetchMyCancelQueues() {
  return getJson('/cancel-queue/mine');
}

// 수동으로 취소표 순번을 넘긴 내역. 실제 결제/환불과 구분되는 안내 기록이지만
// 마이페이지의 취소·환불내역 탭에서 함께 보여 준다.
export async function fetchMyCancelQueueHistory() {
  return getJson('/cancel-queue/history/mine');
}

export async function fetchCancelPool(eventId, context = {}) {
  const params = new URLSearchParams(context);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return getJson(`/cancel-queue/pool/${encodeURIComponent(eventId)}${suffix}`);
}

export async function holdCancelSeat(userId, eventId, seatId, context = {}) {
  return postJson('/cancel-queue/hold', { userId, eventId, seatId, ...context }, 'cancel_seat_hold');
}

export async function expireCancelAllocation(userId, eventId, seatId, context = {}) {
  return postJson('/cancel-queue/expire', { userId, eventId, seatId, ...context });
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
  const { data } = await fetchWithRecaptcha('/seats/hold', { userId, seatId, token, ...context }, 'seat_hold');
  return data;
}

// POST /seats/release via fetch keepalive — 페이지 종료(닫기/새로고침) 시 사용.
// sendBeacon은 Bearer 헤더를 붙일 수 없으므로 인증이 필요한 API에는 사용하지 않는다.
export function releaseSeatBeacon(userId, seatId) {
  if (!userId || !seatId) return false;
  fetch('/seats/release', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ userId, seatId }),
    keepalive: true,
  }).catch(() => {});
  return true;
}

// POST /queue/leave via keepalive — 대기열 페이지를 닫거나 이탈할 때
// 로그인한 사용자를 서버의 waiting/standby 집합에서 제거한다.
// pagehide에서는 sendBeacon에 Bearer 헤더를 붙일 수 없어 keepalive fetch를 사용한다.
export function leaveQueueBeacon(userId, context = {}) {
  if (!userId) return false;
  fetch('/queue/leave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ userId, ...context }),
    keepalive: true,
  }).catch(() => {});
  return true;
}

// POST /seats/release — 좌석 선점 해제 (held → available)
export async function releaseSeatApi(userId, seatId, context = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch('/seats/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
  const { data } = await fetchWithRecaptcha('/seats/confirm', { userId, seatId, ...context }, 'seat_confirm');
  return data;
}
