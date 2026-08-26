// 회원가입 페이지 — 이름·이메일·비밀번호 입력 폼. 가입 성공 시 signupComplete 페이지로 이동.

import { navigate } from '../router.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^01[016789]-\d{3,4}-\d{4}$/;

function formatPhone(raw) {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

const TERMS = [
  { key: 'terms', required: true, label: '[필수] 이용약관 동의' },
  { key: 'privacy', required: true, label: '[필수] 개인정보 수집 및 이용 동의' },
  { key: 'service', required: true, label: '[필수] 서비스 이용약관 동의' },
  { key: 'marketing', required: false, label: '[선택] 이벤트 및 마케팅 정보 수신 동의' },
];

export const signupPage = {
  render(container) {
    container.innerHTML = `
      <div class="container auth-page auth-page--wide">
        <h1>회원가입</h1>
        <p class="sub">QUEUING 회원이 되고 다양한 공연을 예매하세요</p>
        <form data-form novalidate>
          <div class="field">
            <label>이름</label>
            <input type="text" name="name" placeholder="홍길동" autocomplete="name" required />
            <div class="field-error" data-err="name"></div>
          </div>
          <div class="field">
            <label>이메일</label>
            <input type="email" name="email" placeholder="you@queuing.kr" autocomplete="email" required />
            <div class="field-error" data-err="email"></div>
          </div>
          <div class="field">
            <label>비밀번호</label>
            <input type="password" name="password" placeholder="8자 이상 입력해주세요" autocomplete="new-password" required />
            <div class="field-error" data-err="password"></div>
          </div>
          <div class="field">
            <label>비밀번호 확인</label>
            <input type="password" name="password2" placeholder="비밀번호를 다시 입력해주세요" autocomplete="new-password" required />
            <div class="field-error" data-err="password2"></div>
          </div>
          <div class="field">
            <label>휴대폰 번호</label>
            <input type="tel" name="phone" placeholder="010-1234-5678" maxlength="13" required />
            <div class="field-error" data-err="phone"></div>
          </div>
          <div class="field">
            <label>생년월일</label>
            <input type="date" name="birth" required />
            <div class="field-error" data-err="birth"></div>
          </div>

          <div class="terms-box">
            <label class="terms-row terms-row--all">
              <input type="checkbox" data-term-all />
              <span>전체 동의</span>
            </label>
            <div class="divider" style="margin:10px 0;"></div>
            ${TERMS.map(
              (t) => `
              <label class="terms-row">
                <input type="checkbox" data-term="${t.key}" ${t.required ? 'data-required="1"' : ''} />
                <span>${t.label}</span>
              </label>`
            ).join('')}
            <div class="field-error" data-err="terms"></div>
          </div>

          <div class="field-error field-error--form" data-err="form"></div>
          <button class="btn btn-primary btn-block btn-lg mt-16" type="submit" disabled>회원가입</button>
        </form>
        <div class="auth-switch">이미 회원이신가요? <a href="#/login">로그인</a></div>
      </div>
    `;

    const form = container.querySelector('[data-form]');
    const submitBtn = form.querySelector('button[type="submit"]');
    const els = {
      name: form.name,
      email: form.email,
      password: form.password,
      password2: form.password2,
      phone: form.phone,
      birth: form.birth,
    };
    const termAll = form.querySelector('[data-term-all]');
    const termBoxes = [...form.querySelectorAll('[data-term]')];
    const requiredTermBoxes = termBoxes.filter((b) => b.dataset.required);

    function setError(key, msg) {
      const el = form.querySelector(`[data-err="${key}"]`);
      if (el) el.textContent = msg || '';
      const field = el?.closest('.field');
      if (field) field.classList.toggle('field--invalid', !!msg);
    }

    function validate() {
      let ok = true;

      if (!els.name.value.trim()) {
        setError('name', '이름을 입력해주세요.');
        ok = false;
      } else setError('name', '');

      if (!els.email.value.trim()) {
        setError('email', '이메일을 입력해주세요.');
        ok = false;
      } else if (!EMAIL_RE.test(els.email.value.trim())) {
        setError('email', '이메일 형식이 올바르지 않습니다.');
        ok = false;
      } else setError('email', '');

      if (!els.password.value) {
        setError('password', '비밀번호를 입력해주세요.');
        ok = false;
      } else if (els.password.value.length < 8) {
        setError('password', '비밀번호는 8자 이상 입력해주세요.');
        ok = false;
      } else setError('password', '');

      if (!els.password2.value) {
        setError('password2', '비밀번호를 다시 입력해주세요.');
        ok = false;
      } else if (els.password2.value !== els.password.value) {
        setError('password2', '비밀번호가 일치하지 않습니다.');
        ok = false;
      } else setError('password2', '');

      if (!els.phone.value.trim()) {
        setError('phone', '휴대폰 번호를 입력해주세요.');
        ok = false;
      } else if (!PHONE_RE.test(els.phone.value.trim())) {
        setError('phone', '휴대폰 번호 형식이 올바르지 않습니다.');
        ok = false;
      } else setError('phone', '');

      if (!els.birth.value) {
        setError('birth', '생년월일을 입력해주세요.');
        ok = false;
      } else setError('birth', '');

      const requiredOk = requiredTermBoxes.every((b) => b.checked);
      if (!requiredOk) {
        setError('terms', '필수 약관에 동의해주세요.');
        ok = false;
      } else setError('terms', '');

      submitBtn.disabled = !ok;
      return ok;
    }

    els.phone.addEventListener('input', () => {
      const pos = els.phone.selectionStart;
      const before = els.phone.value.length;
      els.phone.value = formatPhone(els.phone.value);
      const diff = els.phone.value.length - before;
      els.phone.setSelectionRange(pos + diff, pos + diff);
      validate();
    });

    Object.values(els).forEach((el) => {
      if (el === els.phone) return;
      el.addEventListener('input', validate);
      el.addEventListener('blur', validate);
    });

    termAll.addEventListener('change', () => {
      termBoxes.forEach((b) => (b.checked = termAll.checked));
      validate();
    });
    termBoxes.forEach((b) =>
      b.addEventListener('change', () => {
        termAll.checked = termBoxes.every((x) => x.checked);
        validate();
      })
    );

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validate()) return;

      setError('form', '');
      submitBtn.disabled = true;

      fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: els.email.value.trim(),
          password: els.password.value,
          email: els.email.value.trim(),
          name: els.name.value.trim(),
          phone: els.phone.value.trim(),
          birthDate: els.birth.value,
        }),
      })
        .then((res) => res.json())
        .then((result) => {
          if (!result.success) {
            setError('form', result.message || '회원가입 처리 중 오류가 발생했습니다.');
            submitBtn.disabled = false;
            return;
          }
          // Signing up does not auto-login — the completion screen sends the user to
          // /login deliberately, and login() there will honor any pending returnTo.
          navigate('signup-complete');
        })
        .catch(() => {
          setError('form', '회원가입 처리 중 오류가 발생했습니다.');
          submitBtn.disabled = false;
        });
    });
  },
};
