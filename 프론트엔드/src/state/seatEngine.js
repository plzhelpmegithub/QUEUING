// Seat pool generator + live "other users are buying" simulation engine.
// Used by both the regular seat-select page and the cancellation-ticket seat-select page.

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function generateSeats(sections) {
  // sections: [{ grade:'VIP', label:'VIP석', rows, cols }] renders a full rows*cols
  // rectangle, OR [{ grade, label, cols, count }] renders exactly `count` seats
  // wrapped at `cols` per row (used when seat count must match real inventory exactly,
  // e.g. the cancellation-ticket pool, where a rectangle would create phantom seats).
  const seats = [];
  sections.forEach((sec) => {
    const total = sec.count != null ? sec.count : sec.rows * sec.cols;
    for (let i = 0; i < total; i++) {
      const r = Math.floor(i / sec.cols);
      const c = i % sec.cols;
      seats.push({
        id: `${sec.grade}-${r + 1}-${c + 1}`,
        grade: sec.grade,
        label: sec.label,
        section: sec.zone || `${sec.grade[0]}구역`,
        row: r + 1,
        seatNum: c + 1,
        status: 'available', // available | mine | sold
      });
    }
  });
  return seats;
}

const GRADE_WEIGHT = { VIP: 3.2, R: 1.8, S: 1 };

function weightedSample(pool, count) {
  if (count <= 0 || pool.length === 0) return [];
  const bag = [];
  pool.forEach((s) => {
    const w = Math.ceil((GRADE_WEIGHT[s.grade] || 1) * 3);
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
 * Creates a simulation controller over a seat array.
 * options: { tickMs, onTick(seats, stats), onSoldOut(), excludeMineFromAutoSell }
 */
export function createSeatSimulator(seats, options = {}) {
  const { tickMs = 850, onTick = () => {}, onSoldOut = () => {} } = options;
  let timer = null;
  let mineId = null;
  let stopped = false;

  function stats() {
    const total = seats.length;
    let sold = 0;
    let mine = 0;
    const byGrade = {};
    seats.forEach((s) => {
      byGrade[s.grade] = byGrade[s.grade] || { total: 0, available: 0 };
      byGrade[s.grade].total += 1;
      if (s.status === 'sold') sold += 1;
      else if (s.status === 'mine') mine += 1;
      if (s.status === 'available') byGrade[s.grade].available += 1;
    });
    return { total, sold, mine, available: total - sold - mine, byGrade };
  }

  function tick() {
    if (stopped) return;
    const available = seats.filter((s) => s.status === 'available');
    if (available.length === 0) {
      stop();
      onSoldOut();
      return;
    }
    let batch;
    if (available.length <= 12) batch = 1;
    else if (available.length <= 80) batch = randInt(2, 5);
    else batch = Math.max(3, Math.floor(available.length * (0.04 + Math.random() * 0.07)));

    const targets = weightedSample(available, batch);
    targets.forEach((s) => {
      s.status = 'sold';
    });

    const s = stats();
    onTick(seats, s);
    if (s.available === 0) {
      stop();
      onSoldOut();
      return;
    }
    // speed up slightly as pool drains, but never faster than 260ms
    const nextDelay = Math.max(260, tickMs - (1 - s.available / s.total) * 400);
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
    },
    stats,
    getMineId: () => mineId,
    /** Attempt to select a seat. Returns { ok, reason } */
    selectSeat(id) {
      const seat = seats.find((x) => x.id === id);
      if (!seat || seat.status === 'sold') return { ok: false, reason: 'sold' };
      // 15% chance another user grabbed it a split second earlier
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
