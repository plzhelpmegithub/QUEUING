function normalizeSessionContext(context = {}) {
  const eventId = context.eventId == null ? '' : String(context.eventId);
  const sessionDate = context.sessionDate ?? context.date ?? '';
  const sessionTime = context.sessionTime ?? context.time ?? '';
  const date = String(sessionDate || '');
  const time = String(sessionTime || '');
  const rawSessionKey = date || time ? `${date || 'date'}_${time || 'time'}` : 'default';
  const sessionKey = rawSessionKey.replace(/[^A-Za-z0-9_-]/g, '-');

  return {
    eventId,
    sessionDate: date,
    sessionTime: time,
    sessionKey,
    scoped: Boolean(eventId || date || time),
  };
}

function getScopedKey(resource, context = {}) {
  const normalized = normalizeSessionContext(context);
  if (!normalized.scoped) return resource;
  return `${resource}:${normalized.eventId || 'event'}:${normalized.sessionKey}`;
}

function buildSeatId(eventId, session, sectionName, seatNumber, padLength = 3) {
  const normalized = normalizeSessionContext({ eventId, ...session });
  const number = String(seatNumber).padStart(padLength, '0');
  return `${normalized.eventId}:${normalized.sessionKey}:${sectionName}-${number}`;
}

function sessionFromSeat(seatId, seatHash = {}) {
  const parts = String(seatId || '').split(':');
  return normalizeSessionContext({
    eventId: seatHash.eventId || parts[0] || '',
    sessionDate: seatHash.sessionDate || '',
    sessionTime: seatHash.sessionTime || '',
  });
}

module.exports = {
  normalizeSessionContext,
  getScopedKey,
  buildSeatId,
  sessionFromSeat,
};
