// 멤버십 결제 페이지 — 선택한 요금제(monthly/yearly)의 결제 확인 및 구독 처리.

import { navigate } from '../router.js';
import { formatPrice } from '../utils/format.js';
import { subscribeMembership, hasMembership, isLoggedIn, setReturnTo, popReturnTo } from '../state/store.js';
import { showToast } from '../components/toast.js';

const PLANS = {
  monthly: { label: '월간 멤버십', price: 3900, cycle: '월' },
  yearly: { label: '연간 멤버십', price: 34800, cycle: '년' },
};

export const membershipCheckoutPage = {
  render(container, params) {
    const plan = PLANS[params.plan] ? params.plan : 'monthly';
    const info = PLANS[plan];

    if (!isLoggedIn()) {
      setReturnTo(`membership-checkout/${plan}`);
      navigate('login');
      return;
    }

    if (hasMembership()) {
      navigate('mypage/membership');
      return;
    }

    container.innerHTML = `
      <div class="container payment-body">
        <div>
          <div class="eyebrow">MEMBERSHIP CHECKOUT</div>
          <h2 class="section-title">멤버십 결제</h2>

          <div class="notice-box mt-24">
            <p>멤버십은 <strong>결제 즉시</strong> 적용되며, 취소표 Private Link 이용 권한이 바로 활성화됩니다.</p>
            <p>구독은 마이페이지 &gt; 멤버십에서 언제든 확인할 수 있습니다.</p>
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
          <div class="kv-row"><span>플랜</span><b>${info.label}</b></div>
          <div class="kv-row"><span>결제 주기</span><b>${info.cycle} 1회</b></div>
          <div class="kv-row"><span>혜택</span><b style="text-align:right;">취소표 예매 권한 · Private Link<br/>발생 알림 · 내 차례 알림</b></div>
          <div class="summary-total"><span>총 결제금액</span><b class="num-mono">${formatPrice(info.price)}</b></div>
          <button class="btn btn-primary btn-block mt-24" data-pay>결제하기</button>
          <button class="btn btn-ghost btn-block mt-8" data-cancel>취소</button>
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

    container.querySelector('[data-cancel]').addEventListener('click', () => navigate('membership'));

    container.querySelector('[data-pay]').addEventListener('click', () => {
      const btn = container.querySelector('[data-pay]');
      btn.disabled = true;
      btn.textContent = '처리 중...';
      subscribeMembership(plan).then((result) => {
        if (result.success) {
          showToast({ title: '멤버십 결제 완료', body: '취소표 Private Link 이용이 가능합니다.', type: 'success' });
          const back = popReturnTo();
          navigate(back || 'mypage/membership');
        } else {
          btn.disabled = false;
          btn.textContent = '결제하기';
          showToast({ title: '결제에 실패했습니다', body: result.message || '잠시 후 다시 시도해주세요.' });
        }
      });
    });
  },
};
