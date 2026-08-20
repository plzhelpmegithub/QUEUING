import { getConcert } from '../data/concerts.js';
import { mountCountdown } from '../components/countdown.js';
import { navigate } from '../router.js';
import { hasMembership, isLoggedIn } from '../state/store.js';

const ENTRY_MS = 4 * 60 * 1000 + 52 * 1000; // 04:52

export const privateLinkPage = {
  render(container, params) {
    const c = getConcert(params.id);
    if (!c || !isLoggedIn() || !hasMembership()) {
      navigate(c ? `cancel-queue/${c.id}` : '');
      return;
    }

    const deadline = Date.now() + ENTRY_MS;

    container.innerHTML = `
      <div class="container privatelink-page">
        <div class="privatelink-badge">🔗 PRIVATE LINK</div>
        <h2 class="section-title">입장할 차례입니다</h2>
        <p class="section-sub mt-8">회원님의 취소표 예매 링크가 발급되었습니다.<br/>${c.artist} · ${c.title}</p>

        <div class="mt-40" data-cd></div>

        <div class="mt-40" data-cta></div>

        <div class="privatelink-policy">
          <div class="lock-box__icon" style="text-align:left;">🔒 본인 전용 Private Link</div>
          <ul>
            <li>1인 1링크</li>
            <li>1회성 링크</li>
            <li>5분 유효</li>
            <li>사용 후 재접속 불가</li>
            <li>링크 양도 불가</li>
            <li>대기번호 거래 불가</li>
            <li>대리 티켓팅 불가</li>
            <li>본인 계정 확인</li>
            <li>멤버십 상태 확인</li>
          </ul>
        </div>
      </div>
    `;

    const ctaEl = container.querySelector('[data-cta]');
    ctaEl.innerHTML = `<button class="btn btn-primary btn-lg" data-enter>취소표 예매 입장</button>`;
    ctaEl.querySelector('[data-enter]').addEventListener('click', () => {
      stop();
      navigate(`cancel-seats/${c.id}`);
    });

    const stop = mountCountdown(container.querySelector('[data-cd]'), {
      targetMs: deadline,
      format: 'mmss',
      label: '남은 입장 시간',
      size: 'sm',
      onComplete: () => {
        container.querySelector('[data-cd]').style.display = 'none';
        ctaEl.innerHTML = `
          <div class="badge badge-dark-red" style="font-size:13px;padding:8px 16px;margin-bottom:14px;">입장 시간 만료</div>
          <div style="font-size:14px;color:var(--color-text-secondary);line-height:1.8;margin-bottom:20px;">
            Private Link 사용 시간이 종료되었습니다.<br/>해당 링크는 다시 사용할 수 없습니다.
          </div>
          <button class="btn btn-outline btn-lg" data-mypage>마이페이지로 이동</button>
        `;
        ctaEl.querySelector('[data-mypage]').addEventListener('click', () => navigate('mypage'));
      },
    });

    return stop;
  },
};
