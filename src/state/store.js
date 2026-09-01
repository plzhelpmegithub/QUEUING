// Central in-memory store with a tiny pub/sub layer.
// This simulates a backend for the QUEUING demo — no network calls.

const listeners = new Set();

const state = {
  user: null, // { name, userId, email }
  membership: null, // { plan: 'monthly' | 'yearly', since: Date }
  interests: new Set(), // concert ids
  bookings: [], // { bookingId, concertId, seat, price, status, deadline, source }
  cancelQueues: {}, // concertId -> { myNumber, total, joinedAt }
  cancelPools: {}, // concertId -> { VIP, R, S }
  currentOrder: null, // transient seat hold before payment
  returnTo: null, // for post-login redirect
  chatRooms: {}, // concertId -> { viewers, messages: [{id, author, text, mine, ts}] } — one isolated room per concert
  selectedSessions: {}, // concertId -> { date, time }
  venueZones: {}, // concertId -> { zoneId: remainingSeats }
  sessionExpiresAt: null, // mock login-session TTL, so "세션 만료" is a real, demonstrable state
  sessionJustExpired: false,
  notifications: [], // { id, title, body, createdAt, read }
  admissionTokens: {}, // concertId -> { token, expiresAt } — issued by the real queue-service once admitted, required by /seats/hold
  seatSelectDeadline: null, // ms epoch — global "좌석선택제한시간" shown in the header from entering zones through payment/complete
};

const SESSION_TTL_MS = 20 * 60 * 1000; // 20 minutes of mock login session
const AUTH_KEY = 'queuing_auth';

function saveAuth() {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify({
      user: state.user,
      sessionExpiresAt: state.sessionExpiresAt,
      membership: state.membership,
    }));
  } catch (_) {}
}

function clearAuth() {
  try { localStorage.removeItem(AUTH_KEY); } catch (_) {}
}

// Restore session on module load
try {
  const saved = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
  if (saved && saved.user && saved.sessionExpiresAt > Date.now()) {
    state.user = saved.user;
    state.sessionExpiresAt = saved.sessionExpiresAt;
    state.membership = saved.membership || null;
    setTimeout(() => {
      loadWishlistFromServer();
      loadMembershipFromServer();
    }, 100);
  } else if (saved) {
    localStorage.removeItem(AUTH_KEY);
  }
} catch (_) {}

function emit() {
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState() {
  return state;
}

// Auth is centralized here (not in header.js/login.js) so swapping this mock
// implementation for real AWS Cognito calls later only touches this module —
// components only ever see isLoggedIn()/getState().user, never a token directly.
export function login({ name, email, isAdmin = false, isMonitor = false, role: rawRole, userId }) {
  const resolvedRole = rawRole || (isAdmin ? 'ADMIN' : isMonitor ? 'MONITOR' : 'USER');
  state.user = {
    name: name || '게스트',
    userId: userId || (email || 'guest').split('@')[0],
    email: email || 'guest@queuing.app',
    isAdmin: isAdmin || resolvedRole === 'ADMIN',
    isMonitor: isMonitor || resolvedRole === 'MONITOR',
    role: resolvedRole,
    phone: '',
    marketingOptIn: false,
    joinedAt: Date.now(),
    accessToken: `mock-access-${Math.random().toString(36).slice(2)}`,
    refreshToken: `mock-refresh-${Math.random().toString(36).slice(2)}`,
  };
  state.sessionExpiresAt = Date.now() + SESSION_TTL_MS;
  state.sessionJustExpired = false;
  saveAuth();
  emit();
  loadWishlistFromServer();
  loadMembershipFromServer();
}

export function updateProfile(patch) {
  if (!state.user) return;
  Object.assign(state.user, patch);
  saveAuth();
  emit();
}

export function isAdmin() {
  return !!(state.user && state.user.isAdmin);
}

export function isMonitor() {
  return !!(state.user && state.user.isMonitor);
}

export function logout() {
  state.user = null;
  state.sessionExpiresAt = null;
  state.membership = null;
  clearAuth();
  emit();
}

export function touchSession() {
  if (!state.user || !state.sessionExpiresAt) return;
  state.sessionExpiresAt = Date.now() + SESSION_TTL_MS;
  saveAuth();
}

export function isLoggedIn() {
  return !!state.user;
}

// True once for the render right after a session times out, so the UI can show
// "세션이 만료되었습니다" instead of the generic "로그인이 필요합니다" message.
export function consumeSessionExpiredFlag() {
  const was = state.sessionJustExpired;
  state.sessionJustExpired = false;
  return was;
}

export function expireSession() {
  if (!state.user) return;
  state.user = null;
  state.sessionExpiresAt = null;
  state.membership = null;
  state.sessionJustExpired = true;
  clearAuth();
  emit();
}

export function subscribeMembership(plan) {
  const userId = state.user?.userId;
  if (!userId) return Promise.resolve({ success: false, message: '로그인이 필요합니다.' });
  return fetch('/membership/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, plan }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.success) {
        state.membership = { plan, since: data.expiresAt || new Date().toISOString() };
        saveAuth();
        emit();
      }
      return data;
    })
    .catch((err) => {
      console.error('[Membership] 가입 API 실패:', err);
      return { success: false, message: '네트워크 오류가 발생했습니다.' };
    });
}

export function hasMembership() {
  return !!state.membership;
}

export function cancelMembership() {
  const userId = state.user?.userId;
  if (!userId) return Promise.resolve({ success: false, message: '로그인이 필요합니다.' });
  return fetch('/membership/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.success) {
        state.membership = null;
        saveAuth();
        emit();
      }
      return data;
    })
    .catch((err) => {
      console.error('[Membership] 해지 API 실패:', err);
      return { success: false, message: '네트워크 오류가 발생했습니다.' };
    });
}

export function loadMembershipFromServer() {
  const userId = state.user?.userId;
  if (!userId) return;
  fetch(`/membership/${userId}`)
    .then(r => r.json())
    .then(data => {
      if (data.isMembership) {
        state.membership = { plan: data.plan, since: data.createdAt };
        saveAuth();
      } else {
        state.membership = null;
        saveAuth();
      }
      emit();
    })
    .catch(() => {});
}

export function toggleInterest(concertId) {
  const userId = state.user?.userId;
  if (state.interests.has(concertId)) {
    state.interests.delete(concertId);
    if (userId) {
      fetch('/wishlist/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, eventId: concertId }),
      }).catch(() => {});
    }
  } else {
    state.interests.add(concertId);
    if (userId) {
      fetch('/wishlist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, eventId: concertId }),
      }).catch(() => {});
    }
  }
  emit();
}

export function isInterested(concertId) {
  return state.interests.has(concertId);
}

export function loadWishlistFromServer() {
  const userId = state.user?.userId;
  if (!userId) return;
  fetch(`/wishlist/${userId}`)
    .then(r => r.json())
    .then(data => {
      state.interests.clear();
      (data.wishlists || []).forEach(w => state.interests.add(w.eventId));
      emit();
    })
    .catch(() => {});
}

export function setCurrentOrder(order) {
  state.currentOrder = order;
  emit();
}

export function clearCurrentOrder() {
  state.currentOrder = null;
  emit();
}

export function addBooking(booking) {
  state.bookings.unshift(booking);
  addNotification({
    title: booking.status === 'unpaid' ? '입금 대기 중인 예매가 있어요' : '예매가 확정되었습니다',
    body:
      booking.status === 'unpaid'
        ? `예매번호 ${booking.bookingId} · 가상계좌로 입금을 완료해주세요.`
        : `예매번호 ${booking.bookingId} 결제가 정상적으로 완료되었습니다.`,
  });
  emit();
  return booking;
}

// Reconstructing booking history from the real backend (GET /reservations/user/:userId)
// on mypage load — unlike addBooking(), this doesn't fire a "예매 완료" notification,
// since it's re-displaying past bookings rather than reacting to one just made.
export function addBookingSilently(booking) {
  if (state.bookings.some((b) => b.bookingId === booking.bookingId)) return booking;
  state.bookings.push(booking);
  emit();
  return booking;
}

export function hasBookingForSeat(seatId) {
  return state.bookings.some((b) => b.seat?.id === seatId || b.seats?.some((s) => s.id === seatId));
}

// Admission Token issued by the real queue-service once the queue admits this user —
// /seats/hold requires it. Kept per concert since a user could be admitted into
// more than one concert's queue in the same session.
export function setAdmissionToken(concertId, tokenInfo) {
  state.admissionTokens[concertId] = tokenInfo;
}

export function getAdmissionToken(concertId) {
  const t = state.admissionTokens[concertId];
  if (!t) return null;
  if (t.expiresAt && Date.now() > new Date(t.expiresAt).getTime()) {
    delete state.admissionTokens[concertId];
    return null;
  }
  return t;
}

export function clearAdmissionToken(concertId) {
  delete state.admissionTokens[concertId];
}

// Header-level "좌석선택제한시간" timer — starts the moment the user reaches the
// seat-select screen and stays visible (via header.js) through payment and the
// completion page, so the whole booking flow shares one visible deadline instead
// of it disappearing between steps. Idempotent: re-entering zones mid-flow keeps
// the existing deadline rather than resetting the clock.
export function startSeatSelectTimer(ms = 7 * 60 * 1000) {
  if (state.seatSelectDeadline && state.seatSelectDeadline > Date.now()) return state.seatSelectDeadline;
  state.seatSelectDeadline = Date.now() + ms;
  emit();
  return state.seatSelectDeadline;
}

export function getSeatSelectDeadline() {
  return state.seatSelectDeadline;
}

export function clearSeatSelectTimer() {
  if (!state.seatSelectDeadline) return;
  state.seatSelectDeadline = null;
  emit();
}

export function addNotification({ title, body }) {
  state.notifications.unshift({
    id: `N${Date.now()}${Math.floor(Math.random() * 1000)}`,
    title,
    body,
    createdAt: Date.now(),
    read: false,
  });
  emit();
}

export function getNotifications() {
  return state.notifications;
}

export function unreadNotificationCount() {
  return state.notifications.filter((n) => !n.read).length;
}

export function markAllNotificationsRead() {
  if (!state.notifications.some((n) => !n.read)) return;
  state.notifications.forEach((n) => (n.read = true));
  emit();
}

export function updateBooking(bookingId, patch) {
  const b = state.bookings.find((x) => x.bookingId === bookingId);
  if (b) Object.assign(b, patch);
  emit();
}

export function getBooking(bookingId) {
  return state.bookings.find((x) => x.bookingId === bookingId);
}

export function joinCancelQueue(concertId, { max = 2000 } = {}) {
  if (state.cancelQueues[concertId]) return state.cancelQueues[concertId];
  const myNumber = Math.max(1, Math.floor(Math.random() * max * 0.9) + 1);
  const entry = {
    myNumber,
    total: max,
    joinedAt: Date.now(),
  };
  state.cancelQueues[concertId] = entry;
  emit();
  return entry;
}

export function getCancelQueue(concertId) {
  return state.cancelQueues[concertId] || null;
}

export function ensureCancelPool(concertId) {
  if (!state.cancelPools[concertId]) {
    state.cancelPools[concertId] = { VIP: 3, R: 9, S: 17 };
    emit();
  }
  return state.cancelPools[concertId];
}

export function bumpCancelPool(concertId, grade) {
  const pool = ensureCancelPool(concertId);
  pool[grade] = (pool[grade] || 0) + 1;
  emit();
}

export function consumeCancelPool(concertId, grade) {
  const pool = ensureCancelPool(concertId);
  if (pool[grade] > 0) pool[grade] -= 1;
  emit();
}

export function setReturnTo(hash) {
  state.returnTo = hash;
}

export function popReturnTo() {
  const r = state.returnTo;
  state.returnTo = null;
  return r;
}

// Each concert has its own isolated chat room — separate "servers" per show, as if
// each concert page connects to a different chat backend.
export function getChatRoom(concertId) {
  if (!state.chatRooms[concertId]) {
    state.chatRooms[concertId] = {
      viewers: 60 + Math.floor(Math.random() * 480),
      messages: [],
    };
  }
  return state.chatRooms[concertId];
}

export function sendChatMessage(concertId, message) {
  const room = getChatRoom(concertId);
  room.messages.push(message);
  if (room.messages.length > 200) room.messages.shift();
  emit();
}

export function setSelectedSession(concertId, session) {
  state.selectedSessions[concertId] = session;
  emit();
}

export function getSelectedSession(concertId) {
  return state.selectedSessions[concertId] || null;
}

export function ensureVenueZones(concertId, layout) {
  if (!state.venueZones[concertId]) {
    const zones = {};
    layout.forEach((z) => {
      zones[z.id] = z.seed;
    });
    state.venueZones[concertId] = zones;
    emit();
  }
  return state.venueZones[concertId];
}

export function decrementVenueZone(concertId, zoneId, amount) {
  const zones = state.venueZones[concertId];
  if (!zones || zones[zoneId] == null) return;
  zones[zoneId] = Math.max(0, zones[zoneId] - amount);
  emit();
}

export function getVenueZoneRemaining(concertId, zoneId) {
  return state.venueZones[concertId]?.[zoneId] ?? 0;
}

// Cancelling a confirmed booking: flips it into a short "환불 처리 중" window
// (simulating a real refund pipeline) before landing on "환불 완료", and — since
// QUEUING routes every cancelled seat back into circulation — registers the
// freed seat into that concert's 취소표 Pool for the next cancellation-queue member.
export function requestRefund(bookingId) {
  const b = state.bookings.find((x) => x.bookingId === bookingId);
  if (!b || b.status !== 'confirmed') return;
  b.status = 'refund_pending';
  b.cancelledAt = Date.now();
  addNotification({ title: '환불 처리 중입니다', body: `예매번호 ${b.bookingId}의 환불이 접수되었습니다.` });
  emit();
  setTimeout(() => {
    b.status = 'refunded';
    const seats = b.seats && b.seats.length ? b.seats : b.seat ? [b.seat] : [];
    seats.forEach((s) => bumpCancelPool(b.concertId, s.grade));
    addNotification({ title: '환불이 완료되었습니다', body: `예매번호 ${b.bookingId}의 환불 처리가 완료되었습니다.` });
    emit();
  }, 4000);
}

// Mock session-expiry watchdog — checks every few seconds whether the logged-in
// user's session TTL has elapsed and, if so, logs them out via expireSession()
// so the UI can show the "세션이 만료되었습니다" flow instead of a silent logout.
setInterval(() => {
  if (state.user && state.sessionExpiresAt && Date.now() > state.sessionExpiresAt) {
    expireSession();
  }
}, 5000);

if (typeof window !== 'undefined') {
  // Demo-only hook so session expiry can be triggered on demand instead of waiting
  // out the full TTL — mirrors the existing admin/1 demo shortcut in login.js.
  window.__queuingDebug = { ...(window.__queuingDebug || {}), expireSession };
}
