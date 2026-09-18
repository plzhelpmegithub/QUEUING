const redis = require('../config/redis');
const pool = require('../config/mariadb');

const EVENT_LIST_KEY = 'events:list';

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function normalizeSessions(sessions) {
  if (!Array.isArray(sessions)) return [];
  return sessions
    .filter((session) => session && (session.date || session.time || session.sessionDate || session.sessionTime))
    .map((session) => ({
      ...session,
      date: String(session.date || session.sessionDate || ''),
      time: String(session.time || session.sessionTime || ''),
    }));
}

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function fromRedis(id, value) {
  try {
    const event = JSON.parse(value);
    return {
      ...event,
      eventId: event.eventId || id,
      eventName: event.eventName || event.title || id,
      eventDate: event.eventDate || '',
      venue: event.venue || '',
      totalSeats: Number(event.totalSeats || 0),
      sessions: normalizeSessions(event.sessions),
      sections: Array.isArray(event.sections) ? event.sections : parseJson(event.sections, []),
      createdAt: toIso(event.createdAt),
    };
  } catch (_) {
    return { eventId: id, eventName: id, eventDate: '', sessions: [] };
  }
}

function fromDatabase(row) {
  const eventId = String(row.event_id || '').trim();
  if (!eventId) return null;
  const sessions = normalizeSessions(parseJson(row.sessions, []));
  return {
    eventId,
    eventName: row.event_name || row.title || eventId,
    eventDate: row.event_date || '',
    venue: row.venue || '',
    totalSeats: Number(row.total_seats || 0),
    sessions,
    seatsPerSession: Math.ceil(Number(row.total_seats || 0) / Math.max(sessions.length, 1)),
    seatingType: row.seating_type || 'arena',
    sections: parseJson(row.sections, []),
    status: row.status || 'open',
    emoji: row.emoji || '🎵',
    color: row.color || '#667eea,#764ba2',
    ticketOpenAt: toIso(row.ticket_open_at),
    ticketCloseAt: toIso(row.ticket_close_at),
    createdAt: toIso(row.created_at),
  };
}

function mergeEvents(databaseEvent, redisEvent) {
  const merged = { ...databaseEvent, ...redisEvent };
  if (!merged.eventName) merged.eventName = merged.eventId;
  if (!normalizeSessions(redisEvent?.sessions).length && normalizeSessions(databaseEvent?.sessions).length) {
    merged.sessions = databaseEvent.sessions;
  }
  if (!Array.isArray(merged.sections)) merged.sections = parseJson(merged.sections, []);
  merged.sessions = normalizeSessions(merged.sessions);
  merged.totalSeats = Number(merged.totalSeats || 0);
  return merged;
}

/**
 * 관리자 드롭다운과 공연 목록에서 공통으로 사용하는 이벤트 카탈로그다.
 * Redis가 최신 캐시를 제공하면 우선 사용하되, Redis에 누락된 이벤트는
 * MariaDB에서 보완한다. Redis 복구 전이나 생성 직후에도 목록이 비지 않도록
 * 두 저장소의 결과를 eventId 기준으로 합친다.
 */
async function listEventCards() {
  const byId = new Map();
  let redisRows = {};
  let databaseRows = [];

  try {
    redisRows = await redis.hgetall(EVENT_LIST_KEY) || {};
  } catch (error) {
    console.warn('[EventCatalog] Redis 이벤트 목록 조회 실패:', error.message);
  }

  try {
    databaseRows = await pool.query('SELECT * FROM events ORDER BY created_at DESC');
  } catch (error) {
    console.warn('[EventCatalog] MariaDB 이벤트 목록 조회 실패:', error.message);
  }

  for (const row of databaseRows) {
    const event = fromDatabase(row);
    if (event) byId.set(event.eventId, event);
  }
  for (const [id, value] of Object.entries(redisRows)) {
    const event = fromRedis(id, value);
    byId.set(event.eventId, mergeEvents(byId.get(event.eventId), event));
  }

  // Redis 카드에 sessions가 없는 레거시/복구 이벤트는 좌석 원장에서 회차를 보완한다.
  const sessionlessIds = [...byId.values()]
    .filter((event) => event.sessions.length === 0)
    .map((event) => event.eventId);
  if (sessionlessIds.length > 0) {
    try {
      const placeholders = sessionlessIds.map(() => '?').join(', ');
      const rows = await pool.query(
        `SELECT event_id, session_date, session_time
         FROM seats
         WHERE event_id IN (${placeholders})
           AND (COALESCE(session_date, '') <> '' OR COALESCE(session_time, '') <> '')
         GROUP BY event_id, session_date, session_time
         ORDER BY event_id, session_date, session_time`,
        sessionlessIds,
      );
      const grouped = new Map();
      for (const row of rows) {
        if (!grouped.has(row.event_id)) grouped.set(row.event_id, []);
        grouped.get(row.event_id).push({ date: String(row.session_date || ''), time: String(row.session_time || '') });
      }
      for (const [eventId, sessions] of grouped) {
        const event = byId.get(eventId);
        if (event && sessions.length > 0) event.sessions = sessions;
      }
    } catch (error) {
      console.warn('[EventCatalog] 좌석 기준 회차 보완 조회 실패:', error.message);
    }
  }

  return [...byId.values()].sort((a, b) => {
    const left = new Date(a.createdAt || a.eventDate || 0).getTime();
    const right = new Date(b.createdAt || b.eventDate || 0).getTime();
    return right - left;
  });
}

module.exports = { listEventCards };
