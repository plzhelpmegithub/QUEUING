// 예매 완료 페이지 — 결제 성공 후 예매번호·좌석·금액 요약을 표시.
// 이 화면에서는 헤더가 숨겨진다(main.js BOOKING_COMPLETE_RE 참고).

import { getBooking } from '../state/store.js';
import { formatPrice } from '../utils/format.js';
import { navigate } from '../router.js';
import { getConcert, getConcertImage } from '../data/concerts.js';

// b.seats(신규, 1~4매 배열)와 b.seat(구형/백엔드 재구성 데이터, 단일 좌석) 둘 다
// 지원 — 좌석마다 "등급/구역 + 좌석번호"만 보여주고(내부 row/id는 노출 안 함),
// 여러 매면 쉼표로 이어붙인다.
function seatLabel(b) {
  const list = b.seats && b.seats.length ? b.seats : b.seat ? [b.seat] : [];
  return list.map((s) => `${s.gradeName || s.section} ${s._displayNum || s.seatNum}번`).join(', ');
}

function statusBadgeHtml(status) {
  if (status === 'refunded') return `<span class="badge badge-gray">환불 완료</span>`;
  if (status === 'refund_pending') return `<span class="badge badge-orange">환불 처리 중</span>`;
  if (status === 'unpaid') return `<span class="badge badge-orange">미입금</span>`;
  return `<span class="badge badge-green">🟢 예매 확정</span>`;
}

export const bookingCompletePage = {
  render(container, params) {
    let c = null; // 공연 정보 — /events에서 한 번만 받아와 draw() 재호출 시 재사용

    function draw() {
      const booking = getBooking(params.id);
      if (!booking) {
        container.innerHTML = `<div class="center-state"><div class="center-state__title">예매 내역을 찾을 수 없습니다</div></div>`;
        return;
      }
      const dateLabel = booking.session?.date ? booking.session.date.replaceAll('-', '.') : c.eventDate || '';
      const isUnpaid = booking.status === 'unpaid';

      container.innerHTML = `
        <div class="container complete-page">
          ${
            isUnpaid
              ? `<div class="vbank-notice">🏦 24시간 이내에 입금해야 좌석이 최종 확정됩니다. 마이페이지의 예매한 티켓에서 가상계좌를 확인해주세요.</div>`
              : ''
          }
          <div class="complete-check">${isUnpaid ? '🏦' : '✓'}</div>
          <h2 class="section-title">${isUnpaid ? '입금 확인 대기 중' : booking.status === 'confirmed' ? '예매가 완료되었습니다' : '예매 티켓'}</h2>
          <p class="section-sub">${
            isUnpaid
              ? '24시간 이내에 아래 가상계좌로 입금이 확인되면 예매가 확정됩니다.'
              : booking.source === 'cancel'
                ? '취소표 예매가 정상적으로 확정되었습니다.'
                : '결제가 정상적으로 완료되었습니다.'
          }</p>

          <div class="complete-ticket">
            <div class="complete-ticket__head">
              <span>예매번호</span>
              <b class="num-mono">${booking.bookingId}</b>
            </div>
            <div class="complete-ticket__body">
              <div class="kv-row"><span>공연명</span><b>${c.eventName}</b></div>
              <div class="kv-row"><span>공연일</span><b>${dateLabel}${booking.session?.time ? ' ' + booking.session.time : ''}</b></div>
              <div class="kv-row"><span>좌석</span><b>${seatLabel(booking)}</b></div>
              <div class="complete-ticket__punch"></div>
              <div class="kv-row"><span>결제금액</span><b class="num-mono">${formatPrice(booking.price)}</b></div>
              <div class="kv-row"><span>상태</span><b>${statusBadgeHtml(booking.status)}</b></div>
            </div>
            ${
              isUnpaid && booking.virtualAccount
                ? `
              <div class="complete-ticket__vbank">
                <div class="vbank-box__label">입금할 가상계좌</div>
                <div class="vbank-box__bank">${booking.virtualAccount.bank}</div>
                <div class="vbank-box__number num-mono">${booking.virtualAccount.number}</div>
                <div class="vbank-box__amount">입금액 <b class="num-mono">${formatPrice(booking.price)}</b></div>
                <p class="policy-note mt-8">마이페이지 &gt; 예매내역에서 언제든 이 계좌 정보를 다시 확인할 수 있습니다.</p>
              </div>`
                : ''
            }
          </div>

          <div class="flex gap-12 mt-40" style="justify-content:center;">
            <button class="btn btn-outline btn-lg" data-history>예매내역 보기</button>
            <button class="btn btn-primary btn-lg" data-mypage>마이페이지로 이동</button>
          </div>
        </div>
      `;

      container.querySelector('[data-history]').addEventListener('click', () => navigate('mypage/bookings'));
      container.querySelector('[data-mypage]').addEventListener('click', () => navigate('mypage'));
    }

    const booking = getBooking(params.id);
    if (!booking) {
      container.innerHTML = `<div class="center-state"><div class="center-state__title">예매 내역을 찾을 수 없습니다</div></div>`;
      return;
    }

    container.innerHTML = '<div class="center-state"><div class="center-state__title">예매 정보 불러오는 중...</div></div>';

    function resolveConcertInfo(concertId, realEvents) {
      const mock = getConcert(concertId);
      if (mock) return { eventName: `${mock.artist} · ${mock.title}`, eventDate: mock.dateStart, venue: mock.venue };
      return (realEvents || []).find((e) => e.eventId === concertId) || null;
    }

    fetch('/events')
      .then((r) => r.json())
      .then((eventsData) => {
        c = resolveConcertInfo(booking.concertId, eventsData.events);
        if (!c) {
          container.innerHTML = '<div class="center-state"><div class="center-state__title">공연 정보를 찾을 수 없습니다</div></div>';
          return;
        }
        draw();
      })
      .catch(() => {
        const fallback = resolveConcertInfo(booking.concertId, []);
        if (fallback) { c = fallback; draw(); return; }
        container.innerHTML = '<div class="center-state"><div class="center-state__title">예매 정보를 불러오지 못했습니다.</div></div>';
      });
  },
};
