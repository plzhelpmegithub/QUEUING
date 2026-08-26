// 캘린더 이벤트 데이터 빌더 — 예매 내역·관심 공연·예매 예정 공연을 캘린더 컴포넌트가
// 소비할 수 있는 이벤트 객체 배열로 변환한다.

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
