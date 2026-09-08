// 로그인 페이지 — mock 인증으로 이름/이메일 입력 후 세션을 생성.
// admin/1 입력 시 관리자 계정으로 로그인 (어드민 모니터링 단축 진입).
// 로그인 성공 후 popReturnTo()로 이전 페이지로 복귀한다.

import { login, popReturnTo } from '../state/store.js';
import { navigate } from '../router.js';
import { openModal } from '../components/modal.js';
import { withRecaptcha } from '../utils/recaptcha.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function openFindModal(kind) {
  openModal({
    title: kind === 'id' ? '아이디/이메일 찾기' : '비밀번호 찾기',
    bodyHtml: `<p>데모 환경에서는 아이디/비밀번호 찾기 기능이 제공되지 않습니다.<br/>가입 시 등록한 이메일과 비밀번호로 로그인해주세요.</p>`,
    footerHtml: `<button type="button" class="btn btn-primary btn-block" data-modal-close>확인</button>`,
  });
}

export const loginPage = {
  render(container) {
    container.innerHTML = `
      <div class="container auth-page">
        <h1>로그인</h1>
        <p class="sub">QUEUING과 함께 티켓팅을 시작하세요</p>
        <form data-form novalidate>
          <div class="field">
            <label>이메일 / 아이디</label>
            <input type="text" name="email" placeholder="you@queuing.kr" autocomplete="username" required />
            <div class="field-error" data-err="email"></div>
          </div>
          <div class="field">
            <label>비밀번호</label>
            <input type="password" name="password" placeholder="비밀번호" autocomplete="current-password" required />
            <div class="field-error" data-err="password"></div>
          </div>
          <div class="field-error field-error--form" data-err="form"></div>
          <button class="btn btn-primary btn-block btn-lg" type="submit">로그인</button>
        </form>
        <div class="auth-find-links">
          <a href="#" data-find="id">아이디/이메일 찾기</a>
          <span>·</span>
          <a href="#" data-find="pw">비밀번호 찾기</a>
        </div>
        <div class="auth-switch">아직 회원이 아니신가요? <a href="#/signup">회원가입</a></div>
        <div class="notice-box mt-24">가입하신 이메일과 비밀번호로 로그인해주세요.</div>
      </div>
    `;

    const form = container.querySelector('[data-form]');
    const formErr = form.querySelector('[data-err="form"]');

    function setError(key, msg) {
      const el = form.querySelector(`[data-err="${key}"]`);
      if (el) el.textContent = msg || '';
      const field = el?.closest('.field');
      if (field) field.classList.toggle('field--invalid', !!msg);
    }

    function validateLive() {
      formErr.textContent = '';
      const email = form.email.value.trim();
      const password = form.password.value;
      if (email && !EMAIL_RE.test(email)) {
        setError('email', '이메일 형식이 올바르지 않습니다.');
      } else setError('email', '');
      if (password && password.length < 4) {
        setError('password', '비밀번호는 4자 이상 입력해주세요.');
      } else setError('password', '');
    }

    form.email.addEventListener('input', validateLive);
    form.password.addEventListener('input', validateLive);

    container.querySelectorAll('[data-find]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        openFindModal(a.dataset.find);
      });
    });

    const submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = form.email.value.trim();
      const password = form.password.value;

      const validFormat = EMAIL_RE.test(email) && password.length >= 4;
      if (!validFormat) {
        formErr.textContent = '이메일 또는 비밀번호가 올바르지 않습니다.';
        return;
      }

      formErr.textContent = '';
      submitBtn.disabled = true;

      withRecaptcha({ userId: email, password }, 'login')
        .then((body) => fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }))
        .then((res) => res.json())
        .then((result) => {
          if (!result.success) {
            formErr.textContent = result.message || '이메일 또는 비밀번호가 올바르지 않습니다.';
            submitBtn.disabled = false;
            return;
          }
          login({
            name: result.name || email.split('@')[0] || '게스트',
            email: result.email || email,
            isAdmin: result.role === 'admin',
            isMonitor: result.role === 'monitor',
            role: result.role === 'admin' ? 'ADMIN' : result.role === 'monitor' ? 'MONITOR' : 'USER',
            userId: result.userId || email,
            phone: result.phone || '',
            birthDate: result.birthDate || '',
            marketingOptIn: result.marketingOptIn,
            joinedAt: result.joinedAt,
          });
          const back = popReturnTo();
          if (result.role === 'admin') navigate(back || 'admin');
          else if (result.role === 'monitor') navigate('monitoring');
          else navigate(back || '');
        })
        .catch(() => {
          formErr.textContent = '로그인 처리 중 오류가 발생했습니다.';
          submitBtn.disabled = false;
        });
    });
  },
};
