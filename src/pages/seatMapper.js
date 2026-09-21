// 어드민 전용 좌석 맵핑 도구 — 공연장 배경 이미지 위에 3점 클릭으로 구역을 정의하고,
// 행/열 입력 후 벡터 보간으로 좌석 좌표 배열을 자동 생성한다.

import { isAdmin } from '../state/store.js';
import { navigate } from '../router.js';

const ZONE_COLORS = [
  '#B5121B', '#C98500', '#199E70', '#3987E5',
  '#8E44AD', '#16A085', '#D35400', '#2C3E50',
  '#E74C3C', '#1ABC9C',
];

export const seatMapperPage = {
  render(container) {
    if (!isAdmin()) {
      container.innerHTML = '<div class="center-state"><div class="center-state__title">관리자 전용 페이지입니다</div></div>';
      return;
    }

    container.innerHTML = `
      <style>
        .mapper-wrap { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }
        .mapper-title { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
        .mapper-desc { color: var(--color-text-secondary); font-size: 14px; margin-bottom: 20px; }
        .mapper-toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
        .mapper-toolbar label { font-size: 13px; font-weight: 600; }
        .mapper-toolbar input[type="file"] { font-size: 13px; }
        .mapper-canvas-wrap {
          position: relative; border: 2px solid var(--color-border);
          border-radius: 12px; overflow: hidden; background: #111;
          cursor: crosshair; user-select: none; touch-action: none;
        }
        .mapper-canvas-wrap canvas { display: block; width: 100%; }
        .mapper-guide {
          position: absolute; top: 12px; left: 12px; right: 12px;
          background: rgba(0,0,0,0.75); color: #fff; padding: 10px 14px;
          border-radius: 8px; font-size: 13px; pointer-events: none;
          z-index: 2;
        }
        .mapper-sidebar { margin-top: 20px; color: #eee; }
        .mapper-sidebar h3 { color: #fff; }
        .zone-list { list-style: none; padding: 0; }
        .zone-item {
          background: var(--color-bg-secondary); border-radius: 8px;
          padding: 14px; margin-bottom: 10px; position: relative;
        }
        .zone-item__head { display: flex; justify-content: space-between; align-items: center; }
        .zone-item__name { font-weight: 700; font-size: 15px; }
        .zone-item__info { font-size: 13px; color: var(--color-text-secondary); margin-top: 4px; }
        .zone-item__actions { display: flex; gap: 8px; }
        .zone-item__btn {
          background: none; border: 1px solid var(--color-border);
          border-radius: 6px; padding: 4px 10px; font-size: 12px;
          cursor: pointer; color: var(--color-text-primary);
        }
        .zone-item__btn:hover { background: var(--color-bg-tertiary); }
        .zone-item__btn--del { color: #e74c3c; border-color: #e74c3c; }
        .mapper-output {
          margin-top: 20px; background: #1e1e1e; color: #d4d4d4;
          border-radius: 8px; padding: 16px; font-family: monospace;
          font-size: 12px; max-height: 400px; overflow: auto;
          white-space: pre-wrap; word-break: break-all;
        }
        .mapper-btn-row { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
        .mapper-btn {
          padding: 10px 20px; border-radius: 8px; border: none;
          font-size: 14px; font-weight: 600; cursor: pointer;
        }
        .mapper-btn--primary { background: var(--color-primary); color: #fff; }
        .mapper-btn--secondary { background: var(--color-bg-secondary); color: var(--color-text-primary); border: 1px solid var(--color-border); }
        .mapper-modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.6);
          display: flex; align-items: center; justify-content: center; z-index: 1000;
        }
        .mapper-modal {
          background: var(--color-bg-primary); border-radius: 12px; padding: 24px;
          min-width: 320px; max-width: 90vw;
        }
        .mapper-modal h3 { margin: 0 0 16px; font-size: 18px; }
        .mapper-modal label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px; }
        .mapper-modal input, .mapper-modal select {
          width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--color-border);
          font-size: 14px; margin-bottom: 12px; background: var(--color-bg-secondary);
          color: var(--color-text-primary); box-sizing: border-box;
        }
        .mapper-modal .btn-row { display: flex; gap: 10px; justify-content: flex-end; }
      </style>

      <div class="mapper-wrap">
        <div class="mapper-title">좌석 맵핑 도구</div>
        <div class="mapper-desc">공연장 이미지 위에 구역별 3점을 클릭하여 좌석 좌표를 자동 생성합니다.</div>

        <div class="mapper-toolbar">
          <label>배경 이미지:</label>
          <input type="file" accept="image/*" data-file-input />
          <span style="font-size:12px;color:var(--color-text-secondary);" data-img-info>이미지를 불러오세요</span>
        </div>

        <div class="mapper-canvas-wrap" data-canvas-wrap>
          <div class="mapper-guide" data-guide>이미지를 먼저 불러오세요</div>
          <canvas data-canvas width="1200" height="700"></canvas>
        </div>

        <div class="mapper-sidebar">
          <h3 style="margin:0 0 12px;">정의된 구역</h3>
          <ul class="zone-list" data-zone-list></ul>
        </div>

        <div class="mapper-btn-row">
          <button class="mapper-btn mapper-btn--primary" data-export>JSON 내보내기</button>
          <button class="mapper-btn mapper-btn--secondary" data-copy>클립보드 복사</button>
          <button class="mapper-btn mapper-btn--secondary" data-clear>전체 초기화</button>
        </div>

        <pre class="mapper-output" data-output style="display:none;"></pre>
      </div>
    `;

    const canvas = container.querySelector('[data-canvas]');
    const ctx = canvas.getContext('2d');
    const wrapEl = container.querySelector('[data-canvas-wrap]');
    const guideEl = container.querySelector('[data-guide]');
    const zoneListEl = container.querySelector('[data-zone-list]');
    const outputEl = container.querySelector('[data-output]');
    const fileInput = container.querySelector('[data-file-input]');
    const imgInfoEl = container.querySelector('[data-img-info]');

    let bgImage = null;
    let zones = [];
    let clickPoints = [];
    let clickPhase = 0; // 0=idle, 1=picking 3 points

    const MAX_CANVAS_H = 480;

    function resizeCanvas() {
      const rect = wrapEl.getBoundingClientRect();
      const w = Math.floor(rect.width);
      if (bgImage) {
        const aspect = bgImage.naturalHeight / bgImage.naturalWidth;
        let h = Math.floor(w * aspect);
        if (h > MAX_CANVAS_H) h = MAX_CANVAS_H;
        canvas.width = w;
        canvas.height = h;
      } else {
        canvas.width = w;
        canvas.height = Math.min(Math.floor(w * 0.5), MAX_CANVAS_H);
      }
      draw();
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (bgImage) {
        ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#555';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('이미지를 불러오세요', canvas.width / 2, canvas.height / 2);
      }

      zones.forEach((z, zi) => {
        drawZone(z, zi);
      });

      clickPoints.forEach((p, i) => {
        drawPoint(p.x, p.y, '#FFD600', i + 1);
      });
    }

    function drawZone(z, idx) {
      const color = ZONE_COLORS[idx % ZONE_COLORS.length];
      const pts = z.corners;
      const p4 = getFourthPoint(pts[0], pts[1], pts[2]);

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.lineTo(p4.x, p4.y);
      ctx.lineTo(pts[2].x, pts[2].y);
      ctx.closePath();
      ctx.fillStyle = color + '33';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      pts.forEach((p, i) => drawPoint(p.x, p.y, color, i + 1));
      drawPoint(p4.x, p4.y, color, 4);

      if (z.seats) {
        z.seats.forEach((s) => {
          ctx.beginPath();
          ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = color + 'AA';
          ctx.fill();
        });
      }

      const cx = (pts[0].x + pts[1].x + pts[2].x + p4.x) / 4;
      const cy = (pts[0].y + pts[1].y + pts[2].y + p4.y) / 4;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(z.name, cx, cy);
      ctx.fillText(z.name, cx, cy);
    }

    function drawPoint(x, y, color, num) {
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(num), x, y);
    }

    // 3점으로 4번째 점 계산 (평행사변형): P4 = P3 + (P2 - P1)
    function getFourthPoint(p1, p2, p3) {
      return { x: p3.x + (p2.x - p1.x), y: p3.y + (p2.y - p1.y) };
    }

    // 3점 + 행/열로 좌석 보간
    function interpolateSeats(corners, rows, cols) {
      const [tl, tr, bl] = corners;
      const br = getFourthPoint(tl, tr, bl);
      const seats = [];
      for (let r = 0; r < rows; r++) {
        const ry = rows > 1 ? r / (rows - 1) : 0;
        const leftX = tl.x + (bl.x - tl.x) * ry;
        const leftY = tl.y + (bl.y - tl.y) * ry;
        const rightX = tr.x + (br.x - tr.x) * ry;
        const rightY = tr.y + (br.y - tr.y) * ry;
        for (let c = 0; c < cols; c++) {
          const cx = cols > 1 ? c / (cols - 1) : 0;
          seats.push({
            row: r + 1,
            col: c + 1,
            x: Math.round(leftX + (rightX - leftX) * cx),
            y: Math.round(leftY + (rightY - leftY) * cx),
          });
        }
      }
      return seats;
    }

    function getCanvasPos(e) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.round((e.clientX - rect.left) * (canvas.width / rect.width)),
        y: Math.round((e.clientY - rect.top) * (canvas.height / rect.height)),
      };
    }

    function updateGuide() {
      if (!bgImage) {
        guideEl.textContent = '이미지를 먼저 불러오세요';
        return;
      }
      if (clickPhase === 0) {
        guideEl.textContent = '캔버스를 클릭하여 구역 정의를 시작하세요 (좌측 상단 → 우측 상단 → 좌측 하단 순서로 3점 클릭)';
        return;
      }
      const labels = ['① 좌측 상단', '② 우측 상단', '③ 좌측 하단'];
      const done = clickPoints.length;
      if (done < 3) {
        guideEl.textContent = `${labels[done]}을 클릭하세요 (${done}/3)`;
      }
    }

    function showZoneModal() {
      const overlay = document.createElement('div');
      overlay.className = 'mapper-modal-overlay';
      overlay.innerHTML = `
        <div class="mapper-modal">
          <h3>구역 정보 입력</h3>
          <label>구역 이름</label>
          <input type="text" data-m-name placeholder="예: VIP-A, 1층 B구역" />
          <label>등급 (Grade)</label>
          <select data-m-grade>
            <option value="VIP">VIP</option>
            <option value="R" selected>R</option>
            <option value="S">S</option>
            <option value="A">A</option>
          </select>
          <label>행 수 (Rows)</label>
          <input type="number" data-m-rows value="10" min="1" max="100" />
          <label>열 수 (Cols)</label>
          <input type="number" data-m-cols value="12" min="1" max="100" />
          <div class="btn-row">
            <button class="mapper-btn mapper-btn--secondary" data-m-cancel>취소</button>
            <button class="mapper-btn mapper-btn--primary" data-m-ok>생성</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('[data-m-cancel]').addEventListener('click', () => {
        clickPoints = [];
        clickPhase = 0;
        updateGuide();
        draw();
        overlay.remove();
      });

      overlay.querySelector('[data-m-ok]').addEventListener('click', () => {
        const name = overlay.querySelector('[data-m-name]').value.trim() || `구역 ${zones.length + 1}`;
        const grade = overlay.querySelector('[data-m-grade]').value;
        const rows = parseInt(overlay.querySelector('[data-m-rows]').value) || 10;
        const cols = parseInt(overlay.querySelector('[data-m-cols]').value) || 12;

        const seats = interpolateSeats(clickPoints, rows, cols);
        zones.push({
          name,
          grade,
          rows,
          cols,
          corners: [...clickPoints],
          seats,
        });

        clickPoints = [];
        clickPhase = 0;
        updateGuide();
        renderZoneList();
        draw();
        overlay.remove();
      });
    }

    canvas.addEventListener('click', (e) => {
      if (!bgImage) return;

      if (clickPhase === 0) clickPhase = 1;

      if (clickPhase === 1) {
        const pos = getCanvasPos(e);
        clickPoints.push(pos);
        draw();
        updateGuide();

        if (clickPoints.length === 3) {
          showZoneModal();
        }
      }
    });

    function renderZoneList() {
      if (zones.length === 0) {
        zoneListEl.innerHTML = '<li style="color:var(--color-text-secondary);font-size:13px;">아직 정의된 구역이 없습니다.</li>';
        return;
      }
      zoneListEl.innerHTML = zones.map((z, i) => `
        <li class="zone-item" style="border-left: 4px solid ${ZONE_COLORS[i % ZONE_COLORS.length]};">
          <div class="zone-item__head">
            <span class="zone-item__name">${z.name} (${z.grade})</span>
            <div class="zone-item__actions">
              <button class="zone-item__btn zone-item__btn--del" data-del="${i}">삭제</button>
            </div>
          </div>
          <div class="zone-item__info">${z.rows}행 × ${z.cols}열 = ${z.rows * z.cols}석 | 꼭짓점: (${z.corners.map(c => `${c.x},${c.y}`).join(') (')})</div>
        </li>
      `).join('');

      zoneListEl.querySelectorAll('[data-del]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.del);
          zones.splice(idx, 1);
          renderZoneList();
          draw();
        });
      });
    }

    function generateOutput() {
      const output = zones.map((z) => ({
        name: z.name,
        grade: z.grade,
        rows: z.rows,
        cols: z.cols,
        totalSeats: z.rows * z.cols,
        corners: z.corners,
        fourthPoint: getFourthPoint(z.corners[0], z.corners[1], z.corners[2]),
        seats: z.seats.map((s) => ({
          id: `${z.grade}-${s.row}-${s.col}`,
          row: s.row,
          col: s.col,
          x: s.x,
          y: s.y,
          grade: z.grade,
          section: z.name,
        })),
      }));
      return JSON.stringify(output, null, 2);
    }

    container.querySelector('[data-export]').addEventListener('click', () => {
      if (zones.length === 0) return;
      const json = generateOutput();
      outputEl.textContent = json;
      outputEl.style.display = 'block';
    });

    container.querySelector('[data-copy]').addEventListener('click', () => {
      if (zones.length === 0) return;
      const json = generateOutput();
      navigator.clipboard.writeText(json).then(() => {
        const btn = container.querySelector('[data-copy]');
        btn.textContent = '복사 완료!';
        setTimeout(() => (btn.textContent = '클립보드 복사'), 1500);
      });
    });

    container.querySelector('[data-clear]').addEventListener('click', () => {
      zones = [];
      clickPoints = [];
      clickPhase = 0;
      updateGuide();
      renderZoneList();
      draw();
      outputEl.style.display = 'none';
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          bgImage = img;
          imgInfoEl.textContent = `${img.naturalWidth} × ${img.naturalHeight}px`;
          resizeCanvas();
          updateGuide();
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    updateGuide();
    renderZoneList();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  },
};
