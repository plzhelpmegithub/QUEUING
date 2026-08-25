// Interactive venue seat map — fan-shaped arc layout with zoom/pan controls,
// uniform spacing, and hover tooltips.

// Seat size/spacing — deliberately generous: seats sitting this close together
// at the DOM level made adjacent seats easy to mis-click, especially once
// scaled down to fit a large venue in the viewport. What actually determines
// the visible gap-to-seat ratio on screen (independent of overall zoom) is the
// SEAT_STEP:SEAT_D ratio, since fit-to-view scales both by the same factor —
// so SEAT_STEP is kept much larger than SEAT_D on purpose, to leave a clearly
// visible empty gap between adjacent dots rather than just touching circles.
const SEAT_D = 14;
const SEAT_STEP = 42;
const GRADE_GAP = 60;
const ARC_HALF = 76;
const STAGE_W = 240;
const STAGE_H = 36;
const CX = 520;
const STAGE_TOP = 18;
const ORIGIN_Y = STAGE_TOP + STAGE_H + 28;
const START_R = 150;

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5;
const WHEEL_K = 0.0012;
const ZOOM_STEP = 1.25;
const MAX_RENDER = 700;
const DRAG_THRESHOLD = 4;

const SEAT_FILL = '#7C4DFF';
const SEAT_BORDER = '#5E35D8';
const BAND_COLOR = '#9E9E9E';

function darken(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const k = 0.6;
  return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
}

// 등급 대표색을 옅은 pastel 톤으로 — 미선택 좌석의 안쪽 채우기에 사용
// (겉 테두리는 등급 색상 그대로, 안쪽만 옅게 해서 "선택 가능" 느낌을 줌)
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function seatXY(r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: CX + r * Math.sin(rad),
    y: ORIGIN_Y + r * (0.65 + 0.35 * Math.cos(rad)),
  };
}

// Compute N angles along the arc at radius r so that the visual (screen)
// distance between consecutive seats is uniform — compensates for the
// y-compression that otherwise squishes seats near the arc edges.
// `halfSpan` defaults to the full arc width (ARC_HALF on each side); a ring
// that doesn't have enough seats to fill its natural capacity is passed a
// smaller halfSpan (see computeLayout) so those seats keep the same spacing
// as a full ring instead of being stretched thin across the whole arc.
function evenArcAngles(r, n, halfSpan = ARC_HALF) {
  if (n <= 1) return [0];
  const S = 200;
  const dists = [0];
  for (let i = 1; i <= S; i++) {
    const a0 = -halfSpan + ((i - 1) / S) * 2 * halfSpan;
    const a1 = -halfSpan + (i / S) * 2 * halfSpan;
    const p0 = seatXY(r, a0);
    const p1 = seatXY(r, a1);
    dists.push(dists[i - 1] + Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2));
  }
  const total = dists[S];
  const angles = [];
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total;
    let lo = 0;
    while (lo < S && dists[lo + 1] < target) lo++;
    const frac =
      dists[lo + 1] > dists[lo] ? (target - dists[lo]) / (dists[lo + 1] - dists[lo]) : 0;
    angles.push(-halfSpan + ((lo + frac) / S) * 2 * halfSpan);
  }
  return angles;
}

function arcPoints(r, nPts) {
  const pts = [];
  for (let i = 0; i <= nPts; i++) {
    const a = -ARC_HALF + ((2 * ARC_HALF) * i) / nPts;
    pts.push(seatXY(r, a));
  }
  return pts;
}

function bandPath(r1, r2) {
  const N = 48;
  const outer = arcPoints(r2 + SEAT_D * 0.7, N);
  const inner = arcPoints(r1 - SEAT_D * 0.7, N).reverse();
  const all = [...outer, ...inner];
  return 'M ' + all.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ') + ' Z';
}

// ── Layout ──────────────────────────────────────────────────────────
function subsample(arr, target) {
  if (arr.length <= target) return arr;
  const step = arr.length / target;
  const out = [];
  for (let i = 0; i < target; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

// Ring order (stage-out) is always VIP → R → S → A → anything else, regardless
// of what order the event's sections happened to be created in — grades not in
// this list keep their original relative order, appended after the known ones.
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

  const total = seats.length;
  const needsSample = total > MAX_RENDER;

  let radius = START_R;
  const positioned = [];
  const zones = [];

  gradeOrder.forEach((grade, gi) => {
    const allGradeSeats = byGrade[grade];
    if (!allGradeSeats.length) return;
    const sec = secByGrade[grade];

    const proportion = allGradeSeats.length / total;
    const budget = needsSample
      ? Math.max(12, Math.round(MAX_RENDER * proportion))
      : allGradeSeats.length;
    const gs = subsample(allGradeSeats, budget);

    const bandStart = radius;
    let idx = 0;

    while (idx < gs.length) {
      const arcLen = ((2 * ARC_HALF) / 360) * 2 * Math.PI * radius;
      // Capacity = how many seats fit this ring at the target spacing (SEAT_STEP),
      // not a fixed count — a grade with more seats than one ring holds just
      // spills into the next (larger) ring automatically as radius grows.
      const capacity = Math.max(3, Math.floor(arcLen / SEAT_STEP));
      const n = Math.min(capacity, gs.length - idx);
      // A ring that doesn't have enough remaining seats to fill its capacity
      // (typically the last, partial ring of a grade) gets a proportionally
      // narrower angular span instead of always spanning the full arc — otherwise
      // evenArcAngles would spread a handful of seats thin across the whole
      // width, stretching their spacing far beyond SEAT_STEP. The span has to
      // scale by segment count (n-1)/(capacity-1), not by seat count (n/capacity):
      // a full ring's SEAT_STEP spacing comes from (capacity-1) segments spanning
      // the full arc, so n seats need (n-1) segments at that same size, i.e.
      // (n-1)/(capacity-1) of the full span — using n/capacity instead visibly
      // overshoots for small n (e.g. n=2 would get ~2x the intended gap).
      const halfSpan = n < capacity ? ARC_HALF * ((n - 1) / Math.max(1, capacity - 1)) : ARC_HALF;
      const angles = evenArcAngles(radius, n, halfSpan);
      for (let c = 0; c < n && idx < gs.length; c++) {
        const pos = seatXY(radius, angles[c]);
        gs[idx]._x = pos.x;
        gs[idx]._y = pos.y;
        // Left-to-right (facing the stage), continuous across every ring in this
        // grade — the leftmost seat of the grade's first ring is 1, incrementing
        // rightward and continuing (not resetting) into each subsequent ring.
        gs[idx]._displayNum = idx + 1;
        positioned.push(gs[idx]);
        idx++;
      }
      radius += SEAT_STEP;
    }

    zones.push({
      grade,
      label: sec.label || grade,
      rStart: bandStart,
      rEnd: radius - SEAT_STEP,
    });

    radius += GRADE_GAP;
  });

  let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
  positioned.forEach((s) => {
    if (s._x < minX) minX = s._x;
    if (s._x > maxX) maxX = s._x;
    if (s._y > maxY) maxY = s._y;
  });

  // Seat x/y so far are in the CX-centered coordinate system (CX=520), which
  // only happens to line up with a [0, canvasW] canvas when the whole layout
  // is narrower than CX*2. Wider spacing (bigger SEAT_STEP/START_R) pushes the
  // arc's edges past x=0 on the left — those seats end up at a negative left,
  // i.e. physically outside the canvas div's own [0, canvasW] box, which is
  // exactly the range pan-clamping keeps on screen. Since dragging can never
  // move the canvas further right than tx=0, that negative-x range was
  // permanently unreachable — the stage-left seats got clipped and un-pannable.
  // Fix: shift every coordinate so the leftmost content sits at PAD, making the
  // canvas's own [0, canvasW] box actually contain everything drawn in it.
  const PAD = 60;
  const offsetX = PAD - minX;
  positioned.forEach((s) => {
    s._x += offsetX;
  });

  return {
    seats: positioned,
    zones,
    canvasW: maxX - minX + PAD * 2,
    canvasH: maxY + 50,
    offsetX,
  };
}

// ── SVG background ──────────────────────────────────────────────────
function buildBgSvg(layout) {
  const { zones, canvasW, canvasH, offsetX } = layout;
  const bands = zones
    .map(
      (z) =>
        `<path d="${bandPath(z.rStart, z.rEnd)}" fill="${BAND_COLOR}" fill-opacity="0.06" stroke="${BAND_COLOR}" stroke-opacity="0.12" stroke-width="1"/>`
    )
    .join('');

  const labels = zones
    .map((z) => {
      const mid = (z.rStart + z.rEnd) / 2;
      const pos = seatXY(mid, -ARC_HALF - 5);
      return `<text x="${pos.x - 10}" y="${pos.y}" font-size="13" font-weight="800" fill="#666" text-anchor="end" dominant-baseline="middle" opacity="0.7">${z.label}</text>`;
    })
    .join('');

  // Everything above is drawn in the raw CX-centered coordinate system — shift
  // the whole group by offsetX so it lines up with the seats (which are
  // already stored shifted) inside the canvas's own [0, canvasW] box.
  return `<svg class="vm-bg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="stg" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#444"/><stop offset="100%" stop-color="#181818"/></linearGradient></defs>
    <g transform="translate(${offsetX},0)">
      <rect x="${CX - STAGE_W / 2}" y="${STAGE_TOP}" width="${STAGE_W}" height="${STAGE_H}" rx="8" fill="url(#stg)"/>
      <text x="${CX}" y="${STAGE_TOP + STAGE_H / 2 + 5}" text-anchor="middle" fill="#fff" font-size="13" font-weight="800" letter-spacing="4">S T A G E</text>
      ${bands}${labels}
    </g>
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

function applyTransform(canvasEl, state) {
  canvasEl.style.transform = `translate(${state.tx}px,${state.ty}px) scale(${state.scale})`;
}

function fitView(state, layout, viewport) {
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const sx = vw / layout.canvasW;
  const sy = vh / layout.canvasH;
  state.scale = Math.min(sx, sy) * 0.92;
  state.scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.scale));
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
  const loc = `${seat._displayNum || seat.seatNum}번`;
  tooltipEl.innerHTML = `<strong>${grade}</strong><br>${loc}<br><span style="opacity:0.7">${statusText[seat.status] || '선택 가능'}</span>`;
  tooltipEl.classList.add('show');
  tooltipEl.style.left = `${e.clientX + 14}px`;
  tooltipEl.style.top = `${e.clientY - 10}px`;
}

function hideTooltip(tooltipEl) {
  tooltipEl.classList.remove('show');
}

// ── Mount ───────────────────────────────────────────────────────────
export function mountSeatMap(el, { sections, seats, onSeatClick, cancelMode = false, readOnly = false }) {
  const layout = computeLayout(sections, seats);
  const idToEl = new Map();
  const idToSeat = new Map();
  seats.forEach((s) => idToSeat.set(s.id, s));

  const scrollParent = el.closest('.seatmap-scroll');
  if (scrollParent) {
    scrollParent.style.maxHeight = 'none';
    scrollParent.style.overflow = 'hidden';
    scrollParent.style.padding = '0';
    scrollParent.style.border = 'none';
    scrollParent.style.background = 'none';
  }
  el.style.padding = '0';

  // 구역(등급)별 대표색 — order rail의 "구역별 잔여석" 목록(zoneColor()/
  // GRADE_COLOR)과 완전히 같은 색을 그대로 써서 잔여석 안내와 실제 좌석
  // 배치도의 색이 어긋나지 않도록 함.
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
      <div class="vm-canvas" data-canvas style="width:${layout.canvasW}px;height:${layout.canvasH}px;">
        ${buildBgSvg(layout)}
      </div>
      <div class="vm-zoom-controls">
        <button type="button" class="vm-zoom-btn" data-zoom-in aria-label="확대">+</button>
        <button type="button" class="vm-zoom-btn" data-zoom-out aria-label="축소">−</button>
        <button type="button" class="vm-zoom-btn vm-zoom-btn--reset" data-zoom-reset aria-label="원래 크기로">⟲</button>
      </div>
    </div>
    <div class="vm-tooltip" data-tooltip></div>
    <div class="vm-zoom-hint" data-hint>마우스 스크롤로 확대/축소 · 드래그로 이동</div>
  `;

  const canvasEl = el.querySelector('[data-canvas]');
  const viewport = el.querySelector('[data-viewport]');
  const tooltipEl = el.querySelector('[data-tooltip]');
  const hintEl = el.querySelector('[data-hint]');

  // Render seat circles — 등급별 색상(겉 테두리는 진하게, 안쪽은 pastel톤)을
  // CSS 커스텀 프로퍼티로 심어두고 실제 색칠은 .vm-seat 클래스가 담당(paintSeat).
  layout.seats.forEach((s) => {
    const dot = document.createElement('div');
    dot.className = 'vm-seat';
    dot.dataset.id = s.id;
    dot.style.left = `${s._x}px`;
    dot.style.top = `${s._y}px`;
    const gradeColor = gradeColorMap[s.grade] || SEAT_FILL;
    dot.style.setProperty('--seat-color', gradeColor);
    dot.style.setProperty('--seat-color-light', hexToRgba(gradeColor, 0.18));
    canvasEl.appendChild(dot);
    idToEl.set(s.id, dot);
  });

  // State
  const state = { scale: 1, tx: 0, ty: 0 };
  fitView(state, layout, viewport);
  applyTransform(canvasEl, state);

  // 뷰포트 크기가 바뀌면(창 크기 변경, 사이드바 레이아웃 재배치 등) 기존 tx/ty가
  // 더 이상 유효한 범위가 아닐 수 있어 다시 클램프 — 이게 없으면 리사이즈 직후
  // 좌석 배치도가 뷰포트 경계 밖으로 밀려나 보일 수 있었음.
  const resizeObserver = new ResizeObserver(() => {
    clampPan(state, layout, viewport);
    applyTransform(canvasEl, state);
  });
  resizeObserver.observe(viewport);

  // ── Zoom controls (+/-/reset) ── 미니맵 대신 우측 하단에 배치
  function zoomAround(mx, my, newScale) {
    newScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newScale));
    state.tx = mx - ((mx - state.tx) * newScale) / state.scale;
    state.ty = my - ((my - state.ty) * newScale) / state.scale;
    state.scale = newScale;
    clampPan(state, layout, viewport);
    applyTransform(canvasEl, state);
  }
  el.querySelector('[data-zoom-in]').addEventListener('click', () => {
    zoomAround(viewport.clientWidth / 2, viewport.clientHeight / 2, state.scale * ZOOM_STEP);
  });
  el.querySelector('[data-zoom-out]').addEventListener('click', () => {
    zoomAround(viewport.clientWidth / 2, viewport.clientHeight / 2, state.scale / ZOOM_STEP);
  });
  el.querySelector('[data-zoom-reset]').addEventListener('click', () => {
    fitView(state, layout, viewport);
    applyTransform(canvasEl, state);
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
      if (hintEl) hintEl.remove();
    },
    { passive: false }
  );

  // ── Drag pan ──
  let dragging = false;
  let dragMoved = false;
  let dragX = 0, dragY = 0;
  let dragStartX = 0, dragStartY = 0;
  let downDot = null;

  viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    // 확대/축소/리셋 버튼도 .vm-viewport 안에 떠 있는 오버레이라, 여기서 걸러주지
    // 않으면 버튼 클릭도 드래그 시작으로 처리되고 setPointerCapture가 클릭 이벤트를
    // viewport로 가로채버려서 버튼 자신의 click 리스너가 아예 안 불림.
    if (e.target.closest('.vm-zoom-controls')) return;
    dragging = true;
    dragMoved = false;
    downDot = e.target.closest ? e.target.closest('.vm-seat') : null;
    dragX = e.clientX;
    dragY = e.clientY;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    viewport.classList.add('dragging');
    // setPointerCapture retargets all subsequent pointer/mouse/click events to
    // viewport, so a plain 'click' listener on canvasEl never sees the seat
    // dot as e.target — seat selection is decided here on pointerup instead.
    viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) dragMoved = true;
    state.tx += e.clientX - dragX;
    state.ty += e.clientY - dragY;
    dragX = e.clientX;
    dragY = e.clientY;
    clampPan(state, layout, viewport);
    applyTransform(canvasEl, state);
  });
  const endDrag = () => {
    if (
      !readOnly &&
      dragging &&
      !dragMoved &&
      downDot &&
      !downDot.classList.contains('vm-seat--sold') &&
      !downDot.classList.contains('vm-seat--holding')
    ) {
      onSeatClick(downDot.dataset.id);
    }
    dragging = false;
    downDot = null;
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
  viewport.addEventListener('touchend', () => {
    lastPinchDist = 0;
  });

  // ── Hover tooltip ──
  canvasEl.addEventListener('mouseover', (e) => {
    const dot = e.target.closest('.vm-seat');
    if (!dot) return;
    const seat = idToSeat.get(dot.dataset.id);
    if (!seat) return;
    const sec = sections.find((s) => s.grade === seat.grade);
    showTooltip(tooltipEl, e, seat, sec?.label);
  });
  canvasEl.addEventListener('mousemove', (e) => {
    if (tooltipEl.classList.contains('show')) {
      tooltipEl.style.left = `${e.clientX + 14}px`;
      tooltipEl.style.top = `${e.clientY - 10}px`;
    }
  });
  canvasEl.addEventListener('mouseout', (e) => {
    if (e.target.closest('.vm-seat')) hideTooltip(tooltipEl);
  });

  // Paint seat status — 색상은 전부 CSS(.vm-seat--sold/--holding/--mine)가
  // 담당하고, 여기선 상태에 맞는 클래스만 토글한다(등급 색상은 --seat-color
  // 커스텀 프로퍼티에 이미 심어져 있어 기본 상태에서 자동으로 적용됨).
  function paintSeat(seat) {
    const node = idToEl.get(seat.id);
    if (!node) return;
    node.classList.toggle('vm-seat--sold', seat.status === 'sold');
    node.classList.toggle('vm-seat--holding', seat.status === 'holding');
    node.classList.toggle('vm-seat--mine', seat.status === 'mine');
  }
  seats.forEach(paintSeat);

  // Dismiss hint after a few seconds
  setTimeout(() => {
    if (hintEl && hintEl.parentElement) {
      hintEl.style.opacity = '0';
      setTimeout(() => hintEl.remove(), 600);
    }
  }, 4000);

  return {
    updateStatuses(updatedSeats) {
      updatedSeats.forEach(paintSeat);
    },
    flashSold(id) {
      const node = idToEl.get(id);
      if (node) {
        node.classList.add('shake');
        setTimeout(() => node.classList.remove('shake'), 400);
      }
    },
    scrollToZone(zoneId) {
      const zone = layout.zones.find((z) => z.grade === zoneId);
      if (!zone) return;
      const midR = (zone.rStart + zone.rEnd) / 2;
      const pos = seatXY(midR, 0);
      pos.x += layout.offsetX; // seatXY is in the raw CX-centered system; shift to match the canvas
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      state.scale = Math.max(1.2, state.scale);
      state.tx = vw / 2 - pos.x * state.scale;
      state.ty = vh / 2 - pos.y * state.scale;
      clampPan(state, layout, viewport);
      applyTransform(canvasEl, state);
    },
    destroy() {
      resizeObserver.disconnect();
    },
  };
}
