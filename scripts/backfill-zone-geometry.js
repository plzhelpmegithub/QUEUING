// 기존(레거시) 공연에 부채꼴 좌석맵 좌표(angle/radius/blockW/blockH/color)를 채워 넣는
// 1회성 스크립트. eventRoutes.js의 assignZoneGeometry()와 동일한 계산식을 씀.
//
// 실행: 이 프로젝트(queue-service) 안에서
//   node scripts/backfill-zone-geometry.js
// REDIS_HOST/REDIS_PORT 환경변수를 그대로 쓰므로 서버와 같은 Redis를 봄.

const redis = require('../src/config/redis');

const EVENT_KEY = 'event:info';
const EVENT_LIST_KEY = 'events:list';

const GRADE_COLOR = { VIP: '#B5121B', R: '#C98500', S: '#199E70', A: '#3987E5' };
const FALLBACK_PALETTE = ['#B5121B', '#C98500', '#199E70', '#3987E5', '#8E44AD', '#16A085', '#D35400', '#2C3E50'];

function assignZoneGeometry(sections) {
  const n = sections.length;
  const ANGLE_SPAN = 150;
  return sections.map((s, i) => {
    const angle = n === 1 ? 0 : Math.round(-ANGLE_SPAN / 2 + (i * ANGLE_SPAN) / (n - 1));
    const radius = 100 + i * 65;
    const blockW = Math.max(58, 92 - i * 6);
    const blockH = Math.max(46, 44 + i * 4);
    const color = GRADE_COLOR[s.name] || FALLBACK_PALETTE[i % FALLBACK_PALETTE.length];
    return { ...s, angle, radius, blockW, blockH, color, short: s.name.slice(0, 3) };
  });
}

function needsGeometry(sections) {
  return Array.isArray(sections) && sections.length > 0 && sections.some((s) => s.angle === undefined || s.radius === undefined);
}

async function main() {
  let patched = 0;

  // 1) 현재 활성 공연 (event:info)
  const info = await redis.hgetall(EVENT_KEY);
  if (info && info.eventName) {
    const seatingType = info.seatingType || 'arena';
    const sections = JSON.parse(info.sections || '[]');
    if (seatingType !== 'standing' && needsGeometry(sections)) {
      const withGeometry = assignZoneGeometry(sections);
      await redis.hset(EVENT_KEY, 'sections', JSON.stringify(withGeometry));
      if (!info.seatingType) await redis.hset(EVENT_KEY, 'seatingType', seatingType);
      console.log(`[event:info] "${info.eventName}" (${info.eventId}) 좌표 채움 — ${sections.length}개 구역`);
      patched++;
    } else {
      console.log(`[event:info] "${info.eventName}" 이미 좌표 있음 또는 standing — 건너뜀`);
    }
  } else {
    console.log('[event:info] 등록된 공연 없음 — 건너뜀');
  }

  // 2) 이벤트 목록 카드 (events:list) — /events 응답이 여기서 나감
  const all = await redis.hgetall(EVENT_LIST_KEY);
  for (const [eventId, cardStr] of Object.entries(all || {})) {
    const card = JSON.parse(cardStr);
    if (!card.sections) {
      console.log(`[events:list] ${eventId} "${card.eventName}" sections 필드 자체가 없음 — 건너뜀 (좌석 데이터가 있는 공연만 대상)`);
      continue;
    }
    const seatingType = card.seatingType || 'arena';
    if (seatingType !== 'standing' && needsGeometry(card.sections)) {
      card.sections = assignZoneGeometry(card.sections);
      card.seatingType = seatingType;
      await redis.hset(EVENT_LIST_KEY, eventId, JSON.stringify(card));
      console.log(`[events:list] "${card.eventName}" (${eventId}) 좌표 채움 — ${card.sections.length}개 구역`);
      patched++;
    } else {
      console.log(`[events:list] "${card.eventName}" 이미 좌표 있음/standing/sections 없음 — 건너뜀`);
    }
  }

  console.log(`\n완료 — 총 ${patched}건 패치`);
  process.exit(0);
}

main().catch((err) => {
  console.error('실패:', err);
  process.exit(1);
});
