// 취소표 대기열 페이지 — 실제 API의 대기순번·멤버십·Secret Link 상태를 표시한다.

import { formatNumber } from '../utils/format.js';
import { navigate } from '../router.js';
import {
  getSelectedSession,
  getState,
  setCancelQueueEntry,
  setSelectedSession,
  setReturnTo,
} from '../state/store.js';
import {
  expireCancelAllocation,
  fetchCancelPool,
  fetchCancelQueueStatus,
  joinCancelQueueApi,
} from '../utils/backendApi.js';

const STATUS_POLL_MS = 2000;
const POOL_POLL_MS = 3000;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sessionForEvent(event, requested = {}) {
  if (requested.date || requested.time) {
    const requestedSession = {
      date: requested.date || '',
      time: requested.time || '',
    };
    setSelectedSession(event.eventId, requestedSession);
    return requestedSession;
  }

  let session = getSelectedSession(event.eventId);
  if (!session && Array.isArray(event.sessions) && event.sessions[0]) {
    session = {
      date: event.sessions[0].date || '',
      time: event.sessions[0].time || '',
    };
    setSelectedSession(event.eventId, session);
  }
  return session || { date: '', time: '' };
}

function contextFor(eventId, session) {
  return {
    eventId,
    sessionDate: session?.date || '',
    sessionTime: session?.time || '',
  };
}

function queueNumbers(queue) {
  const standby = queue?.type === 'standby' || queue?.status === 'standby';
  return {
    standby,
    position: standby ? queue.standbyPosition : queue.position,
    total: standby ? queue.totalStandby : queue.totalWaiting,
  };
}

export const cancelQueuePage = {
  render(container, params) {
    const eventId = params.id;
    const userId = getState().user?.userId || getState().user?.email;

    if (!userId) {
      setReturnTo(`mypage/cancel-queue?eventId=${encodeURIComponent(eventId)}`);
      navigate('login');
      return;
    }

    container.innerHTML = '<div class="center-state"><div class="center-state__title">취소표 대기열을 불러오는 중...</div></div>';

    let destroyed = false;
    let statusTimer = null;
    let poolTimer = null;
    let allocationTimer = null;
    let currentStateKey = '';
    let currentSession = { date: '', time: '' };

    function cleanupTimers() {
      if (statusTimer) clearInterval(statusTimer);
      if (poolTimer) clearInterval(poolTimer);
      if (allocationTimer) clearInterval(allocationTimer);
      statusTimer = null;
      poolTimer = null;
      allocationTimer = null;
    }

    function renderError(message) {
      container.innerHTML = `
        <div class="center-state">
          <div class="center-state__icon">⚠️</div>
          <div class="center-state__title">취소표 대기열을 사용할 수 없습니다</div>
          <div class="center-state__desc">${escapeHtml(message)}</div>
          <button class="btn btn-primary" data-go-home>홈으로 돌아가기</button>
        </div>`;
      container.querySelector('[data-go-home]')?.addEventListener('click', () => navigate(''));
    }

    function renderPool(pool) {
      const poolEl = container.querySelector('[data-pool]');
      if (!poolEl) return;
      const sections = Object.entries(pool?.sections || {});
      poolEl.innerHTML = sections.length
        ? sections.map(([name, value]) => `
          <div class="pool-grade-card">
            <div class="pool-grade-card__grade">${escapeHtml(name)}석</div>
            <div class="pool-grade-card__count num-mono">${formatNumber(value.available || 0)}매</div>
          </div>`).join('')
        : '<div class="section-sub">현재 확인된 취소표가 없습니다.</div>';
      const totalEl = container.querySelector('[data-pool-total]');
      if (totalEl) totalEl.textContent = formatNumber(pool?.available || 0);
    }

    function renderAllocationCountdown(allocation) {
      if (allocationTimer) clearInterval(allocationTimer);
      const deadline = new Date(allocation.expiresAt).getTime();
      const tick = () => {
        const el = container.querySelector('[data-countdown]');
        const bar = container.querySelector('[data-timer-bar]');
        const remaining = Math.max(0, deadline - Date.now());
        if (el) {
          const m = String(Math.floor(remaining / 60000)).padStart(2, '0');
          const s = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
          el.textContent = `${m}:${s}`;
          el.classList.toggle('warn', remaining <= 60000);
        }
        if (bar) bar.style.width = `${Math.min(100, (remaining / (5 * 60 * 1000)) * 100)}%`;
        if (remaining <= 0) {
          if (allocationTimer) clearInterval(allocationTimer);
          allocationTimer = null;
          expireCancelAllocation(userId, eventId, allocation.seatId, currentSession).catch(() => {});
        }
      };
      allocationTimer = setInterval(tick, 1000);
      tick();
    }

    function renderMembershipCard(snapshot) {
      const memberCard = container.querySelector('[data-membership-card]');
      if (!memberCard) return;

      const queue = snapshot.queue || {};
      const membership = snapshot.membership || {};
      const allocation = snapshot.secretLink?.active ? snapshot.secretLink : null;
      const numbers = queueNumbers(queue);
      const nextKey = allocation
        ? `allocation:${allocation.allocationId}:${allocation.expiresAt}`
        : `waiting:${membership.isMembership}:${queue.status}:${numbers.position}`;

      if (nextKey === currentStateKey) return;
      currentStateKey = nextKey;
      if (allocationTimer) clearInterval(allocationTimer);
      allocationTimer = null;

      const steps = container.querySelectorAll('.cancel-step');
      steps.forEach((step) => step.classList.remove('active', 'done'));

      if (allocation) {
        steps[0]?.classList.add('done');
        steps[1]?.classList.add('done');
        steps[2]?.classList.add('active');
        memberCard.innerHTML = `
          <div style="text-align:center;padding:16px 0 4px;">
            <div class="badge badge-green" style="font-size:14px;padding:10px 20px;margin-bottom:16px;">🎉 취소표가 배정되었습니다!</div>
            <div class="cancel-timer-wrap">
              <div class="cancel-timer-label">남은 예매 시간</div>
              <div class="cancel-timer num-mono" data-countdown>05:00</div>
              <div class="cancel-timer-bar"><div class="cancel-timer-bar__fill" data-timer-bar></div></div>
            </div>
            <div style="font-size:13px;color:var(--color-text-secondary);margin:16px 0;line-height:1.8;">
              ${escapeHtml(allocation.sessionDate || currentSession.date)} ${escapeHtml(allocation.sessionTime || currentSession.time)}<br/>
              배정 좌석 <strong>${escapeHtml(allocation.seatId)}</strong>를 5분 안에 결제해주세요.
            </div>
            <button class="btn btn-primary btn-lg btn-block" data-enter-link>Secret Link 입장하기</button>
          </div>`;
        memberCard.querySelector('[data-enter-link]')?.addEventListener('click', () => navigate(`private-link/${eventId}`));
        renderAllocationCountdown(allocation);
        return;
      }

      if (membership.isMembership) {
        steps[0]?.classList.add('done');
        steps[1]?.classList.add('active');
        memberCard.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3 style="font-size:15px;font-weight:800;">Secret Link 대기 현황</h3>
            <span class="badge badge-green" style="font-size:11px;">MEMBERSHIP ✓</span>
          </div>
          <div class="notice-box" style="background:rgba(34,197,94,0.08);border-color:rgba(34,197,94,0.2);margin-bottom:16px;">
            <p style="color:var(--color-text);">멤버십 상태가 확인되었습니다. 순번 도래 시 서버에서 Secret Link가 발급됩니다.</p>
          </div>
          <div class="kv-row"><span>내 대기번호</span><b class="num-mono" data-m-num>-</b></div>
          <div class="kv-row"><span>상태</span><b><span class="queue-status-pill"><span class="dot"></span>대기 중</span></b></div>
          <div class="kv-row"><span>알림</span><b class="text-red">ON</b></div>`;
      } else {
        steps[0]?.classList.add('active');
        memberCard.innerHTML = `
          <div class="lock-box">
            <div class="lock-box__icon">🔒</div>
            <div class="lock-box__title">멤버십 가입 필요</div>
            <div class="lock-box__desc">
              현재 <strong data-nonmember-position>-</strong>번째 대기 중입니다.<br/>
              Secret Link는 멤버십 회원에게만 발급됩니다.
            </div>
            <button class="btn btn-primary" data-join-membership>멤버십 가입하기</button>
          </div>`;
        memberCard.querySelector('[data-join-membership]')?.addEventListener('click', () => navigate('membership'));
      }
    }

    function updateQueueMetrics(snapshot) {
      const queue = snapshot.queue || {};
      const numbers = queueNumbers(queue);
      const position = Number(numbers.position || 0);
      const total = Number(numbers.total || 0);
      const myNum = container.querySelector('[data-mynum]');
      const myNumLabel = container.querySelector('[data-mynum-label]');
      const totalEl = container.querySelector('[data-total]');
      const statusEl = container.querySelector('[data-status]');
      if (myNum) myNum.textContent = position ? `${formatNumber(position)}번` : '-';
      if (myNumLabel) myNumLabel.textContent = numbers.standby ? '취소표 대기번호' : '내 대기번호';
      if (totalEl) totalEl.textContent = total ? `${formatNumber(total)}명` : '-';
      if (statusEl) statusEl.textContent = snapshot.secretLink?.active ? 'Secret Link 발급됨' : numbers.standby ? '취소표 대기 중' : queue.status || '대기 중';
      const memberNum = container.querySelector('[data-m-num]');
      if (memberNum) memberNum.textContent = position ? `${formatNumber(position)}번` : '-';
      const nonMemberNum = container.querySelector('[data-nonmember-position]');
      if (nonMemberNum) nonMemberNum.textContent = position ? `${formatNumber(position)}` : '-';

      setCancelQueueEntry(eventId, {
        myNumber: position,
        total,
        joinedAt: getState().cancelQueues[eventId]?.joinedAt || Date.now(),
        status: snapshot.secretLink?.active ? 'allocated' : queue.status,
        allocation: snapshot.secretLink || null,
      });
    }

    function renderShell(event, pool) {
      const sessionLabel = currentSession.date || event.eventDate || '';
      container.innerHTML = `
        <section class="cancel-hero">
          <div class="container">
            <div class="eyebrow" style="color:var(--color-primary);font-family:var(--font-mono);font-size:11px;letter-spacing:3px;">CANCELLATION QUEUE</div>
            <h2 class="section-title">${escapeHtml(event.eventName)}</h2>
            <p class="section-sub">${escapeHtml(sessionLabel)} · ${escapeHtml(event.venue || '')} · 취소된 좌석을 서버 대기열 순서대로 배부합니다</p>
          </div>
        </section>
        <div class="container cancel-body">
          <div>
            <div class="cancel-steps" data-steps>
              <div class="cancel-step active"><span class="cancel-step__num">01</span>대기열 등록</div>
              <div class="cancel-step"><span class="cancel-step__num">02</span>Secret Link 발급</div>
              <div class="cancel-step"><span class="cancel-step__num">03</span>좌석 선택 · 결제</div>
            </div>
            <div class="card" style="padding:28px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <h3 style="font-size:15px;font-weight:800;">내 취소표 대기 현황</h3>
                <span class="queue-status-pill"><span class="dot"></span><span data-status>대기열 확인 중</span></span>
              </div>
              <div class="queue-mynum-label" style="margin-top:22px;" data-mynum-label>취소표 대기번호</div>
              <div class="queue-mynum num-mono" style="font-size:64px;" data-mynum>-</div>
              <div class="divider"></div>
              <div class="kv-row"><span>전체 멤버십 대기자</span><b class="num-mono" data-total>-</b></div>
              <div class="kv-row"><span>안내</span><b>취소표 발생 시 5분 제한 Secret Link 발급</b></div>
            </div>
            <div class="card mt-24" style="padding:28px;" data-membership-card></div>
          </div>
          <div>
            <div class="card" style="padding:28px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <h3 style="font-size:15px;font-weight:800;">현재 취소표 현황</h3>
                <span class="queue-status-pill"><span class="dot"></span>실시간 조회</span>
              </div>
              <p class="section-sub" style="margin-top:6px;">서버 좌석 상태에서 현재 예매 가능한 취소표를 집계합니다.</p>
              <div class="pool-grid" data-pool></div>
              <div class="pool-total">현재 확인된 취소표 총 <b class="num-mono" data-pool-total>${formatNumber(pool?.available || 0)}</b>매</div>
            </div>
            <div class="card mt-24" style="padding:28px;">
              <h3 style="font-size:15px;font-weight:800;margin-bottom:14px;">취소표 배부 정책</h3>
              <div class="notice-box">
                <p>· Secret Link는 서버 대기열에서 멤버십 회원에게만 발급됩니다.</p>
                <p>· 링크 발급 후 <strong>5분</strong> 안에 배정 좌석을 선점하고 결제를 완료해야 합니다.</p>
                <p>· 제한시간이 지나면 할당이 만료되고 같은 좌석이 다음 대기자에게 넘어갑니다.</p>
                <p>· 취소표는 <strong>1인 1매</strong>만 구매할 수 있습니다.</p>
              </div>
            </div>
          </div>
        </div>`;
      renderPool(pool);
    }

    async function load() {
      try {
        const eventsResponse = await fetch('/events');
        const eventsData = await eventsResponse.json();
        const event = (eventsData.events || []).find((item) => item.eventId === eventId);
        if (!event) {
          renderError('공연 정보를 찾을 수 없습니다.');
          return;
        }

        currentSession = sessionForEvent(event, {
          date: params.sessionDate || '',
          time: params.sessionTime || '',
        });
        const context = contextFor(eventId, currentSession);
        const [entered, pool] = await Promise.all([
          joinCancelQueueApi(userId, context),
          fetchCancelPool(eventId, context).catch(() => ({ available: 0, sections: {} })),
        ]);
        if (!entered.ok || ['closed', 'error'].includes(entered.data?.status)) {
          renderError(entered.data?.message || '현재 취소표 대기열에 진입할 수 없습니다.');
          return;
        }

        if (destroyed) return;
        renderShell(event, pool);

        const pollStatus = async () => {
          if (destroyed) return;
          const snapshot = await fetchCancelQueueStatus(eventId, userId, context).catch(() => null);
          if (!snapshot || destroyed) return;
          updateQueueMetrics(snapshot);
          renderMembershipCard(snapshot);
        };
        const pollPool = async () => {
          if (destroyed) return;
          const latestPool = await fetchCancelPool(eventId, context).catch(() => null);
          if (latestPool) renderPool(latestPool);
        };

        await pollStatus();
        await pollPool();
        statusTimer = setInterval(pollStatus, STATUS_POLL_MS);
        poolTimer = setInterval(pollPool, POOL_POLL_MS);
      } catch (err) {
        if (!destroyed) renderError('네트워크 오류로 취소표 대기열을 불러오지 못했습니다.');
      }
    }

    load();
    return () => {
      destroyed = true;
      cleanupTimers();
    };
  },
};
