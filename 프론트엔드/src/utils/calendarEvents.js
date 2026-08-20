import { CONCERTS, getConcert, getConcertStatus } from '../data/concerts.js';
import { getState } from '../state/store.js';

export function buildCalendarEvents() {
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
      const c = getConcert(b.concertId);
      if (c) {
        events.push({
          date: c.dateStart.slice(0, 10),
          type: 'booked',
          title: `${c.artist} ${c.title}`,
          concertId: c.id,
        });
      }
    });

  interests.forEach((id) => {
    const c = getConcert(id);
    if (c) {
      events.push({
        date: c.dateStart.slice(0, 10),
        type: 'interest',
        title: `${c.artist} ${c.title}`,
        concertId: c.id,
      });
    }
  });

  return events;
}
