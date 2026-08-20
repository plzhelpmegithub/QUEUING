import { login, popReturnTo } from '../state/store.js';
import { navigate } from '../router.js';

export const loginPage = {
  render(container) {
    container.innerHTML = `
      <div class="container auth-page">
        <h1>로그인</h1>
        <p class="sub">QUEUING과 함께 티켓팅을 시작하세요</p>
        <form data-form>
          <div class="field"><label>이메일 / 아이디</label><input type="text" name="email" placeholder="you@example.com" required /></div>
          <div class="field"><label>비밀번호</label><input type="password" name="password" placeholder="비밀번호" required /></div>
          <button class="btn btn-primary btn-block btn-lg" type="submit">로그인</button>
        </form>
        <div class="auth-switch">아직 회원이 아니신가요? <a href="#/signup">회원가입</a></div>
        <div class="notice-box mt-24">본 사이트는 데모용으로, 임의의 이메일 형식만 입력하면 로그인됩니다.</div>
      </div>
    `;

    container.querySelector('[data-form]').addEventListener('submit', (e) => {
      e.preventDefault();
      const email = e.target.email.value.trim();
      const password = e.target.password.value;
      if (email === 'admin' && password === '1') {
        login({ name: '관리자', email: 'admin@queuing.app', isAdmin: true });
      } else {
        login({ name: email.split('@')[0] || '게스트', email });
      }
      const back = popReturnTo();
      navigate(back || '');
    });
  },
};
