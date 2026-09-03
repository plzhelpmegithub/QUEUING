// Mock concert catalogue for QUEUING
// Poster art uses CSS gradients + mapped concert images for rich visual presentation.
import { OLYMPIC_HALL, OLYMPIC_HALL_FLOOR_SEAT_COUNT, OLYMPIC_HALL_INTERACTIVE_TOTAL_SEATS } from './olympicHallSeats.js';

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

// API로 생성된 포스터 공연은 grades 배열을 저장하지 않고 section별 가격만
// 저장할 수 있으므로, 올림픽홀 배치 계산에는 이 기본 등급표를 사용한다.
const OLYMPIC_HALL_DEFAULT_GRADES = [
  { key: 'VIP', name: 'VIP석', price: 198000 },
  { key: 'R', name: 'R석', price: 154000 },
  { key: 'S', name: 'S석', price: 121000 },
  { key: 'A', name: 'A석', price: 88000 },
];

export const GRADIENTS = {
  crimson: 'linear-gradient(155deg,#3a0a0d 0%, #E31B23 55%, #7a0e14 100%)',
  noir: 'linear-gradient(155deg,#101010 0%, #3a0d0f 60%, #B5121B 100%)',
  ember: 'linear-gradient(155deg,#B5121B 0%, #E31B23 45%, #1a0304 100%)',
  rose: 'linear-gradient(155deg,#7a0e14 0%, #E31B23 50%, #2b0406 100%)',
  ink: 'linear-gradient(155deg,#111111 0%, #4d0b0e 65%, #E31B23 130%)',
  wine: 'linear-gradient(155deg,#2b0406 0%, #7a0e14 55%, #E31B23 110%)',
  scarlet: 'linear-gradient(155deg,#E31B23 0%, #101010 100%)',
  garnet: 'linear-gradient(155deg,#4d0b0e 0%, #E31B23 60%, #101010 100%)',
  iceChrome: 'linear-gradient(155deg,#0a1420 0%, #2c4a63 45%, #a9c3d4 100%)',
  flameMono: 'linear-gradient(160deg,#050505 0%, #1c1c1c 45%, #8a2f22 100%)',
  stoneWarm: 'linear-gradient(155deg,#382f22 0%, #8f7a5c 55%, #e6d9c2 100%)',
  neonNight: 'linear-gradient(155deg,#14001c 0%, #6a1f72 45%, #2451c9 100%)',
  editorialRB: 'linear-gradient(160deg,#050505 0%, #050505 55%, #c81e2c 120%)',
  galaxyPurple: 'linear-gradient(155deg,#0a0515 0%, #2d1854 45%, #6b3fa0 100%)',
  pinkNoir: 'linear-gradient(155deg,#120010 0%, #4a0033 55%, #ff1493 100%)',
  royalNavy: 'linear-gradient(155deg,#0a1628 0%, #1a3a5c 50%, #c9a84c 100%)',
  amberNight: 'linear-gradient(155deg,#1a0f00 0%, #8b5e3c 50%, #0a1932 100%)',
  burgundyGold: 'linear-gradient(155deg,#2d0a14 0%, #7a0e28 50%, #c9a84c 100%)',
};

const ARTIST_POSTERS = {
  'BTS': '/images/posters/poster-bts.png',
  'BLACKPINK': '/images/posters/poster-blackpink.png',
  'SEVENTEEN': '/images/posters/poster-seventeen.png',
  'NewJeans': '/images/posters/poster-newjeans.png',
  'IVE': '/images/posters/poster-ive.png',
  'aespa': '/images/posters/poster-aespa.png',
  'TWICE': '/images/posters/poster-twice.png',
  'EXO': '/images/posters/poster-exo.png',
  'Stray Kids': '/images/posters/poster-straykids.png',
  'NCT DREAM': '/images/posters/poster-nctdream.png',
  '(G)I-DLE': '/images/posters/poster-gidle.png',
  'LE SSERAFIM': '/images/posters/poster-lesserafim.png',
  'RIIZE': '/images/posters/poster-riize.png',
  'Red Velvet': '/images/posters/poster-redvelvet.png',
  'TXT': '/images/posters/poster-txt.png',
  'IU': '/images/posters/poster-iu.png',
  '박효신': '/images/posters/poster-parkhyoshin.png',
  '성시경': '/images/posters/poster-sungsikyung.png',
  'TAEYEON': '/images/posters/poster-taeyeon.png',
  '윤하': '/images/posters/poster-younha.png',
  'AILEE': '/images/posters/poster-ailee.png',
  '김범수': '/images/posters/poster-kimbumsu.png',
  '이승철': '/images/posters/poster-leeseungchul.png',
  'Heize': '/images/posters/poster-heize.png',
  'ZICO': '/images/posters/poster-zico.png',
  '임영웅': '/images/posters/poster-limyoungwoong.png',
  '송가인': '/images/posters/poster-songgain.png',
  '영탁': '/images/posters/poster-youngtak.png',
  '이찬원': '/images/posters/poster-leechanwon.png',
  '장윤정': '/images/posters/poster-jangyunjeong.png',
  'AKMU': '/images/posters/poster-akmu.png',
  '이적': '/images/posters/poster-leejuck.png',
  '백예린': '/images/posters/poster-baekyerin.png',
  '선우정아': '/images/posters/poster-sunwoojunga.png',
  '폴킴': '/images/posters/poster-paulkim.png',
  'YB': '/images/posters/poster-yb.png',
  '자우림': '/images/posters/poster-jaurim.png',
  'DAY6': '/images/posters/poster-day6.png',
  '잔나비': '/images/posters/poster-jannabi.png',
  'NELL': '/images/posters/poster-nell.png',
};

const CONCERT_IMAGES = [
  '/images/posters/poster-bts.png',
  '/images/posters/poster-blackpink.png',
  '/images/posters/poster-seventeen.png',
  '/images/posters/poster-newjeans.png',
  '/images/posters/poster-ive.png',
  '/images/posters/poster-aespa.png',
  '/images/posters/poster-twice.png',
  '/images/posters/poster-exo.png',
  '/images/posters/poster-straykids.png',
  '/images/posters/poster-nctdream.png',
  '/images/posters/poster-gidle.png',
  '/images/posters/poster-lesserafim.png',
  '/images/posters/poster-riize.png',
  '/images/posters/poster-redvelvet.png',
  '/images/posters/poster-txt.png',
  '/images/posters/poster-iu.png',
  '/images/posters/poster-parkhyoshin.png',
  '/images/posters/poster-sungsikyung.png',
  '/images/posters/poster-taeyeon.png',
  '/images/posters/poster-younha.png',
  '/images/posters/poster-ailee.png',
  '/images/posters/poster-kimbumsu.png',
  '/images/posters/poster-leeseungchul.png',
  '/images/posters/poster-heize.png',
  '/images/posters/poster-zico.png',
  '/images/posters/poster-limyoungwoong.png',
  '/images/posters/poster-songgain.png',
  '/images/posters/poster-youngtak.png',
  '/images/posters/poster-leechanwon.png',
  '/images/posters/poster-jangyunjeong.png',
  '/images/posters/poster-akmu.png',
  '/images/posters/poster-leejuck.png',
  '/images/posters/poster-baekyerin.png',
  '/images/posters/poster-sunwoojunga.png',
  '/images/posters/poster-paulkim.png',
  '/images/posters/poster-yb.png',
  '/images/posters/poster-jaurim.png',
  '/images/posters/poster-day6.png',
  '/images/posters/poster-jannabi.png',
  '/images/posters/poster-nell.png',
];

export function getConcertImage(nameOrId) {
  if (!nameOrId) return CONCERT_IMAGES[0];
  const str = String(nameOrId);
  for (const [artist, url] of Object.entries(ARTIST_POSTERS)) {
    if (str.includes(artist) || str.toLowerCase().includes(artist.toLowerCase())) return url;
  }
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  return CONCERT_IMAGES[Math.abs(hash) % CONCERT_IMAGES.length];
}

export const CONCERTS = [
  {
    id: 'bts-2027-eternal',
    artist: 'BTS',
    title: '2027 WORLD TOUR [BEYOND THE SCENE : ETERNAL]',
    dateStart: iso(addDays(NOW, 9)),
    dateEnd: iso(addDays(NOW, 10)),
    venue: '올림픽주경기장',
    totalSeats: 40000,
    grad: GRADIENTS.galaxyPurple,
    bookingOpenAt: iso(new Date(Date.now() + 40 * 1000)),
    grades: [
      { key: 'VIP', name: 'VIP석', price: 220000 },
      { key: 'R', name: 'R석', price: 176000 },
      { key: 'S', name: 'S석', price: 143000 },
      { key: 'A', name: 'A석', price: 99000 },
    ],
    desc: '방탄소년단 BTS의 2027년 월드투어 서울 공연. 7명의 멤버가 함께하는 역대급 스타디움 투어.',
    hot: true,
    views: 312504,
  },
  {
    id: 'iu-2027-goldenhour',
    artist: 'IU',
    title: '2027 CONCERT [THE GOLDEN HOUR : CURTAIN CALL]',
    dateStart: iso(addDays(NOW, -2)),
    dateEnd: iso(addDays(NOW, -1)),
    venue: '올림픽주경기장',
    totalSeats: 30000,
    grad: GRADIENTS.neonNight,
    bookingOpenAt: iso(addDays(NOW, -10)),
    grades: [
      { key: 'VIP', name: 'VIP석', price: 198000 },
      { key: 'R', name: 'R석', price: 154000 },
      { key: 'S', name: 'S석', price: 121000 },
      { key: 'A', name: 'A석', price: 88000 },
    ],
    desc: '솔로 아티스트 IU의 단독 콘서트. 황금빛 조명 아래 펼쳐지는 감동적인 무대.',
    hot: true,
    views: 267891,
  },
  {
    id: 'skz-2026-unchained',
    artist: 'Stray Kids',
    title: '2026 WORLD TOUR [THUNDEROUS : UNCHAINED]',
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
    id: 'aespa-2027-synkhorizon',
    artist: 'aespa',
    title: '2027 WORLD TOUR [SUPERNOVA : SYNK HORIZON]',
    dateStart: iso(addDays(NOW, 21)),
    dateEnd: iso(addDays(NOW, 22)),
    venue: '고척스카이돔',
    totalSeats: 20000,
    grad: GRADIENTS.iceChrome,
    bookingOpenAt: iso(addDays(NOW, 6)),
    grades: [
      { key: 'VIP', name: 'VIP석', price: 176000 },
      { key: 'R', name: 'R석', price: 143000 },
      { key: 'S', name: 'S석', price: 110000 },
      { key: 'A', name: 'A석', price: 77000 },
    ],
    desc: 'aespa의 SYNK HORIZON 투어. 메타버스 세계관을 담은 미래형 무대.',
    hot: true,
    views: 178423,
    seatingType: 'archall',
  },
  {
    id: 'twice-2027-oncemore',
    artist: 'TWICE',
    title: '2027 WORLD TOUR [FEEL SPECIAL : ONCE MORE]',
    dateStart: iso(addDays(NOW, 30)),
    dateEnd: iso(addDays(NOW, 31)),
    venue: '올림픽주경기장',
    totalSeats: 30000,
    grad: GRADIENTS.rose,
    bookingOpenAt: iso(addDays(NOW, 12)),
    grades: [
      { key: 'VIP', name: 'VIP석', price: 187000 },
      { key: 'R', name: 'R석', price: 154000 },
      { key: 'S', name: 'S석', price: 121000 },
      { key: 'A', name: 'A석', price: 88000 },
    ],
    desc: 'TWICE의 ONCE와 함께하는 스페셜 월드투어 서울 공연.',
    hot: true,
    views: 156730,
  },
  {
    id: 'bp-2027-finale',
    artist: 'BLACKPINK',
    title: '2027 WORLD TOUR [PINK VENOM : THE FINALE]',
    dateStart: iso(addDays(NOW, 15)),
    dateEnd: iso(addDays(NOW, 16)),
    venue: '올림픽주경기장',
    totalSeats: 35000,
    grad: GRADIENTS.pinkNoir,
    bookingOpenAt: iso(addDays(NOW, -1)),
    grades: [
      { key: 'VIP', name: 'VIP석', price: 210000 },
      { key: 'R', name: 'R석', price: 165000 },
      { key: 'S', name: 'S석', price: 132000 },
      { key: 'A', name: 'A석', price: 95000 },
    ],
    desc: 'BLACKPINK의 FINALE 월드투어. 4인 4색 퍼포먼스와 히트곡 총집합.',
    hot: true,
    views: 298104,
  },
  {
    id: 'lsf-2027-fearless',
    artist: 'LE SSERAFIM',
    title: '2027 WORLD TOUR [FEARLESS : FLAME RISES]',
    dateStart: iso(addDays(NOW, -1)),
    dateEnd: iso(addDays(NOW, -1)),
    venue: 'KSPO DOME',
    totalSeats: 6000,
    grad: GRADIENTS.flameMono,
    bookingOpenAt: iso(addDays(NOW, -20)),
    grades: [
      { key: 'VIP', name: 'VIP석', price: 165000 },
      { key: 'R', name: 'R석', price: 132000 },
      { key: 'S', name: 'S석', price: 99000 },
      { key: 'A', name: 'A석', price: 66000 },
    ],
    desc: 'LE SSERAFIM의 소규모 스페셜 단독 공연. 전석 매진으로 취소표 대기열 운영 중.',
    hot: true,
    forceSoldOut: true,
    views: 209981,
    seatingType: 'standing',
  },
  {
    id: 'nj-2027-dreaming',
    artist: 'NewJeans',
    title: '2027 FAN CONCERT [OMG : SUMMER DREAMING]',
    dateStart: iso(addDays(NOW, 45)),
    dateEnd: iso(addDays(NOW, 46)),
    venue: 'KSPO DOME',
    totalSeats: 18000,
    grad: GRADIENTS.crimson,
    bookingOpenAt: iso(addDays(NOW, 25)),
    grades: [
      { key: 'VIP', name: 'VIP석', price: 165000 },
      { key: 'R', name: 'R석', price: 132000 },
      { key: 'S', name: 'S석', price: 99000 },
      { key: 'A', name: 'A석', price: 71500 },
    ],
    desc: 'NewJeans의 팬콘서트. 버니들과 함께하는 특별한 여름 무대.',
    hot: false,
    views: 89210,
  },
  {
    id: 'svt-2026-diamond',
    artist: 'SEVENTEEN',
    title: '2026 WORLD TOUR [DIAMOND EDGE : REBORN]',
    dateStart: iso(addDays(NOW, 14)),
    dateEnd: iso(addDays(NOW, 15)),
    venue: 'KSPO DOME',
    totalSeats: 28000,
    grad: GRADIENTS.stoneWarm,
    bookingOpenAt: iso(new Date(Date.now() + 2 * 60 * 1000)),
    grades: [
      { key: 'VIP', name: 'VIP석', price: 198000 },
      { key: 'R', name: 'R석', price: 154000 },
      { key: 'S', name: 'S석', price: 121000 },
      { key: 'A', name: 'A석', price: 85000 },
    ],
    desc: 'SEVENTEEN의 DIAMOND EDGE : REBORN 월드투어. 13인조 퍼포먼스의 정점.',
    hot: true,
    views: 187302,
    zoneScaleOverride: 0.001,
  },
  {
    id: 'lyw-2027-legend',
    artist: '임영웅',
    title: '2027 전국투어 [IM HERO : LEGEND TOUR]',
    dateStart: iso(addDays(NOW, 50)),
    dateEnd: iso(addDays(NOW, 51)),
    venue: '올림픽주경기장',
    totalSeats: 35000,
    grad: GRADIENTS.royalNavy,
    bookingOpenAt: iso(addDays(NOW, 20)),
    grades: [
      { key: 'VIP', name: 'VIP석', price: 176000 },
      { key: 'R', name: 'R석', price: 143000 },
      { key: 'S', name: 'S석', price: 110000 },
      { key: 'A', name: 'A석', price: 77000 },
    ],
    desc: '임영웅의 전국투어 서울 공연. 대한민국을 대표하는 히어로의 감동 무대.',
    hot: true,
    views: 245109,
  },
  {
    id: 'day6-2026-forever',
    artist: 'DAY6',
    title: '2026 CONCERT [한 페이지가 될 수 있게 : FOREVER YOUNG]',
    dateStart: iso(addDays(NOW, 7)),
    dateEnd: iso(addDays(NOW, 8)),
    venue: 'KSPO DOME',
    totalSeats: 15000,
    grad: GRADIENTS.amberNight,
    bookingOpenAt: iso(addDays(NOW, -3)),
    grades: [
      { key: 'VIP', name: 'VIP석', price: 143000 },
      { key: 'R', name: 'R석', price: 110000 },
      { key: 'S', name: 'S석', price: 88000 },
      { key: 'A', name: 'A석', price: 66000 },
    ],
    desc: 'DAY6의 감성 콘서트. 밴드 사운드와 함께하는 잊을 수 없는 페이지.',
    hot: false,
    views: 92143,
  },
  {
    id: 'ive-2026-crown',
    artist: 'IVE',
    title: '2026 CONCERT [AFTER LIKE : THE CROWN]',
    dateStart: iso(addDays(NOW, 18)),
    dateEnd: iso(addDays(NOW, 19)),
    venue: 'KSPO DOME',
    totalSeats: 20000,
    grad: GRADIENTS.burgundyGold,
    bookingOpenAt: iso(addDays(NOW, 4)),
    grades: [
      { key: 'VIP', name: 'VIP석', price: 176000 },
      { key: 'R', name: 'R석', price: 143000 },
      { key: 'S', name: 'S석', price: 110000 },
      { key: 'A', name: 'A석', price: 77000 },
    ],
    desc: 'IVE의 THE CROWN 콘서트. 자신감 넘치는 퍼포먼스와 화려한 왕관 컨셉.',
    hot: true,
    views: 167432,
  },
  {
    id: 'aespa-2027-synk',
    artist: 'aespa',
    title: '2027 LIVE TOUR [MY WORLD : SYNK]',
    dateStart: iso(addDays(NOW, 14)),
    dateEnd: iso(addDays(NOW, 15)),
    venue: '올림픽홀',
    // 올림픽홀 CSV 좌석(A1~I3) + Floor석을 포함한 총 좌석 수
    totalSeats: OLYMPIC_HALL_INTERACTIVE_TOTAL_SEATS,
    grad: GRADIENTS.neonNight,
    bookingOpenAt: iso(new Date(Date.now() + 30 * 1000)),
    grades: [
      { key: 'VIP', name: 'VIP석', price: 198000 },
      { key: 'R', name: 'R석', price: 154000 },
      { key: 'S', name: 'S석', price: 121000 },
      { key: 'A', name: 'A석', price: 88000 },
    ],
    desc: 'aespa의 올림픽홀 단독 콘서트. MY WORLD 세계관의 완결 라이브.',
    hot: true,
    views: 198234,
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

export function formatStoredSessions(storedSessions) {
  if (!Array.isArray(storedSessions) || storedSessions.length === 0) return null;
  return storedSessions.map((s) => {
    const dt = new Date(s.date + 'T00:00:00');
    const dw = WEEKDAYS_KR[dt.getDay()];
    const shortLabel = `${dt.getMonth() + 1}.${String(dt.getDate()).padStart(2, '0')} (${dw})`;
    return { date: s.date, time: s.time, label: `${shortLabel} 1회 ${s.time}`, shortLabel, round: 1 };
  });
}

export function generateEventSessions(eventDate) {
  if (!eventDate) return [];
  const base = eventDate.includes('T') ? eventDate.split('T')[0] : eventDate;
  const [y, m, d] = base.split('-').map(Number);
  const baseDate = new Date(y, m - 1, d);

  function fmt(dt) {
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
  function lbl(dt) {
    const dw = WEEKDAYS_KR[dt.getDay()];
    return `${dt.getMonth() + 1}.${String(dt.getDate()).padStart(2, '0')} (${dw})`;
  }

  const hash = (y * 10000 + m * 100 + d) % 3;
  const dayCount = 2 + hash;
  const timeOptions = ['14:00', '17:00', '19:00'];
  const sessions = [];

  for (let i = 0; i < dayCount; i++) {
    const dt = new Date(baseDate);
    dt.setDate(dt.getDate() + i);
    const dateStr = fmt(dt);
    const dateLabel = lbl(dt);
    const time = timeOptions[(d + i) % timeOptions.length];
    sessions.push(
      { date: dateStr, time, label: `${dateLabel} 1회 ${time}`, shortLabel: dateLabel, round: 1 },
    );
  }
  return sessions;
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

function olympicHallZoneLayout(c) {
  const eventGrades = Array.isArray(c?.grades) && c.grades.length
    ? c.grades
    : OLYMPIC_HALL_DEFAULT_GRADES;
  const gradeOf = (key) => eventGrades.find((g) => g.key === key) || eventGrades[eventGrades.length - 1];
  return OLYMPIC_HALL.zones.map((z) => ({
    id: z.id,
    // zone.grade는 가격 등급으로 유지하고, 실제 좌석 section은 id를 사용한다.
    // seatSelect/seatMap이 같은 구역의 좌석만 정확히 매칭할 수 있다.
    grade: z.grade,
    label: z.name,
    seed: z.id === 'Floor' ? OLYMPIC_HALL_FLOOR_SEAT_COUNT : z.seats.length,
    price: gradeOf(z.grade)?.price || c.price || 0,
    venueType: 'olympichall',
  }));
}

export function getVenueZoneLayout(c) {
  if (c.venue === '올림픽홀') return olympicHallZoneLayout(c);
  if (c.seatingType === 'standing') return standingZoneLayout(c);
  if (c.seatingType === 'archall') return archallZoneLayout(c);
  return arenaZoneLayout(c);
}

// 공연 정보에 표시할 가격을 좌석 구역명이 아닌 티켓 등급별로 묶는다.
// 올림픽홀 API 데이터는 실제 구역명(A1, B1...)을 section.name으로 저장하므로,
// 로컬 좌석 배치의 등급 정보와 연결해 VIP/R/S/A 가격표로 변환한다.
export function getTicketPriceRows(c) {
  const sections = Array.isArray(c?.sections) ? c.sections : [];
  const zoneById = c?.venue === '올림픽홀'
    ? new Map(getVenueZoneLayout(c).map((zone) => [zone.id, zone]))
    : new Map();
  const rows = new Map();

  sections.forEach((section) => {
    const sectionId = section.id || section.name;
    const zone = zoneById.get(sectionId);
    const rawGrade = section.grade || zone?.grade || section.label || section.name;
    const grade = String(rawGrade || '').replace(/석$/, '').trim();
    if (!grade || rows.has(grade)) return;

    const price = Number(section.price ?? zone?.price ?? c?.price ?? 0);
    rows.set(grade, Number.isFinite(price) ? price : 0);
  });

  if (!rows.size && c?.price != null) {
    rows.set('일반', Number(c.price) || 0);
  }

  const gradeOrder = ['VIP', 'R', 'S', 'A'];
  return [...rows.entries()]
    .sort(([a], [b]) => {
      const aIndex = gradeOrder.indexOf(a);
      const bIndex = gradeOrder.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b, 'ko');
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    })
    .map(([grade, price]) => ({ grade, price }));
}
