// A파트 Local SMTP 취소표와 Last 로컬 시뮬레이션이 함께 사용하는
// 전체 회차 좌석맵 변환기다.
// [보존 / DO NOT DELETE] 취소표 링크 화면은 전체 좌석을 보여주되,
// 호출 화면이 정한 selectable 규칙으로 실제 선택 가능 좌석을 제한한다.
import { getVenueZoneLayout } from '../data/concerts.js';

export function bareSeatId(seatId) {
  return String(seatId || '').split(':').pop();
}

export function toCancelSeatStatus(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'SOLD' || normalized === 'RESERVED') return 'sold';
  if (normalized === 'HELD' || normalized === 'LOCKED') return 'holding';
  return 'available';
}

function extractGrade(sectionName) {
  const value = String(sectionName || '').toUpperCase();
  return ['VIP', 'R', 'S', 'A'].find((grade) => value.includes(grade)) || 'A';
}

export function buildCancelSeatMapData(event, rawSeats, assignedSeatId = '') {
  const eventId = String(event?.eventId || '');
  const eventPrefix = eventId ? `${eventId}:` : '';
  const eventSeats = (Array.isArray(rawSeats) ? rawSeats : []).filter((seat) => (
    !eventPrefix || String(seat.seatId || '').startsWith(eventPrefix)
  ));
  const storedSections = Array.isArray(event?.sections) ? event.sections : [];
  const storedByName = new Map(storedSections.map((section) => [String(section.name || section.id), section]));

  // 올림픽홀은 API에 실제 구역명(A1, B1...)만 저장되는 경우가 있어
  // 프론트의 고정 좌표/등급 메타데이터로 등급을 보완한다.
  let venueZones = [];
  if (event?.venue === '올림픽홀') {
    venueZones = getVenueZoneLayout({
      ...event,
      grades: Array.isArray(event.grades) ? event.grades : [],
    });
  }
  const venueByName = new Map(venueZones.map((zone) => [String(zone.id), zone]));

  const names = [];
  const seenNames = new Set();
  [...storedSections.map((section) => section.name || section.id), ...eventSeats.map((seat) => seat.section)]
    .forEach((name) => {
      const key = String(name || '');
      if (key && !seenNames.has(key)) {
        seenNames.add(key);
        names.push(key);
      }
    });

  const sections = [];
  const flatSeats = [];
  const palette = ['#B5121B', '#C98500', '#199E70', '#3987E5', '#8E44AD', '#16A085', '#D35400'];

  names.forEach((sectionName, sectionIndex) => {
    const stored = storedByName.get(sectionName) || {};
    const venueZone = venueByName.get(sectionName) || {};
    const sectionSeats = eventSeats.filter((seat) => String(seat.section || '') === sectionName);
    if (!sectionSeats.length) return;

    const grade = venueZone.grade || stored.grade || extractGrade(sectionName);
    const label = venueZone.label || stored.label || `${sectionName}구역`;
    const color = palette[sectionIndex % palette.length];
    const price = Number(
      sectionSeats.find((seat) => Number(seat.price) > 0)?.price
      || venueZone.price
      || stored.price
      || event?.price
      || 0,
    );
    sections.push({
      id: sectionName,
      label,
      grade,
      zone: event?.eventName || '',
      cols: sectionSeats.length,
      color,
    });

    sectionSeats.forEach((seat, seatIndex) => {
      const seatId = String(seat.seatId || '');
      const bareId = bareSeatId(seatId);
      const numberMatch = bareId.match(/-(\d+)$/);
      const status = toCancelSeatStatus(seat.status);
      flatSeats.push({
        id: seatId,
        section: sectionName,
        row: bareId.split('-')[0] || String(Math.floor(seatIndex / 10) + 1),
        seatNum: numberMatch ? Number(numberMatch[1]) : seatIndex + 1,
        grade,
        status,
        // 서버 배정 모드에서는 배정 좌석만, NULL allocation 모드에서는
        // 회차의 AVAILABLE 좌석만 선택 가능하게 한다.
        selectable: assignedSeatId ? seatId === assignedSeatId : status === 'available',
        price: Number(seat.price || price || 0),
      });
    });
  });

  return { sections, seats: flatSeats };
}
