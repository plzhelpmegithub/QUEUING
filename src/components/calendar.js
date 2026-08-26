// Personalized concert calendar widget with Month / Week view toggle.
// events: [{ date:'YYYY-MM-DD', type:'booked'|'interest'|'upcoming', title, concertId, meta }]

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTH_LABEL = (y, m) => `${y}.${String(m + 1).padStart(2, '0')}`;

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfWeek(d) {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

function weekLabel(weekStart) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const startStr = `${weekStart.getMonth() + 1}.${weekStart.getDate()}`;
  const endStr = sameMonth ? `${end.getDate()}` : `${end.getMonth() + 1}.${end.getDate()}`;
  return `${weekStart.getFullYear()}.${startStr} ~ ${endStr}`;
}

function typeBadge(type) {
  if (type === 'booked') return { label: '예매 완료', cls: 'badge-red' };
  if (type === 'interest') return { label: '관심 공연', cls: 'badge-red-light' };
  if (type === 'upcoming') return { label: '예매 오픈', cls: 'badge-outline' };
  return { label: '', cls: 'badge-gray' };
}

export function mountCalendar(el, { events = [], onSelectConcert = () => {} } = {}) {
  const today = new Date();
  let mode = 'month'; // 'month' | 'week'
  let cursor = new Date(today.getFullYear(), today.getMonth(), 1);
  let weekStart = startOfWeek(today);
  let selectedStr = ymd(today);

  function eventsFor(dateStr) {
    return events.filter((e) => e.date === dateStr);
  }

  function dayCellHtml(dateObj, outside) {
    const todayStr = ymd(today);
    const dateStr = ymd(dateObj);
    if (outside) return `<div class="cal__day is-outside"><span class="cal__day-num">${dateObj.getDate()}</span></div>`;
    const evs = eventsFor(dateStr);
    const hasBooked = evs.some((e) => e.type === 'booked');
    const hasInterest = evs.some((e) => e.type === 'interest');
    const hasUpcoming = evs.some((e) => e.type === 'upcoming');
    const classes = [
      'cal__day',
      dateStr === todayStr ? 'is-today' : '',
      dateStr === selectedStr ? 'is-selected' : '',
    ].join(' ');
    return `
      <div class="${classes}" data-date="${dateStr}">
        <span class="cal__day-num">${dateObj.getDate()}</span>
        <span class="cal__day-dots">
          ${hasBooked ? `<span class="cal__dot cal__dot--booked" title="예매 완료"></span>` : ''}
          ${hasInterest ? `<span class="cal__dot--interest">♥</span>` : ''}
          ${hasUpcoming ? `<span class="cal__dot cal__dot--upcoming" title="예매 오픈"></span>` : ''}
        </span>
      </div>
    `;
  }

  function buildMonthGrid() {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const firstDay = new Date(y, m, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    const cells = [];
    for (let i = startOffset; i > 0; i--) {
      cells.push({ date: new Date(y, m, 1 - i), outside: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(y, m, d), outside: false });
    }
    let tail = 1;
    while (cells.length < 42) {
      cells.push({ date: new Date(y, m + 1, tail), outside: true });
      tail++;
    }
    return cells;
  }

  function buildWeekGrid() {
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      cells.push({ date: d, outside: false });
    }
    return cells;
  }

  function render() {
    const cells = mode === 'month' ? buildMonthGrid() : buildWeekGrid();
    const title = mode === 'month' ? MONTH_LABEL(cursor.getFullYear(), cursor.getMonth()) : weekLabel(weekStart);

    el.classList.toggle('cal--week', mode === 'week');
    el.classList.toggle('cal--month', mode === 'month');

    el.innerHTML = `
      <div class="cal__head">
        <div class="cal__head-title">${title}</div>
        <div class="cal__head-right">
          <div class="cal__view-toggle">
            <button type="button" data-mode="month" class="${mode === 'month' ? 'active' : ''}">월간</button>
            <button type="button" data-mode="week" class="${mode === 'week' ? 'active' : ''}">주간</button>
          </div>
          <div class="cal__nav">
            <button type="button" data-nav="-1">‹</button>
            <button type="button" data-nav="1">›</button>
          </div>
        </div>
      </div>
      <div class="cal__weekdays">${WEEKDAYS.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="cal__grid ${mode === 'week' ? 'cal__grid--week' : ''}">
        ${cells.map((c) => dayCellHtml(c.date, c.outside)).join('')}
      </div>
      <div class="cal__legend">
        <span><span class="cal__dot cal__dot--booked"></span>예매 완료</span>
        <span><span class="cal__dot--interest">♥</span>관심 공연</span>
        <span><span class="cal__dot cal__dot--upcoming"></span>예매 오픈/예정</span>
      </div>
      <div class="cal__selected-info" data-info></div>
    `;

    renderSelectedInfo();

    el.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.mode;
        if (next === mode) return;
        if (next === 'week') {
          const ref = selectedStr ? new Date(selectedStr) : today;
          weekStart = startOfWeek(ref);
        } else {
          cursor = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
        }
        mode = next;
        render();
      });
    });
    el.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dir = Number(btn.dataset.nav);
        if (mode === 'month') {
          cursor = new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
        } else {
          const next = new Date(weekStart);
          next.setDate(next.getDate() + dir * 7);
          weekStart = next;
        }
        render();
      });
    });
    el.querySelectorAll('.cal__day[data-date]').forEach((dayEl) => {
      dayEl.addEventListener('click', () => {
        selectedStr = dayEl.dataset.date;
        render();
      });
    });
  }

  function renderSelectedInfo() {
    const info = el.querySelector('[data-info]');
    if (!info) return;
    const evs = eventsFor(selectedStr);
    if (!evs.length) {
      info.innerHTML = `<div class="empty">${selectedStr?.slice(5).replace('-', '.')} 일정이 없습니다.</div>`;
      return;
    }
    info.innerHTML = evs
      .map((e) => {
        const b = typeBadge(e.type);
        return `
          <div class="cal__event-row" data-concert="${e.concertId || ''}">
            <b>${e.title}</b>
            <span class="badge ${b.cls}">${b.label}</span>
          </div>
        `;
      })
      .join('');
    info.querySelectorAll('[data-concert]').forEach((row) => {
      const id = row.dataset.concert;
      if (!id) return;
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => onSelectConcert(id));
    });
  }

  render();

  return {
    setEvents(newEvents) {
      events = newEvents;
      render();
    },
  };
}
