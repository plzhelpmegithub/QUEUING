// Interactive venue seat map — Canvas 2D rendering with grid layout.
// Rectangular grid layout with zoom/pan, spatial-indexed hit-testing, and hover tooltips.

import { OLYMPIC_HALL } from '../data/olympicHallSeats.js';

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
const MINE_FILL = '#E31B23';
const MINE_BORDER = '#B5121B';
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
    disabled: '배정되지 않은 좌석',
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

// ── Olympic Hall layout (CSV 1:1 coordinates) ───────────────────
// CSV 좌표는 0~1000 기준의 좌석 중심점이며, 좌석배치도.png는 1426x1103이다.
// 아래 변환은 CSV 원본을 현재 배경 이미지 좌표계로 옮기는 고정 변환이다.
// 등급별로 합쳐서 순서 배치하지 않고, section(A1~I3)별로 CSV 배열과
// API 좌석을 직접 대응시켜 다른 구역이 섞이거나 초과 좌석이 생기지 않게 한다.
const OH_IMAGE_W = 1426;
const OH_IMAGE_H = 1103;
const OH_X_SCALE = 1.27;
const OH_X_OFFSET = 70;
const OH_Y_SCALE = 0.9025;
const OH_Y_OFFSET = 1057;
// 중심 좌표는 CSV와 일치시키고, 배경 이미지의 실제 좌석 칸(약 7x8px)을
// 덮도록 표시 크기도 맞춘다. 같은 중심점에서 그려지므로 좌석이 옆 칸으로
// 밀리거나 중복되어 보이지 않는다.
const OH_SEAT_W = 7;
const OH_SEAT_H = 8;
const OH_CSV_ZONES = OLYMPIC_HALL.zones.filter((zone) => zone.id !== 'Floor');
const OH_FLOOR_ZONE = OLYMPIC_HALL.zones.find((zone) => zone.id === 'Floor');
// 배경 이미지의 초록색 Floor 영역(1426x1103 기준) 안에만 임의 좌석을 배치한다.
// 37열 x 24행 = 888칸이므로 마지막 칸까지 채워 좌석 간 간격을 일정하게 유지한다.
const OH_FLOOR_BOX = { x: 560, y: 180, width: 289, height: 195, cols: 37, rows: 24 };
const OH_FLOOR_SEAT_COUNT = OH_FLOOR_BOX.cols * OH_FLOOR_BOX.rows;
// CSV 좌석 중심점의 인접 방향을 기준으로 측정한 대각선 구역 방향.
// Canvas는 y축이 아래로 증가하므로 CSV(y축 위 방향)의 부호를 반전했다.
const OH_ZONE_ANGLES = {
  // 왼쪽 B구역은 이미지의 좌석 열 방향에 맞춰 기존 각도보다 조금 완화
  B1: (48 * Math.PI) / 180,
  B2: (48 * Math.PI) / 180,
  // 오른쪽 D구역은 배경 좌석열의 기울기에 맞춰 오른쪽 아래 방향으로 회전
  D1: (-48 * Math.PI) / 180,
  D2: (-48 * Math.PI) / 180,
};

// I1/I3는 게이트 옆의 대각선 좌석과 중앙 수평 좌석이 하나의 CSV 구역에
// 함께 들어 있다. CSV 행 순서는 화면 배치 순서가 아니므로 번호 범위로
// 자르면 수평 블록 일부까지 회전된다. 좌석 중심점에 가까운 수평 인접 좌석이
// 없는 점만 대각선 블록으로 판정해 실제 모양을 유지한다.
function findDiagonalSeatIds(coords) {
  const diagonalIds = new Set();
  coords.forEach((coord) => {
    const hasHorizontalNeighbor = coords.some((other) => {
      if (other === coord) return false;
      const dx = Math.abs(other.x - coord.x);
      const dy = Math.abs(other.y - coord.y);
      return dx >= 4 && dx <= 11 && dy < 2;
    });
    if (!hasHorizontalNeighbor) diagonalIds.add(coord.id);
  });
  return diagonalIds;
}

// 같은 좌석열에 속한 좌석 중심점의 미세한 추출 오차를 제거한다.
// 원본 좌표의 소수점 흔들림만 합치고, 실제 통로 간격은 별도 선으로 유지한다.
function clusterCoordinateLines(values, tolerance = 1.5) {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const groups = [];

  sorted.forEach((point) => {
    const current = groups[groups.length - 1];
    if (!current || point.value - current.mean > tolerance) {
      groups.push({ mean: point.value, points: [point] });
      return;
    }
    current.points.push(point);
    current.mean = current.points.reduce((sum, item) => sum + item.value, 0) / current.points.length;
  });

  const snapped = new Array(values.length);
  groups.forEach((group) => {
    group.points.forEach((point) => {
      snapped[point.index] = group.mean;
    });
  });
  return snapped;
}

function olympicCanvasPoint(coord) {
  return {
    x: coord.x * OH_X_SCALE + OH_X_OFFSET,
    y: OH_Y_OFFSET - coord.y * OH_Y_SCALE,
  };
}

function getOlympicSeatAngle(zoneId, coord, diagonalSeatIds) {
  // I1-76은 I1-65와 같은 대각선 열에 있지만 수평 이웃 좌석 때문에
  // 자동 판정에서 제외되므로 명시적으로 같은 각도를 적용한다.
  if (zoneId === 'I1' && (coord.id === 'I1-76' || diagonalSeatIds?.has(coord.id))) {
    return OH_ZONE_ANGLES.B1;
  }
  if (zoneId === 'I3' && diagonalSeatIds?.has(coord.id)) return OH_ZONE_ANGLES.D1;
  return OH_ZONE_ANGLES[zoneId] || 0;
}

function getEvenFloorPoint(index, count) {
  const { x, y, width, height, cols, rows } = OH_FLOOR_BOX;
  const stepX = width / cols;
  const stepY = height / rows;
  const baseCols = Math.floor(count / rows);
  const extraRows = count % rows;
  let cursor = 0;

  for (let row = 0; row < rows; row++) {
    const rowCols = Math.min(cols, baseCols + (row < extraRows ? 1 : 0));
    if (index < cursor + rowCols) {
      const col = index - cursor;
      const rowOffset = (cols - rowCols) * stepX / 2;
      return {
        x: x + rowOffset + (col + 0.5) * stepX,
        y: y + (row + 0.5) * stepY,
      };
    }
    cursor += rowCols;
  }
  return { x: x + width / 2, y: y + height / 2 };
}

// 구역별 1번 좌석을 기준으로 좌석열을 정렬한다.
// B/D 및 I1/I3의 대각선 좌석은 먼저 해당 각도의 로컬 좌표로 펼친 뒤
// 같은 행·열 중심선을 맞추고 다시 원래 방향으로 돌려놓는다.
function normalizeOlympicZoneCoordinates(csvZone, diagonalSeatIds) {
  const groups = new Map();
  csvZone.seats.forEach((coord, index) => {
    const angle = getOlympicSeatAngle(csvZone.id, coord, diagonalSeatIds);
    if (!groups.has(angle)) groups.set(angle, []);
    groups.get(angle).push({ coord, index });
  });

  const normalized = new Map();
  groups.forEach((entries, angle) => {
    const origin = olympicCanvasPoint(entries[0].coord);
    const c = Math.cos(-angle);
    const s = Math.sin(-angle);
    const local = entries.map(({ coord }) => {
      const point = olympicCanvasPoint(coord);
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      return {
        u: dx * c - dy * s,
        v: dx * s + dy * c,
      };
    });
    const tol = angle !== 0 ? 3.0 : 1.5;
    const snappedU = clusterCoordinateLines(local.map((point) => point.u), tol);
    const snappedV = clusterCoordinateLines(local.map((point) => point.v), tol);
    const anchorU = snappedU[0];
    const anchorV = snappedV[0];

    entries.forEach(({ coord }, index) => {
      const u = snappedU[index] - anchorU;
      const v = snappedV[index] - anchorV;
      normalized.set(coord.id, {
        x: origin.x + u * c + v * s,
        y: origin.y - u * s + v * c,
        angle,
      });
    });
  });
  return normalized;
}

function computeOlympicHallLayout(sections, seats) {
  const bySection = {};
  seats.forEach((seat) => {
    const sectionId = seat.section || seat.grade;
    if (!bySection[sectionId]) bySection[sectionId] = [];
    bySection[sectionId].push(seat);
  });

  const positioned = [];
  const zoneLabels = [];
  const zones = [];
  let unmatchedSeatCount = 0;

  OH_CSV_ZONES.forEach((csvZone) => {
    const apiSeats = bySection[csvZone.id] || [];
    // API 배열 순서가 바뀌거나 좌석 하나가 삭제되어도 이후 좌석이
    // 한 칸씩 밀리지 않도록 좌석 번호로 좌표를 매칭한다.
    const coordsByNumber = new Map(
      csvZone.seats.map((coord) => {
        const match = coord.id.match(/-(\d+)$/);
        return [match ? Number(match[1]) : null, coord];
      }),
    );
    const diagonalSeatIds = csvZone.id === 'I1' || csvZone.id === 'I3'
      ? findDiagonalSeatIds(csvZone.seats)
      : null;
    // 좌석 에디터와 동일한 좌표계를 사용한다.
    // 예전에는 대각선 구역을 다시 회전시켜 행/열을 스냅했지만,
    // 에디터에서 이미 최종 좌표를 정렬하므로 이 단계에서 재보정하면
    // B1/B2/D1/D2 및 I1/I3 좌석이 다시 어긋난다.
    const normalizedCoords = new Map(
      csvZone.seats.map((coord) => {
        const point = olympicCanvasPoint(coord);
        return [coord.id, {
          x: point.x,
          y: point.y,
          angle: getOlympicSeatAngle(csvZone.id, coord, diagonalSeatIds),
        }];
      }),
    );
    let sx = 0;
    let sy = 0;

    let positionedCount = 0;
    for (let i = 0; i < apiSeats.length; i++) {
      const seat = apiSeats[i];
      const seatId = String(seat.id || seat.seatId || '');
      const numberMatch = seatId.match(/-(\d+)$/);
      const seatNumber = numberMatch ? Number(numberMatch[1]) : i + 1;
      const coord = coordsByNumber.get(seatNumber);
      // 좌표 데이터에서 삭제된 좌석은 화면에도 표시하지 않는다.
      if (!coord) continue;
      const normalized = normalizedCoords.get(coord.id) || olympicCanvasPoint(coord);
      seat._x = normalized.x;
      seat._y = normalized.y;
      seat._sw = OH_SEAT_W;
      seat._sh = OH_SEAT_H;
      seat._angle = normalized.angle ?? getOlympicSeatAngle(csvZone.id, coord, diagonalSeatIds);
      seat._displayNum = seatNumber;
      seat._block = csvZone.id;
      positioned.push(seat);
      positionedCount += 1;
      sx += seat._x;
      sy += seat._y;
    }

    // 좌석 수가 CSV보다 큰 경우 초과분은 임의 좌표로 만들지 않고 제외한다.
    // 생성 로직이 CSV 개수와 동일하므로 정상 생성에서는 항상 0이다.
    unmatchedSeatCount += Math.max(0, apiSeats.length - positionedCount);
    if (positionedCount > 0) zoneLabels.push({ id: csvZone.id, x: sx / positionedCount, y: sy / positionedCount });

    const section = sections.find((item) => item.id === csvZone.id || item.grade === csvZone.id);
    zones.push({ id: csvZone.id, grade: csvZone.grade, label: section?.label || csvZone.name });
  });

  // Floor석은 원본 CSV 좌표 대신 배경 이미지의 초록색 영역 안에 균일한
  // 격자로 배치한다. API에서 생성된 Floor 좌석 수만큼만 렌더링한다.
  const floorApiSeats = (bySection.Floor || []).slice().sort((a, b) => {
    const na = String(a.id || a.seatId || '').match(/-(\d+)$/);
    const nb = String(b.id || b.seatId || '').match(/-(\d+)$/);
    return (na ? Number(na[1]) : 0) - (nb ? Number(nb[1]) : 0);
  });
  const floorLimit = OH_FLOOR_SEAT_COUNT;
  const floorCount = Math.min(floorApiSeats.length, floorLimit);
  for (let i = 0; i < floorCount; i++) {
    const seat = floorApiSeats[i];
    const seatId = String(seat.id || seat.seatId || '');
    const numMatch = seatId.match(/-(\d+)$/);
    const point = getEvenFloorPoint(i, floorCount);
    seat._x = point.x;
    seat._y = point.y;
    seat._sw = OH_SEAT_W;
    seat._sh = OH_SEAT_H;
    seat._angle = 0;
    seat._displayNum = numMatch ? Number(numMatch[1]) : i + 1;
    seat._block = 'Floor';
    positioned.push(seat);
  }
  unmatchedSeatCount += Math.max(0, floorApiSeats.length - floorLimit);
  if (floorCount > 0) {
    zoneLabels.push({
      id: 'Floor',
      x: OH_FLOOR_BOX.x + OH_FLOOR_BOX.width / 2,
      y: OH_FLOOR_BOX.y + OH_FLOOR_BOX.height / 2,
    });
    const floorSection = sections.find((item) => item.id === 'Floor' || item.grade === 'Floor');
    zones.push({ id: 'Floor', grade: OH_FLOOR_ZONE?.grade || 'VIP', label: floorSection?.label || 'Floor 구역' });
  }

  // 새 CSV 방식으로 생성된 공연은 아래 수가 0이어야 한다. 이 값은 화면에
  // 임의 좌석을 추가하기 위한 것이 아니라, 잘못된 예전 데이터 진단용이다.
  if (unmatchedSeatCount) {
    console.warn(`[SeatMap] CSV 좌표가 없는 올림픽홀 좌석 ${unmatchedSeatCount}개는 렌더링하지 않습니다.`);
  }

  return {
    seats: positioned,
    zones,
    canvasW: OH_IMAGE_W,
    canvasH: OH_IMAGE_H,
    offsetX: 0,
    isOlympicHall: true,
    // 정적 배치도의 보라색 좌석은 숨기고, 인터랙티브 좌석만 표시한다.
    bgImageUrl: '/images/seatmaps/올림픽홀-interactive-bg.png',
    zoneLabels,
  };
}

function buildOlympicHallBgSvg(layout) {
  const { canvasW, canvasH, stageX, stageY, stageW, stageH, zoneLabels } = layout;
  const labels = (zoneLabels || []).map((z) =>
    `<text x="${z.x}" y="${z.y}" text-anchor="middle" dominant-baseline="central" font-size="20" font-weight="800" fill="#555" opacity="0.5">${z.id}</text>`
  ).join('');
  return `<svg width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="ohstg" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#e74c3c"/><stop offset="100%" stop-color="#c0392b"/></linearGradient></defs>
    <rect x="${stageX}" y="${stageY}" width="${stageW}" height="${stageH}" rx="8" fill="url(#ohstg)"/>
    <text x="${stageX + stageW / 2}" y="${stageY + stageH / 2 + 5}" text-anchor="middle" fill="#fff" font-size="20" font-weight="800" letter-spacing="6">S T A G E</text>
    ${labels}
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
export function mountSeatMap(el, {
  sections,
  seats,
  onSeatClick,
  cancelMode = false,
  readOnly = false,
  selectionOnly = false,
  venue,
}) {
  const isOlympicHall = venue === '올림픽홀';
  const layout = isOlympicHall ? computeOlympicHallLayout(sections, seats) : computeLayout(sections, seats);
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
    ? `<span class="vm-legend__item"><span class="vm-legend__dot" style="background:${SEAT_FILL};border-color:${SEAT_BORDER}"></span>좌석 배치도</span>`
    : selectionOnly
      ? `<span class="vm-legend__item"><span class="vm-legend__dot" style="background:${SEAT_FILL};border-color:${SEAT_BORDER}"></span>서버 배정 좌석만 선택 가능</span>
         <span class="vm-legend__item"><span class="vm-legend__dot" style="background:#BCBCBC;border-color:#999"></span>선택 불가/매진</span>
         <span class="vm-legend__item"><span class="vm-legend__dot" style="background:${MINE_FILL};border-color:${MINE_BORDER}"></span>선점 완료</span>`
    : `<span class="vm-legend__item">선택 가능 (구역별 색상은 우측 목록 참고)</span>
       <span class="vm-legend__item"><span class="vm-legend__dot" style="background:${MINE_FILL};border-color:${MINE_BORDER}"></span>내 좌석</span>
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
    const svgStr = isOlympicHall ? buildOlympicHallBgSvg(layout) : buildBgSvg(layout);
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

  // 좌석 배치가 좌표 기반 올림픽홀이라도 축소 상태에서는 개별 좌석을 숨긴다.
  // 올림픽홀만 0.12로 낮추면 초기 화면부터 좌석이 모두 보여 LOD 기능이
  // 사실상 비활성화되므로, 모든 공연장에 동일한 0.4 기준을 적용한다.
  const seatLodThreshold = SEAT_LOD_ZOOM_THRESHOLD;

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
    const showSeats = state.scale >= seatLodThreshold;
    const seatAlphaBase = showSeats ? 1 : 0;

    // Zoom hint overlay when seats are hidden
    if (layout.isOlympicHall && !showSeats) {
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
    const isOH = !!layout.isOlympicHall;
    const availArr = [];
    const soldArr = [];
    const holdArr = [];
    const mineArr = [];
    const disabledArr = [];
    // byColor only used for non-OH mode
    const byColor = {};

    for (let i = 0; i < layout.seats.length; i++) {
      const ls = layout.seats[i];
      const seat = idToSeat.get(ls.id);
      const status = seat ? seat.status : 'available';
      if (status === 'sold') { soldArr.push(ls); continue; }
      if (status === 'holding') { holdArr.push(ls); continue; }
      if (status === 'mine') { mineArr.push(ls); continue; }
      if (seat && seat.selectable === false) { disabledArr.push(ls); continue; }
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
      // ── Olympic Hall: uniform purple circles (per-seat size) ──
      const drawOHCircle = (seat, fill, stroke, lineWidth, size = 1) => {
        const sw = (seat._sw || OH_SEAT_W) * size;
        const sh = (seat._sh || OH_SEAT_H) * size;
        const radius = Math.min(sw, sh) / 2;
        ctx.save();
        ctx.translate(seat._x, seat._y);
        ctx.rotate(seat._angle || 0);
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      };

      // Available
      for (let i = 0; i < availArr.length; i++) {
        // 보라색 계열은 유지하되, 배경은 연하게 표시한다.
        drawOHCircle(availArr[i], hexToRgba(SEAT_FILL, 0.2), hexToRgba(SEAT_BORDER, 0.9), 1);
      }

      // Sold
      if (soldArr.length) {
        ctx.globalAlpha = 0.5;
        for (let i = 0; i < soldArr.length; i++) {
          drawOHCircle(soldArr[i], '#BCBCBC', '#999', 2);
        }
        ctx.globalAlpha = 1;
      }

      // Holding (pulse)
      if (holdArr.length) {
        ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(holdingPhase));
        for (let i = 0; i < holdArr.length; i++) {
          drawOHCircle(holdArr[i], '#F0A030', '#C88010', 2);
        }
        ctx.globalAlpha = 1;
      }

      // 취소표 화면에서 서버가 배정하지 않은 좌석 — 배치도에는 남기되 선택은 막는다.
      if (disabledArr.length) {
        ctx.globalAlpha = 0.65;
        for (let i = 0; i < disabledArr.length; i++) {
          drawOHCircle(disabledArr[i], '#BCBCBC', '#999', 1.5);
        }
        ctx.globalAlpha = 1;
      }

      // Mine — larger rect with glow + checkmark
      for (let i = 0; i < mineArr.length; i++) {
        const s = mineArr[i];
        const sw2 = s._sw || OH_SEAT_W, sh2 = s._sh || OH_SEAT_H;
        const md = Math.min(sw2, sh2) * 1.7;
        ctx.save();
        ctx.translate(s._x, s._y);
        ctx.rotate(s._angle || 0);
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, md / 2 + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = MINE_FILL;
        ctx.beginPath();
        ctx.arc(0, 0, md / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = MINE_BORDER;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const cs = md * 0.3;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-cs * 0.5, 0);
        ctx.lineTo(-cs * 0.1, cs * 0.5);
        ctx.lineTo(cs * 0.6, -cs * 0.4);
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

      // 취소표 화면에서 서버가 배정하지 않은 좌석 — 배치도에는 남기되 선택은 막는다.
      if (disabledArr.length) {
        ctx.globalAlpha = 0.65;
        ctx.fillStyle = '#BCBCBC';
        ctx.beginPath();
        for (let i = 0; i < disabledArr.length; i++) {
          const s = disabledArr[i];
          ctx.moveTo(s._x + r, s._y);
          ctx.arc(s._x, s._y, r, 0, 6.2832);
        }
        ctx.fill();
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1.5;
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
        ctx.fillStyle = MINE_FILL;
        ctx.beginPath();
        ctx.arc(s._x, s._y, mr, 0, 6.2832);
        ctx.fill();
        ctx.strokeStyle = MINE_BORDER;
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
      if (st !== 'sold' && st !== 'holding' && st !== 'mine' && seat?.selectable !== false) {
        ctx.save();
        if (isOH) {
          const hw = (hoveredSeat._sw || 10) + 2, hh = (hoveredSeat._sh || 10) + 2;
          ctx.translate(hoveredSeat._x, hoveredSeat._y);
          ctx.rotate(hoveredSeat._angle || 0);
          ctx.shadowColor = 'rgba(0,0,0,0.2)';
          ctx.shadowBlur = 6;
          ctx.fillStyle = hexToRgba(SEAT_FILL, 0.5);
          ctx.fillRect(-hw / 2, -hh / 2, hw, hh);
          ctx.shadowBlur = 0;
          ctx.strokeStyle = hexToRgba(SEAT_FILL, 0.9);
          ctx.lineWidth = 1.5;
          ctx.strokeRect(-hw / 2 - 1, -hh / 2 - 1, hw + 2, hh + 2);
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
    downSeat = state.scale >= seatLodThreshold
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
      const seatsVis = state.scale >= seatLodThreshold;
      const rect = viewport.getBoundingClientRect();
      const lp = viewportToLayout(e.clientX - rect.left, e.clientY - rect.top);
      const hit = seatsVis ? findSeatAtLayout(grid, layout.seats, lp.x, lp.y) : null;

      if (hit !== hoveredSeat) {
        hoveredSeat = hit;
        if (hit) {
          const seatData = idToSeat.get(hit.id);
          const sec = sections.find((s) => s.id === (seatData?.section || hit._block))
            || sections.find((s) => s.grade === (seatData?.grade || hit.grade));
          showTooltip(tooltipEl, e, { ...hit, ...seatData }, sec?.label);
          const st = seatData?.status;
          viewport.style.cursor = seatData?.selectable === false
            ? 'not-allowed'
            : st === 'sold' ? 'not-allowed' : st === 'holding' ? 'wait' : 'pointer';
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
    const seatsVisible = state.scale >= seatLodThreshold;
    if (!readOnly && dragging && !dragMoved && downSeat && seatsVisible) {
      const seatData = idToSeat.get(downSeat.id);
      const st = seatData ? seatData.status : 'available';
      if (st !== 'sold' && st !== 'holding' && seatData?.selectable !== false) {
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
      const zoneSeats = layout.seats.filter((s) => s._block === zoneId || s.section === zoneId || s.grade === zoneId);
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
