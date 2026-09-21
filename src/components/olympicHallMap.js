// 서울 올림픽홀 실좌표 기반 좌석 맵 — Canvas 2D 렌더링
// CSV 추출 좌표(0-1000)를 캔버스에 직접 매핑, 줌/팬/클릭 선택 지원

import { OLYMPIC_HALL } from '../data/olympicHallSeats.js';

const GRADE_COLOR = {
  VIP: '#B5121B',
  R: '#C98500',
  S: '#199E70',
  A: '#3987E5',
};
const GRADE_LABEL = { VIP: 'VIP (Floor)', R: 'R석', S: 'S석', A: 'A석' };

const SEAT_R = 3.2;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 8;
const WHEEL_K = 0.0012;
const HIT_R = 6;

const STATUS_FILL = {
  available: null,
  holding: '#9E9E9E',
  mine: '#7C4DFF',
  sold: '#424242',
};

export function mountOlympicHallMap(host, options = {}) {
  const {
    onSelect = () => {},
    gradeFilter = null,
  } = options;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;border-radius:8px;cursor:grab;touch-action:none;';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const allSeats = [];
  const zoneMeta = [];
  OLYMPIC_HALL.zones.forEach((z) => {
    const color = GRADE_COLOR[z.grade] || '#888';
    const zInfo = { id: z.id, name: z.name, grade: z.grade, floor: z.floor, color, cx: 0, cy: 0 };
    z.seats.forEach((s) => {
      allSeats.push({
        id: s.id,
        zoneId: z.id,
        grade: z.grade,
        rawX: s.x,
        rawY: 1000 - s.y,
        color,
        status: 'available',
      });
    });
    const xs = z.seats.map((s) => s.x);
    const ys = z.seats.map((s) => 1000 - s.y);
    zInfo.cx = xs.reduce((a, b) => a + b, 0) / xs.length;
    zInfo.cy = ys.reduce((a, b) => a + b, 0) / ys.length;
    zoneMeta.push(zInfo);
  });

  if (gradeFilter) {
    allSeats.forEach((s) => {
      if (s.grade !== gradeFilter) s.status = 'sold';
    });
  }

  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let panStartX = 0;
  let panStartY = 0;
  let dragMoved = false;
  let selectedId = null;
  let hoveredId = null;

  function resize() {
    const rect = host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = Math.min(rect.width * 0.75, 600) * dpr;
    canvas.style.height = `${canvas.height / dpr}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function toCanvas(rx, ry) {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    const scale = Math.min(w, h) / 1000 * zoom;
    const cx = w / 2 + panX;
    const cy = h / 2 + panY;
    return {
      x: cx + (rx - 500) * scale,
      y: cy + (ry - 500) * scale,
    };
  }

  function fromCanvas(cx, cy) {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    const scale = Math.min(w, h) / 1000 * zoom;
    const centerX = w / 2 + panX;
    const centerY = h / 2 + panY;
    return {
      rx: (cx - centerX) / scale + 500,
      ry: (cy - centerY) / scale + 500,
    };
  }

  function draw() {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, h);

    const scale = Math.min(w, h) / 1000 * zoom;
    const seatR = Math.max(1.5, SEAT_R * zoom);

    // Stage
    const stageLeft = toCanvas(350, -15);
    const stageRight = toCanvas(650, 25);
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.roundRect(stageLeft.x, stageLeft.y, stageRight.x - stageLeft.x, stageRight.y - stageLeft.y, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(8, 12 * zoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const stageMid = toCanvas(500, 5);
    ctx.fillText('STAGE', stageMid.x, stageMid.y);

    // Seats
    allSeats.forEach((s) => {
      const p = toCanvas(s.rawX, s.rawY);
      if (p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10) return;

      let fill;
      if (s.id === selectedId) fill = '#7C4DFF';
      else if (s.status === 'sold') fill = '#333';
      else if (s.status === 'holding') fill = '#666';
      else fill = s.color;

      ctx.beginPath();
      ctx.arc(p.x, p.y, seatR, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();

      if (s.id === hoveredId && s.status === 'available') {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (s.id === selectedId) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Zone labels (only when zoomed out enough)
    if (zoom < 3) {
      ctx.font = `bold ${Math.max(7, 9 * zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      zoneMeta.forEach((z) => {
        const p = toCanvas(z.cx, z.cy);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2.5;
        ctx.strokeText(z.id, p.x, p.y);
        ctx.fillStyle = '#fff';
        ctx.fillText(z.id, p.x, p.y);
      });
    }

    // Legend
    const legendX = 10;
    let legendY = h - 80;
    ctx.font = 'bold 11px sans-serif';
    Object.entries(GRADE_COLOR).forEach(([grade, color]) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(legendX + 6, legendY + 6, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ccc';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(GRADE_LABEL[grade] || grade, legendX + 16, legendY + 6);
      legendY += 18;
    });
  }

  function hitTest(cx, cy) {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    const scale = Math.min(w, h) / 1000 * zoom;
    const hitR = Math.max(HIT_R, SEAT_R * zoom + 3);

    let closest = null;
    let closestDist = Infinity;
    allSeats.forEach((s) => {
      if (s.status !== 'available' && s.id !== selectedId) return;
      const p = toCanvas(s.rawX, s.rawY);
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < hitR && dist < closestDist) {
        closest = s;
        closestDist = dist;
      }
    });
    return closest;
  }

  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = -e.deltaY * WHEEL_K;
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * (1 + delta)));
    const pos = getCanvasPos(e);
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    const cx = pos.x - w / 2 - panX;
    const cy = pos.y - h / 2 - panY;
    const ratio = newZoom / zoom;
    panX -= cx * (ratio - 1);
    panY -= cy * (ratio - 1);
    zoom = newZoom;
    draw();
  }, { passive: false });

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    dragMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panStartX = panX;
    panStartY = panY;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('pointermove', (e) => {
    if (dragging) {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
      panX = panStartX + dx;
      panY = panStartY + dy;
      draw();
    } else {
      const pos = getCanvasPos(e);
      const hit = hitTest(pos.x, pos.y);
      const newHovered = hit ? hit.id : null;
      if (newHovered !== hoveredId) {
        hoveredId = newHovered;
        canvas.style.cursor = hoveredId ? 'pointer' : 'grab';
        draw();
      }
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    dragging = false;
    canvas.style.cursor = hoveredId ? 'pointer' : 'grab';
    if (!dragMoved) {
      const pos = getCanvasPos(e);
      const hit = hitTest(pos.x, pos.y);
      if (hit) {
        if (selectedId === hit.id) {
          selectedId = null;
          onSelect(null);
        } else {
          selectedId = hit.id;
          onSelect(hit);
        }
        draw();
      }
    }
  });

  window.addEventListener('resize', resize);
  resize();

  return {
    getSeats: () => allSeats,
    getSelected: () => allSeats.find((s) => s.id === selectedId),
    setStatus(seatId, status) {
      const s = allSeats.find((x) => x.id === seatId);
      if (s) { s.status = status; draw(); }
    },
    batchSetStatus(ids, status) {
      ids.forEach((id) => {
        const s = allSeats.find((x) => x.id === id);
        if (s) s.status = status;
      });
      draw();
    },
    clearSelection() {
      selectedId = null;
      draw();
    },
    stats() {
      let available = 0, sold = 0, holding = 0, mine = 0;
      const byGrade = {};
      allSeats.forEach((s) => {
        byGrade[s.grade] = byGrade[s.grade] || { total: 0, available: 0 };
        byGrade[s.grade].total++;
        if (s.status === 'available') { available++; byGrade[s.grade].available++; }
        else if (s.status === 'sold') sold++;
        else if (s.status === 'holding') holding++;
        else if (s.status === 'mine') mine++;
      });
      return { total: allSeats.length, available, sold, holding, mine, byGrade };
    },
    destroy() {
      window.removeEventListener('resize', resize);
    },
    zoomToZone(zoneId) {
      const zone = zoneMeta.find((z) => z.id === zoneId);
      if (!zone) return;
      const zoneSeats = allSeats.filter((s) => s.zoneId === zoneId);
      const xs = zoneSeats.map((s) => s.rawX);
      const ys = zoneSeats.map((s) => s.rawY);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const spanX = maxX - minX + 60;
      const spanY = maxY - minY + 60;
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      const baseScale = Math.min(w, h) / 1000;
      zoom = Math.min(ZOOM_MAX, Math.min(w / (spanX * baseScale), h / (spanY * baseScale)));
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      panX = -(cx - 500) * baseScale * zoom;
      panY = -(cy - 500) * baseScale * zoom;
      draw();
    },
    resetView() {
      zoom = 1;
      panX = 0;
      panY = 0;
      draw();
    },
  };
}
