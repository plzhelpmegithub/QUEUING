import { CONCERTS, getConcertStatus } from '../data/concerts.js';
import { formatDateRange, formatNumber } from '../utils/format.js';
import { mountCalendar } from '../components/calendar.js';
import { buildCalendarEvents } from '../utils/calendarEvents.js';
import { navigate } from '../router.js';
import { isInterested } from '../state/store.js';

const SLIDE_IDS = ['enh-2026-orbit', 'aespa-2026-synk', 'lsf-2026-crazy', 'svt-2026-newz', 'iu-2026-hereg', 'skz-2026-domin'];
const SLIDES = SLIDE_IDS.map((id) => CONCERTS.find((c) => c.id === id)).filter(Boolean);
const HOT = [...CONCERTS]
  .filter((c) => c.hot)
  .sort((a, b) => b.views - a.views)
  .slice(0, 5);

function statusBadge(c) {
  const st = getConcertStatus(c);
  if (st === 'soldout') return `<span class="badge badge-dark-red">SOLD OUT</span>`;
  if (st === 'upcoming') return `<span class="badge badge-outline">예매 예정</span>`;
  return `<span class="badge badge-red">예매중</span>`;
}

export const homePage = {
  render(container) {
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
          <div class="hot-grid">
            ${HOT.map(
              (c, i) => `
              <div class="hot-card" data-id="${c.id}">
                <div class="hot-card__bg" style="background:${c.grad}"></div>
                <div class="hot-card__rank">${i + 1}</div>
                <div class="hot-card__live"><span class="badge badge-red">● LIVE</span></div>
                <div class="hot-card__overlay"></div>
                <div class="hot-card__info">
                  <div class="hot-card__artist">${c.artist}</div>
                  <div class="hot-card__title">${c.title}</div>
                  <div class="hot-card__detail">
                    공연일 &nbsp;${formatDateRange(c.dateStart, c.dateEnd)}<br/>
                    공연장 &nbsp;${c.venue}<br/>
                    총 좌석 &nbsp;${formatNumber(c.totalSeats)}석<br/>
                    ${isInterested(c.id) ? '♥ 관심 등록됨' : `👀 ${formatNumber(c.views)}명 조회중`}
                  </div>
                </div>
              </div>`
            ).join('')}
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
    const dots = [...container.querySelectorAll('[data-dot]')];
    let idx = 0;
    let swapTimer1 = null;
    let swapTimer2 = null;

    function paintNow() {
      const c = SLIDES[idx];
      labelEl.style.background = c.grad;
      artistEl.textContent = c.artist;
      infoEl.innerHTML = `
        <div class="lp-hero__badges">${statusBadge(c)}<span class="badge badge-gray" style="background:rgba(255,255,255,0.16);color:#fff;">${formatNumber(c.totalSeats)}석</span></div>
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

    // ---- Hot cards ----
    container.querySelectorAll('.hot-card').forEach((c) => {
      c.addEventListener('click', () => navigate(`concert/${c.dataset.id}`));
    });

    // ---- Calendar ----
    mountCalendar(container.querySelector('[data-calendar]'), {
      events: buildCalendarEvents(),
      onSelectConcert: (id) => navigate(`concert/${id}`),
    });

    return () => {
      clearInterval(timer);
      if (swapTimer1) clearTimeout(swapTimer1);
      if (swapTimer2) clearTimeout(swapTimer2);
    };
  },
};
