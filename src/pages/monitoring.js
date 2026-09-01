import { CONCERTS } from '../data/concerts.js';
import { isMonitor, isLoggedIn, getChatRoom, ensureCancelPool } from '../state/store.js';
import { navigate } from '../router.js';
import { mountLineChart, renderBarChart } from '../components/miniChart.js';
import { showToast } from '../components/toast.js';

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

function refreshMonitorHealth(container) {
  const badge = container.querySelector('[data-monitor-badge]');
  if (!badge) return;
  fetch('/api/monitor/health')
    .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
    .then(({ ok, body }) => {
      const up = ok && body.status === 'UP';
      badge.className = `badge ${up ? 'badge-green' : 'badge-red'}`;
      badge.innerHTML = `<span class="status-dot ${up ? 'status-dot--up' : 'status-dot--down'}"></span>Prometheus ${up ? 'UP' : 'DOWN'}`;
    })
    .catch(() => {
      badge.className = 'badge badge-red';
      badge.innerHTML = '<span class="status-dot status-dot--down"></span>연결 실패';
    });
}

export const monitoringPage = {
  render(container) {
    if (!isMonitor()) {
      showToast({ title: '접근 권한이 없습니다', body: isLoggedIn() ? '모니터링 계정만 이용할 수 있는 페이지입니다.' : '로그인이 필요한 페이지입니다.' });
      navigate('');
      return;
    }

    DASH_CONCERTS.forEach((c) => getChatRoom(c.id));

    container.innerHTML = `
      <div class="container admin-topbar">
        <div>
          <div class="eyebrow">MONITORING</div>
          <h2 class="section-title">모니터링 대시보드</h2>
          <p class="section-sub">Prometheus 파이프라인 실시간 지표 패널 — backend-counter /actuator/prometheus 연동</p>
        </div>
        <div class="admin-status">
          <a href="#/" class="btn btn-outline btn-sm">← 홈</a>
          <span class="badge badge-gray" data-monitor-badge><span class="status-dot"></span>확인 중...</span>
          <span class="text-secondary" data-scrape>마지막 스크랩: 방금 전</span>
        </div>
      </div>

      <div class="container admin-grid">
        <div class="admin-panel" data-heap></div>
        <div class="admin-panel" data-cpu></div>
        <div class="admin-panel" data-req></div>

        <div class="admin-panel admin-panel--wide" data-viewers></div>
        <div class="admin-panel admin-panel--wide" data-cancelpool></div>

        <div class="admin-panel admin-panel--wide" style="padding-bottom:0;">
          <div class="mchart__head">
            <span class="mchart__title">C파트(realtime-ws) Prometheus 모니터링</span>
            <a href="http://192.168.0.192:30091" target="_blank" class="btn btn-outline btn-sm" style="font-size:11px;padding:4px 12px;">Grafana 대시보드 열기 ↗</a>
          </div>
          <p class="section-sub" style="margin:2px 0 14px;">Prometheus에서 수집한 C파트 지표 (전체 Pod 합산) — 위 JVM 패널(D파트)과는 별개입니다.</p>
        </div>
        <div class="admin-panel" data-c-cpu></div>
        <div class="admin-panel" data-c-mem></div>
        <div class="admin-panel" data-c-ws></div>

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
    const cCpuChart = mountLineChart(container.querySelector('[data-c-cpu]'), {
      title: 'C파트 CPU Usage (process_cpu_seconds_total)',
      unit: '%',
      formatValue: (v) => v.toFixed(1),
    });
    const cMemChart = mountLineChart(container.querySelector('[data-c-mem]'), {
      title: 'C파트 Memory (process_resident_memory_bytes)',
      unit: ' MB',
    });
    const cWsChart = mountLineChart(container.querySelector('[data-c-ws]'), {
      title: 'WebSocket 활성 연결 수 (ws_active_connections)',
      unit: '개',
      formatValue: (v) => v.toFixed(0),
    });
    const reqChart = mountLineChart(container.querySelector('[data-req]'), {
      title: 'HTTP Request Rate',
      unit: ' req/s',
      formatValue: (v) => v.toFixed(1),
    });

    function parsePromText(text) {
      const heap = { val: 0 };
      const lines = text.split('\n');
      let totalHttpCount = 0;
      let prevTotalHttpCount = parsePromText._prevHttpCount || 0;
      let prevTs = parsePromText._prevTs || Date.now();

      for (const line of lines) {
        if (line.startsWith('#') || !line.trim()) continue;
        if (line.startsWith('jvm_memory_used_bytes') && line.includes('area="heap"')) {
          const m = line.match(/\}\s+([\d.E+-]+)/);
          if (m) heap.val += parseFloat(m[1]);
        }
        if (line.startsWith('process_cpu_usage ')) {
          heap.cpu = parseFloat(line.split(' ')[1]) * 100;
        }
        if (line.startsWith('http_server_requests_seconds_count')) {
          const m = line.match(/\}\s+([\d.E+-]+)/);
          if (m) totalHttpCount += parseFloat(m[1]);
        }
      }

      const nowTs = Date.now();
      const elapsed = (nowTs - prevTs) / 1000 || 15;
      const reqRate = Math.max(0, (totalHttpCount - prevTotalHttpCount) / elapsed);
      parsePromText._prevHttpCount = totalHttpCount;
      parsePromText._prevTs = nowTs;

      return {
        heapMb: heap.val / 1024 / 1024,
        cpuPercent: heap.cpu ?? 0,
        reqPerSec: reqRate,
      };
    }

    function tickMetrics() {
      fetch('/actuator/prometheus')
        .then((r) => r.text())
        .then((text) => {
          const { heapMb, cpuPercent, reqPerSec } = parsePromText(text);
          heapChart.push(heapMb);
          cpuChart.push(cpuPercent);
          reqChart.push(reqPerSec);
        })
        .catch(() => {});
    }
    tickMetrics();
    const metricsTimer = setInterval(tickMetrics, 15000);

    function tickCMetrics() {
      const queries = [
        'rate(process_cpu_seconds_total{job="realtime-ws"}[1m])*100',
        'sum(process_resident_memory_bytes{job="realtime-ws"})',
        'sum(ws_active_connections{job="realtime-ws"})',
      ];
      Promise.all(queries.map((q) => fetch(`/prom-api/api/v1/query?query=${encodeURIComponent(q)}`).then((r) => r.json())))
        .then(([cpuRes, memRes, wsRes]) => {
          const cpuVals = cpuRes.data?.result || [];
          const cpuPercent = cpuVals.reduce((s, r) => s + parseFloat(r.value[1]), 0) / (cpuVals.length || 1);
          const memBytes = memRes.data?.result?.[0]?.value?.[1] || 0;
          const wsConns = wsRes.data?.result?.[0]?.value?.[1] || 0;
          cCpuChart.push(cpuPercent);
          cMemChart.push(parseFloat(memBytes) / 1024 / 1024);
          cWsChart.push(parseFloat(wsConns));
        })
        .catch(() => {});
    }
    tickCMetrics();
    const cMetricsTimer = setInterval(tickCMetrics, 15000);

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

    refreshMonitorHealth(container);
    const healthTimer = setInterval(() => refreshMonitorHealth(container), 15000);

    let scrapeSeconds = 0;
    const scrapeEl = container.querySelector('[data-scrape]');
    const scrapeTimer = setInterval(() => {
      scrapeSeconds += 1;
      if (scrapeSeconds >= 15) scrapeSeconds = 0;
      scrapeEl.textContent = scrapeSeconds === 0 ? '마지막 스크랩: 방금 전' : `마지막 스크랩: ${scrapeSeconds}초 전`;
    }, 1000);

    return () => {
      clearInterval(metricsTimer);
      clearInterval(cMetricsTimer);
      clearInterval(barTimer);
      clearInterval(healthTimer);
      clearInterval(scrapeTimer);
    };
  },
};
