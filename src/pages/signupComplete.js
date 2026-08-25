// 회원가입 완료 페이지 — 가입 축하 메시지와 홈·로그인 이동 버튼을 표시.

import { navigate } from '../router.js';

export const signupCompletePage = {
  render(container) {
    container.innerHTML = `
      <div class="container auth-page" style="text-align:center;padding-top:90px;">
        <div class="complete-check">✓</div>
        <h1 style="margin-top:18px;">회원가입이 완료되었습니다</h1>
        <p class="sub" style="margin-bottom:8px;">QUEUING 회원이 되신 것을 환영합니다.</p>
        <p class="sub" style="margin-top:0;">이제 다양한 공연과 이벤트를 만나보세요.</p>
        <div class="flex gap-12 mt-40" style="justify-content:center;">
          <button class="btn btn-primary btn-lg" data-login>로그인하기</button>
          <button class="btn btn-outline btn-lg" data-home>홈으로 이동</button>
        </div>
      </div>
    `;
    container.querySelector('[data-login]').addEventListener('click', () => navigate('login'));
    container.querySelector('[data-home]').addEventListener('click', () => navigate(''));
  },
};
