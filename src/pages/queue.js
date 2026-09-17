// 대기열 페이지 — 서버에서 SSE로 실시간 순번을 받아 로켓 진행 바로 표시.
// 입장 승인 시 admissionToken을 store에 저장하고 구역 선택 화면으로 이동한다.

import { formatNumber } from '../utils/format.js';
import { mountRocketProgress } from '../components/rocketProgress.js';
import { navigate } from '../router.js';
import { getSelectedSession, getState, hasMembership, setAdmissionToken, setSelectedSession } from '../state/store.js';
import { fetchWithRecaptcha } from '../utils/recaptcha.js';
import { authHeaders } from '../utils/authToken.js';
import { leaveQueueBeacon } from '../utils/backendApi.js';

const POSITION_POLL_MS = 1000;

export const queuePage = {
  render(container, params) {
    container.innerHTML = `<div class="center-state"><div class="center-state__title">대기열 진입 중...</div></div>`;

    let destroyed = false;
    let cleanupFn = null;

    fetch('/events')
      .then((res) => res.json())
      .then((data) => {
        if (destroyed) return;
        const c = (data.events || []).find((e) => e.eventId === params.id);
        if (!c) {
          container.innerHTML = `<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>`;
          return;
        }

        const userId = getState().user?.userId || getState().user?.email;
        if (!userId) {
          container.innerHTML = `<div class="center-state"><div class="center-state__title">로그인이 필요합니다</div></div>`;
          navigate('login');
          return;
        }

        let session = getSelectedSession(c.eventId);
        if (!session && Array.isArray(c.sessions) && c.sessions[0]) {
          session = { date: c.sessions[0].date || '', time: c.sessions[0].time || '' };
          setSelectedSession(c.eventId, session);
        }
        const queueContext = {
          eventId: c.eventId,
          sessionDate: session?.date || '',
          sessionTime: session?.time || '',
        };

        container.innerHTML = `
          <section class="queue-page container">
            <div class="eyebrow">BOOKING QUEUE · STEP 3</div>
            <div class="section-title" style="margin-bottom:4px;">${c.eventName} 예매 대기열</div>
            <div class="section-sub">${session ? `${session.date} ${session.time}` : ''}</div>

            <div class="queue-stats mt-40">
              <div>
                <div class="queue-stat-label">전체 대기자</div>
                <div class="queue-stat-value num-mono" data-total>--</div>
              </div>
              <div>
                <div class="queue-stat-label">예상 대기시간</div>
                <div class="queue-stat-value num-mono" data-eta>약 --분</div>
              </div>
              <div>
                <div class="queue-stat-label">현재 상태</div>
                <div class="queue-stat-value">
                  <span class="queue-status-pill"><span class="dot"></span><span data-status>대기열 확인 중</span></span>
                </div>
              </div>
            </div>

            <div class="queue-mynum-label" data-mynum-label>내 대기번호</div>
            <div class="queue-mynum num-mono" data-mynum>-</div>

            <div class="queue-progress-wrap" data-rocket></div>

            <div class="queue-notice">
              <p>페이지를 새로고침하지 마세요.</p>
              <p>대기번호는 실제 서버 순번을 주기적으로 조회해 갱신됩니다.</p>
              <p>현재 많은 사용자가 동시에 예매를 진행하고 있습니다.</p>
            </div>

            <div class="queue-enter-box" data-enter-box></div>
          </section>
        `;

        const rocket = mountRocketProgress(container.querySelector('[data-rocket]'), 0);
        const myNumEl = container.querySelector('[data-mynum]');
        const myNumLabelEl = container.querySelector('[data-mynum-label]');
        const totalEl = container.querySelector('[data-total]');
        const etaEl = container.querySelector('[data-eta]');
        const statusEl = container.querySelector('[data-status]');
        const enterBox = container.querySelector('[data-enter-box]');

        let positionPollTimer = null;
        let redirectTimer = null;
        let settled = false; // guards against navigating twice if both polls resolve near-simultaneously
        let recovering = false; // guards against firing multiple concurrent re-entries below
        let admissionRequestRunning = false; // prevents duplicate token requests while admission is being finalized
        let standbyPollTick = 0;
        let queueLeaveSent = false;
        let currentQueueType = '';

        function clearTimers() {
          if (positionPollTimer) clearInterval(positionPollTimer);
          if (redirectTimer) clearTimeout(redirectTimer);
          positionPollTimer = null;
          redirectTimer = null;
        }

        function notifyQueueLeave() {
          // A normal transition to the seat page sets settled first, so it is
          // not mistaken for abandonment. This handler is for closing,
          // refreshing, or navigating away while still waiting. standby는
          // 취소표 대기 자격을 유지해야 하므로 브라우저 이탈만으로
          // LEFT 처리하지 않는다.
          if (settled || queueLeaveSent || destroyed) return;
          // 응답을 받기 전에는 유형을 알 수 없으므로 이탈 요청을 보내지
          // 않는다. 그래야 조기마감 시뮬레이션으로 이미 standby에 등록된
          // 사용자가 페이지를 여는 순간 대기열에서 제거되지 않는다.
          if (currentQueueType !== 'eligible') return;
          queueLeaveSent = true;
          leaveQueueBeacon(userId, queueContext);
        }

        function removeLifecycleListeners() {
          window.removeEventListener('pagehide', notifyQueueLeave);
          window.removeEventListener('beforeunload', notifyQueueLeave);
        }

        window.addEventListener('pagehide', notifyQueueLeave);
        window.addEventListener('beforeunload', notifyQueueLeave);

        function enterConfirmed() {
          if (settled) return;
          settled = true;
          clearTimers();
          rocket.update(100);
          statusEl.textContent = '입장 완료';
          etaEl.textContent = '입장 완료';
          enterBox.innerHTML = `
            <div class="badge badge-green" style="font-size:13px;padding:8px 16px;margin-bottom:16px;">입장이 완료되었습니다</div>
            <div style="font-size:15px;color:var(--color-text-secondary);">이제 좌석 구역으로 이동합니다...</div>
          `;
          redirectTimer = setTimeout(() => navigate(`zones/${c.eventId}`), 1400);
        }

        function estimateEtaLabel(position) {
          if (!Number.isFinite(position) || position <= 0) return '곧 입장';
          return '서버 승인 대기 중';
        }

        function renderWaitingState(pos) {
          const isStandby = pos.type === 'standby';
          currentQueueType = isStandby ? 'standby' : 'eligible';
          const rawPosition = isStandby ? pos.standbyPosition : pos.position;
          const rawTotal = isStandby ? pos.totalStandby : pos.totalWaiting;
          const position = Number(rawPosition);
          const total = Number(rawTotal);
          const hasPosition = Number.isFinite(position) && position > 0;
          const hasTotal = Number.isFinite(total) && total >= 0;

          myNumLabelEl.textContent = isStandby ? '취소표 대기번호' : '내 대기번호';
          myNumEl.textContent = hasPosition ? formatNumber(position) : '-';
          myNumEl.classList.toggle('hot', hasPosition && position <= 1000);
          myNumEl.classList.toggle('pulse-red', hasPosition && position <= 200);
          totalEl.textContent = hasTotal ? `${formatNumber(total)}명` : '-';
          statusEl.textContent = hasPosition
            ? (isStandby ? '취소표 대기 중' : '대기 중')
            : '순번 확인 중';
          etaEl.textContent = hasPosition
            ? (isStandby ? '취소표 발생 시 안내' : estimateEtaLabel(position))
            : '잠시 후 다시 확인합니다';

          const pct = hasPosition && hasTotal && total > 0
            ? Math.min(99, Math.max(1, Math.round((1 - position / total) * 100)))
            : 1;
          rocket.update(isStandby ? Math.min(pct, 40) : pct); // standby progress is capped — no seats guaranteed yet

          // A previous transient API error should disappear after a valid
          // queue response arrives.
          if (hasPosition) enterBox.innerHTML = '';
        }

        function createHttpError(response, payload) {
          const error = new Error(payload?.message || `대기열 조회 실패 (${response.status})`);
          error.status = response.status;
          error.payload = payload;
          return error;
        }

        function showPositionError(error) {
          const code = error?.payload?.code;
          const serverMessage = error?.payload?.message;
          const message = code === 'auth_not_configured'
            ? '서버 인증 설정을 확인하는 중입니다.'
            : error?.status === 401
              ? '로그인 세션이 만료되었습니다. 다시 로그인해주세요.'
              : serverMessage || '대기열 정보를 잠시 불러오지 못했습니다. 다시 확인 중입니다.';

          statusEl.textContent = '대기열 확인 지연';
          etaEl.textContent = '잠시 후 다시 확인합니다';
          enterBox.innerHTML = '<div class="notice-box" aria-live="polite"><p data-queue-error-message></p></div>';
          enterBox.querySelector('[data-queue-error-message]').textContent = message;
        }

        function pollPosition() {
          const query = new URLSearchParams(queueContext);
          fetch(`/queue/position/${encodeURIComponent(userId)}?${query.toString()}`, { headers: { ...authHeaders() } })
            .then(async (response) => {
              const payload = await response.json().catch(() => ({}));
              if (!response.ok) throw createHttpError(response, payload);
              return payload;
            })
            .then((pos) => {
              if (settled) return;
              if (pos.status === 'admitted') {
                statusEl.textContent = '입장 허용됨 · 토큰 발급 중...';
                if (admissionRequestRunning) return;
                admissionRequestRunning = true;
                requestQueueEnter()
                  .then(handleEnterResult)
                  .catch(showPositionError)
                  .finally(() => { admissionRequestRunning = false; });
                return;
              }
              if (pos.status === 'admitting') {
                statusEl.textContent = '입장 승인 처리 중...';
                etaEl.textContent = 'Admission Token 준비 중';
                return;
              }
              if (pos.status === 'error') {
                showPositionError({ payload: pos });
                return;
              }
              if (pos.status === 'not_found') {
                // We were registered a moment ago but the backend no longer has us
                // in any queue (server restart, Redis reset, or a stale token that
                // got us evicted) — without this, the page would sit here forever
                // saying "waiting" while the server has no queue entry to process
                // for us. Recover by just re-entering, exactly like a first-time visit.
                recoverByReentering();
                return;
              }
              renderWaitingState(pos);
              // standby 대기 중 조기 마감 감지 — 10초마다 enter로 마감 여부 확인
              if (pos.type === 'standby') {
                standbyPollTick++;
                if (standbyPollTick % 10 === 0) {
                  requestQueueEnter()
                    .then((res) => { if (!settled && res.status === 'closed') showClosedUI(); })
                    .catch(() => {});
                }
              }
            })
            .catch((error) => {
              if (settled || destroyed) return;
              showPositionError(error);
            });
        }

        function startPolling() {
          if (positionPollTimer) return;
          pollPosition();
          positionPollTimer = setInterval(pollPosition, POSITION_POLL_MS);
        }

        function showClosedUI() {
          if (settled) return;
          // 조기마감 후 standby 사용자는 취소표 대기열에 남아야 한다.
          // 여기서 /queue/leave를 호출하면 waiting_queue가 LEFT로 바뀌어
          // 마이페이지에서 취소표 대기 공연이 사라진다.
          settled = true;
          clearTimers();
          statusEl.textContent = '마감';

          const isMember = hasMembership();
          const TOTAL_SEC = 30;
          let remaining = TOTAL_SEC;
          let countdownTimer = null;

          function fmt(s) {
            return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
          }

          const overlay = document.createElement('div');
          overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);z-index:9999;display:flex;align-items:center;justify-content:center;';

          function renderOverlay() {
            const timeStr = fmt(remaining);
            const memberContent = isMember
              ? `<p style="font-size:15px;font-weight:700;margin-bottom:8px;color:var(--color-text);">취소표 발생 시 시크릿 링크로 안내해드리겠습니다.</p>
                 <p style="font-size:13px;color:var(--color-text-secondary);margin-bottom:20px;">멤버십 회원이시므로 취소표 발생 시 등록하신 이메일로 시크릿 링크가 발송됩니다.</p>
                 <p style="font-size:13px;color:var(--color-text-secondary);margin-bottom:18px;">마이페이지에서 취소표 대기열과 현재 순번을 확인할 수 있습니다.</p>
                 <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
                   <button class="btn btn-primary" data-go-cancel-queue>마이페이지 취소표 대기열 확인</button>
                   <button class="btn btn-outline" data-go-home>메인 페이지로 돌아가기</button>
                 </div>
                 <div style="font-size:12px;color:var(--color-text-secondary);margin-top:16px;"><span class="num-mono">${timeStr}</span> 후 메인 페이지로 이동합니다</div>`
              : `<p style="font-size:15px;font-weight:700;margin-bottom:8px;color:var(--color-text);">멤버십을 가입하시면 취소표가 나오면 시크릿 링크로 안내해드립니다.</p>
                 <p style="font-size:13px;color:var(--color-text-secondary);margin-bottom:16px;">멤버십 가입 후 취소표 발생 시 이메일로 시크릿 링크를 받으실 수 있습니다.</p>
                 <p style="font-size:14px;font-weight:600;margin-bottom:18px;color:var(--color-text);">멤버십을 가입하시겠습니까?</p>
                 <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:16px;">
                   <button class="btn btn-primary" data-join-membership>멤버십 가입하기</button>
                   <button class="btn btn-outline" data-go-home>메인 페이지로 돌아가기</button>
                 </div>
                 <div style="font-size:12px;color:var(--color-text-secondary);"><span class="num-mono">${timeStr}</span> 후 메인 페이지로 이동합니다</div>`;

            overlay.innerHTML = `
              <div style="background:var(--color-bg);border-radius:16px;padding:40px 36px;max-width:420px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                <div style="font-size:36px;margin-bottom:16px;">🔒</div>
                <h2 style="font-size:20px;font-weight:900;margin-bottom:20px;color:var(--color-text);">마감되었습니다</h2>
                ${memberContent}
              </div>`;
            overlay.querySelector('[data-go-home]')?.addEventListener('click', () => {
              clearInterval(countdownTimer);
              if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
              navigate('');
            });
            overlay.querySelector('[data-go-cancel-queue]')?.addEventListener('click', () => {
              clearInterval(countdownTimer);
              if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
              navigate('mypage/cancel-queue');
            });
            overlay.querySelector('[data-join-membership]')?.addEventListener('click', () => {
              clearInterval(countdownTimer);
              if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
              navigate('membership');
            });
          }

          renderOverlay();
          document.body.appendChild(overlay);

          countdownTimer = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
              clearInterval(countdownTimer);
              if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
              navigate('');
              return;
            }
            renderOverlay();
          }, 1000);
        }

        function handleEnterResult(enterResult) {
          if (settled) return;
          if (enterResult.status === 'closed') {
            showClosedUI();
            return;
          }
          if (enterResult.status === 'error') {
            statusEl.textContent = '오류';
            enterBox.innerHTML = `<div class="notice-box"><p>${enterResult.message || '대기열 진입 중 오류가 발생했습니다.'}</p></div>`;
            return;
          }
          if (enterResult.status === 'admitting') {
            statusEl.textContent = '입장 승인 처리 중...';
            etaEl.textContent = 'Admission Token 준비 중';
            startPolling();
            return;
          }
          if (enterResult.token) {
            setAdmissionToken(c.eventId, enterResult, session);
            enterConfirmed();
            return;
          }
          // status === 'waiting' (eligible or standby) — real position, polled live.
          startPolling();
        }

        function requestQueueEnter() {
          return fetchWithRecaptcha('/queue/enter', { userId, ...queueContext }, 'queue_enter')
            .then(({ status, data }) => {
              if (status < 200 || status >= 300) {
                throw createHttpError({ status }, data);
              }
              return data;
            });
        }

        function enterQueue() {
          return requestQueueEnter()
            .then(handleEnterResult)
            .catch(() => {
              statusEl.textContent = '오류';
              enterBox.innerHTML = `<div class="notice-box"><p>대기열 진입에 실패했습니다. 새로고침 후 다시 시도해주세요.</p></div>`;
            });
        }

        function recoverByReentering() {
          if (recovering || settled) return;
          recovering = true;
          clearTimers();
          statusEl.textContent = '대기열 재진입 중...';
          enterQueue().finally(() => {
            recovering = false;
          });
        }

        enterQueue();

        cleanupFn = () => {
          clearTimers();
          removeLifecycleListeners();
        };
      })
      .catch(() => {
        if (!destroyed) {
          container.innerHTML = `<div class="center-state"><div class="center-state__title">대기열 진입에 실패했습니다.</div></div>`;
        }
      });

    return () => {
      destroyed = true;
      if (cleanupFn) cleanupFn();
    };
  },
};
