// 취소표 대기열 페이지 — 백엔드 API 연동 버전 (B Part)

import { getConcert } from '../data/concerts.js';
import { formatNumber } from '../utils/format.js';
import { navigate } from '../router.js';
import { mountSeatMap } from '../components/seatMap.js';
import { generateSeats, seatSectionsForCancelPool } from '../state/seatEngine.js';
import {
  ensureCancelPool,
  bumpCancelPool,
  consumeCancelPool,
  isLoggedIn,
  setReturnTo,
} from '../state/store.js';

const BACKEND_URL = "http://192.168.0.189:8000";

export const cancelQueuePage = {
  async render(container, params) {
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

    // 현재 로그인된 유저 ID 가져오기 (스토어 또는 세션 기준, 예시로 'test_user' 또는 로컬스토리지 활용 가능)
    const userId = localStorage.getItem('user_id') || 'test_user'; 
    const pool = ensureCancelPool(c.id);

    // 기본 뼈대 먼저 렌더링
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
              <span class="queue-status-pill"><span class="dot"></span><span data-status>확인 중...</span></span>
            </div>
            <div class="queue-mynum-label" style="margin-top:22px;">내 대기번호</div>
            <div class="queue-mynum num-mono" style="font-size:64px;" data-mynum>--번</div>
            <div class="divider"></div>
            <div class="kv-row"><span>전체 대기자</span><b class="num-mono" data-total-queue>--명</b></div>
            <div class="kv-row"><span>예상 대기시간</span><b class="num-mono" data-eta>약 --분</b></div>
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
            <p class="section-sub" style="margin-bottom:14px;">아직 순서가 아니어도 현재 Pool에 있는 좌석을 미리 확인할 수 있어요.</p>
            <div class="seatmap-scroll" style="max-height:340px;"><div class="seatmap-inner" data-seat-preview></div></div>
          </div>
        </div>
      </div>
    `;

    // 1. 백엔드 API를 통해 멤버십 상태 및 대기열 등록 처리
    let isMember = false;
    try {
      // 멤버십 조회 API 호출
      const memberRes = await fetch(`${BACKEND_URL}/membership/${userId}`);
      const memberData = await memberRes.json();
      isMember = memberData.isMembership;

      if (isMember) {
        // 유료 회원인 경우 대기열 등록 API 호출 (/api/v1/resale/queue/join)
        const joinRes = await fetch(`${BACKEND_URL}/api/v1/resale/queue/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, seat_id: 1, event_id: c.id })
        });
        const joinData = await joinRes.json();

        if (joinRes.ok) {
          const myNum = joinData.queue_position || 1;
          container.querySelector('[data-mynum]').textContent = `${formatNumber(myNum)}번`;
          container.querySelector('[data-total-queue]').textContent = `${formatNumber(myNum)}명`;
          container.querySelector('[data-eta]').textContent = `약 ${Math.max(1, Math.round(myNum * 2))}분`;
          container.querySelector('[data-status]').textContent = '대기 중';
          
          renderMemberWaiting(myNum);
        } else {
          alert(joinData.detail || "대기열 등록 중 오류가 발생했습니다.");
        }
      } else {
        renderMemberLocked();
      }
    } catch (error) {
      console.error("백엔드 API 통신 실패:", error);
      container.querySelector('[data-status]').textContent = '서버 연결 오류';
    }

    // ---- Seat status preview ----
    const previewHost = container.querySelector('[data-seat-preview]');
    function renderSeatPreview() {
      const p = ensureCancelPool(c.id);
      const sections = seatSectionsForCancelPool(p);
      const seats = generateSeats(sections);
      mountSeatMap(previewHost, { sections, seats, cancelMode: true, readOnly: true });
    }
    renderSeatPreview();

    // ---- Pool live simulation ----
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

    const plCard = container.querySelector('[data-private-link-card]');

    function renderMemberLocked() {
      plCard.innerHTML = `
        <div class="lock-box">
          <div class="lock-box__icon">🔒</div>
          <div class="lock-box__title">멤버십 가입 필요</div>
          <div class="lock-box__desc">취소표 Private Link는 멤버십 회원에게만 제공됩니다.<br/>지금 바로 멤버십에 가입하고 대기열에 진입하세요.</div>
          <button class="btn btn-primary" data-join-membership>멤버십 가입하기</button>
        </div>
      `;
      plCard.querySelector('[data-join-membership]').addEventListener('click', () => navigate('membership'));
    }

    function renderMemberWaiting(myNum) {
      plCard.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="font-size:15px;font-weight:800;">Private Link 대기 현황 <span class="site-header__member-chip" style="background:var(--color-primary-light);color:var(--color-primary-dark);">MEMBERSHIP</span></h3>
          <span style="font-size:12.5px;color:var(--color-text-secondary);">알림 <b class="text-red">ON</b></span>
        </div>
        <div class="kv-row"><span>내 대기번호</span><b class="num-mono">${formatNumber(myNum)}번</b></div>
        <div class="kv-row"><span>상태</span><b><span class="queue-status-pill"><span class="dot"></span>순번 대기 중</span></b></div>
        <div class="mt-16 text-center">
          <p style="font-size:13px;color:var(--color-text-secondary);margin-bottom:12px;">관리자 툴 또는 순차 배정 타이밍에 맞춰 링크가 활성화됩니다.</p>
        </div>
      `;
    }

    return () => {
      clearInterval(poolInterval);
    };
  },
};
