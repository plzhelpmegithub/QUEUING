// 캘린더 이벤트 유틸 — store의 예매/관심 상태를 읽어 캘린더 컴포넌트가 렌더링할
// 이벤트 목록({ date, type, title, concertId, meta })을 생성하는 헬퍼.

import { getConcert } from '../data/concerts.js';
import { getState } from '../state/store.js';

// A concertId may point at the mock catalog (CONCERTS) or, since queue/zone/seat/payment
// now run against the real backend, at a real /events eventId — try the mock lookup first,
// then fall back to matching it against whatever real events the caller has on hand.
function resolveConcert(id, realEvents) {
  const mock = getConcert(id);
  if (mock) {
    const date = String(mock.dateStart || '').slice(0, 10);
    return { title: `${mock.artist} ${mock.title}`, date, dates: date ? [date] : [] };
  }
  const real = realEvents.find((e) => e.eventId === id);
  if (real) {
    const dates = eventDates(real);
    return { title: real.eventName, date: dates[0] || '', dates };
  }
  return null;
}

function dateOnly(value) {
  return String(value || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
}

function eventDates(event) {
  const sessionDates = Array.isArray(event.sessions)
    ? event.sessions.map((session) => dateOnly(typeof session === 'string' ? session : session?.date))
    : [];
  const dates = sessionDates.filter(Boolean);
  if (!dates.length) {
    const date = dateOnly(event.eventDate);
    if (date) dates.push(date);
  }
  return [...new Set(dates)];
}

export function buildCalendarEvents(realEvents = []) {
  const { bookings, interests } = getState();
  const apiEvents = Array.isArray(realEvents) ? realEvents : [];
  const events = [];

  // 실제 API 공연의 공연일·회차를 기본 일정으로 표시한다. 이 데이터를 기반으로
  // 관심 공연/예매 완료 일정도 아래에서 별도 상태로 겹쳐 표시한다.
  apiEvents.forEach((event) => {
    const status = String(event.status || '').toLowerCase();
    if (status !== 'cancelled') {
      eventDates(event).forEach((date) => {
        events.push({
          date,
          type: 'performance',
          title: event.eventName || '공연 일정',
          concertId: event.eventId,
        });
      });
    }

    // 예매 오픈 일정은 프론트 목업의 bookingOpenAt이 아니라 실제 API 이벤트의
    // ticketOpenAt을 사용한다. 오픈 시간이 없는 즉시 오픈 공연은 별도 오픈 점을
    // 만들지 않는다.
    const openAt = event.ticketOpenAt || event.bookingOpenAt;
    if (openAt && !['closed', 'cancelled'].includes(status) && new Date(openAt).getTime() > Date.now()) {
      const openDate = dateOnly(openAt);
      if (!openDate) return;
      events.push({
        date: openDate,
        type: 'upcoming',
        title: `${event.eventName || '공연'} 예매 오픈`,
        concertId: event.eventId,
      });
    }
  });

  bookings
    .filter((b) => b.status === 'confirmed')
    .forEach((b) => {
      const r = resolveConcert(b.concertId, apiEvents);
      if (!r) return;
      const dates = b.session?.date ? [dateOnly(b.session.date)] : r.dates || [r.date];
      dates.filter(Boolean).forEach((date) => {
        events.push({ date, type: 'booked', title: r.title, concertId: b.concertId });
      });
    });

  interests.forEach((id) => {
    const r = resolveConcert(id, apiEvents);
    if (!r) return;
    (r.dates || [r.date]).filter(Boolean).forEach((date) => {
      events.push({ date, type: 'interest', title: r.title, concertId: id });
    });
  });

  return events;
}
