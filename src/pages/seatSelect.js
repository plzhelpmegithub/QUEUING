import { getConcert, getVenueZoneLayout } from '../data/concerts.js';
import { formatPrice, formatNumber, formatMMSS } from '../utils/format.js';
import { mountSeatMap } from '../components/seatMap.js';
import { generateSeats, createSeatSimulator, seatSectionsForZone } from '../state/seatEngine.js';
import { openModal } from '../components/modal.js';
import { showSoldOutModal } from '../components/soldOutModal.js';
import { navigate } from '../router.js';
import { connectSeatSocketWithRetry } from '../utils/realtimeChat.js';
import { fetchRealSeats, holdSeatApi, releaseSeatApi } from '../utils/backendApi.js';
import {
  setCurrentOrder,
  getSelectedSession,
  getAdmissionToken,
  ensureVenueZones,
  getVenueZoneRemaining,
  decrementVenueZone,
  getState,
} from '../state/store.js';

const HOLD_MS = 8 * 60 * 1000 + 42 * 1000; // 08:42
const MAX_RENDERED_SEATS = 168;
const GRADE_COLOR = { VIP: '#B5121B', R: '#C98500', S: '#199E70', A: '#3987E5' };

// A파트(seatService.js) 실제 좌석 status 값 → 프론트 내부 상태 매핑
const REAL_STATUS_TO_LOCAL = { AVAILABLE: 'available', HELD: 'holding', SOLD: 'sold', CANCELLED: 'available' };

function allZonesSoldOut(concertId, layout) {
  return layout.every((z) => getVenueZoneRemaining(concertId, z.id) <= 0);
}

function renderSoldOutPanel(el, c, zone, layout) {
  if (allZonesSoldOut(c.id, layout)) {
    el.innerHTML = `
      <div class="soldout-panel">
        <div class="soldout-title">SOLD OUT</div>
        <div class="soldout-desc">티켓이 모두 매진되었습니다.<br/>현재 예매 가능한 좌석이 없습니다.</div>
      </div>
    `;
    showSoldOutModal(c.id);
  } else {
    el.innerHTML = `
      <div class="soldout-panel">
        <div class="soldout-title" style="font-size:30px;">${zone.label} 매진</div>
        <div class="soldout-desc">이 구역의 좌석이 모두 판매되었습니다.<br/>다른 구역에는 아직 좌석이 남아있어요.</div>
        <div class="soldout-actions">
          <button class="btn btn-primary btn-lg" data-back-zones>다른 구역 선택하기</button>
        </div>
      </div>
    `;
    el.querySelector('[data-back-zones]').addEventListener('click', () => navigate(`zones/${c.id}`));
  }
}

// GET /seats로 받은 A파트의 실좌석 중, 이 구역(zone.grade)에 해당하는 것만 골라
// seatMap이 그릴 수 있는 {sections, seats} 형태로 변환한다. 매칭되는 좌석이
// 없으면(A 서버 미연결, 이벤트 미생성 등) null을 반환해서 mock으로 폴백하게 한다.
async function loadLiveSeatsForZone(zone) {
  const realSeats = await fetchRealSeats();
  // 올림픽홀 CSV 방식에서는 API section이 A1~I3의 실제 구역 ID다.
  // 기존 등급형 데이터도 계속 읽을 수 있도록 grade/label을 보조 조건으로 둔다.
  const matching = realSeats.filter((s) => (
    s.section === zone.id || s.section === zone.grade || s.section === zone.label
  ));
  if (matching.length === 0) return null;

  const cols = 12;
  const seats = matching.map((s, i) => ({
    id: s.seatId, // "evt-171...:VIP-001" 형태 그대로 유지 — WS 이벤트의 seatId와 정확히 일치해야 매칭됨
    grade: zone.grade,
    label: zone.label,
    section: zone.label,
    row: Math.floor(i / cols) + 1,
    seatNum: (i % cols) + 1,
    popularity: 0.5,
    status: REAL_STATUS_TO_LOCAL[s.status] || 'available',
  }));
  const sections = seatSectionsForZone(zone, seats.length);
  return { sections, seats };
}

export const seatSelectPage = {
  render(container, params) {
    const c = getConcert(params.id);
    if (!c) {
      container.innerHTML = `<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>`;
      return;
    }
    const layout = getVenueZoneLayout(c);
    ensureVenueZones(c.id, layout);
    const zone = layout.find((z) => z.id === params.zoneId);
    if (!zone) {
      container.innerHTML = `<div class="center-state"><div class="center-state__title">구역 정보를 찾을 수 없습니다</div></div>`;
      return;
    }

    const session = getSelectedSession(c.id);
    const isOH = c.venue === '올림픽홀';
    const maxSeats = isOH ? 1200 : MAX_RENDERED_SEATS;
    const seatCount = Math.max(0, Math.min(maxSeats, getVenueZoneRemaining(c.id, zone.id)));

    if (seatCount <= 0) {
      container.innerHTML = `<div class="container" style="padding:60px 0;"></div>`;
      renderSoldOutPanel(container.querySelector('.container'), c, zone, layout);
      return;
    }

    let sections = seatSectionsForZone(zone, seatCount);
    let seats = generateSeats(sections);

    container.innerHTML = `
      <section class="seat-page-header">
        <div class="container seat-page-header__top">
          <div>
            <div class="seat-page-header__title">${c.artist} <span class="badge badge-outline">${zone.label}</span></div>
            <div class="section-sub">${c.title}</div>
            <div class="seat-page-header__date">${session ? `${session.date} ${session.time}` : ''} · ${c.venue}</div>
          </div>
          <div class="seat-page-header__right" data-hold-timer-box></div>
        </div>
        <div class="container" style="padding:0;">
          <div class="notice-box mt-16"><p><strong>공연일마다 1매, 인당 최대 2매</strong> 구매 가능합니다.</p></div>
        </div>
      </section>

      <div class="container">
        <div class="seats-left-banner" data-banner>
          <div>
            <div class="seats-left-banner__msg" data-tension-msg>실시간으로 좌석이 예매되고 있습니다.</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px;color:var(--color-text-secondary);">AVAILABLE</div>
            <div class="seats-left-banner__num num-mono" data-remaining>${formatNumber(seats.length)}석</div>
          </div>
        </div>
      </div>

      <div class="container" data-body>
        <div class="seat-select-body">
          <div class="seatmap-scroll"><div class="seatmap-inner" data-seatmap></div></div>
          <div class="order-rail" data-rail>
            <div class="order-rail__zones" data-zone-nav></div>
            <div class="order-rail__order" data-order-box>
              <div class="order-rail__title">선택 좌석 정보</div>
              <div class="order-rail__empty">보라색 좌석 중 원하는 자리를 선택해주세요</div>
            </div>
          </div>
        </div>
      </div>
      <div class="container" data-soldout style="display:none;"></div>
    `;

    const seatMapHost = container.querySelector('[data-seatmap]');
    const remainingEl = container.querySelector('[data-remaining]');
    const bannerEl = container.querySelector('[data-banner]');
    const tensionMsgEl = container.querySelector('[data-tension-msg]');
    const railEl = container.querySelector('[data-rail]');
    const orderBox = container.querySelector('[data-order-box]');
    const zoneNavEl = container.querySelector('[data-zone-nav]');
    const holdBox = container.querySelector('[data-hold-timer-box]');
    const bodyEl = container.querySelector('[data-body]');
    const soldoutEl = container.querySelector('[data-soldout]');

    let holdTimer = null;
    let holdDeadline = null;
    let mySeat = null;
    let soldOutHandled = false;
    let seatMapCtrl = null;
    let sim = null;

    function paintTension(stats) {
      const remaining = stats.available;
      remainingEl.textContent = `${formatNumber(remaining)}석`;
      const tense = remaining <= 40;
      bannerEl.classList.toggle('tension', tense);
      if (remaining <= 5) tensionMsgEl.textContent = '곧 매진됩니다. 서둘러주세요!';
      else if (remaining <= 15) tensionMsgEl.textContent = '남은 좌석이 얼마 남지 않았습니다.';
      else if (remaining <= 40) tensionMsgEl.textContent = '좌석이 빠르게 매진되고 있습니다.';
      else tensionMsgEl.textContent = '실시간으로 좌석이 예매되고 있습니다.';
    }

    function mountFrom(newSections, newSeats) {
      sections = newSections;
      seats = newSeats;
      seatMapHost.innerHTML = '';
      seatMapCtrl = mountSeatMap(seatMapHost, {
        sections,
        seats,
        onSeatClick: handleSeatClick,
        venue: c.venue,
      });
      if (sim) sim.stop();
      sim = createSeatSimulator(seats, {
        tickMs: 900,
        onTick: (allSeats, stats) => {
          seatMapCtrl.updateStatuses(allSeats);
          paintTension(stats);
        },
        onSoldOut: () => {
          if (mySeat) return;
          showZoneSoldOutInline();
        },
      });
      paintTension(sim.stats());
    }

    mountFrom(sections, seats);

    let usingRealFeed = false;
    let seatSocketCtrl = null;

    const EVENT_TYPE_TO_STATUS = {
      'seat.held': 'holding',
      'seat.sold': 'sold',
      'seat.released': 'available',
      'seat.cancelled': 'available',
    };

    function applyServerSeatEvent(msg) {
      if (!usingRealFeed) {
        usingRealFeed = true;
        sim.stop();
      }
      if (msg && msg.type === 'snapshot' && Array.isArray(msg.seats)) {
        msg.seats.forEach((entry) => {
          const seat = seats.find((s) => s.id === entry.seatId);
          if (seat && seat.id !== mySeat?.id) seat.status = entry.status;
        });
        seatMapCtrl.updateStatuses(seats);
      } else if (msg && msg.type === 'seat.sold_out') {
        if (!mySeat) showZoneSoldOutInline();
        return;
      } else if (msg && msg.seatId && EVENT_TYPE_TO_STATUS[msg.type]) {
        if (mySeat && msg.seatId === mySeat.id) return;
        const seat = seats.find((s) => s.id === msg.seatId);
        if (!seat) return;
        seat.status = EVENT_TYPE_TO_STATUS[msg.type];
        seatMapCtrl.updateStatuses([seat]);
      } else {
        return;
      }
      paintTension(sim.stats());
    }

    loadLiveSeatsForZone(zone)
      .then((live) => {
        if (!live || mySeat) return;
        mountFrom(live.sections, live.seats);
        usingRealFeed = true;

        // seatId 형식 "evt-171...:VIP-001" → ":"앞이 A파트의 진짜 eventId
        const realEventId = live.seats[0]?.id.split(':')[0];
        if (realEventId) {
          seatSocketCtrl = connectSeatSocketWithRetry(realEventId, {
            onMessage: applyServerSeatEvent,
            onStatusChange: (status) => {
              if (status === 'failed' && !usingRealFeed) sim.start();
            },
          });
          console.log(`[live] WebSocket 연결 — eventId: ${realEventId}`);
        }
        console.log(`[live] A파트 실좌석 ${live.seats.length}석 로딩 완료`);
      })
      .catch((e) => console.warn('[live] 실좌석 로딩 실패 — mock 유지:', e.message));

    let holdInProgress = false;

    function handleSeatClick(id) {
      if (holdInProgress) return;

      const seat = seats.find((s) => s.id === id);
      if (!seat || seat.status !== 'available') {
        seatMapCtrl.flashSold(id);
        openModal({
          title: '이미 선택된 좌석입니다!',
          bodyHtml: `<p>다른 사용자가 먼저 해당 좌석을 선택했습니다.<br/>다른 좌석을 선택해주세요.</p>`,
          footerHtml: `<button type="button" class="btn btn-primary btn-block" data-modal-close>다른 좌석 선택</button>`,
        });
        return;
      }

      if (usingRealFeed) {
        handleLiveHold(id, seat);
      } else {
        handleMockHold(id);
      }
    }

    function handleMockHold(id) {
      const result = sim.selectSeat(id);
      if (!result.ok) {
        seatMapCtrl.flashSold(id);
        openModal({
          title: '이미 선택된 좌석입니다!',
          bodyHtml: `<p>다른 사용자가 먼저 해당 좌석을 선택했습니다.<br/>다른 좌석을 선택해주세요.</p>`,
          footerHtml: `<button type="button" class="btn btn-primary btn-block" data-modal-close>다른 좌석 선택</button>`,
        });
        return;
      }
      mySeat = result.seat;
      startHold();
      renderRailSelected();
    }

    async function handleLiveHold(id, seat) {
      const user = getState().user;
      if (!user) {
        openModal({
          title: '로그인이 필요합니다',
          bodyHtml: `<p>좌석을 선점하려면 로그인해주세요.</p>`,
          footerHtml: `<button type="button" class="btn btn-primary btn-block" data-modal-close>확인</button>`,
        });
        return;
      }

      const tokenInfo = getAdmissionToken(c.id);
      if (!tokenInfo) {
        openModal({
          title: '입장 토큰이 없습니다',
          bodyHtml: `<p>대기열을 통해 입장 허용을 받아야 좌석을 선점할 수 있습니다.</p>`,
          footerHtml: `<button type="button" class="btn btn-primary btn-block" data-modal-close>확인</button>`,
        });
        return;
      }

      holdInProgress = true;
      seat.status = 'holding';
      seatMapCtrl.updateStatuses([seat]);

      // 이전에 선점한 좌석이 있으면 서버에 해제 요청
      if (mySeat && mySeat.id !== id) {
        try {
          await releaseSeatApi(user.userId, mySeat.id);
          const prev = seats.find((s) => s.id === mySeat.id);
          if (prev) {
            prev.status = 'available';
            seatMapCtrl.updateStatuses([prev]);
          }
        } catch (_) {}
      }

      try {
        const result = await holdSeatApi(user.userId, id, tokenInfo.token);
        if (result.success) {
          seat.status = 'mine';
          seatMapCtrl.updateStatuses([seat]);
          mySeat = seat;
          startHold();
          renderRailSelected();
          console.log(`[live] 좌석 선점 성공: ${id}`);
        } else {
          seat.status = result.reason === 'unavailable' ? 'holding' : 'available';
          seatMapCtrl.updateStatuses([seat]);
          seatMapCtrl.flashSold(id);
          openModal({
            title: '좌석 선점 실패',
            bodyHtml: `<p>${result.message || '다른 사용자가 먼저 선택했습니다.'}<br/>다른 좌석을 선택해주세요.</p>`,
            footerHtml: `<button type="button" class="btn btn-primary btn-block" data-modal-close>다른 좌석 선택</button>`,
          });
        }
      } catch (err) {
        seat.status = 'available';
        seatMapCtrl.updateStatuses([seat]);
        openModal({
          title: '서버 연결 실패',
          bodyHtml: `<p>좌석 선점 요청에 실패했습니다.<br/>잠시 후 다시 시도해주세요.</p>`,
          footerHtml: `<button type="button" class="btn btn-primary btn-block" data-modal-close>확인</button>`,
        });
        console.error('[live] holdSeat API 실패:', err.message);
      } finally {
        holdInProgress = false;
      }
    }

    function renderZoneNav() {
      zoneNavEl.innerHTML = `
        <div class="order-rail__zones-title">구역 선택</div>
        <div class="zone-nav-list">
          ${layout
            .map((z) => {
              const remaining = getVenueZoneRemaining(c.id, z.id);
              const isCurrent = z.id === zone.id;
              const soldOut = remaining <= 0;
              return `
                <button type="button" class="zone-nav-row ${isCurrent ? 'active' : ''} ${soldOut ? 'is-soldout' : ''}"
                  data-switch-zone="${z.id}" style="--zone-color:${z.color || GRADE_COLOR[z.grade] || 'var(--color-primary)'}" ${isCurrent || soldOut ? 'disabled' : ''}>
                  <span class="zone-nav-row__label">${z.label}</span>
                  <span class="zone-nav-row__remain">${soldOut ? 'SOLD OUT' : `${formatNumber(remaining)}석`}</span>
                </button>
              `;
            })
            .join('')}
        </div>
      `;
      zoneNavEl.querySelectorAll('[data-switch-zone]').forEach((btn) => {
        btn.addEventListener('click', () => navigate(`seats/${c.id}/${btn.dataset.switchZone}`));
      });
    }
    renderZoneNav();

    function renderRailEmpty() {
      orderBox.innerHTML = `
        <div class="order-rail__title">선택 좌석 정보</div>
        <div class="order-rail__empty">보라색 좌석 중 원하는 자리를 선택해주세요</div>
      `;
    }

    function renderRailSelected() {
      const grade = c.grades.find((g) => g.key === mySeat.grade);
      orderBox.innerHTML = `
        <div class="order-rail__title">선택 좌석</div>
        <div class="order-rail__seat">
          <div class="order-rail__seat-grade">${grade.name}</div>
          <div class="order-rail__seat-loc">${zone.label} ${mySeat.row}열 ${mySeat.seatNum}번</div>
          <div class="order-rail__seat-price num-mono">${formatPrice(grade.price)}</div>
        </div>
        <button class="btn btn-primary btn-block" data-next>좌석 선택하기</button>
      `;
      orderBox.querySelector('[data-next]').addEventListener('click', () => {
        const deadline = holdDeadline;
        clearHold();
        sim.stop();
        decrementVenueZone(c.id, zone.id, 1);
        setCurrentOrder({
          concertId: c.id,
          session,
          zone: { id: zone.id, label: zone.label },
          seat: { ...mySeat, price: grade.price, gradeName: grade.name },
          source: 'regular',
          securedAt: Date.now(),
          holdDeadline: deadline,
        });
        navigate(`payment/regular`);
      });
    }

    function paintHoldBox(ms) {
      holdBox.innerHTML = `
        <div class="seat-page-header__timer">좌석 선택 제한시간</div>
        <div class="seat-page-header__timer num-mono"><b>${formatMMSS(ms)}</b></div>
      `;
    }

    function startHold() {
      clearHold();
      holdDeadline = Date.now() + HOLD_MS;
      paintHoldBox(HOLD_MS);
      holdTimer = setInterval(() => {
        const remaining = holdDeadline - Date.now();
        if (remaining <= 0) {
          clearHold();
          if (mySeat) {
            const prev = seats.find((s) => s.id === mySeat.id);
            if (prev && prev.status === 'mine') prev.status = 'available';
            seatMapCtrl.updateStatuses(prev ? [prev] : []);
            mySeat = null;
            renderRailEmpty();
            openModal({
              title: '좌석 예약 시간이 만료되었습니다',
              bodyHtml: `<p>결제 제한시간 내에 결제하지 않아 선택하신 좌석이 자동으로 해제되었습니다.<br/>다시 좌석을 선택해주세요.</p><p class="policy-note mt-8">※ 결제 전 예약이 만료된 것이므로 취소 수수료는 발생하지 않습니다.</p>`,
              footerHtml: `<button type="button" class="btn btn-primary btn-block" data-modal-close>확인</button>`,
            });
          }
          holdBox.innerHTML = '';
          return;
        }
        paintHoldBox(remaining);
      }, 1000);
    }

    function clearHold() {
      if (holdTimer) clearInterval(holdTimer);
      holdTimer = null;
      if (!mySeat) holdBox.innerHTML = '';
    }

    function showZoneSoldOutInline() {
      if (soldOutHandled) return;
      soldOutHandled = true;
      bodyEl.style.display = 'none';
      soldoutEl.style.display = 'block';
      renderSoldOutPanel(soldoutEl, c, zone, layout);
    }

    return () => {
      sim.stop();
      if (seatSocketCtrl) seatSocketCtrl.close();
      if (holdTimer) clearInterval(holdTimer);
      // 페이지 이탈 시 서버에 선점 해제 (선점 중인 좌석이 있을 때)
      if (mySeat) {
        const user = getState().user;
        if (user) releaseSeatApi(user.userId, mySeat.id).catch(() => {});
      }
    };
  },
};
