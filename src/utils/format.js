// Formatting helpers shared across QUEUING pages

export function formatNumber(n) {
  return Math.max(0, Math.round(n)).toLocaleString('ko-KR');
}

export function formatPrice(n) {
  return `₩${formatNumber(n)}`;
}

export function pad2(n) {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

// ms -> "HH : MM : SS"
export function formatClock(ms) {
  if (ms <= 0) return '00 : 00 : 00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${pad2(h)} : ${pad2(m)} : ${pad2(s)}`;
}

// ms -> "MM:SS"
export function formatMMSS(ms) {
  if (ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

// ms -> "D-2 13:42:20" style
export function formatDeadline(ms) {
  if (ms <= 0) return '마감';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const dPart = days > 0 ? `D-${days} ` : '';
  return `${dPart}${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

export function formatDate(dateStr) {
  const d = new Date(dateStr);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}(${days[d.getDay()]})`;
}

export function formatDateShort(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
}

export function formatDateRange(startStr, endStr) {
  if (!endStr || startStr === endStr) return formatDateShort(startStr);
  return `${formatDateShort(startStr)} ~ ${formatDateShort(endStr)}`;
}

export function uid(prefix = 'A') {
  const now = new Date();
  const y = now.getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}${y}${rand}`;
}

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
