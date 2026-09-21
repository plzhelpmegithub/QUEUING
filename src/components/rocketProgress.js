// Spaceship queue-progress: the ship flies past the solar system (Mercury →
// Neptune) as the user's place in line advances — left = 대기 시작, right = 입장.

const PLANETS = [
  { name: '수성', pct: 9, color: '#b4a695' },
  { name: '금성', pct: 20, color: '#e7c98a' },
  { name: '지구', pct: 32, color: '#4f9bdb' },
  { name: '화성', pct: 44, color: '#d1602f' },
  { name: '목성', pct: 58, color: '#dcae7c' },
  { name: '토성', pct: 71, color: '#e8d4a0' },
  { name: '천왕성', pct: 84, color: '#a7e2da' },
  { name: '해왕성', pct: 95, color: '#5b7cfa' },
];

export function mountRocketProgress(el, initialPct = 0) {
  el.innerHTML = `
    <div class="rocket-wrap">
      <div class="rocket-track rocket-track--space">
        <div class="rocket-fill" data-fill></div>
        ${PLANETS.map(
          (p) => `
          <div class="rocket-planet" style="left:${p.pct}%;--planet-color:${p.color}">
            <span class="rocket-planet__dot"></span>
            <span class="rocket-planet__label">${p.name}</span>
          </div>`
        ).join('')}
        <div class="rocket-ship" data-ship>🚀</div>
      </div>
      <div class="rocket-labels">
        <span>☀ 대기 시작</span>
        <span>입장 🌌</span>
      </div>
    </div>
  `;
  const fillEl = el.querySelector('[data-fill]');
  const shipEl = el.querySelector('[data-ship]');

  function update(pct) {
    const clamped = Math.max(0, Math.min(100, pct));
    fillEl.style.width = `${clamped}%`;
    shipEl.style.left = `${clamped}%`;
  }
  update(initialPct);
  return { update };
}
