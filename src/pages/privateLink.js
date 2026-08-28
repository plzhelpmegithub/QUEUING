// 프리세일·VIP 전용 비공개 링크 진입 페이지 — 백엔드 API 연동 버전 (B Part)

import { getConcert } from '../data/concerts.js';
import { mountCountdown } from '../components/countdown.js';
import { navigate } from '../router.js';

export const privateLinkPage = {
  async render(container, params) {
    // 1. URL 쿼리 파라미터에서 token 추출 (예: /private-link/1?token=eyJ...)
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (!token) {
      container.innerHTML = `
        <div class="container privatelink-page" style="text-align:center; padding:60px 0;">
          <h2 class="section-title text-red">접근 권한 없음</h2>
          <p class="section-sub mt-8">유효한 Private Link 토큰이 존재하지 않습니다.</p>
          <button class="btn btn-primary mt-24" data-home>홈으로 가기</button>
        </div>
      `;
      container.querySelector('[data-home]').addEventListener('click', () => navigate('home'));
      return;
    }

    const c = getConcert(params.id) || { artist: '취소표 공연', title: '시크릿 예매' };

    // 2. 초기 렌더링 (검증 중 상태)
    container.innerHTML = `
      <div class="container privatelink-page">
        <div class="privatelink-badge">🔗 PRIVATE LINK</div>
        <h2 class="section-title">링크 검증 중...</h2>
        <p class="section-sub mt-8">백엔드 서버에서 5분 제한 링크 유효성을 확인하고 있습니다.</p>
        <div class="mt-40 text-center" data-status-box>
          <div class="spinner"></div>
        </div>
      </div>
    `;

    try {
      // 3. 백엔드 토큰 검증 API 호출 (B파트 — Vite 프록시 경유)
      const response = await fetch(`/api/v1/resale/verify-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token })
      });

      const data = await response.json();

      if (!response.ok) {
        // 검증 실패 또는 만료된 경우
        container.innerHTML = `
          <div class="container privatelink-page" style="text-align:center; padding:60px 0;">
            <div class="badge badge-dark-red" style="font-size:13px;padding:8px 16px;margin-bottom:14px;">링크 만료 또는 오류</div>
            <h2 class="section-title">접근할 수 없는 링크입니다</h2>
            <p class="section-sub mt-8" style="color:var(--color-text-secondary);">${data.detail || '이미 사용되었거나 유효 시간이 지난 링크입니다.'}</p>
            <button class="btn btn-outline btn-lg mt-24" data-mypage>마이페이지로 이동</button>
          </div>
        `;
        container.querySelector('[data-mypage]').addEventListener('click', () => navigate('mypage'));
        return;
      }

      // 4. 검증 성공 시 정상적인 입장 화면 구성 (5분 타이머 연동)
      const deadline = Date.now() + (5 * 60 * 1000); // 5분

      container.innerHTML = `
        <div class="container privatelink-page">
          <div class="privatelink-badge">🔗 PRIVATE LINK</div>
          <h2 class="section-title">입장할 차례입니다</h2>
          <p class="section-sub mt-8">회원님의 취소표 예매 링크가 인증되었습니다.<br/>${c.artist} · ${c.title}</p>

          <div class="mt-40" data-cd></div>
          <div class="mt-40" data-cta></div>

          <div class="privatelink-policy">
            <div class="lock-box__icon" style="text-align:left;">🔒 본인 전용 Private Link 검증 완료</div>
            <ul>
              <li>1인 1링크 / 1회성 링크</li>
              <li>5분 유효 제한 적용중</li>
              <li>사용 후 재접속 불가</li>
            </ul>
          </div>
        </div>
      `;

      const ctaEl = container.querySelector('[data-cta]');
      ctaEl.innerHTML = `<button class="btn btn-primary btn-lg btn-block" data-enter>취소표 예매 입장하기</button>`;
      ctaEl.querySelector('[data-enter]').addEventListener('click', () => {
        stop();
        navigate(`cancel-seats/${params.id}`);
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
            <button class="btn btn-outline btn-lg btn-block" data-mypage>마이페이지로 이동</button>
          `;
          ctaEl.querySelector('[data-mypage]').addEventListener('click', () => navigate('mypage'));
        },
      });

      return stop;

    } catch (error) {
      console.error("Private Link 검증 통신 에러:", error);
      container.innerHTML = `
        <div class="container privatelink-page" style="text-align:center; padding:60px 0;">
          <h2 class="section-title">서버 연결 오류</h2>
          <p class="section-sub mt-8">백엔드 서버와 통신할 수 없습니다. 잠시 후 다시 시도해 주세요.</p>
        </div>
      `;
    }
  },
};
