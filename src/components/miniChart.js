// Lightweight, dependency-free SVG charts for the admin monitoring dashboard.
// Single accent color per line (brand red) — these are independent single-series
// panels, not compared against each other, so no categorical palette is needed here.
import { formatNumber } from '../utils/format.js';

const LINE_COLOR = '#E31B23';
const W = 400;

/**
 * Mounts a live line chart. Call `.push(value)` to append a new sample — it
 * scrolls left as it fills, like a real metrics panel.
 */
export function mountLineChart(el, { title, unit = '', height = 120, maxPoints = 40, formatValue } = {}) {
  const data = [];
  const fmt = formatValue || ((v) => formatNumber(v));

  el.innerHTML = `
    <div class="mchart">
      <div class="mchart__head">
        <span class="mchart__title">${title}</span>
        <b class="mchart__val num-mono" data-val>–</b>
      </div>
      <div class="mchart__body" data-body>
        <svg class="mchart__svg" viewBox="0 0 ${W} ${height}" preserveAspectRatio="none" data-svg>
          <line x1="0" y1="${height - 1}" x2="${W}" y2="${height - 1}" class="mchart__baseline" />
          <path data-area class="mchart__area"></path>
          <path data-line class="mchart__line"></path>
          <line data-crosshair class="mchart__crosshair" y1="0" y2="${height}" style="display:none" />
          <circle data-dot class="mchart__dot" r="3.5" style="display:none" />
        </svg>
        <div class="mchart__tooltip" data-tooltip style="display:none"></div>
      </div>
    </div>
  `;

  const svg = el.querySelector('[data-svg]');
  const linePath = el.querySelector('[data-line]');
  const areaPath = el.querySelector('[data-area]');
  const valEl = el.querySelector('[data-val]');
  const crosshair = el.querySelector('[data-crosshair]');
  const dot = el.querySelector('[data-dot]');
  const tooltip = el.querySelector('[data-tooltip]');

  function coords() {
    const max = Math.max(...data) * 1.15 || 1;
    const min = Math.min(0, Math.min(...data));
    const stepX = W / (maxPoints - 1);
    const range = max - min || 1;
    return data.map((v, i) => [i * stepX, height - ((v - min) / range) * height]);
  }

  function render() {
    if (data.length < 2) return;
    const pts = coords();
    linePath.setAttribute('d', pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' '));
    areaPath.setAttribute(
      'd',
      `${pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ')} L${pts[pts.length - 1][0]},${height} L0,${height} Z`
    );
    valEl.textContent = `${fmt(data[data.length - 1])}${unit}`;
  }

  svg.addEventListener('mousemove', (e) => {
    if (data.length < 2) return;
    const rect = svg.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(data.length - 1, Math.round(xRatio * (maxPoints - 1))));
    if (idx >= data.length) return;
    const pts = coords();
    const [x, y] = pts[idx];
    crosshair.setAttribute('x1', x);
    crosshair.setAttribute('x2', x);
    crosshair.style.display = '';
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', y);
    dot.style.display = '';
    tooltip.style.display = '';
    tooltip.style.left = `${(x / W) * 100}%`;
    tooltip.textContent = `${fmt(data[idx])}${unit}`;
  });
  svg.addEventListener('mouseleave', () => {
    crosshair.style.display = 'none';
    dot.style.display = 'none';
    tooltip.style.display = 'none';
  });

  return {
    push(value) {
      data.push(value);
      if (data.length > maxPoints) data.shift();
      render();
    },
  };
}

/**
 * Renders a static (re-render-on-demand) horizontal bar chart into `el`.
 * items: [{ label, value, color }]
 */
export function renderBarChart(el, { title, items, unit = '' }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  el.innerHTML = `
    <div class="mchart">
      <div class="mchart__head"><span class="mchart__title">${title}</span></div>
      <div class="mbar-list">
        ${items
          .map(
            (it) => `
          <div class="mbar-row" title="${it.label}: ${formatNumber(it.value)}${unit}">
            <span class="mbar-row__label">${it.label}</span>
            <span class="mbar-row__track"><span class="mbar-row__fill" style="width:${(it.value / max) * 100}%;background:${it.color}"></span></span>
            <span class="mbar-row__val num-mono">${formatNumber(it.value)}${unit}</span>
          </div>`
          )
          .join('')}
      </div>
    </div>
  `;
}
