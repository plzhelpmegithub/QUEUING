// 홈 페이지 전용 렌더링 헬퍼 — 추천/인기 공연 카드 HTML을 생성하는 함수 모음.
// (컴포넌트 렌더링 로직을 home.js에서 분리해 파일 크기를 줄임)

import { CONCERTS, getConcertStatus } from '../data/concerts.js';
import { formatDateRange, formatNumber } from '../utils/format.js';
import { mountCalendar } from '../components/calendar.js';
import { buildCalendarEvents } from '../utils/calendarEvents.js';
import { navigate } from '../router.js';
import { isInterested, toggleInterest, subscribe } from '../state/store.js';

const SLIDE_IDS = ['bts-2027-eternal', 'bp-2027-finale', 'ive-2026-crown', 'aespa-2027-synkhorizon', 'lsf-2027-fearless', 'skz-2026-unchained'];
const SLIDES = SLIDE_IDS.map((id) => CONCERTS.find((c) => c.id === id)).filter(Boolean);

function statusBadge(status) {
  if (status === 'sold_out') return `<span class="badge badge-dark-red">SOLD OUT</span>`;
  if (status === 'closed') return `<span class="badge badge-outline">마감</span>`;
  return `<span class="badge badge-red">예매중</span>`;
}

export const homePage = {
  render(container) {
    // 일단 뼈대 먼저 렌더링
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
            <div class="lp-hero__info" data-info></div>
            <div class="slider__arrows">
              <button class="slider__arrow" data-prev type="button">‹</button>
              <button class="slider__arrow" data-next type="button">›</button>
            </div>
            <div class="slider__dots" data-dots>
              ${SLIDES.map((_, i) => `<span class="slider__dot ${i === 0 ? 'active' : ''}" data-dot="${i}"></span>`).join('')}
            </div>
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

    // ---- API에서 이벤트 불러오기 ----
    let latestRealEvents = [];
    let calendarApi = null;
    fetch('/events')
      .then((res) => res.json())
      .then((data) => {
        const events = data.events || [];
        latestRealEvents = events;
        const grid = container.querySelector('#hot-grid');
        if (events.length === 0) {
          grid.innerHTML = '<p style="color:#666">등록된 공연이 없습니다.</p>';
          return;
        }
        grid.innerHTML = events.map((e, i) => `
          <div class="hot-card" data-id="${e.eventId}">
            <div class="hot-card__bg" style="background:linear-gradient(135deg,${e.color || '#667eea,#764ba2'})"></div>
            <div class="hot-card__rank">${i + 1}</div>
            <button type="button" class="badge hot-card__heart" data-heart="${e.eventId}">${isInterested(e.eventId) ? '♥' : '♡'}</button>
            <div class="hot-card__overlay"></div>
            <div class="hot-card__info">
              <div class="hot-card__artist">${e.eventName}</div>
              <div class="hot-card__title">${e.eventDate || ''}</div>
              <div class="hot-card__detail">
                공연장 &nbsp;${e.venue || '-'}<br/>
                총 좌석 &nbsp;${e.totalSeats || '-'}석<br/>
                가격 &nbsp;${e.price ? Number(e.price).toLocaleString() + '원' : '-'}
              </div>
              ${statusBadge(e.status)}
            </div>
          </div>
        `).join('');

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
        if (calendarApi) calendarApi.setEvents(buildCalendarEvents(latestRealEvents));
      })
      .catch(() => {
        container.querySelector('#hot-grid').innerHTML = '<p style="color:#e31b23">공연 목록을 불러오지 못했습니다.</p>';
      });

    // ---- LP turntable hero ----
    const discEl = container.querySelector('[data-disc]');
    const labelEl = container.querySelector('[data-disc-label]');
    const artistEl = container.querySelector('[data-disc-artist]');
    const tonearmEl = container.querySelector('[data-tonearm]');
    const infoEl = container.querySelector('[data-info]');
    const dots = [...container.querySelectorAll('[data-dot]')];
    let idx = 0;
    let swapTimer1 = null;
    let swapTimer2 = null;

    function paintNow() {
      const c = SLIDES[idx];
      labelEl.style.background = c.grad;
      artistEl.textContent = c.artist;
      infoEl.innerHTML = `
        <div class="lp-hero__badges">${statusBadge(getConcertStatus(c))}<span class="badge badge-gray" style="background:rgba(255,255,255,0.16);color:#fff;">${formatNumber(c.totalSeats)}석</span></div>
        <div class="lp-hero__artist">${c.artist}</div>
        <div class="lp-hero__title">${c.title}</div>
        <div class="lp-hero__meta">
          <div>공연일<b>${formatDateRange(c.dateStart, c.dateEnd)}</b></div>
          <div>공연장<b>${c.venue}</b></div>
        </div>
        <button class="btn btn-primary btn-lg" data-book>예매하기</button>
      `;
      infoEl.querySelector('[data-book]').addEventListener('click', () => navigate(`concert/${c.id}`));
      dots.forEach((d, i) => d.classList.toggle('active', i === idx));
    }

    function goTo(newIdx) {
      if (swapTimer1) clearTimeout(swapTimer1);
      if (swapTimer2) clearTimeout(swapTimer2);
      tonearmEl.classList.add('lp-tonearm--lift');
      discEl.classList.add('lp-disc--swap');
      infoEl.classList.add('is-swapping');
      swapTimer1 = setTimeout(() => {
        idx = (newIdx + SLIDES.length) % SLIDES.length;
        paintNow();
        discEl.classList.remove('lp-disc--swap');
        infoEl.classList.remove('is-swapping');
      }, 380);
      swapTimer2 = setTimeout(() => {
        tonearmEl.classList.remove('lp-tonearm--lift');
      }, 520);
    }

    paintNow();
    const timer = setInterval(() => goTo(idx + 1), 5000);
    container.querySelector('[data-next]').addEventListener('click', () => goTo(idx + 1));
    container.querySelector('[data-prev]').addEventListener('click', () => goTo(idx - 1));
    dots.forEach((d) => d.addEventListener('click', () => goTo(Number(d.dataset.dot))));

    // ---- Calendar ----
    calendarApi = mountCalendar(container.querySelector('[data-calendar]'), {
      events: buildCalendarEvents(latestRealEvents),
      onSelectConcert: (id) => navigate(`concert/${id}`),
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
      clearInterval(timer);
      if (swapTimer1) clearTimeout(swapTimer1);
      if (swapTimer2) clearTimeout(swapTimer2);
    };
  },
};
