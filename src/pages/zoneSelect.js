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
import { generateEventSessions, formatStoredSessions, getVenueZoneLayout } from '../data/concerts.js';
import { fetchWithRecaptcha } from '../utils/recaptcha.js';
import { leaveQueueBeacon, releaseSeatBeacon } from '../utils/backendApi.js';

const GRADE_COLOR = { VIP: '#B5121B', R: '#C98500', S: '#199E70', A: '#3987E5' };
const FALLBACK_PALETTE = ['#B5121B', '#C98500', '#199E70', '#3987E5', '#8E44AD', '#16A085', '#D35400', '#2C3E50'];
//const POLL_MS = 4000;
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
  return z.color || GRADE_COLOR[z.grade] || GRADE_COLOR[z.name] || FALLBACK_PALETTE[i % FALLBACK_PALETTE.length];
}

// Releases a held-but-unpaid seat back to the backend. The keepalive request is
// safe during pagehide/beforeunload; the backend hold timer remains the final
// fallback if the browser or network disappears without notice.
function releaseHeldSeat({ seatId, userId }) {
  releaseSeatBeacon(userId, seatId);
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
  let wsReconnectTimer = null;
  let bookingTransition = false;
  let abandonSent = false;
  let queueContext = { eventId, sessionDate: '', sessionTime: '' };
  // Tracks every seat currently held-but-unpaid on the backend (up to
  // MAX_SEATS), so the page-unmount cleanup below can release all of them if
  // the user navigates away without completing payment. Cleared right before
  // handing off to payment.js.
  const activeHolds = [];

  // An admitted user must not occupy one of the fixed admission slots while
  // abandoning the seat flow. /queue/leave removes the admitted member and
  // backfills one waiting user on the server.
  function notifyBookingAbandon() {
    if (bookingTransition || abandonSent) return;
    const userId = getState().user?.userId || getState().user?.email;
    if (!userId) return;
    abandonSent = true;
    activeHolds.forEach((hold) => releaseHeldSeat(hold));
    leaveQueueBeacon(userId, queueContext);
  }

  window.addEventListener('pagehide', notifyBookingAbandon);
  window.addEventListener('beforeunload', notifyBookingAbandon);

  // 공연 삭제와 좌석 매진은 서로 다른 상태다. 관리자 화면에서 공연이
  // 삭제되면 좌석 데이터도 함께 정리되므로, 좌석이 0개라는 이유만으로
  // 매진 모달을 띄우면 삭제된 공연이 일반 사용자에게 매진으로 오인된다.
  function renderEventUnavailable(title = '공연을 찾을 수 없습니다', description = '해당 공연이 삭제되었거나 더 이상 운영되지 않습니다.') {
    if (destroyed) return;
    destroyed = true;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    if (holdTimer) clearInterval(holdTimer);
    holdTimer = null;
    if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
    if (seatConn) {
      seatConn.close();
      seatConn = null;
    }
    closeModal();
    container.innerHTML = `
      <div class="container" style="padding:60px 0;text-align:center;">
        <div class="soldout-panel">
          <div class="soldout-title">${title}</div>
          <div class="soldout-desc">${description}</div>
          <button class="btn btn-primary mt-24" data-go-concerts>공연 목록으로</button>
        </div>
      </div>
    `;
    container.querySelector('[data-go-concerts]')?.addEventListener('click', () => navigate('concerts'));
  }

  // 좌석이 사라진 순간에만 최신 공연 목록을 확인한다. 일시적인 API 오류는
  // 삭제로 간주하지 않아, 네트워크 장애 때문에 매진/삭제 화면이 잘못 뜨지
  // 않도록 한다.
  async function verifyEventStillExists() {
    try {
      const response = await fetch('/events', { cache: 'no-store' });
      if (!response.ok) return true;
      const latest = await response.json();
      return (latest.events || []).some((candidate) => candidate.eventId === eventId);
    } catch (_) {
      return true;
    }
  }

  fetch('/events')
    .then((r) => r.json())
    .then((eventsData) => {
      const event = (eventsData.events || []).find((e) => e.eventId === eventId);
      if (!event) return { eventsData, seatsData: { seats: [] }, selectedSession: null };

      const eventSessions = formatStoredSessions(event.sessions) || generateEventSessions(event.eventDate);
      const bookedDates = new Set(getState().bookings
        .filter((b) => b.concertId === eventId && (b.status === 'confirmed' || b.status === 'unpaid'))
        .map((b) => b.session?.date)
        .filter(Boolean));
      const availableSessions = eventSessions.filter((s) => !bookedDates.has(s.date));
      const storedSession = getSelectedSession(eventId);
      const selectedSession = storedSession && !bookedDates.has(storedSession.date)
        ? storedSession
        : availableSessions[0] || eventSessions[0] || null;
      if (selectedSession && (!storedSession || storedSession.date !== selectedSession.date || storedSession.time !== selectedSession.time)) {
        setSelectedSession(eventId, { date: selectedSession.date, time: selectedSession.time });
      }

      const params = new URLSearchParams({ eventId });
      if (selectedSession?.date) params.set('sessionDate', selectedSession.date);
      if (selectedSession?.time) params.set('sessionTime', selectedSession.time);
      return fetch(`/seats?${params.toString()}`)
        .then((r) => r.json())
        .then((seatsData) => ({ eventsData, seatsData, selectedSession }));
    })
    .then(({ eventsData, seatsData, selectedSession }) => {
      if (destroyed) return;
      const c = (eventsData.events || []).find((e) => e.eventId === eventId);
      if (!c) {
        renderEventUnavailable();
        return;
      }

      const allSeats = seatsData.seats || [];
      const storedLayout = (c.sections || []).length
        ? c.sections
        : [{ name: 'A', seats: c.totalSeats, price: c.price }];
      const olympicGradeByZone = c.venue === '올림픽홀'
        ? new Map(getVenueZoneLayout(c).map((z) => [z.id, z]))
        : new Map();
      // 올림픽홀 이벤트의 API section은 실제 구역명(A1, B1...)이고,
      // 등급은 좌석 배치 데이터의 grade(S/R/A/VIP)에서 가져온다.
      // 두 값을 분리해 두어 구역별 가격·등급이 섞이지 않게 한다.
      const layout = c.venue === '올림픽홀'
        ? storedLayout.map((z) => {
          const zoneId = z.name || z.id;
          const mapped = olympicGradeByZone.get(zoneId);
          return {
            ...z,
            id: zoneId,
            name: zoneId,
            grade: mapped?.grade || z.grade || zoneId,
            label: mapped?.label || z.label || `${zoneId}구역`,
          };
        })
        : storedLayout;
      let session = selectedSession || getSelectedSession(c.eventId);
      const eventSessions = formatStoredSessions(c.sessions) || generateEventSessions(c.eventDate);
      const sessionSocketKey = session?.date && session?.time
        ? `${session.date}_${String(session.time).replace(/^([0-9]):/, '0$1:').replace(/:/g, '-')}`
        : '';
      queueContext = {
        eventId: c.eventId,
        sessionDate: session?.date || '',
        sessionTime: session?.time || '',
      };

      const myBookings = getState().bookings.filter(
        (b) => b.concertId === c.eventId && (b.status === 'confirmed' || b.status === 'unpaid')
      );
      const bookedDates = new Set(myBookings.map((b) => b.session?.date).filter(Boolean));
      const MAX_BOOKINGS_PER_CONCERT = 2;

      if (myBookings.length >= MAX_BOOKINGS_PER_CONCERT) {
        container.innerHTML = `
          <div class="container" style="padding:60px 0;text-align:center;">
            <div class="soldout-panel">
              <div class="soldout-title">예매 한도 초과</div>
              <div class="soldout-desc">이 공연은 1인당 최대 ${MAX_BOOKINGS_PER_CONCERT}매까지 예매 가능합니다.<br/>이미 ${myBookings.length}매를 예매하셨습니다.</div>
              <button class="btn btn-primary mt-24" onclick="location.hash='#/mypage'">마이페이지로 이동</button>
            </div>
          </div>
        `;
        return;
      }

      const availableSessions = eventSessions.filter((s) => !bookedDates.has(s.date));
      if (availableSessions.length === 0) {
        container.innerHTML = `
          <div class="container" style="padding:60px 0;text-align:center;">
            <div class="soldout-panel">
              <div class="soldout-title">예매 가능한 날짜 없음</div>
              <div class="soldout-desc">모든 공연일의 예매가 완료되었습니다.</div>
              <button class="btn btn-primary mt-24" onclick="location.hash='#/mypage'">마이페이지로 이동</button>
            </div>
          </div>
        `;
        return;
      }

      if (session && bookedDates.has(session.date)) {
        session = { date: availableSessions[0].date, time: availableSessions[0].time };
        setSelectedSession(c.eventId, session);
      }
      if (!session && availableSessions[0]) {
        session = { date: availableSessions[0].date, time: availableSessions[0].time };
        setSelectedSession(c.eventId, session);
      }

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
        const available = zoneSeats.filter((s) => s.status === 'AVAILABLE');
        totalAvailable += available.length;
        const color = zoneColor(z, i);
        const zoneLabel = c.venue === '올림픽홀' && z.grade
          ? `${z.name}구역 · ${z.grade}석`
          : `${z.name}구역`;
        zoneMeta[z.name] = {
          label: zoneLabel,
          grade: z.grade || z.name,
          price: Number(available[0]?.price || z.price || c.price) || 0,
          color,
        };
        if (zoneSeats.length === 0) return;
        sections.push({ id: z.name, label: zoneLabel, grade: z.grade || z.name, zone: c.eventName, cols: zoneSeats.length, color });
        zoneSeats.forEach((s, idx) => {
          const bareId = s.seatId.includes(':') ? s.seatId.split(':').pop() : s.seatId;
          let status = 'available';
          if (s.status === 'SOLD') status = 'sold';
          else if (s.status === 'HELD') status = 'holding';
          flatSeats.push({
            id: s.seatId,
            section: s.section,
            zoneId: z.name,
            row: bareId.split('-')[0],
            seatNum: parseInt(bareId.split('-')[1], 10) || idx + 1,
            grade: z.grade || z.name,
            status,
            price: Number(s.price || z.price || c.price) || 0,
          });
        });
      });

      // 삭제된 공연 또는 아직 좌석 데이터가 생성되지 않은 공연은 매진으로
      // 처리하지 않는다. 실제 매진은 좌석 레코드가 존재하고 그 좌석들이
      // 모두 SOLD/HELD 상태인 경우에만 아래에서 처리한다.
      if (flatSeats.length === 0) {
        renderEventUnavailable('좌석 정보를 찾을 수 없습니다', '해당 공연의 좌석 데이터가 삭제되었거나 아직 준비되지 않았습니다.');
        return;
      }

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

      // 좌석 선택 지도 아래 가격 범례는 실제 구역명(A1, B1...)이 아니라
      // VIP/R/S/A 등급별로 한 번씩만 표시한다. 같은 등급에 여러 구역이
      // 있어도 사용자가 확인해야 하는 가격은 등급 가격 하나이므로 첫
      // 구역의 색상과 가격을 대표값으로 사용한다.
      const gradeOrder = ['VIP', 'R', 'S', 'A'];
      const gradePriceRows = [];
      const seenGrades = new Set();
      sections.forEach((section) => {
        const zone = zoneMeta[section.id];
        const grade = String(zone?.grade || '').replace(/석$/, '').trim();
        if (!zone || !gradeOrder.includes(grade) || seenGrades.has(grade)) return;
        seenGrades.add(grade);
        gradePriceRows.push({ grade, price: zone.price, color: zone.color });
      });
      gradePriceRows.sort((a, b) => gradeOrder.indexOf(a.grade) - gradeOrder.indexOf(b.grade));

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
            ${eventSessions.map((s, i) => {
              const isBooked = bookedDates.has(s.date);
              const isActive = !isBooked && session?.date === s.date && session?.time === s.time;
              return `
              <button type="button" class="chip-btn ${isActive ? 'active' : ''}" data-session-tab="${i}" ${isBooked ? 'disabled' : ''} style="flex:1;min-width:calc(50% - 6px);justify-content:center;padding:10px 12px;font-size:13px;${isBooked ? 'opacity:0.4;text-decoration:line-through;' : ''}">
                ${s.shortLabel} ${s.round}회 ${s.time}${isBooked ? ' (예매완료)' : ''}
              </button>`;
            }).join('')}
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
            ${gradePriceRows
              .map(({ grade, price, color }) => `<span><span class="zone-legend__dot" style="background:${color}"></span>${grade}석 · ${formatPrice(price)}</span>`)
              .join('')}
          </div>
        </div>
      `;

      const seatMapHost = container.querySelector('[data-seatmap]');
      const orderBox = container.querySelector('[data-order-box]');
      const MAX_SEATS = 1;
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
          if (bookedDates.has(s.date)) {
            showToast({ title: '이미 예매한 날짜입니다', body: `${s.shortLabel} 공연은 이미 예매가 완료되었습니다.` });
            return;
          }
          if (mySeats.length) {
            clearHold();
            const userId = getState().user?.userId || getState().user?.email;
            mySeats.forEach((seat) => {
              releaseHeldSeat({ seatId: seat.id, userId });
              seat.status = 'available';
            });
            mySeats = [];
            activeHolds.length = 0;
          }
          session = { date: s.date, time: s.time };
          queueContext.sessionDate = s.date;
          queueContext.sessionTime = s.time;
          setSelectedSession(c.eventId, session);
          showToast({ title: '공연 일정이 변경되었습니다', body: s.label, type: 'success' });
          // 회차마다 별도 좌석 inventory를 사용하므로 탭을 바꾸면 해당
          // 회차의 좌석과 대기열 토큰을 다시 불러온다.
          navigate(`zones/${c.eventId}`);
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
      //  - /queue/enter, once a (re-)queued user's turn comes up. A user who already
      //    used their token once (bought a seat, or is now rebooking after a refund)
      //    gets put back at the end of the real queue rather than instantly let back
      //    in — so the idempotent enter request may take a few tries if others are ahead.
      const ADMIT_RETRY_MS = 1200;
      const ADMIT_MAX_TRIES = 8;

      function pollForToken(userId, triesLeft) {
        return fetchWithRecaptcha('/queue/enter', {
          userId,
          eventId: c.eventId,
          sessionDate: session?.date || '',
          sessionTime: session?.time || '',
        }, 'queue_enter')
          .then(({ status, data: enterResult }) => {
            if (enterResult.token) {
              setAdmissionToken(c.eventId, enterResult, session);
              return enterResult.token;
            }
            if (status >= 400 || enterResult.status === 'closed' || triesLeft <= 0) {
              throw new Error(enterResult.message || 'token_unavailable');
            }
            return new Promise((resolve) => setTimeout(resolve, ADMIT_RETRY_MS)).then(() =>
              pollForToken(userId, triesLeft - 1)
            );
          });
      }

      function ensureAdmissionToken(userId) {
        const existing = getAdmissionToken(c.eventId, session);
        if (existing?.token) return Promise.resolve(existing.token);
        return fetchWithRecaptcha('/queue/enter', { userId, eventId: c.eventId, sessionDate: session?.date || '', sessionTime: session?.time || '' }, 'queue_enter')
          .then(({ data: enterResult }) => {
            if (enterResult.token) {
              setAdmissionToken(c.eventId, enterResult, session);
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
      const STALE_TOKEN_REASONS = new Set(['no_token', 'expired', 'revoked', 'invalid', 'user_mismatch', 'mismatch', 'session_mismatch']);

      function attemptHold(userId, seatId, token) {
        return fetchWithRecaptcha('/seats/hold', {
            userId,
            seatId,
            token,
            eventId: c.eventId,
            sessionDate: session?.date || '',
            sessionTime: session?.time || '',
          }, 'seat_hold')
          .then(({ status, data }) => ({ ok: status >= 200 && status < 300, data }));
      }

      function deselectSeat(seat) {
        const userId = getState().user?.userId || getState().user?.email;
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

        const userId = getState().user?.userId || getState().user?.email;
        if (!userId) {
          showToast({ title: '로그인이 필요합니다', body: '좌석을 선점하려면 먼저 로그인해주세요.', type: 'default' });
          return;
        }

        const already = mySeats.find((s) => s.id === id);
        if (already) {
          deselectSeat(already);
          return;
        }

        if (mySeats.length >= MAX_SEATS) {
          const prev = mySeats[0];
          releaseHeldSeat({ seatId: prev.id, userId });
          prev.status = 'available';
          mySeats = [];
          const idx = activeHolds.findIndex((h) => h.seatId === prev.id);
          if (idx >= 0) activeHolds.splice(idx, 1);
          clearHold();
          seatMapApi.updateStatuses(flatSeats);
        }

        holdRequestInFlight = true;
        ensureAdmissionToken(userId)
          .then((token) => attemptHold(userId, id, token))
          .then((result) => {
            // Cached token turned out to be stale (already used for an earlier
            // hold, expired, etc.) — clear it, get a fresh one, and retry once.
            if (!result.ok && STALE_TOKEN_REASONS.has(result.data.reason)) {
              clearAdmissionToken(c.eventId, session);
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

      const seatMapApi = mountSeatMap(seatMapHost, { sections, seats: flatSeats, onSeatClick: handleSeatClick, seatingType: c.seatingType, venue: c.venue });
      seatMapApiRef = seatMapApi;
      if (focusZoneId) seatMapApi.scrollToZone(focusZoneId);

      // C파트 WebSocket — 다른 유저의 좌석 선점/해제를 실시간 수신
      // WS 연결 성공 시 폴링 중지, 끊기면 폴링 fallback + 자동 재연결
      const SEAT_EVENT_MAP = { 'seat.held': 'holding', 'seat.sold': 'sold', 'seat.released': 'available', 'seat.cancelled': 'available' };
      let wsConnected = false;

      function startPolling() {
        if (pollTimer) return;
        pollTimer = setInterval(pollSeats, POLL_MS);
      }
      function stopPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      }

      function openSeatWs() {
        if (destroyed) return;
        const u = getState().user;
        const socketEventId = sessionSocketKey ? `${c.eventId}:${sessionSocketKey}` : c.eventId;
        seatConn = connectSeats(socketEventId, u?.email || 'anonymous', u?.name || '게스트', {
          onMessage: (msg) => {
            if (!msg?.seatId || !msg.type) return;
            if (mySeats.some((s) => s.id === msg.seatId)) return;
            const seat = flatSeats.find((s) => s.id === msg.seatId);
            if (!seat) return;
            const next = SEAT_EVENT_MAP[msg.type];
            if (next && seat.status !== next) {
              seat.status = next;
              seatMapApi.updateStatuses(flatSeats);
              const remainEl = container.querySelector('[data-remaining]');
              if (remainEl) {
                const avail = flatSeats.filter((s) => s.status === 'available').length;
                remainEl.textContent = `${formatNumber(avail)}석`;
              }
            }
          },
          onOpen: () => {
            console.log('[Seats WS] 연결 성공 — 폴링 중지');
            wsConnected = true;
            stopPolling();
          },
          onClose: () => {
            console.log('[Seats WS] 연결 종료 — 폴링 fallback 시작');
            wsConnected = false;
            startPolling();
            if (!destroyed) {
              wsReconnectTimer = setTimeout(openSeatWs, 3000);
            }
          },
        });
      }
      openSeatWs();

      function renderRailSelected() {
        const total = mySeats.reduce((sum, s) => sum + Number(s.price || 0), 0);
        orderBox.innerHTML = `
          <div class="order-rail__title">선택 좌석 (${mySeats.length}/${MAX_SEATS})</div>
          <div class="order-rail__session">${formatSessionLabel(session, c.eventDate)}</div>
          <div class="order-rail__seat-list">
            ${mySeats
              .map((s) => {
                const zone = zoneMeta[s.zoneId || s.section || s.grade];
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
          bookingTransition = true;
          // Handing the held seats off to payment.js — the page-unmount cleanup
          // below must not release them now that we're headed to pay for them.
          activeHolds.length = 0;
          setCurrentOrder({
            concertId: c.eventId,
            session,
            seats: mySeats.map((s) => ({ ...s, gradeName: zoneMeta[s.zoneId || s.section || s.grade].label })),
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
          const userId = getState().user?.userId || getState().user?.email;
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


      // HTTP 폴링 — WS 연결 실패 시 fallback으로 사용
      const seatIndex = new Map(flatSeats.map((s) => [s.id, s]));
      const mySeatIds = new Set();
      let allSoldOutShown = false;
      let eventCheckInFlight = false;
      function pollSeats() {
        const seatQuery = new URLSearchParams({ eventId: c.eventId });
        if (session?.date) seatQuery.set('sessionDate', session.date);
        if (session?.time) seatQuery.set('sessionTime', session.time);
        fetch(`/seats?${seatQuery.toString()}`)
          .then((r) => r.json())
          .then((data) => {
            const seats2 = data.seats || [];
            const zoneNames = layout.map((z) => z.name);
            let changed = false;
            mySeats.forEach((s) => mySeatIds.add(s.id));
            const serverStatus = new Map();
            for (const serverSeat of seats2) {
              if (!belongsToThisEvent(serverSeat)) continue;
              serverStatus.set(serverSeat.seatId, serverSeat.status);
              const local = seatIndex.get(serverSeat.seatId);
              if (!local || mySeatIds.has(local.id)) continue;
              let next = 'available';
              if (serverSeat.status === 'SOLD') next = 'sold';
              else if (serverSeat.status === 'HELD') next = 'holding';
              if (local.status !== next) { local.status = next; changed = true; }
            }
            for (const local of flatSeats) {
              if (mySeatIds.has(local.id)) continue;
              if (local.status !== 'available' && !serverStatus.has(local.id)) {
                local.status = 'available'; changed = true;
              }
            }
            mySeatIds.clear();
            if (changed) seatMapApi.updateStatuses(flatSeats);
            const eventSeats2 = seats2.filter((s) => zoneNames.includes(s.section) && belongsToThisEvent(s));
            const remain = eventSeats2.filter((s) => s.status === 'AVAILABLE').length;
            const remainEl = container.querySelector('[data-remaining]');
            if (remainEl) remainEl.textContent = `${formatNumber(remain)}석`;
            if (!allSoldOutShown && remain === 0) {
              // 삭제 시에는 /seats 응답이 비거나 이전 좌석 레코드가 잠시
              // 남아 있을 수 있다. 최신 /events에서 공연 존재 여부를 먼저
              // 확인하고, 실제 이벤트 좌석이 있을 때만 매진 모달을 띄운다.
              if (!eventCheckInFlight) {
                eventCheckInFlight = true;
                verifyEventStillExists()
                  .then((exists) => {
                    if (!exists) {
                      renderEventUnavailable();
                      return;
                    }
                    if (eventSeats2.length === 0) return;
                    allSoldOutShown = true;
                    stopPolling();
                    showSoldOutModal(c.eventId);
                  })
                  .finally(() => {
                    eventCheckInFlight = false;
                  });
              }
            }
          })
          .catch(() => {});
      }
      // WS가 아직 연결 안 됐으면 폴링으로 시작
      if (!wsConnected) startPolling();
    })
    .catch(() => {
      if (!destroyed) {
        container.innerHTML = '<div class="center-state"><div class="center-state__title">좌석 정보를 불러오지 못했습니다.</div></div>';
      }
    });

  return () => {
    notifyBookingAbandon();
    destroyed = true;
    if (pollTimer) clearInterval(pollTimer);
    if (holdTimer) clearInterval(holdTimer);
    if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
    if (seatConn) seatConn.close();
    window.removeEventListener('pagehide', notifyBookingAbandon);
    window.removeEventListener('beforeunload', notifyBookingAbandon);
    seatMapApiRef?.destroy();
  };
}

export const zoneSelectPage = {
  render(container, params) {
    return renderZoneSeatPage(container, params.id, null);
  },
};

export { renderZoneSeatPage };
