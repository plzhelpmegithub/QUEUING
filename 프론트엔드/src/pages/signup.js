import { login, popReturnTo } from '../state/store.js';
import { navigate } from '../router.js';

export const signupPage = {
  render(container) {
    container.innerHTML = `
      <div class="container auth-page">
        <h1>회원가입</h1>
        <p class="sub">QUEUING 회원이 되고 다양한 공연을 예매하세요</p>
        <form data-form>
          <div class="field"><label>이름</label><input type="text" name="name" placeholder="홍길동" required /></div>
          <div class="field"><label>이메일</label><input type="email" name="email" placeholder="you@example.com" required /></div>
          <div class="field"><label>비밀번호</label><input type="password" name="password" placeholder="비밀번호" required /></div>
          <button class="btn btn-primary btn-block btn-lg" type="submit">회원가입</button>
        </form>
        <div class="auth-switch">이미 회원이신가요? <a href="#/login">로그인</a></div>
      </div>
    `;

    container.querySelector('[data-form]').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      const email = e.target.email.value.trim();
      login({ name: name || '게스트', email });
      const back = popReturnTo();
      navigate(back || '');
    });
  },
};
