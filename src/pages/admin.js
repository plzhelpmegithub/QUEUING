import { CONCERTS } from '../data/concerts.js';
import { OLYMPIC_HALL, OLYMPIC_HALL_FLOOR_SEAT_COUNT } from '../data/olympicHallSeats.js';
import { isAdmin, isLoggedIn } from '../state/store.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { formatDeadline } from '../utils/format.js';
import { authHeaders } from '../utils/authToken.js';

function authFetch(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: { ...(options.headers || {}), ...authHeaders() },
  });
}

// 일반 공연의 기본 등급/가격 입력값. 올림픽홀은 아래 CSV 구역별 생성값을 사용한다.
const GRADE_DEFAULTS = [
  { key: 'VIP', seats: 20, price: 180000 },
  { key: 'R', seats: 50, price: 140000 },
  { key: 'S', seats: 80, price: 110000 },
  { key: 'A', seats: 100, price: 80000 },
];

const OLYMPIC_HALL_GRADE_SEATS = OLYMPIC_HALL.zones.reduce((totals, zone) => {
  const count = zone.id === 'Floor' ? OLYMPIC_HALL_FLOOR_SEAT_COUNT : zone.seats.length;
  totals[zone.grade] = (totals[zone.grade] || 0) + count;
  return totals;
}, {});

function createEventGradeRowHtml(g) {
  const seatCount = OLYMPIC_HALL_GRADE_SEATS[g.key] || g.seats;
  return `
    <tr data-grade-row="${g.key}">
      <td><b>${g.key}</b></td>
      <td><input type="number" min="0" data-grade-seats="${g.key}" value="${seatCount}" style="width:90px;" disabled /></td>
      <td><input type="number" min="0" step="1000" data-grade-price="${g.key}" value="${g.price}" style="width:120px;" /></td>
    </tr>
  `;
}

function createEvent(payload) {
  return authFetch('/event/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((res) => res.json());
}

// "포스터 공연 생성" 버튼용 — 40명 아티스트 포스터 데이터에서
// 순서대로 순환하며 공연 생성. 좌석수/가격은 GRADE_DEFAULTS를 기준으로 ±로 흔들어 다양성만 줌.
const RANDOM_ARTISTS = [
  'BTS', 'BLACKPINK', 'SEVENTEEN', 'NewJeans', 'IVE', 'aespa', 'TWICE', 'EXO',
  'Stray Kids', 'NCT DREAM', '(G)I-DLE', 'LE SSERAFIM', 'RIIZE', 'Red Velvet', 'TXT',
  'IU', '박효신', '성시경', 'TAEYEON', '윤하', 'AILEE', '김범수', '이승철', 'Heize', 'ZICO',
  '임영웅', '송가인', '영탁', '이찬원', '장윤정',
  'AKMU', '이적', '백예린', '선우정아', '폴킴',
  'YB', '자우림', 'DAY6', '잔나비', 'NELL',
];

// 포스터 기반 공연 데이터 — 날짜순 정렬. 포스터 공연 생성 버튼이 순서대로 순환하며 생성.
const POSTER_CONCERTS = [
  { artist: 'AKMU', eventName: 'AKMU 2026 CONCERT [사춘기 : SAILING HOME]', eventDate: '2026-11-01', venue: '올림픽홀', sessions: [{ date: '2026-11-01', time: '19:00' }, { date: '2026-11-02', time: '18:00' }] },
  { artist: '윤하', eventName: '윤하 2026 CONCERT [STARDUST : EVENT HORIZON]', eventDate: '2026-11-08', venue: '올림픽홀', sessions: [{ date: '2026-11-08', time: '19:00' }] },
  { artist: 'Stray Kids', eventName: 'Stray Kids 2026 WORLD TOUR [THUNDEROUS : UNCHAINED]', eventDate: '2026-11-14', venue: '올림픽홀', sessions: [{ date: '2026-11-14', time: '18:00' }, { date: '2026-11-15', time: '17:00' }] },
  { artist: 'RIIZE', eventName: 'RIIZE 2026 FAN CONCERT [GET A GUITAR : FIRST LIGHT]', eventDate: '2026-11-22', venue: '올림픽홀', sessions: [{ date: '2026-11-22', time: '18:00' }, { date: '2026-11-23', time: '17:00' }] },
  { artist: 'IVE', eventName: 'IVE 2026 CONCERT [AFTER LIKE : THE CROWN]', eventDate: '2026-11-28', venue: '올림픽홀', sessions: [{ date: '2026-11-28', time: '18:00' }, { date: '2026-11-29', time: '17:00' }] },
  { artist: 'DAY6', eventName: 'DAY6 2026 CONCERT [한 페이지가 될 수 있게 : FOREVER YOUNG]', eventDate: '2026-11-29', venue: '올림픽홀', sessions: [{ date: '2026-11-29', time: '18:00' }, { date: '2026-11-30', time: '17:00' }] },
  { artist: '(G)I-DLE', eventName: '(G)I-DLE 2026 WORLD TOUR [SUPER LADY : QUEENDOM]', eventDate: '2026-12-05', venue: '올림픽홀', sessions: [{ date: '2026-12-05', time: '18:00' }, { date: '2026-12-06', time: '17:00' }] },
  { artist: 'TXT', eventName: 'TOMORROW X TOGETHER 2026 WORLD TOUR [STAR SEEKERS : ACT TWO]', eventDate: '2026-12-12', venue: '올림픽홀', sessions: [{ date: '2026-12-12', time: '18:00' }, { date: '2026-12-13', time: '17:00' }] },
  { artist: 'SEVENTEEN', eventName: 'SEVENTEEN 2026 WORLD TOUR [DIAMOND EDGE : REBORN]', eventDate: '2026-12-19', venue: '올림픽홀', sessions: [{ date: '2026-12-19', time: '18:00' }, { date: '2026-12-20', time: '17:00' }] },
  { artist: '백예린', eventName: '백예린 2026 CONCERT [Square : INDIE NIGHT]', eventDate: '2026-12-25', venue: '올림픽홀', sessions: [{ date: '2026-12-25', time: '19:00' }] },
  { artist: 'Heize', eventName: 'Heize 2026 CONCERT [HAPPEN IN WINTER]', eventDate: '2026-12-26', venue: '올림픽홀', sessions: [{ date: '2026-12-26', time: '20:00' }] },
  { artist: '성시경', eventName: '성시경 2026 연말콘서트 [두 사람 : YEAR-END BALLAD NIGHT]', eventDate: '2026-12-31', venue: '올림픽홀', sessions: [{ date: '2026-12-31', time: '20:00' }] },
  { artist: '이적', eventName: '이적 2027 CONCERT [하늘을 달리다 : VOICE OF A GENERATION]', eventDate: '2027-01-03', venue: '올림픽홀', sessions: [{ date: '2027-01-03', time: '19:00' }] },
  { artist: 'NewJeans', eventName: 'NewJeans 2027 FAN CONCERT [OMG : SUMMER DREAMING]', eventDate: '2027-01-10', venue: '올림픽홀', sessions: [{ date: '2027-01-10', time: '18:00' }, { date: '2027-01-11', time: '17:00' }] },
  { artist: 'BLACKPINK', eventName: 'BLACKPINK 2027 WORLD TOUR [PINK VENOM : THE FINALE]', eventDate: '2027-01-17', venue: '올림픽홀', sessions: [{ date: '2027-01-17', time: '18:00' }, { date: '2027-01-18', time: '17:00' }] },
  { artist: '박효신', eventName: '박효신 2027 CONCERT [SOULS AND SONGS]', eventDate: '2027-01-24', venue: '올림픽홀', sessions: [{ date: '2027-01-24', time: '19:00' }, { date: '2027-01-25', time: '18:00' }] },
  { artist: 'NCT DREAM', eventName: 'NCT DREAM 2027 CONCERT [THE DREAM SHOW 4 : WONDERLAND]', eventDate: '2027-01-31', venue: '올림픽홀', sessions: [{ date: '2027-01-31', time: '18:00' }, { date: '2027-02-01', time: '17:00' }] },
  { artist: 'TAEYEON', eventName: 'TAEYEON 2027 CONCERT [ONCE UPON A TIME]', eventDate: '2027-02-07', venue: '올림픽홀', sessions: [{ date: '2027-02-07', time: '18:00' }, { date: '2027-02-08', time: '17:00' }] },
  { artist: 'aespa', eventName: 'aespa 2027 WORLD TOUR [SUPERNOVA : SYNK HORIZON]', eventDate: '2027-02-14', venue: '올림픽홀', sessions: [{ date: '2027-02-14', time: '18:00' }, { date: '2027-02-15', time: '17:00' }] },
  { artist: '자우림', eventName: '자우림 2027 CONCERT [스물다섯, 스물하나 : TIMELESS ECHOES]', eventDate: '2027-02-15', venue: '올림픽홀', sessions: [{ date: '2027-02-15', time: '19:00' }] },
  { artist: 'ZICO', eventName: 'ZICO 2027 CONCERT [SPOT! : KING OF THE JUNGLE]', eventDate: '2027-02-22', venue: '올림픽홀', sessions: [{ date: '2027-02-22', time: '19:00' }] },
  { artist: 'LE SSERAFIM', eventName: 'LE SSERAFIM 2027 WORLD TOUR [FEARLESS : FLAME RISES]', eventDate: '2027-02-28', venue: '올림픽홀', sessions: [{ date: '2027-02-28', time: '18:00' }, { date: '2027-03-01', time: '17:00' }] },
  { artist: 'BTS', eventName: 'BTS 2027 WORLD TOUR [BEYOND THE SCENE : ETERNAL]', eventDate: '2027-03-01', venue: '올림픽홀', sessions: [{ date: '2027-03-01', time: '18:00' }, { date: '2027-03-02', time: '17:00' }] },
  { artist: 'AILEE', eventName: 'AILEE 2027 CONCERT [I WILL SHOW YOU : THE POWERHOUSE]', eventDate: '2027-03-08', venue: '올림픽홀', sessions: [{ date: '2027-03-08', time: '19:00' }] },
  { artist: 'IU', eventName: 'IU 2027 CONCERT [THE GOLDEN HOUR : CURTAIN CALL]', eventDate: '2027-03-14', venue: '올림픽홀', sessions: [{ date: '2027-03-14', time: '18:00' }, { date: '2027-03-15', time: '17:00' }] },
  { artist: '잔나비', eventName: '잔나비 2027 CONCERT [주저하는 연인들을 위해 : MONKEY CINEMA]', eventDate: '2027-03-15', venue: '올림픽홀', sessions: [{ date: '2027-03-15', time: '19:00' }] },
  { artist: 'EXO', eventName: 'EXO 2027 CONCERT [EXO PLANET #6 : CHRONICLE]', eventDate: '2027-03-22', venue: '올림픽홀', sessions: [{ date: '2027-03-22', time: '18:00' }, { date: '2027-03-23', time: '17:00' }] },
  { artist: '영탁', eventName: '영탁 2027 CONCERT [찐이야 : ALL-IN LIVE]', eventDate: '2027-03-29', venue: '올림픽홀', sessions: [{ date: '2027-03-29', time: '18:00' }] },
  { artist: '폴킴', eventName: '폴킴 2027 CONCERT [비 : EVERY DAY EVERY MOMENT]', eventDate: '2027-04-05', venue: '올림픽홀', sessions: [{ date: '2027-04-05', time: '19:00' }] },
  { artist: 'TWICE', eventName: 'TWICE 2027 WORLD TOUR [FEEL SPECIAL : ONCE MORE]', eventDate: '2027-04-05', venue: '올림픽홀', sessions: [{ date: '2027-04-05', time: '18:00' }, { date: '2027-04-06', time: '17:00' }] },
  { artist: '김범수', eventName: '김범수 2027 CONCERT [보고 싶다 : A VOICE FOR ETERNITY]', eventDate: '2027-04-12', venue: '올림픽홀', sessions: [{ date: '2027-04-12', time: '19:00' }] },
  { artist: 'Red Velvet', eventName: 'Red Velvet 2027 CONCERT [CHILL KILL : THE VELVET NIGHT]', eventDate: '2027-04-19', venue: '올림픽홀', sessions: [{ date: '2027-04-19', time: '18:00' }, { date: '2027-04-20', time: '17:00' }] },
  { artist: '송가인', eventName: '송가인 2027 CONCERT [트로트의 여왕 : 꽃길만 걸으세요]', eventDate: '2027-04-26', venue: '올림픽홀', sessions: [{ date: '2027-04-26', time: '18:00' }] },
  { artist: '이승철', eventName: '이승철 2027 CONCERT [LEGEND CONTINUES]', eventDate: '2027-05-03', venue: '올림픽홀', sessions: [{ date: '2027-05-03', time: '19:00' }, { date: '2027-05-04', time: '18:00' }] },
  { artist: '임영웅', eventName: '임영웅 2027 전국투어 [IM HERO : LEGEND TOUR]', eventDate: '2027-05-10', venue: '올림픽홀', sessions: [{ date: '2027-05-10', time: '18:00' }, { date: '2027-05-11', time: '17:00' }] },
  { artist: 'YB', eventName: 'YB 2027 CONCERT [나는 나비 : ROCK NEVER DIES]', eventDate: '2027-05-17', venue: '올림픽홀', sessions: [{ date: '2027-05-17', time: '19:00' }] },
  { artist: '장윤정', eventName: '장윤정 2027 CONCERT [어머나! : TIMELESS DIVA]', eventDate: '2027-05-24', venue: '올림픽홀', sessions: [{ date: '2027-05-24', time: '18:00' }] },
  { artist: '이찬원', eventName: '이찬원 2027 CONCERT [진또배기 : YOUNG KING OF TROT]', eventDate: '2027-06-07', venue: '올림픽홀', sessions: [{ date: '2027-06-07', time: '18:00' }] },
  { artist: '선우정아', eventName: '선우정아 2027 CONCERT [도망가자 : CATHARSIS]', eventDate: '2027-06-14', venue: '올림픽홀', sessions: [{ date: '2027-06-14', time: '19:00' }] },
  { artist: 'NELL', eventName: 'NELL 2027 CONCERT [지구가 태양을 네 번 : FOUR SEASONS]', eventDate: '2027-06-21', venue: '올림픽홀', sessions: [{ date: '2027-06-21', time: '19:00' }] },
];

const RANDOM_AGENCIES = {
  'BTS': 'BIGHIT MUSIC / HYBE',
  'BLACKPINK': 'YG Entertainment',
  'SEVENTEEN': 'Pledis Entertainment / HYBE',
  'NewJeans': 'ADOR / HYBE',
  'IVE': 'Starship Entertainment',
  'aespa': 'SM Entertainment',
  'TWICE': 'JYP Entertainment',
  'EXO': 'SM Entertainment',
  'Stray Kids': 'JYP Entertainment',
  'NCT DREAM': 'SM Entertainment',
  '(G)I-DLE': 'CUBE Entertainment',
  'LE SSERAFIM': 'SOURCE MUSIC / HYBE',
  'RIIZE': 'SM Entertainment',
  'Red Velvet': 'SM Entertainment',
  'TXT': 'BIGHIT MUSIC / HYBE',
  'IU': 'EDAM Entertainment',
  '박효신': 'Glove Entertainment',
  '성시경': 'JELLYFISH Entertainment',
  'TAEYEON': 'SM Entertainment',
  '윤하': 'C9 Entertainment',
  'AILEE': 'THE L1VE',
  '김범수': 'Polaris Entertainment',
  '이승철': 'HOOK Entertainment',
  'Heize': 'P NATION',
  'ZICO': 'KOZ Entertainment',
  '임영웅': 'fish music',
  '송가인': 'POCKET DOL STUDIO',
  '영탁': 'TV 조선',
  '이찬원': 'GREEN FISH',
  '장윤정': 'K-PERFORMANCE',
  'AKMU': 'YG Entertainment',
  '이적': 'Music Farm',
  '백예린': 'Blue Vinyl',
  '선우정아': 'Magic Strawberry Sound',
  '폴킴': 'Neuron Music',
  'YB': 'Dee Company',
  '자우림': 'JAUR.M',
  'DAY6': 'JYP Entertainment',
  '잔나비': 'Peponi Music',
  'NELL': 'Space Bohemian',
};

const RANDOM_RUNTIMES = ['약 120분', '약 130분 (인터미션 포함)', '약 150분 (인터미션 20분 포함)', '약 100분', '약 180분 (인터미션 15분 포함)'];
const RANDOM_AGE_RATINGS = ['전체 관람가', '만 7세 이상 관람가', '만 12세 이상 관람가'];

const RANDOM_CAST_POOL = {
  'BTS': 'RM, JIN, SUGA, J-HOPE, JIMIN, V, JUNGKOOK',
  'BLACKPINK': 'JISOO, JENNIE, ROSÉ, LISA',
  'SEVENTEEN': 'S.COUPS, JEONGHAN, JOSHUA, JUN, HOSHI, WONWOO, WOOZI, DK, MINGYU, THE8, SEUNGKWAN, VERNON, DINO',
  'NewJeans': 'MINJI, HANNI, DANIELLE, HAERIN, HYEIN',
  'IVE': 'YUJIN, GAEUL, REI, WONYOUNG, LIZ, LEESEO',
  'aespa': 'KARINA, GISELLE, WINTER, NINGNING',
  'TWICE': 'NAYEON, JEONGYEON, MOMO, SANA, JIHYO, MINA, DAHYUN, CHAEYOUNG, TZUYU',
  'EXO': 'XIUMIN, SUHO, LAY, BAEKHYUN, CHEN, CHANYEOL, D.O., KAI, SEHUN',
  'Stray Kids': 'Bang Chan, Lee Know, Changbin, Hyunjin, HAN, Felix, Seungmin, I.N',
  'NCT DREAM': 'MARK, RENJUN, JENO, HAECHAN, JAEMIN, CHENLE, JISUNG',
  '(G)I-DLE': 'MIYEON, MINNIE, SOYEON, YUQI, SHUHUA',
  'LE SSERAFIM': 'SAKURA, KIM CHAEWON, HUH YUNJIN, KAZUHA, HONG EUNCHAE',
  'RIIZE': 'SHOTARO, EUNSEOK, SUNGCHAN, WONBIN, SEUNGHAN, SOHEE, ANTON',
  'Red Velvet': 'IRENE, SEULGI, WENDY, JOY, YERI',
  'TXT': 'SOOBIN, YEONJUN, BEOMGYU, TAEHYUN, HUENINGKAI',
  'IU': 'IU (이지은)',
  '박효신': '박효신',
  '성시경': '성시경',
  'TAEYEON': 'TAEYEON (태연)',
  '윤하': '윤하',
  'AILEE': 'AILEE (에일리)',
  '김범수': '김범수',
  '이승철': '이승철',
  'Heize': 'Heize (헤이즈)',
  'ZICO': 'ZICO (지코)',
  '임영웅': '임영웅',
  '송가인': '송가인',
  '영탁': '영탁',
  '이찬원': '이찬원',
  '장윤정': '장윤정',
  'AKMU': '이찬혁, 이수현',
  '이적': '이적',
  '백예린': '백예린',
  '선우정아': '선우정아',
  '폴킴': '폴킴',
  'YB': '윤도현, 박태희, 허준, 김진원, 스캇 할로웰',
  '자우림': '김윤아, 이선규, 김지민, 구태훈',
  'DAY6': 'Jae, Sungjin, Young K, Wonpil, Dowoon',
  '잔나비': '최정훈, 김도형',
  'NELL': '김종완, 이재경, 이정재, 정재원',
};

function generateConcertDescription(artist, tourName, venue) {
  const templates = [
    `${artist}의 ${tourName} 서울 공연이 ${venue}에서 개최됩니다. 화려한 무대 연출과 완벽한 라이브 퍼포먼스로 관객들에게 잊을 수 없는 경험을 선사합니다. 아티스트와 팬이 함께 만들어가는 특별한 시간, 놓치지 마세요.`,
    `${venue}에서 펼쳐지는 ${artist}의 대규모 공연! 히트곡 메들리부터 신곡 최초 무대까지, 오직 이 공연에서만 볼 수 있는 스페셜 세트리스트가 준비되어 있습니다. 최첨단 LED 스크린과 조명 연출이 어우러진 몰입감 넘치는 무대를 경험하세요.`,
    `${artist}가 팬들과 함께하는 ${tourName}! ${venue}의 넓은 무대를 가득 채울 역대급 스케일의 공연이 찾아옵니다. 앵콜 무대를 포함한 약 2시간의 공연 동안 최고의 퍼포먼스와 감동적인 멘트까지, 팬이라면 반드시 함께해야 할 순간입니다.`,
    `글로벌 아티스트 ${artist}의 ${tourName}이 드디어 서울에 상륙합니다. ${venue}에서 진행되는 이번 공연은 월드투어의 하이라이트로, 해외에서 먼저 검증된 완성도 높은 세트리스트와 무대 구성이 그대로 재현됩니다. 현장에서만 느낄 수 있는 압도적인 사운드와 비주얼을 직접 체험해보세요.`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateConcertNotices() {
  return [
    '본 공연은 지정좌석제로 운영됩니다.',
    '공연 시작 후 입장이 제한될 수 있습니다.',
    '촬영(사진/영상) 및 녹음은 금지됩니다.',
    '티켓 양도 및 교환은 공식 채널을 통해서만 가능합니다.',
    '공연 당일 본인 확인이 진행됩니다. 신분증을 지참해주세요.',
  ];
}

let posterCycleIdx = 0;

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildRandomEventPayload() {
  const posterData = POSTER_CONCERTS[posterCycleIdx % POSTER_CONCERTS.length];
  posterCycleIdx++;
  const artist = posterData.artist;
  const priceOf = (grade) => {
    const base = GRADE_DEFAULTS.find((item) => item.key === grade)?.price || GRADE_DEFAULTS[GRADE_DEFAULTS.length - 1].price;
    return Math.round((base * (0.85 + Math.random() * 0.3)) / 1000) * 1000;
  };
  const sections = OLYMPIC_HALL.zones.map((zone) => ({
    name: zone.id,
    seats: zone.id === 'Floor' ? OLYMPIC_HALL_FLOOR_SEAT_COUNT : zone.seats.length,
    price: priceOf(zone.grade),
  }));
  return {
    eventName: posterData.eventName,
    eventDate: posterData.eventDate,
    venue: '올림픽홀',
    seatingType: 'olympichall',
    sections,
    sessions: posterData.sessions,
    runtime: pick(RANDOM_RUNTIMES),
    ageRating: pick(RANDOM_AGE_RATINGS),
    cast: RANDOM_CAST_POOL[artist] || artist,
    agency: RANDOM_AGENCIES[artist] || 'Entertainment Corp.',
    description: generateConcertDescription(artist, posterData.eventName, posterData.venue),
    notices: generateConcertNotices(),
  };
}

// /events로 받아온 최신 목록을 캐시해둠 — 1초마다 도는 오픈 카운트다운
// 리페인트(paintOpenStatuses)가 매번 서버에 다시 물어보지 않고 이 캐시만
// 보고 배지 텍스트를 갱신하도록 하기 위함.
let eventsCache = [];

function setEventOpenTime(eventId, ticketOpenAt) {
  return authFetch(`/events/${eventId}/open-time`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketOpenAt }),
  }).then((res) => res.json());
}

function setEventCloseTime(eventId, ticketCloseAt) {
  return authFetch(`/events/${eventId}/close-time`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketCloseAt }),
  }).then((res) => res.json());
}

// 공연 목록 테이블의 "오픈/마감 상태" 셀만 매초 다시 그림
function paintOpenStatuses(container) {
  eventsCache.forEach((e) => {
    const cell = container.querySelector(`[data-open-status="${e.eventId}"]`);
    if (!cell) return;

    const openRemaining = e.ticketOpenAt ? new Date(e.ticketOpenAt).getTime() - Date.now() : 0;
    const closeRemaining = e.ticketCloseAt ? new Date(e.ticketCloseAt).getTime() - Date.now() : 0;

    if (e.ticketOpenAt && openRemaining > 0) {
      cell.innerHTML = `<span class="badge badge-orange">오픈 예정</span><div class="num-mono" style="font-size:12px;margin-top:4px;color:var(--color-text-secondary);">${formatDeadline(openRemaining)}</div>`;
      return;
    }

    if (e.ticketCloseAt && closeRemaining <= 0) {
      cell.innerHTML = `<span class="badge badge-outline">마감됨</span>`;
      return;
    }

    let html = `<span class="badge badge-green">예매중</span>`;
    if (e.ticketCloseAt && closeRemaining > 0) {
      html += `<div class="num-mono" style="font-size:11px;margin-top:4px;color:var(--color-text-secondary);">마감까지 ${formatDeadline(closeRemaining)}</div>`;
    }
    cell.innerHTML = html;
  });
}

function refreshEventsList(container) {
  const tbody = container.querySelector('[data-events-tbody]');
  if (!tbody) return;
  authFetch('/events')
    .then((res) => res.json())
    .then((data) => {
      eventsCache = data.events || [];
      const eventCount = container.querySelector('[data-admin-event-count]');
      if (eventCount) eventCount.textContent = eventsCache.length.toLocaleString();
      if (eventsCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-secondary">생성된 공연이 없습니다.</td></tr>';
        updateBulkDeleteButton(container);
        return;
      }
      tbody.innerHTML = eventsCache
        .map(
        (e, i) => `
        <tr class="admin-event-row" data-admin-row="${e.eventId}" tabindex="0">
          <td class="num-mono">${i + 1}</td>
          <td>${e.eventName}</td>
          <td>${e.eventDate || '-'}</td>
          <td>${e.venue || '-'}</td>
          <td class="seat-tip-wrap">${Number(e.totalSeats || 0).toLocaleString()}석${(e.sections || []).length ? `<span class="seat-tip">${(e.sections || []).map(s => `<span>${s.name}: ${s.seats.toLocaleString()}석</span>`).join('')}</span>` : ''}</td>
          <td data-open-status="${e.eventId}"></td>
          <td>
            <button type="button" class="btn btn-outline btn-sm" data-set-open-time="${e.eventId}">오픈 시간</button>
            <button type="button" class="btn btn-outline btn-sm" data-set-close-time="${e.eventId}">마감 시간</button>
            <button type="button" class="btn btn-outline btn-sm btn-danger-outline" data-close-now="${e.eventId}">즉시 마감</button>
            <button type="button" class="btn btn-outline btn-sm" data-delete-event="${e.eventId}">삭제</button>
          </td>
        </tr>`
        )
        .join('');
      paintOpenStatuses(container);
      updateBulkDeleteButton(container);
      tbody.querySelectorAll('[data-set-open-time]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const ev = eventsCache.find((x) => x.eventId === btn.dataset.setOpenTime);
          if (ev) openSetOpenTimeModal(ev, () => refreshEventsList(container));
        });
      });
      tbody.querySelectorAll('[data-set-close-time]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const ev = eventsCache.find((x) => x.eventId === btn.dataset.setCloseTime);
          if (ev) openSetCloseTimeModal(ev, () => refreshEventsList(container));
        });
      });
      tbody.querySelectorAll('[data-close-now]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const ev = eventsCache.find((x) => x.eventId === btn.dataset.closeNow);
          const name = ev?.eventName || btn.dataset.closeNow;
          if (!confirm(`"${name}" 공연을 즉시 마감할까요?`)) return;
          btn.disabled = true;
          const now = new Date().toISOString();
          setEventCloseTime(btn.dataset.closeNow, now)
            .then((result) => {
              if (result.error) {
                showToast({ title: '즉시 마감 실패', body: result.error });
                btn.disabled = false;
                return;
              }
              showToast({ title: `"${name}" 예매가 즉시 마감되었습니다`, type: 'success' });
              refreshEventsList(container);
            })
            .catch(() => { showToast({ title: '즉시 마감 중 오류가 발생했습니다' }); btn.disabled = false; });
        });
      });
      tbody.querySelectorAll('[data-delete-event]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const name = btn.closest('tr')?.children[1]?.textContent || '';
          if (!confirm(`"${name}" 공연을 삭제할까요? (좌석 데이터도 함께 삭제됩니다)`)) return;
          btn.disabled = true;
          authFetch(`/events/${btn.dataset.deleteEvent}`, { method: 'DELETE' })
            .then(async (res) => {
              const result = await res.json();
              if (!res.ok || !result.success) throw new Error(result.message || '삭제 실패');
              return result;
            })
            .then((result) => {
              showToast({
                title: result.dbSynced === false ? '공연은 삭제됐지만 DB 동기화 실패' : '공연이 삭제되었습니다',
                body: name,
                type: result.dbSynced === false ? 'default' : 'success',
              });
              refreshEventsList(container);
            })
            .catch((err) => {
              showToast({ title: '삭제 중 오류가 발생했습니다', body: err.message });
              btn.disabled = false;
            });
        });
      });
    })
    .catch(() => {
      tbody.innerHTML = '<tr><td colspan="7" class="text-red">목록을 불러오지 못했습니다.</td></tr>';
      updateBulkDeleteButton(container);
    });
}

function updateBulkDeleteButton(container) {
  const button = container.querySelector('[data-bulk-delete]');
  if (!button) return;
  button.disabled = eventsCache.length === 0;
  button.textContent = '5개씩 삭제';
}

async function deleteEventsSequentially(events) {
  const results = [];
  for (const event of events) {
    const response = await authFetch(`/events/${encodeURIComponent(event.eventId)}`, { method: 'DELETE' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.message || `${event.eventName} 삭제에 실패했습니다.`);
    }
    results.push(result);
  }
  return { success: true, deletedCount: results.length, results };
}

async function deleteEventsInBatch(events) {
  const response = await authFetch('/events/batch-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventIds: events.map((event) => event.eventId) }),
  });
  const result = await response.json().catch(() => ({}));

  // 운영 API가 이전 버전이면 새 배치 라우트가 없을 수 있으므로 기존 단일 삭제 API로 전환한다.
  if (response.status === 404) return deleteEventsSequentially(events);
  if (!response.ok) throw new Error(result.message || '일괄 삭제 요청에 실패했습니다.');
  return result;
}

// datetime-local input이 기대하는 "로컬시각 그대로" 문자열(YYYY-MM-DDTHH:mm:ss)로 변환
function toDatetimeLocalValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// 오픈 시간이 아직 없는 공연마다 서로 다른 기본 시각을 제공한다.
// 기존에는 모든 공연이 모달을 연 시점 기준 "5분 후"를 사용해 같은 시각으로 저장될 수 있었다.
function getDefaultOpenTimeOffsetMinutes(event) {
  const eventIndex = eventsCache.findIndex((cachedEvent) => cachedEvent.eventId === event?.eventId);
  if (eventIndex >= 0) return 5 + eventIndex;

  const eventId = String(event?.eventId || event?.eventName || 'event');
  let hash = 0;
  for (let index = 0; index < eventId.length; index += 1) {
    hash = (hash * 31 + eventId.charCodeAt(index)) | 0;
  }
  return 5 + (Math.abs(hash) % 55);
}

function getDefaultOpenTime(event) {
  return new Date(Date.now() + getDefaultOpenTimeOffsetMinutes(event) * 60000);
}

function applyOpenTime(eventId, ticketOpenAt, successTitle, onSaved, clearClose = false) {
  const openPromise = setEventOpenTime(eventId, ticketOpenAt);
  const closePromise = clearClose ? setEventCloseTime(eventId, null) : Promise.resolve(null);
  Promise.all([openPromise, closePromise])
    .then(([result]) => {
      if (result.error) {
        showToast({ title: '오픈 시간 설정 실패', body: result.error });
        return;
      }
      showToast({ title: successTitle, body: result.message, type: 'success' });
      closeModal();
      onSaved?.();
    })
    .catch(() => showToast({ title: '오픈 시간 설정 중 오류가 발생했습니다' }));
}

// 관리자가 특정 공연의 예매 오픈 시각을 직접 지정 — 유저 페이지(concertDetail.js)의
// "예매 오픈까지 남은 시간" 카운트다운을 재배포 없이 즉시 테스트할 수 있게 해줌.
// 프리셋 버튼은 클릭 한 번으로 바로 저장까지 되도록 해서(모달을 다시 안 열어도 됨)
// 반복 테스트가 빠르게 되도록 함.
function openSetOpenTimeModal(event, onSaved) {
  const defaultOffsetMinutes = getDefaultOpenTimeOffsetMinutes(event);
  const prefill = event.ticketOpenAt
    ? toDatetimeLocalValue(new Date(event.ticketOpenAt))
    : toDatetimeLocalValue(getDefaultOpenTime(event));

  openModal({
    title: `예매 오픈 시간 설정 — ${event.eventName}`,
    bodyHtml: `
      <div class="field">
        <label>예매 오픈 일시</label>
        <input type="datetime-local" step="1" data-open-time-input value="${prefill}" />
        ${event.ticketOpenAt ? '' : `<small class="field-help">기본값은 공연별로 ${defaultOffsetMinutes}분 후로 다르게 설정됩니다.</small>`}
      </div>
      <div class="field" style="margin-bottom:0;">
        <label>빠른 설정 (테스트용 — 클릭 즉시 저장)</label>
        <div class="chip-row">
          <button type="button" class="chip-btn" data-quick-preset="now">지금 바로 오픈</button>
          <button type="button" class="chip-btn" data-quick-preset="10s">10초 후 오픈</button>
          <button type="button" class="chip-btn" data-quick-preset="1m">1분 후 오픈</button>
          <button type="button" class="chip-btn" data-quick-preset="10m">10분 후 오픈</button>
        </div>
      </div>
      ${event.ticketOpenAt ? `<p class="policy-note mt-16">현재 설정: ${new Date(event.ticketOpenAt).toLocaleString('ko-KR')}</p>` : ''}
    `,
    footerHtml: `
      <button type="button" class="btn btn-outline" data-modal-close>취소</button>
      <button type="button" class="btn btn-outline" data-clear-open-time>오픈 제한 해제</button>
      <button type="button" class="btn btn-primary" data-save-open-time>저장</button>
    `,
  });

  const input = document.querySelector('[data-open-time-input]');

  document.querySelectorAll('[data-quick-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.quickPreset;
      if (preset === 'now') {
        applyOpenTime(event.eventId, null, '예매가 즉시 오픈으로 설정되었습니다', onSaved, true);
        return;
      }
      const deltaMs = { '10s': 10000, '1m': 60000, '10m': 600000 }[preset] || 0;
      const target = new Date(Date.now() + deltaMs);
      input.value = toDatetimeLocalValue(target);
      applyOpenTime(event.eventId, target.toISOString(), `오픈 시간이 "${btn.textContent}"(으)로 설정되었습니다`, onSaved);
    });
  });

  document.querySelector('[data-clear-open-time]').addEventListener('click', () => {
    applyOpenTime(event.eventId, null, '오픈 시간 제한이 해제되었습니다', onSaved, true);
  });

  document.querySelector('[data-save-open-time]').addEventListener('click', () => {
    if (!input.value) {
      showToast({ title: '오픈 일시를 입력해주세요' });
      return;
    }
    const target = new Date(input.value);
    if (Number.isNaN(target.getTime())) {
      showToast({ title: '올바른 날짜/시간을 입력해주세요' });
      return;
    }
    applyOpenTime(event.eventId, target.toISOString(), '오픈 시간이 설정되었습니다', onSaved);
  });
}

function applyCloseTime(eventId, ticketCloseAt, successTitle, onSaved) {
  setEventCloseTime(eventId, ticketCloseAt)
    .then((result) => {
      if (result.error) {
        showToast({ title: '마감 시간 설정 실패', body: result.error });
        return;
      }
      showToast({ title: successTitle, body: result.message, type: 'success' });
      closeModal();
      onSaved?.();
    })
    .catch(() => showToast({ title: '마감 시간 설정 중 오류가 발생했습니다' }));
}

function openSetCloseTimeModal(event, onSaved) {
  const prefill = event.ticketCloseAt
    ? toDatetimeLocalValue(new Date(event.ticketCloseAt))
    : toDatetimeLocalValue(new Date(Date.now() + 60 * 60000));

  openModal({
    title: `마감 시간 설정 — ${event.eventName}`,
    bodyHtml: `
      <div class="field">
        <label>예매 마감 일시</label>
        <input type="datetime-local" step="1" data-close-time-input value="${prefill}" />
      </div>
      <div class="field" style="margin-bottom:0;">
        <label>빠른 설정 (테스트용 — 클릭 즉시 저장)</label>
        <div class="chip-row">
          <button type="button" class="chip-btn" data-close-preset="5m">5분 후 마감</button>
          <button type="button" class="chip-btn" data-close-preset="30m">30분 후 마감</button>
          <button type="button" class="chip-btn" data-close-preset="1h">1시간 후 마감</button>
          <button type="button" class="chip-btn" data-close-preset="24h">24시간 후 마감</button>
        </div>
      </div>
      ${event.ticketCloseAt ? `<p class="policy-note mt-16">현재 설정: ${new Date(event.ticketCloseAt).toLocaleString('ko-KR')}</p>` : '<p class="policy-note mt-16">현재: 마감 시간 미설정 (수동 마감)</p>'}
    `,
    footerHtml: `
      <button type="button" class="btn btn-outline" data-modal-close>취소</button>
      <button type="button" class="btn btn-outline" data-clear-close-time>마감 제한 해제</button>
      <button type="button" class="btn btn-primary" data-save-close-time>저장</button>
    `,
  });

  const input = document.querySelector('[data-close-time-input]');

  document.querySelectorAll('[data-close-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const deltaMs = { '5m': 5 * 60000, '30m': 30 * 60000, '1h': 60 * 60000, '24h': 24 * 60 * 60000 }[btn.dataset.closePreset] || 0;
      const target = new Date(Date.now() + deltaMs);
      input.value = toDatetimeLocalValue(target);
      applyCloseTime(event.eventId, target.toISOString(), `마감 시간이 "${btn.textContent}"(으)로 설정되었습니다`, onSaved);
    });
  });

  document.querySelector('[data-clear-close-time]').addEventListener('click', () => {
    applyCloseTime(event.eventId, null, '마감 시간 제한이 해제되었습니다 (수동 마감)', onSaved);
  });

  document.querySelector('[data-save-close-time]').addEventListener('click', () => {
    if (!input.value) {
      showToast({ title: '마감 일시를 입력해주세요' });
      return;
    }
    const target = new Date(input.value);
    if (Number.isNaN(target.getTime())) {
      showToast({ title: '올바른 날짜/시간을 입력해주세요' });
      return;
    }
    applyCloseTime(event.eventId, target.toISOString(), '마감 시간이 설정되었습니다', onSaved);
  });
}

function openCreateEventModal(onCreated) {
  openModal({
    title: '공연 생성',
    bodyHtml: `
      <form data-create-event novalidate>
        <div class="field">
          <label>공연명</label>
          <input type="text" name="eventName" placeholder="예: 2026 연말 콘서트" required />
        </div>
        <div class="field">
          <label>공연일</label>
          <input type="date" name="eventDate" />
        </div>
        <div class="field">
          <label>공연장</label>
          <select name="venue">
            <option value="올림픽홀">서울 올림픽홀</option>
          </select>
        </div>
        <div class="field">
          <label>좌석 형태</label>
          <select name="seatingType">
            <option value="olympichall">서울 올림픽홀 실제 좌석 배치</option>
          </select>
        </div>
        <div class="field">
          <label>등급별 좌석 수 / 가격 (올림픽홀 실제 구역 기준)</label>
          <table class="qtable">
            <thead><tr><th>등급</th><th>좌석 수</th><th>가격(원)</th></tr></thead>
            <tbody>${GRADE_DEFAULTS.map(createEventGradeRowHtml).join('')}</tbody>
          </table>
        </div>
        <div class="field-error field-error--form" data-err="form"></div>
      </form>
    `,
    footerHtml: `
      <button type="button" class="btn btn-outline" data-modal-close>취소</button>
      <button type="button" class="btn btn-primary" data-submit-create-event>공연 생성</button>
    `,
  });

  const form = document.querySelector('[data-create-event]');
  const errEl = document.querySelector('[data-err="form"]');
  const submitBtn = document.querySelector('[data-submit-create-event]');

  submitBtn.addEventListener('click', () => {
    const eventName = form.eventName.value.trim();
    if (!eventName) {
      errEl.textContent = '공연명을 입력해주세요.';
      return;
    }

    const pricesByGrade = Object.fromEntries(GRADE_DEFAULTS.map((g) => [
      g.key,
      parseInt(form.querySelector(`[data-grade-price="${g.key}"]`).value, 10) || 0,
    ]));
    const sections = OLYMPIC_HALL.zones.map((zone) => ({
      name: zone.id,
      seats: zone.id === 'Floor' ? OLYMPIC_HALL_FLOOR_SEAT_COUNT : zone.seats.length,
      price: pricesByGrade[zone.grade] || 0,
    }));

    if (eventsCache.some((e) => e.eventName === eventName)) {
      errEl.textContent = '이미 동일한 이름의 공연이 존재합니다.';
      return;
    }

    errEl.textContent = '';
    submitBtn.disabled = true;

    createEvent({
      eventName,
      eventDate: form.eventDate.value || undefined,
      venue: '올림픽홀',
      seatingType: 'olympichall',
      sections,
    })
      .then((result) => {
        if (result.error) {
          errEl.textContent = result.error;
          submitBtn.disabled = false;
          return;
        }
        showToast({ title: '공연이 생성되었습니다', body: result.message || `${eventName} 생성 완료`, type: 'success' });
        closeModal();
        onCreated?.();
      })
      .catch(() => {
        errEl.textContent = '공연 생성 중 오류가 발생했습니다.';
        submitBtn.disabled = false;
      });
  });
}

function simFetch(path, body) {
  return authFetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());
}

function initDummyPanel(container) {
  const panel = container.querySelector('[data-dummy-panel]');
  if (!panel) return;

  const toggleBtn = panel.querySelector('[data-dummy-toggle]');
  const body = panel.querySelector('[data-dummy-body]');
  const countInput = panel.querySelector('[data-dummy-count]');
  const maxEventsInput = panel.querySelector('[data-dummy-max-events]');
  const statusArea = panel.querySelector('[data-dummy-status]');

  const btnCreate = panel.querySelector('[data-dummy-create]');
  const btnDistribute = panel.querySelector('[data-dummy-distribute]');
  const btnCleanup = panel.querySelector('[data-dummy-cleanup]');

  toggleBtn.addEventListener('click', () => {
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? 'block' : 'none';
    toggleBtn.textContent = hidden ? '접기' : '펼치기';
  });

  function setLoading(btn, text) {
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = text;
    return () => { btn.disabled = false; btn.textContent = original; };
  }

  btnCreate.addEventListener('click', () => {
    const count = parseInt(countInput.value, 10) || 500;
    const restore = setLoading(btnCreate, '생성 중...');
    authFetch('/admin/dummy/create-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          showToast({ title: '더미 유저 생성 실패', body: data.error });
          return;
        }
        showToast({ title: '더미 유저 생성 완료', body: data.message, type: 'success' });
        statusArea.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">
            <div><b>요청</b><br/>${data.requested?.toLocaleString() || 0}명</div>
            <div><b>생성됨</b><br/><span style="color:#27ae60;">${data.created?.toLocaleString() || 0}명</span></div>
          </div>
          <p class="text-secondary" style="font-size:12px;margin-top:8px;">이제 "관심 공연 분배" 버튼을 눌러 HOT 순위에 반영하세요.</p>`;
      })
      .catch(() => showToast({ title: '더미 유저 생성 중 오류가 발생했습니다' }))
      .finally(restore);
  });

  btnDistribute.addEventListener('click', () => {
    const maxEvents = parseInt(maxEventsInput.value, 10) || 5;
    const restore = setLoading(btnDistribute, '분배 중...');
    authFetch('/admin/dummy/distribute-interests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxEvents }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          showToast({ title: '관심 공연 분배 실패', body: data.error });
          return;
        }
        showToast({ title: '관심 공연 분배 완료', body: data.message, type: 'success' });
        const dist = data.distribution || [];
        let html = `
          <div style="margin-bottom:12px;">
            <b>총 더미 유저:</b> ${(data.totalUsers || 0).toLocaleString()}명 → <b>${data.eventsCount || 0}개 공연</b>에 분배
          </div>
          <table class="qtable" style="font-size:13px;">
            <thead><tr><th>순위</th><th>공연명</th><th>관심 수</th><th>비율</th></tr></thead>
            <tbody>`;
        const totalCount = dist.reduce((s, d) => s + d.count, 0) || 1;
        dist.forEach((d, i) => {
          const pct = ((d.count / totalCount) * 100).toFixed(1);
          html += `<tr>
            <td class="num-mono">${i + 1}</td>
            <td>${d.eventName}</td>
            <td class="num-mono" style="color:#8e44ad;">${d.count.toLocaleString()}</td>
            <td>
              <div style="display:flex;align-items:center;gap:6px;">
                <div style="width:80px;height:8px;background:var(--color-border);border-radius:4px;overflow:hidden;">
                  <div style="width:${pct}%;height:100%;background:#8e44ad;border-radius:4px;"></div>
                </div>
                <span class="num-mono" style="font-size:11px;">${pct}%</span>
              </div>
            </td>
          </tr>`;
        });
        html += '</tbody></table>';
        html += '<p class="text-secondary" style="font-size:12px;margin-top:8px;">메인 페이지 "요즘 HOT 공연" 순위에 즉시 반영됩니다.</p>';
        statusArea.innerHTML = html;
      })
      .catch(() => showToast({ title: '관심 공연 분배 중 오류가 발생했습니다' }))
      .finally(restore);
  });

  btnCleanup.addEventListener('click', () => {
    if (!confirm('더미 유저와 관심 공연 데이터를 모두 삭제할까요?\nHOT 순위가 초기화됩니다.')) return;
    const restore = setLoading(btnCleanup, '삭제 중...');
    authFetch('/admin/dummy/cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          showToast({ title: '삭제 실패', body: data.error });
          return;
        }
        showToast({ title: '더미 데이터 삭제 완료', body: data.message, type: 'success' });
        statusArea.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">
            <div><b>삭제된 유저</b><br/><span style="color:#e74c3c;">${(data.deletedUsers || 0).toLocaleString()}명</span></div>
            <div><b>삭제된 위시리스트</b><br/><span style="color:#e74c3c;">${(data.deletedWishlists || 0).toLocaleString()}건</span></div>
          </div>`;
      })
      .catch(() => showToast({ title: '삭제 중 오류가 발생했습니다' }))
      .finally(restore);
  });
}

function initSimulationPanel(container) {
  const panel = container.querySelector('[data-sim-panel]');
  if (!panel) return;

  const toggleBtn = panel.querySelector('[data-sim-toggle]');
  const body = panel.querySelector('[data-sim-body]');
  const eventSelect = panel.querySelector('[data-sim-event]');
  const sessionSelect = panel.querySelector('[data-sim-session]');
  const realEmailInput = panel.querySelector('[data-sim-real-email]');
  const dummyCountInput = panel.querySelector('[data-sim-dummy-count]');
  const cancelCountInput = panel.querySelector('[data-sim-cancel-count]');
  const statusArea = panel.querySelector('[data-sim-status]');
  const logArea = panel.querySelector('[data-sim-log]');

  const btnInit = panel.querySelector('[data-sim-init]');
  const btnSellout = panel.querySelector('[data-sim-sellout]');
  const btnClose = panel.querySelector('[data-sim-close]');
  const btnCancel = panel.querySelector('[data-sim-cancel]');
  const btnLinks = panel.querySelector('[data-sim-links]');
  const btnCleanup = panel.querySelector('[data-sim-cleanup]');
  const btnRefresh = panel.querySelector('[data-sim-refresh]');

  let simEventsCache = [];
  let currentStage = null;
  let actionInProgress = false;

  toggleBtn.addEventListener('click', () => {
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? 'block' : 'none';
    toggleBtn.textContent = hidden ? '접기' : '펼치기';
    if (hidden) loadSimEvents();
  });

  function logMsg(msg) {
    logArea.style.display = 'block';
    const time = new Date().toLocaleTimeString('ko-KR');
    logArea.innerHTML = `<div>[${time}] ${msg}</div>` + logArea.innerHTML;
  }

  function updateButtons(stage = currentStage) {
    currentStage = stage || null;
    const manualActionDisabled = !eventSelect.value || actionInProgress;

    // 수동 실행 모드에서는 현재 단계와 관계없이 원하는 작업을 직접 실행한다.
    // API가 각 작업의 필수 선행조건을 최종 검증하며, 요청 중에는 중복 실행만 막는다.
    btnSellout.disabled = manualActionDisabled;
    btnClose.disabled = manualActionDisabled;
    btnCancel.disabled = manualActionDisabled;
    // 취소표 순차 배정과 Secret Link 발급은 B파트 Step Functions가 담당한다.
    btnLinks.disabled = true;
    btnInit.disabled = actionInProgress;
    btnCleanup.disabled = actionInProgress;
  }

  function renderStatus(data) {
    if (!data.initialized) {
      statusArea.innerHTML = '<p class="text-secondary">시뮬레이션이 초기화되지 않았습니다.</p>';
      updateButtons(null);
      return;
    }
    const s = data.seats || {};
    const q = data.queue || {};
    const ru = data.realUser;
    let html = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:12px;">
        <div><b>단계</b><br/><span class="badge badge-blue">${data.stage}</span></div>
        <div><b>더미 유저</b><br/>${(data.dummyCount || 0).toLocaleString()}명</div>
        <div><b>총 좌석</b><br/>${(data.totalSeats || 0).toLocaleString()}석</div>
        <div><b>판매됨</b><br/><span style="color:#e74c3c;">${(s.sold || 0).toLocaleString()}</span></div>
        <div><b>남은 좌석</b><br/><span style="color:#27ae60;">${(s.available || 0).toLocaleString()}</span></div>
        <div><b>선점 중</b><br/>${(s.held || 0).toLocaleString()}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:12px;">
        <div><b>대기열 (standby)</b><br/>${(q.standby || 0).toLocaleString()}명</div>
        <div><b>입장 허용</b><br/>${(q.admitted || 0).toLocaleString()}명</div>
        <div><b>일반 대기</b><br/>${(q.waiting || 0).toLocaleString()}명</div>
      </div>`;

    if (ru) {
      html += `<div style="padding:10px;background:var(--color-bg);border-radius:6px;border:1px solid var(--color-border);">
        <b>실제 유저: ${ru.email}</b><br/>`;
      if (ru.standbyPosition) html += `취소표 대기 <b>${ru.standbyPosition}번째</b> · `;
      if (ru.isAdmitted) html += '<span style="color:#27ae60;">입장 허용됨</span> · ';
      if (ru.hasAllocation) {
        html += `<span style="color:#8e44ad;">시크릿 링크 발급됨</span> (좌석: ${ru.allocation.seatId}, 만료: ${new Date(ru.allocation.expiresAt).toLocaleTimeString('ko-KR')})`;
      }
      if (!ru.standbyPosition && !ru.isAdmitted && !ru.hasAllocation) {
        html += '<span style="color:var(--color-text-secondary);">아직 대기열에 진입하지 않음</span>';
      }
      html += '</div>';
    }

    if (data.allocations && data.allocations.length > 0) {
      html += '<div style="margin-top:12px;"><b>최근 취소표 할당 내역</b></div>';
      html += '<table class="qtable" style="font-size:12px;margin-top:4px;"><thead><tr><th>유저</th><th>좌석</th><th>상태</th><th>시간</th></tr></thead><tbody>';
      for (const a of data.allocations.slice(0, 10)) {
        const isSim = a.userId.startsWith('sim-user-');
        html += `<tr${isSim ? '' : ' style="background:rgba(142,68,173,0.08);"'}>
          <td>${isSim ? a.userId.slice(0, 15) + '...' : '<b>' + a.userId + '</b>'}</td>
          <td>${a.seatId.split(':').pop()}</td>
          <td><span class="badge ${a.status === 'RESPONDED' ? 'badge-green' : a.status === 'LINK_SENT' ? 'badge-blue' : 'badge-outline'}">${a.status}</span></td>
          <td>${new Date(a.createdAt).toLocaleTimeString('ko-KR')}</td>
        </tr>`;
      }
      html += '</tbody></table>';
    }

    statusArea.innerHTML = html;
    updateButtons(data.stage);
  }

  function loadSimEvents() {
    simFetch('/admin/simulation/events').then((data) => {
      simEventsCache = data.events || [];
      eventSelect.innerHTML = '<option value="">— 공연을 선택하세요 —</option>' +
        simEventsCache.map((e) =>
          `<option value="${e.eventId}">${e.eventName} (${e.eventDate || '날짜 미정'}) — ${(e.totalSeats || 0).toLocaleString()}석</option>`
        ).join('');
    });
  }

  eventSelect.addEventListener('change', () => {
    const ev = simEventsCache.find((e) => e.eventId === eventSelect.value);
    updateButtons(null);
    if (!ev || !ev.sessions || ev.sessions.length === 0) {
      sessionSelect.innerHTML = '<option value="">회차 없음</option>';
      return;
    }
    sessionSelect.innerHTML = ev.sessions.map((s, i) =>
      `<option value="${i}" data-date="${s.date || ''}" data-time="${s.time || ''}">${s.date || '?'} ${s.time || ''}</option>`
    ).join('');

    const eventId = ev.eventId;
    simFetch(`/admin/simulation/status?eventId=${encodeURIComponent(eventId)}`)
      .then(renderStatus)
      .catch(() => {});
  });

  function getSimParams() {
    const eventId = eventSelect.value;
    const opt = sessionSelect.selectedOptions[0];
    return {
      eventId,
      sessionDate: opt?.dataset.date || '',
      sessionTime: opt?.dataset.time || '',
    };
  }

  btnInit.addEventListener('click', () => {
    const params = getSimParams();
    if (!params.eventId) { showToast({ title: '공연을 선택해주세요' }); return; }
    const email = realEmailInput.value.trim();
    if (!email) { showToast({ title: '실제 유저 이메일을 입력해주세요' }); return; }
    const count = parseInt(dummyCountInput.value, 10) || 10000;
    actionInProgress = true;
    updateButtons();
    btnInit.textContent = '초기화 중...';
    logMsg(`초기화 시작 — ${params.eventId}, 더미 ${count.toLocaleString()}명`);
    simFetch('/admin/simulation/init', { ...params, realUserEmail: email, dummyCount: count })
      .then((r) => {
        if (r.error) { showToast({ title: '초기화 실패', body: r.error }); return; }
        showToast({ title: '시뮬레이션 초기화 완료', body: r.message, type: 'success' });
        logMsg(r.message);
        return simFetch(`/admin/simulation/status?eventId=${encodeURIComponent(params.eventId)}`);
      })
      .then((s) => { if (s) renderStatus(s); })
      .catch((e) => showToast({ title: '초기화 오류', body: e.message }))
      .finally(() => {
        actionInProgress = false;
        btnInit.textContent = '시뮬레이션 초기화';
        updateButtons();
      });
  });

  btnSellout.addEventListener('click', () => {
    const params = getSimParams();
    if (!params.eventId) return;
    if (!confirm('본 티켓팅 매진 연출을 시작할까요?\n모든 좌석이 더미 유저에 의해 점유됩니다.')) return;
    actionInProgress = true;
    updateButtons();
    btnSellout.textContent = '매진 처리 중...';
    logMsg('단계1: 매진 연출 시작');
    simFetch('/admin/simulation/sellout', params)
      .then((r) => {
        if (r.error) { showToast({ title: '매진 연출 실패', body: r.error }); return; }
        showToast({ title: '매진 연출 완료', body: r.message, type: 'success' });
        logMsg(r.message);
        return simFetch(`/admin/simulation/status?eventId=${encodeURIComponent(params.eventId)}`);
      })
      .then((s) => { if (s) renderStatus(s); })
      .catch((e) => showToast({ title: '매진 연출 오류', body: e.message }))
      .finally(() => {
        actionInProgress = false;
        btnSellout.textContent = '단계1: 매진 연출';
        updateButtons();
      });
  });

  btnClose.addEventListener('click', () => {
    const params = getSimParams();
    if (!params.eventId) return;
    if (!confirm('티켓팅을 즉시 마감하고 멤버십/대기열 유지 검증을 실행할까요?')) return;
    actionInProgress = true;
    updateButtons();
    btnClose.textContent = '마감 처리 중...';
    logMsg('단계2: 조기 마감 시작');
    simFetch('/admin/simulation/close', params)
      .then((r) => {
        if (r.error) { showToast({ title: '마감 실패', body: r.error }); return; }
        showToast({ title: '티켓팅 마감 완료', body: r.message, type: 'success' });
        logMsg(r.message);
        return simFetch(`/admin/simulation/status?eventId=${encodeURIComponent(params.eventId)}`);
      })
      .then((s) => { if (s) renderStatus(s); })
      .catch((e) => showToast({ title: '마감 오류', body: e.message }))
      .finally(() => {
        actionInProgress = false;
        btnClose.textContent = '단계2: 조기 마감';
        updateButtons();
      });
  });

  btnCancel.addEventListener('click', () => {
    const params = getSimParams();
    if (!params.eventId) return;
    const count = parseInt(cancelCountInput.value, 10) || 5;
    if (!confirm(`더미 유저 좌석 ${count}석을 강제 취소(해제)할까요?`)) return;
    actionInProgress = true;
    updateButtons();
    btnCancel.textContent = '좌석 취소 중...';
    logMsg(`단계3: 더미 좌석 ${count}석 취소 시작`);
    simFetch('/admin/simulation/cancel-seats', { ...params, count })
      .then((r) => {
        if (r.error) { showToast({ title: '좌석 취소 실패', body: r.error }); return; }
        showToast({ title: '좌석 취소 완료', body: r.message, type: 'success' });
        logMsg(r.message);
        return simFetch(`/admin/simulation/status?eventId=${encodeURIComponent(params.eventId)}`);
      })
      .then((s) => { if (s) renderStatus(s); })
      .catch((e) => showToast({ title: '좌석 취소 오류', body: e.message }))
      .finally(() => {
        actionInProgress = false;
        btnCancel.textContent = '단계3: 취소표 생성';
        updateButtons();
      });
  });

  btnCleanup.addEventListener('click', () => {
    const params = getSimParams();
    if (!params.eventId) { showToast({ title: '공연을 선택해주세요' }); return; }
    if (!confirm('시뮬레이션 데이터(더미 유저, 좌석 점유, 대기열)를 모두 삭제할까요?')) return;
    actionInProgress = true;
    updateButtons();
    btnCleanup.textContent = '삭제 중...';
    logMsg('시뮬레이션 데이터 삭제 시작');
    simFetch('/admin/simulation/cleanup', params)
      .then((r) => {
        if (r.error) { showToast({ title: '삭제 실패', body: r.error }); return; }
        showToast({ title: '시뮬레이션 데이터 삭제 완료', body: r.message, type: 'success' });
        logMsg(r.message);
        renderStatus({ initialized: false });
      })
      .catch((e) => showToast({ title: '삭제 오류', body: e.message }))
      .finally(() => {
        actionInProgress = false;
        btnCleanup.textContent = '데이터 삭제';
        updateButtons();
      });
  });

  btnRefresh.addEventListener('click', () => {
    const params = getSimParams();
    if (!params.eventId) { showToast({ title: '공연을 선택해주세요' }); return; }
    simFetch(`/admin/simulation/status?eventId=${encodeURIComponent(params.eventId)}&sessionDate=${params.sessionDate}&sessionTime=${params.sessionTime}`)
      .then(renderStatus)
      .catch((e) => showToast({ title: '상태 조회 오류', body: e.message }));
  });
}

function focusAdminSection(container, section) {
  const target = container.querySelector(`[data-admin-focus="${section}"]`);
  if (!target) return;

  target.scrollIntoView({ block: 'start', behavior: 'auto' });
  container.querySelectorAll('[data-admin-section]').forEach((item) => {
    const active = item.dataset.adminSection === section;
    item.classList.toggle('is-active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
}

function initAdminInteractions(container) {
  const navItems = [...container.querySelectorAll('[data-admin-section]')];
  navItems.forEach((item, index) => { item.tabIndex = index === 0 ? 0 : -1; });

  const onClick = (event) => {
    const navItem = event.target.closest('[data-admin-section]');
    if (!navItem || !container.contains(navItem)) return;
    focusAdminSection(container, navItem.dataset.adminSection);
  };

  const onKeydown = (event) => {
    const navItem = event.target.closest('[data-admin-section]');
    if (navItem && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      const currentIndex = navItems.indexOf(navItem);
      const nextIndex = event.key === 'ArrowDown'
        ? (currentIndex + 1) % navItems.length
        : (currentIndex - 1 + navItems.length) % navItems.length;
      navItems.forEach((item, index) => item.tabIndex = index === nextIndex ? 0 : -1);
      navItems[nextIndex].focus();
      return;
    }

    const row = event.target.closest('[data-admin-row]');
    if (!row || !container.contains(row)) return;
    if (event.target !== row && event.target.closest('button, a, input, select, textarea')) return;

    const rows = [...container.querySelectorAll('[data-admin-row]')];
    const currentIndex = rows.indexOf(row);
    let nextIndex = currentIndex;

    if (event.key === 'ArrowDown') nextIndex = Math.min(rows.length - 1, currentIndex + 1);
    if (event.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex - 1);
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = rows.length - 1;

    if (nextIndex !== currentIndex) {
      event.preventDefault();
      rows.forEach((item) => item.classList.remove('is-keyboard-active'));
      rows[nextIndex].classList.add('is-keyboard-active');
      rows[nextIndex].focus();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      row.querySelector('[data-set-open-time]')?.focus();
    }
  };

  const onFocusIn = (event) => {
    const row = event.target.closest('[data-admin-row]');
    if (!row || !container.contains(row)) return;
    container.querySelectorAll('[data-admin-row]').forEach((item) => item.classList.remove('is-keyboard-active'));
    row.classList.add('is-keyboard-active');
  };

  container.addEventListener('click', onClick);
  container.addEventListener('keydown', onKeydown);
  container.addEventListener('focusin', onFocusIn);

  return () => {
    container.removeEventListener('click', onClick);
    container.removeEventListener('keydown', onKeydown);
    container.removeEventListener('focusin', onFocusIn);
  };
}

function initAdminCommandPalette(container) {
  const palette = container.querySelector('[data-command-palette]');
  const trigger = container.querySelector('[data-command-open]');
  const input = container.querySelector('[data-command-input]');
  const list = container.querySelector('[data-command-list]');
  if (!palette || !trigger || !input || !list) return () => {};

  const commands = [
    { id: 'overview', label: '개요로 이동', hint: '운영 대시보드', action: () => focusAdminSection(container, 'overview') },
    { id: 'events', label: '공연 관리로 이동', hint: '등록된 공연 목록', action: () => focusAdminSection(container, 'events') },
    { id: 'dummy', label: '더미 유저 도구로 이동', hint: 'HOT 공연 관리', action: () => focusAdminSection(container, 'dummy') },
    { id: 'simulation', label: '취소표 시뮬레이션으로 이동', hint: '수동 실행 패널', action: () => focusAdminSection(container, 'simulation') },
    { id: 'create-event', label: '새 공연 생성', hint: '공연 생성 모달 열기', action: () => container.querySelector('[data-open-create-event]')?.click() },
    { id: 'refresh-events', label: '공연 목록 새로고침', hint: '최신 상태 조회', action: () => refreshEventsList(container) },
    { id: 'toggle-simulation', label: '취소표 시뮬레이션 펼치기', hint: '패널 열기', action: () => {
      const body = container.querySelector('[data-sim-body]');
      if (body?.style.display === 'none') container.querySelector('[data-sim-toggle]')?.click();
      focusAdminSection(container, 'simulation');
    } },
  ];

  let filteredCommands = commands;
  let activeIndex = 0;
  let lastFocused = null;

  function renderCommands() {
    const query = input.value.trim().toLowerCase();
    filteredCommands = commands.filter((command) => `${command.label} ${command.hint}`.toLowerCase().includes(query));
    activeIndex = Math.min(activeIndex, Math.max(filteredCommands.length - 1, 0));
    list.innerHTML = filteredCommands.length
      ? filteredCommands.map((command, index) => `
          <button type="button" class="admin-command-item${index === activeIndex ? ' is-active' : ''}"
            data-command-id="${command.id}" role="option" aria-selected="${index === activeIndex}">
            <span class="admin-command-item__label">${command.label}</span>
            <span class="admin-command-item__hint">${command.hint}</span>
          </button>`).join('')
      : '<div class="admin-command-empty">일치하는 명령이 없습니다.</div>';
  }

  function setActive(index) {
    if (!filteredCommands.length) return;
    activeIndex = (index + filteredCommands.length) % filteredCommands.length;
    list.querySelectorAll('[data-command-id]').forEach((item, itemIndex) => {
      const active = itemIndex === activeIndex;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
    });
  }

  function close() {
    if (palette.open) palette.close();
  }

  function open() {
    lastFocused = document.activeElement;
    input.value = '';
    activeIndex = 0;
    renderCommands();
    if (typeof palette.showModal === 'function') palette.showModal();
    else palette.setAttribute('open', '');
    input.focus();
  }

  const onTriggerClick = () => open();
  const onDocumentKeydown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (palette.open) close();
      else open();
    }
  };
  const onInput = () => {
    activeIndex = 0;
    renderCommands();
  };
  const onPaletteKeydown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(activeIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(activeIndex - 1);
    } else if (event.key === 'Enter' && filteredCommands.length) {
      event.preventDefault();
      const command = filteredCommands[activeIndex];
      close();
      command.action();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };
  const onPaletteClick = (event) => {
    if (event.target === palette) {
      close();
      return;
    }
    const item = event.target.closest('[data-command-id]');
    if (!item) return;
    const command = commands.find((candidate) => candidate.id === item.dataset.commandId);
    if (!command) return;
    close();
    command.action();
  };
  const onPaletteClose = () => {
    lastFocused?.focus?.();
    lastFocused = null;
  };

  trigger.addEventListener('click', onTriggerClick);
  document.addEventListener('keydown', onDocumentKeydown);
  input.addEventListener('input', onInput);
  palette.addEventListener('keydown', onPaletteKeydown);
  palette.addEventListener('click', onPaletteClick);
  palette.addEventListener('close', onPaletteClose);
  renderCommands();

  return () => {
    trigger.removeEventListener('click', onTriggerClick);
    document.removeEventListener('keydown', onDocumentKeydown);
    input.removeEventListener('input', onInput);
    palette.removeEventListener('keydown', onPaletteKeydown);
    palette.removeEventListener('click', onPaletteClick);
    palette.removeEventListener('close', onPaletteClose);
    if (palette.open) palette.close();
  };
}

export const adminPage = {
  render(container) {
    if (!isAdmin()) {
      showToast({ title: '접근 권한이 없습니다', body: isLoggedIn() ? '관리자만 이용할 수 있는 페이지입니다.' : '로그인이 필요한 페이지입니다.' });
      navigate('');
      return;
    }

    container.innerHTML = `
      <div class="admin-app">
        <div class="container admin-topbar">
          <div class="admin-topbar__identity">
            <div class="admin-brand-mark">Q</div>
            <div>
              <div class="eyebrow">OPERATIONS</div>
              <h2 class="section-title">운영 대시보드</h2>
              <p class="section-sub">공연과 대기열 흐름을 한 곳에서 관리합니다.</p>
            </div>
          </div>
          <div class="admin-topbar__actions">
            <button type="button" class="admin-command-trigger" data-command-open aria-label="명령 팔레트 열기">
              <span class="admin-command-trigger__icon">⌘</span><span>명령 검색</span><kbd>Ctrl K</kbd>
            </button>
            <div class="admin-status">
              <button type="button" class="btn btn-primary btn-sm" data-open-create-event>+ 공연 생성</button>
              <button type="button" class="btn btn-outline btn-sm" data-random-create-event>포스터 공연 생성</button>
              <button type="button" class="btn btn-outline btn-sm" data-bulk-delete disabled>5개씩 삭제</button>
              <button type="button" class="btn btn-outline btn-sm" data-redis-reset style="border-color:#e67e22;color:#e67e22;">Redis 초기화</button>
              <button type="button" class="btn btn-outline btn-sm" data-redis-recover style="border-color:#27ae60;color:#27ae60;">DB→Redis 복구</button>
            </div>
          </div>
        </div>

        <div class="container admin-layout">
          <aside class="admin-sidebar" aria-label="관리자 메뉴">
            <div class="admin-sidebar__label">WORKSPACE</div>
            <nav class="admin-sidebar__nav" data-admin-nav>
              <button type="button" class="admin-nav-item is-active" data-admin-section="overview" aria-current="page">
                <span class="admin-nav-item__index">01</span><span>개요</span>
              </button>
              <button type="button" class="admin-nav-item" data-admin-section="events" tabindex="-1">
                <span class="admin-nav-item__index">02</span><span>공연 관리</span>
              </button>
              <button type="button" class="admin-nav-item" data-admin-section="dummy" tabindex="-1">
                <span class="admin-nav-item__index">03</span><span>더미 유저 도구</span>
              </button>
              <button type="button" class="admin-nav-item" data-admin-section="simulation" tabindex="-1">
                <span class="admin-nav-item__index">04</span><span>취소표 시뮬레이션</span>
              </button>
            </nav>
            <div class="admin-sidebar__footer">
              <span class="admin-live-indicator" aria-hidden="true"></span>
              <span>API 연결됨</span>
              <span class="admin-sidebar__shortcut">?</span>
            </div>
          </aside>

          <main class="admin-main" data-admin-focus="overview" id="admin-main-content">
            <div class="admin-main__intro">
              <div>
                <div class="admin-section-kicker">TODAY / OPERATIONS</div>
                <h1>운영 상태</h1>
              </div>
              <div class="admin-key-hint"><kbd>↑</kbd><kbd>↓</kbd> 표 이동 <span>·</span> <kbd>⌘</kbd><kbd>K</kbd> 명령 검색</div>
            </div>

            <div class="admin-metric-grid" aria-label="관리자 요약">
              <div class="admin-metric">
                <span class="admin-metric__label">등록 공연</span>
                <strong class="admin-metric__value" data-admin-event-count>-</strong>
                <span class="admin-metric__meta">서버 목록 기준</span>
              </div>
              <div class="admin-metric">
                <span class="admin-metric__label">상태 갱신</span>
                <strong class="admin-metric__value">1s</strong>
                <span class="admin-metric__meta">오픈 · 마감 시간</span>
              </div>
              <div class="admin-metric">
                <span class="admin-metric__label">시뮬레이션</span>
                <strong class="admin-metric__value">수동</strong>
                <span class="admin-metric__meta">단계별 직접 실행</span>
              </div>
            </div>

            <div class="admin-grid">
              <section class="admin-panel admin-panel--wide" data-admin-focus="events">
                <div class="mchart__head admin-panel__head">
                  <div>
                    <span class="admin-panel__eyebrow">EVENTS</span>
                    <span class="mchart__title">생성된 공연 목록</span>
                  </div>
                  <span class="admin-panel__hint">행을 선택하고 방향키로 이동</span>
                </div>
                <div class="admin-table-wrap">
                  <table class="qtable admin-events-table">
                    <thead><tr><th>No.</th><th>공연명</th><th>날짜</th><th>장소</th><th>총좌석</th><th>예매 상태</th><th></th></tr></thead>
                    <tbody data-events-tbody><tr><td colspan="7" class="text-secondary">불러오는 중...</td></tr></tbody>
                  </table>
                </div>
              </section>

              <section class="admin-panel admin-panel--wide" data-dummy-panel data-admin-focus="dummy">
                <div class="mchart__head admin-panel__head">
                  <div>
                    <span class="admin-panel__eyebrow">DATA TOOLS</span>
                    <span class="mchart__title">더미 유저 · HOT 공연 관리</span>
                  </div>
                  <button type="button" class="btn btn-outline btn-sm" data-dummy-toggle>펼치기</button>
                </div>
                <div data-dummy-body style="display:none;">
                  <p class="text-secondary admin-panel__description">
                    더미 유저를 생성하고, 현재 등록된 공연 중 랜덤으로 최대 5개에 관심(위시리스트)을 분배합니다.<br/>
                    분배된 관심 수는 메인 페이지 "요즘 HOT 공연" 순위에 실시간 반영됩니다.
                  </p>
                  <div class="admin-form-grid admin-form-grid--two">
                    <div class="field">
                      <label>생성할 더미 유저 수</label>
                      <input type="number" data-dummy-count value="500" min="1" max="50000" />
                    </div>
                    <div class="field">
                      <label>분배 공연 수 (최대)</label>
                      <input type="number" data-dummy-max-events value="5" min="1" max="20" />
                    </div>
                  </div>
                  <div class="admin-action-row">
                    <button type="button" class="btn btn-primary btn-sm" data-dummy-create>더미 유저 생성</button>
                    <button type="button" class="btn btn-outline btn-sm" data-dummy-distribute style="border-color:#8e44ad;color:#8e44ad;">관심 공연 분배 (HOT 반영)</button>
                    <button type="button" class="btn btn-outline btn-sm" data-dummy-cleanup style="border-color:#e74c3c;color:#e74c3c;">더미 데이터 삭제</button>
                  </div>
                  <div data-dummy-status class="admin-result-box">
                    <p class="text-secondary">더미 유저를 생성하고 관심 공연을 분배하면 결과가 여기에 표시됩니다.</p>
                  </div>
                </div>
              </section>

              <section class="admin-panel admin-panel--wide" data-sim-panel data-admin-focus="simulation">
                <div class="mchart__head admin-panel__head">
                  <div>
                    <span class="admin-panel__eyebrow">CANCELLATION QUEUE</span>
                    <span class="mchart__title">취소표 시뮬레이션</span>
                  </div>
                  <button type="button" class="btn btn-outline btn-sm" data-sim-toggle>펼치기</button>
                </div>
                <div data-sim-body style="display:none;">
                  <div class="admin-form-grid admin-form-grid--two">
                    <div class="field">
                      <label>공연 선택</label>
                      <select data-sim-event>
                        <option value="">불러오는 중...</option>
                      </select>
                    </div>
                    <div class="field">
                      <label>회차 선택</label>
                      <select data-sim-session>
                        <option value="">공연을 먼저 선택하세요</option>
                      </select>
                    </div>
                  </div>
                  <div class="admin-form-grid admin-form-grid--wide">
                    <div class="field">
                      <label>실제 멤버십 유저 이메일</label>
                      <input type="email" data-sim-real-email placeholder="test@example.com" />
                    </div>
                    <div class="field">
                      <label>더미 유저 수</label>
                      <input type="number" data-sim-dummy-count value="10000" min="100" max="50000" />
                    </div>
                  </div>

                  <p class="text-secondary admin-panel__description">
                    수동 실행 모드: 공연을 선택하면 각 단계 버튼을 원하는 시점에 직접 실행할 수 있습니다. 권장 순서는 초기화 → 매진 → 마감 → 취소표 생성입니다. 취소표 배정과 링크 발급은 B파트 파이프라인이 처리합니다.
                  </p>

                  <div class="admin-action-row admin-action-row--simulation">
                    <button type="button" class="btn btn-primary btn-sm" data-sim-init>시뮬레이션 초기화</button>
                    <button type="button" class="btn btn-outline btn-sm" data-sim-sellout disabled style="border-color:#e74c3c;color:#e74c3c;">단계1: 매진 연출</button>
                    <button type="button" class="btn btn-outline btn-sm" data-sim-close disabled style="border-color:#e67e22;color:#e67e22;">단계2: 조기 마감</button>
                    <div class="admin-inline-action">
                      <input type="number" data-sim-cancel-count value="5" min="1" max="100" aria-label="취소표 생성 수" />
                      <button type="button" class="btn btn-outline btn-sm" data-sim-cancel disabled style="border-color:#8e44ad;color:#8e44ad;">단계3: 취소표 생성</button>
                    </div>
                    <button type="button" class="btn btn-outline btn-sm" data-sim-links disabled style="border-color:#27ae60;color:#27ae60;">단계4: B파트 링크 발급</button>
                    <button type="button" class="btn btn-outline btn-sm" data-sim-cleanup style="border-color:#95a5a6;color:#95a5a6;">데이터 삭제</button>
                    <button type="button" class="btn btn-outline btn-sm" data-sim-refresh>상태 새로고침</button>
                  </div>

                  <div data-sim-status class="admin-result-box admin-result-box--large">
                    <p class="text-secondary">시뮬레이션을 초기화하면 여기에 진행 상태가 표시됩니다.</p>
                  </div>

                  <div data-sim-log class="admin-log-box">
                  </div>
                </div>
              </section>
            </div>
          </main>
        </div>

        <dialog class="admin-command-palette" data-command-palette aria-labelledby="admin-command-title">
          <div class="admin-command-palette__box">
            <div class="admin-command-palette__head">
              <span id="admin-command-title">명령 검색</span>
              <kbd>ESC</kbd>
            </div>
            <label class="sr-only" for="admin-command-input">실행할 명령 검색</label>
            <input id="admin-command-input" class="admin-command-palette__input" data-command-input type="search" placeholder="무엇을 실행할까요?" autocomplete="off" />
            <div class="admin-command-list" data-command-list role="listbox" aria-label="관리자 명령"></div>
            <div class="admin-command-palette__footer"><span><kbd>↑</kbd><kbd>↓</kbd> 이동</span><span><kbd>Enter</kbd> 실행</span></div>
          </div>
        </dialog>
      </div>
    `;

    refreshEventsList(container);
    const openStatusTimer = setInterval(() => paintOpenStatuses(container), 1000);
    initDummyPanel(container);
    initSimulationPanel(container);
    const cleanupAdminInteractions = initAdminInteractions(container);
    const cleanupCommandPalette = initAdminCommandPalette(container);

    container.querySelector('[data-bulk-delete]').addEventListener('click', () => {
      const targets = eventsCache.slice(0, 5);
      if (!targets.length) return;

      const names = targets.map((event) => event.eventName).join('\n');
      if (!confirm(`공연 목록의 앞에서부터 ${targets.length}개 공연을 삭제할까요?\n\n${names}\n\n좌석·관심·예매 데이터도 함께 삭제됩니다.`)) return;

      const button = container.querySelector('[data-bulk-delete]');
      button.disabled = true;
      button.textContent = '삭제 중...';
      deleteEventsInBatch(targets)
        .then((result) => {
          const failed = (result.results || []).filter((item) => !item.success || item.dbSynced === false);
          if (failed.length) {
            showToast({
              title: `${result.deletedCount || 0}개 삭제 완료 · ${failed.length}개 확인 필요`,
              body: failed.map((item) => `${item.eventId}: ${item.message}`).join(' / '),
            });
          } else {
            showToast({ title: `${result.deletedCount || targets.length}개 공연이 삭제되었습니다`, type: 'success' });
          }
          refreshEventsList(container);
        })
        .catch((err) => {
          showToast({ title: '일괄 삭제 중 오류가 발생했습니다', body: err.message });
          refreshEventsList(container);
        });
    });

    container.querySelector('[data-open-create-event]').addEventListener('click', () => {
      openCreateEventModal(() => refreshEventsList(container));
    });
    container.querySelector('[data-random-create-event]').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const existingNames = new Set(eventsCache.map((ev) => ev.eventName));
      const remaining = POSTER_CONCERTS.filter((p) => !existingNames.has(p.eventName));
      if (remaining.length === 0) {
        showToast({ title: '모든 포스터 공연이 이미 생성되었습니다', body: `${POSTER_CONCERTS.length}개 공연 등록 완료` });
        return;
      }
      btn.disabled = true;
      const saved = posterCycleIdx;
      posterCycleIdx = POSTER_CONCERTS.indexOf(remaining[0]);
      const payload = buildRandomEventPayload();
      posterCycleIdx = saved;
      createEvent(payload)
        .then((result) => {
          if (result.error) {
            showToast({ title: '생성 실패', body: result.error });
            return;
          }
          showToast({ title: '공연이 생성되었습니다', body: `${payload.eventName} (남은 포스터: ${remaining.length - 1}개)`, type: 'success' });
          refreshEventsList(container);
        })
        .catch(() => showToast({ title: '포스터 공연 생성 중 오류가 발생했습니다' }))
        .finally(() => {
          btn.disabled = false;
        });
    });

    container.querySelector('[data-redis-reset]').addEventListener('click', () => {
      openModal({
        title: 'Redis 초기화',
        bodyHtml: `
          <p style="margin-bottom:12px;">이벤트 관련 Redis 상태를 초기화합니다. 인증 세션은 유지됩니다.</p>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <button type="button" class="btn btn-outline btn-block" data-redis-mode="soft" style="text-align:left;padding:12px 16px;">
              <b>Soft</b><br/><span style="font-size:12px;color:var(--color-text-secondary);">대기열 · 매진 플래그 · 활성 이벤트 포인터 초기화 (좌석 유지)</span>
            </button>
            <button type="button" class="btn btn-outline btn-block" data-redis-mode="hard" style="text-align:left;padding:12px 16px;border-color:#e74c3c;">
              <b>Hard</b><br/><span style="font-size:12px;color:var(--color-text-secondary);">위 항목 + 전체 좌석 키 삭제 + DB에서 이벤트 목록 재동기화</span>
            </button>
            <button type="button" class="btn btn-outline btn-block" data-redis-mode="resync" style="text-align:left;padding:12px 16px;">
              <b>Resync</b><br/><span style="font-size:12px;color:var(--color-text-secondary);">MariaDB 기준으로 이벤트 목록 캐시만 재구성 (좌석·대기열 유지)</span>
            </button>
          </div>
        `,
        footerHtml: '<button type="button" class="btn btn-outline" data-modal-close>취소</button>',
      });
      document.querySelectorAll('[data-redis-mode]').forEach((modeBtn) => {
        modeBtn.addEventListener('click', () => {
          const mode = modeBtn.dataset.redisMode;
          closeModal();
          authFetch('/admin/redis/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode }),
          })
            .then((r) => r.json())
            .then((result) => {
              if (result.success) {
                showToast({ title: `Redis 초기화 완료 (${mode})`, body: result.cleared.join(', '), type: 'success' });
                refreshEventsList(container);
              } else {
                showToast({ title: 'Redis 초기화 실패', body: result.message || '알 수 없는 오류' });
              }
            })
            .catch(() => showToast({ title: 'Redis 초기화 요청 실패', body: '서버 연결을 확인해주세요.' }));
        });
      });
    });

    container.querySelector('[data-redis-recover]').addEventListener('click', () => {
      openModal({
        title: 'MariaDB → Redis 복구',
        bodyHtml: `
          <p style="margin-bottom:12px;">Redis가 비어있을 때 MariaDB 데이터를 기반으로 복구합니다.</p>
          <p style="font-size:13px;color:var(--color-text-secondary);margin-bottom:16px;">이벤트 목록, 좌석 상태, 대기열을 모두 복원합니다.<br/>이미 Redis에 데이터가 있는 항목은 건너뜁니다.</p>
          <button type="button" class="btn btn-primary btn-block" data-do-recover>복구 실행</button>
        `,
        footerHtml: '<button type="button" class="btn btn-outline" data-modal-close>취소</button>',
      });
      document.querySelector('[data-do-recover]')?.addEventListener('click', () => {
        closeModal();
        authFetch('/admin/redis/recover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
          .then((r) => r.json())
          .then((result) => {
            if (result.success) {
              const r = result.results;
              const summary = [
                r.events?.recovered ? `이벤트 ${r.events.count}개` : null,
                r.seats?.recovered ? `좌석 ${r.seats.total}석` : (r.seats?.message || null),
                r.queue?.recovered ? `대기열 (eligible=${r.queue.eligible}, standby=${r.queue.standby})` : (r.queue?.message || null),
              ].filter(Boolean).join(' · ');
              showToast({ title: `Redis 복구 완료`, body: summary || '복구할 데이터 없음', type: 'success' });
              refreshEventsList(container);
            } else {
              showToast({ title: 'Redis 복구 실패', body: result.message || '알 수 없는 오류' });
            }
          })
          .catch(() => showToast({ title: 'Redis 복구 요청 실패', body: '서버 연결을 확인해주세요.' }));
      });
    });

    return () => {
      clearInterval(openStatusTimer);
      cleanupAdminInteractions();
      cleanupCommandPalette();
    };
  },
};
