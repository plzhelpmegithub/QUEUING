// 결제 페이지 — 일반 예매(regular)와 취소표(cancel) 플로우를 공용으로 처리.
// 카드결제/가상계좌 선택, 8분 홀드 타이머, 결제 완료 후 예매 내역 등록까지 담당.

import { formatPrice, uid } from '../utils/format.js';
import { mountCountdown } from '../components/countdown.js';
import { mountRefundSummary } from '../components/refundPolicy.js';
import { openModal, closeModal } from '../components/modal.js';
import { getState, clearCurrentOrder, addBooking, clearSeatSelectTimer, updateProfileOnServer } from '../state/store.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../router.js';
import { fetchWithRecaptcha } from '../utils/recaptcha.js';
import { expireCancelAllocation, releaseSeatApi, releaseSeatBeacon } from '../utils/backendApi.js';

const CANCEL_DEADLINE_MS = 5 * 60 * 1000;
const HOLD_MS = 8 * 60 * 1000 + 42 * 1000; // fallback if an order ever arrives without holdDeadline
const PHONE_RE = /^01[016789]-\d{3,4}-\d{4}$/;

const VBANK_BANKS = ['카카오뱅크', '국민은행', '신한은행', '우리은행', '하나은행', '토스뱅크'];
function randDigits(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}
function generateVirtualAccount(bank) {
  return {
    bank: bank || VBANK_BANKS[Math.floor(Math.random() * VBANK_BANKS.length)],
    number: `${randDigits(3)}-${randDigits(2)}-${randDigits(6)}`,
  };
}

function formatPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, digits.length === 10 ? 6 : 7)}-${digits.slice(digits.length === 10 ? 6 : 7)}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const paymentPage = {
  render(container, params) {
    const type = params.type === 'cancel' ? 'cancel' : 'regular';
    const order = getState().currentOrder;
    // cancel(취소표) 플로우는 여전히 좌석 1개(order.seat)만 다루고, regular(일반
    // 예매) 플로우는 최대 4매까지 담긴 order.seats 배열을 다룬다 — 이후 로직은
    // 전부 이 통합된 seats 배열 하나만 보고 동작하도록 정규화한다.
    const seats = order ? (type === 'cancel' ? [order.seat || order.seats?.[0]].filter(Boolean) : order.seats || []) : [];

    if (!order || seats.length === 0) {
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

    container.innerHTML = '<div class="center-state"><div class="center-state__title">결제 정보 불러오는 중...</div></div>';

    // renderPayment()가 돌려주는 stopCd(카운트다운 interval을 멈추는 함수)를 여기
    // 바깥 스코프 변수에 담아뒀다가, 아래에서 라우터에게 "동기적으로" 돌려주는
    // cleanup 함수 안에서 호출한다. render()가 fetch().then()의 Promise를 그대로
    // return하면 router.js의 `typeof result === 'function'` 체크를 못 통과해서
    // cleanup이 아예 등록이 안 됐었고, 그 결과 결제 화면을 벗어나도 카운트다운
    // interval이 백그라운드에서 계속 돌다가 나중에 엉뚱한 시점에 "제한시간
    // 초과" 알림을 띄우고 진행 중이던 새 주문(currentOrder)까지 지워버리는
    // 버그가 있었다 — 아래처럼 항상 함수를 동기적으로 반환해서 고쳤다.
    let destroyed = false;
    let stopCd = null;

    fetch('/events')
      .then((r) => r.json())
      .then((eventsData) => {
        if (destroyed) return;
        const c = (eventsData.events || []).find((e) => e.eventId === order.concertId);
        if (!c) {
          container.innerHTML = '<div class="center-state"><div class="center-state__title">공연 정보를 찾을 수 없습니다</div></div>';
          return;
        }
        stopCd = renderPayment(c);
      })
      .catch(() => {
        if (!destroyed) {
          container.innerHTML = '<div class="center-state"><div class="center-state__title">결제 정보를 불러오지 못했습니다.</div></div>';
        }
      });

    return () => {
      destroyed = true;
      if (stopCd) stopCd();
    };

    function renderPayment(c) {
    const deadline = type === 'cancel'
      ? new Date(order.cancelDeadline || order.cancelAllocation?.expiresAt || order.securedAt + CANCEL_DEADLINE_MS).getTime()
      : order.holdDeadline || order.securedAt + HOLD_MS;
    const sessionDate = order.session?.date ? order.session.date.replaceAll('-', '.') : c.eventDate || '';
    const sessionTime = order.session?.time || '';
    const discount = 0;
    const seatsTotal = seats.reduce((sum, s) => sum + Number(s.price || 0), 0);
    const finalPrice = seatsTotal - discount;
    let virtualAccount = null;
    let expired = false;
    // 결제하지 않고 페이지를 벗어나면(뒤로가기, 헤더 이동 등) 붙잡고 있던 좌석을
    // 즉시 해제한다 — 좌석선택 페이지를 나갈 때 선점이 풀리는 것과 동일한 동작.
    // 결제가 실제로 완료되었거나(seat가 이미 SOLD로 확정됨) 타임아웃으로 만료된
    // 경우(백엔드 TTL로 이미 자동 해제됨)는 다시 해제 요청을 보낼 필요가 없으므로
    // settled로 막는다.
    let settled = false;
    const realSeats = seats.filter((s) => typeof s.id === 'string' && s.id.includes(':'));
    function onPageHide() {
      if (settled || !realSeats.length) return;
      const user = getState().user;
      if (!user) return;
      realSeats.forEach((s) => releaseSeatBeacon(user.userId, s.id));
    }
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);

    container.innerHTML = `
      <div class="container payment-body">
        <div>
          <div class="eyebrow">${type === 'cancel' ? '취소표 결제' : 'PAYMENT · STEP 5'}</div>
          <h2 class="section-title">${type === 'cancel' ? '취소표 결제' : '결제 정보 확인'}</h2>

          ${type === 'cancel' ? `
          <div class="payment-deadline-box mt-24">
            <div>
              <div class="payment-deadline-box__label">남은 결제시간</div>
              <div class="payment-deadline-box__time num-mono" data-deadline></div>
            </div>
            <span class="badge badge-red">결제 대기</span>
          </div>
          <div class="notice-box mt-16">
              <p>취소표를 확보한 시점부터 <strong>24시간 이내</strong> 결제를 완료해야 합니다.</p>
              <p>24시간 이내 결제하지 않으면 티켓은 <strong>자동 취소</strong>됩니다.</p>
              <p>취소된 티켓은 다시 취소표 Pool로 돌아가며 다음 대기자에게 배부됩니다.</p>
          </div>` : `
          <div class="notice-box mt-16">
              <p>우측 상단의 <strong>제한시간 내에 결제하기 버튼을 눌러야</strong> 예매가 확정됩니다.</p>
              <p>제한시간이 지나면 좌석이 자동 해제됩니다.</p>
          </div>
          <div style="display:none;"><span data-deadline></span></div>`}

          <div class="detail-info-card mt-24">
            <h3>구매자 정보</h3>
            <div class="field">
              <label>이름</label>
              <input type="text" data-buyer-name placeholder="예매자 이름" value="${getState().user?.name || ''}" />
            </div>
            <div class="field">
              <label>전화번호</label>
              <input type="tel" data-buyer-phone placeholder="010-1234-5678" value="${formatPhone(getState().user?.phone || '')}" maxlength="13" inputmode="numeric" autocomplete="tel" />
            </div>
            <div class="field" style="margin-bottom:0;">
              <label>이메일</label>
              <input type="email" data-buyer-email placeholder="example@email.com" value="${getState().user?.email || ''}" />
            </div>
          </div>

          <div class="mt-24">
            <h3 style="font-size:15px;font-weight:800;margin-bottom:14px;">결제 수단</h3>
            <label class="radio-row checked"><input type="radio" name="pay" value="card" checked /> 신용카드</label>
            <label class="radio-row"><input type="radio" name="pay" value="easy" /> 간편결제</label>
            <label class="radio-row"><input type="radio" name="pay" value="vbank" /> 무통장 입금</label>

            <div class="field" data-vbank-bank-field style="display:none;margin-top:14px;margin-bottom:0;">
              <label>입금 은행 선택</label>
              <select data-vbank-bank>
                ${VBANK_BANKS.map((b) => `<option value="${b}">${b}</option>`).join('')}
              </select>
              <p class="policy-note mt-8">· 은행 점검 시간(매일 23:30 이후)에는 입금이 제한될 수 있습니다.</p>
              <p class="policy-note">· 가상계좌는 ATM 입금이 되지 않을 수 있으니 인터넷/모바일 뱅킹을 이용해주세요.</p>
              <p class="policy-note">· 현금영수증 발급을 원하시면 결제 완료 후 고객센터 FAQ의 안내를 참고해주세요.</p>
            </div>
          </div>

          <div class="mt-24" data-refund-summary></div>
        </div>

        <div class="summary-card">
          <div class="detail-info-card" style="margin-bottom:20px;box-shadow:none;padding:0;border:none;">
            <h3>예매 상세 정보</h3>
            <div class="kv-row"><span>공연명</span><b>${c.eventName}</b></div>
            <div class="kv-row"><span>공연 날짜</span><b>${sessionDate}</b></div>
            ${sessionTime ? `<div class="kv-row"><span>공연 시간</span><b>${sessionTime}</b></div>` : ''}
            <div class="kv-row"><span>공연장</span><b>${c.venue}</b></div>
            ${
              seats.length === 1
                ? `<div class="kv-row"><span>좌석 등급</span><b>${seats[0].gradeName}</b></div>
                   <div class="kv-row"><span>구역</span><b>${seats[0].section || seats[0].gradeName}</b></div>
                   <div class="kv-row"><span>좌석 번호</span><b>${seats[0]._displayNum || seats[0].seatNum}번</b></div>`
                : `<div class="kv-row" style="align-items:flex-start;"><span>선택 좌석 (${seats.length}매)</span>
                     <b style="text-align:right;">${seats
                       .map((s) => `${s.gradeName} ${s._displayNum || s.seatNum}번`)
                       .join('<br/>')}</b>
                   </div>`
            }
          </div>

          <div class="divider" style="margin:0 0 20px;"></div>

          <div class="summary-card__title">결제 금액</div>
          <div class="kv-row"><span>티켓 금액</span><b class="num-mono">${formatPrice(seatsTotal)}</b></div>
          <div class="kv-row"><span>할인 금액</span><b class="num-mono">-${formatPrice(discount)}</b></div>
          ${type === 'cancel' ? `<div class="kv-row"><span>구분</span><b><span class="badge badge-red">취소표</span></b></div>` : ''}
          <div class="summary-total"><span>최종 결제 금액</span><b class="num-mono">${formatPrice(finalPrice)}</b></div>

          <div class="vbank-box" data-vbank-box style="display:none;"></div>

          <label class="pay-agree-row mt-24">
            <input type="checkbox" data-agree />
            <span>취소 및 환불 규정을 확인했으며 이에 동의합니다.</span>
          </label>

          <button class="btn btn-primary btn-block mt-16" data-pay disabled>결제하기</button>
        </div>
      </div>
    `;

    const vbankBox = container.querySelector('[data-vbank-box]');
    const vbankBankField = container.querySelector('[data-vbank-bank-field]');
    const vbankBankSelect = container.querySelector('[data-vbank-bank]');
    const buyerPhoneInput = container.querySelector('[data-buyer-phone]');
    buyerPhoneInput?.addEventListener('input', () => {
      const beforeLength = buyerPhoneInput.value.length;
      const cursorPosition = buyerPhoneInput.selectionStart ?? beforeLength;
      buyerPhoneInput.value = formatPhone(buyerPhoneInput.value);
      const cursorOffset = buyerPhoneInput.value.length - beforeLength;
      const nextPosition = Math.max(0, Math.min(buyerPhoneInput.value.length, cursorPosition + cursorOffset));
      buyerPhoneInput.setSelectionRange(nextPosition, nextPosition);
    });
    function renderVbankBox() {
      const method = container.querySelector('input[name="pay"]:checked')?.value;
      if (method !== 'vbank') {
        vbankBox.style.display = 'none';
        vbankBankField.style.display = 'none';
        return;
      }
      vbankBankField.style.display = 'block';
      if (!virtualAccount) virtualAccount = generateVirtualAccount(vbankBankSelect.value);
      vbankBox.style.display = 'block';
        vbankBox.innerHTML = `
        <div class="vbank-box__label">입금할 가상계좌</div>
        <div class="vbank-box__bank">${virtualAccount.bank}</div>
        <div class="vbank-box__number num-mono">${virtualAccount.number}</div>
        <div class="vbank-box__amount">입금액 <b class="num-mono">${formatPrice(finalPrice)}</b></div>
        <p class="policy-note mt-8">결제하기를 누른 뒤 <strong>24시간 이내</strong>에 마이페이지 &gt; 예매내역의 "티켓 확인"에서 이 계좌로 입금해주세요. 입금이 확인되어야 좌석이 최종 확정됩니다.</p>
      `;
    }

    vbankBankSelect.addEventListener('change', () => {
      virtualAccount = generateVirtualAccount(vbankBankSelect.value);
      renderVbankBox();
    });

    container.querySelectorAll('.radio-row').forEach((row) => {
      row.addEventListener('click', () => {
        container.querySelectorAll('.radio-row').forEach((r) => r.classList.remove('checked'));
        row.classList.add('checked');
        row.querySelector('input').checked = true;
        renderVbankBox();
      });
    });

    mountRefundSummary(container.querySelector('[data-refund-summary]'), { compact: true });

    const payBtn = container.querySelector('[data-pay]');
    const agreeBox = container.querySelector('[data-agree]');
    container.querySelector('[data-agree]').addEventListener('change', (e) => {
      payBtn.disabled = expired || !e.target.checked;
    });

    const stopCountdown = mountCountdown(container.querySelector('[data-deadline]'), {
      targetMs: deadline,
      format: type === 'cancel' ? 'deadline' : 'mmss',
      onComplete: () => {
              if (expired) return;
              expired = true;
              settled = true;
              payBtn.disabled = true;
              agreeBox.disabled = true;
              const currentUserId = getState().user?.userId || getState().user?.email;
              const releasePromises = currentUserId
                ? realSeats.map((s) => releaseSeatApi(currentUserId, s.id).catch(() => null))
                : [];
              const expirePromise = Promise.all(releasePromises).then(() => (
                type === 'cancel' && currentUserId && order.cancelAllocation
                  ? expireCancelAllocation(currentUserId, c.eventId, order.cancelAllocation.seatId, {
                      sessionDate: order.cancelAllocation.sessionDate || order.session?.date || '',
                      sessionTime: order.cancelAllocation.sessionTime || order.session?.time || '',
                    }).catch(() => null)
                  : null
              ));
              expirePromise.catch(() => {});
              clearCurrentOrder();
              clearSeatSelectTimer();
              openModal({
                title: '제한시간이 초과되었습니다',
                bodyHtml: `<p>${type === 'cancel' ? '취소표 Secret Link의 제한시간이 초과되었습니다.' : '좌석 선택 제한시간 내에 결제하기를 누르지 않아 예매가 취소되었습니다.'}<br/>좌석은 자동으로 해제되고 다음 대기자에게 넘어갑니다.</p>`,
                footerHtml: `<button type="button" class="btn btn-primary btn-block" data-modal-close data-goto-zones>${type === 'cancel' ? '취소표 대기열로' : '구역 다시 선택하기'}</button>`,
              });
              document.querySelector('[data-goto-zones]')?.addEventListener('click', () => navigate(type === 'cancel' ? `mypage/cancel-queue?eventId=${encodeURIComponent(c.eventId)}` : `zones/${c.eventId}`));
            },
    });

    payBtn.addEventListener('click', () => {
      if (payBtn.disabled || expired) return;

      const sessionDate = order.session?.date;
      if (sessionDate) {
        const alreadyBooked = getState().bookings.some(
          (b) => b.concertId === c.eventId && b.session?.date === sessionDate && (b.status === 'confirmed' || b.status === 'unpaid')
        );
        if (alreadyBooked) {
          showToast({ title: '이미 예매한 날짜입니다', body: `${sessionDate} 공연은 이미 예매가 완료되었습니다. 다른 날짜를 선택해주세요.` });
          return;
        }
      }

      const buyerName = container.querySelector('[data-buyer-name]').value.trim();
      const buyerPhone = container.querySelector('[data-buyer-phone]').value.trim();
      const buyerEmail = container.querySelector('[data-buyer-email]').value.trim();
      if (!buyerName || !buyerPhone || !buyerEmail) {
        showToast({ title: '구매자 정보를 입력해주세요', body: '이름, 전화번호, 이메일을 모두 입력해야 결제할 수 있습니다.', type: 'default' });
        return;
      }
      if (!PHONE_RE.test(buyerPhone)) {
        showToast({ title: '전화번호 형식을 확인해주세요', body: '010-1234-5678 형식으로 입력해주세요.', type: 'default' });
        return;
      }
      const method = container.querySelector('input[name="pay"]:checked')?.value || 'card';
      const userId = getState().user?.userId || getState().user?.email;

      payBtn.disabled = true;

      const continueToPayment = () => {
         // 일반 예매와 취소표 모두 /seats/hold를 거친 좌석은
         // /seats/confirm으로 MariaDB reservations에 확정 저장한다.
        const realSeats = seats.filter((s) => typeof s.id === 'string' && s.id.includes(':') && !!userId);
        const confirmCall = realSeats.length
          ? Promise.all(
              realSeats.map((s) => fetchWithRecaptcha('/seats/confirm', {
                    userId,
                    seatId: s.id,
                    eventId: c.eventId,
                    sessionDate: order.session?.date || '',
                    sessionTime: order.session?.time || '',
                    paymentMethod: method,
                  }, 'seat_confirm')
                  .then(({ status, data }) => ({ ok: status >= 200 && status < 300, data }))
              )
            ).then((results) => results.find((r) => !r.ok || !r.data.success) || results[0])
          : Promise.resolve({ ok: true, data: { success: true } });

        confirmCall
          .then(({ ok, data }) => {
            if (!ok || !data.success) {
              payBtn.disabled = false;
              showToast({ title: '결제를 완료하지 못했습니다', body: data.message || '좌석 선점이 만료되었을 수 있습니다. 다시 선택해주세요.', type: 'default' });
              return;
            }

            settled = true;
            const bookingId = uid('A');
            addBooking({
              bookingId,
              concertId: c.eventId,
              session: order.session || null,
              seats,
              price: finalPrice,
              buyer: { name: buyerName, phone: buyerPhone, email: buyerEmail },
              status: method === 'vbank' ? 'unpaid' : 'confirmed',
              source: type,
              paymentMethod: method,
              virtualAccount: method === 'vbank' ? virtualAccount : null,
              vbankDeadline: method === 'vbank' ? Date.now() + 24 * 60 * 60 * 1000 : null,
              paidAt: Date.now(),
            });
            clearCurrentOrder();
            clearSeatSelectTimer();
            navigate(`complete/${bookingId}`);
          })
          .catch(() => {
            payBtn.disabled = false;
            showToast({ title: '결제 요청에 실패했습니다', body: '네트워크 상태를 확인하고 다시 시도해주세요.', type: 'default' });
          });
      };

      const savedPhone = formatPhone(getState().user?.phone || '');
      if (savedPhone !== buyerPhone) {
        let confirmed = false;
        const phoneChangeModal = openModal({
          title: '전화번호 변경 확인',
          bodyHtml: `
            <p style="margin-bottom:14px;">입력한 전화번호가 회원정보와 다릅니다. 이 번호를 회원정보에 저장하고 결제를 진행할까요?</p>
            <div class="kv-row"><span>기존 전화번호</span><b>${escapeHtml(savedPhone || '미등록')}</b></div>
            <div class="kv-row"><span>변경할 전화번호</span><b>${escapeHtml(buyerPhone)}</b></div>
            <p class="text-secondary" style="font-size:12px;margin-top:14px;">이메일 정보는 변경하지 않습니다.</p>
          `,
          footerHtml: `
            <button type="button" class="btn btn-ghost" data-modal-close>다시 입력</button>
            <button type="button" class="btn btn-primary" data-confirm-phone-change>저장하고 결제하기</button>
          `,
          onClose: () => {
            if (!confirmed) payBtn.disabled = expired || !agreeBox.checked;
          },
        });

        phoneChangeModal.el.querySelector('[data-confirm-phone-change]')?.addEventListener('click', async (e) => {
          const confirmButton = e.currentTarget;
          confirmButton.disabled = true;
          confirmButton.textContent = '저장 중...';
          const result = await updateProfileOnServer({ phone: buyerPhone });
          if (!result.success) {
            confirmButton.disabled = false;
            confirmButton.textContent = '저장하고 결제하기';
            showToast({ title: '전화번호 저장에 실패했습니다', body: result.message || '잠시 후 다시 시도해주세요.', type: 'default' });
            return;
          }
          confirmed = true;
          closeModal();
          continueToPayment();
        });
        return;
      }

      continueToPayment();
    });

    return function cleanupPayment() {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
      stopCountdown();
      if (!settled && realSeats.length) {
        const user = getState().user;
        if (user) realSeats.forEach((s) => releaseSeatApi(user.userId, s.id).catch(() => {}));
      }
    };
    }
  },
};
