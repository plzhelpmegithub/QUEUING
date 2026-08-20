import { CONCERTS } from '../data/concerts.js';
import { isAdmin, getChatRoom, ensureCancelPool } from '../state/store.js';
import { navigate } from '../router.js';
import { mountLineChart, renderBarChart } from '../components/miniChart.js';

// Validated dark-surface categorical order (see dataviz skill palette.md) — fixed
// slot order, never cycled, so a series' color always stays tied to its identity.
const CATEGORICAL_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
const DASH_CONCERTS = CONCERTS.slice(0, 8);
const CONCERT_COLOR = Object.fromEntries(DASH_CONCERTS.map((c, i) => [c.id, CATEGORICAL_DARK[i % CATEGORICAL_DARK.length]]));

const POD_ROWS = [
  { name: 'backend-counter-6b7f7dd8d4-hfbkh', ready: '1/1', status: 'Running' },
  { name: 'backend-counter-6b7f7dd8d4-qz9pw', ready: '1/1', status: 'Running' },
  { name: 'redis-counter-master-0', ready: '1/1', status: 'Running' },
  { name: 'prometheus-kube-prometheus-prometheus-0', ready: '2/2', status: 'Running' },
  { name: 'prometheus-grafana-7c9d6f9b7-2k5xs', ready: '3/3', status: 'Running' },
];

function randStep(prev, min, max, jitter) {
  const next = prev + (Math.random() - 0.5) * jitter;
  return Math.max(min, Math.min(max, next));
}

export const adminPage = {
  render(container) {
    if (!isAdmin()) {
      navigate('');
      return;
    }

    DASH_CONCERTS.forEach((c) => getChatRoom(c.id));

    container.innerHTML = `
      <div class="container admin-topbar">
        <div>
          <div class="eyebrow">ADMIN CONSOLE</div>
          <h2 class="section-title">모니터링 대시보드</h2>
          <p class="section-sub">Prometheus / Grafana 파이프라인을 참고해 구성한 실시간 지표 패널입니다 (시뮬레이션 데이터)</p>
        </div>
        <div class="admin-status">
          <span class="badge badge-green"><span class="status-dot status-dot--up"></span>Prometheus UP</span>
          <span class="text-secondary" data-scrape>마지막 스크랩: 방금 전</span>
        </div>
      </div>

      <div class="container admin-grid">
        <div class="admin-panel" data-heap></div>
        <div class="admin-panel" data-cpu></div>
        <div class="admin-panel" data-req></div>

        <div class="admin-panel admin-panel--wide" data-viewers></div>
        <div class="admin-panel admin-panel--wide" data-cancelpool></div>

        <div class="admin-panel">
          <div class="mchart__head"><span class="mchart__title">Kubernetes Pods</span><span class="badge badge-gray">${POD_ROWS.length}/${POD_ROWS.length} Ready</span></div>
          <table class="pods-table">
            ${POD_ROWS.map(
              (p) => `
              <tr>
                <td class="pod-name">${p.name}</td>
                <td><span class="status-dot status-dot--up"></span>${p.status}</td>
                <td class="text-secondary">${p.ready}</td>
              </tr>`
            ).join('')}
          </table>
        </div>

        <div class="admin-panel">
          <div class="mchart__head"><span class="mchart__title">Prometheus Targets</span></div>
          <div class="target-row">
            <span class="target-row__name">backend-counter-service<br/><span class="text-secondary">/actuator/prometheus · 15s</span></span>
            <span><span class="status-dot status-dot--up"></span>UP</span>
          </div>
          <div class="target-row">
            <span class="target-row__name">redis-counter-master<br/><span class="text-secondary">redis_exporter · 15s</span></span>
            <span><span class="status-dot status-dot--up"></span>UP</span>
          </div>
          <div class="notice-box mt-16" style="margin-top:14px;">
            <p>jvm_memory_used_bytes, http_requests_total 등 Actuator 지표가 정상 스크랩되고 있습니다.</p>
          </div>
        </div>
      </div>
    `;

    const heapChart = mountLineChart(container.querySelector('[data-heap]'), {
      title: 'JVM Heap Memory Used (jvm_memory_used_bytes)',
      unit: ' MB',
    });
    const cpuChart = mountLineChart(container.querySelector('[data-cpu]'), {
      title: 'CPU Usage',
      unit: '%',
      formatValue: (v) => v.toFixed(1),
    });
    const reqChart = mountLineChart(container.querySelector('[data-req]'), {
      title: 'HTTP Request Rate',
      unit: ' req/s',
      formatValue: (v) => v.toFixed(1),
    });

    let heap = 140 + Math.random() * 40;
    let cpu = 20;
    let req = 8;

    function tickMetrics() {
      heap += 6 + Math.random() * 10;
      if (heap > 380 + Math.random() * 40) heap = 110 + Math.random() * 30; // GC event
      cpu = randStep(cpu, 4, 78, 18);
      const liveTotal = DASH_CONCERTS.reduce((sum, c) => sum + getChatRoom(c.id).viewers, 0);
      req = randStep(req, 2, 60, 10) + liveTotal / 400;

      heapChart.push(heap);
      cpuChart.push(cpu);
      reqChart.push(req);
    }
    for (let i = 0; i < 24; i++) tickMetrics(); // seed with history so charts aren't empty on load
    const metricsTimer = setInterval(tickMetrics, 1200);

    function renderBars() {
      renderBarChart(container.querySelector('[data-viewers]'), {
        title: 'Redis Counter — 콘서트별 실시간 시청자수',
        unit: '명',
        items: DASH_CONCERTS.map((c) => ({
          label: c.artist,
          value: getChatRoom(c.id).viewers,
          color: CONCERT_COLOR[c.id],
        })).sort((a, b) => b.value - a.value),
      });

      const poolItems = DASH_CONCERTS.map((c) => {
        const p = ensureCancelPool(c.id);
        return { label: c.artist, value: p.VIP + p.R + p.S, color: CONCERT_COLOR[c.id] };
      })
        .filter((it) => it.value > 0)
        .sort((a, b) => b.value - a.value);

      renderBarChart(container.querySelector('[data-cancelpool]'), {
        title: '취소표 Pool 현황 (원자적 카운터 합계)',
        unit: '매',
        items: poolItems.length ? poolItems : [{ label: '데이터 없음', value: 0, color: 'var(--color-border)' }],
      });
    }
    renderBars();
    const barTimer = setInterval(renderBars, 3000);

    let scrapeSeconds = 0;
    const scrapeEl = container.querySelector('[data-scrape]');
    const scrapeTimer = setInterval(() => {
      scrapeSeconds += 1;
      if (scrapeSeconds >= 15) scrapeSeconds = 0;
      scrapeEl.textContent = scrapeSeconds === 0 ? '마지막 스크랩: 방금 전' : `마지막 스크랩: ${scrapeSeconds}초 전`;
    }, 1000);

    return () => {
      clearInterval(metricsTimer);
      clearInterval(barTimer);
      clearInterval(scrapeTimer);
    };
  },
};
