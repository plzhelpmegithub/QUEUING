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
};

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

export function login({ name, email, isAdmin = false }) {
  state.user = {
    name: name || '게스트',
    userId: (email || 'guest').split('@')[0],
    email: email || 'guest@queuing.app',
    isAdmin,
  };
  emit();
}

export function isAdmin() {
  return !!(state.user && state.user.isAdmin);
}

export function logout() {
  state.user = null;
  emit();
}

export function isLoggedIn() {
  return !!state.user;
}

export function subscribeMembership(plan) {
  state.membership = { plan, since: new Date().toISOString() };
  emit();
}

export function hasMembership() {
  return !!state.membership;
}

export function toggleInterest(concertId) {
  if (state.interests.has(concertId)) state.interests.delete(concertId);
  else state.interests.add(concertId);
  emit();
}

export function isInterested(concertId) {
  return state.interests.has(concertId);
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
  emit();
  return booking;
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
