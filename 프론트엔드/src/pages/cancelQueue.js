import { getConcert } from '../data/concerts.js';
import { formatNumber } from '../utils/format.js';
import { navigate } from '../router.js';
import { mountSeatMap } from '../components/seatMap.js';
import { generateSeats, seatSectionsForCancelPool } from '../state/seatEngine.js';
import {
  joinCancelQueue,
  getCancelQueue,
  ensureCancelPool,
  bumpCancelPool,
  consumeCancelPool,
  hasMembership,
  isLoggedIn,
  setReturnTo,
} from '../state/store.js';

const MEMBER_TURN_DURATION_MS = 14000;

export const cancelQueuePage = {
  render(container, params) {
    const c = getConcert(params.id);
    if (!c) {
      container.innerHTML = `<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>`;
      return;
    }

    if (!isLoggedIn()) {
      setReturnTo(`cancel-queue/${c.id}`);
      navigate('login');
      return;
    }

    const q = joinCancelQueue(c.id);
    const pool = ensureCancelPool(c.id);

    container.innerHTML = `
      <section class="cancel-hero">
        <div class="container">
          <div class="eyebrow">CANCELLATION QUEUE</div>
          <h2 class="section-title">${c.artist} 취소표 대기열</h2>
          <p class="section-sub">${c.title} · 매진된 좌석의 취소표를 대기열 순서대로 배부합니다</p>
        </div>
      </section>

      <div class="container cancel-body">
        <div>
          <div class="card" style="padding:28px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <h3 style="font-size:15px;font-weight:800;">내 취소표 대기 현황</h3>
              <span class="queue-status-pill"><span class="dot"></span><span data-status>대기 중</span></span>
            </div>
            <div class="queue-mynum-label" style="margin-top:22px;">내 대기번호</div>
            <div class="queue-mynum num-mono" style="font-size:64px;" data-mynum>${formatNumber(q.myNumber)}번</div>
            <div class="divider"></div>
            <div class="kv-row"><span>전체 대기자</span><b class="num-mono">${formatNumber(q.total)}명</b></div>
            <div class="kv-row"><span>예상 대기시간</span><b class="num-mono" data-eta>약 ${Math.max(1, Math.round((q.myNumber / q.total) * 210))}분</b></div>
          </div>

          <div class="card mt-24" style="padding:28px;" data-private-link-card></div>
        </div>

        <div>
          <div class="card" style="padding:28px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <h3 style="font-size:15px;font-weight:800;">취소표 Pool</h3>
              <span class="queue-status-pill"><span class="dot"></span>취소표 수집 중</span>
            </div>
            <p class="section-sub" style="margin-top:6px;">취소된 티켓은 즉시 배부되지 않고 Pool에 모여 순서대로 배부됩니다.</p>
            <div class="pool-grid" data-pool>
              ${['VIP', 'R', 'S']
                .map(
                  (g) => `
                <div class="pool-grade-card">
                  <div class="pool-grade-card__grade">${g}</div>
                  <div class="pool-grade-card__count num-mono" data-pool-${g}>${pool[g]}매</div>
                </div>`
                )
                .join('')}
            </div>
            <div class="pool-total">현재 수집된 취소표 총 <b class="num-mono" data-pool-total>${pool.VIP + pool.R + pool.S}</b>매</div>
          </div>

          <div class="card mt-24" style="padding:28px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <h3 style="font-size:15px;font-weight:800;">취소표 좌석 현황</h3>
              <span class="badge badge-gray">실시간 미리보기</span>
            </div>
            <p class="section-sub" style="margin-bottom:14px;">아직 순서가 아니어도 현재 Pool에 있는 좌석을 미리 확인할 수 있어요. 내 차례가 되면 이 중에서 선택합니다.</p>
            <div class="seatmap-scroll" style="max-height:340px;"><div class="seatmap-inner" data-seat-preview></div></div>
          </div>

          <div class="card mt-24" style="padding:28px;">
            <h3 style="font-size:15px;font-weight:800;margin-bottom:14px;">취소표 순차 배부 방식</h3>
            <div class="flow-diagram">
              <span class="flow-step active">1번 Private Link 발급</span>
              <span class="flow-arrow">→</span>
              <span class="flow-step">취켓팅 진행</span>
              <span class="flow-arrow">→</span>
              <span class="flow-step">종료</span>
              <span class="flow-arrow">→</span>
              <span class="flow-step">2번 Private Link 발급</span>
              <span class="flow-arrow">→</span>
              <span class="flow-step">... 2,000번까지 반복</span>
            </div>
            <div class="notice-box mt-16">
              <p><strong>1인 1매</strong> — 취소표는 1인 1매만 구매할 수 있습니다.</p>
              <p>한 사용자가 여러 장의 취소표를 구매할 수 없습니다.</p>
              <p>티켓을 확보하면 해당 사용자의 취소표 예매 기회가 종료됩니다.</p>
            </div>
            <div class="mt-16"><span class="badge badge-red">1인 1매</span></div>
          </div>
        </div>
      </div>
    `;

    // ---- Seat status preview: read-only view of what's currently in the Pool ----
    const previewHost = container.querySelector('[data-seat-preview]');
    function renderSeatPreview() {
      const p = ensureCancelPool(c.id);
      const sections = seatSectionsForCancelPool(p);
      const seats = generateSeats(sections);
      mountSeatMap(previewHost, { sections, seats, cancelMode: true, readOnly: true });
    }
    renderSeatPreview();

    // ---- Pool live simulation: new cancellations arrive, and members ahead of
    // me in line occasionally complete their sequential purchase. ----
    const poolInterval = setInterval(() => {
      const grades = ['VIP', 'R', 'S'];
      const roll = Math.random();
      const p = ensureCancelPool(c.id);
      if (roll < 0.55) {
        const g = grades[Math.floor(Math.random() * grades.length)];
        bumpCancelPool(c.id, g);
      } else if (roll < 0.8) {
        const available = grades.filter((g) => p[g] > 0);
        if (available.length) consumeCancelPool(c.id, available[Math.floor(Math.random() * available.length)]);
      } else {
        return;
      }
      const p2 = ensureCancelPool(c.id);
      ['VIP', 'R', 'S'].forEach((g) => {
        const el = container.querySelector(`[data-pool-${g}]`);
        if (el) el.textContent = `${p2[g]}매`;
      });
      const totalEl = container.querySelector('[data-pool-total]');
      if (totalEl) totalEl.textContent = p2.VIP + p2.R + p2.S;
      renderSeatPreview();
    }, 2600);

    // ---- Private link access card (membership-gated) ----
    const plCard = container.querySelector('[data-private-link-card]');
    let memberTimer = null;

    function renderMemberLocked() {
      plCard.innerHTML = `
        <div class="lock-box">
          <div class="lock-box__icon">🔒</div>
          <div class="lock-box__title">멤버십 가입 필요</div>
          <div class="lock-box__desc">취소표 Private Link는 멤버십 회원에게만 제공됩니다.<br/>대기번호는 모든 회원에게 공개되지만, 실제 입장 링크는 멤버십 전용입니다.</div>
          <button class="btn btn-primary" data-join-membership>멤버십 가입하기</button>
        </div>
      `;
      plCard.querySelector('[data-join-membership]').addEventListener('click', () => navigate('membership'));
    }

    function renderMemberWaiting() {
      plCard.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="font-size:15px;font-weight:800;">Private Link 대기 현황 <span class="site-header__member-chip" style="background:var(--color-primary-light);color:var(--color-primary-dark);">MEMBERSHIP</span></h3>
          <span style="font-size:12.5px;color:var(--color-text-secondary);">알림 <b class="text-red">ON</b></span>
        </div>
        <div class="kv-row"><span>내 대기번호</span><b class="num-mono" data-m-num>${formatNumber(q.myNumber)}번</b></div>
        <div class="kv-row"><span>전체 대기자</span><b class="num-mono">${formatNumber(q.total)}명</b></div>
        <div class="kv-row"><span>예상 대기시간</span><b class="num-mono" data-m-eta>약 --분</b></div>
        <div class="kv-row"><span>상태</span><b><span class="queue-status-pill"><span class="dot"></span>대기 중</span></b></div>
        <div class="mt-16" data-m-progress></div>
      `;
      const startNum = q.myNumber;
      const startTime = Date.now();
      let done = false;
      function tick() {
        if (done) return;
        const elapsed = Date.now() - startTime;
        const t = Math.min(1, elapsed / MEMBER_TURN_DURATION_MS);
        const eased = 1 - Math.pow(1 - t, 4);
        const current = Math.max(1, Math.round(startNum - (startNum - 1) * eased));
        const numEl = plCard.querySelector('[data-m-num]');
        const etaEl = plCard.querySelector('[data-m-eta]');
        if (numEl) numEl.textContent = `${formatNumber(current)}번`;
        if (etaEl) etaEl.textContent = current <= 1 ? '곧 입장' : `약 ${Math.max(1, Math.ceil((current / startNum) * 40))}분`;
        if (current <= 1) {
          done = true;
          clearInterval(memberTimer);
          renderMemberReady();
        }
      }
      memberTimer = setInterval(tick, 200);
      tick();
    }

    function renderMemberReady() {
      plCard.innerHTML = `
        <div style="text-align:center;padding:10px 0 4px;">
          <div class="badge badge-green" style="font-size:13px;padding:8px 16px;margin-bottom:16px;">내 차례입니다</div>
          <div style="font-size:15px;font-weight:700;margin-bottom:22px;">취소표 입장이 가능합니다.</div>
          <button class="btn btn-primary btn-lg btn-block" data-enter>Private Link 입장하기</button>
        </div>
      `;
      plCard.querySelector('[data-enter]').addEventListener('click', () => navigate(`private-link/${c.id}`));
    }

    if (hasMembership()) renderMemberWaiting();
    else renderMemberLocked();

    return () => {
      clearInterval(poolInterval);
      if (memberTimer) clearInterval(memberTimer);
    };
  },
};
