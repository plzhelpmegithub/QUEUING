// 홈 페이지 — LP 히어로, 관심 등록 수 기준 HOT 공연, 오픈 예정/전체 공연을 표시.

import { formatNumber, formatPrice } from '../utils/format.js';
import { mountCalendar } from '../components/calendar.js';
import { buildCalendarEvents } from '../utils/calendarEvents.js';
import { navigate } from '../router.js';
import { isInterested, toggleInterest, subscribe } from '../state/store.js';
import { getConcertImage, getTicketPriceRows } from '../data/concerts.js';

function effectiveStatus(event) {
  const s = event.status || 'open';
  if (s === 'sold_out' || s === 'cancelled' || s === 'closed') return s;
  const closeTime = event.ticketCloseAt ? new Date(event.ticketCloseAt).getTime() : NaN;
  if (Number.isFinite(closeTime) && closeTime <= Date.now()) return 'closed';
  return s;
}

function statusBadge(status) {
  if (status === 'sold_out') return `<span class="badge badge-dark-red">SOLD OUT</span>`;
  if (status === 'closed' || status === 'cancelled') return `<span class="badge badge-outline">마감</span>`;
  return `<span class="badge badge-red">예매중</span>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function getOpenAt(event) {
  return event.ticketOpenAt || event.bookingOpenAt || null;
}

function isUpcoming(event) {
  const openAt = getOpenAt(event);
  const timestamp = openAt ? new Date(openAt).getTime() : NaN;
  return Number.isFinite(timestamp)
    && timestamp > Date.now()
    && event.status !== 'closed'
    && event.status !== 'cancelled';
}

function formatOpenAt(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '예매 오픈 일정 확인 필요';
  return `예매 오픈 ${date.toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function ticketPrices(event) {
  return getTicketPriceRows(event)
    .map(({ grade, price }) => `${escapeHtml(grade)}석 ${formatPrice(price)}`)
    .join(' · ') || '-';
}

function backgroundStyle(event) {
  const imageUrl = getConcertImage(event.eventName || event.eventId);
  return `url('${imageUrl}') top center/cover no-repeat, linear-gradient(135deg,${event.color || '#667eea,#764ba2'})`;
}

function hotCardHtml(event, index, interestCount) {
  const name = escapeHtml(event.eventName || event.eventId || '공연');
  const date = escapeHtml(event.eventDate || '-');
  const venue = escapeHtml(event.venue || '-');
  const totalSeats = formatNumber(event.totalSeats || 0);
  return `
    <article class="hot-card" data-event-card="${escapeHtml(event.eventId)}" style="animation-delay:${index * 0.07}s">
      <div class="hot-card__bg" style="background:${backgroundStyle(event)}"></div>
      <div class="hot-card__rank">${index + 1}</div>
      <button type="button" class="badge hot-card__heart" data-heart="${escapeHtml(event.eventId)}" aria-label="관심 공연 ${name}">${isInterested(event.eventId) ? '♥' : '♡'}</button>
      <div class="hot-card__overlay"></div>
      <div class="hot-card__info">
        <div class="hot-card__title">${name}</div>
        <div class="hot-card__detail">
          공연일 &nbsp;${date}<br/>
          공연장 &nbsp;${venue}<br/>
          총 좌석 &nbsp;${totalSeats}석<br/>
          티켓 가격 &nbsp;${ticketPrices(event)}
        </div>
        ${isUpcoming(event) ? '<span class="badge badge-gray">예매예정</span>' : statusBadge(effectiveStatus(event))}
      </div>
    </article>`;
}

function posterCardHtml(event, index, interestCount, upcoming = false) {
  const name = escapeHtml(event.eventName || event.eventId || '공연');
  const date = escapeHtml(event.eventDate || '-');
  const venue = escapeHtml(event.venue || '-');
  const eventId = escapeHtml(event.eventId);
  const imageUrl = getConcertImage(event.eventName || event.eventId);
  const openInfo = upcoming
    ? formatOpenAt(getOpenAt(event))
    : `${date} · ${venue}`;

  return `
    <article class="home-poster-card fade-in" style="animation-delay:${(index || 0) * 0.05}s">
      <div class="home-poster-card__media" data-event-open="${eventId}">
        <img src="${imageUrl}" alt="${name} 포스터" loading="lazy" />
        <div class="home-poster-card__badges">
          ${upcoming ? '<span class="badge badge-gray">오픈 예정</span>' : statusBadge(effectiveStatus(event))}
        </div>
        <button type="button" class="home-poster-card__heart" data-heart="${eventId}" aria-label="관심 공연 ${name}">${isInterested(event.eventId) ? '♥' : '♡'}</button>
      </div>
      <div class="home-poster-card__body">
        <h3>${name}</h3>
        <p>${escapeHtml(openInfo)}</p>
      </div>
    </article>`;
}

export const homePage = {
  render(container) {
    // LP 히어로·캘린더·공연 섹션의 자리를 먼저 만들고 실제 /events 데이터로 채운다.
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
            <div class="slider__counter" data-counter></div>
          </div>
          <div class="cal" data-calendar></div>
        </div>
      </section>

      <section class="hot-section">
        <div class="container">
          <div class="eyebrow">LIVE NOW</div>
          <h2 class="section-title">요즘 HOT 공연</h2>
          <p class="section-sub">요즘 가장 많은 관심을 받고 있는 공연이에요</p>
          <div class="hot-grid" id="hot-grid">
            <p style="color:#666">공연 목록 불러오는 중...</p>
          </div>
        </div>
      </section>

      <section class="home-secondary-section" data-upcoming-section hidden>
        <div class="container">
          <div class="eyebrow">COMING SOON</div>
          <h2 class="section-title">오픈 예정</h2>
          <p class="section-sub">예매 오픈을 기다리고 있는 공연이에요</p>
          <div class="home-poster-grid" id="upcoming-grid"></div>
        </div>
      </section>

      <section class="home-secondary-section home-secondary-section--muted" data-explore-section hidden>
        <div class="container">
          <div class="eyebrow">EXPLORE</div>
          <h2 class="section-title">콘서트 둘러보기</h2>
          <p class="section-sub">등록된 공연 정보를 한눈에 살펴보세요</p>
          <div class="home-poster-grid home-poster-grid--explore" id="explore-grid"></div>
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
    const counterEl = container.querySelector('[data-counter]');
    let slides = [];
    let idx = 0;
    let swapTimer1 = null;
    let swapTimer2 = null;
    let rotateTimer = null;

    function paintNow() {
      const e = slides[idx];
      if (!e) return;
      const imgUrl = getConcertImage(e.eventName || e.eventId);
      labelEl.style.background = `url('${imgUrl}') top center/cover no-repeat, linear-gradient(135deg,${e.color || '#667eea,#764ba2'})`;
      artistEl.textContent = e.eventName;
      const heroEl = container.querySelector('[data-slider]');
      if (heroEl) {
        heroEl.style.background = `linear-gradient(90deg, rgba(5,4,4,0.92) 0%, rgba(5,4,4,0.7) 40%, rgba(5,4,4,0.3) 100%), url('${imgUrl}') top center/cover no-repeat`;
      }
      infoEl.innerHTML = `
        <div class="lp-hero__badges">${statusBadge(effectiveStatus(e))}<span class="badge badge-gray" style="background:rgba(255,255,255,0.16);color:#fff;">${formatNumber(e.totalSeats || 0)}석</span></div>
        <div class="lp-hero__title">${e.eventName}</div>
        <div class="lp-hero__meta">
          <div>공연일<b>${e.eventDate || '-'}</b></div>
          <div>공연장<b>${e.venue || '-'}</b></div>
        </div>
      `;
      counterEl.innerHTML = `<span class="slider__counter-btn">${idx + 1} / ${slides.length}</span>`;
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
        counterEl.innerHTML = '';
        return;
      }

      arrowsEl.style.display = slides.length > 1 ? '' : 'none';
      paintNow();
      if (slides.length > 1) rotateTimer = setInterval(() => goTo(idx + 1), 5000);
    }

    const heroEl = container.querySelector('[data-slider]');
    if (heroEl) {
      heroEl.style.cursor = 'pointer';
      heroEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-prev], [data-next], [data-counter]')) return;
        const cur = slides[idx];
        if (cur) navigate(`concert/${cur.eventId}`);
      });
    }

    container.querySelector('[data-next]')?.addEventListener('click', () => goTo(idx + 1));
    container.querySelector('[data-prev]')?.addEventListener('click', () => goTo(idx - 1));

    // ---- Calendar ----
    let calendarApi = mountCalendar(container.querySelector('[data-calendar]'), {
      events: buildCalendarEvents([]),
      onSelectConcert: (id) => navigate(`concert/${id}`),
    });

    const hotGrid = container.querySelector('#hot-grid');
    const upcomingSection = container.querySelector('[data-upcoming-section]');
    const upcomingGrid = container.querySelector('#upcoming-grid');
    const exploreSection = container.querySelector('[data-explore-section]');
    const exploreGrid = container.querySelector('#explore-grid');

    let interestCounts = new Map();
    let interestCountRequest = 0;
    let interestRefreshTimer = null;

    function rankedEvents() {
      return latestRealEvents
        .map((event, originalIndex) => ({
          event,
          originalIndex,
          interestCount: interestCounts.get(event.eventId) || 0,
        }))
        .sort((a, b) => b.interestCount - a.interestCount || a.originalIndex - b.originalIndex);
    }

    function wireEventCards(scope) {
      scope.querySelectorAll('[data-event-card]').forEach((el) => {
        el.addEventListener('click', () => navigate(`concert/${el.dataset.eventCard}`));
      });
      scope.querySelectorAll('[data-event-open]').forEach((el) => {
        el.addEventListener('click', () => navigate(`concert/${el.dataset.eventOpen}`));
      });
      scope.querySelectorAll('[data-heart]').forEach((el) => {
        el.addEventListener('click', (event) => {
          event.stopPropagation();
          const eventId = el.dataset.heart;
          const wasInterested = isInterested(eventId);
          const currentCount = interestCounts.get(eventId) || 0;
          interestCounts.set(eventId, Math.max(0, currentCount + (wasInterested ? -1 : 1)));
          toggleInterest(eventId);
          renderEventSections();
          // 관심 등록/해제 요청이 DB에 반영된 뒤 서버 수를 다시 읽는다.
          if (interestRefreshTimer) clearTimeout(interestRefreshTimer);
          interestRefreshTimer = setTimeout(() => {
            interestRefreshTimer = null;
            refreshInterestCounts();
          }, 350);
        });
      });
    }

    function renderEventSections() {
      if (!latestRealEvents.length) {
        hotGrid.innerHTML = '<p style="color:#666">등록된 공연이 없습니다.</p>';
        upcomingSection.hidden = true;
        exploreSection.hidden = true;
        return;
      }

      const ranked = rankedEvents();
      const hotEvents = ranked.slice(0, 5);
      hotGrid.innerHTML = hotEvents
        .map(({ event, interestCount }, index) => hotCardHtml(event, index, interestCount))
        .join('');
      wireEventCards(hotGrid);

      const heroSlides = ranked.slice(0, 20).map(({ event }) => event);
      if (heroSlides.length) setupHero(heroSlides);

      const upcomingEvents = latestRealEvents
        .filter(isUpcoming)
        .sort((a, b) => new Date(getOpenAt(a)).getTime() - new Date(getOpenAt(b)).getTime());
      upcomingSection.hidden = upcomingEvents.length === 0;
      if (upcomingEvents.length) {
        upcomingGrid.innerHTML = upcomingEvents
          .slice(0, 5)
          .map((event, index) => posterCardHtml(event, index, interestCounts.get(event.eventId) || 0, true))
          .join('');
        wireEventCards(upcomingGrid);
      }

      const hotIds = new Set(hotEvents.map(({ event }) => event.eventId));
      const upcomingIds = new Set(upcomingEvents.map((e) => e.eventId));
      const exploreEvents = latestRealEvents.filter((e) => !hotIds.has(e.eventId) && !upcomingIds.has(e.eventId));
      exploreSection.hidden = exploreEvents.length === 0;
      if (exploreEvents.length) {
        exploreGrid.innerHTML = exploreEvents
          .map((event, index) => posterCardHtml(event, index, interestCounts.get(event.eventId) || 0))
          .join('');
        wireEventCards(exploreGrid);
      }
    }

    function refreshInterestCounts() {
      const requestId = ++interestCountRequest;
      return fetch('/wishlist/counts/all')
        .then((res) => res.ok ? res.json() : Promise.reject())
        .then((data) => {
          if (requestId !== interestCountRequest) return;
          const serverCounts = data.counts || {};
          latestRealEvents.forEach((event) => {
            interestCounts.set(event.eventId, serverCounts[event.eventId] || 0);
          });
          renderEventSections();
        })
        .catch(() => {});
    }

    // ---- API에서 이벤트 불러오기 (히어로 + 캘린더 + 홈의 세 공연 섹션이 전부 이걸 씀) ----
    let latestRealEvents = [];
    let eventPollTimer = null;

    function loadEvents(initial = false) {
      fetch('/events')
        .then((res) => res.json())
        .then((data) => {
          const events = data.events || [];

          if (initial) {
            latestRealEvents = events;
            setupHero(events);
            if (calendarApi) calendarApi.setEvents(buildCalendarEvents(latestRealEvents));
            events.forEach((event) => interestCounts.set(event.eventId, 0));
            refreshInterestCounts();
            return;
          }

          const statusChanged = events.some((e) => {
            const prev = latestRealEvents.find((p) => p.eventId === e.eventId);
            return !prev || prev.status !== e.status || prev.ticketCloseAt !== e.ticketCloseAt;
          });
          if (!statusChanged) return;

          latestRealEvents = events;
          slides = slides.map((s) => events.find((e) => e.eventId === s.eventId) || s);
          paintNow();
          if (calendarApi) calendarApi.setEvents(buildCalendarEvents(latestRealEvents));
          renderEventSections();
        })
        .catch(() => {
          if (initial) {
            hotGrid.innerHTML = '<p style="color:#e31b23">공연 목록을 불러오지 못했습니다.</p>';
            infoEl.innerHTML = `<p style="color:#e31b23;">공연 정보를 불러오지 못했습니다.</p>`;
          }
        });
    }

    loadEvents(true);
    eventPollTimer = setInterval(() => loadEvents(false), 10000);

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
      if (interestRefreshTimer) clearTimeout(interestRefreshTimer);
      if (eventPollTimer) clearInterval(eventPollTimer);
    };
  },
};
