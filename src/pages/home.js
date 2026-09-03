// 홈 페이지 — 추천·인기 공연 카드, 이달의 콘서트 캘린더, 관심 공연 토글을 표시.

import { formatNumber, formatPrice } from '../utils/format.js';
import { mountCalendar } from '../components/calendar.js';
import { buildCalendarEvents } from '../utils/calendarEvents.js';
import { navigate } from '../router.js';
import { isInterested, toggleInterest, subscribe } from '../state/store.js';
import { getConcertImage, getTicketPriceRows } from '../data/concerts.js';

function statusBadge(status) {
  if (status === 'sold_out') return `<span class="badge badge-dark-red">SOLD OUT</span>`;
  if (status === 'closed' || status === 'cancelled') return `<span class="badge badge-outline">마감</span>`;
  return `<span class="badge badge-red">예매중</span>`;
}

export const homePage = {
  render(container) {
    // 일단 뼈대 먼저 렌더링 — LP 히어로/HOT 공연 둘 다 실제 /events 데이터로 채워지므로
    // 그때까지는 로딩 상태만 표시
    container.innerHTML = `
      <section class="hero-section">
        <div class="container hero-grid">
          <div class="lp-hero" data-slider>
            <div class="lp-stage">
              <div class="lp-disc" data-disc>
                <div class="lp-disc__label" data-disc-label>
                  <span class="lp-disc__label-artist" data-disc-artist></span>
                </div>
                <div class="lp-disc__hole"></div>
              </div>
              <div class="lp-tonearm" data-tonearm>
                <div class="lp-tonearm__arm"></div>
                <div class="lp-tonearm__pivot"></div>
              </div>
            </div>
            <div class="lp-hero__info" data-info><p style="color:#ccc;">공연 정보를 불러오는 중...</p></div>
            <div class="slider__arrows" data-arrows style="display:none;">
              <button class="slider__arrow" data-prev type="button">‹</button>
              <button class="slider__arrow" data-next type="button">›</button>
            </div>
            <div class="slider__dots" data-dots></div>
          </div>
          <div class="cal" data-calendar></div>
        </div>
      </section>

      <section class="hot-section">
        <div class="container">
          <div class="eyebrow">LIVE NOW</div>
          <h2 class="section-title">실시간 HOT 공연</h2>
          <p class="section-sub">지금 가장 많은 관심을 받고 있는 공연이에요</p>
          <div class="hot-grid" id="hot-grid">
            <p style="color:#666">공연 목록 불러오는 중...</p>
          </div>
        </div>
      </section>
    `;

    // ---- LP turntable hero ----
    const discEl = container.querySelector('[data-disc]');
    const labelEl = container.querySelector('[data-disc-label]');
    const artistEl = container.querySelector('[data-disc-artist]');
    const tonearmEl = container.querySelector('[data-tonearm]');
    const infoEl = container.querySelector('[data-info]');
    const arrowsEl = container.querySelector('[data-arrows]');
    const dotsEl = container.querySelector('[data-dots]');
    let slides = [];
    let idx = 0;
    let swapTimer1 = null;
    let swapTimer2 = null;
    let rotateTimer = null;

    function paintNow() {
      const e = slides[idx];
      if (!e) return;
      const imgUrl = getConcertImage(e.eventName || e.eventId);
      labelEl.style.background = `url('${imgUrl}') center/cover no-repeat, linear-gradient(135deg,${e.color || '#667eea,#764ba2'})`;
      artistEl.textContent = e.eventName;
      const heroEl = container.querySelector('[data-slider]');
      if (heroEl) {
        heroEl.style.background = `linear-gradient(90deg, rgba(5,4,4,0.92) 0%, rgba(5,4,4,0.7) 40%, rgba(5,4,4,0.3) 100%), url('${imgUrl}') center/cover no-repeat`;
      }
      infoEl.innerHTML = `
        <div class="lp-hero__badges">${statusBadge(e.status)}<span class="badge badge-gray" style="background:rgba(255,255,255,0.16);color:#fff;">${formatNumber(e.totalSeats || 0)}석</span></div>
        <div class="lp-hero__title">${e.eventName}</div>
        <div class="lp-hero__meta">
          <div>공연일<b>${e.eventDate || '-'}</b></div>
          <div>공연장<b>${e.venue || '-'}</b></div>
        </div>
        <button class="btn btn-primary btn-lg" data-book>예매하기</button>
      `;
      infoEl.querySelector('[data-book]').addEventListener('click', () => navigate(`concert/${e.eventId}`));
      [...dotsEl.querySelectorAll('[data-dot]')].forEach((d, i) => d.classList.toggle('active', i === idx));
    }

    function goTo(newIdx) {
      if (slides.length <= 1) return;
      if (swapTimer1) clearTimeout(swapTimer1);
      if (swapTimer2) clearTimeout(swapTimer2);
      tonearmEl.classList.add('lp-tonearm--lift');
      discEl.classList.add('lp-disc--swap');
      infoEl.classList.add('is-swapping');
      swapTimer1 = setTimeout(() => {
        idx = (newIdx + slides.length) % slides.length;
        paintNow();
        discEl.classList.remove('lp-disc--swap');
        infoEl.classList.remove('is-swapping');
      }, 380);
      swapTimer2 = setTimeout(() => {
        tonearmEl.classList.remove('lp-tonearm--lift');
      }, 520);
    }

    function setupHero(events) {
      slides = events;
      idx = 0;
      if (rotateTimer) clearInterval(rotateTimer);

      if (slides.length === 0) {
        infoEl.innerHTML = `<p style="color:#ccc;">등록된 공연이 없습니다.</p>`;
        arrowsEl.style.display = 'none';
        dotsEl.innerHTML = '';
        return;
      }

      dotsEl.innerHTML = slides.map((_, i) => `<span class="slider__dot ${i === 0 ? 'active' : ''}" data-dot="${i}"></span>`).join('');
      dotsEl.querySelectorAll('[data-dot]').forEach((d) => d.addEventListener('click', () => goTo(Number(d.dataset.dot))));
      arrowsEl.style.display = slides.length > 1 ? '' : 'none';
      paintNow();
      if (slides.length > 1) rotateTimer = setInterval(() => goTo(idx + 1), 5000);
    }

    container.querySelector('[data-next]')?.addEventListener('click', () => goTo(idx + 1));
    container.querySelector('[data-prev]')?.addEventListener('click', () => goTo(idx - 1));

    // ---- Calendar ----
    let calendarApi = mountCalendar(container.querySelector('[data-calendar]'), {
      events: buildCalendarEvents([]),
      onSelectConcert: (id) => navigate(`concert/${id}`),
    });

    // ---- API에서 이벤트 불러오기 (HOT 공연 그리드 + LP 히어로 + 캘린더가 전부 이걸 씀) ----
    let latestRealEvents = [];
    fetch('/events')
      .then((res) => res.json())
      .then((data) => {
        const events = data.events || [];
        latestRealEvents = events;
        setupHero(events);
        if (calendarApi) calendarApi.setEvents(buildCalendarEvents(latestRealEvents));

        const grid = container.querySelector('#hot-grid');
        if (events.length === 0) {
          grid.innerHTML = '<p style="color:#666">등록된 공연이 없습니다.</p>';
          return;
        }
        grid.innerHTML = events.map((e, i) => {
          const imgUrl = getConcertImage(e.eventName || e.eventId);
          const ticketPrices = getTicketPriceRows(e)
            .map(({ grade, price }) => `${grade}석 ${formatPrice(price)}`)
            .join(' · ') || '-';
          return `
          <div class="hot-card" data-id="${e.eventId}" style="animation-delay:${i * 0.07}s">
            <div class="hot-card__bg" style="background:url('${imgUrl}') center/cover no-repeat, linear-gradient(135deg,${e.color || '#667eea,#764ba2'})"></div>
            <div class="hot-card__rank">${i + 1}</div>
            <button type="button" class="badge hot-card__heart" data-heart="${e.eventId}">${isInterested(e.eventId) ? '♥' : '♡'}</button>
            <div class="hot-card__overlay"></div>
            <div class="hot-card__info">
              <div class="hot-card__artist">${e.eventName}</div>
              <div class="hot-card__title">${e.eventDate || ''}</div>
              <div class="hot-card__detail">
                공연장 &nbsp;${e.venue || '-'}<br/>
                총 좌석 &nbsp;${e.totalSeats || '-'}석<br/>
                티켓 가격 &nbsp;${ticketPrices}
              </div>
              ${statusBadge(e.status)}
            </div>
          </div>`;
        }).join('');

        // 카드 클릭 이벤트
        grid.querySelectorAll('.hot-card').forEach((card) => {
          card.addEventListener('click', () => navigate(`concert/${card.dataset.id}`));
        });
        // 관심 공연(하트) 토글 — 카드 클릭(예매 상세 이동)으로 안 번지게 stopPropagation
        grid.querySelectorAll('[data-heart]').forEach((el) => {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleInterest(el.dataset.heart);
          });
        });
      })
      .catch(() => {
        container.querySelector('#hot-grid').innerHTML = '<p style="color:#e31b23">공연 목록을 불러오지 못했습니다.</p>';
        infoEl.innerHTML = `<p style="color:#e31b23;">공연 정보를 불러오지 못했습니다.</p>`;
      });

    // 하트를 다른 화면(마이페이지 등)에서 눌러도, 또는 이 화면에서 눌러도
    // 하트 표시와 캘린더가 같이 갱신되도록 store 변경을 구독
    const unsubInterest = subscribe(() => {
      container.querySelectorAll('[data-heart]').forEach((el) => {
        el.textContent = isInterested(el.dataset.heart) ? '♥' : '♡';
      });
      if (calendarApi) calendarApi.setEvents(buildCalendarEvents(latestRealEvents));
    });

    return () => {
      unsubInterest();
      if (rotateTimer) clearInterval(rotateTimer);
      if (swapTimer1) clearTimeout(swapTimer1);
      if (swapTimer2) clearTimeout(swapTimer2);
    };
  },
};
