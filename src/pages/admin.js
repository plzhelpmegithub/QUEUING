import { CONCERTS } from '../data/concerts.js';
import { isAdmin, isLoggedIn } from '../state/store.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { formatDeadline } from '../utils/format.js';

// Mock 콘서트 카탈로그(data/concerts.js)와 동일한 관례로 기본값을 채워둠 — VIP/R/S/A 4등급,
// 실제 Redis에 좌석을 그만큼 생성하므로(수만 석은 데모에 과함) 개수는 축소해서 기본 제공
const GRADE_DEFAULTS = [
  { key: 'VIP', seats: 20, price: 180000 },
  { key: 'R', seats: 50, price: 140000 },
  { key: 'S', seats: 80, price: 110000 },
  { key: 'A', seats: 100, price: 80000 },
];

function createEventGradeRowHtml(g) {
  return `
    <tr data-grade-row="${g.key}">
      <td><b>${g.key}</b></td>
      <td><input type="number" min="0" data-grade-seats="${g.key}" value="${g.seats}" style="width:90px;" /></td>
      <td><input type="number" min="0" step="1000" data-grade-price="${g.key}" value="${g.price}" style="width:120px;" /></td>
    </tr>
  `;
}

function createEvent(payload) {
  return fetch('/event/create', {
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
  { artist: 'Stray Kids', eventName: 'Stray Kids 2026 WORLD TOUR [THUNDEROUS : UNCHAINED]', eventDate: '2026-11-14', venue: '고척스카이돔', sessions: [{ date: '2026-11-14', time: '18:00' }, { date: '2026-11-15', time: '17:00' }] },
  { artist: 'RIIZE', eventName: 'RIIZE 2026 FAN CONCERT [GET A GUITAR : FIRST LIGHT]', eventDate: '2026-11-22', venue: 'YES24 LIVE HALL', sessions: [{ date: '2026-11-22', time: '18:00' }, { date: '2026-11-23', time: '17:00' }] },
  { artist: 'IVE', eventName: 'IVE 2026 CONCERT [AFTER LIKE : THE CROWN]', eventDate: '2026-11-28', venue: 'KSPO DOME', sessions: [{ date: '2026-11-28', time: '18:00' }, { date: '2026-11-29', time: '17:00' }] },
  { artist: 'DAY6', eventName: 'DAY6 2026 CONCERT [한 페이지가 될 수 있게 : FOREVER YOUNG]', eventDate: '2026-11-29', venue: 'KSPO DOME', sessions: [{ date: '2026-11-29', time: '18:00' }, { date: '2026-11-30', time: '17:00' }] },
  { artist: '(G)I-DLE', eventName: '(G)I-DLE 2026 WORLD TOUR [SUPER LADY : QUEENDOM]', eventDate: '2026-12-05', venue: '고척스카이돔', sessions: [{ date: '2026-12-05', time: '18:00' }, { date: '2026-12-06', time: '17:00' }] },
  { artist: 'TXT', eventName: 'TOMORROW X TOGETHER 2026 WORLD TOUR [STAR SEEKERS : ACT TWO]', eventDate: '2026-12-12', venue: 'KSPO DOME', sessions: [{ date: '2026-12-12', time: '18:00' }, { date: '2026-12-13', time: '17:00' }] },
  { artist: 'SEVENTEEN', eventName: 'SEVENTEEN 2026 WORLD TOUR [DIAMOND EDGE : REBORN]', eventDate: '2026-12-19', venue: 'KSPO DOME', sessions: [{ date: '2026-12-19', time: '18:00' }, { date: '2026-12-20', time: '17:00' }] },
  { artist: '백예린', eventName: '백예린 2026 CONCERT [Square : INDIE NIGHT]', eventDate: '2026-12-25', venue: '올림픽홀', sessions: [{ date: '2026-12-25', time: '19:00' }] },
  { artist: 'Heize', eventName: 'Heize 2026 CONCERT [HAPPEN IN WINTER]', eventDate: '2026-12-26', venue: '올림픽홀', sessions: [{ date: '2026-12-26', time: '20:00' }] },
  { artist: '성시경', eventName: '성시경 2026 연말콘서트 [두 사람 : YEAR-END BALLAD NIGHT]', eventDate: '2026-12-31', venue: 'KSPO DOME', sessions: [{ date: '2026-12-31', time: '20:00' }] },
  { artist: '이적', eventName: '이적 2027 CONCERT [하늘을 달리다 : VOICE OF A GENERATION]', eventDate: '2027-01-03', venue: '세종문화회관', sessions: [{ date: '2027-01-03', time: '19:00' }] },
  { artist: 'NewJeans', eventName: 'NewJeans 2027 FAN CONCERT [OMG : SUMMER DREAMING]', eventDate: '2027-01-10', venue: 'KSPO DOME', sessions: [{ date: '2027-01-10', time: '18:00' }, { date: '2027-01-11', time: '17:00' }] },
  { artist: 'BLACKPINK', eventName: 'BLACKPINK 2027 WORLD TOUR [PINK VENOM : THE FINALE]', eventDate: '2027-01-17', venue: '올림픽주경기장', sessions: [{ date: '2027-01-17', time: '18:00' }, { date: '2027-01-18', time: '17:00' }] },
  { artist: '박효신', eventName: '박효신 2027 CONCERT [SOULS AND SONGS]', eventDate: '2027-01-24', venue: '세종문화회관', sessions: [{ date: '2027-01-24', time: '19:00' }, { date: '2027-01-25', time: '18:00' }] },
  { artist: 'NCT DREAM', eventName: 'NCT DREAM 2027 CONCERT [THE DREAM SHOW 4 : WONDERLAND]', eventDate: '2027-01-31', venue: 'KSPO DOME', sessions: [{ date: '2027-01-31', time: '18:00' }, { date: '2027-02-01', time: '17:00' }] },
  { artist: 'TAEYEON', eventName: 'TAEYEON 2027 CONCERT [ONCE UPON A TIME]', eventDate: '2027-02-07', venue: 'KSPO DOME', sessions: [{ date: '2027-02-07', time: '18:00' }, { date: '2027-02-08', time: '17:00' }] },
  { artist: 'aespa', eventName: 'aespa 2027 WORLD TOUR [SUPERNOVA : SYNK HORIZON]', eventDate: '2027-02-14', venue: '고척스카이돔', sessions: [{ date: '2027-02-14', time: '18:00' }, { date: '2027-02-15', time: '17:00' }] },
  { artist: '자우림', eventName: '자우림 2027 CONCERT [스물다섯, 스물하나 : TIMELESS ECHOES]', eventDate: '2027-02-15', venue: '올림픽홀', sessions: [{ date: '2027-02-15', time: '19:00' }] },
  { artist: 'ZICO', eventName: 'ZICO 2027 CONCERT [SPOT! : KING OF THE JUNGLE]', eventDate: '2027-02-22', venue: '고척스카이돔', sessions: [{ date: '2027-02-22', time: '19:00' }] },
  { artist: 'LE SSERAFIM', eventName: 'LE SSERAFIM 2027 WORLD TOUR [FEARLESS : FLAME RISES]', eventDate: '2027-02-28', venue: 'KSPO DOME', sessions: [{ date: '2027-02-28', time: '18:00' }, { date: '2027-03-01', time: '17:00' }] },
  { artist: 'BTS', eventName: 'BTS 2027 WORLD TOUR [BEYOND THE SCENE : ETERNAL]', eventDate: '2027-03-01', venue: '올림픽주경기장', sessions: [{ date: '2027-03-01', time: '18:00' }, { date: '2027-03-02', time: '17:00' }] },
  { artist: 'AILEE', eventName: 'AILEE 2027 CONCERT [I WILL SHOW YOU : THE POWERHOUSE]', eventDate: '2027-03-08', venue: '블루스퀘어', sessions: [{ date: '2027-03-08', time: '19:00' }] },
  { artist: 'IU', eventName: 'IU 2027 CONCERT [THE GOLDEN HOUR : CURTAIN CALL]', eventDate: '2027-03-14', venue: '올림픽주경기장', sessions: [{ date: '2027-03-14', time: '18:00' }, { date: '2027-03-15', time: '17:00' }] },
  { artist: '잔나비', eventName: '잔나비 2027 CONCERT [주저하는 연인들을 위해 : MONKEY CINEMA]', eventDate: '2027-03-15', venue: '올림픽홀', sessions: [{ date: '2027-03-15', time: '19:00' }] },
  { artist: 'EXO', eventName: 'EXO 2027 CONCERT [EXO PLANET #6 : CHRONICLE]', eventDate: '2027-03-22', venue: 'KSPO DOME', sessions: [{ date: '2027-03-22', time: '18:00' }, { date: '2027-03-23', time: '17:00' }] },
  { artist: '영탁', eventName: '영탁 2027 CONCERT [찐이야 : ALL-IN LIVE]', eventDate: '2027-03-29', venue: '고척스카이돔', sessions: [{ date: '2027-03-29', time: '18:00' }] },
  { artist: '폴킴', eventName: '폴킴 2027 CONCERT [비 : EVERY DAY EVERY MOMENT]', eventDate: '2027-04-05', venue: '올림픽홀', sessions: [{ date: '2027-04-05', time: '19:00' }] },
  { artist: 'TWICE', eventName: 'TWICE 2027 WORLD TOUR [FEEL SPECIAL : ONCE MORE]', eventDate: '2027-04-05', venue: '올림픽주경기장', sessions: [{ date: '2027-04-05', time: '18:00' }, { date: '2027-04-06', time: '17:00' }] },
  { artist: '김범수', eventName: '김범수 2027 CONCERT [보고 싶다 : A VOICE FOR ETERNITY]', eventDate: '2027-04-12', venue: '세종문화회관', sessions: [{ date: '2027-04-12', time: '19:00' }] },
  { artist: 'Red Velvet', eventName: 'Red Velvet 2027 CONCERT [CHILL KILL : THE VELVET NIGHT]', eventDate: '2027-04-19', venue: 'KSPO DOME', sessions: [{ date: '2027-04-19', time: '18:00' }, { date: '2027-04-20', time: '17:00' }] },
  { artist: '송가인', eventName: '송가인 2027 CONCERT [트로트의 여왕 : 꽃길만 걸으세요]', eventDate: '2027-04-26', venue: 'KSPO DOME', sessions: [{ date: '2027-04-26', time: '18:00' }] },
  { artist: '이승철', eventName: '이승철 2027 CONCERT [LEGEND CONTINUES]', eventDate: '2027-05-03', venue: '세종문화회관', sessions: [{ date: '2027-05-03', time: '19:00' }, { date: '2027-05-04', time: '18:00' }] },
  { artist: '임영웅', eventName: '임영웅 2027 전국투어 [IM HERO : LEGEND TOUR]', eventDate: '2027-05-10', venue: '올림픽주경기장', sessions: [{ date: '2027-05-10', time: '18:00' }, { date: '2027-05-11', time: '17:00' }] },
  { artist: 'YB', eventName: 'YB 2027 CONCERT [나는 나비 : ROCK NEVER DIES]', eventDate: '2027-05-17', venue: '올림픽홀', sessions: [{ date: '2027-05-17', time: '19:00' }] },
  { artist: '장윤정', eventName: '장윤정 2027 CONCERT [어머나! : TIMELESS DIVA]', eventDate: '2027-05-24', venue: '세종문화회관', sessions: [{ date: '2027-05-24', time: '18:00' }] },
  { artist: '이찬원', eventName: '이찬원 2027 CONCERT [진또배기 : YOUNG KING OF TROT]', eventDate: '2027-06-07', venue: 'KSPO DOME', sessions: [{ date: '2027-06-07', time: '18:00' }] },
  { artist: '선우정아', eventName: '선우정아 2027 CONCERT [도망가자 : CATHARSIS]', eventDate: '2027-06-14', venue: '블루스퀘어', sessions: [{ date: '2027-06-14', time: '19:00' }] },
  { artist: 'NELL', eventName: 'NELL 2027 CONCERT [지구가 태양을 네 번 : FOUR SEASONS]', eventDate: '2027-06-21', venue: '블루스퀘어', sessions: [{ date: '2027-06-21', time: '19:00' }] },
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

const SEATING_TYPES_CYCLE = ['arena', 'theater'];
let seatingCycleIdx = 0;
let posterCycleIdx = 0;

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

// 등급별로 각각 5000 단위로 딱 떨어지는 좌석수를 뽑음(예: VIP 5000, R 15000,
// S 20000, A 30000처럼) — 총합을 먼저 정하고 비율로 나누면 19800처럼 애매한
// 숫자가 나와서, 등급별로 독립적으로 반올림된 값을 뽑는 방식으로 바꿈
const VENUE_FIXED_SEATS = {
  '고척스카이돔': { VIP: 2000, R: 4000, S: 4000, A: 4000 },   // 합계 14,000
  '올림픽홀':     { VIP: 500,  R: 800,  S: 900,  A: 800 },     // 합계 3,000
};

const MAX_TOTAL_SEATS = 14000;
const GRADE_SEAT_RANGE = { VIP: [1, 2], R: [2, 4], S: [3, 5], A: [3, 5] }; // step(1000) 배수 범위

// 극장(theater) 좌석 고정값
const THEATER_FIXED_SEATS = { VIP: 448, R: 200, S: 30, A: 100 }; // 합계 778

function randRoundSeats(step, minMult, maxMult) {
  return step * randInt(minMult, maxMult);
}

function buildRandomEventPayload() {
  const posterData = POSTER_CONCERTS[posterCycleIdx % POSTER_CONCERTS.length];
  posterCycleIdx++;
  const artist = posterData.artist;
  const venueFixed = VENUE_FIXED_SEATS[posterData.venue];
  const seatingType = SEATING_TYPES_CYCLE[seatingCycleIdx++ % SEATING_TYPES_CYCLE.length];
  const sections = GRADE_DEFAULTS.map((g) => {
    let seats;
    if (venueFixed) {
      seats = venueFixed[g.key];
    } else if (seatingType === 'theater') {
      seats = THEATER_FIXED_SEATS[g.key];
    } else {
      seats = randRoundSeats(1000, GRADE_SEAT_RANGE[g.key][0], GRADE_SEAT_RANGE[g.key][1]);
    }
    return {
      name: g.key,
      seats,
      price: Math.round((g.price * (0.85 + Math.random() * 0.3)) / 1000) * 1000,
    };
  });
  if (!venueFixed && seatingType !== 'theater') {
    const total = sections.reduce((s, sec) => s + sec.seats, 0);
    if (total > MAX_TOTAL_SEATS) {
      const ratio = MAX_TOTAL_SEATS / total;
      sections.forEach((sec) => { sec.seats = Math.max(100, Math.round(sec.seats * ratio / 100) * 100); });
    }
  }
  return {
    eventName: posterData.eventName,
    eventDate: posterData.eventDate,
    venue: posterData.venue,
    seatingType,
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
  return fetch(`/events/${eventId}/open-time`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketOpenAt }),
  }).then((res) => res.json());
}

function setEventCloseTime(eventId, ticketCloseAt) {
  return fetch(`/events/${eventId}/close-time`, {
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
  fetch('/events')
    .then((res) => res.json())
    .then((data) => {
      eventsCache = data.events || [];
      if (eventsCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-secondary">생성된 공연이 없습니다.</td></tr>';
        return;
      }
      tbody.innerHTML = eventsCache
        .map(
          (e, i) => `
        <tr>
          <td class="num-mono">${i + 1}</td>
          <td>${e.eventName}</td>
          <td>${e.eventDate || '-'}</td>
          <td>${e.venue || '-'}</td>
          <td class="seat-tip-wrap">${Number(e.totalSeats || 0).toLocaleString()}석${(e.sections || []).length ? `<span class="seat-tip">${(e.sections || []).map(s => `<span>${s.name}: ${s.seats.toLocaleString()}석</span>`).join('')}</span>` : ''}</td>
          <td data-open-status="${e.eventId}"></td>
          <td>
            <button type="button" class="btn btn-outline btn-sm" data-set-open-time="${e.eventId}">오픈 시간</button>
            <button type="button" class="btn btn-outline btn-sm" data-set-close-time="${e.eventId}">마감 시간</button>
            <button type="button" class="btn btn-outline btn-sm" data-delete-event="${e.eventId}">삭제</button>
          </td>
        </tr>`
        )
        .join('');
      paintOpenStatuses(container);
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
      tbody.querySelectorAll('[data-delete-event]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const name = btn.closest('tr')?.children[1]?.textContent || '';
          if (!confirm(`"${name}" 공연을 삭제할까요? (좌석 데이터도 함께 삭제됩니다)`)) return;
          btn.disabled = true;
          fetch(`/events/${btn.dataset.deleteEvent}`, { method: 'DELETE' })
            .then((res) => res.json())
            .then(() => {
              showToast({ title: '공연이 삭제되었습니다', body: name });
              refreshEventsList(container);
            })
            .catch(() => {
              showToast({ title: '삭제 중 오류가 발생했습니다' });
              btn.disabled = false;
            });
        });
      });
    })
    .catch(() => {
      tbody.innerHTML = '<tr><td colspan="6" class="text-red">목록을 불러오지 못했습니다.</td></tr>';
    });
}

// datetime-local input이 기대하는 "로컬시각 그대로" 문자열(YYYY-MM-DDTHH:mm:ss)로 변환
function toDatetimeLocalValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function applyOpenTime(eventId, ticketOpenAt, successTitle, onSaved) {
  setEventOpenTime(eventId, ticketOpenAt)
    .then((result) => {
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
  const prefill = event.ticketOpenAt
    ? toDatetimeLocalValue(new Date(event.ticketOpenAt))
    : toDatetimeLocalValue(new Date(Date.now() + 5 * 60000));

  openModal({
    title: `예매 오픈 시간 설정 — ${event.eventName}`,
    bodyHtml: `
      <div class="field">
        <label>예매 오픈 일시</label>
        <input type="datetime-local" step="1" data-open-time-input value="${prefill}" />
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
        applyOpenTime(event.eventId, null, '예매가 즉시 오픈으로 설정되었습니다', onSaved);
        return;
      }
      const deltaMs = { '10s': 10000, '1m': 60000, '10m': 600000 }[preset] || 0;
      const target = new Date(Date.now() + deltaMs);
      input.value = toDatetimeLocalValue(target);
      applyOpenTime(event.eventId, target.toISOString(), `오픈 시간이 "${btn.textContent}"(으)로 설정되었습니다`, onSaved);
    });
  });

  document.querySelector('[data-clear-open-time]').addEventListener('click', () => {
    applyOpenTime(event.eventId, null, '오픈 시간 제한이 해제되었습니다', onSaved);
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
          <input type="text" name="venue" placeholder="예: 올림픽공원 체조경기장" />
        </div>
        <div class="field">
          <label>좌석 형태</label>
          <select name="seatingType">
            <option value="arena">아레나 (직사각형 좌석맵)</option>
            <option value="standing">스탠딩 (그리드)</option>
            <option value="theater">극장 (다층 직사각형)</option>
          </select>
        </div>
        <div class="field">
          <label>구역별 좌석 수 / 가격 (0으로 두면 해당 구역 제외)</label>
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

    const sections = GRADE_DEFAULTS.map((g) => {
      const seats = parseInt(form.querySelector(`[data-grade-seats="${g.key}"]`).value, 10) || 0;
      const price = parseInt(form.querySelector(`[data-grade-price="${g.key}"]`).value, 10) || 0;
      return { name: g.key, seats, price };
    }).filter((s) => s.seats > 0);

    if (sections.length === 0) {
      errEl.textContent = '최소 1개 구역은 좌석 수가 1석 이상이어야 합니다.';
      return;
    }

    if (eventsCache.some((e) => e.eventName === eventName)) {
      errEl.textContent = '이미 동일한 이름의 공연이 존재합니다.';
      return;
    }

    errEl.textContent = '';
    submitBtn.disabled = true;

    createEvent({
      eventName,
      eventDate: form.eventDate.value || undefined,
      venue: form.venue.value.trim() || undefined,
      seatingType: form.seatingType.value,
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

export const adminPage = {
  render(container) {
    if (!isAdmin()) {
      showToast({ title: '접근 권한이 없습니다', body: isLoggedIn() ? '관리자만 이용할 수 있는 페이지입니다.' : '로그인이 필요한 페이지입니다.' });
      navigate('');
      return;
    }

    container.innerHTML = `
      <div class="container admin-topbar">
        <div>
          <div class="eyebrow">ADMIN CONSOLE</div>
          <h2 class="section-title">공연 관리</h2>
          <p class="section-sub">공연 생성 · 오픈 시간 설정 · 삭제</p>
        </div>
        <div class="admin-status">
          <button type="button" class="btn btn-primary btn-sm" data-open-create-event>+ 공연 생성</button>
          <button type="button" class="btn btn-outline btn-sm" data-random-create-event>📋 포스터 공연 생성</button>

        </div>
      </div>

      <div class="container admin-grid">
        <div class="admin-panel admin-panel--wide">
          <div class="mchart__head"><span class="mchart__title">생성된 공연 목록</span></div>
          <table class="qtable">
            <thead><tr><th>No.</th><th>공연명</th><th>날짜</th><th>장소</th><th>총좌석</th><th>예매 상태</th><th></th></tr></thead>
            <tbody data-events-tbody><tr><td colspan="7" class="text-secondary">불러오는 중...</td></tr></tbody>
          </table>
        </div>
      </div>
    `;

    refreshEventsList(container);
    const openStatusTimer = setInterval(() => paintOpenStatuses(container), 1000);

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

    return () => {
      clearInterval(openStatusTimer);
    };
  },
};
