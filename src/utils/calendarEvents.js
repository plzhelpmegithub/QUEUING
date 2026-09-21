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

  const bookedIds = new Set(
    bookings.filter((b) => b.status === 'confirmed').map((b) => b.concertId)
  );
  const interestIds = interests instanceof Set ? interests : new Set(interests);

  apiEvents.forEach((event) => {
    const status = String(event.status || '').toLowerCase();
    if (status !== 'cancelled') {
      const id = event.eventId;
      const isBooked = bookedIds.has(id);
      const isInterest = interestIds.has(id);
      const type = isBooked ? 'booked' : isInterest ? 'interest' : 'performance';
      eventDates(event).forEach((date) => {
        events.push({
          date,
          type,
          title: event.eventName || '공연 일정',
          concertId: id,
        });
      });
    }

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
    .filter((b) => b.status === 'confirmed' && !apiEvents.some((e) => e.eventId === b.concertId))
    .forEach((b) => {
      const r = resolveConcert(b.concertId, apiEvents);
      if (!r) return;
      const dates = b.session?.date ? [dateOnly(b.session.date)] : r.dates || [r.date];
      dates.filter(Boolean).forEach((date) => {
        events.push({ date, type: 'booked', title: r.title, concertId: b.concertId });
      });
    });

  [...interestIds]
    .filter((id) => !apiEvents.some((e) => e.eventId === id))
    .forEach((id) => {
      const r = resolveConcert(id, apiEvents);
      if (!r) return;
      (r.dates || [r.date]).filter(Boolean).forEach((date) => {
        events.push({ date, type: 'interest', title: r.title, concertId: id });
      });
    });

  return events;
}
