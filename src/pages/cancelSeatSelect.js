// 취소표 좌석 선택 페이지 — Secret Link로 입장한 멤버십 회원이 좌석을 선택하는 화면.
// 실제 공연 데이터(events API)와 연동. 1인 1매 제한.

import { formatPrice, formatNumber } from '../utils/format.js';
import { navigate } from '../router.js';
import { setCurrentOrder, getState, hasMembership, isLoggedIn } from '../state/store.js';

export const cancelSeatSelectPage = {
  render(container, params) {
    const eventId = params.id;

    if (!isLoggedIn() || !hasMembership()) {
      navigate(`cancel-queue/${eventId}`);
      return;
    }

    container.innerHTML = `<div class="center-state"><div class="center-state__title">취소표 좌석 불러오는 중...</div></div>`;

    let destroyed = false;

    Promise.all([
      fetch('/events').then((r) => r.json()),
      fetch(`/seats?eventId=${encodeURIComponent(eventId)}`).then((r) => r.json()),
    ])
      .then(([eventsData, seatsData]) => {
        if (destroyed) return;
        const c = (eventsData.events || []).find((e) => e.eventId === eventId);
        if (!c) {
          container.innerHTML = `<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>`;
          return;
        }

        const allSeats = seatsData.seats || [];
        const eventPrefix = `${eventId}:`;
        const availableSeats = allSeats.filter((s) => s.seatId.startsWith(eventPrefix) && s.status === 'AVAILABLE');

        if (availableSeats.length === 0) {
          container.innerHTML = `
            <div class="center-state">
              <div class="center-state__icon">😥</div>
              <div class="center-state__title">현재 취소표가 소진되었습니다</div>
              <div class="center-state__desc">다음 순번 대기자에게 기회가 넘어갔습니다.</div>
              <button class="btn btn-primary" data-back>취소표 대기열로</button>
            </div>`;
          container.querySelector('[data-back]').addEventListener('click', () => navigate(`cancel-queue/${eventId}`));
          return;
        }

        const layout = (c.sections || []).length ? c.sections : [{ name: 'A', price: c.price }];
        const sectionMap = {};
        layout.forEach((sec) => {
          const seats = availableSeats.filter((s) => s.section === sec.name);
          if (seats.length > 0) {
            sectionMap[sec.name] = { seats, price: Number(sec.price || c.price), label: `${sec.label || sec.name}석` };
          }
        });

        container.innerHTML = `
          <section class="seat-page-header">
            <div class="container seat-page-header__top">
              <div>
                <div class="seat-page-header__title">${c.eventName} <span class="badge badge-red">취소표 예매</span></div>
                <div class="seat-page-header__date">${c.eventDate || ''} · ${c.venue || ''}</div>
              </div>
            </div>
          </section>

          <div class="container">
            <div class="notice-box mt-16">
              <p>지금은 <strong>회원님 순번에만 단독으로 배정된 시간</strong>입니다.</p>
              <p><strong>1인 1매</strong> 제한이 적용됩니다. 좌석을 선택하면 바로 결제로 이동합니다.</p>
            </div>
          </div>

          <div class="container" style="padding-top:20px;">
            <div class="cancel-seat-grid" data-seat-list>
              ${Object.entries(sectionMap).map(([name, info]) => `
                <div class="cancel-zone-card">
                  <div class="cancel-zone-card__header">
                    <span class="cancel-zone-card__grade">${info.label}</span>
                    <span class="cancel-zone-card__price num-mono">${formatPrice(info.price)}</span>
                  </div>
                  <div class="cancel-zone-card__seats">
                    ${info.seats.map((s) => {
                      const bareId = s.seatId.includes(':') ? s.seatId.split(':').pop() : s.seatId;
                      return `<button type="button" class="cancel-seat-btn" data-seat-id="${s.seatId}" data-section="${name}" data-price="${info.price}" data-label="${info.label} ${bareId}">${bareId}</button>`;
                    }).join('')}
                  </div>
                  <div class="cancel-zone-card__remain">잔여 ${info.seats.length}석</div>
                </div>
              `).join('')}
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
              <button class="btn btn-primary btn-block mt-16" data-next>결제하기</button>
            </div>
          </div>
        `;

        let selectedSeat = null;

        container.querySelectorAll('.cancel-seat-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            container.querySelectorAll('.cancel-seat-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            selectedSeat = {
              seatId: btn.dataset.seatId,
              section: btn.dataset.section,
              price: Number(btn.dataset.price),
              label: btn.dataset.label,
            };

            const infoEl = container.querySelector('[data-selected-info]');
            infoEl.style.display = 'block';
            container.querySelector('[data-sel-label]').textContent = selectedSeat.label;
            container.querySelector('[data-sel-price]').textContent = formatPrice(selectedSeat.price);
          });
        });

        container.querySelector('[data-next]')?.addEventListener('click', () => {
          if (!selectedSeat) return;
          setCurrentOrder({
            concertId: eventId,
            seats: [{ id: selectedSeat.seatId, section: selectedSeat.section, price: selectedSeat.price, gradeName: selectedSeat.label }],
            source: 'cancel',
            securedAt: Date.now(),
          });
          navigate('payment/cancel');
        });
      })
      .catch(() => {
        if (!destroyed) {
          container.innerHTML = `<div class="center-state"><div class="center-state__title">좌석 정보를 불러오지 못했습니다.</div></div>`;
        }
      });

    return () => { destroyed = true; };
  },
};
