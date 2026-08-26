// 취소표 좌석 선택 페이지 — 취소표 대기열에서 입장 승인된 사용자가 좌석을 선택하는 화면.
// 취소표 풀(cancelPool)에서 실제 남은 좌석만 렌더링하며, 결제 후 예매가 확정된다.

import { getConcert } from '../data/concerts.js';
import { formatDate, formatPrice, formatNumber } from '../utils/format.js';
import { mountSeatMap } from '../components/seatMap.js';
import { generateSeats, seatSectionsForCancelPool } from '../state/seatEngine.js';
import { navigate } from '../router.js';
import { setCurrentOrder, ensureCancelPool } from '../state/store.js';

export const cancelSeatSelectPage = {
  render(container, params) {
    const c = getConcert(params.id);
    if (!c) {
      container.innerHTML = `<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>`;
      return;
    }

    const pool = ensureCancelPool(c.id);
    const poolTotal = pool.VIP + pool.R + pool.S;

    if (poolTotal <= 0) {
      container.innerHTML = `
        <div class="center-state">
          <div class="center-state__icon">😥</div>
          <div class="center-state__title">현재 취소표가 소진되었습니다</div>
          <div class="center-state__desc">다음 순번 대기자에게 기회가 넘어갔습니다. 취소표 Pool에 새 취소표가 모이면 다시 안내드릴게요.</div>
          <button class="btn btn-primary" data-back>취소표 대기열로</button>
        </div>`;
      container.querySelector('[data-back]').addEventListener('click', () => navigate(`cancel-queue/${c.id}`));
      return;
    }

    const sections = seatSectionsForCancelPool(pool);
    const seats = generateSeats(sections);

    container.innerHTML = `
      <section class="seat-page-header">
        <div class="container seat-page-header__top">
          <div>
            <div class="seat-page-header__title">${c.artist} <span class="badge badge-red">취소표 예매</span></div>
            <div class="section-sub">${c.title}</div>
            <div class="seat-page-header__date">${formatDate(c.dateStart)}</div>
          </div>
        </div>
      </section>

      <div class="container">
        <div class="pool-grid mt-24" style="margin-bottom:0;">
          ${['VIP', 'R', 'S']
            .map(
              (g) => `
            <div class="pool-grade-card">
              <div class="pool-grade-card__grade">${g}</div>
              <div class="pool-grade-card__count num-mono" data-count-${g}>${pool[g]}석</div>
            </div>`
            )
            .join('')}
        </div>
        <div class="notice-box mt-16">
          <p>지금은 <strong>회원님 순번에만 단독으로 배정된 시간</strong>입니다. 다른 대기자는 회원님의 선택이 끝나야 다음 순서로 진행됩니다.</p>
          <p><strong>1인 1매</strong> 제한이 적용됩니다. 좌석을 선택하면 다른 좌석은 더 이상 선택할 수 없습니다.</p>
        </div>
      </div>

      <div class="container">
        <div class="seat-select-body mt-16">
          <div class="seatmap-scroll"><div class="seatmap-inner" data-seatmap></div></div>
          <div class="order-rail" data-rail>
            <div class="order-rail__title">선택 좌석 정보</div>
            <div class="order-rail__empty" data-rail-empty>취소표 좌석을 선택해주세요</div>
          </div>
        </div>
      </div>
    `;

    const seatMapCtrl = mountSeatMap(container.querySelector('[data-seatmap]'), {
      sections,
      seats,
      cancelMode: true,
      onSeatClick: handleSeatClick,
    });

    const railEl = container.querySelector('[data-rail]');
    let mySeat = null;
    let locked = false;

    // No competing-buyer simulation here: while this Private Link is active, this
    // member is the exclusive person with access — the queue is strictly sequential,
    // one person at a time. The only thing that can shrink the pool is a prior
    // in-line member's purchase, which already happened before this screen loaded.
    function handleSeatClick(id) {
      if (locked) return;
      const seat = seats.find((x) => x.id === id);
      if (!seat || seat.status !== 'available') return;
      seat.status = 'mine';
      mySeat = seat;
      locked = true;
      seatMapCtrl.updateStatuses(seats);
      const countEl = container.querySelector(`[data-count-${seat.grade}]`);
      if (countEl) countEl.textContent = `${Number.parseInt(countEl.textContent, 10) - 1}석`;
      renderRailSelected();
    }

    function renderRailSelected() {
      const grade = c.grades.find((g) => g.key === mySeat.grade);
      railEl.innerHTML = `
        <div class="order-rail__title">선택 좌석 정보</div>
        <div class="order-rail__seat">
          <div class="order-rail__seat-grade">${grade.name} <span class="badge badge-red" style="margin-left:6px;">취소표</span></div>
          <div class="order-rail__seat-loc">${mySeat.section} ${mySeat.row}열 ${mySeat.seatNum}번</div>
          <div class="order-rail__seat-price num-mono">${formatPrice(grade.price)}</div>
        </div>
        <div class="badge badge-red-light" style="margin-bottom:14px;">1인 1매 제한 적용</div>
        <button class="btn btn-primary btn-block" data-next>결제하기</button>
      `;
      railEl.querySelector('[data-next]').addEventListener('click', () => {
        setCurrentOrder({
          concertId: c.id,
          seat: { ...mySeat, price: grade.price, gradeName: grade.name },
          source: 'cancel',
          securedAt: Date.now(),
        });
        navigate('payment/cancel');
      });
    }

  },
};
