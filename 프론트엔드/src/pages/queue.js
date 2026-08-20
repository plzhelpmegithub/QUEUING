import { getConcert } from '../data/concerts.js';
import { formatNumber } from '../utils/format.js';
import { mountRocketProgress } from '../components/rocketProgress.js';
import { navigate } from '../router.js';

const DURATION_MS = 19000;

export const queuePage = {
  render(container, params) {
    const c = getConcert(params.id);
    if (!c) {
      container.innerHTML = `<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>`;
      return;
    }

    const TOTAL = 250000 + Math.floor(Math.random() * 30000);
    const START_NUM = 120000 + Math.floor(Math.random() * 100000);

    container.innerHTML = `
      <section class="queue-page container">
        <div class="eyebrow">BOOKING QUEUE</div>
        <div class="section-title" style="margin-bottom:4px;">${c.artist} 예매 대기열</div>
        <div class="section-sub">${c.title}</div>

        <div class="queue-stats mt-40">
          <div>
            <div class="queue-stat-label">전체 대기자</div>
            <div class="queue-stat-value num-mono" data-total>${formatNumber(TOTAL)}명</div>
          </div>
          <div>
            <div class="queue-stat-label">예상 대기시간</div>
            <div class="queue-stat-value num-mono" data-eta>약 --분</div>
          </div>
          <div>
            <div class="queue-stat-label">현재 상태</div>
            <div class="queue-stat-value"><span class="queue-status-pill"><span class="dot"></span><span data-status>대기 중</span></span></div>
          </div>
        </div>

        <div class="queue-mynum-label">내 대기번호</div>
        <div class="queue-mynum num-mono" data-mynum>${formatNumber(START_NUM)}</div>

        <div class="queue-progress-wrap" data-rocket></div>

        <div class="queue-notice">
          <p>페이지를 새로고침하지 마세요.</p>
          <p>대기번호는 자동으로 업데이트됩니다.</p>
          <p>현재 많은 사용자가 동시에 예매를 진행하고 있습니다.</p>
        </div>

        <div class="queue-enter-box" data-enter-box></div>
      </section>
    `;

    const rocket = mountRocketProgress(container.querySelector('[data-rocket]'), 0);
    const myNumEl = container.querySelector('[data-mynum]');
    const etaEl = container.querySelector('[data-eta]');
    const statusEl = container.querySelector('[data-status]');
    const enterBox = container.querySelector('[data-enter-box]');

    const startTime = Date.now();
    let done = false;

    function frame() {
      if (done) return;
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 4);
      const current = Math.max(1, Math.round(START_NUM - (START_NUM - 1) * eased));

      myNumEl.textContent = formatNumber(current);
      myNumEl.classList.toggle('hot', current <= 1000);
      myNumEl.classList.toggle('pulse-red', current <= 200);

      rocket.update(eased * 100);

      const remainingSec = Math.max(0, Math.round((DURATION_MS - elapsed) / 1000));
      const etaMin = Math.max(0, Math.ceil((current / START_NUM) * 137));
      etaEl.textContent = current <= 1 ? '입장 완료' : `약 ${etaMin}분`;

      if (current <= 1) {
        done = true;
        clearInterval(timer);
        statusEl.textContent = '입장 완료';
        enterBox.innerHTML = `
          <div class="badge badge-green" style="font-size:13px;padding:8px 16px;margin-bottom:16px;">입장이 완료되었습니다</div>
          <div style="font-size:15px;color:var(--color-text-secondary);margin-bottom:20px;">이제 좌석 선택을 시작할 수 있습니다.</div>
          <button class="btn btn-primary btn-lg" data-seat-btn>좌석 선택하기</button>
        `;
        enterBox.querySelector('[data-seat-btn]').addEventListener('click', () => navigate(`seats/${c.id}`));
      }
    }
    const timer = setInterval(frame, 200);
    frame();

    return () => clearInterval(timer);
  },
};
