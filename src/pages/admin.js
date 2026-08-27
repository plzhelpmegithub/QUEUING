// 관리자 모니터링 대시보드 — 실시간 대기열 현황, 좌석 판매 통계, 채팅 메시지,
// 취소표 풀 현황을 라인 차트와 테이블로 시각화. 관리자 계정에서만 접근 가능.

import { CONCERTS } from '../data/concerts.js';
import { isAdmin, isLoggedIn, getChatRoom, ensureCancelPool } from '../state/store.js';
import { navigate } from '../router.js';
import { mountLineChart, renderBarChart } from '../components/miniChart.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { formatDeadline } from '../utils/format.js';

// Mock 콘서트 카탈로그(data/concerts.js)와 동일한 관례로 기본값을 채워둠 — VIP/R/S/A 4등급,
// 실제 Redis에 좌석을 그만큼 생성하므로(수만 석은 데모에 과함) 개수는 축소해서 기본 제공
const GRADE_DEFAULTS = [
  { key: 'VIP', seats: 20, price: 180000 },
  { key: 'R', seats: 50, price: 140000 },
  { key: 'S', seats: 80, price: 110000 },
  { key: 'A', seats: 100, price: 80000 },
];

function createEventGradeRowHtml(g) {
  return `
    <tr data-grade-row="${g.key}">
      <td><b>${g.key}</b></td>
      <td><input type="number" min="0" data-grade-seats="${g.key}" value="${g.seats}" style="width:90px;" /></td>
      <td><input type="number" min="0" step="1000" data-grade-price="${g.key}" value="${g.price}" style="width:120px;" /></td>
    </tr>
  `;
}

function createEvent(payload) {
  return fetch('/event/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((res) => res.json());
}

// "랜덤 생성" 버튼용 — data/concerts.js 목업 카탈로그와 같은 아티스트/장소 풀에서
// 무작위로 뽑아 조합. 좌석수/가격은 GRADE_DEFAULTS를 기준으로 ±로 흔들어 다양성만 줌.
const RANDOM_ARTISTS = ['SEVENTEEN', 'IU', 'Stray Kids', 'aespa', 'TWICE', 'ATEEZ', 'LE SSERAFIM', 'NewJeans', 'ENHYPEN'];
const RANDOM_TOUR_NAMES = ['WORLD TOUR', 'CONCERT', 'FAN CONCERT', 'ENCORE', 'ANNIVERSARY SHOW'];
const RANDOM_VENUES = ['KSPO DOME', '잠실 종합운동장 주경기장', '고척스카이돔', '인스파이어 아레나', 'YES24 라이브홀', '고양종합운동장 주경기장'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

// 등급별로 각각 5000 단위로 딱 떨어지는 좌석수를 뽑음(예: VIP 5000, R 15000,
// S 20000, A 30000처럼) — 총합을 먼저 정하고 비율로 나누면 19800처럼 애매한
// 숫자가 나와서, 등급별로 독립적으로 반올림된 값을 뽑는 방식으로 바꿈
const GRADE_SEAT_RANGE = { VIP: [1, 3], R: [2, 4], S: [3, 5], A: [3, 6] }; // step(5000) 배수 범위

function randRoundSeats(step, minMult, maxMult) {
  return step * randInt(minMult, maxMult);
}

function buildRandomEventPayload() {
  const artist = pick(RANDOM_ARTISTS);
  const year = 2026 + randInt(0, 1);
  const eventDate = new Date(Date.now() + randInt(3, 90) * 86400000).toISOString().slice(0, 10);
  const sections = GRADE_DEFAULTS.map((g) => {
    const [minMult, maxMult] = GRADE_SEAT_RANGE[g.key];
    return {
      name: g.key,
      seats: randRoundSeats(5000, minMult, maxMult),
      price: Math.round((g.price * (0.85 + Math.random() * 0.3)) / 1000) * 1000,
    };
  });
  return {
    eventName: `${artist} ${year} ${pick(RANDOM_TOUR_NAMES)}`,
    eventDate,
    venue: pick(RANDOM_VENUES),
    seatingType: Math.random() < 0.7 ? 'arena' : 'standing',
    sections,
  };
}

// /events로 받아온 최신 목록을 캐시해둠 — 1초마다 도는 오픈 카운트다운
// 리페인트(paintOpenStatuses)가 매번 서버에 다시 물어보지 않고 이 캐시만
// 보고 배지 텍스트를 갱신하도록 하기 위함.
let eventsCache = [];

function setEventOpenTime(eventId, ticketOpenAt) {
  return fetch(`/events/${eventId}/open-time`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketOpenAt }),
  }).then((res) => res.json());
}

// 공연 목록 테이블의 "오픈 상태" 셀만 매초 다시 그림 — ticketOpenAt이 지났으면
// "예매중", 남았으면 "오픈 예정 + 남은시간"으로 자동 전환됨.
function paintOpenStatuses(container) {
  eventsCache.forEach((e) => {
    const cell = container.querySelector(`[data-open-status="${e.eventId}"]`);
    if (!cell) return;
    const remaining = e.ticketOpenAt ? new Date(e.ticketOpenAt).getTime() - Date.now() : 0;
    if (!e.ticketOpenAt || remaining <= 0) {
      cell.innerHTML = `<span class="badge badge-green">예매중</span>`;
      return;
    }
    cell.innerHTML = `<span class="badge badge-orange">오픈 예정</span><div class="num-mono" style="font-size:12px;margin-top:4px;color:var(--color-text-secondary);">${formatDeadline(remaining)}</div>`;
  });
}

function refreshEventsList(container) {
  const tbody = container.querySelector('[data-events-tbody]');
  if (!tbody) return;
  fetch('/events')
    .then((res) => res.json())
    .then((data) => {
      eventsCache = data.events || [];
      if (eventsCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-secondary">생성된 공연이 없습니다.</td></tr>';
        return;
      }
      tbody.innerHTML = eventsCache
        .map(
          (e) => `
        <tr>
          <td>${e.eventName}</td>
          <td>${e.eventDate || '-'}</td>
          <td>${e.venue || '-'}</td>
          <td>${Number(e.totalSeats || 0).toLocaleString()}석</td>
          <td data-open-status="${e.eventId}"></td>
          <td>
            <button type="button" class="btn btn-outline btn-sm" data-set-open-time="${e.eventId}">오픈 시간 설정</button>
            <button type="button" class="btn btn-outline btn-sm" data-delete-event="${e.eventId}">삭제</button>
          </td>
        </tr>`
        )
        .join('');
      paintOpenStatuses(container);
      tbody.querySelectorAll('[data-set-open-time]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const ev = eventsCache.find((x) => x.eventId === btn.dataset.setOpenTime);
          if (ev) openSetOpenTimeModal(ev, () => refreshEventsList(container));
        });
      });
      tbody.querySelectorAll('[data-delete-event]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const name = btn.closest('tr')?.children[0]?.textContent || '';
          if (!confirm(`"${name}" 공연을 삭제할까요? (좌석 데이터도 함께 삭제됩니다)`)) return;
          btn.disabled = true;
          fetch(`/events/${btn.dataset.deleteEvent}`, { method: 'DELETE' })
            .then((res) => res.json())
            .then(() => {
              showToast({ title: '공연이 삭제되었습니다', body: name });
              refreshEventsList(container);
            })
            .catch(() => {
              showToast({ title: '삭제 중 오류가 발생했습니다' });
              btn.disabled = false;
            });
        });
      });
    })
    .catch(() => {
      tbody.innerHTML = '<tr><td colspan="6" class="text-red">목록을 불러오지 못했습니다.</td></tr>';
    });
}

// datetime-local input이 기대하는 "로컬시각 그대로" 문자열(YYYY-MM-DDTHH:mm:ss)로 변환
function toDatetimeLocalValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function applyOpenTime(eventId, ticketOpenAt, successTitle, onSaved) {
  setEventOpenTime(eventId, ticketOpenAt)
    .then((result) => {
      if (result.error) {
        showToast({ title: '오픈 시간 설정 실패', body: result.error });
        return;
      }
      showToast({ title: successTitle, body: result.message, type: 'success' });
      closeModal();
      onSaved?.();
    })
    .catch(() => showToast({ title: '오픈 시간 설정 중 오류가 발생했습니다' }));
}

// 관리자가 특정 공연의 예매 오픈 시각을 직접 지정 — 유저 페이지(concertDetail.js)의
// "예매 오픈까지 남은 시간" 카운트다운을 재배포 없이 즉시 테스트할 수 있게 해줌.
// 프리셋 버튼은 클릭 한 번으로 바로 저장까지 되도록 해서(모달을 다시 안 열어도 됨)
// 반복 테스트가 빠르게 되도록 함.
function openSetOpenTimeModal(event, onSaved) {
  const prefill = event.ticketOpenAt
    ? toDatetimeLocalValue(new Date(event.ticketOpenAt))
    : toDatetimeLocalValue(new Date(Date.now() + 5 * 60000));

  openModal({
    title: `예매 오픈 시간 설정 — ${event.eventName}`,
    bodyHtml: `
      <div class="field">
        <label>예매 오픈 일시</label>
        <input type="datetime-local" step="1" data-open-time-input value="${prefill}" />
      </div>
      <div class="field" style="margin-bottom:0;">
        <label>빠른 설정 (테스트용 — 클릭 즉시 저장)</label>
        <div class="chip-row">
          <button type="button" class="chip-btn" data-quick-preset="now">지금 바로 오픈</button>
          <button type="button" class="chip-btn" data-quick-preset="10s">10초 후 오픈</button>
          <button type="button" class="chip-btn" data-quick-preset="1m">1분 후 오픈</button>
          <button type="button" class="chip-btn" data-quick-preset="10m">10분 후 오픈</button>
        </div>
      </div>
      ${event.ticketOpenAt ? `<p class="policy-note mt-16">현재 설정: ${new Date(event.ticketOpenAt).toLocaleString('ko-KR')}</p>` : ''}
    `,
    footerHtml: `
      <button type="button" class="btn btn-outline" data-modal-close>취소</button>
      <button type="button" class="btn btn-outline" data-clear-open-time>오픈 제한 해제</button>
      <button type="button" class="btn btn-primary" data-save-open-time>저장</button>
    `,
  });

  const input = document.querySelector('[data-open-time-input]');

  document.querySelectorAll('[data-quick-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.quickPreset;
      if (preset === 'now') {
        applyOpenTime(event.eventId, null, '예매가 즉시 오픈으로 설정되었습니다', onSaved);
        return;
      }
      const deltaMs = { '10s': 10000, '1m': 60000, '10m': 600000 }[preset] || 0;
      const target = new Date(Date.now() + deltaMs);
      input.value = toDatetimeLocalValue(target);
      applyOpenTime(event.eventId, target.toISOString(), `오픈 시간이 "${btn.textContent}"(으)로 설정되었습니다`, onSaved);
    });
  });

  document.querySelector('[data-clear-open-time]').addEventListener('click', () => {
    applyOpenTime(event.eventId, null, '오픈 시간 제한이 해제되었습니다', onSaved);
  });

  document.querySelector('[data-save-open-time]').addEventListener('click', () => {
    if (!input.value) {
      showToast({ title: '오픈 일시를 입력해주세요' });
      return;
    }
    const target = new Date(input.value);
    if (Number.isNaN(target.getTime())) {
      showToast({ title: '올바른 날짜/시간을 입력해주세요' });
      return;
    }
    applyOpenTime(event.eventId, target.toISOString(), '오픈 시간이 설정되었습니다', onSaved);
  });
}

function openCreateEventModal(onCreated) {
  openModal({
    title: '공연 생성',
    bodyHtml: `
      <form data-create-event novalidate>
        <div class="field">
          <label>공연명</label>
          <input type="text" name="eventName" placeholder="예: 2026 연말 콘서트" required />
        </div>
        <div class="field">
          <label>공연일</label>
          <input type="date" name="eventDate" />
        </div>
        <div class="field">
          <label>공연장</label>
          <input type="text" name="venue" placeholder="예: 올림픽공원 체조경기장" />
        </div>
        <div class="field">
          <label>좌석 형태</label>
          <select name="seatingType">
            <option value="arena">아레나 (부채꼴 좌석맵)</option>
            <option value="standing">스탠딩 (그리드)</option>
          </select>
        </div>
        <div class="field">
          <label>구역별 좌석 수 / 가격 (0으로 두면 해당 구역 제외)</label>
          <table class="qtable">
            <thead><tr><th>등급</th><th>좌석 수</th><th>가격(원)</th></tr></thead>
            <tbody>${GRADE_DEFAULTS.map(createEventGradeRowHtml).join('')}</tbody>
          </table>
        </div>
        <div class="field-error field-error--form" data-err="form"></div>
      </form>
    `,
    footerHtml: `
      <button type="button" class="btn btn-outline" data-modal-close>취소</button>
      <button type="button" class="btn btn-primary" data-submit-create-event>공연 생성</button>
    `,
  });

  const form = document.querySelector('[data-create-event]');
  const errEl = document.querySelector('[data-err="form"]');
  const submitBtn = document.querySelector('[data-submit-create-event]');

  submitBtn.addEventListener('click', () => {
    const eventName = form.eventName.value.trim();
    if (!eventName) {
      errEl.textContent = '공연명을 입력해주세요.';
      return;
    }

    const sections = GRADE_DEFAULTS.map((g) => {
      const seats = parseInt(form.querySelector(`[data-grade-seats="${g.key}"]`).value, 10) || 0;
      const price = parseInt(form.querySelector(`[data-grade-price="${g.key}"]`).value, 10) || 0;
      return { name: g.key, seats, price };
    }).filter((s) => s.seats > 0);

    if (sections.length === 0) {
      errEl.textContent = '최소 1개 구역은 좌석 수가 1석 이상이어야 합니다.';
      return;
    }

    errEl.textContent = '';
    submitBtn.disabled = true;

    createEvent({
      eventName,
      eventDate: form.eventDate.value || undefined,
      venue: form.venue.value.trim() || undefined,
      seatingType: form.seatingType.value,
      sections,
    })
      .then((result) => {
        if (result.error) {
          errEl.textContent = result.error;
          submitBtn.disabled = false;
          return;
        }
        showToast({ title: '공연이 생성되었습니다', body: result.message || `${eventName} 생성 완료`, type: 'success' });
        closeModal();
        onCreated?.();
      })
      .catch(() => {
        errEl.textContent = '공연 생성 중 오류가 발생했습니다.';
        submitBtn.disabled = false;
      });
  });
}

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

// 8081 모니터링 API 실헬스체크 — 응답 바디는 JSON이 아니라 'UP' 같은 평문
function refreshMonitorHealth(container) {
  const badge = container.querySelector('[data-monitor-badge]');
  if (!badge) return;
  fetch('/api/monitor/health')
    .then((res) => res.text().then((body) => ({ ok: res.ok, body })))
    .then(({ ok, body }) => {
      const up = ok && body.trim().toUpperCase() === 'UP';
      badge.className = `badge ${up ? 'badge-green' : 'badge-red'}`;
      badge.innerHTML = `<span class="status-dot ${up ? 'status-dot--up' : 'status-dot--down'}"></span>Prometheus ${up ? 'UP' : 'DOWN'}`;
    })
    .catch(() => {
      badge.className = 'badge badge-red';
      badge.innerHTML = '<span class="status-dot status-dot--down"></span>연결 실패';
    });
}

export const adminPage = {
  render(container) {
    if (!isAdmin()) {
      showToast({ title: '접근 권한이 없습니다', body: isLoggedIn() ? '관리자만 이용할 수 있는 페이지입니다.' : '로그인이 필요한 페이지입니다.' });
      navigate('');
      return;
    }

    DASH_CONCERTS.forEach((c) => getChatRoom(c.id));

    container.innerHTML = `
      <div class="container admin-topbar">
        <div>
          <div class="eyebrow">ADMIN CONSOLE</div>
          <h2 class="section-title">모니터링 대시보드</h2>
          <p class="section-sub">Prometheus 파이프라인 실시간 지표 패널 — backend-counter /actuator/prometheus 연동</p>
        </div>
        <div class="admin-status">
          <button type="button" class="btn btn-primary btn-sm" data-open-create-event>+ 공연 생성</button>
          <button type="button" class="btn btn-outline btn-sm" data-random-create-event>🎲 랜덤 생성</button>

          <span class="badge badge-gray" data-monitor-badge><span class="status-dot"></span>확인 중...</span>
          <span class="text-secondary" data-scrape>마지막 스크랩: 방금 전</span>
        </div>
      </div>

      <div class="container admin-grid">
        <div class="admin-panel admin-panel--wide">
          <div class="mchart__head"><span class="mchart__title">생성된 공연 목록</span></div>
          <table class="qtable">
            <thead><tr><th>공연명</th><th>날짜</th><th>장소</th><th>총좌석</th><th>오픈 상태</th><th></th></tr></thead>
            <tbody data-events-tbody><tr><td colspan="6" class="text-secondary">불러오는 중...</td></tr></tbody>
          </table>
        </div>
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

    refreshEventsList(container);
    const openStatusTimer = setInterval(() => paintOpenStatuses(container), 1000);
    container.querySelector('[data-open-create-event]').addEventListener('click', () => {
      openCreateEventModal(() => refreshEventsList(container));
    });
    container.querySelector('[data-random-create-event]').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      const payload = buildRandomEventPayload();
      createEvent(payload)
        .then((result) => {
          if (result.error) {
            showToast({ title: '랜덤 생성 실패', body: result.error });
            return;
          }
          showToast({ title: '공연이 생성되었습니다', body: payload.eventName, type: 'success' });
          refreshEventsList(container);
        })
        .catch(() => showToast({ title: '랜덤 생성 중 오류가 발생했습니다' }))
        .finally(() => {
          btn.disabled = false;
        });
    });

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

    // /actuator/prometheus 평문 파싱 헬퍼
    function parsePromText(text) {
      const heap = { val: 0 };
      const lines = text.split('\n');
      let totalHttpCount = 0;
      let prevTotalHttpCount = parsePromText._prevHttpCount || 0;
      let prevTs = parsePromText._prevTs || Date.now();

      for (const line of lines) {
        if (line.startsWith('#') || !line.trim()) continue;
        // heap: area="heap" 라벨 있는 행 합산
        if (line.startsWith('jvm_memory_used_bytes') && line.includes('area="heap"')) {
          const m = line.match(/\}\s+([\d.E+-]+)/);
          if (m) heap.val += parseFloat(m[1]);
        }
        // cpu
        if (line.startsWith('process_cpu_usage ')) {
          heap.cpu = parseFloat(line.split(' ')[1]) * 100;
        }
        // http 요청 카운터 합산 (누적값 — rate는 이전 값과의 차이로 계산)
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
        .catch(() => {}); // 실패 시 차트 업데이트 건너뜀
    }
    tickMetrics(); // 즉시 첫 번째 호출
    const metricsTimer = setInterval(tickMetrics, 15000);

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
      clearInterval(barTimer);
      clearInterval(healthTimer);
      clearInterval(scrapeTimer);
      clearInterval(openStatusTimer);
    };
  },
};
