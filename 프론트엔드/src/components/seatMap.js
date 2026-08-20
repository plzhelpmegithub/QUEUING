// Renders an interactive seat-block map (VIP / R / S tiers) and keeps it in sync
// with a seatEngine seat array via cheap DOM patching (no full re-render per tick).

export function mountSeatMap(el, { sections, seats, onSeatClick, cancelMode = false, readOnly = false }) {
  const idToEl = new Map();

  const blocksHtml = sections
    .map((sec) => {
      const secSeats = seats.filter((s) => s.grade === sec.grade);
      return `
        <div class="seat-block">
          <div class="seat-block__label">
            <span class="badge badge-outline">${sec.label}</span>
            <span class="text-secondary" style="font-weight:500;font-size:12px;">${sec.zone} · ${secSeats.length}석</span>
          </div>
          <div class="seat-block__grid" style="grid-template-columns: repeat(${sec.cols}, 1fr);">
            ${secSeats
              .map(
                (s) =>
                  `<div class="seat seat--${sec.grade.toLowerCase()}" data-id="${s.id}" title="${s.section} ${s.row}열 ${s.seatNum}번"></div>`
              )
              .join('')}
          </div>
        </div>
      `;
    })
    .join('');

  el.innerHTML = `
    <div class="seatmap-legend">
      ${
        readOnly
          ? `<span><span class="legend-chip avail"></span>현재 취소표로 보유 중인 좌석</span><span><span class="badge badge-red">취소표</span> Pool 현황 (실시간 미리보기)</span>`
          : `
        <span><span class="legend-chip avail"></span>선택 가능</span>
        <span><span class="legend-chip mine"></span>내가 선택</span>
        <span><span class="legend-chip sold"></span>판매 완료</span>
        ${cancelMode ? '<span><span class="badge badge-red">취소표</span> 전용 좌석</span>' : ''}
      `
      }
    </div>
    <div class="stage-bar">S T A G E</div>
    ${blocksHtml}
  `;

  el.querySelectorAll('.seat[data-id]').forEach((node) => {
    idToEl.set(node.dataset.id, node);
  });

  if (!readOnly) {
    el.addEventListener('click', (e) => {
      const node = e.target.closest('.seat[data-id]');
      if (!node) return;
      if (node.classList.contains('seat--sold')) return;
      onSeatClick(node.dataset.id);
    });
  } else {
    el.classList.add('seatmap-readonly');
  }

  function paintSeat(seat) {
    const node = idToEl.get(seat.id);
    if (!node) return;
    node.classList.toggle('seat--sold', seat.status === 'sold');
    node.classList.toggle('seat--mine', seat.status === 'mine');
  }

  seats.forEach(paintSeat);

  return {
    updateStatuses(updatedSeats) {
      updatedSeats.forEach(paintSeat);
    },
    flashSold(id) {
      const node = idToEl.get(id);
      if (node) {
        node.classList.add('shake');
        setTimeout(() => node.classList.remove('shake'), 400);
      }
    },
  };
}
