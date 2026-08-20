import { getConcert } from '../data/concerts.js';
import { getBooking } from '../state/store.js';
import { formatDate, formatPrice } from '../utils/format.js';
import { navigate } from '../router.js';

export const bookingCompletePage = {
  render(container, params) {
    const booking = getBooking(params.id);
    if (!booking) {
      container.innerHTML = `<div class="center-state"><div class="center-state__title">예매 내역을 찾을 수 없습니다</div></div>`;
      return;
    }
    const c = getConcert(booking.concertId);

    container.innerHTML = `
      <div class="container complete-page">
        <div class="complete-check">✓</div>
        <h2 class="section-title">예매가 완료되었습니다</h2>
        <p class="section-sub">${booking.source === 'cancel' ? '취소표 예매가 정상적으로 확정되었습니다.' : '결제가 정상적으로 완료되었습니다.'}</p>

        <div class="complete-ticket">
          <div class="complete-ticket__head">
            <span>예매번호</span>
            <b class="num-mono">${booking.bookingId}</b>
          </div>
          <div class="complete-ticket__body">
            <div class="kv-row"><span>공연명</span><b>${c.artist} · ${c.title}</b></div>
            <div class="kv-row"><span>공연일</span><b>${formatDate(c.dateStart)}</b></div>
            <div class="kv-row"><span>좌석</span><b>${booking.seat.gradeName} ${booking.seat.section} ${booking.seat.row}열 ${booking.seat.seatNum}번</b></div>
            <div class="complete-ticket__punch"></div>
            <div class="kv-row"><span>결제금액</span><b class="num-mono">${formatPrice(booking.price)}</b></div>
            <div class="kv-row"><span>상태</span><b><span class="badge badge-green">🟢 예매 확정</span></b></div>
          </div>
        </div>

        <div class="flex gap-12 mt-40" style="justify-content:center;">
          <button class="btn btn-outline btn-lg" data-history>예매내역 보기</button>
          <button class="btn btn-primary btn-lg" data-mypage>마이페이지로 이동</button>
        </div>
      </div>
    `;

    container.querySelector('[data-history]').addEventListener('click', () => navigate('mypage/bookings'));
    container.querySelector('[data-mypage]').addEventListener('click', () => navigate('mypage'));
  },
};
