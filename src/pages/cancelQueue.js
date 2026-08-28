// 취소표 대기열 페이지 — 매진 후 멤버십 기반 Secret Link 발급 시스템.
// 4가지 UI 상태: (1) 일반회원 대기, (2) 멤버십 전환 완료, (3) Secret Link 발급, (4) 링크 만료

import { formatNumber, formatPrice, formatDeadline } from '../utils/format.js';
import { navigate } from '../router.js';
import {
  joinCancelQueue,
  ensureCancelPool,
  bumpCancelPool,
  consumeCancelPool,
  hasMembership,
  isLoggedIn,
  setReturnTo,
  getState,
  subscribeMembership,
} from '../state/store.js';

const SECRET_LINK_TTL_MS = 5 * 60 * 1000;

export const cancelQueuePage = {
  render(container, params) {
    const eventId = params.id;

    if (!isLoggedIn()) {
      setReturnTo(`cancel-queue/${eventId}`);
      navigate('login');
      return;
    }

    container.innerHTML = `<div class="center-state"><div class="center-state__title">취소표 대기열 불러오는 중...</div></div>`;

    let destroyed = false;
    let pollTimer = null;
    let countdownTimer = null;

    fetch('/events')
      .then((r) => r.json())
      .then((data) => {
        if (destroyed) return;
        const c = (data.events || []).find((e) => e.eventId === eventId);
        if (!c) {
          container.innerHTML = `<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>`;
          return;
        }

        const q = joinCancelQueue(eventId);
        const pool = ensureCancelPool(eventId);
        const user = getState().user;
        const isMember = hasMembership();

        container.innerHTML = `
          <section class="cancel-hero">
            <div class="container">
              <div class="eyebrow" style="color:var(--color-primary);font-family:var(--font-mono);font-size:11px;letter-spacing:3px;">CANCELLATION QUEUE</div>
              <h2 class="section-title">${c.eventName}</h2>
              <p class="section-sub">${c.eventDate || ''} · ${c.venue || ''} · 매진된 좌석의 취소표를 대기열 순서대로 배부합니다</p>
            </div>
          </section>

          <div class="container cancel-body">
            <div>
              <!-- 단계 표시 -->
              <div class="cancel-steps" data-steps>
                <div class="cancel-step active"><span class="cancel-step__num">01</span>대기열 등록</div>
                <div class="cancel-step"><span class="cancel-step__num">02</span>Secret Link 발급</div>
                <div class="cancel-step"><span class="cancel-step__num">03</span>좌석 선택 · 결제</div>
              </div>

              <!-- 대기 현황 카드 -->
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

              <!-- 멤버십/Secret Link 상태 카드 -->
              <div class="card mt-24" style="padding:28px;" data-membership-card></div>
            </div>

            <div>
              <!-- 취소표 Pool -->
              <div class="card" style="padding:28px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <h3 style="font-size:15px;font-weight:800;">취소표 Pool</h3>
                  <span class="queue-status-pill"><span class="dot"></span>취소표 수집 중</span>
                </div>
                <p class="section-sub" style="margin-top:6px;">취소된 티켓은 즉시 배부되지 않고 Pool에 모여 순서대로 배부됩니다.</p>
                <div class="pool-grid" data-pool>
                  ${(c.sections || [{ name: 'A' }]).map((s) => `
                    <div class="pool-grade-card">
                      <div class="pool-grade-card__grade">${s.name || s.label}</div>
                      <div class="pool-grade-card__count num-mono" data-pool-${s.name || s.label}>${pool[s.name || s.label] || 0}매</div>
                    </div>
                  `).join('')}
                </div>
                <div class="pool-total">현재 수집된 취소표 총 <b class="num-mono" data-pool-total>${Object.values(pool).reduce((a, b) => a + b, 0)}</b>매</div>
              </div>

              <!-- 정책 안내 -->
              <div class="card mt-24" style="padding:28px;">
                <h3 style="font-size:15px;font-weight:800;margin-bottom:14px;">취소표 배부 정책</h3>
                <div class="notice-box">
                  <p>· 이 링크는 대기열에서 발급된 <strong>1인 전용 링크</strong>이며, 타인과 공유할 수 없습니다.</p>
                  <p>· Secret Link 발급 후 <strong>5분</strong> 안에 좌석·결제를 모두 완료해야 합니다.</p>
                  <p>· 5분을 초과하면 링크가 즉시 만료되며, 대기열의 다음 순번에게 넘어갑니다.</p>
                  <p>· Secret Link는 <strong>멤버십 회원</strong>에게만 제공됩니다.</p>
                  <p>· <strong>1인 1매</strong> — 취소표는 1인 1매만 구매할 수 있습니다.</p>
                </div>
              </div>

              <!-- 순차 배부 흐름 -->
              <div class="card mt-24" style="padding:28px;">
                <h3 style="font-size:15px;font-weight:800;margin-bottom:14px;">취소표 순차 배부 방식</h3>
                <div class="flow-diagram">
                  <span class="flow-step active">1번 Secret Link 발급</span>
                  <span class="flow-arrow">→</span>
                  <span class="flow-step">취켓팅 진행</span>
                  <span class="flow-arrow">→</span>
                  <span class="flow-step">종료</span>
                  <span class="flow-arrow">→</span>
                  <span class="flow-step">2번 Secret Link 발급</span>
                  <span class="flow-arrow">→</span>
                  <span class="flow-step">... 반복</span>
                </div>
              </div>
            </div>
          </div>
        `;

        // ---- 멤버십/Secret Link 상태 렌더링 ----
        const memberCard = container.querySelector('[data-membership-card]');
        let currentState = isMember ? 'member-waiting' : 'non-member';
        let secretLinkDeadline = null;

        function renderState(state) {
          currentState = state;
          const steps = container.querySelectorAll('.cancel-step');

          if (state === 'non-member') {
            steps[0]?.classList.add('active');
            steps[1]?.classList.remove('active', 'done');
            steps[2]?.classList.remove('active', 'done');
            memberCard.innerHTML = `
              <div class="lock-box">
                <div class="lock-box__icon">🔒</div>
                <div class="lock-box__title">멤버십 가입 필요</div>
                <div class="lock-box__desc">
                  현재 <strong>${formatNumber(q.myNumber)}번째</strong> 대기 중입니다.<br/>
                  취소표 발생 시 <strong>Secret Link(5분 예매권)</strong>는 멤버십 회원에게만 제공됩니다.<br/>
                  지금 멤버십에 가입하시면, 순번 도래 시 즉시 Secret Link가 발급됩니다.
                </div>
                <button class="btn btn-primary" data-join-membership>멤버십 가입하기</button>
              </div>
            `;
            memberCard.querySelector('[data-join-membership]').addEventListener('click', () => navigate('membership'));
          }

          if (state === 'member-waiting') {
            steps[0]?.classList.add('active', 'done');
            steps[1]?.classList.add('active');
            steps[2]?.classList.remove('active', 'done');
            memberCard.innerHTML = `
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="font-size:15px;font-weight:800;">Secret Link 대기 현황</h3>
                <span class="badge badge-green" style="font-size:11px;">MEMBERSHIP ✓</span>
              </div>
              <div class="notice-box" style="background:rgba(34,197,94,0.08);border-color:rgba(34,197,94,0.2);margin-bottom:16px;">
                <p style="color:var(--color-text);">멤버십 상태가 확인되었습니다! 순번 도래 시 Secret Link가 발급됩니다.</p>
              </div>
              <div class="kv-row"><span>내 대기번호</span><b class="num-mono" data-m-num>${formatNumber(q.myNumber)}번</b></div>
              <div class="kv-row"><span>상태</span><b><span class="queue-status-pill"><span class="dot"></span>대기 중 — Secret Link 발급 대기</span></b></div>
              <div class="kv-row"><span>알림</span><b class="text-red">ON</b></div>
              <div style="margin-top:16px;" data-m-progress></div>
            `;
            startMemberSimulation();
          }

          if (state === 'secret-link-active') {
            steps[0]?.classList.add('done');
            steps[1]?.classList.add('active', 'done');
            steps[2]?.classList.add('active');
            const statusEl = container.querySelector('[data-status]');
            if (statusEl) statusEl.textContent = 'Secret Link 발급됨';
            memberCard.innerHTML = `
              <div style="text-align:center;padding:16px 0 4px;">
                <div class="badge badge-green" style="font-size:14px;padding:10px 20px;margin-bottom:16px;">🎉 취소표가 배정되었습니다!</div>
                <div class="cancel-timer-wrap">
                  <div class="cancel-timer-label">남은 예매 시간</div>
                  <div class="cancel-timer num-mono" data-countdown>05:00</div>
                  <div class="cancel-timer-bar"><div class="cancel-timer-bar__fill" data-timer-bar></div></div>
                </div>
                <div style="font-size:13px;color:var(--color-text-secondary);margin:16px 0;line-height:1.8;">
                  Secret Link가 발급되었습니다. 5분 안에 좌석을 선택하고 결제를 완료해주세요.<br/>
                  시간 초과 시 기회가 다음 순번으로 넘어갑니다.
                </div>
                <button class="btn btn-primary btn-lg btn-block" data-enter-link>Secret Link 입장하기</button>
              </div>
            `;
            memberCard.querySelector('[data-enter-link]').addEventListener('click', () => {
              navigate(`private-link/${eventId}`);
            });
            startCountdown();
          }

          if (state === 'link-expired') {
            steps.forEach((s) => s.classList.remove('active'));
            const statusEl = container.querySelector('[data-status]');
            if (statusEl) statusEl.textContent = '만료됨';
            memberCard.innerHTML = `
              <div style="text-align:center;padding:16px 0 4px;">
                <div class="badge badge-dark-red" style="font-size:14px;padding:10px 20px;margin-bottom:16px;">⏱ 시간 초과</div>
                <div style="font-size:15px;font-weight:700;margin-bottom:12px;">5분 제한시간이 초과되었습니다</div>
                <div style="font-size:13px;color:var(--color-text-secondary);line-height:1.8;margin-bottom:20px;">
                  기회가 다음 순번의 멤버십 회원에게 이관되었습니다.<br/>
                  이 링크는 더 이상 사용할 수 없습니다.
                </div>
                <button class="btn btn-outline" data-go-home>홈으로 돌아가기</button>
              </div>
            `;
            memberCard.querySelector('[data-go-home]').addEventListener('click', () => navigate(''));
          }
        }

        // ---- 멤버십 회원 시뮬레이션: 대기번호 감소 → Secret Link 발급 ----
        const MEMBER_TURN_DURATION_MS = 14000;
        let memberTimer = null;

        function startMemberSimulation() {
          const startNum = q.myNumber;
          const startTime = Date.now();
          let done = false;

          function tick() {
            if (done || destroyed) return;
            const elapsed = Date.now() - startTime;
            const t = Math.min(1, elapsed / MEMBER_TURN_DURATION_MS);
            const eased = 1 - Math.pow(1 - t, 4);
            const current = Math.max(1, Math.round(startNum - (startNum - 1) * eased));

            const numEl = memberCard.querySelector('[data-m-num]');
            if (numEl) numEl.textContent = `${formatNumber(current)}번`;

            if (current <= 1) {
              done = true;
              clearInterval(memberTimer);
              secretLinkDeadline = Date.now() + SECRET_LINK_TTL_MS;
              renderState('secret-link-active');
            }
          }
          memberTimer = setInterval(tick, 200);
          tick();
        }

        // ---- 5분 카운트다운 ----
        function startCountdown() {
          if (!secretLinkDeadline) secretLinkDeadline = Date.now() + SECRET_LINK_TTL_MS;
          const total = SECRET_LINK_TTL_MS;

          function tick() {
            if (destroyed) return;
            const remaining = secretLinkDeadline - Date.now();
            const cdEl = memberCard.querySelector('[data-countdown]');
            const barEl = memberCard.querySelector('[data-timer-bar]');

            if (remaining <= 0) {
              clearInterval(countdownTimer);
              renderState('link-expired');
              return;
            }

            if (cdEl) {
              const m = String(Math.floor(remaining / 60000)).padStart(2, '0');
              const s = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
              cdEl.textContent = `${m}:${s}`;
              if (remaining <= 60000) cdEl.classList.add('warn');
            }
            if (barEl) {
              barEl.style.width = `${(remaining / total) * 100}%`;
            }
          }
          countdownTimer = setInterval(tick, 1000);
          tick();
        }

        renderState(currentState);

        // ---- Pool 시뮬레이션 ----
        pollTimer = setInterval(() => {
          if (destroyed) return;
          const grades = Object.keys(pool);
          const roll = Math.random();
          if (roll < 0.55) {
            const g = grades[Math.floor(Math.random() * grades.length)];
            bumpCancelPool(eventId, g);
          } else if (roll < 0.8) {
            const available = grades.filter((g) => pool[g] > 0);
            if (available.length) consumeCancelPool(eventId, available[Math.floor(Math.random() * available.length)]);
          }
          const p2 = ensureCancelPool(eventId);
          grades.forEach((g) => {
            const el = container.querySelector(`[data-pool-${g}]`);
            if (el) el.textContent = `${p2[g] || 0}매`;
          });
          const totalEl = container.querySelector('[data-pool-total]');
          if (totalEl) totalEl.textContent = Object.values(p2).reduce((a, b) => a + b, 0);
        }, 2600);
      })
      .catch(() => {
        if (!destroyed) {
          container.innerHTML = `<div class="center-state"><div class="center-state__title">취소표 대기열을 불러오지 못했습니다.</div></div>`;
        }
      });

    return () => {
      destroyed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (countdownTimer) clearInterval(countdownTimer);
    };
  },
};
