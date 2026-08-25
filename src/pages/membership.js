// 멤버십 안내 페이지 — 월간/연간 요금제 혜택 비교와 가입 버튼을 표시.
// 미로그인 상태에서 가입 시도 시 로그인 페이지로 리다이렉트.

import { navigate } from '../router.js';
import { hasMembership, isLoggedIn, setReturnTo } from '../state/store.js';

export const membershipPage = {
  render(container) {
    const active = hasMembership();

    container.innerHTML = `
      <section class="membership-hero">
        <div class="container">
          <div class="eyebrow">QUEUING MEMBERSHIP</div>
          <h2 class="section-title">취소표를 가장 빠르게 만나는 방법</h2>
          <p class="section-sub">멤버십 회원만 취소표 Private Link를 통해 취켓팅에 참여할 수 있습니다</p>
          ${active ? `<div class="mt-16"><span class="badge badge-red" style="font-size:13px;padding:8px 16px;">✓ 이미 멤버십에 가입되어 있습니다</span></div>` : ''}
        </div>
      </section>

      <div class="container">
        <div class="membership-plans">
          <div class="plan-card">
            <div class="plan-card__name">월간 멤버십</div>
            <div class="plan-card__price">₩3,900<span> / 월</span></div>
            <ul class="plan-benefits">
              <li><b>✓</b> 취소표 예매 권한</li>
              <li><b>✓</b> 취소표 발생 알림</li>
              <li><b>✓</b> 내 차례 알림</li>
              <li><b>✓</b> Private Link 제공</li>
            </ul>
            <button class="btn btn-outline btn-block" data-plan="monthly" ${active ? 'disabled' : ''}>${active ? '가입됨' : '멤버십 가입하기'}</button>
          </div>
          <div class="plan-card featured">
            <div class="plan-card__ribbon">추천</div>
            <div class="plan-card__name">연간 멤버십</div>
            <div class="plan-card__price">₩34,800<span> / 년</span></div>
            <ul class="plan-benefits">
              <li><b>✓</b> 취소표 예매 권한</li>
              <li><b>✓</b> 취소표 발생 알림</li>
              <li><b>✓</b> 내 차례 알림</li>
              <li><b>✓</b> Private Link 제공</li>
            </ul>
            <button class="btn btn-primary btn-block" data-plan="yearly" ${active ? 'disabled' : ''}>${active ? '가입됨' : '멤버십 가입하기'}</button>
          </div>
        </div>

        <div class="membership-benefits-strip">
          <div><div class="b-icon">🎟️</div><div class="b-title">취소표 예매 권한</div></div>
          <div><div class="b-icon">🔔</div><div class="b-title">취소표 발생 알림</div></div>
          <div><div class="b-icon">⏰</div><div class="b-title">내 차례 알림</div></div>
          <div><div class="b-icon">🔗</div><div class="b-title">Private Link 제공</div></div>
        </div>
      </div>
    `;

    container.querySelectorAll('[data-plan]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!isLoggedIn()) {
          setReturnTo('membership');
          navigate('login');
          return;
        }
        navigate(`membership-checkout/${btn.dataset.plan}`);
      });
    });
  },
};
