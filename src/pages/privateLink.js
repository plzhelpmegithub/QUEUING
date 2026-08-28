// Secret Link 입장 페이지 — 멤버십 회원 전용, 5분 제한 취소표 예매 진입점.
// 실제 공연 데이터와 연동되며, 시간 만료 시 기회가 다음 순번으로 이관.

import { navigate } from '../router.js';
import { hasMembership, isLoggedIn } from '../state/store.js';
import { formatDeadline } from '../utils/format.js';

const ENTRY_MS = 4 * 60 * 1000 + 52 * 1000;

export const privateLinkPage = {
  render(container, params) {
    const eventId = params.id;

    if (!isLoggedIn() || !hasMembership()) {
      navigate(`cancel-queue/${eventId}`);
      return;
    }

    let destroyed = false;
    let countdownTimer = null;
    const deadline = Date.now() + ENTRY_MS;

    fetch('/events')
      .then((r) => r.json())
      .then((data) => {
        if (destroyed) return;
        const c = (data.events || []).find((e) => e.eventId === eventId);
        const title = c ? c.eventName : '공연';
        const venue = c ? c.venue : '';

        container.innerHTML = `
          <div class="container privatelink-page">
            <div class="privatelink-badge">🔗 SECRET LINK</div>
            <h2 class="section-title">입장할 차례입니다</h2>
            <p class="section-sub mt-8">회원님의 취소표 예매 링크가 발급되었습니다.<br/>${title} · ${venue}</p>

            <div class="cancel-timer-wrap mt-40" style="text-align:center;">
              <div class="cancel-timer-label">남은 입장 시간</div>
              <div class="cancel-timer num-mono" data-countdown>04:52</div>
              <div class="cancel-timer-bar"><div class="cancel-timer-bar__fill" data-timer-bar></div></div>
            </div>

            <div class="mt-40" style="text-align:center;">
              <button class="btn btn-primary btn-lg" data-enter>취소표 예매 입장</button>
            </div>

            <div class="privatelink-policy">
              <div class="lock-box__icon" style="text-align:left;">🔒 본인 전용 Secret Link</div>
              <ul>
                <li>1인 1링크 · 1회성</li>
                <li>5분 유효 · 시간 초과 시 자동 만료</li>
                <li>양도/공유/대리 티켓팅 불가</li>
                <li>멤버십 상태 실시간 확인</li>
              </ul>
            </div>
          </div>
        `;

        container.querySelector('[data-enter]').addEventListener('click', () => {
          clearInterval(countdownTimer);
          navigate(`cancel-seats/${eventId}`);
        });

        function tick() {
          if (destroyed) return;
          const remaining = deadline - Date.now();
          const cdEl = container.querySelector('[data-countdown]');
          const barEl = container.querySelector('[data-timer-bar]');

          if (remaining <= 0) {
            clearInterval(countdownTimer);
            const cdWrap = container.querySelector('.cancel-timer-wrap');
            if (cdWrap) cdWrap.style.display = 'none';
            const ctaWrap = container.querySelector('[data-enter]')?.parentElement;
            if (ctaWrap) {
              ctaWrap.innerHTML = `
                <div class="badge badge-dark-red" style="font-size:13px;padding:8px 16px;margin-bottom:14px;">입장 시간 만료</div>
                <div style="font-size:14px;color:var(--color-text-secondary);line-height:1.8;margin-bottom:20px;">
                  Secret Link 사용 시간이 종료되었습니다.<br/>해당 링크는 다시 사용할 수 없습니다.
                </div>
                <button class="btn btn-outline btn-lg" data-mypage>마이페이지로 이동</button>
              `;
              ctaWrap.querySelector('[data-mypage]').addEventListener('click', () => navigate('mypage'));
            }
            return;
          }

          if (cdEl) {
            const m = String(Math.floor(remaining / 60000)).padStart(2, '0');
            const s = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
            cdEl.textContent = `${m}:${s}`;
            if (remaining <= 60000) cdEl.classList.add('warn');
          }
          if (barEl) barEl.style.width = `${(remaining / ENTRY_MS) * 100}%`;
        }

        countdownTimer = setInterval(tick, 1000);
        tick();
      })
      .catch(() => {
        if (!destroyed) {
          container.innerHTML = `<div class="center-state"><div class="center-state__title">페이지를 불러오지 못했습니다.</div></div>`;
        }
      });

    return () => {
      destroyed = true;
      if (countdownTimer) clearInterval(countdownTimer);
    };
  },
};
