// 취소표 좌석 선택 페이지 — Secret Link에 서버가 배정한 좌석만 선점한다.

import { formatPrice } from '../utils/format.js';
import { navigate } from '../router.js';
import { getSelectedSession, getState, hasMembership, isLoggedIn, setCurrentOrder } from '../state/store.js';
import { fetchCancelQueueStatus, holdCancelSeat, releaseSeatApi } from '../utils/backendApi.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function bareSeatId(seatId) {
  return String(seatId || '').split(':').pop();
}

export const cancelSeatSelectPage = {
  render(container, params) {
    const eventId = params.id;
    const userId = getState().user?.userId || getState().user?.email;

    if (!isLoggedIn() || !hasMembership() || !userId) {
      navigate(`cancel-queue/${eventId}`);
      return;
    }

    container.innerHTML = '<div class="center-state"><div class="center-state__title">배정 좌석을 확인하는 중...</div></div>';
    let destroyed = false;
    let heldSeatId = null;
    let handedOffToPayment = false;

    function renderMessage(title, desc) {
      container.innerHTML = `
        <div class="center-state">
          <div class="center-state__icon">🎫</div>
          <div class="center-state__title">${escapeHtml(title)}</div>
          <div class="center-state__desc">${escapeHtml(desc)}</div>
          <button class="btn btn-primary" data-back>취소표 대기열로</button>
        </div>`;
      container.querySelector('[data-back]')?.addEventListener('click', () => navigate(`cancel-queue/${eventId}`));
    }

    async function load() {
      try {
        const status = await fetchCancelQueueStatus(eventId, userId, { eventId });
        const allocation = status.secretLink?.active ? status.secretLink : null;
        if (!allocation) {
          renderMessage('유효한 취소표 배정이 없습니다', 'Secret Link가 만료되었거나 이미 처리되었습니다.');
          return;
        }

        const eventsResponse = await fetch('/events');
        const eventsData = await eventsResponse.json();
        const event = (eventsData.events || []).find((item) => item.eventId === eventId);
        if (!event) {
          renderMessage('공연을 찾을 수 없습니다', '공연 정보가 삭제되었거나 아직 동기화되지 않았습니다.');
          return;
        }

        const session = {
          date: allocation.sessionDate || getSelectedSession(eventId)?.date || '',
          time: allocation.sessionTime || getSelectedSession(eventId)?.time || '',
        };
        const query = new URLSearchParams({ eventId });
        if (session.date) query.set('sessionDate', session.date);
        if (session.time) query.set('sessionTime', session.time);
        const seatsResponse = await fetch(`/seats?${query.toString()}`);
        const seatsData = await seatsResponse.json();
        const assignedSeat = (seatsData.seats || []).find((seat) => seat.seatId === allocation.seatId);
        if (!assignedSeat || assignedSeat.status !== 'AVAILABLE') {
          renderMessage('배정된 좌석을 사용할 수 없습니다', '좌석 상태가 변경되어 다음 대기자에게 확인이 필요합니다.');
          return;
        }
        if (destroyed) return;

        const section = assignedSeat.section || '일반';
        const price = Number(assignedSeat.price || 0);
        const label = `${section}석 ${bareSeatId(assignedSeat.seatId)}`;
        container.innerHTML = `
          <section class="seat-page-header">
            <div class="container seat-page-header__top">
              <div>
                <div class="seat-page-header__title">${escapeHtml(event.eventName)} <span class="badge badge-red">취소표 예매</span></div>
                <div class="seat-page-header__date">${escapeHtml(session.date || event.eventDate || '')} · ${escapeHtml(event.venue || '')}</div>
              </div>
            </div>
          </section>
          <div class="container">
            <div class="notice-box mt-16">
              <p>지금은 <strong>회원님에게 서버가 배정한 좌석</strong>입니다.</p>
              <p><strong>1인 1매</strong> 제한이 적용됩니다. 좌석을 선점한 뒤 결제를 완료해주세요.</p>
            </div>
          </div>
          <div class="container" style="padding-top:20px;">
            <div class="cancel-seat-grid" data-seat-list>
              <div class="cancel-zone-card">
                <div class="cancel-zone-card__header">
                  <span class="cancel-zone-card__grade">${escapeHtml(section)}석</span>
                  <span class="cancel-zone-card__price num-mono">${formatPrice(price)}</span>
                </div>
                <div class="cancel-zone-card__seats">
                  <button type="button" class="cancel-seat-btn" data-seat-id="${escapeHtml(assignedSeat.seatId)}">${escapeHtml(bareSeatId(assignedSeat.seatId))}</button>
                </div>
                <div class="cancel-zone-card__remain">서버 배정 좌석 1석</div>
              </div>
            </div>
          </div>
          <div class="container mt-24" data-selected-info style="display:none;">
            <div class="card" style="padding:24px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <div style="font-size:13px;color:var(--color-text-secondary);">선택된 좌석</div>
                  <div style="font-size:18px;font-weight:800;margin-top:4px;" data-sel-label></div>
                </div>
                <div class="num-mono" style="font-size:22px;font-weight:700;color:var(--color-primary);" data-sel-price></div>
              </div>
              <div class="badge badge-red-light" style="margin-top:12px;">1인 1매 제한 적용</div>
              <button class="btn btn-primary btn-block mt-16" data-next disabled>결제하기</button>
            </div>
          </div>`;

        const seatButton = container.querySelector('[data-seat-id]');
        const infoEl = container.querySelector('[data-selected-info]');
        const nextButton = container.querySelector('[data-next]');
        let selected = false;
        seatButton.addEventListener('click', async () => {
          if (selected || heldSeatId) return;
          seatButton.disabled = true;
          seatButton.classList.add('active');
          const result = await holdCancelSeat(userId, eventId, assignedSeat.seatId, {
            sessionDate: session.date,
            sessionTime: session.time,
          }).catch(() => ({ ok: false, data: {} }));
          if (!result.ok || !result.data.success) {
            seatButton.disabled = false;
            seatButton.classList.remove('active');
            renderMessage('좌석 선점에 실패했습니다', result.data.message || 'Secret Link 또는 좌석 상태를 다시 확인해주세요.');
            return;
          }
          selected = true;
          heldSeatId = assignedSeat.seatId;
          infoEl.style.display = 'block';
          container.querySelector('[data-sel-label]').textContent = label;
          container.querySelector('[data-sel-price]').textContent = formatPrice(price);
          nextButton.disabled = false;
        });

        nextButton.addEventListener('click', () => {
          if (!selected || !heldSeatId) return;
          handedOffToPayment = true;
          const seat = {
            id: assignedSeat.seatId,
            seatId: assignedSeat.seatId,
            section,
            grade: section,
            gradeName: `${section}석`,
            price,
            label,
          };
          setCurrentOrder({
            concertId: eventId,
            session,
            seat,
            seats: [seat],
            source: 'cancel',
            securedAt: Date.now(),
            cancelDeadline: allocation.expiresAt,
            cancelAllocation: allocation,
          });
          navigate('payment/cancel');
        });
      } catch (_) {
        if (!destroyed) renderMessage('취소표 정보를 불러오지 못했습니다', '네트워크 상태를 확인하고 다시 시도해주세요.');
      }
    }

    load();
    return () => {
      destroyed = true;
      if (heldSeatId && !handedOffToPayment) {
        releaseSeatApi(userId, heldSeatId).catch(() => {});
      }
    };
  },
};
