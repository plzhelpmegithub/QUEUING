// Seat pool generator + live "other users are buying" simulation engine.
// Used by the regular seat-select page, the zone-detail seat screen, and the
// cancellation-ticket seat-select page.

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function generateSeats(sections) {
  // sections: [{ grade:'VIP', label:'VIP석', rows, cols }] renders a full rows*cols
  // rectangle, OR [{ grade, label, cols, count }] renders exactly `count` seats
  // wrapped at `cols` per row (used when seat count must match real inventory exactly,
  // e.g. the cancellation-ticket pool, where a rectangle would create phantom seats).
  const seats = [];
  sections.forEach((sec) => {
    const total = sec.count != null ? sec.count : sec.rows * sec.cols;
    const cols = sec.cols;
    const rows = sec.rows || Math.ceil(total / cols);
    for (let i = 0; i < total; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      // Popularity: front rows and center columns sell fastest, like a real venue.
      const rowCloseness = rows > 1 ? 1 - r / (rows - 1) : 1;
      const colCenter = (cols - 1) / 2 || 1;
      const colCloseness = 1 - Math.abs(c - colCenter) / colCenter;
      const popularity = rowCloseness * 0.6 + colCloseness * 0.4;
      seats.push({
        id: `${sec.grade}-${r + 1}-${c + 1}`,
        grade: sec.grade,
        label: sec.label,
        section: sec.zone || `${sec.grade[0]}구역`,
        row: r + 1,
        seatNum: c + 1,
        popularity,
        status: 'available', // available | holding | mine | sold
      });
    }
  });
  return seats;
}

const GRADE_WEIGHT = { VIP: 3.2, R: 1.8, S: 1.2, A: 1 };

function weightedSample(pool, count) {
  if (count <= 0 || pool.length === 0) return [];
  const bag = [];
  pool.forEach((s) => {
    const gradeW = GRADE_WEIGHT[s.grade] || 1;
    const w = Math.max(1, Math.round(gradeW * (0.5 + (s.popularity || 0) * 1.5) * 3));
    for (let i = 0; i < w; i++) bag.push(s);
  });
  const picked = new Set();
  let guard = 0;
  while (picked.size < Math.min(count, pool.length) && guard < bag.length * 4) {
    const s = bag[randInt(0, bag.length - 1)];
    picked.add(s);
    guard++;
  }
  return [...picked];
}

/**
 * Creates a simulation controller over a seat array. Other buyers show up as a
 * brief AVAILABLE → HOLDING pause (like someone mid-checkout) before landing on
 * SOLD, so the map visibly feels like a live crowd rather than a countdown.
 * options: { tickMs, onTick(seats, stats), onSoldOut() }
 */
export function createSeatSimulator(seats, options = {}) {
  const { tickMs = 850, holdRangeMs = [900, 2000], onTick = () => {}, onSoldOut = () => {} } = options;
  let timer = null;
  let mineId = null;
  let stopped = false;
  const holdTimers = new Set();

  function stats() {
    const total = seats.length;
    let sold = 0;
    let mine = 0;
    let holding = 0;
    const byGrade = {};
    seats.forEach((s) => {
      byGrade[s.grade] = byGrade[s.grade] || { total: 0, available: 0 };
      byGrade[s.grade].total += 1;
      if (s.status === 'sold') sold += 1;
      else if (s.status === 'mine') mine += 1;
      else if (s.status === 'holding') holding += 1;
      if (s.status === 'available') byGrade[s.grade].available += 1;
    });
    return { total, sold, mine, holding, available: total - sold - mine - holding, byGrade };
  }

  function maybeDeclareSoldOut() {
    const s = stats();
    if (s.available === 0 && s.holding === 0) {
      stop();
      onSoldOut();
      return true;
    }
    return false;
  }

  function tick() {
    if (stopped) return;
    const available = seats.filter((s) => s.status === 'available');
    if (available.length === 0) {
      if (!maybeDeclareSoldOut()) timer = setTimeout(tick, tickMs);
      return;
    }
    let batch;
    if (available.length <= 12) batch = 1;
    else if (available.length <= 80) batch = randInt(2, 5);
    else batch = Math.max(3, Math.floor(available.length * (0.04 + Math.random() * 0.07)));

    const targets = weightedSample(available, batch);
    targets.forEach((seat) => {
      seat.status = 'holding';
      const delay = randInt(holdRangeMs[0], holdRangeMs[1]);
      const t = setTimeout(() => {
        holdTimers.delete(t);
        if (stopped || seat.status !== 'holding') return;
        seat.status = 'sold';
        onTick(seats, stats());
        maybeDeclareSoldOut();
      }, delay);
      holdTimers.add(t);
    });

    onTick(seats, stats());
    const s2 = stats();
    if (s2.available === 0 && s2.holding === 0) return; // sold out will fire from the last hold timer
    const nextDelay = Math.max(260, tickMs - (1 - s2.available / s2.total) * 400);
    timer = setTimeout(tick, nextDelay);
  }

  return {
    start() {
      stopped = false;
      timer = setTimeout(tick, tickMs);
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      holdTimers.forEach((t) => clearTimeout(t));
      holdTimers.clear();
    },
    stats,
    getMineId: () => mineId,
    /** Attempt to select a seat. Returns { ok, reason } */
    selectSeat(id) {
      const seat = seats.find((x) => x.id === id);
      if (!seat || seat.status !== 'available') {
        return { ok: false, reason: seat && seat.status === 'holding' ? 'holding' : 'sold' };
      }
      // ~15% chance another user's tick lands in the same instant
      if (Math.random() < 0.15) {
        seat.status = 'sold';
        onTick(seats, stats());
        return { ok: false, reason: 'taken' };
      }
      if (mineId) {
        const prev = seats.find((x) => x.id === mineId);
        if (prev && prev.status === 'mine') prev.status = 'available';
      }
      seat.status = 'mine';
      mineId = id;
      onTick(seats, stats());
      return { ok: true, seat };
    },
    releaseMine() {
      if (mineId) {
        const prev = seats.find((x) => x.id === mineId);
        if (prev && prev.status === 'mine') prev.status = 'available';
        mineId = null;
        onTick(seats, stats());
      }
    },
  };
}

export function seatSectionsForConcert() {
  return [
    { grade: 'VIP', label: 'VIP석', zone: 'A구역', rows: 8, cols: 10 },
    { grade: 'R', label: 'R석', zone: 'B구역', rows: 13, cols: 20 },
    { grade: 'S', label: 'S석', zone: 'C구역', rows: 20, cols: 23 },
  ];
}

/** Seat grid for one zone picked on the venue overview screen. */
export function seatSectionsForZone(zone, seatCount = 120) {
  const cols = 12;
  return [{ grade: zone.grade, label: zone.label, zone: zone.label, cols, count: seatCount }];
}

export function seatSectionsForCancelPool(pool) {
  // small dedicated pool used for the 취소표 (cancellation ticket) seat select screen.
  // `count` pins the exact number of seats rendered to real inventory — a grade with
  // 0 remaining tickets is omitted entirely so it can't render a phantom seat.
  return [
    { grade: 'VIP', label: 'VIP석', zone: 'A구역', cols: 10, count: pool.VIP },
    { grade: 'R', label: 'R석', zone: 'B구역', cols: 10, count: pool.R },
    { grade: 'S', label: 'S석', zone: 'C구역', cols: 10, count: pool.S },
  ].filter((sec) => (pool[sec.grade] ?? 0) > 0);
}
