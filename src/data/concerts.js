// Mock concert catalogue for QUEUING
// Poster art is represented with CSS gradients (no external image dependency).

function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
function iso(d) {
  // Keep the trailing "Z" so this always re-parses as UTC later (new Date(str)).
  // Slicing it off used to produce a timezone-less string, which Date() then
  // re-interprets as *local* time — shifting every timestamp by the viewer's
  // UTC offset (e.g. -9h in Korea), which was enough to make a "2 minutes from
  // now" bookingOpenAt look like it had already passed.
  return d.toISOString();
}

const NOW = new Date();

export const GRADIENTS = {
  crimson: 'linear-gradient(155deg,#3a0a0d 0%, #E31B23 55%, #7a0e14 100%)',
  noir: 'linear-gradient(155deg,#101010 0%, #3a0d0f 60%, #B5121B 100%)',
  ember: 'linear-gradient(155deg,#B5121B 0%, #E31B23 45%, #1a0304 100%)',
  rose: 'linear-gradient(155deg,#7a0e14 0%, #E31B23 50%, #2b0406 100%)',
  ink: 'linear-gradient(155deg,#111111 0%, #4d0b0e 65%, #E31B23 130%)',
  wine: 'linear-gradient(155deg,#2b0406 0%, #7a0e14 55%, #E31B23 110%)',
  scarlet: 'linear-gradient(155deg,#E31B23 0%, #101010 100%)',
  garnet: 'linear-gradient(155deg,#4d0b0e 0%, #E31B23 60%, #101010 100%)',
  // Mood-matched (not photo-copied) gradients for specific real-world tour concepts
  iceChrome: 'linear-gradient(155deg,#0a1420 0%, #2c4a63 45%, #a9c3d4 100%)', // aespa — cold metallic sci-fi
  flameMono: 'linear-gradient(160deg,#050505 0%, #1c1c1c 45%, #8a2f22 100%)', // LE SSERAFIM — stark B&W + ember
  stoneWarm: 'linear-gradient(155deg,#382f22 0%, #8f7a5c 55%, #e6d9c2 100%)', // SEVENTEEN — sand-stone arches
  neonNight: 'linear-gradient(155deg,#14001c 0%, #6a1f72 45%, #2451c9 100%)', // IU — magenta/blue city night
  editorialRB: 'linear-gradient(160deg,#050505 0%, #050505 55%, #c81e2c 120%)', // Stray Kids — mono + red typography
};

export const CONCERTS = [
  {
    id: 'svt-2026-newz',
    artist: 'SEVENTEEN',
    title: '2026 TOUR [NEW_] ENCORE',
    dateStart: iso(addDays(NOW, 9)),
    dateEnd: iso(addDays(NOW, 11)),
    venue: 'KSPO DOME',
    totalSeats: 30000,
    grad: GRADIENTS.stoneWarm,
    // Flagship demo: booking opens ~40s after app load so the countdown → live flow is easy to see.
    bookingOpenAt: iso(new Date(Date.now() + 40 * 1000)),
    grades: [
      { key: 'VIP', name: 'VIP석', price: 198000 },
      { key: 'R', name: 'R석', price: 158000 },
      { key: 'S', name: 'S석', price: 128000 },
      { key: 'A', name: 'A석', price: 89000 },
    ],
    desc: '13인조 보이그룹 SEVENTEEN의 2026년 신규 월드투어 앙코르 공연. 전세계 캐럿들과 함께하는 대규모 스타디움 투어.',
    hot: true,
    views: 184213,
  },
  {
    id: 'iu-2026-hereg',
    artist: 'IU',
    title: '2026 CONCERT [HEREDITY]',
    dateStart: iso(addDays(NOW, -2)),
    dateEnd: iso(addDays(NOW, -2)),
    venue: '잠실 종합운동장 주경기장',
    totalSeats: 24000,
    grad: GRADIENTS.neonNight,
    bookingOpenAt: iso(addDays(NOW, -10)),
    grades: [
      { key: 'VIP', name: 'VIP석', price: 176000 },
      { key: 'R', name: 'R석', price: 143000 },
      { key: 'S', name: 'S석', price: 110000 },
      { key: 'A', name: 'A석', price: 78000 },
    ],
    desc: '솔로 아티스트 IU의 정규 앨범 발매 기념 단독 콘서트.',
    hot: true,
    views: 221904,
  },
  {
    id: 'skz-2026-domin',
    artist: 'Stray Kids',
    title: '2026 WORLD TOUR [DOMINATE]',
    dateStart: iso(addDays(NOW, 3)),
    dateEnd: iso(addDays(NOW, 4)),
    venue: '고척스카이돔',
    totalSeats: 22000,
    grad: GRADIENTS.editorialRB,
    bookingOpenAt: iso(addDays(NOW, -5)),
    grades: [
      { key: 'VIP', name: 'VIP석', price: 187000 },
      { key: 'R', name: 'R석', price: 154000 },
      { key: 'S', name: 'S석', price: 121000 },
      { key: 'A', name: 'A석', price: 85000 },
    ],
    desc: 'Stray Kids의 2026 월드투어 서울 공연. 폭발적인 퍼포먼스로 완성하는 무대.',
    hot: true,
    views: 197532,
  },
  {
    id: 'aespa-2026-synk',
    artist: 'aespa',
    title: '2026 TOUR [SYNK : PARALLEL LINE]',
    dateStart: iso(addDays(NOW, 21)),
    dateEnd: iso(addDays(NOW, 22)),
    venue: 'KSPO DOME',
    totalSeats: 20000,
    grad: GRADIENTS.iceChrome,
    bookingOpenAt: iso(addDays(NOW, 6, 0)),
    grades: [
      { key: 'VIP', name: 'VIP석', price: 169000 },
      { key: 'R', name: 'R석', price: 138000 },
      { key: 'S', name: 'S석', price: 108000 },
      { key: 'A', name: 'A석', price: 76000 },
    ],
    desc: 'aespa의 새로운 세계관을 담은 신규 투어. MY & 아이-공동체와 함께.',
    hot: true,
    views: 165410,
    seatingType: 'archall',
  },
  {
    id: 'twc-2026-thisis',
    artist: 'TWICE',
    title: '2026 WORLD TOUR [THIS IS FOR]',
    dateStart: iso(addDays(NOW, 30)),
    dateEnd: iso(addDays(NOW, 31)),
    venue: '잠실 종합운동장 주경기장',
    totalSeats: 26000,
    grad: GRADIENTS.ink,
    bookingOpenAt: iso(addDays(NOW, 12)),
    grades: [
      { key: 'VIP', name: 'VIP석', price: 179000 },
      { key: 'R', name: 'R석', price: 148000 },
      { key: 'S', name: 'S석', price: 118000 },
      { key: 'A', name: 'A석', price: 83000 },
    ],
    desc: 'TWICE의 데뷔 10주년 기념 스타디움 투어 서울 공연.',
    hot: true,
    views: 143207,
  },
  {
    id: 'ateez-2026-treasure',
    artist: 'ATEEZ',
    title: '2026 WORLD TOUR [TREASURE EPILOGUE]',
    dateStart: iso(addDays(NOW, 15)),
    dateEnd: iso(addDays(NOW, 15)),
    venue: '인스파이어 아레나',
    totalSeats: 15000,
    grad: GRADIENTS.wine,
    bookingOpenAt: iso(addDays(NOW, -1)),
    grades: [
      { key: 'VIP', name: 'VIP석', price: 165000 },
      { key: 'R', name: 'R석', price: 132000 },
      { key: 'S', name: 'S석', price: 99000 },
      { key: 'A', name: 'A석', price: 69000 },
    ],
    desc: 'ATEEZ의 트레저 시리즈를 마무리하는 에필로그 공연.',
    hot: false,
    views: 88123,
    seatingType: 'standing',
  },
  {
    id: 'lsf-2026-crazy',
    artist: 'LE SSERAFIM',
    title: '2026 TOUR [CRAZY]',
    dateStart: iso(addDays(NOW, -1)),
    dateEnd: iso(addDays(NOW, -1)),
    venue: 'YES24 라이브홀',
    totalSeats: 6000,
    grad: GRADIENTS.flameMono,
    bookingOpenAt: iso(addDays(NOW, -20)),
    grades: [
      { key: 'VIP', name: 'VIP석', price: 154000 },
      { key: 'R', name: 'R석', price: 121000 },
      { key: 'S', name: 'S석', price: 92000 },
      { key: 'A', name: 'A석', price: 65000 },
    ],
    desc: 'LE SSERAFIM의 소규모 스페셜 단독 공연. 이미 전석 매진되어 취소표 대기열이 운영중입니다.',
    hot: true,
    forceSoldOut: true,
    views: 209981,
    seatingType: 'standing',
  },
  {
    id: 'nj-2026-bunny',
    artist: 'NewJeans',
    title: '2026 FAN CONCERT [BUNNY BUNNY]',
    dateStart: iso(addDays(NOW, 45)),
    dateEnd: iso(addDays(NOW, 46)),
    venue: 'KSPO DOME',
    totalSeats: 18000,
    grad: GRADIENTS.crimson,
    bookingOpenAt: iso(addDays(NOW, 25)),
    grades: [
      { key: 'VIP', name: 'VIP석', price: 159000 },
      { key: 'R', name: 'R석', price: 128000 },
      { key: 'S', name: 'S석', price: 98000 },
      { key: 'A', name: 'A석', price: 69000 },
    ],
    desc: 'NewJeans의 팬미팅 콘서트. 팬들과 더 가까이 만나는 특별한 무대.',
    hot: false,
    views: 76552,
  },
  {
    id: 'enh-2026-orbit',
    artist: 'ENHYPEN',
    title: '2026 WORLD TOUR [ORBIT]',
    dateStart: iso(addDays(NOW, 14)),
    dateEnd: iso(addDays(NOW, 15)),
    venue: '고양종합운동장 주경기장',
    totalSeats: 28000,
    grad: GRADIENTS.ink,
    // Test scenario: booking opens ~2 minutes after app load — enough time to watch the
    // countdown, then walk through queue → seat select → payment → complete end to end.
    bookingOpenAt: iso(new Date(Date.now() + 2 * 60 * 1000)),
    grades: [
      { key: 'VIP', name: 'VIP석', price: 182000 },
      { key: 'R', name: 'R석', price: 149000 },
      { key: 'S', name: 'S석', price: 115000 },
      { key: 'A', name: 'A석', price: 81000 },
    ],
    desc: 'ENHYPEN의 2026년 신규 월드투어. 팬들과 함께 만드는 궤도 위의 무대.',
    hot: true,
    views: 156301,
    // Tiny seat pool (every zone starts at 1 seat) so this E2E test show sells
    // out within roughly a minute of browsing — enough to see the full 매진 flow.
    zoneScaleOverride: 0.001,
  },
];

export function getConcert(id) {
  return CONCERTS.find((c) => c.id === id);
}

export function getConcertStatus(c) {
  if (c.forceSoldOut) return 'soldout';
  const now = Date.now();
  const open = new Date(c.bookingOpenAt).getTime();
  if (now < open) return 'upcoming';
  return 'onsale';
}

// Multiple performance sessions (date + time) per concert, generated from its
// date range — most shows run two sessions/day except a single evening show
// on the final day of a multi-day run.
const WEEKDAYS_KR = ['일', '월', '화', '수', '목', '금', '토'];

export function getSessions(c) {
  const start = new Date(c.dateStart);
  const end = new Date(c.dateEnd);
  const dayCount = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const sessions = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    sessions.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      times: ['19:00'],
    });
  }
  return sessions;
}

export function generateEventSessions(eventDate) {
  if (!eventDate) return [];
  const base = eventDate.includes('T') ? eventDate.split('T')[0] : eventDate;
  const [y, m, d] = base.split('-').map(Number);
  const baseDate = new Date(y, m - 1, d);
  const dow = baseDate.getDay();

  let sat;
  if (dow === 0) {
    sat = new Date(y, m - 1, d - 1);
  } else {
    const off = (6 - dow + 7) % 7;
    sat = new Date(y, m - 1, d + off);
  }
  const sun = new Date(sat);
  sun.setDate(sun.getDate() + 1);

  function fmt(dt) {
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
  function lbl(dt) {
    const dw = WEEKDAYS_KR[dt.getDay()];
    return `${dt.getMonth() + 1}.${String(dt.getDate()).padStart(2, '0')} (${dw})`;
  }
  return [
    { date: fmt(sat), time: '14:00', label: `${lbl(sat)} 14:00`, shortLabel: lbl(sat), round: 1 },
    { date: fmt(sat), time: '19:00', label: `${lbl(sat)} 19:00`, shortLabel: lbl(sat), round: 2 },
    { date: fmt(sun), time: '14:00', label: `${lbl(sun)} 14:00`, shortLabel: lbl(sun), round: 1 },
    { date: fmt(sun), time: '19:00', label: `${lbl(sun)} 19:00`, shortLabel: lbl(sun), round: 2 },
  ];
}

// Zone layouts come in two venue shapes so different concerts don't all look
// identical — an "arena" fan (concentric arcs of blocks curving around the
// stage, like a seated stadium/arena show) and a "standing" floor (four GA
// standing pens laid out as a grid, like a livehouse/club show). Which shape a
// concert gets is decided by its own `seatingType`. Zone-level "remaining seat"
// counts are tracked separately in the store (see ensureVenueZones) so they can
// visibly tick down while the user is looking at the overview.
const ARENA_RINGS = [
  { grade: 'VIP', count: 4, radius: 108, blockW: 78, blockH: 46, seedPerBlock: 42, labels: ['가', '나', '다', '라'] },
  { grade: 'R', count: 6, radius: 182, blockW: 72, blockH: 52, seedPerBlock: 130 },
  { grade: 'S', count: 9, radius: 256, blockW: 66, blockH: 56, seedPerBlock: 210 },
  { grade: 'A', count: 12, radius: 330, blockW: 60, blockH: 58, seedPerBlock: 270 },
];
const ARENA_ANGLE_SPAN = 168; // degrees, centered on straight-down from the stage hub

function arenaZoneLayout(c) {
  const gradeOf = (key) => c.grades.find((g) => g.key === key) || c.grades[c.grades.length - 1];
  // zoneScaleOverride lets a concert opt into a tiny, fast-draining seat pool
  // (used by the ENHYPEN E2E test show) instead of the usual totalSeats-based scale.
  const scale = c.zoneScaleOverride ?? Math.max(0.5, Math.min(2.2, c.totalSeats / 22000));
  const seedFloor = c.zoneScaleOverride != null ? 1 : 20;
  const zones = [];
  ARENA_RINGS.forEach((ring, ringIdx) => {
    for (let i = 0; i < ring.count; i++) {
      const angle = -ARENA_ANGLE_SPAN / 2 + ((i + 0.5) * ARENA_ANGLE_SPAN) / ring.count;
      const short = ring.labels ? ring.labels[i] : String(i + 1);
      const label = ring.labels ? `${ring.grade} ${ring.labels[i]}구역` : `${ring.grade} ${i + 1}구역`;
      zones.push({
        id: `${ring.grade}-${i + 1}`,
        grade: ring.grade,
        label,
        short,
        price: gradeOf(ring.grade).price,
        seed: Math.max(seedFloor, Math.round(ring.seedPerBlock * scale)),
        venueType: 'arena',
        ring: ringIdx,
        angle,
        radius: ring.radius,
        blockW: ring.blockW,
        blockH: ring.blockH,
      });
    }
  });
  return zones;
}

// A hand-placed layout modeled on a real arc-hall seating chart: floor VIP
// wings (F1/F2) flanking the stage stub, numbered general-admission sections
// arcing out to both sides, 2F/3F restricted-view corners furthest out, and a
// wheelchair-accessible marker on the innermost general zones (13/14). Every
// zone in this chart seats a flat 60 people, per spec, regardless of concert size.
const ARC_HALL_SEATS_PER_ZONE = 60;
const ARC_HALL_COLOR = { vip: '#D9481F', gen: '#6E1620', restricted: '#8C8C8C' };
const ARC_HALL_ZONES = [
  { id: 'F1', grade: 'VIP', color: ARC_HALL_COLOR.vip, angle: -20, radius: 92, blockW: 88, blockH: 52 },
  { id: 'F2', grade: 'VIP', color: ARC_HALL_COLOR.vip, angle: 20, radius: 92, blockW: 88, blockH: 52 },
  { id: '14', grade: 'R', color: ARC_HALL_COLOR.gen, angle: -42, radius: 132, blockW: 68, blockH: 50, wheelchair: true },
  { id: '13', grade: 'R', color: ARC_HALL_COLOR.gen, angle: 42, radius: 132, blockW: 68, blockH: 50, wheelchair: true },
  { id: '15', grade: 'R', color: ARC_HALL_COLOR.gen, angle: -58, radius: 170, blockW: 66, blockH: 52 },
  { id: '12', grade: 'R', color: ARC_HALL_COLOR.gen, angle: 58, radius: 170, blockW: 66, blockH: 52 },
  { id: '16', grade: 'R', color: ARC_HALL_COLOR.gen, angle: -72, radius: 208, blockW: 64, blockH: 54 },
  { id: '11', grade: 'R', color: ARC_HALL_COLOR.gen, angle: 72, radius: 208, blockW: 64, blockH: 54 },
  { id: '17', grade: 'R', color: ARC_HALL_COLOR.gen, angle: -84, radius: 246, blockW: 62, blockH: 56 },
  { id: '10', grade: 'R', color: ARC_HALL_COLOR.gen, angle: 84, radius: 246, blockW: 62, blockH: 56 },
  { id: '18', grade: 'A', color: ARC_HALL_COLOR.restricted, angle: -84, radius: 306, blockW: 62, blockH: 50 },
  { id: '9', grade: 'A', color: ARC_HALL_COLOR.restricted, angle: 84, radius: 306, blockW: 62, blockH: 50 },
  { id: '36', grade: 'A', color: ARC_HALL_COLOR.restricted, angle: -84, radius: 364, blockW: 62, blockH: 50 },
  { id: '27', grade: 'A', color: ARC_HALL_COLOR.restricted, angle: 84, radius: 364, blockW: 62, blockH: 50 },
  { id: '35', grade: 'R', color: ARC_HALL_COLOR.gen, angle: -86, radius: 150, blockW: 64, blockH: 52 },
  { id: '34', grade: 'R', color: ARC_HALL_COLOR.gen, angle: -90, radius: 185, blockW: 64, blockH: 54 },
  { id: '33', grade: 'R', color: ARC_HALL_COLOR.gen, angle: -94, radius: 220, blockW: 64, blockH: 56 },
  { id: '32', grade: 'R', color: ARC_HALL_COLOR.gen, angle: -98, radius: 255, blockW: 64, blockH: 58 },
  { id: '28', grade: 'R', color: ARC_HALL_COLOR.gen, angle: 86, radius: 150, blockW: 64, blockH: 52 },
  { id: '29', grade: 'R', color: ARC_HALL_COLOR.gen, angle: 90, radius: 185, blockW: 64, blockH: 54 },
  { id: '30', grade: 'R', color: ARC_HALL_COLOR.gen, angle: 94, radius: 220, blockW: 64, blockH: 56 },
  { id: '31', grade: 'R', color: ARC_HALL_COLOR.gen, angle: 98, radius: 255, blockW: 64, blockH: 58 },
];

function archallZoneLayout(c) {
  const gradeOf = (key) => c.grades.find((g) => g.key === key) || c.grades[c.grades.length - 1];
  return ARC_HALL_ZONES.map((z) => ({
    ...z,
    label: `${z.id}구역`,
    price: gradeOf(z.grade).price,
    seed: ARC_HALL_SEATS_PER_ZONE,
    venueType: 'archall',
  }));
}

function standingZoneLayout(c) {
  const gradeOf = (key) => c.grades.find((g) => g.key === key) || c.grades[c.grades.length - 1];
  const grade = c.grades.find((g) => g.key === 'S') || c.grades[c.grades.length - 1];
  const scale = Math.max(0.5, Math.min(2, c.totalSeats / 15000));
  const seeds = [420, 360, 385, 340].map((n) => Math.max(60, Math.round(n * scale)));
  return ['S1', 'S2', 'S3', 'S4'].map((label, i) => ({
    id: `STANDING-${label}`,
    grade: grade.key,
    label: `스탠딩 ${label}구역`,
    price: gradeOf(grade.key).price,
    seed: seeds[i],
    venueType: 'standing',
    quadrant: i, // 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right
  }));
}

export function getVenueZoneLayout(c) {
  if (c.seatingType === 'standing') return standingZoneLayout(c);
  if (c.seatingType === 'archall') return archallZoneLayout(c);
  return arenaZoneLayout(c);
}
