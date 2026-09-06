// 매진 안내 모달 컴포넌트 — 마지막 좌석이 팔리는 순간 한 번만 표시된다.
// 멤버십 보유 시 취소표 대기열에 자동 등록하고 대기번호를 안내한다.

import { getSelectedSession, getState, hasMembership } from '../state/store.js';
import { openModal, closeModal } from './modal.js';
import { navigate } from '../router.js';
import { formatNumber } from '../utils/format.js';
import { joinCancelQueueApi } from '../utils/backendApi.js';

// Shown once, wherever the user happens to be (zone overview or seat-detail
// screen), the moment a concert's very last seat across every zone is gone.
export function showSoldOutModal(concertId) {
  if (hasMembership()) {
    openModal({
      title: '매진 안내',
      bodyHtml: '<p>본 콘서트의 티켓이 마감되었습니다.<br/>취소표 대기열에 등록하는 중입니다...</p>',
      footerHtml: '',
    });
    const userId = getState().user?.userId || getState().user?.email;
    const session = getSelectedSession(concertId) || {};
    joinCancelQueueApi(userId, {
      eventId: concertId,
      sessionDate: session.date || '',
      sessionTime: session.time || '',
    }).then(({ ok, data }) => {
      const position = data.standbyPosition || data.position;
      openModal({
        title: ok && position ? '취소표 대기 등록 완료' : '매진 안내',
        bodyHtml: ok && position
          ? `<p>본 콘서트의 티켓이 마감되었습니다.</p><p class="mt-16">취소표 대기번호는 <b class="text-red">${formatNumber(position)}</b>번입니다.<br/>대기 순번이 되면 Secret Link가 발급됩니다.</p>`
          : `<p>${data.message || '취소표 대기열 등록에 실패했습니다.'}</p>`,
        footerHtml: `<button type="button" class="btn btn-primary btn-block" data-modal-close data-confirm>확인</button>`,
      });
      document.querySelector('[data-confirm]')?.addEventListener('click', () => navigate(`cancel-queue/${concertId}`));
    }).catch(() => {
      openModal({
        title: '매진 안내',
        bodyHtml: '<p>취소표 대기열 등록에 실패했습니다.<br/>잠시 후 다시 시도해주세요.</p>',
        footerHtml: `<button type="button" class="btn btn-primary btn-block" data-modal-close>확인</button>`,
      });
    });
  } else {
    openModal({
      title: '매진 안내',
      bodyHtml: `
        <p>본 콘서트의 티켓이 마감되었습니다.</p>
        <p class="mt-16 text-secondary" style="font-size:13px;">다음 콘서트에서는 취소 티켓팅 대기를 하고 싶으시면?</p>
      `,
      footerHtml: `
        <button type="button" class="btn btn-outline" data-modal-close>닫기</button>
        <button type="button" class="btn btn-primary" data-join-membership>멤버십 가입</button>
      `,
    });
    document.querySelector('[data-join-membership]')?.addEventListener('click', () => {
      closeModal();
      navigate('membership');
    });
  }
}
