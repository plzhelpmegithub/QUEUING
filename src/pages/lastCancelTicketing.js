// [보존 / LAST LOCAL SIMULATION]
// 첨부된 cancel-ticketing mock의 흐름을 SPA에서 재현한다.
// Last 링크는 B파트 링크가 아니라 A파트 로컬 API가 발급한 5분 토큰을 사용하며,
// 회차별 공용 취소표 풀에서 현재 순번 사용자만 좌석을 선점할 수 있다.
import { navigate } from '../router.js';
import { mountSeatMap } from '../components/seatMap.js';
import { formatPrice } from '../utils/format.js';
import { addBooking, getState, loadCancelQueuesFromServer } from '../state/store.js';
import { bareSeatId, buildCancelSeatMapData, toCancelSeatStatus } from '../utils/cancelSeatMap.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function formatPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, d.length === 10 ? 6 : 7)}-${d.slice(d.length === 10 ? 6 : 7)}`;
}

function lastHeaders(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function requestLast(path, token, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...lastHeaders(token), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function buildLastMapData(event, rawSeats, poolSeats, { canSelect = false, assignedSeatId = '' } = {}) {
  const mapData = buildCancelSeatMapData(event, rawSeats, assignedSeatId);
  const poolById = new Map();
  (Array.isArray(poolSeats) ? poolSeats : []).forEach((poolSeat) => {
    const exactId = String(poolSeat.seatId || '');
    if (exactId) poolById.set(exactId, poolSeat);
    // API 응답이 전체 ID와 bare ID를 섞어 반환하는 경우에도
    // 같은 회차 좌석을 찾아 풀 상태를 정확히 덮어쓴다.
    const shortId = bareSeatId(exactId);
    if (shortId && !poolById.has(shortId)) poolById.set(shortId, poolSeat);
  });

  mapData.seats.forEach((seat) => {
    const poolSeat = poolById.get(String(seat.id)) || poolById.get(bareSeatId(seat.id));
    if (poolSeat) {
      seat.status = toCancelSeatStatus(poolSeat.status);
      if (Number(poolSeat.price) > 0) seat.price = Number(poolSeat.price);
    }
    seat.keepAvailableVisual = !assignedSeatId && Boolean(poolSeat) && seat.status === 'available';
    // 전체 배치도는 보여주되 Last 풀 좌석 또는 Local 배정 좌석만 활성화한다.
    seat.selectable = assignedSeatId
      ? seat.id === assignedSeatId && seat.status === 'available'
      : Boolean(poolSeat) && canSelect && seat.status === 'available';
  });
  return mapData;
}

export const lastCancelTicketingPage = {
  render(container, _params, query) {
    const rawToken = query?.token || query?.linkToken || '';
    let destroyed = false;
    let countdown = null;
    let pollTimer = null;
    let seatMapApi = null;
    let authToken = '';
    let verified = null;
    let selectedSeat = null;
    let serverHeldSeatId = '';
    let completed = false;
    let mapData = null;

    const cleanup = () => {
      destroyed = true;
      if (countdown) clearInterval(countdown);
      if (pollTimer) clearInterval(pollTimer);
      seatMapApi?.destroy();
      if ((authToken || rawToken) && serverHeldSeatId && !completed) {
        fetch('/last-simulation/release', {
          method: 'POST', headers: lastHeaders(authToken), keepalive: true,
          body: JSON.stringify({ allocationId: verified?.allocationId, linkToken: rawToken }),
        }).catch(() => {});
      }
    };

    function renderState(title, body, button = '홈으로') {
      if (countdown) clearInterval(countdown);
      if (pollTimer) clearInterval(pollTimer);
      seatMapApi?.destroy();
      seatMapApi = null;
      container.innerHTML = `
        <style>${lastTicketingStyles()}</style>
        <main class="last-ticketing last-ticketing--state">
          <div class="last-ticketing__ticket">🎟️</div>
          <h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p>
          <button class="last-ticketing__primary" data-last-home>${escapeHtml(button)}</button>
        </main>`;
      container.querySelector('[data-last-home]')?.addEventListener('click', () => navigate(''));
    }

    function paintTimer(deadline) {
      if (countdown) clearInterval(countdown);
      const tick = () => {
        const remaining = Math.max(0, deadline - Date.now());
        const el = container.querySelector('[data-last-timer]');
        const bar = container.querySelector('[data-last-timer-bar]');
        if (el) el.textContent = `${String(Math.floor(remaining / 60000)).padStart(2, '0')}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}`;
        if (bar) bar.style.width = `${Math.min(100, (remaining / (5 * 60 * 1000)) * 100)}%`;
        if (remaining <= 0) {
          clearInterval(countdown);
          completed = true;
          serverHeldSeatId = '';
          requestLast('/last-simulation/expire', authToken, { method: 'POST', body: JSON.stringify({ allocationId: verified.allocationId, linkToken: rawToken }) }).catch(() => {});
          renderState('입장 시간이 만료되었습니다', 'Secret Link 사용 시간이 종료되었습니다. 다음 순번 사용자에게 기회가 넘어갑니다.', '취소표 대기열로');
          container.querySelector('[data-last-home]')?.addEventListener('click', () => navigate('mypage/cancel-queue'));
        }
      };
      countdown = setInterval(tick, 1000);
      tick();
    }

    async function loadPool() {
      if ((!authToken && !rawToken) || !verified || destroyed) return;
      const result = await requestLast(`/last-simulation/pool?allocationId=${encodeURIComponent(verified.allocationId)}&linkToken=${encodeURIComponent(rawToken)}`, authToken);
      if (!result.ok || destroyed) {
        // 403/410을 무시하면 초기 화면의 “현재 순번 전” 문구가 남아
        // 순번 오류처럼 보인다. 링크 세션이 실제로 거부된 경우에는
        // polling을 멈추고 서버 응답 원인을 사용자에게 표시한다.
        if (!destroyed && (result.status === 403 || result.status === 410)) {
          const message = result.data?.message || '취소표 링크 권한을 확인할 수 없습니다. 새 링크로 다시 접속해주세요.';
          renderState('취소표 링크 확인 필요', message, '취소표 대기열로');
          container.querySelector('[data-last-home]')?.addEventListener('click', () => navigate('mypage/cancel-queue'));
        }
        return;
      }
      const canSelect = result.data.canSelect === true;
      const isLocalLink = verified.mode === 'local';
      const notice = container.querySelector('[data-last-notice]');
      if (notice && !selectedSeat) notice.innerHTML = isLocalLink
        ? '<b>회원님에게 배정된 좌석만 선택할 수 있습니다.</b> 좌석 선점 후 결제를 완료해주세요.'
        : canSelect
          ? '<b>현재 순번입니다.</b> 취소표 풀에서 좌석 1개를 선택해주세요.'
          : `현재 <b>${result.data.currentSequenceNo || '-'}번째</b> 사용자가 좌석을 처리 중입니다. 순번이 되면 선택할 수 있습니다.`;
      const seats = result.data.seats || [];
      if (seatMapApi && mapData) {
        const map = new Map();
        seats.forEach((poolSeat) => {
          const exactId = String(poolSeat.seatId || '');
          if (exactId) map.set(exactId, poolSeat);
          const shortId = bareSeatId(exactId);
          if (shortId && !map.has(shortId)) map.set(shortId, poolSeat);
        });
        mapData.seats.forEach((seat) => {
          const current = map.get(String(seat.id)) || map.get(bareSeatId(seat.id));
          if (current) {
            seat.status = toCancelSeatStatus(current.status);
            if (Number(current.price) > 0) seat.price = Number(current.price);
          }
          const isSelected = selectedSeat && seat.id === selectedSeat.id;
          if (isSelected) {
            seat.status = 'mine';
            seat.selectable = false;
          } else {
            seat.keepAvailableVisual = !isLocalLink && Boolean(current) && seat.status === 'available';
            seat.selectable = isLocalLink
              ? seat.id === String(verified.seatId || '') && seat.status === 'available'
              : Boolean(current) && canSelect && seat.status === 'available';
          }
        });
        seatMapApi.updateStatuses(mapData.seats);
      }
    }

    function railMarkup(data, activeStep) {
      const seatActive = activeStep === 'seat';
      const paymentActive = activeStep === 'payment';
      return `
        <aside class="last-ticketing__rail" aria-label="취소표 예매 진행 단계">
          <section class="last-ticketing__timer-card">
            <span>SECRET LINK 제한시간</span>
            <strong data-last-timer>05:00</strong>
            <div class="last-ticketing__timer"><i data-last-timer-bar></i></div>
            <small>시간 안에 결제를 완료해주세요.</small>
          </section>
          <nav class="last-ticketing__segments" aria-label="예매 단계">
            ${paymentActive
              ? '<button type="button" class="last-ticketing__segment is-complete" data-last-return-seat><b>01</b><span>좌석 선택</span><small>좌석 다시 고르기</small></button>'
              : `<div class="last-ticketing__segment ${seatActive ? 'is-active' : ''}"><b>01</b><span>좌석 선택</span><small>좌석 선택 후 확정</small></div>`}
            <div class="last-ticketing__segment ${paymentActive ? 'is-active' : ''}"><b>02</b><span>결제</span><small>결제 완료</small></div>
          </nav>
          <p class="last-ticketing__rail-note">선택한 좌석은 “좌석 확정”을 누른 뒤에만 실제로 선점됩니다.</p>
        </aside>`;
    }

    function restoreClientSelection(data, isLocalLink, canSelectNow) {
      if (!selectedSeat || serverHeldSeatId || !mapData) return;
      const previous = mapData.seats.find((seat) => seat.id === selectedSeat.id);
      if (previous) {
        previous.status = 'available';
        previous.selectable = isLocalLink
          ? previous.id === String(data.seatId || '')
          : Boolean(canSelectNow);
      }
      selectedSeat = null;
      seatMapApi?.updateStatuses(mapData.seats);
    }

    async function releaseHeldSelection(data, event) {
      const releaseButton = container.querySelector('[data-last-return-seat]');
      if (releaseButton) {
        releaseButton.disabled = true;
        releaseButton.textContent = '좌석을 다시 여는 중...';
      }
      const result = await requestLast('/last-simulation/release', authToken, {
        method: 'POST',
        body: JSON.stringify({ allocationId: data.allocationId, linkToken: rawToken }),
      });
      if (!result.ok || !result.data.success) {
        const feedback = container.querySelector('[data-last-payment-feedback]');
        if (feedback) feedback.textContent = result.data?.message || '좌석 선점을 해제하지 못했습니다. 잠시 후 다시 시도해주세요.';
        if (releaseButton) {
          releaseButton.disabled = false;
          releaseButton.textContent = '좌석 선택으로 돌아가기';
        }
        return;
      }
      serverHeldSeatId = '';
      selectedSeat = null;
      data.heldSeatId = null;
      if (data.mode !== 'local') data.seatId = null;
      renderValid(data, event);
    }

    function renderPaymentStep(data, event) {
      if (!selectedSeat) return;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      seatMapApi?.destroy();
      seatMapApi = null;
      const currentUser = getState().user || {};
      const eventName = event?.eventName || data.eventId;
      const seatLabel = `${selectedSeat.section || '일반'}구역 ${bareSeatId(selectedSeat.id)}`;
      const price = Number(selectedSeat.price || 0);

      container.innerHTML = `
        <style>${lastTicketingStyles()}</style>
        <main class="last-ticketing">
          <header class="last-ticketing__top"><span class="last-ticketing__brand">QUEUING</span><span>LAST · CANCEL TICKETING</span></header>
          <div class="last-ticketing__shell">
            <div class="last-ticketing__stage">
              <section class="last-ticketing__hero last-ticketing__hero--compact">
                <div class="last-ticketing__ticket">💳</div>
                <div><p class="last-ticketing__eyebrow">SECRET LINK · PAYMENT</p><h1>취소표 결제</h1><p>${escapeHtml(eventName)}<br/>${escapeHtml(data.sessionDate)} · ${escapeHtml(data.sessionTime)}</p></div>
              </section>
              <section class="last-ticketing__content last-ticketing__payment-grid">
                <div class="last-ticketing__payment-card">
                  <div class="last-ticketing__payment-feedback" data-last-payment-feedback role="alert"></div>
                  <h2>예매자 정보</h2>
                  <label>이름<input data-last-buyer-name value="${escapeHtml(currentUser.name || '')}" maxlength="50" /></label>
                  <label>이메일<input value="${escapeHtml(currentUser.email || data.userId || '')}" readonly /></label>
                  <label>휴대폰 번호<input data-last-buyer-phone value="${escapeHtml(currentUser.phone || '')}" placeholder="010-1234-5678" maxlength="13" /></label>
                  <h2 class="last-ticketing__subheading">결제수단</h2>
                  <label class="last-ticketing__payment-option"><input type="radio" name="last-payment" value="card" checked /><span>카드 결제</span><small>즉시 결제</small></label>
                  <label class="last-ticketing__payment-option"><input type="radio" name="last-payment" value="easy" /><span>간편결제</span><small>등록된 간편결제 수단</small></label>
                  <label class="last-ticketing__agree"><input type="checkbox" data-last-agree /> 취소·환불 규정과 결제 진행에 동의합니다.</label>
                </div>
                <aside class="last-ticketing__order-card">
                  <p class="last-ticketing__eyebrow">ORDER SUMMARY</p>
                  <h2>${escapeHtml(eventName)}</h2>
                  <dl><div><dt>공연 회차</dt><dd>${escapeHtml(data.sessionDate)} ${escapeHtml(data.sessionTime)}</dd></div><div><dt>선택 좌석</dt><dd>${escapeHtml(seatLabel)}</dd></div><div><dt>예매 매수</dt><dd>1매</dd></div></dl>
                  <div class="last-ticketing__total"><span>최종 결제금액</span><b>${formatPrice(price)}</b></div>
                  <button type="button" class="last-ticketing__primary last-ticketing__pay-button" data-last-pay-confirm>결제 완료</button>
                </aside>
              </section>
              <footer class="last-ticketing__foot">결제 전에는 오른쪽 단계의 “좌석 선택”을 눌러 선점 좌석을 해제하고 다시 고를 수 있습니다.</footer>
            </div>
            ${railMarkup(data, 'payment')}
          </div>
        </main>`;

      paintTimer(new Date(data.expiresAt).getTime());

      const lastPhoneInput = container.querySelector('[data-last-buyer-phone]');
      lastPhoneInput?.addEventListener('input', () => {
        const pos = lastPhoneInput.selectionStart;
        const before = lastPhoneInput.value.length;
        lastPhoneInput.value = formatPhone(lastPhoneInput.value);
        const diff = lastPhoneInput.value.length - before;
        lastPhoneInput.setSelectionRange(Math.max(0, pos + diff), Math.max(0, pos + diff));
      });

      container.querySelector('[data-last-return-seat]')?.addEventListener('click', () => releaseHeldSelection(data, event));

      container.querySelector('[data-last-pay-confirm]')?.addEventListener('click', async (eventClick) => {
        const button = eventClick.currentTarget;
        const feedback = container.querySelector('[data-last-payment-feedback]');
        const agreed = container.querySelector('[data-last-agree]')?.checked;
        if (!agreed) {
          if (feedback) feedback.textContent = '결제 진행 동의에 체크한 뒤 결제 완료를 눌러주세요.';
          const agree = container.querySelector('[data-last-agree]');
          agree?.focus();
          return;
        }
        button.disabled = true;
        button.textContent = '결제를 완료하는 중...';
        const paymentMethod = container.querySelector('input[name="last-payment"]:checked')?.value || 'card';
        const result = await requestLast('/last-simulation/confirm', authToken, {
          method: 'POST',
          body: JSON.stringify({
            userId: data.userId,
            eventId: data.eventId,
            seatId: selectedSeat.id,
            allocationId: data.allocationId,
            sessionDate: data.sessionDate,
            sessionTime: data.sessionTime,
            paymentMethod,
            linkToken: rawToken,
          }),
        });
        if (!result.ok || !result.data.success) {
          button.disabled = false;
          button.textContent = '결제 완료';
          const message = result.data?.message || '결제 확정에 실패했습니다.';
          if (feedback) feedback.textContent = message;
          return;
        }
        completed = true;
        serverHeldSeatId = '';
        if (countdown) clearInterval(countdown);
        addBooking({
          bookingId: `LAST-${data.allocationId}-${Date.now()}`,
          concertId: data.eventId,
          session: { date: data.sessionDate || '', time: data.sessionTime || '' },
          zone: { id: selectedSeat.section || '일반', label: `${selectedSeat.section || '일반'}구역` },
          seat: {
            id: selectedSeat.id,
            section: selectedSeat.section || '일반',
            grade: selectedSeat.grade || selectedSeat.section || '일반',
            gradeName: `${selectedSeat.section || '일반'}구역`,
            seatNum: selectedSeat.seatNum || 0,
          },
          price,
          status: 'confirmed',
          source: 'cancel',
          paymentMethod,
          paidAt: Date.now(),
        });
        await loadCancelQueuesFromServer().catch(() => {});
        renderCompleted(eventName, result.data.emailSent);
      });
    }

    function renderCompleted(eventName, emailSent) {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      container.innerHTML = `
        <style>${lastTicketingStyles()}</style>
        <main class="last-ticketing last-ticketing--state">
          <div class="last-ticketing__ticket">✅</div>
          <h1>취소표 예매가 완료되었습니다</h1>
          <p>${escapeHtml(eventName)} 예매가 확정되었습니다.<br/>${emailSent ? '예매 완료 안내 메일도 발송했습니다.' : ''}<br/>이 창을 닫으셔도 됩니다.</p>
        </main>`;
    }

    async function passToNextCandidate(data) {
      const result = await requestLast('/last-simulation/pass', authToken, {
        method: 'POST',
        body: JSON.stringify({
          userId: data.userId,
          eventId: data.eventId,
          allocationId: data.allocationId,
          sessionDate: data.sessionDate,
          sessionTime: data.sessionTime,
          linkToken: rawToken,
        }),
      });
      if (!result.ok || !result.data.success) {
        const notice = container.querySelector('[data-last-notice]');
        if (notice) notice.innerHTML = `<b>${escapeHtml(result.data?.message || '순번을 넘기지 못했습니다. 잠시 후 다시 시도해주세요.')}</b>`;
        return false;
      }
      completed = true;
      if (countdown) clearInterval(countdown);
      if (pollTimer) clearInterval(pollTimer);
      await loadCancelQueuesFromServer().catch(() => {});
      navigate('');
      return true;
    }

    async function renderValid(data, event) {
      verified = data;
      authToken = data.accessToken || '';
      const deadline = new Date(data.expiresAt).getTime();
      const pool = data.pool || [];
      const isLocalLink = data.mode === 'local';
      const eventForMap = event || { eventId: data.eventId, eventName: data.eventId };
      let realSeats = [];
      try {
        const params = new URLSearchParams({ eventId: data.eventId });
        if (data.sessionDate) params.set('sessionDate', data.sessionDate);
        if (data.sessionTime) params.set('sessionTime', data.sessionTime);
        const seatsResponse = await fetch(`/seats?${params.toString()}`);
        const seatsData = await seatsResponse.json().catch(() => ({}));
        realSeats = Array.isArray(seatsData.seats) ? seatsData.seats : [];
      } catch (_) {
        realSeats = [];
      }
      if (!realSeats.length) {
        // 좌석 API가 일시적으로 응답하지 않아도 링크 응답의 풀 좌석으로
        // 최소 화면을 만들 수 있다. 정상 경로에서는 전체 회차 좌석을 사용한다.
        realSeats = pool.map((seat) => ({
          seatId: seat.seatId,
          section: seat.section,
          status: seat.status,
          price: seat.price,
        }));
      }
      mapData = buildLastMapData(eventForMap, realSeats, pool, {
        canSelect: isLocalLink || data.sequenceNo === data.currentSequenceNo,
        assignedSeatId: isLocalLink ? String(data.seatId || '') : '',
      });

      // 이전에 결제 화면을 열어 둔 상태로 새로 고침한 경우에는 실제 Redis
      // 선점이 살아 있을 때만 결제 단계로 복구한다. stale seat_id는 API에서
      // 이미 제거되어 여기까지 내려오지 않는다.
      if (data.heldSeatId) {
        selectedSeat = mapData.seats.find((seat) => seat.id === String(data.heldSeatId)) || null;
        serverHeldSeatId = selectedSeat?.id || '';
        if (selectedSeat) {
          selectedSeat.status = 'mine';
          renderPaymentStep(data, event);
          return;
        }
      }
      serverHeldSeatId = '';
      selectedSeat = null;
      container.innerHTML = `
        <style>${lastTicketingStyles()}</style>
        <main class="last-ticketing">
          <header class="last-ticketing__top"><span class="last-ticketing__brand">QUEUING</span><span>LAST · CANCEL TICKETING</span></header>
          <div class="last-ticketing__shell">
            <div class="last-ticketing__stage">
              <section class="last-ticketing__hero">
                <div class="last-ticketing__ticket">🎟️</div>
                <div><p class="last-ticketing__eyebrow">SECRET LINK · SEQUENCE ${data.sequenceNo || '-'}</p><h1>취소표 예매</h1><p>${escapeHtml(event?.eventName || data.eventId)}<br/>${escapeHtml(data.sessionDate)} · ${escapeHtml(data.sessionTime)}</p></div>
              </section>
              <section class="last-ticketing__notice" data-last-notice>현재 순번을 확인하는 중입니다.</section>
              <section class="last-ticketing__content">
                <div class="last-ticketing__meta"><span>회차</span><b>${escapeHtml(data.sessionDate)} ${escapeHtml(data.sessionTime)}</b><span>취소표 풀</span><b>${isLocalLink ? '배정 1석' : `${pool.length}석`}</b><span>제한</span><b>1인 1매 · 5분</b></div>
                <div class="last-ticketing__map-wrap"><div class="last-ticketing__section-title">실시간 취소표 좌석 배치도</div><div class="last-ticketing__map" data-last-seatmap></div></div>
                <section class="last-ticketing__selection" data-last-selection hidden>
                  <div><small>선택한 좌석</small><strong data-last-selection-label>-</strong></div>
                  <b data-last-selection-price>-</b>
                  <div class="last-ticketing__selection-actions"><button type="button" class="last-ticketing__secondary" data-last-clear-selection>선택 해제</button><button type="button" class="last-ticketing__primary" data-last-confirm-seat>좌석 확정 후 결제</button></div>
                </section>
              </section>
              <footer class="last-ticketing__foot">좌석을 선택한 뒤 <b>좌석 확정 후 결제</b>를 누르면 실제로 선점됩니다.<br/><button type="button" class="last-ticketing__pass" data-last-pass>좌석 선택을 포기하고 다음 순번에게 넘기기</button></footer>
            </div>
            ${railMarkup(data, 'seat')}
          </div>
        </main>`;

      const canSelectNow = isLocalLink || data.sequenceNo === data.currentSequenceNo;
      const notice = container.querySelector('[data-last-notice]');
      if (notice) notice.innerHTML = isLocalLink
        ? '<b>회원님에게 배정된 좌석만 선택할 수 있습니다.</b> 좌석 선점 후 결제를 완료해주세요.'
        : canSelectNow
          ? '<b>현재 순번입니다.</b> 취소표 풀에서 좌석 1개를 선택해주세요.'
          : `현재 <b>${data.currentSequenceNo || '-'}번째</b> 사용자가 좌석을 처리 중입니다. 순번이 되면 선택할 수 있습니다.`;
      paintTimer(deadline);

      mapData.seats.forEach((seat) => {
        seat.selectable = isLocalLink
          ? seat.id === String(data.seatId || '') && seat.status === 'available'
          : canSelectNow && seat.selectable;
      });

      const updateSelectionPanel = () => {
        const panel = container.querySelector('[data-last-selection]');
        if (!panel) return;
        if (!selectedSeat) {
          panel.hidden = true;
          return;
        }
        panel.hidden = false;
        const label = `${selectedSeat.section || '일반'}구역 ${bareSeatId(selectedSeat.id)}`;
        panel.querySelector('[data-last-selection-label]').textContent = label;
        panel.querySelector('[data-last-selection-price]').textContent = formatPrice(Number(selectedSeat.price || 0));
      };
      seatMapApi = mountSeatMap(container.querySelector('[data-last-seatmap]'), {
        sections: mapData.sections, seats: mapData.seats,
        onSeatClick: (seatId) => {
          const seat = mapData.seats.find((item) => item.id === seatId);
          if (!seat || !seat.selectable) {
            const text = isLocalLink
              ? 'Secret Link로 배정된 좌석만 선택할 수 있습니다.'
              : canSelectNow ? '취소표 풀에 포함된 AVAILABLE 좌석만 선택할 수 있습니다.' : '현재 순번이 되면 좌석을 선택할 수 있습니다.';
            container.querySelector('[data-last-notice]').innerHTML = `<b>${text}</b>`;
            return;
          }
          if (selectedSeat?.id === seat.id) {
            restoreClientSelection(data, isLocalLink, canSelectNow);
            updateSelectionPanel();
            return;
          }
          restoreClientSelection(data, isLocalLink, canSelectNow);
          selectedSeat = seat;
          seat.status = 'mine';
          seat.selectable = false;
          seatMapApi.updateStatuses(mapData.seats);
          updateSelectionPanel();
          container.querySelector('[data-last-notice]').innerHTML = '<b>좌석을 선택했습니다.</b> 다른 좌석을 고르거나, “좌석 확정 후 결제”를 눌러주세요.';
        },
        cancelMode: true,
        selectionOnly: isLocalLink,
        venue: event?.venue,
      });
      container.querySelector('[data-last-clear-selection]')?.addEventListener('click', () => {
        restoreClientSelection(data, isLocalLink, canSelectNow);
        updateSelectionPanel();
        container.querySelector('[data-last-notice]').innerHTML = '<b>좌석 선택을 해제했습니다.</b> 원하는 좌석을 다시 선택해주세요.';
      });
      container.querySelector('[data-last-confirm-seat]')?.addEventListener('click', async (eventClick) => {
        if (!selectedSeat) return;
        const button = eventClick.currentTarget;
        button.disabled = true;
        button.textContent = '좌석을 확정하는 중...';
        const result = await requestLast('/last-simulation/hold', authToken, {
          method: 'POST',
          body: JSON.stringify({ userId: data.userId, eventId: data.eventId, seatId: selectedSeat.id, allocationId: data.allocationId, sessionDate: data.sessionDate, sessionTime: data.sessionTime, linkToken: rawToken }),
        });
        if (!result.ok || !result.data.success) {
          button.disabled = false;
          button.textContent = '좌석 확정 후 결제';
          container.querySelector('[data-last-notice]').innerHTML = `<b>${escapeHtml(result.data?.message || '좌석 선점에 실패했습니다.')}</b>`;
          restoreClientSelection(data, isLocalLink, canSelectNow);
          updateSelectionPanel();
          loadPool();
          return;
        }
        serverHeldSeatId = selectedSeat.id;
        selectedSeat.status = 'mine';
        renderPaymentStep(data, event);
      });
      container.querySelector('[data-last-pass]')?.addEventListener('click', async (eventClick) => {
        if (!window.confirm('현재 취소표 순번을 포기하고 다음 사용자에게 넘기시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;
        const button = eventClick.currentTarget;
        button.disabled = true;
        button.textContent = '순번을 넘기는 중...';
        const passed = await passToNextCandidate(data);
        if (!passed && !destroyed) {
          button.disabled = false;
          button.textContent = '좌석 선택을 포기하고 다음 순번에게 넘기기';
        }
      });
      pollTimer = setInterval(loadPool, 2000);
    }

    if (!rawToken) {
      renderState('유효하지 않은 링크', '취소표 Secret Link가 없습니다.');
      return cleanup;
    }
    container.innerHTML = `<style>${lastTicketingStyles()}</style><main class="last-ticketing last-ticketing--state"><div class="last-ticketing__ticket">🔐</div><h1>링크 확인 중</h1><p>취소표 예매 권한과 회차 정보를 확인하고 있습니다.</p></main>`;
    fetch('/last-simulation/verify-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: rawToken }) })
      .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ({})) }))
      .then(async ({ ok, data }) => {
        if (!ok || !data.valid) { renderState('입장 시간이 만료되었습니다', data.message || '취소표 링크가 유효하지 않거나 만료되었습니다.', '취소표 대기열로'); container.querySelector('[data-last-home]')?.addEventListener('click', () => navigate('mypage/cancel-queue')); return; }
        const eventData = await fetch('/events').then((res) => res.json()).catch(() => ({}));
        const event = (eventData.events || []).find((item) => item.eventId === data.eventId);
        if (!destroyed) renderValid(data, event);
      })
      .catch(() => renderState('오류 발생', '취소표 링크 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'));

    return cleanup;
  },
};

// B파트 Secret Link 화면도 같은 시각 언어를 재사용한다. API와 상태 전이는
// 각 페이지에 분리해 Last 로컬 시뮬레이션과 B Lambda 흐름이 섞이지 않게 한다.
export function lastTicketingStyles() {
  return `
    .last-ticketing{min-height:100vh;background:#0b0f16;color:#f4f6fb;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;padding-bottom:34px}
    .last-ticketing__top{height:64px;background:#121a25;border-bottom:1px solid #273346;display:flex;align-items:center;gap:22px;padding:0 clamp(18px,5vw,72px);font-size:11px;letter-spacing:.16em;color:#9aa9be}.last-ticketing__brand{color:#fff;font-weight:900;font-size:15px}.last-ticketing__timer{height:4px;background:#222d3d}.last-ticketing__timer i{display:block;height:100%;background:#ef5570;transition:width .3s;width:100%}.last-ticketing__hero,.last-ticketing__content,.last-ticketing__notice,.last-ticketing__foot{width:min(1080px,calc(100% - 36px));margin-left:auto;margin-right:auto}.last-ticketing__hero{display:flex;gap:22px;align-items:center;padding:46px 0 28px}.last-ticketing__hero--compact{padding-bottom:18px}.last-ticketing__ticket{font-size:34px}.last-ticketing__eyebrow{color:#e95773;font-size:11px;letter-spacing:.14em;font-weight:800}.last-ticketing h1{font-size:32px;margin:8px 0}.last-ticketing h2{font-size:18px;margin:0 0 16px}.last-ticketing__hero p:not(.last-ticketing__eyebrow){color:#9aa9be;line-height:1.7;margin:0}.last-ticketing__notice{border:1px solid #31506a;background:#101d2a;color:#b8d7ef;border-radius:10px;padding:15px 18px;font-size:14px}.last-ticketing__notice--error{border-color:#8e3444;background:#29131a;color:#ffd3da;margin-bottom:18px}.last-ticketing__notice b{color:#fff}.last-ticketing__content{margin-top:18px}.last-ticketing__meta{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;padding:17px;border:1px solid #273346;background:#111823;border-radius:10px;color:#8fa0b5;font-size:12px}.last-ticketing__meta b{color:#f4f6fb;font-size:14px}.last-ticketing__section-title{font-size:16px;font-weight:800;margin-bottom:12px}.last-ticketing__map-wrap{margin-top:18px;border:1px solid #273346;background:#111823;border-radius:10px;padding:18px}.last-ticketing__map{min-height:420px;background:#0b1018;border-radius:8px;padding:12px;overflow:auto}.last-ticketing__selection{margin-top:14px;border:1px solid #326d55;background:#10231d;border-radius:10px;padding:16px;display:flex;align-items:center;gap:18px}.last-ticketing__selection[hidden]{display:none}.last-ticketing__selection small{display:block;color:#8fa0b5;margin-bottom:5px}.last-ticketing__selection strong{font-size:16px}.last-ticketing__selection>b{margin-left:auto;color:#55d69a;font-size:19px}.last-ticketing__selection button,.last-ticketing__primary{border:0;background:#ef334b;color:#fff;border-radius:7px;padding:12px 18px;font-weight:800;cursor:pointer}.last-ticketing__selection button:disabled,.last-ticketing__primary:disabled{opacity:.55;cursor:wait}.last-ticketing__foot{text-align:center;color:#718097;font-size:12px;padding:22px 0}.last-ticketing__pass{display:inline-flex;align-items:center;justify-content:center;min-height:42px;margin-top:14px;border:1px solid #58677b;border-radius:7px;background:#172231;color:#edf2f8;text-decoration:none;box-shadow:0 8px 20px rgba(0,0,0,.18);padding:0 18px;cursor:pointer;font-size:13px;font-weight:800;transition:background .16s,border-color .16s,transform .16s}.last-ticketing__pass:hover{background:#223348;border-color:#aab8c8;transform:translateY(-1px)}.last-ticketing__pass:disabled{opacity:.55;cursor:wait;transform:none}.last-ticketing__payment-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.8fr);gap:18px;align-items:start}.last-ticketing__payment-card,.last-ticketing__order-card{border:1px solid #273346;background:#111823;border-radius:12px;padding:24px}.last-ticketing__payment-card label:not(.last-ticketing__payment-option):not(.last-ticketing__agree){display:block;color:#b7c4d5;font-size:13px;margin-bottom:14px}.last-ticketing__payment-card input:not([type="radio"]):not([type="checkbox"]){box-sizing:border-box;width:100%;margin-top:7px;border:1px solid #344256;border-radius:7px;background:#0b1018;color:#f4f6fb;padding:12px;font-size:14px}.last-ticketing__subheading{border-top:1px solid #293545;padding-top:22px;margin-top:22px!important}.last-ticketing__payment-option{display:grid;grid-template-columns:20px 1fr auto;gap:8px;align-items:center;border:1px solid #344256;border-radius:8px;padding:13px 14px;margin:10px 0;cursor:pointer}.last-ticketing__payment-option span{font-size:14px;font-weight:700}.last-ticketing__payment-option small{color:#8fa0b5}.last-ticketing__agree{display:block;color:#b7c4d5;font-size:12px;margin-top:20px}.last-ticketing__order-card{position:sticky;top:18px}.last-ticketing__order-card h2{line-height:1.45}.last-ticketing__order-card dl{margin:20px 0}.last-ticketing__order-card dl div{display:flex;justify-content:space-between;gap:18px;border-top:1px solid #293545;padding:12px 0;color:#8fa0b5;font-size:13px}.last-ticketing__order-card dt,.last-ticketing__order-card dd{margin:0}.last-ticketing__order-card dd{color:#f4f6fb;text-align:right}.last-ticketing__total{border-top:1px solid #46566b;padding:18px 0;display:flex;align-items:end;justify-content:space-between;color:#d2dae5;font-weight:700}.last-ticketing__total b{color:#ff637d;font-size:24px}.last-ticketing__pay-button{width:100%;font-size:15px}.last-ticketing__state-actions{display:flex;gap:10px;margin-top:20px;width:min(420px,100%)}.last-ticketing__state-actions button{flex:1;min-height:48px;margin-top:0!important}.last-ticketing__secondary{border:1px solid #445269;background:transparent;color:#e5ebf4;border-radius:7px;padding:12px 18px;font-weight:800;cursor:pointer}.last-ticketing--state{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 18px}.last-ticketing--state p{color:#9aa9be;line-height:1.8}.last-ticketing--state .last-ticketing__primary{margin-top:20px}
    .last-ticketing__shell{width:min(1280px,calc(100% - 36px));margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) 245px;gap:26px;align-items:start}.last-ticketing__stage{min-width:0}.last-ticketing__shell .last-ticketing__hero,.last-ticketing__shell .last-ticketing__content,.last-ticketing__shell .last-ticketing__notice,.last-ticketing__shell .last-ticketing__foot{width:100%;margin-left:0;margin-right:0}.last-ticketing__rail{position:sticky;top:18px;display:grid;gap:12px;padding-top:38px}.last-ticketing__timer-card,.last-ticketing__segments,.last-ticketing__rail-note{border:1px solid #2b3a4f;background:linear-gradient(145deg,rgba(25,36,52,.92),rgba(12,18,28,.92));box-shadow:0 12px 30px rgba(0,0,0,.22);border-radius:12px}.last-ticketing__timer-card{padding:17px}.last-ticketing__timer-card>span{display:block;color:#95a5ba;font-size:10px;font-weight:800;letter-spacing:.12em}.last-ticketing__timer-card strong{display:block;margin:8px 0 13px;color:#ff6680;font:800 30px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em}.last-ticketing__timer-card .last-ticketing__timer{height:6px;border-radius:999px;overflow:hidden}.last-ticketing__timer-card small{display:block;margin-top:10px;color:#8190a5;font-size:11px;line-height:1.5}.last-ticketing__segments{overflow:hidden}.last-ticketing__segment{box-sizing:border-box;width:100%;min-height:72px;border:0;border-bottom:1px solid #27364a;background:transparent;color:#8493a8;text-align:left;padding:13px 15px;display:grid;grid-template-columns:30px 1fr;column-gap:8px;align-items:center}.last-ticketing__segment:last-child{border-bottom:0}.last-ticketing__segment b{grid-row:span 2;color:#65758b;font-size:11px;letter-spacing:.08em}.last-ticketing__segment span{color:#d8e0eb;font-weight:800;font-size:13px}.last-ticketing__segment small{color:#74849a;font-size:10px;margin-top:3px}.last-ticketing__segment.is-active{background:linear-gradient(90deg,rgba(239,51,75,.16),rgba(239,51,75,.03));box-shadow:inset 3px 0 #ef334b}.last-ticketing__segment.is-active b,.last-ticketing__segment.is-active span{color:#fff}.last-ticketing__segment.is-complete{cursor:pointer}.last-ticketing__segment.is-complete:hover{background:#172336}.last-ticketing__rail-note{margin:0;padding:13px;color:#8fa0b5;font-size:11px;line-height:1.6}.last-ticketing__selection-actions{display:flex;gap:8px;margin-left:auto}.last-ticketing__selection-actions .last-ticketing__secondary{padding:11px 14px}.last-ticketing__payment-grid .last-ticketing__order-card{position:static}.last-ticketing__payment-feedback{min-height:0;color:#ffb3c0;font-size:12px;line-height:1.5}.last-ticketing__payment-feedback:not(:empty){margin-bottom:15px;padding:10px 12px;border:1px solid #8e3444;border-radius:7px;background:#29131a}
    .last-ticketing button:focus-visible,.last-ticketing input:focus-visible{outline:3px solid rgba(99,179,237,.85);outline-offset:3px}.last-ticketing__primary:hover{filter:brightness(1.08)}.last-ticketing__primary:active{transform:translateY(1px)}.last-ticketing__primary:disabled{filter:none;transform:none}
    @media(max-width:980px){.last-ticketing__shell{grid-template-columns:1fr}.last-ticketing__rail{position:static;padding-top:18px;order:-1}.last-ticketing__segments{display:grid;grid-template-columns:1fr 1fr}.last-ticketing__segment{border-bottom:0;border-right:1px solid #27364a}.last-ticketing__segment:last-child{border-right:0}.last-ticketing__rail-note{display:none}}@media(max-width:700px){.last-ticketing__meta{grid-template-columns:repeat(2,1fr)}.last-ticketing__hero{padding-top:30px}.last-ticketing h1{font-size:25px}.last-ticketing__selection{flex-wrap:wrap}.last-ticketing__selection>b{margin-left:0}.last-ticketing__selection-actions{width:100%;margin-left:0}.last-ticketing__selection-actions button{flex:1}.last-ticketing__payment-grid{grid-template-columns:1fr}.last-ticketing__order-card{position:static}.last-ticketing__state-actions{flex-direction:column}.last-ticketing__state-actions button{width:100%}}
  `;
}
