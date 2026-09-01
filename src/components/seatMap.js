// Interactive venue seat map — Canvas 2D rendering with grid layout.
// Rectangular grid layout with zoom/pan, spatial-indexed hit-testing, and hover tooltips.

const SEAT_D = 14;
const SEAT_STEP = 20;
const GRADE_GAP = 30;
const STAGE_W = 280;
const STAGE_H = 36;
const STAGE_TOP = 18;
const SEATS_START_Y = STAGE_TOP + STAGE_H + 40;

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5;
// LOD 기준: 이 배율보다 작으면 개별 좌석을 렌더링하거나 클릭 판정하지 않습니다.
// 배경/구역 블록만 보여 주고, 기준 배율 이상에서만 좌석을 표시합니다.
const SEAT_LOD_ZOOM_THRESHOLD = 0.4;
const WHEEL_K = 0.0012;
const ZOOM_STEP = 1.25;
const DRAG_THRESHOLD = 4;
const HIT_RADIUS = SEAT_D / 2 + 8;
const GRID_CELL = 50;

const SEAT_FILL = '#7C4DFF';
const SEAT_BORDER = '#5E35D8';
const BAND_COLOR = '#9E9E9E';

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Layout (rectangular grid) ──────────────────────────────────────
const GRADE_PRIORITY = { VIP: 0, R: 1, S: 2, A: 3 };

function computeLayout(sections, seats) {
  const gradeOrder = [];
  const seen = new Set();
  const secByGrade = {};
  sections.forEach((sec, i) => {
    if (!seen.has(sec.grade)) {
      seen.add(sec.grade);
      gradeOrder.push(sec.grade);
      secByGrade[sec.grade] = { ...sec, _idx: i };
    }
  });
  gradeOrder.sort((a, b) => {
    const pa = GRADE_PRIORITY[a] ?? 100 + secByGrade[a]._idx;
    const pb = GRADE_PRIORITY[b] ?? 100 + secByGrade[b]._idx;
    return pa - pb;
  });

  const byGrade = {};
  gradeOrder.forEach((g) => (byGrade[g] = []));
  seats.forEach((s) => {
    if (byGrade[s.grade]) byGrade[s.grade].push(s);
  });

  const maxPerRow = Math.max(40, Math.ceil(Math.sqrt(seats.length) * 1.6));
  const totalW = maxPerRow * SEAT_STEP;
  const cx = totalW / 2;

  let curY = SEATS_START_Y;
  const positioned = [];
  const zones = [];

  gradeOrder.forEach((grade) => {
    const gs = byGrade[grade];
    if (!gs.length) return;
    const sec = secByGrade[grade];
    const yStart = curY;
    let idx = 0;

    while (idx < gs.length) {
      const rowCount = Math.min(maxPerRow, gs.length - idx);
      const rowW = rowCount * SEAT_STEP;
      const startX = cx - rowW / 2 + SEAT_STEP / 2;
      for (let c = 0; c < rowCount; c++) {
        gs[idx]._x = startX + c * SEAT_STEP;
        gs[idx]._y = curY;
        gs[idx]._displayNum = idx + 1;
        positioned.push(gs[idx]);
        idx++;
      }
      curY += SEAT_STEP;
    }

    zones.push({ grade, label: sec.label || grade, yStart, yEnd: curY - SEAT_STEP });
    curY += GRADE_GAP;
  });

  const PAD = 40;
  return {
    seats: positioned,
    zones,
    canvasW: totalW + PAD * 2,
    canvasH: curY + PAD,
    offsetX: PAD,
    cx: cx + PAD,
  };
}

// ── SVG background (grid) ──────────────────────────────────────────
function buildBgSvg(layout) {
  const { zones, canvasW, canvasH, cx } = layout;
  const bands = zones.map((z) =>
    `<rect x="20" y="${z.yStart - SEAT_STEP / 2}" width="${canvasW - 40}" height="${z.yEnd - z.yStart + SEAT_STEP}" rx="8" fill="${BAND_COLOR}" fill-opacity="0.06" stroke="${BAND_COLOR}" stroke-opacity="0.12" stroke-width="1"/>`
  ).join('');

  const labels = zones.map((z) => {
    const midY = (z.yStart + z.yEnd) / 2;
    return `<text x="14" y="${midY + 4}" font-size="13" font-weight="800" fill="#666" text-anchor="start" opacity="0.7">${z.label}</text>`;
  }).join('');

  return `<svg width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="stg" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#444"/><stop offset="100%" stop-color="#181818"/></linearGradient></defs>
    <rect x="${cx - STAGE_W / 2}" y="${STAGE_TOP}" width="${STAGE_W}" height="${STAGE_H}" rx="8" fill="url(#stg)"/>
    <text x="${cx}" y="${STAGE_TOP + STAGE_H / 2 + 5}" text-anchor="middle" fill="#fff" font-size="13" font-weight="800" letter-spacing="4">S T A G E</text>
    ${bands}${labels}
  </svg>`;
}

// ── Zoom / Pan helpers ──────────────────────────────────────────────
function clampPan(state, layout, viewport) {
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const cw = layout.canvasW * state.scale;
  const ch = layout.canvasH * state.scale;
  if (cw <= vw) {
    state.tx = (vw - cw) / 2;
  } else {
    state.tx = Math.min(0, Math.max(vw - cw, state.tx));
  }
  if (ch <= vh) {
    state.ty = (vh - ch) / 2;
  } else {
    state.ty = Math.min(0, Math.max(vh - ch, state.ty));
  }
}

function fitView(state, layout, viewport, minZoom) {
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const sx = vw / layout.canvasW;
  const sy = vh / layout.canvasH;
  state.scale = Math.min(sx, sy) * 0.92;
  state.scale = Math.max(minZoom || 0.005, Math.min(ZOOM_MAX, state.scale));
  clampPan(state, layout, viewport);
}

// ── Tooltip ─────────────────────────────────────────────────────────
function showTooltip(tooltipEl, e, seat, secLabel) {
  const statusText = {
    sold: '매진',
    holding: '다른 사용자 선택 중',
    mine: '내 좌석',
    available: '선택 가능',
  };
  const grade = secLabel || seat.label || seat.grade;
  const block = seat._block ? ` (${seat._block})` : '';
  const loc = `${seat._displayNum || seat.seatNum}번`;
  tooltipEl.innerHTML = `<strong>${grade}${block}</strong><br>${loc}<br><span style="opacity:0.7">${statusText[seat.status] || '선택 가능'}</span>`;
  tooltipEl.classList.add('show');
  tooltipEl.style.left = `${e.clientX + 14}px`;
  tooltipEl.style.top = `${e.clientY - 10}px`;
}

function hideTooltip(tooltipEl) {
  tooltipEl.classList.remove('show');
}

// ── Olympic Hall layout (image-based) ─────────────────────────────
// Canvas size matches the venue image (1991×1537 px).
// Each block defines x, y (top-left), w, h (pixel extent) — measured from image.
// cols/rows are computed from w/h to fill the area. Step sizes are per-block.
const OH_W = 1991;
const OH_H = 1537;
const OH_SEAT_RATIO = 0.7;

// Each block: { id, grade, x, y, w, h, cols, rows }
// Coordinates measured from actual seat-colored regions in 올림픽홀.jpg.
const OH_BLOCKS = [
  { id: 'Floor',  grade: 'VIP', x: 525,  y: 255,  w: 635, h: 285, cols: 38, rows: 20 },
  { id: 'A1',     grade: 'R',   x: 171,  y: 270,  w: 178, h: 125, cols: 13, rows: 10 },
  { id: 'A2',     grade: 'R',   x: 171,  y: 430,  w: 178, h: 135, cols: 13, rows: 10 },
  { id: 'E1',     grade: 'R',   x: 1643, y: 270,  w: 178, h: 125, cols: 13, rows: 10 },
  { id: 'E2',     grade: 'R',   x: 1643, y: 430,  w: 178, h: 135, cols: 13, rows: 10 },
  { id: 'G',      grade: 'R',   x: 250,  y: 225,  w: 271, h: 95,  cols: 20, rows: 6 },
  { id: 'H',      grade: 'R',   x: 1520, y: 225,  w: 152, h: 105, cols: 12, rows: 7 },
  { id: 'B1',     grade: 'S',   x: 270,  y: 310,  w: 270, h: 380, cols: 20, rows: 26 },
  { id: 'D1',     grade: 'S',   x: 1380, y: 310,  w: 280, h: 380, cols: 21, rows: 26 },
  { id: 'F1',     grade: 'S',   x: 435,  y: 535,  w: 150, h: 285, cols: 10, rows: 19 },
  { id: 'F2',     grade: 'S',   x: 600,  y: 585,  w: 575, h: 230, cols: 30, rows: 16 },
  { id: 'F3',     grade: 'S',   x: 1388, y: 535,  w: 72,  h: 285, cols: 5,  rows: 19 },
  { id: 'A3',     grade: 'A',   x: 171,  y: 605,  w: 178, h: 145, cols: 13, rows: 11 },
  { id: 'A4',     grade: 'A',   x: 171,  y: 780,  w: 178, h: 135, cols: 13, rows: 10 },
  { id: 'E3',     grade: 'A',   x: 1643, y: 605,  w: 178, h: 145, cols: 13, rows: 11 },
  { id: 'E4',     grade: 'A',   x: 1643, y: 780,  w: 178, h: 135, cols: 13, rows: 10 },
  { id: 'B2',     grade: 'A',   x: 240,  y: 690,  w: 280, h: 275, cols: 21, rows: 19 },
  { id: 'D2',     grade: 'A',   x: 1388, y: 690,  w: 330, h: 275, cols: 25, rows: 19 },
  { id: '2F 좌',  grade: 'A',   x: 300,  y: 945,  w: 695, h: 450, cols: 38, rows: 31 },
  { id: '2F 우',  grade: 'A',   x: 900,  y: 945,  w: 690, h: 450, cols: 38, rows: 31 },
];

function computeOlympicHallLayout(sections, seats) {
  const secByGrade = {};
  sections.forEach((sec) => { secByGrade[sec.grade] = sec; });

  // Group seats by grade
  const byGrade = {};
  seats.forEach((s) => {
    if (!byGrade[s.grade]) byGrade[s.grade] = [];
    byGrade[s.grade].push(s);
  });

  // Group blocks by grade (preserving order)
  const blocksByGrade = {};
  OH_BLOCKS.forEach((b) => {
    if (!blocksByGrade[b.grade]) blocksByGrade[b.grade] = [];
    blocksByGrade[b.grade].push(b);
  });

  const positioned = [];
  const zones = [];

  for (const grade of Object.keys(blocksByGrade)) {
    const gs = byGrade[grade] || [];
    const blocks = blocksByGrade[grade];
    const caps = blocks.map((b) => b.cols * b.rows);
    const totalCap = caps.reduce((s, c) => s + c, 0);
    const total = gs.length;

    // Proportional allocation: floor, then distribute remainder
    const alloc = caps.map((c) => Math.min(c, Math.floor(total * c / totalCap)));
    let rem = total - alloc.reduce((s, c) => s + c, 0);
    for (let i = 0; i < blocks.length && rem > 0; i++) {
      if (alloc[i] < caps[i]) { alloc[i]++; rem--; }
    }

    let idx = 0;
    blocks.forEach((block, bi) => {
      const count = Math.min(alloc[bi], gs.length - idx);
      const stepX = block.w / block.cols;
      const stepY = block.h / block.rows;
      for (let i = 0; i < count; i++) {
        const s = gs[idx + i];
        s._x = block.x + (i % block.cols) * stepX + stepX / 2;
        s._y = block.y + Math.floor(i / block.cols) * stepY + stepY / 2;
        s._sw = Math.max(4, stepX * OH_SEAT_RATIO);
        s._sh = Math.max(4, stepY * OH_SEAT_RATIO);
        s._displayNum = idx + i + 1;
        s._block = block.id;
        positioned.push(s);
      }
      idx += count;
    });

    const sec = secByGrade[grade];
    zones.push({ grade, label: sec?.label || grade });
  }

  return { seats: positioned, zones, canvasW: OH_W, canvasH: OH_H, offsetX: 0, isOlympicHall: true, bgImageUrl: '/images/seatmaps/올림픽홀.jpg' };
}

// ── Theater layout ─────────────────────────────────────────────────
const TH_CX = 500;
const TH_STEP = 22;
const TH_STAGE_W = 280;
const TH_STAGE_H = 36;
const TH_STAGE_TOP = 18;

const TH_BLOCKS = {
  VIP: [
    { x: 155, y: 78, maxCols: 16, label: 'A' },
    { x: 520, y: 78, maxCols: 16, label: 'B' },
  ],
  R: [
    { x: 220, y: 400, maxCols: 10, label: 'C' },
    { x: 565, y: 400, maxCols: 10, label: 'D' },
  ],
  S: [
    { x: 42, y: 108, maxCols: 2, label: 'A' },
    { x: 42, y: 220, maxCols: 2, label: 'B' },
    { x: 42, y: 332, maxCols: 2, label: 'C' },
    { x: 920, y: 108, maxCols: 2, label: 'G' },
    { x: 920, y: 220, maxCols: 2, label: 'F' },
    { x: 920, y: 332, maxCols: 2, label: 'E' },
  ],
  A: [
    { x: 175, y: 655, maxCols: 10, label: 'A' },
    { x: 385, y: 655, maxCols: 10, label: 'B' },
    { x: 595, y: 655, maxCols: 10, label: 'C' },
    { x: 315, y: 775, maxCols: 14, label: '3F' },
  ],
};

function computeTheaterLayout(sections, seats) {
  const gradeOrder = [];
  const seen = new Set();
  const secByGrade = {};
  sections.forEach((sec, i) => {
    if (!seen.has(sec.grade)) {
      seen.add(sec.grade);
      gradeOrder.push(sec.grade);
      secByGrade[sec.grade] = { ...sec, _idx: i };
    }
  });
  gradeOrder.sort((a, b) => (GRADE_PRIORITY[a] ?? 100) - (GRADE_PRIORITY[b] ?? 100));

  const byGrade = {};
  gradeOrder.forEach((g) => (byGrade[g] = []));
  seats.forEach((s) => { if (byGrade[s.grade]) byGrade[s.grade].push(s); });

  const positioned = [];
  const zones = [];

  gradeOrder.forEach((grade) => {
    const gs = byGrade[grade];
    if (!gs.length) return;
    const blocks = TH_BLOCKS[grade] || [{ x: TH_CX - 100, y: 500, maxCols: 10, label: grade }];
    const perBlock = Math.ceil(gs.length / blocks.length);
    let idx = 0;

    blocks.forEach((block) => {
      const count = Math.min(perBlock, gs.length - idx);
      for (let i = 0; i < count; i++) {
        const s = gs[idx + i];
        s._x = block.x + (i % block.maxCols) * TH_STEP;
        s._y = block.y + Math.floor(i / block.maxCols) * TH_STEP;
        s._displayNum = idx + i + 1;
        positioned.push(s);
      }
      idx += count;
    });

    const sec = secByGrade[grade];
    zones.push({ grade, label: sec?.label || grade });
  });

  let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
  positioned.forEach((s) => {
    if (s._x < minX) minX = s._x;
    if (s._x > maxX) maxX = s._x;
    if (s._y > maxY) maxY = s._y;
  });

  const PAD = 50;
  const offsetX = PAD - minX;
  positioned.forEach((s) => { s._x += offsetX; });

  return { seats: positioned, zones, canvasW: maxX - minX + PAD * 2, canvasH: maxY + PAD * 2, offsetX, isTheater: true };
}

function buildTheaterBgSvg(layout) {
  const { canvasW, canvasH, offsetX } = layout;
  let rowNums = '';
  for (let r = 1; r <= 14; r++) {
    rowNums += `<text x="${TH_CX}" y="${78 + (r - 1) * TH_STEP + 6}" text-anchor="middle" fill="#666" font-size="10" opacity="0.5">${r}</text>`;
  }
  for (let r = 1; r <= 10; r++) {
    rowNums += `<text x="208" y="${400 + (r - 1) * TH_STEP + 6}" text-anchor="end" fill="#666" font-size="9" opacity="0.4">${r}</text>`;
  }
  for (let r = 1; r <= 10; r++) {
    rowNums += `<text x="776" y="${400 + (r - 1) * TH_STEP + 6}" text-anchor="start" fill="#666" font-size="9" opacity="0.4">${r}</text>`;
  }
  return `<svg width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="stg" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#444"/><stop offset="100%" stop-color="#181818"/></linearGradient></defs>
    <g transform="translate(${offsetX},0)">
      <rect x="${TH_CX - TH_STAGE_W / 2}" y="${TH_STAGE_TOP}" width="${TH_STAGE_W}" height="${TH_STAGE_H}" rx="6" fill="url(#stg)"/>
      <text x="${TH_CX}" y="${TH_STAGE_TOP + TH_STAGE_H / 2 + 5}" text-anchor="middle" fill="#fff" font-size="13" font-weight="800" letter-spacing="3">STAGE</text>

      <rect x="130" y="60" width="740" height="555" rx="14" fill="none" stroke="#444" stroke-opacity="0.18"/>

      <text x="320" y="68" text-anchor="middle" fill="#888" font-size="16" font-weight="700">A</text>
      <text x="685" y="68" text-anchor="middle" fill="#888" font-size="16" font-weight="700">B</text>
      <text x="320" y="390" text-anchor="middle" fill="#888" font-size="14" font-weight="700">C</text>
      <text x="664" y="390" text-anchor="middle" fill="#888" font-size="14" font-weight="700">D</text>
      ${rowNums}

      <rect x="${TH_CX - 57}" y="487" width="114" height="28" rx="4" fill="#333" fill-opacity="0.3" stroke="#555" stroke-opacity="0.3"/>
      <text x="${TH_CX}" y="506" text-anchor="middle" fill="#888" font-size="11" font-weight="600">F.O.H</text>

      <text x="${TH_CX}" y="610" text-anchor="middle" fill="#666" font-size="15" font-weight="700" opacity="0.5">1F</text>
      <line x1="140" y1="618" x2="860" y2="618" stroke="#555" stroke-opacity="0.25" stroke-dasharray="5"/>

      <text x="65" y="88" text-anchor="middle" fill="#666" font-size="14" font-weight="700" opacity="0.5">2F</text>
      <text x="935" y="88" text-anchor="middle" fill="#666" font-size="14" font-weight="700" opacity="0.5">2F</text>
      <rect x="30" y="95" width="70" height="310" rx="6" fill="none" stroke="#444" stroke-opacity="0.15"/>
      <rect x="905" y="95" width="70" height="310" rx="6" fill="none" stroke="#444" stroke-opacity="0.15"/>
      <text x="65" y="102" text-anchor="middle" fill="#777" font-size="12" font-weight="600">A</text>
      <text x="65" y="214" text-anchor="middle" fill="#777" font-size="12" font-weight="600">B</text>
      <text x="65" y="326" text-anchor="middle" fill="#777" font-size="12" font-weight="600">C</text>
      <text x="935" y="102" text-anchor="middle" fill="#777" font-size="12" font-weight="600">G</text>
      <text x="935" y="214" text-anchor="middle" fill="#777" font-size="12" font-weight="600">F</text>
      <text x="935" y="326" text-anchor="middle" fill="#777" font-size="12" font-weight="600">E</text>

      <text x="${TH_CX}" y="640" text-anchor="middle" fill="#666" font-size="15" font-weight="700" opacity="0.5">2F</text>
      <text x="275" y="647" text-anchor="middle" fill="#777" font-size="13" font-weight="600">A</text>
      <text x="485" y="647" text-anchor="middle" fill="#777" font-size="13" font-weight="600">B</text>
      <text x="695" y="647" text-anchor="middle" fill="#777" font-size="13" font-weight="600">C</text>

      <line x1="250" y1="755" x2="750" y2="755" stroke="#555" stroke-opacity="0.15"/>
      <text x="${TH_CX}" y="768" text-anchor="middle" fill="#666" font-size="15" font-weight="700" opacity="0.5">3F</text>
    </g>
  </svg>`;
}

// ── Spatial grid for Canvas hit-testing ─────────────────────────────
function buildSpatialGrid(layoutSeats) {
  const grid = new Map();
  layoutSeats.forEach((s, i) => {
    const cx = Math.floor(s._x / GRID_CELL);
    const cy = Math.floor(s._y / GRID_CELL);
    const key = (cx << 16) | (cy & 0xFFFF);
    let bucket = grid.get(key);
    if (!bucket) { bucket = []; grid.set(key, bucket); }
    bucket.push(i);
  });
  return grid;
}

function findSeatAtLayout(grid, layoutSeats, lx, ly) {
  const cx = Math.floor(lx / GRID_CELL);
  const cy = Math.floor(ly / GRID_CELL);
  let best = null, bestDist = Infinity;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const key = ((cx + dx) << 16) | ((cy + dy) & 0xFFFF);
      const bucket = grid.get(key);
      if (!bucket) continue;
      for (let k = 0; k < bucket.length; k++) {
        const s = layoutSeats[bucket[k]];
        const d = Math.hypot(s._x - lx, s._y - ly);
        if (d < bestDist) { bestDist = d; best = s; }
      }
    }
  }
  return bestDist <= HIT_RADIUS ? best : null;
}

// ── Mount (Canvas 2D) ──────────────────────────────────────────────
export function mountSeatMap(el, { sections, seats, onSeatClick, cancelMode = false, readOnly = false, seatingType, venue }) {
  const isTheater = seatingType === 'theater';
  const isOlympicHall = venue === '올림픽홀';
  const layout = isOlympicHall ? computeOlympicHallLayout(sections, seats)
    : isTheater ? computeTheaterLayout(sections, seats)
    : computeLayout(sections, seats);
  const idToSeat = new Map();
  seats.forEach((s) => idToSeat.set(s.id, s));

  const idToLayoutSeat = new Map();
  layout.seats.forEach((s) => idToLayoutSeat.set(s.id, s));

  const scrollParent = el.closest('.seatmap-scroll');
  if (scrollParent) {
    scrollParent.style.maxHeight = 'none';
    scrollParent.style.overflow = 'hidden';
    scrollParent.style.padding = '0';
    scrollParent.style.border = 'none';
    scrollParent.style.background = 'none';
  }
  el.style.padding = '0';

  const gradeColorMap = Object.fromEntries(sections.map((s) => [s.grade, s.color || SEAT_FILL]));

  const statusChips = readOnly
    ? `<span class="vm-legend__item"><span class="vm-legend__dot" style="background:${SEAT_FILL};border-color:${SEAT_BORDER}"></span>보유 좌석</span>`
    : `<span class="vm-legend__item">선택 가능 (구역별 색상은 우측 목록 참고)</span>
       <span class="vm-legend__item"><span class="vm-legend__dot" style="background:var(--color-primary);border-color:var(--color-primary-dark)"></span>내 좌석</span>
       <span class="vm-legend__item"><span class="vm-legend__dot" style="background:#F0A030;border-color:#C88010"></span>선택중</span>
       <span class="vm-legend__item"><span class="vm-legend__dot" style="background:#BCBCBC;border-color:#999"></span>매진</span>`;

  el.innerHTML = `
    <div class="vm-legend">${statusChips}</div>
    <div class="vm-viewport" data-viewport>
      <canvas data-seat-canvas style="position:absolute;top:0;left:0;width:100%;height:100%"></canvas>
      <div class="vm-zoom-controls">
        <button type="button" class="vm-zoom-btn" data-zoom-in aria-label="확대">+</button>
        <button type="button" class="vm-zoom-btn" data-zoom-out aria-label="축소">−</button>
        <button type="button" class="vm-zoom-btn vm-zoom-btn--reset" data-zoom-reset aria-label="원래 크기로">⟲</button>
      </div>
    </div>
    <div class="vm-tooltip" data-tooltip></div>
    <div class="vm-zoom-hint" data-hint>마우스 스크롤로 확대/축소 · 드래그로 이동</div>
  `;

  const cvs = el.querySelector('[data-seat-canvas]');
  const viewport = el.querySelector('[data-viewport]');
  const tooltipEl = el.querySelector('[data-tooltip]');
  const hintEl = el.querySelector('[data-hint]');
  const ctx = cvs.getContext('2d');

  // Load background image (venue JPG or SVG)
  const bgImg = new Image();
  let bgReady = false;
  bgImg.onload = () => { bgReady = true; paint(); };
  if (layout.bgImageUrl) {
    bgImg.src = layout.bgImageUrl;
  } else {
    const svgStr = isTheater ? buildTheaterBgSvg(layout) : buildBgSvg(layout);
    bgImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
  }

  // Spatial grid
  const grid = buildSpatialGrid(layout.seats);

  function viewportToLayout(vx, vy) {
    return { x: (vx - state.tx) / state.scale, y: (vy - state.ty) / state.scale };
  }

  // ── State ──
  const state = { scale: 1, tx: 0, ty: 0 };
  let hoveredSeat = null;
  let holdingPhase = 0;
  let animRunning = false;
  let destroyed = false;

  const zoomMin = Math.min(ZOOM_MIN, Math.min(
    viewport.clientWidth / layout.canvasW,
    viewport.clientHeight / layout.canvasH,
  ) * 0.85);

  fitView(state, layout, viewport, zoomMin);

  // ── Canvas resize ──
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (cvs.width !== vw * dpr || cvs.height !== vh * dpr) {
      cvs.width = vw * dpr;
      cvs.height = vh * dpr;
    }
  }

  // ── Paint ──
  function paint() {
    if (destroyed) return;
    const dpr = window.devicePixelRatio || 1;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    resizeCanvas();

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, vw, vh);

    ctx.save();
    ctx.translate(state.tx, state.ty);
    ctx.scale(state.scale, state.scale);

    if (bgReady) ctx.drawImage(bgImg, 0, 0, layout.canvasW, layout.canvasH);

    const r = SEAT_D / 2;

    // LOD: 모든 공연장 레이아웃에서 기준 배율 미만이면 개별 좌석을 완전히 숨깁니다.
    // 선택 상태는 seat 객체에 계속 보존되므로 다시 확대하면 선택 좌석도 유지됩니다.
    const showSeats = state.scale >= SEAT_LOD_ZOOM_THRESHOLD;
    const seatAlphaBase = showSeats ? 1 : 0;

    // Zoom hint overlay when seats are hidden
    if (layout.bgImageUrl && !showSeats) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      const bw = 340, bh = 46;
      const bx = layout.canvasW / 2 - bw / 2, by = layout.canvasH - 100;
      const rr = 12;
      ctx.beginPath();
      ctx.moveTo(bx + rr, by);
      ctx.lineTo(bx + bw - rr, by);
      ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + rr);
      ctx.lineTo(bx + bw, by + bh - rr);
      ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - rr, by + bh);
      ctx.lineTo(bx + rr, by + bh);
      ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - rr);
      ctx.lineTo(bx, by + rr);
      ctx.quadraticCurveTo(bx, by, bx + rr, by);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('스크롤하여 확대하면 좌석이 나타납니다', layout.canvasW / 2, by + bh / 2);
      ctx.restore();
    }

    // Classify seats by visual state
    const isOH = !!layout.bgImageUrl;
    const availArr = [];
    const soldArr = [];
    const holdArr = [];
    const mineArr = [];
    // byColor only used for non-OH mode
    const byColor = {};

    for (let i = 0; i < layout.seats.length; i++) {
      const ls = layout.seats[i];
      const seat = idToSeat.get(ls.id);
      const status = seat ? seat.status : 'available';
      if (status === 'sold') { soldArr.push(ls); continue; }
      if (status === 'holding') { holdArr.push(ls); continue; }
      if (status === 'mine') { mineArr.push(ls); continue; }
      if (isOH) {
        availArr.push(ls);
      } else {
        const color = gradeColorMap[ls.grade] || SEAT_FILL;
        if (!byColor[color]) byColor[color] = [];
        byColor[color].push(ls);
      }
    }

    if (showSeats) {

    if (isOH) {
      // ── Olympic Hall: uniform purple rectangles (per-seat size) ──
      // Available
      ctx.fillStyle = hexToRgba(SEAT_FILL, 0.28);
      ctx.strokeStyle = SEAT_FILL;
      ctx.lineWidth = 0.8;
      for (let i = 0; i < availArr.length; i++) {
        const s = availArr[i];
        const sw2 = s._sw || 10, sh2 = s._sh || 10;
        ctx.fillRect(s._x - sw2 / 2, s._y - sh2 / 2, sw2, sh2);
        ctx.strokeRect(s._x - sw2 / 2, s._y - sh2 / 2, sw2, sh2);
      }

      // Sold
      if (soldArr.length) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#BCBCBC';
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 0.8;
        for (let i = 0; i < soldArr.length; i++) {
          const s = soldArr[i];
          const sw2 = s._sw || 10, sh2 = s._sh || 10;
          ctx.fillRect(s._x - sw2 / 2, s._y - sh2 / 2, sw2, sh2);
          ctx.strokeRect(s._x - sw2 / 2, s._y - sh2 / 2, sw2, sh2);
        }
        ctx.globalAlpha = 1;
      }

      // Holding (pulse)
      if (holdArr.length) {
        ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(holdingPhase));
        ctx.fillStyle = '#F0A030';
        ctx.strokeStyle = '#C88010';
        ctx.lineWidth = 0.8;
        for (let i = 0; i < holdArr.length; i++) {
          const s = holdArr[i];
          const sw2 = s._sw || 10, sh2 = s._sh || 10;
          ctx.fillRect(s._x - sw2 / 2, s._y - sh2 / 2, sw2, sh2);
          ctx.strokeRect(s._x - sw2 / 2, s._y - sh2 / 2, sw2, sh2);
        }
        ctx.globalAlpha = 1;
      }

      // Mine — larger rect with glow + checkmark
      for (let i = 0; i < mineArr.length; i++) {
        const s = mineArr[i];
        const sw2 = s._sw || 10, sh2 = s._sh || 10;
        const mw = sw2 * 1.7, mh = sh2 * 1.7;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#fff';
        ctx.fillRect(s._x - mw / 2 - 2, s._y - mh / 2 - 2, mw + 4, mh + 4);
        ctx.shadowBlur = 0;
        ctx.fillStyle = SEAT_FILL;
        ctx.fillRect(s._x - mw / 2, s._y - mh / 2, mw, mh);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(s._x - mw / 2, s._y - mh / 2, mw, mh);
        const cs = mh * 0.3;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(s._x - cs * 0.5, s._y);
        ctx.lineTo(s._x - cs * 0.1, s._y + cs * 0.5);
        ctx.lineTo(s._x + cs * 0.6, s._y - cs * 0.4);
        ctx.stroke();
        ctx.restore();
      }

    } else {
      // ── Standard mode: circles batched by grade color ────────────
      // Available seats
      for (const color in byColor) {
        const group = byColor[color];
        ctx.fillStyle = hexToRgba(color, 0.18);
        ctx.beginPath();
        for (let i = 0; i < group.length; i++) {
          const s = group[i];
          ctx.moveTo(s._x + r, s._y);
          ctx.arc(s._x, s._y, r, 0, 6.2832);
        }
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Sold
      if (soldArr.length) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#BCBCBC';
        ctx.beginPath();
        for (let i = 0; i < soldArr.length; i++) {
          const s = soldArr[i];
          ctx.moveTo(s._x + r, s._y);
          ctx.arc(s._x, s._y, r, 0, 6.2832);
        }
        ctx.fill();
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Holding (pulse)
      if (holdArr.length) {
        ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(holdingPhase));
        ctx.fillStyle = '#F0A030';
        ctx.beginPath();
        for (let i = 0; i < holdArr.length; i++) {
          const s = holdArr[i];
          ctx.moveTo(s._x + r, s._y);
          ctx.arc(s._x, s._y, r, 0, 6.2832);
        }
        ctx.fill();
        ctx.strokeStyle = '#C88010';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Mine — enlarged circle with checkmark
      for (let i = 0; i < mineArr.length; i++) {
        const s = mineArr[i];
        const color = gradeColorMap[s.grade] || SEAT_FILL;
        const mr = r * 1.7;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(s._x, s._y, mr + 3, 0, 6.2832);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(s._x, s._y, mr, 0, 6.2832);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        const cs = mr * 0.55;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(s._x - cs * 0.35, s._y + cs * 0.05);
        ctx.lineTo(s._x - cs * 0.05, s._y + cs * 0.35);
        ctx.lineTo(s._x + cs * 0.4, s._y - cs * 0.3);
        ctx.stroke();
        ctx.restore();
      }
    } // end isOH branch

    ctx.globalAlpha = 1;
    } // end showSeats

    // Hover highlight
    if (showSeats && hoveredSeat) {
      const seat = idToSeat.get(hoveredSeat.id);
      const st = seat ? seat.status : 'available';
      if (st !== 'sold' && st !== 'holding' && st !== 'mine') {
        ctx.save();
        if (isOH) {
          const hw = (hoveredSeat._sw || 10) + 2, hh = (hoveredSeat._sh || 10) + 2;
          ctx.shadowColor = 'rgba(0,0,0,0.2)';
          ctx.shadowBlur = 6;
          ctx.fillStyle = hexToRgba(SEAT_FILL, 0.5);
          ctx.fillRect(hoveredSeat._x - hw / 2, hoveredSeat._y - hh / 2, hw, hh);
          ctx.shadowBlur = 0;
          ctx.strokeStyle = hexToRgba(SEAT_FILL, 0.9);
          ctx.lineWidth = 1.5;
          ctx.strokeRect(hoveredSeat._x - hw / 2 - 1, hoveredSeat._y - hh / 2 - 1, hw + 2, hh + 2);
        } else {
          const color = gradeColorMap[hoveredSeat.grade] || SEAT_FILL;
          ctx.shadowColor = 'rgba(0,0,0,0.2)';
          ctx.shadowBlur = 8;
          ctx.fillStyle = hexToRgba(color, 0.35);
          ctx.beginPath();
          ctx.arc(hoveredSeat._x, hoveredSeat._y, r + 1, 0, 6.2832);
          ctx.fill();
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.strokeStyle = hexToRgba(color, 0.6);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(hoveredSeat._x, hoveredSeat._y, r + 3, 0, 6.2832);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    ctx.restore();
    ctx.restore();
  }

  // ── Animation loop (holding pulse) ──
  function startAnimation() {
    if (animRunning || destroyed) return;
    animRunning = true;
    function loop() {
      if (!animRunning || destroyed) return;
      holdingPhase += 0.06;
      paint();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }
  function stopAnimation() { animRunning = false; }

  // Check if holding seats exist and start animation
  function checkHolding() {
    let has = false;
    for (let i = 0; i < layout.seats.length; i++) {
      const seat = idToSeat.get(layout.seats[i].id);
      if (seat && seat.status === 'holding') { has = true; break; }
    }
    if (has && !animRunning) startAnimation();
    if (!has && animRunning) stopAnimation();
  }

  // Initial paint
  resizeCanvas();
  paint();
  checkHolding();

  // ── Resize ──
  const resizeObserver = new ResizeObserver(() => {
    clampPan(state, layout, viewport);
    paint();
  });
  resizeObserver.observe(viewport);

  // ── Zoom controls ──
  function zoomAround(mx, my, newScale) {
    newScale = Math.max(zoomMin, Math.min(ZOOM_MAX, newScale));
    state.tx = mx - ((mx - state.tx) * newScale) / state.scale;
    state.ty = my - ((my - state.ty) * newScale) / state.scale;
    state.scale = newScale;
    clampPan(state, layout, viewport);
    paint();
  }
  el.querySelector('[data-zoom-in]').addEventListener('click', () => {
    zoomAround(viewport.clientWidth / 2, viewport.clientHeight / 2, state.scale * ZOOM_STEP);
  });
  el.querySelector('[data-zoom-out]').addEventListener('click', () => {
    zoomAround(viewport.clientWidth / 2, viewport.clientHeight / 2, state.scale / ZOOM_STEP);
  });
  el.querySelector('[data-zoom-reset]').addEventListener('click', () => {
    fitView(state, layout, viewport, zoomMin);
    paint();
  });

  // ── Wheel zoom ──
  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const delta = -e.deltaY * WHEEL_K;
      zoomAround(mx, my, state.scale * (1 + delta));
      if (hintEl && hintEl.parentElement) hintEl.remove();
    },
    { passive: false }
  );

  // ── Drag pan ──
  let dragging = false;
  let dragMoved = false;
  let dragX = 0, dragY = 0;
  let dragStartX = 0, dragStartY = 0;
  let downSeat = null;

  viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.vm-zoom-controls')) return;
    dragging = true;
    dragMoved = false;

    const rect = viewport.getBoundingClientRect();
    const lp = viewportToLayout(e.clientX - rect.left, e.clientY - rect.top);
    // 축소 상태에서는 좌석 hit-test 자체를 하지 않아 클릭 선택을 차단합니다.
    downSeat = state.scale >= SEAT_LOD_ZOOM_THRESHOLD
      ? findSeatAtLayout(grid, layout.seats, lp.x, lp.y)
      : null;

    dragX = e.clientX;
    dragY = e.clientY;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    viewport.classList.add('dragging');
    viewport.setPointerCapture(e.pointerId);
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!dragging) {
      // Hover detection — only when seats are visible
      const seatsVis = state.scale >= SEAT_LOD_ZOOM_THRESHOLD;
      const rect = viewport.getBoundingClientRect();
      const lp = viewportToLayout(e.clientX - rect.left, e.clientY - rect.top);
      const hit = seatsVis ? findSeatAtLayout(grid, layout.seats, lp.x, lp.y) : null;

      if (hit !== hoveredSeat) {
        hoveredSeat = hit;
        if (hit) {
          const seatData = idToSeat.get(hit.id);
          const sec = sections.find((s) => s.grade === (seatData?.grade || hit.grade));
          showTooltip(tooltipEl, e, { ...hit, ...seatData }, sec?.label);
          const st = seatData?.status;
          viewport.style.cursor = st === 'sold' ? 'not-allowed' : st === 'holding' ? 'wait' : 'pointer';
        } else {
          hideTooltip(tooltipEl);
          viewport.style.cursor = 'grab';
        }
        if (!animRunning) paint();
      } else if (tooltipEl.classList.contains('show')) {
        tooltipEl.style.left = `${e.clientX + 14}px`;
        tooltipEl.style.top = `${e.clientY - 10}px`;
      }
      return;
    }

    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) dragMoved = true;
    state.tx += e.clientX - dragX;
    state.ty += e.clientY - dragY;
    dragX = e.clientX;
    dragY = e.clientY;
    clampPan(state, layout, viewport);
    paint();
  });

  const endDrag = () => {
    const seatsVisible = state.scale >= SEAT_LOD_ZOOM_THRESHOLD;
    if (!readOnly && dragging && !dragMoved && downSeat && seatsVisible) {
      const seatData = idToSeat.get(downSeat.id);
      const st = seatData ? seatData.status : 'available';
      if (st !== 'sold' && st !== 'holding') {
        onSeatClick(downSeat.id);
      }
    }
    dragging = false;
    downSeat = null;
    viewport.classList.remove('dragging');
  };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  // ── Touch pinch zoom ──
  let lastPinchDist = 0;
  viewport.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (lastPinchDist > 0) {
          const ratio = dist / lastPinchDist;
          const rect = viewport.getBoundingClientRect();
          const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
          const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
          zoomAround(mx, my, state.scale * ratio);
        }
        lastPinchDist = dist;
      }
    },
    { passive: false }
  );
  viewport.addEventListener('touchend', () => { lastPinchDist = 0; });

  // Dismiss hint
  setTimeout(() => {
    if (hintEl && hintEl.parentElement) {
      hintEl.style.opacity = '0';
      setTimeout(() => hintEl.remove(), 600);
    }
  }, 4000);

  return {
    updateStatuses(updatedSeats) {
      updatedSeats.forEach((s) => {
        const existing = idToSeat.get(s.id);
        if (existing) existing.status = s.status;
      });
      paint();
      checkHolding();
    },
    flashSold(id) {
      const ls = idToLayoutSeat.get(id);
      if (!ls) return;
      let frame = 0;
      const total = 8;
      function step() {
        if (frame >= total || destroyed) return;
        frame++;
        paint();
        const shake = Math.sin(frame * Math.PI * 0.5) * 3;
        const dpr = window.devicePixelRatio || 1;
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.translate(state.tx, state.ty);
        ctx.scale(state.scale, state.scale);
        ctx.translate(ls._x + shake, ls._y);
        ctx.fillStyle = '#ff4444';
        ctx.globalAlpha = 1 - frame / total;
        ctx.beginPath();
        ctx.arc(0, 0, SEAT_D / 2 + 4, 0, 6.2832);
        ctx.fill();
        ctx.restore();
        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    },
    scrollToZone(zoneId) {
      const zoneSeats = layout.seats.filter((s) => s.grade === zoneId);
      if (!zoneSeats.length) return;
      let sumX = 0, sumY = 0;
      zoneSeats.forEach((s) => { sumX += s._x; sumY += s._y; });
      const cx = sumX / zoneSeats.length;
      const cy = sumY / zoneSeats.length;
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      state.scale = Math.max(1.2, state.scale);
      state.tx = vw / 2 - cx * state.scale;
      state.ty = vh / 2 - cy * state.scale;
      clampPan(state, layout, viewport);
      paint();
    },
    destroy() {
      destroyed = true;
      animRunning = false;
      resizeObserver.disconnect();
      hoveredSeat = null;
    },
  };
}
