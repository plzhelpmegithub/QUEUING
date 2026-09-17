// Secret Link 입장 페이지 — 서버에서 발급한 취소표 할당과 만료시각을 사용한다.

import { navigate } from '../router.js';
import { getState, setReturnTo } from '../state/store.js';
import { expireCancelAllocation, fetchCancelQueueStatus } from '../utils/backendApi.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const privateLinkPage = {
  render(container, params, query) {
    const eventId = params.id;
    const userId = getState().user?.userId || getState().user?.email || query?.userId || '';
    if (!userId) {
      setReturnTo(`private-link/${eventId}`);
      navigate('login');
      return;
    }

    let destroyed = false;
    let countdownTimer = null;
    let allocation = null;
    let totalDurationMs = 5 * 60 * 1000;

    function renderExpired(message = 'Secret Link 사용 시간이 종료되었습니다.') {
      container.innerHTML = `
        <div class="container privatelink-page">
          <div class="privatelink-badge">🔗 SECRET LINK</div>
          <h2 class="section-title">입장 시간이 만료되었습니다</h2>
          <p class="section-sub mt-8">${escapeHtml(message)}<br/>기회가 다음 대기자에게 이관됩니다.</p>
          <div class="mt-40" style="text-align:center;">
            <button class="btn btn-primary btn-lg" data-go-home>홈으로 돌아가기</button>
          </div>
        </div>`;
      container.querySelector('[data-go-home]')?.addEventListener('click', () => navigate(''));
    }

    function renderActive(event) {
      const deadline = new Date(allocation.expiresAt).getTime();
      container.innerHTML = `
        <div class="container privatelink-page">
          <div class="privatelink-badge">🔗 SECRET LINK</div>
          <h2 class="section-title">입장할 차례입니다</h2>
          <p class="section-sub mt-8">회원님의 취소표 예매 링크가 발급되었습니다.<br/>${escapeHtml(event?.eventName || '공연')} · ${escapeHtml(event?.venue || '')}</p>
          <div class="cancel-timer-wrap mt-40" style="text-align:center;">
            <div class="cancel-timer-label">남은 예매 시간</div>
            <div class="cancel-timer num-mono" data-countdown>--:--</div>
            <div class="cancel-timer-bar"><div class="cancel-timer-bar__fill" data-timer-bar></div></div>
          </div>
          <div class="mt-40" style="text-align:center;">
            <button class="btn btn-primary btn-lg" data-enter>취소표 예매 입장</button>
          </div>
          <div class="privatelink-policy">
            <div class="lock-box__icon" style="text-align:left;">🔒 본인 전용 Secret Link</div>
            <ul>
              <li>서버에서 발급된 1회성 링크</li>
              <li>할당된 좌석: ${allocation.seatId ? escapeHtml(allocation.seatId) : '취소 좌석 중 선택 가능'}</li>
              <li>시간 초과 시 자동 만료 및 다음 대기자 재배정</li>
              <li>취소표는 1인 1매만 구매 가능</li>
            </ul>
          </div>
        </div>`;

      const tick = () => {
        const remaining = Math.max(0, deadline - Date.now());
        const cdEl = container.querySelector('[data-countdown]');
        const barEl = container.querySelector('[data-timer-bar]');
        if (cdEl) {
          const m = String(Math.floor(remaining / 60000)).padStart(2, '0');
          const s = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
          cdEl.textContent = `${m}:${s}`;
          cdEl.classList.toggle('warn', remaining <= 60000);
        }
        if (barEl) barEl.style.width = `${Math.min(100, (remaining / totalDurationMs) * 100)}%`;
        if (remaining <= 0) {
          clearInterval(countdownTimer);
          countdownTimer = null;
          expireCancelAllocation(userId, eventId, allocation.seatId, {
            sessionDate: allocation.sessionDate || '',
            sessionTime: allocation.sessionTime || '',
          }).catch(() => {});
          renderExpired();
        }
      };
      countdownTimer = setInterval(tick, 1000);
      tick();
      container.querySelector('[data-enter]')?.addEventListener('click', () => {
        clearInterval(countdownTimer);
        countdownTimer = null;
        navigate(`cancel-seats/${eventId}`);
      });
    }

    async function load() {
      try {
        const [eventsResponse, status] = await Promise.all([
          fetch('/events'),
          fetchCancelQueueStatus(eventId, userId, { eventId }),
        ]);
        const eventsData = await eventsResponse.json();
        const event = (eventsData.events || []).find((item) => item.eventId === eventId);
        allocation = status.secretLink?.active ? status.secretLink : null;
        if (destroyed) return;
        if (allocation && allocation.remainingSeconds) {
          totalDurationMs = allocation.remainingSeconds * 1000;
        }
        if (!allocation) {
          renderExpired('현재 사용 가능한 Secret Link가 없습니다.');
          return;
        }
        renderActive(event);
      } catch (_) {
        if (!destroyed) renderExpired('Secret Link 상태를 확인하지 못했습니다.');
      }
    }

    load();
    return () => {
      destroyed = true;
      if (countdownTimer) clearInterval(countdownTimer);
    };
  },
};
