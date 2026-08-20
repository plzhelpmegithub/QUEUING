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
    ],
    desc: 'aespa의 새로운 세계관을 담은 신규 투어. MY & 아이-공동체와 함께.',
    hot: true,
    views: 165410,
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
    ],
    desc: 'ATEEZ의 트레저 시리즈를 마무리하는 에필로그 공연.',
    hot: false,
    views: 88123,
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
    ],
    desc: 'LE SSERAFIM의 소규모 스페셜 단독 공연. 이미 전석 매진되어 취소표 대기열이 운영중입니다.',
    hot: true,
    forceSoldOut: true,
    views: 209981,
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
    ],
    desc: 'ENHYPEN의 2026년 신규 월드투어. 팬들과 함께 만드는 궤도 위의 무대.',
    hot: true,
    views: 156301,
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
