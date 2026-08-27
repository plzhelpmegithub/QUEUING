// 구역 선택 페이지 — 공연장 전체 좌석 배치도(seatMap)를 표시하고,
// 구역별 잔여석이 실시간으로 줄어드는 것을 보여준다. 구역 선택 후 좌석 선택으로 이동.

import { formatPrice, formatNumber } from '../utils/format.js';
import { mountSeatMap } from '../components/seatMap.js';
import {
  getSelectedSession,
  setSelectedSession,
  setCurrentOrder,
  getState,
  getAdmissionToken,
  setAdmissionToken,
  clearAdmissionToken,
  startSeatSelectTimer,
} from '../state/store.js';
import { navigate } from '../router.js';
import { showSoldOutModal } from '../components/soldOutModal.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { connectSeats } from '../services/realtimeIntegration.js';
import { generateEventSessions } from '../data/concerts.js';

const GRADE_COLOR = { VIP: '#B5121B', R: '#C98500', S: '#199E70', A: '#3987E5' };
const FALLBACK_PALETTE = ['#B5121B', '#C98500', '#199E70', '#3987E5', '#8E44AD', '#16A085', '#D35400', '#2C3E50'];
const POLL_MS = 4000;
const HOLD_MS = 8 * 60 * 1000 + 42 * 1000;

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

function formatSessionLabel(session, eventDate) {
  const dateStr = session?.date || eventDate;
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = WEEKDAYS_KO[new Date(y, m - 1, d).getDay()];
  const time = session?.time ? ` ${session.time}` : '';
  return `${y}년 ${m}월 ${d}일 (${dow})${time}`;
}

function zoneColor(z, i) {
  return z.color || GRADE_COLOR[z.name] || FALLBACK_PALETTE[i % FALLBACK_PALETTE.length];
}

// Releases a held-but-unpaid seat back to the backend — fire-and-forget, since
// the seat also auto-releases via the backend's own hold-duration timer either way.
function releaseHeldSeat({ seatId, userId }) {
  if (!seatId || !userId) return;
  fetch('/seats/release', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, seatId }),
  }).catch(() => {});
}

// 구역 선택 화면과 좌석 선택 화면을 하나로 합친 것 — 예전엔 구역을 고르면
// 다른 페이지로 이동해서 좌석 정보를 다시 불러왔는데, 이제는 전체 좌석 지도
// 자체가 곧 좌석 선택 화면이라 페이지 전환/재로딩이 없음. 좌석을 확정하면
// (다음 화면인) 결제 페이지로만 이동함.
function renderZoneSeatPage(container, eventId, focusZoneId) {
  container.innerHTML = '<div class="center-state"><div class="center-state__title">좌석 정보 불러오는 중...</div></div>';

  let destroyed = false;
  let pollTimer = null;
  let holdTimer = null;
  let seatMapApiRef = null;
  let seatConn = null;
  // Tracks every seat currently held-but-unpaid on the backend (up to
  // MAX_SEATS), so the page-unmount cleanup below can release all of them if
  // the user navigates away without completing payment. Cleared right before
  // handing off to payment.js.
  const activeHolds = [];

  Promise.all([
    fetch('/events').then((r) => r.json()),
    fetch('/seats').then((r) => r.json()),
  ])
    .then(([eventsData, seatsData]) => {
      if (destroyed) return;
      const c = (eventsData.events || []).find((e) => e.eventId === eventId);
      if (!c) {
        container.innerHTML = '<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>';
        return;
      }

      const allSeats = seatsData.seats || [];
      const layout = (c.sections || []).length ? c.sections : [{ name: 'A', seats: c.totalSeats, price: c.price }];
      let session = getSelectedSession(c.eventId);
      const eventSessions = generateEventSessions(c.eventDate);

      // 구역(zone) 하나 = mountSeatMap의 section 하나. 전체 구역의 좌석을 한 번에
      // 넘겨서 지도 전체가 곧 좌석 선택 화면이 되게 함.
      // /seats는 전체 이벤트의 좌석을 한꺼번에 반환하므로, 구역명만으로 거르면
      // 다른 공연이 같은 구역명(VIP 등)을 썼을 때 좌석이 섞임 — seatId가 반드시
      // 이 이벤트의 접두사로 시작해야만 이 공연 소속으로 인정 (엄격 매칭).
      // 접두사가 없는 예전 데이터(이 수정 이전에 만든 공연)는 어느 공연 것인지
      // 구분할 방법이 없어서 아예 매칭 대상에서 제외됨 — 그런 예전 공연은
      // 관리자 화면에서 삭제 후 다시 생성해야 정상적으로 보임.
      const eventPrefix = `${c.eventId}:`;
      function belongsToThisEvent(s) {
        return s.seatId.startsWith(eventPrefix);
      }

      const sections = [];
      const flatSeats = [];
      const zoneMeta = {};
      let totalAvailable = 0;

      layout.forEach((z, i) => {
        const zoneSeats = allSeats.filter((s) => s.section === z.name && belongsToThisEvent(s));
        const available = zoneSeats.filter((s) => s.status === 'available');
        totalAvailable += available.length;
        const color = zoneColor(z, i);
        zoneMeta[z.name] = { label: `${z.name}구역`, price: Number(available[0]?.price || z.price || c.price) || 0, color };
        if (available.length === 0) return;
        sections.push({ id: z.name, label: `${z.name}구역`, grade: z.name, zone: c.eventName, cols: available.length, color });
        available.forEach((s, idx) => {
          // seatId는 "evt-171...:VIP-001"처럼 이벤트 ID가 접두사로 붙어있을 수
          // 있음(공연 간 좌석 ID 충돌 방지) — 뒤쪽 "구역-번호" 부분만 파싱
          const bareId = s.seatId.includes(':') ? s.seatId.split(':').pop() : s.seatId;
          flatSeats.push({
            id: s.seatId,
            section: s.section,
            row: bareId.split('-')[0],
            seatNum: parseInt(bareId.split('-')[1], 10) || idx + 1,
            grade: z.name,
            status: 'available',
            // 백엔드가 DECIMAL 컬럼을 문자열로 내려줄 때가 있어서(예: "126000") 여기서
            // 미리 숫자로 못 박아둠 — 안 그러면 나중에 여러 좌석 가격을 합산할 때
            // "+"가 숫자 덧셈이 아니라 문자열 이어붙이기로 동작해 총액이 깨짐.
            price: Number(s.price || z.price || c.price) || 0,
          });
        });
      });

      if (totalAvailable === 0) {
        container.innerHTML = `
          <div class="container" style="padding:60px 0;">
            <div class="soldout-panel">
              <div class="soldout-title">SOLD OUT</div>
              <div class="soldout-desc">티켓이 모두 매진되었습니다.<br/>현재 예매 가능한 좌석이 없습니다.</div>
            </div>
          </div>
        `;
        showSoldOutModal(c.eventId);
        return;
      }

      // 예매 대기열을 통과해 이 화면(좌석 선택)에 들어온 순간부터 결제/완료
      // 화면까지 계속 보이는 전역 제한시간 — 헤더(header.js)가 그려줌.
      startSeatSelectTimer();

      container.innerHTML = `
        <section class="seat-page-header">
          <div class="container seat-page-header__top">
            <div>
              <div class="seat-page-header__title">${c.eventName}</div>
              <div class="seat-page-header__date">
                <span data-session-date>${formatSessionLabel(session, c.eventDate)}</span> · ${c.venue}
              </div>
            </div>
            <div class="seat-page-header__right"></div>
          </div>
        </section>
        <div class="container">
          <div class="seats-left-banner" data-banner>
            <div><div class="seats-left-banner__msg">실시간으로 좌석이 예매되고 있습니다.</div></div>
            <div style="text-align:right;">
              <div class="seats-left-banner__num num-mono" data-remaining>${formatNumber(totalAvailable)}석</div>
            </div>
          </div>
        </div>
        <div class="container" style="padding-top:12px;padding-bottom:0;">
          <div class="chip-row" data-session-tabs style="gap:8px;flex-wrap:wrap;">
            ${eventSessions.map((s, i) => `
              <button type="button" class="chip-btn ${session?.date === s.date && session?.time === s.time ? 'active' : ''}" data-session-tab="${i}" style="flex:1;min-width:calc(50% - 6px);justify-content:center;padding:10px 12px;font-size:13px;">
                ${s.shortLabel} ${s.round}회 ${s.time}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="container" data-body>
          <div class="seat-select-body">
            <div class="seatmap-scroll"><div class="seatmap-inner" data-seatmap></div></div>
            <div class="order-rail" data-rail>
              <div class="order-rail__order" data-order-box></div>
            </div>
          </div>
        </div>
        <div class="container mt-16">
          <div class="zone-legend">
            ${Object.entries(zoneMeta)
              .map(([name, z]) => `<span><span class="zone-legend__dot" style="background:${z.color}"></span>${name} · ${formatPrice(z.price)}</span>`)
              .join('')}
          </div>
        </div>
      `;

      const seatMapHost = container.querySelector('[data-seatmap]');
      const orderBox = container.querySelector('[data-order-box]');
      const MAX_SEATS = 4;
      // 페이지 재접속 시 중복 예매가 가능했던 예전 허점(선점 개수가 프론트 변수에만
      // 있고 화면에 명확히 안 보였음)을 보완 — 선택한 좌석을 배열로 관리하고
      // 우측에 항상 리스트로 보여줘서 몇 매를 들고 있는지 항상 명확하게 함.
      let mySeats = [];
      let holdDeadline = null;
      let holdRequestInFlight = false;

      function renderRailEmpty(message = '색칠된 구역의 좌석 중 원하는 자리를 선택해주세요') {
        orderBox.innerHTML = `<div class="order-rail__title">선택 좌석 정보</div><div class="order-rail__session" data-order-session>${formatSessionLabel(session, c.eventDate)}</div><div class="order-rail__empty">${message}</div>`;
      }
      renderRailEmpty();

      container.querySelectorAll('[data-session-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.sessionTab);
          const s = eventSessions[idx];
          if (!s || (session?.date === s.date && session?.time === s.time)) return;
          if (mySeats.length) {
            clearHold();
            const userId = getState().user?.email;
            mySeats.forEach((seat) => {
              releaseHeldSeat({ seatId: seat.id, userId });
              seat.status = 'available';
            });
            mySeats = [];
            activeHolds.length = 0;
            seatMapApi.updateStatuses(flatSeats);
          }
          session = { date: s.date, time: s.time };
          setSelectedSession(c.eventId, session);
          const dateEl = container.querySelector('[data-session-date]');
          if (dateEl) dateEl.textContent = formatSessionLabel(session, c.eventDate);
          container.querySelectorAll('[data-session-tab]').forEach((b, i) => b.classList.toggle('active', i === idx));
          renderRailEmpty();
          showToast({ title: '공연 일정이 변경되었습니다', body: s.label, type: 'success' });
        });
      });

      // /seats/hold requires an Admission Token issued once the queue admits this
      // user. Normally that happens on the queue page (queue.js), but this screen
      // is also reachable directly (deep link, admin testing) without going through
      // it — so if we don't have a live token yet, bootstrap one inline here.
      //
      // The raw token string is only ever exposed once, at the moment it's issued —
      // /queue/status only returns metadata (exists, remainingSeconds, ...), never
      // the token itself. It can come from two places:
      //  - /queue/enter, if the user still holds a live admission (hasn't bought
      //    or confirmed anything yet) — no requeue needed, token comes back directly.
      //  - /queue/admit, once a (re-)queued user's turn comes up. A user who already
      //    used their token once (bought a seat, or is now rebooking after a refund)
      //    gets put back at the end of the real queue rather than instantly let back
      //    in — so /queue/admit may take a few tries if others are ahead of them.
      const ADMIT_RETRY_MS = 1200;
      const ADMIT_MAX_TRIES = 8;

      function pollForToken(userId, triesLeft) {
        return fetch('/queue/admit', { method: 'POST' })
          .then((r) => r.json())
          .then((admitResult) => {
            const tokenInfo = admitResult.tokens?.[userId];
            if (tokenInfo?.token) {
              setAdmissionToken(c.eventId, tokenInfo);
              return tokenInfo.token;
            }
            if (triesLeft <= 0) throw new Error('token_unavailable');
            return new Promise((resolve) => setTimeout(resolve, ADMIT_RETRY_MS)).then(() =>
              pollForToken(userId, triesLeft - 1)
            );
          });
      }

      function ensureAdmissionToken(userId) {
        const existing = getAdmissionToken(c.eventId);
        if (existing?.token) return Promise.resolve(existing.token);
        return fetch('/queue/enter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        })
          .then((r) => r.json())
          .then((enterResult) => {
            if (enterResult.token) {
              setAdmissionToken(c.eventId, enterResult);
              return enterResult.token;
            }
            return pollForToken(userId, ADMIT_MAX_TRIES);
          });
      }

      // The backend revokes an Admission Token the moment it's used for a
      // successful hold (one-shot, to stop it being reused indefinitely) — so
      // picking a second seat after already holding one needs a *fresh* token,
      // not the cached one. These are exactly the verifyToken() failure reasons
      // that mean "this token is no longer usable" (vs. "unavailable"/"lock_failed",
      // which are about the seat, not the token).
      const STALE_TOKEN_REASONS = new Set(['no_token', 'expired', 'revoked', 'invalid', 'user_mismatch', 'mismatch']);

      function attemptHold(userId, seatId, token) {
        return fetch('/seats/hold', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, seatId, token }),
        }).then((r) => r.json().then((data) => ({ ok: r.ok, data })));
      }

      function deselectSeat(seat) {
        const userId = getState().user?.email;
        releaseHeldSeat({ seatId: seat.id, userId });
        seat.status = 'available';
        mySeats = mySeats.filter((s) => s.id !== seat.id);
        const idx = activeHolds.findIndex((h) => h.seatId === seat.id);
        if (idx >= 0) activeHolds.splice(idx, 1);
        seatMapApi.updateStatuses(flatSeats);
        if (mySeats.length === 0) {
          clearHold();
          renderRailEmpty();
        } else {
          renderRailSelected();
        }
      }

      function handleSeatClick(id) {
        if (holdRequestInFlight) return;
        const target = flatSeats.find((s) => s.id === id);
        if (!target) return;

        const userId = getState().user?.email;
        if (!userId) {
          showToast({ title: '로그인이 필요합니다', body: '좌석을 선점하려면 먼저 로그인해주세요.', type: 'default' });
          return;
        }

        // 이미 선택한 좌석을 다시 클릭하면 선택 해제(다른 좌석은 그대로 유지)
        const already = mySeats.find((s) => s.id === id);
        if (already) {
          deselectSeat(already);
          return;
        }

        if (mySeats.length >= MAX_SEATS) {
          showToast({ title: `최대 ${MAX_SEATS}매까지 선택할 수 있습니다`, body: '더 선택하려면 먼저 다른 좌석의 선택을 취소해주세요.', type: 'default' });
          return;
        }

        holdRequestInFlight = true;
        ensureAdmissionToken(userId)
          .then((token) => attemptHold(userId, id, token))
          .then((result) => {
            // Cached token turned out to be stale (already used for an earlier
            // hold, expired, etc.) — clear it, get a fresh one, and retry once.
            if (!result.ok && STALE_TOKEN_REASONS.has(result.data.reason)) {
              clearAdmissionToken(c.eventId);
              return ensureAdmissionToken(userId).then((token) => attemptHold(userId, id, token));
            }
            return result;
          })
          .then(({ ok, data }) => {
            if (!ok || !data.success) {
              showToast({ title: '좌석을 선점하지 못했습니다', body: data.message || '이미 다른 사용자가 선택했거나 만료되었습니다.', type: 'default' });
              if (data.reason === 'unavailable') {
                target.status = target.status === 'available' ? 'holding' : target.status;
                seatMapApi.updateStatuses(flatSeats);
              }
              return;
            }
            target.status = 'mine';
            mySeats.push(target);
            activeHolds.push({ seatId: target.id, userId });
            seatMapApi.updateStatuses(flatSeats);
            // 카트 전체에 하나의 제한시간을 두므로(개별 좌석마다 따로 재는 게
            // 아니라) 첫 좌석을 잡을 때만 타이머를 시작한다.
            if (mySeats.length === 1) startHold();
            renderRailSelected();
          })
          .catch((err) => {
            if (err?.message === 'token_unavailable') {
              showToast({
                title: '입장 허용 대기 중입니다',
                body: '아직 대기열 순서가 오지 않았거나 티켓팅이 열리지 않았을 수 있어요. 잠시 후 다시 시도해주세요.',
                type: 'default',
              });
            } else {
              showToast({ title: '좌석 선점 요청에 실패했습니다', body: '네트워크 상태를 확인하고 다시 시도해주세요.', type: 'default' });
            }
          })
          .finally(() => {
            holdRequestInFlight = false;
          });
      }

      const seatMapApi = mountSeatMap(seatMapHost, { sections, seats: flatSeats, onSeatClick: handleSeatClick });
      seatMapApiRef = seatMapApi;
      if (focusZoneId) seatMapApi.scrollToZone(focusZoneId);

      // C파트 WebSocket — 다른 유저의 좌석 선점/해제를 실시간 수신
      const SEAT_EVENT_MAP = { 'seat.held': 'holding', 'seat.sold': 'sold', 'seat.released': 'available', 'seat.cancelled': 'available' };
      {
        const u = getState().user;
        seatConn = connectSeats(c.eventId, u?.email || 'anonymous', u?.name || '게스트', {
          onMessage: (msg) => {
            if (!msg?.seatId || !msg.type) return;
            if (mySeats.some((s) => s.id === msg.seatId)) return;
            const seat = flatSeats.find((s) => s.id === msg.seatId);
            if (!seat) return;
            const next = SEAT_EVENT_MAP[msg.type];
            if (next) {
              seat.status = next;
              seatMapApi.updateStatuses(flatSeats);
              const remainEl = container.querySelector('[data-remaining]');
              if (remainEl) {
                const avail = flatSeats.filter((s) => s.status === 'available').length;
                remainEl.textContent = `${formatNumber(avail)}석`;
              }
            }
          },
          onOpen: () => console.log('[Seats WS] 연결 성공'),
          onClose: () => console.log('[Seats WS] 연결 종료'),
        });
      }

      function renderRailSelected() {
        const total = mySeats.reduce((sum, s) => sum + Number(s.price || 0), 0);
        orderBox.innerHTML = `
          <div class="order-rail__title">선택 좌석 (${mySeats.length}/${MAX_SEATS})</div>
          <div class="order-rail__session">${formatSessionLabel(session, c.eventDate)}</div>
          <div class="order-rail__seat-list">
            ${mySeats
              .map((s) => {
                const zone = zoneMeta[s.grade];
                return `
              <div class="order-rail__seat-item">
                <div>
                  <div class="order-rail__seat-grade">${zone.label}</div>
                  <div class="order-rail__seat-loc">${s._displayNum || s.seatNum}번</div>
                </div>
                <div style="text-align:right;">
                  <div class="order-rail__seat-price num-mono">${formatPrice(s.price)}</div>
                  <button type="button" class="order-rail__seat-remove" data-remove-seat="${s.id}">취소</button>
                </div>
              </div>`;
              })
              .join('')}
          </div>
          <div class="order-rail__total">
            <span>총 결제 금액</span>
            <b class="num-mono">${formatPrice(total)}</b>
          </div>
          <button class="btn btn-primary btn-block" data-next>선택 완료</button>
        `;
        orderBox.querySelectorAll('[data-remove-seat]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const seat = mySeats.find((s) => s.id === btn.dataset.removeSeat);
            if (seat) deselectSeat(seat);
          });
        });
        orderBox.querySelector('[data-next]').addEventListener('click', () => {
          const deadline = holdDeadline;
          clearHold();
          // Handing the held seats off to payment.js — the page-unmount cleanup
          // below must not release them now that we're headed to pay for them.
          activeHolds.length = 0;
          setCurrentOrder({
            concertId: c.eventId,
            session,
            seats: mySeats.map((s) => ({ ...s, gradeName: zoneMeta[s.grade].label })),
            source: 'regular',
            securedAt: Date.now(),
            holdDeadline: deadline,
          });
          navigate('payment/regular');
        });
      }

      function startHold() {
        clearHold();
        holdDeadline = Date.now() + HOLD_MS;
        holdTimer = setInterval(() => {
          const remaining = holdDeadline - Date.now();
          if (remaining <= 0) {
            clearHold();
            const userId = getState().user?.email;
            mySeats.forEach((s) => {
              releaseHeldSeat({ seatId: s.id, userId });
              s.status = 'available';
            });
            mySeats = [];
            activeHolds.length = 0;
            seatMapApi.updateStatuses(flatSeats);
            renderRailEmpty('시간이 만료되었습니다. 다시 선택해주세요.');
            return;
          }
        }, 1000);
      }

      function clearHold() {
        if (holdTimer) clearInterval(holdTimer);
        holdTimer = null;
      }


      // 실제 판매 현황을 주기적으로 반영 (전체 잔여석 숫자만 — 개별 좌석 점/색은
      // 최초 스냅샷 기준. 다른 사용자가 실시간으로 사는 걸 완전히 반영하려면
      // SSE 연동이 필요한데, 이건 별도 작업 범위라 우선 폴링으로 총 잔여석만 갱신)
      let allSoldOutShown = false;
      pollTimer = setInterval(() => {
        fetch('/seats')
          .then((r) => r.json())
          .then((data) => {
            const seats2 = data.seats || [];
            const zoneNames = layout.map((z) => z.name);
            const remain = seats2.filter((s) => zoneNames.includes(s.section) && belongsToThisEvent(s) && s.status === 'available').length;
            const remainEl = container.querySelector('[data-remaining]');
            if (remainEl) remainEl.textContent = `${formatNumber(remain)}석`;
            if (!allSoldOutShown && remain === 0) {
              allSoldOutShown = true;
              clearInterval(pollTimer);
              showSoldOutModal(c.eventId);
            }
          })
          .catch(() => {});
      }, POLL_MS);
    })
    .catch(() => {
      if (!destroyed) {
        container.innerHTML = '<div class="center-state"><div class="center-state__title">좌석 정보를 불러오지 못했습니다.</div></div>';
      }
    });

  return () => {
    destroyed = true;
    if (pollTimer) clearInterval(pollTimer);
    if (holdTimer) clearInterval(holdTimer);
    if (seatConn) seatConn.close();
    activeHolds.forEach((h) => releaseHeldSeat(h));
    seatMapApiRef?.destroy();
  };
}

export const zoneSelectPage = {
  render(container, params) {
    return renderZoneSeatPage(container, params.id, null);
  },
};

export { renderZoneSeatPage };
