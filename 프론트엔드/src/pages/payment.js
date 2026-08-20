import { getConcert } from '../data/concerts.js';
import { formatDate, formatPrice, uid } from '../utils/format.js';
import { mountCountdown } from '../components/countdown.js';
import { getState, clearCurrentOrder, addBooking, consumeCancelPool } from '../state/store.js';
import { navigate } from '../router.js';

const REGULAR_DEADLINE_MS = 3 * 24 * 60 * 60 * 1000;
const CANCEL_DEADLINE_MS = 24 * 60 * 60 * 1000;

export const paymentPage = {
  render(container, params) {
    const type = params.type === 'cancel' ? 'cancel' : 'regular';
    const order = getState().currentOrder;

    if (!order) {
      container.innerHTML = `
        <div class="center-state">
          <div class="center-state__icon">🎫</div>
          <div class="center-state__title">결제할 주문이 없습니다</div>
          <div class="center-state__desc">좌석을 먼저 선택해주세요.</div>
          <button class="btn btn-primary" data-home>홈으로</button>
        </div>`;
      container.querySelector('[data-home]').addEventListener('click', () => navigate(''));
      return;
    }

    const c = getConcert(order.concertId);
    const deadlineMs = type === 'cancel' ? CANCEL_DEADLINE_MS : REGULAR_DEADLINE_MS;
    const deadline = order.securedAt + deadlineMs;

    container.innerHTML = `
      <div class="container payment-body">
        <div>
          <div class="eyebrow">${type === 'cancel' ? '취소표 결제' : 'PAYMENT'}</div>
          <h2 class="section-title">${type === 'cancel' ? '취소표 결제' : '결제하기'}</h2>

          <div class="payment-deadline-box mt-24">
            <div>
              <div class="payment-deadline-box__label">${type === 'cancel' ? '남은 결제시간' : '결제 마감'}</div>
              <div class="payment-deadline-box__time num-mono" data-deadline></div>
            </div>
            <span class="badge badge-red">결제 대기</span>
          </div>

          <div class="notice-box mt-16">
            ${
              type === 'cancel'
                ? `
              <p>취소표를 확보한 시점부터 <strong>24시간 이내</strong> 결제를 완료해야 합니다.</p>
              <p>24시간 이내 결제하지 않으면 티켓은 <strong>자동 취소</strong>됩니다.</p>
              <p>취소된 티켓은 다시 취소표 Pool로 돌아가며 다음 대기자에게 배부됩니다.</p>
            `
                : `
              <p>티켓 확보 후 <strong>3일 이내</strong> 결제를 완료해야 합니다.</p>
              <p>결제 마감 시간이 지나면 좌석이 자동으로 취소됩니다.</p>
            `
            }
          </div>

          <div class="mt-24">
            <h3 style="font-size:15px;font-weight:800;margin-bottom:14px;">결제 수단</h3>
            <label class="radio-row checked"><input type="radio" name="pay" checked /> 신용카드</label>
            <label class="radio-row"><input type="radio" name="pay" /> 간편결제</label>
            <label class="radio-row"><input type="radio" name="pay" /> 기타 결제수단</label>
          </div>
        </div>

        <div class="summary-card">
          <div class="summary-card__title">주문 요약</div>
          <div class="kv-row"><span>공연명</span><b>${c.artist} · ${c.title}</b></div>
          <div class="kv-row"><span>공연일</span><b>${formatDate(c.dateStart)}</b></div>
          <div class="kv-row"><span>좌석</span><b>${order.seat.gradeName} ${order.seat.section} ${order.seat.row}열 ${order.seat.seatNum}번</b></div>
          ${type === 'cancel' ? `<div class="kv-row"><span>구분</span><b><span class="badge badge-red">취소표</span></b></div>` : ''}
          <div class="summary-total"><span>총 결제금액</span><b class="num-mono">${formatPrice(order.seat.price)}</b></div>
          <button class="btn btn-primary btn-block mt-24" data-pay>결제하기</button>
        </div>
      </div>
    `;

    container.querySelectorAll('.radio-row').forEach((row) => {
      row.addEventListener('click', () => {
        container.querySelectorAll('.radio-row').forEach((r) => r.classList.remove('checked'));
        row.classList.add('checked');
        row.querySelector('input').checked = true;
      });
    });

    const stopCd = mountCountdown(container.querySelector('[data-deadline]'), {
      targetMs: deadline,
      format: 'deadline',
    });

    container.querySelector('[data-pay]').addEventListener('click', () => {
      const bookingId = uid('A');
      addBooking({
        bookingId,
        concertId: c.id,
        seat: order.seat,
        price: order.seat.price,
        status: 'confirmed',
        source: type,
        paidAt: Date.now(),
      });
      if (type === 'cancel') {
        consumeCancelPool(c.id, order.seat.grade);
      }
      clearCurrentOrder();
      navigate(`complete/${bookingId}`);
    });

    return stopCd;
  },
};
