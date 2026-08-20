import { getConcert } from '../data/concerts.js';
import { formatDate, formatPrice, formatNumber, formatMMSS } from '../utils/format.js';
import { mountSeatMap } from '../components/seatMap.js';
import { generateSeats, createSeatSimulator, seatSectionsForConcert } from '../state/seatEngine.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';
import { setCurrentOrder, joinCancelQueue } from '../state/store.js';

const HOLD_MS = 8 * 60 * 1000 + 42 * 1000; // 08:42

export const seatSelectPage = {
  render(container, params) {
    const c = getConcert(params.id);
    if (!c) {
      container.innerHTML = `<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>`;
      return;
    }

    const sections = seatSectionsForConcert();
    const seats = generateSeats(sections);

    container.innerHTML = `
      <section class="seat-page-header">
        <div class="container seat-page-header__top">
          <div>
            <div class="seat-page-header__title">${c.artist}</div>
            <div class="section-sub">${c.title}</div>
            <div class="seat-page-header__date">${formatDate(c.dateStart)}</div>
          </div>
          <div class="seat-page-header__right" data-hold-timer-box></div>
        </div>
      </section>

      <div class="container">
        <div class="seats-left-banner" data-banner>
          <div>
            <div class="seats-left-banner__msg" data-tension-msg>실시간으로 좌석이 예매되고 있습니다.</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px;color:var(--color-text-secondary);">현재 남은 좌석</div>
            <div class="seats-left-banner__num num-mono" data-remaining>${formatNumber(seats.length)}석</div>
          </div>
        </div>
      </div>

      <div class="container" data-body>
        <div class="seat-select-body">
          <div class="seatmap-scroll"><div class="seatmap-inner" data-seatmap></div></div>
          <div class="order-rail" data-rail>
            <div class="order-rail__title">선택 좌석 정보</div>
            <div class="order-rail__empty" data-rail-empty>좌석을 선택해주세요</div>
          </div>
        </div>
      </div>
      <div class="container" data-soldout style="display:none;"></div>
    `;

    const seatMapHost = container.querySelector('[data-seatmap]');
    const seatMapCtrl = mountSeatMap(seatMapHost, {
      sections,
      seats,
      onSeatClick: handleSeatClick,
    });

    const remainingEl = container.querySelector('[data-remaining]');
    const bannerEl = container.querySelector('[data-banner]');
    const tensionMsgEl = container.querySelector('[data-tension-msg]');
    const railEl = container.querySelector('[data-rail]');
    const holdBox = container.querySelector('[data-hold-timer-box]');
    const bodyEl = container.querySelector('[data-body]');
    const soldoutEl = container.querySelector('[data-soldout]');

    let holdTimer = null;
    let holdDeadline = null;
    let mySeat = null;
    let soldOutHandled = false;

    function paintTension(stats) {
      const remaining = stats.available;
      remainingEl.textContent = `${formatNumber(remaining)}석`;
      const tense = remaining <= 100;
      bannerEl.classList.toggle('tension', tense);
      if (remaining <= 5) tensionMsgEl.textContent = '곧 매진됩니다. 서둘러주세요!';
      else if (remaining <= 20) tensionMsgEl.textContent = '남은 좌석이 얼마 남지 않았습니다.';
      else if (remaining <= 100) tensionMsgEl.textContent = '좌석이 빠르게 매진되고 있습니다.';
      else tensionMsgEl.textContent = '실시간으로 좌석이 예매되고 있습니다.';
    }

    const sim = createSeatSimulator(seats, {
      tickMs: 900,
      onTick: (allSeats, stats) => {
        seatMapCtrl.updateStatuses(allSeats);
        paintTension(stats);
      },
      onSoldOut: () => {
        if (mySeat) return; // I already secured a seat — sellout of the rest doesn't affect me
        showSoldOut();
      },
    });
    sim.start();
    paintTension(sim.stats());

    function handleSeatClick(id) {
      if (mySeat) sim.releaseMine();
      const result = sim.selectSeat(id);
      if (!result.ok) {
        seatMapCtrl.flashSold(id);
        showToast({
          title: '죄송합니다.',
          body: '다른 사용자가 먼저 선택한 좌석입니다.',
          actionLabel: '다른 좌석 선택',
        });
        mySeat = null;
        renderRailEmpty();
        clearHold();
        return;
      }
      mySeat = result.seat;
      startHold();
      renderRailSelected();
    }

    function renderRailEmpty() {
      railEl.innerHTML = `
        <div class="order-rail__title">선택 좌석 정보</div>
        <div class="order-rail__empty">좌석을 선택해주세요</div>
      `;
    }

    function renderRailSelected() {
      const grade = c.grades.find((g) => g.key === mySeat.grade);
      railEl.innerHTML = `
        <div class="order-rail__title">선택 좌석 정보</div>
        <div class="order-rail__seat">
          <div class="order-rail__seat-grade">${grade.name}</div>
          <div class="order-rail__seat-loc">${mySeat.section} ${mySeat.row}열 ${mySeat.seatNum}번</div>
          <div class="order-rail__seat-price num-mono">${formatPrice(grade.price)}</div>
        </div>
        <button class="btn btn-primary btn-block" data-next>다음</button>
      `;
      railEl.querySelector('[data-next]').addEventListener('click', () => {
        clearHold();
        sim.stop();
        setCurrentOrder({
          concertId: c.id,
          seat: { ...mySeat, price: grade.price, gradeName: grade.name },
          source: 'regular',
          securedAt: Date.now(),
        });
        navigate(`payment/regular`);
      });
    }

    function paintHoldBox(ms) {
      holdBox.innerHTML = `
        <div class="seat-page-header__timer">좌석 선택 제한시간</div>
        <div class="seat-page-header__timer num-mono"><b>${formatMMSS(ms)}</b></div>
      `;
    }

    function startHold() {
      clearHold();
      holdDeadline = Date.now() + HOLD_MS;
      paintHoldBox(HOLD_MS);
      holdTimer = setInterval(() => {
        const remaining = holdDeadline - Date.now();
        if (remaining <= 0) {
          clearHold();
          if (mySeat) {
            sim.releaseMine();
            mySeat = null;
            renderRailEmpty();
            showToast({ title: '선택 시간이 만료되었습니다.', body: '좌석 선택을 다시 진행해주세요.' });
          }
          holdBox.innerHTML = '';
          return;
        }
        paintHoldBox(remaining);
      }, 1000);
    }

    function clearHold() {
      if (holdTimer) clearInterval(holdTimer);
      holdTimer = null;
      if (!mySeat) holdBox.innerHTML = '';
    }

    function showSoldOut() {
      if (soldOutHandled) return;
      soldOutHandled = true;
      // The user reached seat-select before the show sold out — auto-qualify them
      // as a cancellation-queue candidate (per QUEUING policy).
      joinCancelQueue(c.id);
      bodyEl.style.display = 'none';
      soldoutEl.style.display = 'block';
      soldoutEl.innerHTML = `
        <div class="soldout-panel">
          <div class="soldout-title">SOLD OUT</div>
          <div class="soldout-desc">티켓이 모두 매진되었습니다.<br/>현재 예매 가능한 좌석이 없습니다.</div>
          <div class="soldout-actions">
            <button class="btn btn-outline btn-lg" data-mynum>내 대기번호 확인</button>
            <button class="btn btn-primary btn-lg" data-cancel>취소표 대기열 확인</button>
          </div>
        </div>
      `;
      soldoutEl.querySelector('[data-cancel]').addEventListener('click', () => navigate(`cancel-queue/${c.id}`));
      soldoutEl.querySelector('[data-mynum]').addEventListener('click', () => navigate(`cancel-queue/${c.id}`));
    }

    return () => {
      sim.stop();
      if (holdTimer) clearInterval(holdTimer);
    };
  },
};
