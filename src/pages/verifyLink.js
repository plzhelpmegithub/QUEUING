// [보존 / DO NOT DELETE] A파트 취소표 Secret Link 검증 진입점.
// B파트의 별도 사이트가 추가되어도 A파트 local SMTP/fallback 링크를 검증하는
// 기존 화면이므로 삭제하거나 일반 로그인 흐름으로 대체하지 않는다.
import { navigate } from '../router.js';
import { login, getState } from '../state/store.js';

export const verifyLinkPage = {
  render(container, _params, query) {
    const linkToken = query.linkToken || query.token || '';

    if (!linkToken) {
      container.innerHTML = `
        <div class="container auth-page" style="text-align:center;padding-top:80px;">
          <h2>유효하지 않은 링크</h2>
          <p class="mt-16">취소표 링크가 올바르지 않습니다.</p>
          <button class="btn btn-primary btn-lg mt-40" data-home>홈으로</button>
        </div>`;
      container.querySelector('[data-home]')?.addEventListener('click', () => navigate(''));
      return;
    }

    container.innerHTML = `
      <div class="container auth-page" style="text-align:center;padding-top:80px;">
        <div class="privatelink-badge">🔗 SECRET LINK</div>
        <h2 class="section-title mt-16">취소표 링크 확인 중...</h2>
        <p class="section-sub mt-8">잠시만 기다려주세요.</p>
      </div>`;

    fetch('/verify-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: linkToken }),
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || !data.valid) {
          container.innerHTML = `
            <div class="container auth-page" style="text-align:center;padding-top:80px;">
              <div class="privatelink-badge">🔗 SECRET LINK</div>
              <h2 class="section-title mt-16">링크가 만료되었습니다</h2>
              <p class="section-sub mt-8">${data.message || '취소표 링크가 유효하지 않거나 만료되었습니다.'}</p>
              <button class="btn btn-primary btn-lg mt-40" data-home>홈으로</button>
            </div>`;
          container.querySelector('[data-home]')?.addEventListener('click', () => navigate(''));
          return;
        }

        // 링크 검증에 성공하면 현재 브라우저가 이미 로그인되어 있더라도
        // 일반 사용자 토큰을 유지하지 않고, 해당 allocation에 묶인
        // 취소표 전용 세션 토큰으로 교체한다. 그렇지 않으면 좌석 선점 시
        // API가 일반 Admission Token을 찾게 되어 로컬 SMTP 흐름이 실패한다.
        login({
          name: (data.userId || '').split('@')[0] || '취소표 사용자',
          email: data.userId,
          isAdmin: false,
          role: 'USER',
          userId: data.userId,
          phone: '',
          birthDate: '',
          accessToken: data.accessToken || '',
          refreshToken: '',
        });

        navigate(`private-link/${encodeURIComponent(data.eventId)}`);
      })
      .catch(() => {
        container.innerHTML = `
          <div class="container auth-page" style="text-align:center;padding-top:80px;">
            <h2>오류 발생</h2>
            <p class="mt-16">링크 확인 중 오류가 발생했습니다. 다시 시도해주세요.</p>
            <button class="btn btn-primary btn-lg mt-40" data-home>홈으로</button>
          </div>`;
        container.querySelector('[data-home]')?.addEventListener('click', () => navigate(''));
      });
  },
};
