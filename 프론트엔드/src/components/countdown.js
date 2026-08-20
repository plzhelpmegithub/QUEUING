import { formatClock, formatMMSS, formatDeadline, pad2 } from '../utils/format.js';

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const FORMATTERS = {
  clock: formatClock,
  mmss: formatMMSS,
  deadline: formatDeadline,
};

/**
 * Mounts a live countdown into `el` (el's innerHTML is fully owned by this component).
 * options: { targetMs, format: 'clock'|'mmss'|'deadline', label, size, onComplete, onTick, colonSplit }
 * Returns a stop() function.
 */
export function mountCountdown(el, options) {
  const { targetMs, format = 'clock', label = '', size = '', onComplete = () => {}, onTick = () => {} } = options;
  const fmt = FORMATTERS[format] || formatClock;
  let done = false;

  function paint(ms) {
    const text = fmt(ms);
    if (format === 'deadline') {
      el.innerHTML = `${label ? `<div class="countdown-label">${label}</div>` : ''}<div class="countdown-clock ${size} num-mono">${text}</div>`;
    } else {
      const parts = text.split(':').map((s) => s.trim());
      el.innerHTML = `
        ${label ? `<div class="countdown-label">${label}</div>` : ''}
        <div class="countdown-clock ${size} num-mono">${parts
          .map((p, i) => `<span>${p}</span>${i < parts.length - 1 ? '<span class="colon">:</span>' : ''}`)
          .join('')}</div>
      `;
    }
  }

  function tick() {
    const remaining = targetMs - Date.now();
    if (remaining <= 0) {
      paint(0);
      if (!done) {
        done = true;
        onComplete();
      }
      return;
    }
    paint(remaining);
    onTick(remaining);
  }

  tick();
  const interval = setInterval(tick, 1000);
  return () => clearInterval(interval);
}

/**
 * Mounts a live "server time" clock — precise to the second, like the reference-time
 * widgets big ticketing sites show so everyone's countdown agrees on the same clock.
 * Returns a stop() function.
 */
export function mountServerClock(el, { label = '현재 서버 시간' } = {}) {
  function paint() {
    const now = new Date();
    const ampm = now.getHours() < 12 ? '오전' : '오후';
    const h12 = now.getHours() % 12 === 0 ? 12 : now.getHours() % 12;
    el.innerHTML = `
      <div class="server-clock">
        <span class="server-clock__dot"></span>
        <span class="server-clock__label">${label}</span>
        <span class="server-clock__value num-mono">${now.getFullYear()}.${pad2(now.getMonth() + 1)}.${pad2(now.getDate())}(${WEEKDAYS_KO[now.getDay()]}) ${ampm} ${pad2(h12)}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}</span>
      </div>
    `;
  }
  paint();
  const interval = setInterval(paint, 1000);
  return () => clearInterval(interval);
}

/**
 * Mounts a countdown-to-booking-open widget that automatically switches modes as time
 * passes: more than 24h out it shows a D-day badge + the exact open date/time; inside
 * the final 24 hours it switches to a live HH:MM:SS countdown, re-evaluating every
 * second so it transitions on its own without a page reload.
 * Returns a stop() function.
 */
export function mountBookingCountdown(el, { targetMs, label = '티켓팅까지 남은 시간', onComplete = () => {} }) {
  let done = false;

  function paint() {
    const remaining = targetMs - Date.now();
    if (remaining <= 0) {
      if (!done) {
        done = true;
        onComplete();
      }
      return;
    }
    if (remaining > ONE_DAY_MS) {
      const days = Math.ceil(remaining / ONE_DAY_MS);
      const openAt = new Date(targetMs);
      const ampm = openAt.getHours() < 12 ? '오전' : '오후';
      const h12 = openAt.getHours() % 12 === 0 ? 12 : openAt.getHours() % 12;
      el.innerHTML = `
        <div class="countdown-label">${label}</div>
        <div class="dday-badge">D-${days}</div>
        <div class="dday-open-at">${openAt.getMonth() + 1}월 ${openAt.getDate()}일(${WEEKDAYS_KO[openAt.getDay()]}) ${ampm} ${pad2(h12)}:${pad2(openAt.getMinutes())} 예매 오픈</div>
      `;
    } else {
      const text = formatClock(remaining);
      const parts = text.split(':').map((s) => s.trim());
      el.innerHTML = `
        <div class="countdown-label">${label}</div>
        <div class="countdown-clock num-mono">${parts
          .map((p, i) => `<span>${p}</span>${i < parts.length - 1 ? '<span class="colon">:</span>' : ''}`)
          .join('')}</div>
      `;
    }
  }

  paint();
  const interval = setInterval(paint, 1000);
  return () => clearInterval(interval);
}
