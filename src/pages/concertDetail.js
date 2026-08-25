// 공연 상세 페이지 — 공연 정보, 예매오픈 카운트다운, 좌석 등급별 가격,
// 관심 공연 토글, 실시간 채팅(liveChat), 취소/환불 정책 안내를 포함.

import { formatPrice, formatNumber, formatDeadline } from '../utils/format.js';
import { mountRefundSummary } from '../components/refundPolicy.js';
import { mountLiveChat } from '../components/liveChat.js';
import { navigate } from '../router.js';
import { isLoggedIn, setReturnTo } from '../state/store.js';

export const concertDetailPage = {
  render(container, params) {
    // 로딩 표시
    container.innerHTML = `<div class="center-state"><div class="center-state__title">공연 정보 불러오는 중...</div></div>`;

    let destroyed = false;
    let openTimer = null;
    let chatCleanup = null;

    // /events 전체 조회 후 eventId로 찾기
    fetch('/events')
      .then((res) => res.json())
      .then((data) => {
        if (destroyed) return;
        const c = (data.events || []).find((e) => e.eventId === params.id);
        if (!c) {
          container.innerHTML = `<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>`;
          return;
        }

        const bgColor = `linear-gradient(135deg,${c.color || '#667eea,#764ba2'})`;

        container.innerHTML = `
          <section class="detail-hero" style="background:${bgColor}">
            <div class="detail-hero__overlay"></div>
            <div class="container detail-hero__content">
              <div class="detail-hero__artist">${c.eventName}</div>
              <div class="detail-hero__title">${c.eventDate || ''}</div>
              <dl class="detail-hero__meta">
                <div><dt>공연일</dt><dd>${c.eventDate || '-'}</dd></div>
                <div><dt>공연장</dt><dd>${c.venue || '-'}</dd></div>
                <div><dt>총 좌석</dt><dd>${formatNumber(c.totalSeats)}석</dd></div>
              </dl>
            </div>
          </section>

          <div class="container detail-body">
            <div>
              <div class="detail-info-card">
                <h3>공연 정보</h3>
                <p style="font-size:14px;line-height:1.9;color:var(--color-text-secondary);">
                  ${c.eventName} 공연입니다.
                </p>
              </div>
              <div class="detail-info-card">
                <h3>티켓 가격</h3>
                ${
                  (c.sections || []).length
                    ? c.sections
                        .map((s) => `<div class="price-row"><span>${s.label || s.name}석</span><b>${formatPrice(s.price)}</b></div>`)
                        .join('')
                    : `<div class="price-row"><span>일반석</span><b>${formatPrice(c.price)}</b></div>`
                }
              </div>
              <div class="detail-info-card">
                <h3>예매 유의사항</h3>
                <div class="notice-box">
                  <p>· <strong>한 회차당 1매, 인당 최대 2매</strong> 구매 가능합니다.</p>
                  <p>· 예매 후 취소 시 취소 수수료가 부과될 수 있습니다.</p>
                  <p>· <strong>멤버십 가입자</strong>에 한해 매진 이후 좌석 선택 화면까지 진입했던 회원은 <strong>취소표 대기열</strong> 대상자로 자동 등록됩니다.</p>
                  <p>· 실명 확인 및 본인 입장이 원칙입니다.</p>
                </div>
              </div>
              <div class="detail-info-card" data-refund-summary></div>
            </div>

            <div class="detail-right-col">
              <div class="booking-panel" data-panel>
                <div class="booking-panel__seats-left">현재 남은 좌석</div>
                <div class="booking-panel__seats-num num-mono">${formatNumber(c.totalSeats)}석</div>
                <div class="badge badge-red" data-status-badge style="margin-bottom:18px;">● 예매 진행중</div>
                <button class="btn btn-primary btn-block" data-book>예매하기</button>
              </div>
              <div class="live-panel" data-live></div>
            </div>
          </div>
        `;

        // 예매하기 버튼
        container.querySelector('[data-book]')?.addEventListener('click', () => {
          if (!isLoggedIn()) {
            setReturnTo(`concert/${c.eventId}`);
            navigate('login');
            return;
          }
          navigate(`booking/${c.eventId}`);
        });

        mountRefundSummary(container.querySelector('[data-refund-summary]'));
        chatCleanup = mountLiveChat(container.querySelector('[data-live]'), {
          concertId: c.eventId,
          artist: c.eventName,
        });

        // 예매 오픈 시각: 관리자가 이 공연에 직접 지정한 시각(c.ticketOpenAt —
        // 어드민 "오픈 시간 설정" 기능, admin.js)이 있으면 그걸 우선 쓰고, 없으면
        // 기존 글로벌 예약 스케줄(/admin/ticketing/schedule)을 그대로 따른다.
        // 카운트다운은 [예매하기] 버튼 안에 직접 표시(별도 문구 영역 없음)하고,
        // 남은 시간과 무관하게 오픈 시각이 정해져 있으면 항상 보여준다 — 예전엔
        // "5분 이내일 때만 노출"이라 10분 후 오픈처럼 5분보다 긴 대기에서는
        // 카운트다운이 아예 안 보이는(그래서 "표시 안 됨"으로 보이는) 버그가 있었음.
        const bookBtn = container.querySelector('[data-book]');
        const statusBadge = container.querySelector('[data-status-badge]');

        function startOpenCountdown(openAtMs) {
          function paint() {
            const remaining = openAtMs - Date.now();
            if (remaining <= 0) {
              clearInterval(openTimer);
              openTimer = null;
              bookBtn.disabled = false;
              bookBtn.textContent = '예매하기';
              bookBtn.classList.remove('btn--countdown');
              if (statusBadge) {
                statusBadge.textContent = '● 예매 진행중';
                statusBadge.classList.remove('badge-gray');
                statusBadge.classList.add('badge-red');
              }
              return;
            }
            bookBtn.disabled = true;
            bookBtn.classList.add('btn--countdown');
            // formatDeadline은 하루 이내는 "00:10:00" 형태, 그 이상은 "D-2 03:00:00"처럼
            // 압축 표시돼서 오픈 시각이 며칠 뒤라도 버튼 안에서 줄바꿈 없이 들어감.
            bookBtn.textContent = `예매 시작까지 ${formatDeadline(remaining)}`;
            // 오픈 전엔 "예매 진행중"이 혼란을 주므로 "예매 오픈 예정"으로 바꿔둠
            if (statusBadge) {
              statusBadge.textContent = '● 예매 오픈 예정';
              statusBadge.classList.remove('badge-red');
              statusBadge.classList.add('badge-gray');
            }
          }
          paint();
          openTimer = setInterval(paint, 1000);
        }

        if (c.ticketOpenAt) {
          const openAtMs = new Date(c.ticketOpenAt).getTime();
          if (!Number.isNaN(openAtMs)) startOpenCountdown(openAtMs);
        } else {
          fetch('/admin/ticketing/schedule')
            .then((r) => r.json())
            .then((sched) => {
              if (destroyed) return;
              if (!sched.scheduled || !sched.openAt) return;
              const openAtMs = new Date(sched.openAt).getTime();
              if (Number.isNaN(openAtMs)) return;
              startOpenCountdown(openAtMs);
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        if (!destroyed) {
          container.innerHTML = `<div class="center-state"><div class="center-state__title">공연 정보를 불러오지 못했습니다.</div></div>`;
        }
      });

    return () => {
      destroyed = true;
      if (openTimer) clearInterval(openTimer);
      if (chatCleanup) chatCleanup();
    };
  },
};
