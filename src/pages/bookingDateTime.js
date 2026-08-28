// 예매 날짜·회차 선택 페이지 — 예매 첫 단계로, 날짜와 시간을 선택한 뒤 대기열로 진입.

import { navigate } from '../router.js';
import { isLoggedIn, setReturnTo, setSelectedSession } from '../state/store.js';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function formatSessionDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return { label: `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`, dow: WEEKDAYS[dow] };
}

export const bookingDateTimePage = {
  render(container, params) {
    container.innerHTML = `<div class="center-state"><div class="center-state__title">공연 정보 불러오는 중...</div></div>`;

    if (!isLoggedIn()) {
      setReturnTo(`booking/${params.id}`);
      navigate('login');
      return;
    }

    fetch('/events')
      .then((res) => res.json())
      .then((data) => {
        const c = (data.events || []).find((e) => e.eventId === params.id);
        if (!c) {
          container.innerHTML = `<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>`;
          return;
        }

        // eventDate 기반으로 세션 생성
        const sessions = [{ date: c.eventDate, times: ['14:00', '19:00'] }];
        let selectedDate = null;
        let selectedTime = null;

        container.innerHTML = `
          <div class="container booking-dt-page">
            <div class="eyebrow">BOOKING · STEP 1</div>
            <h2 class="section-title">${c.eventName} 날짜와 시간을 선택해주세요</h2>
            <p class="section-sub">${c.venue}</p>

            <div class="notice-box mt-16">
              <p><strong>공연일마다 1매, 인당 최대 2매</strong> 구매 가능합니다.</p>
            </div>

            <div class="booking-dt-block">
              <h3>공연 날짜</h3>
              <div class="chip-row" data-dates>
                ${sessions.map((s) => {
                  const { label, dow } = formatSessionDate(s.date);
                  return `<button type="button" class="chip-btn" data-date="${s.date}">${label}<span>(${dow})</span></button>`;
                }).join('')}
              </div>
            </div>

            <div class="booking-dt-block">
              <h3>공연 시간</h3>
              <div class="chip-row" data-times>
                <span class="text-secondary" style="font-size:13px;">먼저 날짜를 선택해주세요</span>
              </div>
            </div>

            <button type="button" class="btn btn-primary btn-lg mt-40" data-next disabled>다음</button>
          </div>
        `;

        const dateBtns = [...container.querySelectorAll('[data-date]')];
        const timesHost = container.querySelector('[data-times]');
        const nextBtn = container.querySelector('[data-next]');

        function renderTimes() {
          const session = sessions.find((s) => s.date === selectedDate);
          timesHost.innerHTML = session
            ? session.times.map((t) => `<button type="button" class="chip-btn" data-time="${t}">${t}</button>`).join('')
            : '';
          timesHost.querySelectorAll('[data-time]').forEach((btn) => {
            btn.addEventListener('click', () => {
              selectedTime = btn.dataset.time;
              timesHost.querySelectorAll('[data-time]').forEach((b) => b.classList.toggle('active', b === btn));
              nextBtn.disabled = false;
            });
          });
        }

        dateBtns.forEach((btn) => {
          btn.addEventListener('click', () => {
            selectedDate = btn.dataset.date;
            selectedTime = null;
            nextBtn.disabled = true;
            dateBtns.forEach((b) => b.classList.toggle('active', b === btn));
            renderTimes();
          });
        });

        nextBtn.addEventListener('click', () => {
          if (!selectedDate || !selectedTime) return;
          setSelectedSession(c.eventId, { date: selectedDate, time: selectedTime });
          navigate(`queue/${c.eventId}`);
        });
      })
      .catch(() => {
        container.innerHTML = `<div class="center-state"><div class="center-state__title">공연 정보를 불러오지 못했습니다.</div></div>`;
      });
  },
};
