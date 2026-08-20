// Spaceship queue-progress bar: left = 대기 시작, right = 입장

export function mountRocketProgress(el, initialPct = 0) {
  el.innerHTML = `
    <div class="rocket-wrap">
      <div class="rocket-track">
        <div class="rocket-fill" data-fill></div>
        <div class="rocket-ship" data-ship>🚀</div>
      </div>
      <div class="rocket-labels">
        <span>대기 시작</span>
        <span>입장</span>
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
