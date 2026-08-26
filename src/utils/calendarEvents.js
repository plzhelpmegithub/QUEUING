// 캘린더 이벤트 유틸 — store의 예매/관심 상태를 읽어 캘린더 컴포넌트가 렌더링할
// 이벤트 목록({ date, type, title, concertId, meta })을 생성하는 헬퍼.

import { CONCERTS, getConcert, getConcertStatus } from '../data/concerts.js';
import { getState } from '../state/store.js';

// A concertId may point at the mock catalog (CONCERTS) or, since queue/zone/seat/payment
// now run against the real backend, at a real /events eventId — try the mock lookup first,
// then fall back to matching it against whatever real events the caller has on hand.
function resolveConcert(id, realEvents) {
  const mock = getConcert(id);
  if (mock) return { title: `${mock.artist} ${mock.title}`, date: mock.dateStart?.slice(0, 10) };
  const real = realEvents.find((e) => e.eventId === id);
  if (real) return { title: real.eventName, date: (real.eventDate || '').slice(0, 10) };
  return null;
}

export function buildCalendarEvents(realEvents = []) {
  const { bookings, interests } = getState();
  const events = [];

  CONCERTS.forEach((c) => {
    if (getConcertStatus(c) === 'upcoming') {
      events.push({
        date: c.bookingOpenAt.slice(0, 10),
        type: 'upcoming',
        title: `${c.artist} 예매 오픈`,
        concertId: c.id,
      });
    }
  });

  bookings
    .filter((b) => b.status === 'confirmed')
    .forEach((b) => {
      const r = resolveConcert(b.concertId, realEvents);
      if (r && r.date) {
        events.push({ date: r.date, type: 'booked', title: r.title, concertId: b.concertId });
      }
    });

  interests.forEach((id) => {
    const r = resolveConcert(id, realEvents);
    if (r && r.date) {
      events.push({ date: r.date, type: 'interest', title: r.title, concertId: id });
    }
  });

  return events;
}
