// 올림픽홀 좌석 배치 미리보기 — 어드민 전용
import { isAdmin } from '../state/store.js';
import { mountOlympicHallMap } from '../components/olympicHallMap.js';
import { OLYMPIC_HALL } from '../data/olympicHallSeats.js';

const GRADE_COLOR = { VIP: '#B5121B', R: '#C98500', S: '#199E70', A: '#3987E5' };
const GRADE_LABEL = { VIP: 'VIP (Floor)', R: 'R석', S: 'S석', A: 'A석' };

export const olympicHallPreviewPage = {
  render(container) {
    if (!isAdmin()) {
      container.innerHTML = '<div class="center-state"><div class="center-state__title">관리자 전용 페이지입니다</div></div>';
      return;
    }

    const totalSeats = OLYMPIC_HALL.zones.reduce((sum, z) => sum + z.seats.length, 0);
    const byGrade = {};
    OLYMPIC_HALL.zones.forEach((z) => {
      byGrade[z.grade] = (byGrade[z.grade] || 0) + z.seats.length;
    });

    container.innerHTML = `
      <style>
        .oh-wrap { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }
        .oh-title { font-size: 22px; font-weight: 700; margin-bottom: 4px; color: #fff; }
        .oh-sub { font-size: 13px; color: #aaa; margin-bottom: 16px; }
        .oh-stats { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
        .oh-stat {
          background: #222; border-radius: 8px; padding: 10px 16px;
          display: flex; align-items: center; gap: 8px;
        }
        .oh-stat__dot { width: 10px; height: 10px; border-radius: 50%; }
        .oh-stat__label { font-size: 13px; color: #aaa; }
        .oh-stat__num { font-size: 15px; font-weight: 700; color: #fff; }
        .oh-map-wrap { border: 2px solid #333; border-radius: 12px; overflow: hidden; }
        .oh-zones { margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap; }
        .oh-zone-btn {
          background: #222; border: 1px solid #444; border-radius: 6px;
          padding: 4px 10px; font-size: 12px; cursor: pointer; color: #ddd;
        }
        .oh-zone-btn:hover { background: #333; }
        .oh-info { margin-top: 12px; font-size: 13px; color: #aaa; min-height: 20px; }
      </style>
      <div class="oh-wrap">
        <div class="oh-title">서울 올림픽홀 좌석 배치도</div>
        <div class="oh-sub">총 ${totalSeats.toLocaleString()}석 · ${OLYMPIC_HALL.zones.length}개 구역</div>
        <div class="oh-stats">
          ${Object.entries(byGrade).map(([g, cnt]) => `
            <div class="oh-stat">
              <div class="oh-stat__dot" style="background:${GRADE_COLOR[g]}"></div>
              <span class="oh-stat__label">${GRADE_LABEL[g]}</span>
              <span class="oh-stat__num">${cnt}</span>
            </div>
          `).join('')}
        </div>
        <div class="oh-map-wrap" data-map></div>
        <div class="oh-zones">
          <button class="oh-zone-btn" data-reset>전체 보기</button>
          ${OLYMPIC_HALL.zones.map((z) => `
            <button class="oh-zone-btn" data-zone="${z.id}" style="border-color:${GRADE_COLOR[z.grade]}55">${z.id}</button>
          `).join('')}
        </div>
        <div class="oh-info" data-info>좌석을 클릭하면 정보가 표시됩니다</div>
      </div>
    `;

    const infoEl = container.querySelector('[data-info]');
    const mapCtrl = mountOlympicHallMap(container.querySelector('[data-map]'), {
      onSelect(seat) {
        if (seat) {
          const zone = OLYMPIC_HALL.zones.find((z) => z.id === seat.zoneId);
          infoEl.textContent = `${seat.id} | ${zone?.name} | ${GRADE_LABEL[seat.grade]} | 좌표: (${seat.rawX.toFixed(0)}, ${seat.rawY.toFixed(0)})`;
        } else {
          infoEl.textContent = '좌석을 클릭하면 정보가 표시됩니다';
        }
      },
    });

    container.querySelector('[data-reset]').addEventListener('click', () => mapCtrl.resetView());
    container.querySelectorAll('[data-zone]').forEach((btn) => {
      btn.addEventListener('click', () => mapCtrl.zoomToZone(btn.dataset.zone));
    });

    return () => mapCtrl.destroy();
  },
};
