// B파트 Secret Link 전용 화면.
// Last 시뮬레이션의 좌석 선택 UI를 재사용하며, 좌석 선택·결제·완료를 모두
// 이 화면 안에서 인라인으로 처리한다. 공용 payment.js로 이동하지 않으므로
// scoped JWT가 일반 API(wishlist, membership 등)를 호출하는 문제가 없다.
// 상태 전이는 A의 B 콜백 프록시(/cancel-queue/hold, /cancel-queue/expire,
// /seats/confirm)를 사용하며, 순번 넘기기와 만료는 B Lambda 흐름이 이어진다.
import { navigate } from '../router.js';
import { mountSeatMap } from '../components/seatMap.js';
import { getState, login, addBooking, loadCancelQueuesFromServer } from '../state/store.js';
import {
  expireCancelAllocation,
  fetchCancelQueueStatus,
  holdCancelSeat,
  releaseSeatApi,
} from '../utils/backendApi.js';
import { fetchWithRecaptcha } from '../utils/recaptcha.js';
import { bareSeatId, buildCancelSeatMapData } from '../utils/cancelSeatMap.js';
import { formatPrice } from '../utils/format.js';
import { lastTicketingStyles } from './lastCancelTicketing.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, d.length === 10 ? 6 : 7)}-${d.slice(d.length === 10 ? 6 : 7)}`;
}

function railMarkup(activeStep = 'seat') {
  const seatActive = activeStep === 'seat';
  const paymentActive = activeStep === 'payment';
  return `
    <aside class="last-ticketing__rail" aria-label="취소표 예매 진행 단계">
      <section class="last-ticketing__timer-card">
        <span>SECRET LINK 제한시간</span>
        <strong data-b-timer>05:00</strong>
        <div class="last-ticketing__timer"><i data-b-timer-bar></i></div>
        <small>시간 안에 결제를 완료해주세요.</small>
      </section>
      <nav class="last-ticketing__segments" aria-label="예매 단계">
        ${paymentActive
          ? '<button type="button" class="last-ticketing__segment is-complete" data-b-return-seat><b>01</b><span>좌석 선택</span><small>좌석 다시 고르기</small></button>'
          : `<div class="last-ticketing__segment ${seatActive ? 'is-active' : ''}"><b>01</b><span>좌석 선택</span><small>좌석 선택 후 확정</small></div>`}
        <div class="last-ticketing__segment ${paymentActive ? 'is-active' : ''}"><b>02</b><span>결제</span><small>결제 완료</small></div>
      </nav>
      <p class="last-ticketing__rail-note">선택한 좌석은 "좌석 확정 후 결제"를 누른 뒤에만 실제로 선점됩니다.</p>
    </aside>`;
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

export const bCancelTicketingPage = {
  render(container, params, query) {
    const eventId = params.id;
    const rawToken = query?.token || query?.linkToken || '';
    const querySessionDate = query?.sessionDate || '';
    const querySessionTime = query?.sessionTime || '';
    let destroyed = false;

    let countdown = null;
    let seatMapApi = null;
    let allocation = null;
    let selectedSeat = null;
    let heldSeatId = '';
    let completed = false;
    let terminal = false;
    let expiryRequested = false;

    const stopTimer = () => {
      if (countdown) clearInterval(countdown);
      countdown = null;
    };

    function renderState(icon, title, body, actionLabel = '취소표 대기열로', actionPath = 'mypage/cancel-queue') {
      stopTimer();
      seatMapApi?.destroy();
      seatMapApi = null;
      container.innerHTML = `
        <style>${lastTicketingStyles()}</style>
        <main class="last-ticketing last-ticketing--state" aria-live="polite">
          <div class="last-ticketing__ticket" aria-hidden="true">${icon}</div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(body)}</p>
          ${actionLabel ? `<button type="button" class="last-ticketing__primary" data-b-state-action>${escapeHtml(actionLabel)}</button>` : ''}
        </main>`;
      if (actionLabel) {
        container.querySelector('[data-b-state-action]')?.addEventListener('click', () => navigate(actionPath));
      }
    }

    async function ensureBSession() {
      const currentUser = getState().user;
      if (currentUser?.userId && !rawToken) return null;
      if (!rawToken) throw new Error('취소표 Secret Link 토큰이 없습니다.');

      const response = await fetch('/verify-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: rawToken }),
      });
      const data = await readJson(response);
      if (!response.ok || !data.valid) {
        const error = new Error(data.message || '취소표 링크가 유효하지 않거나 만료되었습니다.');
        error.status = response.status;
        throw error;
      }
      login({
        name: (data.userId || '').split('@')[0] || '취소표 사용자',
        email: data.userId,
        userId: data.userId,
        role: 'USER',
        accessToken: data.accessToken || '',
      });
      return data;
    }

    async function expireAndPass(reason = 'manual') {
      if (terminal || !allocation) return false;
      const userId = getState().user?.userId || getState().user?.email;
      if (!userId) return false;
      const result = await expireCancelAllocation(
        userId,
        eventId,
        heldSeatId || allocation.seatId || null,
        {
          allocationId: allocation.allocationId || allocation.id,
          sessionDate: allocation.sessionDate || querySessionDate,
          sessionTime: allocation.sessionTime || querySessionTime,
          reason,
        },
      );
      if (!result.ok || !result.data?.success) {
        if (reason === 'timeout') {
          renderState('⚠️', '만료 처리를 확인해주세요', result.data?.message || '만료 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.');
        }
        return false;
      }
      terminal = true;
      heldSeatId = '';
      renderState(
        reason === 'timeout' ? '⌛' : '↪️',
        reason === 'timeout' ? '입장 시간이 만료되었습니다' : '다음 순번에게 기회를 넘겼습니다',
        reason === 'timeout'
          ? 'Secret Link 사용 시간이 종료되어 다음 대기자에게 기회가 넘어갑니다.'
          : '이 창을 닫으셔도 됩니다.',
        reason === 'timeout' ? '취소표 대기열로' : '',
      );
      return true;
    }

    function paintTimer(expiresAt) {
      stopTimer();
      const deadline = new Date(expiresAt).getTime();
      const fullDuration = 5 * 60 * 1000;
      const tick = () => {
        if (destroyed || terminal || completed) return;
        const remaining = Math.max(0, deadline - Date.now());
        const timer = container.querySelector('[data-b-timer]');
        const bar = container.querySelector('[data-b-timer-bar]');
        if (timer) timer.textContent = `${String(Math.floor(remaining / 60000)).padStart(2, '0')}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}`;
        if (bar) bar.style.width = `${Math.min(100, (remaining / fullDuration) * 100)}%`;
        if (remaining <= 0 && !expiryRequested) {
          expiryRequested = true;
          stopTimer();
          expireAndPass('timeout').catch(() => {
            if (!destroyed) renderState('⚠️', '만료 처리를 확인해주세요', '네트워크 오류로 만료 상태를 확인하지 못했습니다. 취소표 대기열에서 상태를 확인해주세요.');
          });
        }
      };
      countdown = setInterval(tick, 1000);
      tick();
    }

    function toOrderSeat(seat) {
      return {
        id: seat.id,
        seatId: seat.id,
        section: seat.section || '일반',
        grade: seat.grade || seat.section || 'A',
        gradeName: `${seat.section || '일반'}석`,
        seatNum: seat.seatNum || null,
        price: Number(seat.price || 0),
        label: `${seat.section || '일반'}석 ${bareSeatId(seat.id)}`,
      };
    }

    function renderCompleted(eventName, emailSent) {
      stopTimer();
      container.innerHTML = `
        <style>${lastTicketingStyles()}</style>
        <main class="last-ticketing last-ticketing--state">
          <div class="last-ticketing__ticket">✅</div>
          <h1>취소표 예매가 완료되었습니다</h1>
          <p>${escapeHtml(eventName)} 예매가 확정되었습니다.<br/>${emailSent ? '예매 완료 안내 메일도 발송했습니다.' : ''}<br/>이 창을 닫으셔도 됩니다.</p>
        </main>`;
    }

    function renderPaymentStep(event, userId) {
      if (!selectedSeat) return;
      seatMapApi?.destroy();
      seatMapApi = null;
      const currentUser = getState().user || {};
      const eventName = event?.eventName || eventId;
      const seatLabel = `${selectedSeat.section || '일반'}구역 ${bareSeatId(selectedSeat.id)}`;
      const price = Number(selectedSeat.price || 0);
      const sessionDate = allocation.sessionDate || querySessionDate;
      const sessionTime = allocation.sessionTime || querySessionTime;

      container.innerHTML = `
        <style>${lastTicketingStyles()}</style>
        <main class="last-ticketing">
          <header class="last-ticketing__top"><span class="last-ticketing__brand">QUEUING</span></header>
          <div class="last-ticketing__shell">
            <div class="last-ticketing__stage">
              <section class="last-ticketing__hero last-ticketing__hero--compact">
                <div class="last-ticketing__ticket">💳</div>
                <div><p class="last-ticketing__eyebrow">SECRET LINK · PAYMENT</p><h1>취소표 결제</h1><p>${escapeHtml(eventName)}<br/>${escapeHtml(sessionDate)} · ${escapeHtml(sessionTime)}</p></div>
              </section>
              <section class="last-ticketing__content last-ticketing__payment-grid">
                <div class="last-ticketing__payment-card">
                  <div class="last-ticketing__payment-feedback" data-b-payment-feedback role="alert"></div>
                  <h2>예매자 정보</h2>
                  <label>이름<input data-b-buyer-name value="${escapeHtml(currentUser.name || '')}" maxlength="50" /></label>
                  <label>이메일<input value="${escapeHtml(currentUser.email || userId || '')}" readonly /></label>
                  <label>휴대폰 번호<input data-b-buyer-phone value="${escapeHtml(currentUser.phone || '')}" placeholder="010-1234-5678" maxlength="13" /></label>
                  <h2 class="last-ticketing__subheading">결제수단</h2>
                  <label class="last-ticketing__payment-option"><input type="radio" name="b-payment" value="card" checked /><span>카드 결제</span><small>즉시 결제</small></label>
                  <label class="last-ticketing__payment-option"><input type="radio" name="b-payment" value="easy" /><span>간편결제</span><small>등록된 간편결제 수단</small></label>
                  <label class="last-ticketing__agree"><input type="checkbox" data-b-agree /> 취소·환불 규정과 결제 진행에 동의합니다.</label>
                </div>
                <aside class="last-ticketing__order-card">
                  <p class="last-ticketing__eyebrow">ORDER SUMMARY</p>
                  <h2>${escapeHtml(eventName)}</h2>
                  <dl><div><dt>공연 회차</dt><dd>${escapeHtml(sessionDate)} ${escapeHtml(sessionTime)}</dd></div><div><dt>선택 좌석</dt><dd>${escapeHtml(seatLabel)}</dd></div><div><dt>예매 매수</dt><dd>1매</dd></div></dl>
                  <div class="last-ticketing__total"><span>최종 결제금액</span><b>${formatPrice(price)}</b></div>
                  <button type="button" class="last-ticketing__primary last-ticketing__pay-button" data-b-pay-confirm>결제 완료</button>
                </aside>
              </section>
              <footer class="last-ticketing__foot">결제 전에는 오른쪽 단계의 "좌석 선택"을 눌러 선점 좌석을 해제하고 다시 고를 수 있습니다.<br/><button type="button" class="last-ticketing__pass" data-b-pass>좌석 선택을 포기하고 다음 순번에게 넘기기</button></footer>
            </div>
            ${railMarkup('payment')}
          </div>
        </main>`;

      paintTimer(new Date(allocation.expiresAt).getTime());

      container.querySelector('[data-b-return-seat]')?.addEventListener('click', async () => {
        if (!heldSeatId) return;
        const btn = container.querySelector('[data-b-return-seat]');
        if (btn) { btn.disabled = true; btn.querySelector('span').textContent = '해제 중...'; }
        await releaseSeatApi(userId, heldSeatId, {
          eventId,
          sessionDate: allocation.sessionDate || querySessionDate,
          sessionTime: allocation.sessionTime || querySessionTime,
        }).catch(() => {});
        heldSeatId = '';
        selectedSeat = null;
        load();
      });

      const bPhoneInput = container.querySelector('[data-b-buyer-phone]');
      bPhoneInput?.addEventListener('input', () => {
        const pos = bPhoneInput.selectionStart;
        const before = bPhoneInput.value.length;
        bPhoneInput.value = formatPhone(bPhoneInput.value);
        const diff = bPhoneInput.value.length - before;
        bPhoneInput.setSelectionRange(Math.max(0, pos + diff), Math.max(0, pos + diff));
      });

      container.querySelector('[data-b-pass]')?.addEventListener('click', async (clickEvent) => {
        if (!window.confirm('현재 취소표 순번을 포기하고 다음 사용자에게 넘기시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;
        const button = clickEvent.currentTarget;
        button.disabled = true;
        button.textContent = '순번을 넘기는 중...';
        const passed = await expireAndPass('manual').catch(() => false);
        if (!passed && !destroyed && !terminal) {
          button.disabled = false;
          button.textContent = '좌석 선택을 포기하고 다음 순번에게 넘기기';
        }
      });

      container.querySelector('[data-b-pay-confirm]')?.addEventListener('click', async (clickEvent) => {
        const button = clickEvent.currentTarget;
        const feedback = container.querySelector('[data-b-payment-feedback]');
        const agreed = container.querySelector('[data-b-agree]')?.checked;
        if (!agreed) {
          if (feedback) feedback.textContent = '결제 진행 동의에 체크한 뒤 결제 완료를 눌러주세요.';
          container.querySelector('[data-b-agree]')?.focus();
          return;
        }
        button.disabled = true;
        button.textContent = '결제를 완료하는 중...';
        const paymentMethod = container.querySelector('input[name="b-payment"]:checked')?.value || 'card';
        const { status, data } = await fetchWithRecaptcha('/seats/confirm', {
          userId,
          seatId: selectedSeat.id,
          eventId,
          sessionDate: allocation.sessionDate || querySessionDate,
          sessionTime: allocation.sessionTime || querySessionTime,
          paymentMethod,
        }, 'seat_confirm').catch(() => ({ status: 0, data: {} }));
        if (status < 200 || status >= 300 || !data.success) {
          button.disabled = false;
          button.textContent = '결제 완료';
          const message = data?.message || '결제 확정에 실패했습니다.';
          if (feedback) feedback.textContent = message;
          return;
        }
        completed = true;
        heldSeatId = '';
        stopTimer();
        addBooking({
          bookingId: `B-${allocation.allocationId}-${Date.now()}`,
          concertId: eventId,
          session: { date: allocation.sessionDate || querySessionDate, time: allocation.sessionTime || querySessionTime },
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
        renderCompleted(eventName, data.emailSent);
      });
    }

    async function load() {
      try {
        const verified = await ensureBSession();
        const userId = getState().user?.userId || getState().user?.email || verified?.userId;
        if (!userId) throw new Error('취소표 사용자 정보를 확인할 수 없습니다.');

        const sessionContext = {
          eventId,
          ...(querySessionDate ? { sessionDate: querySessionDate } : {}),
          ...(querySessionTime ? { sessionTime: querySessionTime } : {}),
        };
        const [status, eventsResponse] = await Promise.all([
          fetchCancelQueueStatus(eventId, userId, sessionContext),
          fetch('/events'),
        ]);
        allocation = status.secretLink?.active ? status.secretLink : null;
        if (!allocation) {
          renderState('⌛', '입장 시간이 만료되었습니다', '현재 사용할 수 있는 Secret Link 할당이 없습니다.');
          return;
        }

        const sessionDate = allocation.sessionDate || verified?.sessionDate || querySessionDate;
        const sessionTime = allocation.sessionTime || verified?.sessionTime || querySessionTime;
        allocation = {
          ...allocation,
          allocationId: allocation.allocationId || verified?.allocationId,
          sessionDate,
          sessionTime,
        };
        const eventsData = await readJson(eventsResponse);
        const event = (eventsData.events || []).find((item) => item.eventId === eventId)
          || { eventId, eventName: eventId, venue: '' };
        const seatQuery = new URLSearchParams({ eventId });
        if (sessionDate) seatQuery.set('sessionDate', sessionDate);
        if (sessionTime) seatQuery.set('sessionTime', sessionTime);
        const seatsResponse = await fetch(`/seats?${seatQuery.toString()}`);
        const seatsData = await readJson(seatsResponse);
        if (!seatsResponse.ok) throw new Error(seatsData.message || '좌석 정보를 불러오지 못했습니다.');
        if (destroyed) return;

        const rawSeats = Array.isArray(seatsData.seats) ? seatsData.seats : [];
        const assignedSeatId = String(allocation.seatId || '');
        const mapData = buildCancelSeatMapData(event, rawSeats, assignedSeatId);
        if (!mapData.seats.length) throw new Error('현재 회차의 좌석 배치 정보를 찾을 수 없습니다.');
        mapData.seats.forEach((seat) => {
          seat.keepAvailableVisual = !assignedSeatId && seat.status === 'available';
          seat.selectable = assignedSeatId
            ? seat.id === assignedSeatId && (seat.status === 'available' || seat.status === 'holding')
            : seat.status === 'available';
        });

        const assignedSeat = assignedSeatId ? mapData.seats.find((seat) => seat.id === assignedSeatId) : null;
        if (assignedSeat?.status === 'holding') {
          assignedSeat.status = 'mine';
          assignedSeat.selectable = false;
          selectedSeat = assignedSeat;
          heldSeatId = assignedSeat.id;
        }

        container.innerHTML = `
          <style>${lastTicketingStyles()}</style>
          <main class="last-ticketing">
            <header class="last-ticketing__top"><span class="last-ticketing__brand">QUEUING</span></header>
            <div class="last-ticketing__shell">
              <div class="last-ticketing__stage">
                <section class="last-ticketing__hero">
                  <div class="last-ticketing__ticket" aria-hidden="true">🎟️</div>
                  <div><p class="last-ticketing__eyebrow">SECRET LINK</p><h1>취소표 예매</h1><p>${escapeHtml(event.eventName || eventId)}<br/>${escapeHtml(sessionDate)} · ${escapeHtml(sessionTime)}</p></div>
                </section>
                <section class="last-ticketing__notice" data-b-notice aria-live="polite"><b>Secret Link가 확인되었습니다.</b> 취소표 좌석 1개를 선택해주세요.</section>
                <section class="last-ticketing__content">
                  <div class="last-ticketing__meta"><span>회차</span><b>${escapeHtml(sessionDate)} ${escapeHtml(sessionTime)}</b><span>선택 가능</span><b>${mapData.seats.filter((seat) => seat.status === 'available').length}석</b><span>제한</span><b>1인 1매 · 5분</b></div>
                  <div class="last-ticketing__map-wrap"><div class="last-ticketing__section-title">실시간 취소표 좌석 배치도</div><div class="last-ticketing__map" data-b-seatmap></div></div>
                  <section class="last-ticketing__selection" data-b-selection hidden>
                    <div><small>선택한 좌석</small><strong data-b-selection-label>-</strong></div>
                    <b data-b-selection-price>-</b>
                    <div class="last-ticketing__selection-actions"><button type="button" class="last-ticketing__secondary" data-b-clear>선택 해제</button><button type="button" class="last-ticketing__primary" data-b-confirm>좌석 확정 후 결제</button></div>
                  </section>
                </section>
                <footer class="last-ticketing__foot">좌석 확정 후 이 화면에서 바로 결제를 진행합니다.<br/><button type="button" class="last-ticketing__pass" data-b-pass>좌석 선택을 포기하고 다음 순번에게 넘기기</button></footer>
              </div>
              ${railMarkup('seat')}
            </div>
          </main>`;

        const notice = container.querySelector('[data-b-notice]');
        const selectionPanel = container.querySelector('[data-b-selection]');
        const refreshSelection = () => {
          if (!selectionPanel) return;
          selectionPanel.hidden = !selectedSeat;
          if (!selectedSeat) return;
          selectionPanel.querySelector('[data-b-selection-label]').textContent = `${selectedSeat.section || '일반'}구역 ${bareSeatId(selectedSeat.id)}`;
          selectionPanel.querySelector('[data-b-selection-price]').textContent = formatPrice(Number(selectedSeat.price || 0));
        };
        const clearSelection = () => {
          if (!selectedSeat || heldSeatId) return;
          selectedSeat.status = 'available';
          selectedSeat.selectable = true;
          selectedSeat = null;
          seatMapApi?.updateStatuses(mapData.seats);
          refreshSelection();
        };

        seatMapApi = mountSeatMap(container.querySelector('[data-b-seatmap]'), {
          sections: mapData.sections,
          seats: mapData.seats,
          onSeatClick: (seatId) => {
            const seat = mapData.seats.find((item) => item.id === seatId);
            if (!seat || !seat.selectable || heldSeatId) {
              if (notice) notice.innerHTML = '<b>AVAILABLE 상태의 취소표 좌석만 선택할 수 있습니다.</b>';
              return;
            }
            clearSelection();
            selectedSeat = seat;
            selectedSeat.status = 'mine';
            selectedSeat.selectable = false;
            seatMapApi?.updateStatuses(mapData.seats);
            refreshSelection();
            if (notice) notice.innerHTML = '<b>좌석을 선택했습니다.</b> "좌석 확정 후 결제"를 눌러 실제 선점을 완료해주세요.';
          },
          cancelMode: true,
          selectionOnly: Boolean(assignedSeatId),
          hideHoldingLegend: true,
          venue: event.venue,
        });
        refreshSelection();
        paintTimer(allocation.expiresAt);

        container.querySelector('[data-b-clear]')?.addEventListener('click', () => {
          clearSelection();
          if (notice) notice.innerHTML = '<b>좌석 선택을 해제했습니다.</b> 원하는 좌석을 다시 선택해주세요.';
        });
        container.querySelector('[data-b-confirm]')?.addEventListener('click', async (clickEvent) => {
          if (!selectedSeat || terminal) return;
          const button = clickEvent.currentTarget;
          button.disabled = true;
          button.textContent = '좌석을 확정하는 중...';
          if (!heldSeatId) {
            const result = await holdCancelSeat(userId, eventId, selectedSeat.id, {
              allocationId: allocation.allocationId,
              sessionDate,
              sessionTime,
            }).catch(() => ({ ok: false, data: { message: '네트워크 오류가 발생했습니다.' } }));
            if (!result.ok || !result.data?.success) {
              button.disabled = false;
              button.textContent = '좌석 확정 후 결제';
              if (notice) notice.innerHTML = `<b>${escapeHtml(result.data?.message || '좌석 선점에 실패했습니다.')}</b>`;
              clearSelection();
              return;
            }
            heldSeatId = selectedSeat.id;
          }

          renderPaymentStep(event, userId);
        });
        container.querySelector('[data-b-pass]')?.addEventListener('click', async (clickEvent) => {
          if (!window.confirm('현재 취소표 순번을 포기하고 다음 사용자에게 넘기시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;
          const button = clickEvent.currentTarget;
          button.disabled = true;
          button.textContent = '순번을 넘기는 중...';
          const passed = await expireAndPass('manual').catch(() => false);
          if (!passed && !destroyed && !terminal) {
            button.disabled = false;
            button.textContent = '좌석 선택을 포기하고 다음 순번에게 넘기기';
            if (notice) notice.innerHTML = '<b>순번을 넘기지 못했습니다.</b> 잠시 후 다시 시도해주세요.';
          }
        });
      } catch (error) {
        if (!destroyed) {
          const expired = Number(error.status) === 401 || Number(error.status) === 410;
          renderState(expired ? '⌛' : '⚠️', expired ? '입장 시간이 만료되었습니다' : '취소표 정보를 불러오지 못했습니다', error.message || '잠시 후 다시 시도해주세요.');
        }
      }
    }

    container.innerHTML = `<style>${lastTicketingStyles()}</style><main class="last-ticketing last-ticketing--state" aria-live="polite"><div class="last-ticketing__ticket" aria-hidden="true">🔐</div><h1>링크 확인 중</h1><p>취소표 예매 권한과 회차 정보를 확인하고 있습니다.</p></main>`;
    load();

    return () => {
      destroyed = true;
      stopTimer();
      seatMapApi?.destroy();
      if (heldSeatId && !completed && !terminal) {
        const userId = getState().user?.userId || getState().user?.email;
        if (userId) {
          releaseSeatApi(userId, heldSeatId, {
            eventId,
            sessionDate: allocation?.sessionDate || querySessionDate,
            sessionTime: allocation?.sessionTime || querySessionTime,
          }).catch(() => {});
        }
      }
    };
  },
};
