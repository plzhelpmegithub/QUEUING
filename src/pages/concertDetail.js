// 공연 상세 페이지 — 공연 정보, 예매오픈 카운트다운, 좌석 등급별 가격,
// 관심 공연 토글, 실시간 채팅(liveChat), 취소/환불 정책 안내를 포함.

import { formatPrice, formatNumber, formatDeadline } from '../utils/format.js';
import { mountRefundSummary } from '../components/refundPolicy.js';
import { mountLiveChat } from '../components/liveChat.js';
import { mountSeatMap } from '../components/seatMap.js';
import { navigate } from '../router.js';
import { isLoggedIn, setReturnTo, setSelectedSession, getState } from '../state/store.js';
import { generateEventSessions, formatStoredSessions, getConcertImage, getTicketPriceRows, getVenueZoneLayout } from '../data/concerts.js';
import { OLYMPIC_HALL_CSV_ZONES, OLYMPIC_HALL_FLOOR_SEAT_COUNT } from '../data/olympicHallSeats.js';

const VENUE_SEATMAP = {
  '올림픽홀': '/images/seatmaps/올림픽홀-csv.png',
  '고척스카이돔': '/images/seatmaps/고척스카이돔.jpg',
};

function buildOlympicHallPreviewData(event) {
  const venueZones = getVenueZoneLayout(event);
  const storedSections = new Map(
    (event.sections || []).map((section) => [section.id || section.name, section]),
  );
  const zoneById = new Map(venueZones.map((zone) => [zone.id, zone]));
  const sections = venueZones.map((zone) => ({
    id: zone.id,
    grade: zone.grade,
    label: `${zone.id}구역 · ${zone.grade}석`,
    price: Number(storedSections.get(zone.id)?.price ?? zone.price ?? event.price ?? 0),
  }));
  const seats = OLYMPIC_HALL_CSV_ZONES.flatMap((zone) => zone.seats.map((seat) => ({
    id: seat.id,
    section: zone.id,
    status: 'available',
    price: sections.find((section) => section.id === zone.id)?.price || 0,
  })));
  const floorPrice = Number(storedSections.get('Floor')?.price ?? zoneById.get('Floor')?.price ?? event.price ?? 0);
  for (let i = 0; i < OLYMPIC_HALL_FLOOR_SEAT_COUNT; i++) {
    seats.push({ id: `Floor-${i + 1}`, section: 'Floor', status: 'available', price: floorPrice });
  }
  return { sections, seats };
}

export const concertDetailPage = {
  render(container, params) {
    // 로딩 표시
    container.innerHTML = `<div class="center-state"><div class="center-state__title">공연 정보 불러오는 중...</div></div>`;

    let destroyed = false;
    let openTimer = null;
    let closeTimer = null;
    let chatCleanup = null;
    let venueSeatMapCtrl = null;

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

        const imgUrl = getConcertImage(c.eventName || c.eventId);
        const bgStyle = `--detail-poster-image: url('${imgUrl}')`;
        const sessions = formatStoredSessions(c.sessions) || generateEventSessions(c.eventDate);
        const sessionDates = [...new Set(sessions.map((s) => s.date))];
        const dateRangeText = sessionDates.length > 1
          ? `${sessionDates[0]} ~ ${sessionDates[sessionDates.length - 1]}`
          : sessionDates[0] || c.eventDate || '-';

        const descText = c.description || `${c.eventName} 공연입니다.`;
        const ticketPriceRows = getTicketPriceRows(c);

        container.innerHTML = `
          <section class="detail-hero detail-hero--spread" style="${bgStyle}">
            <div class="detail-hero__overlay"></div>
            <div class="container detail-hero__content">
              <div class="detail-hero__artist">${c.eventName}</div>
              <div class="detail-hero__title">${dateRangeText}</div>
              <dl class="detail-hero__meta">
                <div><dt>공연일</dt><dd>${dateRangeText}</dd></div>
                <div><dt>공연장</dt><dd>${c.venue || '-'}</dd></div>
                <div><dt>총 좌석</dt><dd>${formatNumber(c.totalSeats)}석</dd></div>
                ${c.runtime ? `<div><dt>관람 시간</dt><dd>${c.runtime}</dd></div>` : ''}
                ${c.ageRating ? `<div><dt>관람 등급</dt><dd>${c.ageRating}</dd></div>` : ''}
              </dl>
            </div>
          </section>

          <div class="container detail-body">
            <div>
              <div class="detail-info-card">
                <h3>공연 정보</h3>
                <p style="font-size:14px;line-height:1.9;color:var(--color-text-secondary);">
                  ${descText}
                </p>
                <div style="margin-top:16px;padding-top:14px;border-top:1px dashed var(--color-border);">
                  <img src="${imgUrl}" alt="${c.eventName} 포스터" style="width:100%;border-radius:12px;object-fit:cover;" />
                </div>
                ${VENUE_SEATMAP[c.venue] ? `
                <div style="margin-top:16px;padding-top:14px;border-top:1px dashed var(--color-border);">
                  <div style="font-size:13px;font-weight:700;color:var(--color-text-secondary);margin-bottom:8px;">좌석 배치도 — ${c.venue}</div>
                  ${c.venue === '올림픽홀'
                    ? `<div class="detail-seatmap detail-seatmap--static" data-venue-seatmap role="img" aria-label="${c.venue} 좌석 배치도"></div>`
                    : `<img src="${VENUE_SEATMAP[c.venue]}" alt="${c.venue} 좌석배치도" style="width:100%;border-radius:12px;object-fit:contain;background:#fff;" />`}
                </div>` : ''}
                ${c.cast ? `
                <div style="margin-top:16px;padding-top:14px;border-top:1px dashed var(--color-border);">
                  <div style="font-size:13px;font-weight:700;color:var(--color-text-secondary);margin-bottom:6px;">출연진</div>
                  <div style="font-size:14px;font-weight:600;line-height:1.8;">${c.cast}</div>
                </div>` : ''}
                ${c.agency ? `
                <div style="margin-top:12px;">
                  <div style="font-size:13px;font-weight:700;color:var(--color-text-secondary);margin-bottom:4px;">주최/기획</div>
                  <div style="font-size:14px;font-weight:600;">${c.agency}</div>
                </div>` : ''}
                ${c.runtime || c.ageRating ? `
                <div style="margin-top:12px;display:flex;gap:24px;">
                  ${c.runtime ? `<div><div style="font-size:13px;font-weight:700;color:var(--color-text-secondary);margin-bottom:4px;">관람 시간</div><div style="font-size:14px;font-weight:600;">${c.runtime}</div></div>` : ''}
                  ${c.ageRating ? `<div><div style="font-size:13px;font-weight:700;color:var(--color-text-secondary);margin-bottom:4px;">관람 등급</div><div style="font-size:14px;font-weight:600;">${c.ageRating}</div></div>` : ''}
                </div>` : ''}
              </div>
              <div class="detail-info-card">
                <h3>티켓 가격</h3>
                ${ticketPriceRows
                  .map(({ grade, price }) => `<div class="price-row"><span>${grade}석</span><b>${formatPrice(price)}</b></div>`)
                  .join('')}
              </div>
              <div class="detail-info-card">
                <h3>예매 유의사항</h3>
                <div class="notice-box">
                  <p>· <strong>공연일마다 1매, 인당 최대 2매</strong> 구매 가능합니다.</p>
                  <p>· 예매 후 취소 시 취소 수수료가 부과될 수 있습니다.</p>
                  <p>· <strong>멤버십 가입자</strong>에 한해 매진 이후 좌석 선택 화면까지 진입했던 회원은 <strong>취소표 대기열</strong> 대상자로 자동 등록됩니다.</p>
                  <p>· 실명 확인 및 본인 입장이 원칙입니다.</p>
                </div>
              </div>
              <div class="detail-info-card" data-refund-summary></div>
            </div>

            <div class="detail-right-col">
              <div class="booking-panel" data-panel style="padding:0;overflow:hidden;">
                <div data-booking-cal></div>
                <div style="padding:0 24px 20px;">
                  <button class="btn btn-primary btn-block" data-book disabled>날짜를 선택해주세요</button>
                </div>
              </div>
              <div class="live-panel" data-live></div>
            </div>
          </div>
        `;

        if (c.venue === '올림픽홀') {
          const previewData = buildOlympicHallPreviewData(c);
          venueSeatMapCtrl = mountSeatMap(container.querySelector('[data-venue-seatmap]'), {
            sections: previewData.sections,
            seats: previewData.seats,
            readOnly: true,
            venue: '올림픽홀',
          });
        }

        // 캘린더 날짜 + 회차 선택
        let selectedDate = null;
        let selectedSessionIdx = null;
        let bookingOpen = true;
        const validDates = new Set(sessions.map((s) => s.date));
        const myBookings = getState().bookings.filter(
          (b) => b.concertId === c.eventId && (b.status === 'confirmed' || b.status === 'unpaid')
        );
        const bookedDates = new Set(myBookings.map((b) => b.session?.date).filter(Boolean));
        const maxReached = myBookings.length >= 2;

        function renderBookingCal(calHost) {
          const first = new Date(sessions[0].date);
          let calYear = first.getFullYear();
          let calMonth = first.getMonth();
          const WDAYS = ['일', '월', '화', '수', '목', '금', '토'];

          function paint() {
            const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
            const startDay = new Date(calYear, calMonth, 1).getDay();
            let cells = '';
            for (let i = 0; i < startDay; i++) cells += `<div class="bcal-day bcal-day--empty"></div>`;
            for (let d = 1; d <= daysInMonth; d++) {
              const ds = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const isValid = validDates.has(ds) && !bookedDates.has(ds);
              const isBooked = validDates.has(ds) && bookedDates.has(ds);
              const isSel = ds === selectedDate;
              const cls = ['bcal-day', isBooked ? 'bcal-day--disabled' : isValid ? 'bcal-day--valid' : 'bcal-day--disabled', isSel ? 'bcal-day--selected' : ''].join(' ');
              cells += `<div class="${cls}" ${isValid ? `data-cal-date="${ds}"` : ''}>${d}${isBooked ? '<span style="display:block;font-size:10px;color:var(--color-red);">예매완료</span>' : ''}</div>`;
            }

            const timesForDate = selectedDate ? sessions.filter((s) => s.date === selectedDate) : [];
            let sessionArea;
            if (!selectedDate) {
              sessionArea = `<span style="font-size:13px;color:var(--color-text-secondary);">날짜를 먼저 선택해주세요</span>`;
            } else {
              sessionArea = timesForDate.map((s) => {
                const idx = sessions.indexOf(s);
                const active = idx === selectedSessionIdx ? 'active' : '';
                return `<button type="button" class="chip-btn ${active}" data-pick-session="${idx}" style="padding:10px 20px;font-size:14px;">${s.round}회 ${s.time}</button>`;
              }).join('');
            }

            calHost.innerHTML = `
              <div class="bcal">
                <div class="bcal-section">
                  <div class="bcal-section-hd"><span style="font-weight:700;">관람일</span></div>
                  <div class="bcal-nav">
                    <button type="button" data-cal-dir="-1" class="bcal-nav-btn">‹</button>
                    <span class="bcal-nav-title">${calYear}. ${String(calMonth + 1).padStart(2, '0')}</span>
                    <button type="button" data-cal-dir="1" class="bcal-nav-btn">›</button>
                  </div>
                  <div class="bcal-weekdays">${WDAYS.map((w) => `<span>${w}</span>`).join('')}</div>
                  <div class="bcal-grid">${cells}</div>
                </div>
                <div class="bcal-section" style="border-top:1px solid var(--color-border);">
                  <div class="bcal-section-hd"><span style="font-weight:700;">회차</span></div>
                  <div style="padding:0 20px 16px;display:flex;gap:8px;flex-wrap:wrap;" data-session-area>${sessionArea}</div>
                </div>
                <div style="padding:0 20px 4px;font-size:12px;color:var(--color-text-secondary);">
                  · 공연일마다 <strong>1매</strong>, 인당 최대 <strong>2매</strong> 예매 가능
                </div>
              </div>
            `;

            calHost.querySelectorAll('[data-cal-dir]').forEach((btn) => {
              btn.addEventListener('click', () => {
                calMonth += parseInt(btn.dataset.calDir);
                if (calMonth < 0) { calMonth = 11; calYear--; }
                if (calMonth > 11) { calMonth = 0; calYear++; }
                paint();
              });
            });
            calHost.querySelectorAll('[data-cal-date]').forEach((cell) => {
              cell.addEventListener('click', () => {
                selectedDate = cell.dataset.calDate;
                selectedSessionIdx = null;
                paint();
                updateBookBtn();
              });
            });
            calHost.querySelectorAll('[data-pick-session]').forEach((btn) => {
              btn.addEventListener('click', () => {
                selectedSessionIdx = parseInt(btn.dataset.pickSession);
                paint();
                updateBookBtn();
              });
            });
          }
          paint();
        }

        renderBookingCal(container.querySelector('[data-booking-cal]'));

        function updateBookBtn() {
          if (!bookingOpen) return;
          const bookBtn = container.querySelector('[data-book]');
          if (!bookBtn) return;
          if (selectedSessionIdx == null) {
            bookBtn.disabled = true;
            bookBtn.textContent = '날짜를 선택해주세요';
          } else {
            bookBtn.disabled = false;
            bookBtn.textContent = '예매하기';
          }
        }

        container.querySelector('[data-book]')?.addEventListener('click', () => {
          if (!isLoggedIn()) {
            setReturnTo(`concert/${c.eventId}`);
            navigate('login');
            return;
          }
          if (maxReached) {
            import('../components/toast.js').then(({ showToast }) => {
              showToast({ title: '예매 한도 초과', body: '이 공연은 1인당 최대 2매까지 예매 가능합니다.' });
            });
            return;
          }
          if (selectedSessionIdx == null) return;
          const s = sessions[selectedSessionIdx];
          setSelectedSession(c.eventId, { date: s.date, time: s.time });
          navigate(`queue/${c.eventId}`);
        });

        mountRefundSummary(container.querySelector('[data-refund-summary]'));
        chatCleanup = mountLiveChat(container.querySelector('[data-live]'), {
          concertId: c.eventId,
          artist: c.eventName,
        });

        // 예매 오픈 시각은 이 공연 카드에 저장된 c.ticketOpenAt만 사용한다.
        // 다른 공연의 글로벌 예약 스케줄을 fallback으로 사용하면 한 공연의
        // 오픈 예약이 오픈 시간이 없는 다른 공연에도 표시되는 문제가 생긴다.
        // 카운트다운은 [예매하기] 버튼 안에 직접 표시(별도 문구 영역 없음)하고,
        // 남은 시간과 무관하게 오픈 시각이 정해져 있으면 항상 보여준다 — 예전엔
        // "5분 이내일 때만 노출"이라 10분 후 오픈처럼 5분보다 긴 대기에서는
        // 카운트다운이 아예 안 보이는(그래서 "표시 안 됨"으로 보이는) 버그가 있었음.
        const bookBtn = container.querySelector('[data-book]');

        function startOpenCountdown(openAtMs) {
          bookingOpen = false;
          function paint() {
            const remaining = openAtMs - Date.now();
            if (remaining <= 0) {
              clearInterval(openTimer);
              openTimer = null;
              bookingOpen = true;
              updateBookBtn();
              bookBtn.classList.remove('btn--countdown');
              return;
            }
            bookBtn.disabled = true;
            bookBtn.classList.add('btn--countdown');
            bookBtn.textContent = `예매 시작까지 ${formatDeadline(remaining)}`;
          }
          paint();
          openTimer = setInterval(paint, 1000);
        }

        if (c.ticketOpenAt) {
          const openAtMs = new Date(c.ticketOpenAt).getTime();
          if (!Number.isNaN(openAtMs)) startOpenCountdown(openAtMs);
        }

        function checkClosed() {
          if (!c.ticketCloseAt) return false;
          const closeMs = new Date(c.ticketCloseAt).getTime();
          if (Number.isNaN(closeMs) || closeMs > Date.now()) return false;
          bookingOpen = false;
          bookBtn.disabled = true;
          bookBtn.textContent = '예매가 마감되었습니다';
          bookBtn.classList.add('btn--closed');
          const calHost = container.querySelector('[data-booking-cal]');
          if (calHost) {
            calHost.querySelectorAll('[data-cal-date]').forEach((cell) => {
              cell.removeAttribute('data-cal-date');
              cell.classList.remove('bcal-day--valid');
              cell.classList.add('bcal-day--disabled');
            });
            calHost.querySelectorAll('[data-pick-session]').forEach((btn) => { btn.disabled = true; });
          }
          return true;
        }
        if (!checkClosed()) {
          closeTimer = setInterval(() => { if (checkClosed()) clearInterval(closeTimer); }, 1000);
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
      if (closeTimer) clearInterval(closeTimer);
      if (chatCleanup) chatCleanup();
      if (venueSeatMapCtrl) venueSeatMapCtrl.destroy();
    };
  },
};
