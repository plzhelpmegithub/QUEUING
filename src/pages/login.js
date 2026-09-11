import { login, popReturnTo } from '../state/store.js';
import { navigate } from '../router.js';
import { openModal, closeModal } from '../components/modal.js';
import { withRecaptcha, isV2Configured, renderV2Checkbox, isV2Required } from '../utils/recaptcha.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function openFindModal(kind) {
  openModal({
    title: kind === 'id' ? '아이디/이메일 찾기' : '비밀번호 찾기',
    bodyHtml: `<p>데모 환경에서는 아이디/비밀번호 찾기 기능이 제공되지 않습니다.<br/>가입 시 등록한 이메일과 비밀번호로 로그인해주세요.</p>`,
    footerHtml: `<button type="button" class="btn btn-primary btn-block" data-modal-close>확인</button>`,
  });
}

function doLogin(body) {
  return fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((res) => res.json().then((data) => ({ status: res.status, data })));
}

function handleLoginSuccess(result, email) {
  login({
    name: result.name || email.split('@')[0] || '게스트',
    email: result.email || email,
    isAdmin: result.role === 'admin',
    role: result.role === 'admin' ? 'ADMIN' : 'USER',
    userId: result.userId || email,
    phone: result.phone || '',
    birthDate: result.birthDate || '',
    marketingOptIn: result.marketingOptIn,
    joinedAt: result.joinedAt,
    accessToken: result.accessToken || '',
    refreshToken: result.refreshToken || '',
  });
  const back = popReturnTo();
  if (result.role === 'admin') navigate(back || 'admin');
  else navigate(back || '');
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
          <div data-v2-container style="display:none;margin-bottom:16px;"></div>
          <button class="btn btn-primary btn-block btn-lg" type="submit">로그인</button>
        </form>
        <div class="auth-find-links">
          <a href="#" data-find="id">아이디/이메일 찾기</a>
          <span>·</span>
          <a href="#" data-find="pw">비밀번호 찾기</a>
        </div>
        <div class="auth-switch">아직 회원이 아니신가요? <a href="#/signup">회원가입</a></div>
        <div class="notice-box mt-24">본 사이트는 프론트엔드 데모용으로 제작되었으며, 실제 예매 및 결제가 이루어지지 않습니다.<br/>가입하신 이메일과 비밀번호로 로그인해주세요.</div>
      </div>
    `;

    const form = container.querySelector('[data-form]');
    const formErr = form.querySelector('[data-err="form"]');
    const v2Container = container.querySelector('[data-v2-container]');
    let pendingV2Token = null;

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

    function showV2Checkbox() {
      if (!isV2Configured()) return;
      v2Container.style.display = 'block';
      v2Container.innerHTML = '<div data-v2-widget></div><p style="font-size:12px;color:var(--color-text-secondary);margin-top:8px;">보안 확인을 위해 아래 체크박스를 클릭한 후 다시 로그인해주세요.</p>';
      renderV2Checkbox(v2Container.querySelector('[data-v2-widget]'))
        .then((token) => {
          pendingV2Token = token;
          formErr.textContent = '체크박스 인증 완료! 로그인 버튼을 다시 눌러주세요.';
          formErr.style.color = 'var(--color-success, #27ae60)';
          submitBtn.disabled = false;
        })
        .catch(() => {
          formErr.textContent = '체크박스 인증에 실패했습니다. 페이지를 새로고침해주세요.';
          submitBtn.disabled = false;
        });
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = form.email.value.trim();
      const password = form.password.value;

      const validFormat = EMAIL_RE.test(email) && password.length >= 4;
      if (!validFormat) {
        formErr.textContent = '이메일 또는 비밀번호가 올바르지 않습니다.';
        formErr.style.color = '';
        return;
      }

      formErr.textContent = '';
      formErr.style.color = '';
      submitBtn.disabled = true;

      if (pendingV2Token) {
        doLogin({ userId: email, password, recaptchaV2Token: pendingV2Token })
          .then(({ status, data }) => {
            if (!data.success) {
              formErr.textContent = data.message || '로그인에 실패했습니다.';
              submitBtn.disabled = false;
              return;
            }
            handleLoginSuccess(data, email);
          })
          .catch(() => {
            formErr.textContent = '로그인 처리 중 오류가 발생했습니다.';
            submitBtn.disabled = false;
          });
        return;
      }

      withRecaptcha({ userId: email, password }, 'login')
        .then((body) => doLogin(body))
        .then(({ status, data }) => {
          if (status === 403 && isV2Required(data)) {
            formErr.textContent = '추가 보안 인증이 필요합니다.';
            formErr.style.color = '';
            submitBtn.disabled = false;
            showV2Checkbox();
            return;
          }
          if (!data.success) {
            formErr.textContent = data.message || '이메일 또는 비밀번호가 올바르지 않습니다.';
            submitBtn.disabled = false;
            return;
          }
          handleLoginSuccess(data, email);
        })
        .catch(() => {
          formErr.textContent = '로그인 처리 중 오류가 발생했습니다.';
          submitBtn.disabled = false;
        });
    });
  },
};
