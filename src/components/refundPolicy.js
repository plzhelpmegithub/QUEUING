// 취소/환불 정책 UI 컴포넌트 — 결제 페이지, 공연 상세, 마이페이지 환불 흐름에서 공용으로 사용.
// mountRefundSummary: 인라인 요약 표시, mountRefundPolicyModal: 전체 정책을 모달로 표시.

import { openModal } from './modal.js';
import {
  REFUND_SUMMARY,
  CANCEL_DEADLINE_NOTICE,
  FEE_TABLE,
  FEE_NOTE,
  REFUND_METHODS,
  SHOW_CANCEL_NOTICE,
  SCHEDULE_CHANGE_NOTICE,
  HOLD_VS_REFUND_NOTICE,
  CANCEL_TICKET_RULES,
  PRIVATE_LINK_NOTICE,
} from '../data/refundPolicy.js';

function policyBodyHtml() {
  return `
    <section class="policy-section">
      <h4>예매 취소</h4>
      <p>${CANCEL_DEADLINE_NOTICE}</p>
    </section>

    <section class="policy-section">
      <h4>취소 수수료</h4>
      <table class="policy-table">
        ${FEE_TABLE.map((row) => `<tr><td>${row.period}</td><td>${row.fee}</td></tr>`).join('')}
      </table>
      <p class="policy-note">${FEE_NOTE}</p>
    </section>

    <section class="policy-section">
      <h4>환불 방법</h4>
      ${REFUND_METHODS.map((m) => `<div class="policy-kv"><b>${m.method}</b><span>${m.desc}</span></div>`).join('')}
    </section>

    <section class="policy-section">
      <h4>공연 취소</h4>
      <p>${SHOW_CANCEL_NOTICE}</p>
    </section>

    <section class="policy-section">
      <h4>공연 일정 변경</h4>
      <p>${SCHEDULE_CHANGE_NOTICE}</p>
    </section>

    <section class="policy-section">
      <h4>좌석 결제 제한시간</h4>
      <p>${HOLD_VS_REFUND_NOTICE}</p>
    </section>

    <section class="policy-section">
      <h4>취소표 관련 규정</h4>
      <ul class="policy-list">
        ${CANCEL_TICKET_RULES.map((r) => `<li>${r}</li>`).join('')}
      </ul>
    </section>

    <section class="policy-section">
      <h4>Private Link 관련 규정</h4>
      <p>${PRIVATE_LINK_NOTICE}</p>
    </section>
  `;
}

export function openRefundPolicyModal() {
  openModal({
    title: '취소 및 환불 규정',
    size: 'modal-lg',
    bodyHtml: policyBodyHtml(),
    footerHtml: `<button type="button" class="btn btn-primary btn-block" data-modal-close>확인했습니다</button>`,
  });
}

/** Renders the compact summary + "자세히 보기" trigger used on the detail & payment pages. */
export function mountRefundSummary(el, { compact = false } = {}) {
  el.innerHTML = `
    <div class="refund-summary ${compact ? 'refund-summary--compact' : ''}">
      <div class="refund-summary__text">
        <div class="refund-summary__title">취소 및 환불 규정</div>
        <div class="refund-summary__desc">${REFUND_SUMMARY}</div>
      </div>
      <button type="button" class="btn btn-outline btn-sm" data-open-refund-policy>자세히 보기</button>
    </div>
  `;
  el.querySelector('[data-open-refund-policy]').addEventListener('click', openRefundPolicyModal);
}
