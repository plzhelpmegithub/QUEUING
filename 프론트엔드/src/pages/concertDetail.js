import { getConcert, getConcertStatus } from '../data/concerts.js';
import { formatDateRange, formatDate, formatPrice, formatNumber } from '../utils/format.js';
import { mountServerClock, mountBookingCountdown } from '../components/countdown.js';
import { mountLiveChat } from '../components/liveChat.js';
import { navigate } from '../router.js';
import { isLoggedIn, isInterested, toggleInterest, setReturnTo, subscribe } from '../state/store.js';

export const concertDetailPage = {
  render(container, params) {
    const c = getConcert(params.id);
    if (!c) {
      container.innerHTML = `<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>`;
      return;
    }

    let status = getConcertStatus(c);

    container.innerHTML = `
      <section class="detail-hero" style="background:${c.grad}">
        <div class="detail-hero__overlay"></div>
        <div class="container detail-hero__content">
          <div class="detail-hero__artist">${c.artist}</div>
          <div class="detail-hero__title">${c.title}</div>
          <dl class="detail-hero__meta">
            <div><dt>공연일</dt><dd>${formatDateRange(c.dateStart, c.dateEnd)}</dd></div>
            <div><dt>공연장</dt><dd>${c.venue}</dd></div>
            <div><dt>총 좌석</dt><dd>${formatNumber(c.totalSeats)}석</dd></div>
          </dl>
        </div>
      </section>

      <div class="container detail-body">
        <div>
          <div class="detail-info-card">
            <h3>공연 정보</h3>
            <p style="font-size:14px;line-height:1.9;color:var(--color-text-secondary);">${c.desc}</p>
          </div>
          <div class="detail-info-card">
            <h3>티켓 가격</h3>
            ${c.grades
              .map((g) => `<div class="price-row"><span>${g.name}</span><b>${formatPrice(g.price)}</b></div>`)
              .join('')}
          </div>
          <div class="detail-info-card">
            <h3>예매 유의사항</h3>
            <div class="notice-box">
              <p>· 본 공연은 1인 최대 2매까지 예매 가능합니다.</p>
              <p>· 예매 후 취소 시 취소 수수료가 부과될 수 있습니다.</p>
              <p>· 매진 이후 좌석 선택 화면까지 진입했던 회원은 <strong>취소표 대기열</strong> 대상자로 자동 등록됩니다.</p>
              <p>· 실명 확인 및 본인 입장이 원칙입니다.</p>
            </div>
          </div>
        </div>

        <div class="detail-right-col">
          <div class="booking-panel" data-panel></div>
          <div class="live-panel" data-live></div>
        </div>
      </div>
    `;

    const heartBtn = () => container.querySelector('[data-heart]');
    let panelStops = [];

    function renderPanel() {
      panelStops.forEach((stop) => stop());
      panelStops = [];
      const panel = container.querySelector('[data-panel]');
      status = getConcertStatus(c);

      if (status === 'soldout') {
        panel.innerHTML = `
          <div class="badge badge-dark-red" style="font-size:14px;padding:8px 18px;margin-bottom:18px;">SOLD OUT</div>
          <div style="font-size:14px;color:var(--color-text-secondary);line-height:1.8;margin-bottom:22px;">
            티켓이 모두 매진되었습니다.<br/>취소표 대기열에서 기회를 잡아보세요.
          </div>
          <button class="btn btn-primary btn-block" data-goto-cancel>취소표 대기열 확인</button>
          <button class="btn btn-ghost btn-block mt-8" data-heart>${isInterested(c.id) ? '♥ 관심 공연 등록됨' : '♡ 관심 공연 등록'}</button>
        `;
        panel.querySelector('[data-goto-cancel]').addEventListener('click', () => navigate(`cancel-queue/${c.id}`));
      } else if (status === 'upcoming') {
        panel.innerHTML = `
          <div class="booking-panel__seats-left">현재 남은 좌석</div>
          <div class="booking-panel__seats-num num-mono">${formatNumber(c.totalSeats)}석</div>
          <div data-clock></div>
          <div class="countdown-block" data-cd></div>
          <button class="btn btn-primary btn-block" disabled>예매하기</button>
          <button class="btn btn-ghost btn-block mt-8" data-heart>${isInterested(c.id) ? '♥ 관심 공연 등록됨' : '♡ 관심 공연 등록'}</button>
        `;
        panelStops.push(mountServerClock(panel.querySelector('[data-clock]')));
        panelStops.push(
          mountBookingCountdown(panel.querySelector('[data-cd]'), {
            targetMs: new Date(c.bookingOpenAt).getTime(),
            onComplete: () => renderPanel(),
          })
        );
      } else {
        panel.innerHTML = `
          <div class="booking-panel__seats-left">현재 남은 좌석</div>
          <div class="booking-panel__seats-num num-mono">${formatNumber(c.totalSeats)}석</div>
          <div class="badge badge-red" style="margin-bottom:18px;">● 예매 진행중</div>
          <button class="btn btn-primary btn-block" data-book>예매하기</button>
          <button class="btn btn-ghost btn-block mt-8" data-heart>${isInterested(c.id) ? '♥ 관심 공연 등록됨' : '♡ 관심 공연 등록'}</button>
        `;
        panel.querySelector('[data-book]').addEventListener('click', () => {
          if (!isLoggedIn()) {
            setReturnTo(`concert/${c.id}`);
            navigate('login');
            return;
          }
          navigate(`queue/${c.id}`);
        });
      }

      panel.querySelector('[data-heart]')?.addEventListener('click', () => toggleInterest(c.id));
    }

    renderPanel();
    const unsub = subscribe(() => {
      const btn = heartBtn();
      if (btn) btn.textContent = isInterested(c.id) ? '♥ 관심 공연 등록됨' : '♡ 관심 공연 등록';
    });

    const stopChat = mountLiveChat(container.querySelector('[data-live]'), {
      concertId: c.id,
      artist: c.artist,
    });

    return () => {
      unsub();
      stopChat();
      panelStops.forEach((stop) => stop());
    };
  },
};
