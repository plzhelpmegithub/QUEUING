// 대기열 페이지 — 서버에서 SSE로 실시간 순번을 받아 로켓 진행 바로 표시.
// 입장 승인 시 admissionToken을 store에 저장하고 구역 선택 화면으로 이동한다.

import { formatNumber } from '../utils/format.js';
import { mountRocketProgress } from '../components/rocketProgress.js';
import { navigate } from '../router.js';
import { getSelectedSession, getState, hasMembership, setAdmissionToken, setSelectedSession } from '../state/store.js';

// How often we self-trigger /queue/admit — in a real deployment an operator/cron
// would call this periodically; this frontend has no such automation yet, so it
// drives the batch itself at this cadence. Also used to estimate wait time below.
const ADMIT_POLL_MS = 1500;
const ADMIT_BATCH_SIZE = 100; // matches the backend's default BATCH_SIZE
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

        let admitPollTimer = null;
        let positionPollTimer = null;
        let redirectTimer = null;
        let settled = false; // guards against navigating twice if both polls resolve near-simultaneously
        let recovering = false; // guards against firing multiple concurrent re-entries below
        let standbyPollTick = 0;

        function clearTimers() {
          if (admitPollTimer) clearInterval(admitPollTimer);
          if (positionPollTimer) clearInterval(positionPollTimer);
          if (redirectTimer) clearTimeout(redirectTimer);
          admitPollTimer = null;
          positionPollTimer = null;
          redirectTimer = null;
        }

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

        // Real ETA estimate: since /queue/admit lets ADMIT_BATCH_SIZE people in per
        // call, and we're the ones calling it every ADMIT_POLL_MS, a user at
        // `position` needs roughly ceil(position / ADMIT_BATCH_SIZE) more rounds.
        function estimateEtaLabel(position) {
          const roundsLeft = Math.max(0, Math.ceil(position / ADMIT_BATCH_SIZE) - 1);
          const ms = roundsLeft * ADMIT_POLL_MS;
          if (ms <= 0) return '곧 입장';
          const totalSec = Math.ceil(ms / 1000);
          if (totalSec < 60) return `약 ${totalSec}초`;
          return `약 ${Math.ceil(totalSec / 60)}분`;
        }

        function renderWaitingState(pos) {
          const isStandby = pos.type === 'standby';
          const position = isStandby ? pos.standbyPosition : pos.position;
          const total = isStandby ? pos.totalStandby : pos.totalWaiting;

          myNumLabelEl.textContent = isStandby ? '취소표 대기번호' : '내 대기번호';
          myNumEl.textContent = formatNumber(position);
          myNumEl.classList.toggle('hot', position <= 1000);
          myNumEl.classList.toggle('pulse-red', position <= 200);
          totalEl.textContent = total != null ? `${formatNumber(total)}명` : '-';
          statusEl.textContent = isStandby ? '취소표 대기 중' : '대기 중';
          etaEl.textContent = isStandby ? '취소표 발생 시 안내' : estimateEtaLabel(position);

          const pct = total > 0 ? Math.min(99, Math.max(1, Math.round((1 - position / total) * 100))) : 1;
          rocket.update(isStandby ? Math.min(pct, 40) : pct); // standby progress is capped — no seats guaranteed yet
        }

        function pollPosition() {
          const query = new URLSearchParams(queueContext);
          fetch(`/queue/position/${encodeURIComponent(userId)}?${query.toString()}`)
            .then((r) => r.json())
            .then((pos) => {
              if (settled) return;
              if (pos.status === 'admitted') {
                // Position tracking says we're in — the admit-poll loop below is
                // responsible for actually grabbing the token and redirecting.
                statusEl.textContent = '입장 허용됨 · 토큰 발급 중...';
                return;
              }
              if (pos.status === 'not_found') {
                // We were registered a moment ago but the backend no longer has us
                // in any queue (server restart, Redis reset, or a stale token that
                // got us evicted) — without this, the page would sit here forever
                // saying "waiting" while /queue/admit keeps finding nothing to do
                // for us. Recover by just re-entering, exactly like a first-time visit.
                recoverByReentering();
                return;
              }
              renderWaitingState(pos);
              // standby 대기 중 조기 마감 감지 — 10초마다 enter로 마감 여부 확인
              if (pos.type === 'standby') {
                standbyPollTick++;
                if (standbyPollTick % 10 === 0) {
                  fetch('/queue/enter', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, ...queueContext }),
                  })
                    .then((r) => r.json())
                    .then((res) => { if (!settled && res.status === 'closed') showClosedUI(); })
                    .catch(() => {});
                }
              }
            })
            .catch(() => {});
        }

        function tryAdmit() {
          return fetch('/queue/admit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(queueContext),
          })
            .then((r) => r.json())
            .then((admitResult) => {
              const tokenInfo = admitResult.tokens?.[userId];
              if (tokenInfo?.token) {
                setAdmissionToken(c.eventId, tokenInfo, session);
                enterConfirmed();
              }
            })
            .catch(() => {});
        }

        function startPolling() {
          if (admitPollTimer || positionPollTimer) return;
          pollPosition();
          positionPollTimer = setInterval(pollPosition, POSITION_POLL_MS);
          // 대기열이 ADMIT_BATCH_SIZE명 넘게 밀려 있으면 한 번에 다 안 뽑히므로,
          // 우리 사용자가 뽑힐 때까지 계속 재시도 — 관리자가 주기적으로
          // /queue/admit을 호출하는 걸 대신함.
          admitPollTimer = setInterval(tryAdmit, ADMIT_POLL_MS);
        }

        function showClosedUI() {
          if (settled) return;
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
                 <button class="btn btn-outline" data-go-home>메인 페이지로 돌아가기</button>
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
          if (enterResult.token) {
            setAdmissionToken(c.eventId, enterResult, session);
            enterConfirmed();
            return;
          }
          // status === 'waiting' (eligible or standby) — real position, polled live.
          startPolling();
          tryAdmit(); // also try immediately instead of waiting a full ADMIT_POLL_MS
        }

        function enterQueue() {
          return fetch('/queue/enter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, ...queueContext }),
          })
            .then((r) => r.json())
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

        cleanupFn = clearTimers;
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
