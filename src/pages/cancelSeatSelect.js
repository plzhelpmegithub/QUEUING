// [보존 / DO NOT DELETE] A파트 취소표 좌석 페이지.
// B파트가 별도 취소표 사이트를 만들더라도 이 로컬 SMTP/fallback 화면은
// 삭제하거나 일반 예매 화면으로 통합하지 않는다.
// allocation.seatId가 있으면 서버 배정 좌석만, NULL이면 사용자가 직접 고른
// 해당 회차의 AVAILABLE 좌석 1개만 선점하는 두 모드를 모두 지원한다.

import { formatPrice } from '../utils/format.js';
import { navigate } from '../router.js';
import { getSelectedSession, getState, isLoggedIn, setCurrentOrder } from '../state/store.js';
import { fetchCancelQueueStatus, holdCancelSeat, releaseSeatApi } from '../utils/backendApi.js';
import { getVenueZoneLayout } from '../data/concerts.js';
import { mountSeatMap } from '../components/seatMap.js';
import { showToast } from '../components/toast.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function bareSeatId(seatId) {
  return String(seatId || '').split(':').pop();
}

function toLocalSeatStatus(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'SOLD' || normalized === 'RESERVED') return 'sold';
  if (normalized === 'HELD' || normalized === 'LOCKED') return 'holding';
  return 'available';
}

function extractGrade(sectionName) {
  const value = String(sectionName || '').toUpperCase();
  return ['VIP', 'R', 'S', 'A'].find((grade) => value.includes(grade)) || 'A';
}

function buildSeatMapData(event, rawSeats, assignedSeatId) {
  const eventPrefix = `${event.eventId}:`;
  const eventSeats = rawSeats.filter((seat) => String(seat.seatId || '').startsWith(eventPrefix));
  const storedSections = Array.isArray(event.sections) ? event.sections : [];
  const storedByName = new Map(storedSections.map((section) => [String(section.name || section.id), section]));

  // 올림픽홀은 API에 실제 구역명(A1, B1...)만 저장되는 경우가 있어
  // 프론트의 고정 좌표/등급 메타데이터로 등급을 보완한다.
  let venueZones = [];
  if (event.venue === '올림픽홀') {
    venueZones = getVenueZoneLayout({
      ...event,
      grades: Array.isArray(event.grades) ? event.grades : [],
    });
  }
  const venueByName = new Map(venueZones.map((zone) => [String(zone.id), zone]));

  const names = [];
  const seenNames = new Set();
  [...storedSections.map((section) => section.name || section.id), ...eventSeats.map((seat) => seat.section)]
    .forEach((name) => {
      const key = String(name || '');
      if (key && !seenNames.has(key)) {
        seenNames.add(key);
        names.push(key);
      }
    });

  const sections = [];
  const flatSeats = [];
  const palette = ['#B5121B', '#C98500', '#199E70', '#3987E5', '#8E44AD', '#16A085', '#D35400'];

  names.forEach((sectionName, sectionIndex) => {
    const stored = storedByName.get(sectionName) || {};
    const venueZone = venueByName.get(sectionName) || {};
    const sectionSeats = eventSeats.filter((seat) => String(seat.section || '') === sectionName);
    if (!sectionSeats.length) return;

    const grade = venueZone.grade || stored.grade || extractGrade(sectionName);
    const label = venueZone.label || stored.label || `${sectionName}구역`;
    const color = palette[sectionIndex % palette.length];
    const price = Number(sectionSeats.find((seat) => Number(seat.price) > 0)?.price || venueZone.price || stored.price || event.price || 0);
    sections.push({
      id: sectionName,
      label,
      grade,
      zone: event.eventName,
      cols: sectionSeats.length,
      color,
    });

    sectionSeats.forEach((seat, seatIndex) => {
      const seatId = String(seat.seatId || '');
      const bareId = bareSeatId(seatId);
      const numberMatch = bareId.match(/-(\d+)$/);
      flatSeats.push({
        id: seatId,
        section: sectionName,
        row: bareId.split('-')[0] || String(Math.floor(seatIndex / 10) + 1),
        seatNum: numberMatch ? Number(numberMatch[1]) : seatIndex + 1,
        grade,
        status: toLocalSeatStatus(seat.status),
        // 전체 배치도는 유지한다. 서버 배정 모드에서는 배정 좌석만,
        // 사용자 선택 모드(NULL)에서는 AVAILABLE 좌석만 클릭 가능하다.
        selectable: assignedSeatId
          ? seatId === assignedSeatId
          : toLocalSeatStatus(seat.status) === 'available',
        price: Number(seat.price || price || 0),
      });
    });
  });

  return { sections, flatSeats };
}

export const cancelSeatSelectPage = {
  render(container, params) {
    const eventId = params.id;
    const userId = getState().user?.userId || getState().user?.email;

    if (!isLoggedIn() || !userId) {
      navigate('');
      return;
    }

    container.innerHTML = '<div class="center-state"><div class="center-state__title">취소표 좌석 정보를 확인하는 중...</div></div>';
    let destroyed = false;
    let heldSeatId = null;
    let handedOffToPayment = false;
    let seatMapApi = null;

    function renderMessage(title, desc) {
      seatMapApi?.destroy();
      seatMapApi = null;
      container.innerHTML = `
        <div class="center-state">
          <div class="center-state__icon">🎫</div>
          <div class="center-state__title">${escapeHtml(title)}</div>
          <div class="center-state__desc">${escapeHtml(desc)}</div>
          <button class="btn btn-primary" data-back>홈으로</button>
        </div>`;
      container.querySelector('[data-back]')?.addEventListener('click', () => navigate(''));
    }

    async function load() {
      try {
        const status = await fetchCancelQueueStatus(eventId, userId, { eventId });
        const allocation = status.secretLink?.active ? status.secretLink : null;
        if (!allocation) {
          renderMessage('유효한 취소표 배정이 없습니다', 'Secret Link가 만료되었거나 이미 처리되었습니다.');
          return;
        }

        const eventsResponse = await fetch('/events');
        const eventsData = await eventsResponse.json();
        const event = (eventsData.events || []).find((item) => item.eventId === eventId);
        if (!event) {
          renderMessage('공연을 찾을 수 없습니다', '공연 정보가 삭제되었거나 아직 동기화되지 않았습니다.');
          return;
        }

        const session = {
          date: allocation.sessionDate || getSelectedSession(eventId)?.date || '',
          time: allocation.sessionTime || getSelectedSession(eventId)?.time || '',
        };
        const query = new URLSearchParams({ eventId });
        if (session.date) query.set('sessionDate', session.date);
        if (session.time) query.set('sessionTime', session.time);
        const seatsResponse = await fetch(`/seats?${query.toString()}`);
        const seatsData = await seatsResponse.json();
        const assignedSeatId = allocation.seatId ? String(allocation.seatId) : '';
        const assignedSeat = assignedSeatId
          ? (seatsData.seats || []).find((seat) => seat.seatId === assignedSeatId)
          : null;
        if (assignedSeatId && (!assignedSeat || assignedSeat.status !== 'AVAILABLE')) {
          renderMessage('배정된 좌석을 사용할 수 없습니다', '좌석 상태가 변경되어 다음 대기자에게 확인이 필요합니다.');
          return;
        }
        const availableSeats = (seatsData.seats || []).filter((seat) => seat.status === 'AVAILABLE');
        if (!assignedSeatId && availableSeats.length === 0) {
          renderMessage('선택 가능한 좌석이 없습니다', '현재 회차에 남은 취소표 좌석이 없습니다.');
          return;
        }
        if (destroyed) return;

        const initialSection = assignedSeat?.section || '';
        const initialPrice = Number(assignedSeat?.price || 0);
        const initialLabel = assignedSeat ? `${initialSection}석 ${bareSeatId(assignedSeat.seatId)}` : '';
        const { sections, flatSeats } = buildSeatMapData(event, seatsData.seats || [], assignedSeatId);
        if (assignedSeatId && !flatSeats.some((seat) => seat.id === assignedSeatId)) {
          renderMessage('좌석 배치도를 불러올 수 없습니다', '배정 좌석의 배치 정보가 공연 좌석 데이터와 일치하지 않습니다.');
          return;
        }

        let selectedSeat = null;
        const modeNotice = assignedSeatId
          ? '<strong>회원님에게 서버가 배정한 좌석만 선택</strong>할 수 있습니다.'
          : '<strong>AVAILABLE 상태인 좌석 중 1개를 직접 선택</strong>할 수 있습니다.';
        const modeSummary = assignedSeatId
          ? `배정: ${escapeHtml(initialLabel)} · ${formatPrice(initialPrice)}`
          : '선택: 회차의 AVAILABLE 좌석 1매';

        container.innerHTML = `
          <section class="seat-page-header">
            <div class="container seat-page-header__top">
              <div>
                <div class="seat-page-header__title">${escapeHtml(event.eventName)} <span class="badge badge-red">취소표 예매</span></div>
                <div class="seat-page-header__date">${escapeHtml(session.date || event.eventDate || '')} · ${escapeHtml(event.venue || '')}</div>
              </div>
            </div>
          </section>
          <div class="container">
            <div class="notice-box mt-16">
              <p>전체 좌석 배치도를 확인할 수 있으며, ${modeNotice}</p>
              <p><strong>1인 1매</strong> 제한이 적용됩니다. 좌석을 선점한 뒤 결제를 완료해주세요.</p>
            </div>
          </div>
          <div class="container" style="padding-top:20px;">
            <div class="card" style="padding:20px;">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;">
                <div>
                  <div style="font-size:18px;font-weight:800;">전체 좌석 배치도</div>
                  <div style="font-size:13px;color:var(--color-text-secondary);margin-top:4px;">회차의 실시간 좌석 상태 · ${assignedSeatId ? '배정 좌석만 선택 가능' : 'AVAILABLE 좌석 선택 가능'}</div>
                </div>
                <div class="num-mono" style="font-size:13px;color:var(--color-text-secondary);">${modeSummary}</div>
              </div>
              <div class="seatmap-scroll">
                <div class="seatmap-inner" data-cancel-seatmap></div>
              </div>
            </div>
          </div>
          <div class="container mt-24" data-selected-info style="display:none;">
            <div class="card" style="padding:24px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <div style="font-size:13px;color:var(--color-text-secondary);">선택된 좌석</div>
                  <div style="font-size:18px;font-weight:800;margin-top:4px;" data-sel-label></div>
                </div>
                <div class="num-mono" style="font-size:22px;font-weight:700;color:var(--color-primary);" data-sel-price></div>
              </div>
              <div class="badge badge-red-light" style="margin-top:12px;">1인 1매 제한 적용</div>
              <button class="btn btn-primary btn-block mt-16" data-next disabled>결제하기</button>
            </div>
          </div>`;

        const infoEl = container.querySelector('[data-selected-info]');
        const nextButton = container.querySelector('[data-next]');
        let selected = false;
        async function selectEligibleSeat(seatId) {
          if (assignedSeatId && seatId !== assignedSeatId) {
            showToast({
              title: '배정된 좌석만 선택할 수 있습니다',
              body: 'Secret Link로 회원님에게 배정된 좌석을 선택해주세요.',
            });
            return;
          }
          if (selected || heldSeatId) return;
          const seat = flatSeats.find((item) => item.id === seatId);
          if (!seat || seat.status !== 'available') {
            showToast({ title: '선택할 수 없는 좌석입니다', body: 'AVAILABLE 상태의 좌석만 선택할 수 있습니다.' });
            return;
          }
          const result = await holdCancelSeat(userId, eventId, seatId, {
            sessionDate: session.date,
            sessionTime: session.time,
          }).catch(() => ({ ok: false, data: {} }));
          if (!result.ok || !result.data.success) {
            renderMessage('좌석 선점에 실패했습니다', result.data.message || 'Secret Link 또는 좌석 상태를 다시 확인해주세요.');
            return;
          }
          selected = true;
          heldSeatId = seatId;
          seat.status = 'mine';
          selectedSeat = seat;
          seatMapApi?.updateStatuses(flatSeats);
          infoEl.style.display = 'block';
          container.querySelector('[data-sel-label]').textContent = `${seat.section || '일반'}석 ${bareSeatId(seat.id)}`;
          container.querySelector('[data-sel-price]').textContent = formatPrice(Number(seat.price || 0));
          nextButton.disabled = false;
        }

        seatMapApi = mountSeatMap(container.querySelector('[data-cancel-seatmap]'), {
          sections,
          seats: flatSeats,
          onSeatClick: selectEligibleSeat,
          cancelMode: true,
          selectionOnly: Boolean(assignedSeatId),
          venue: event.venue,
        });

        nextButton.addEventListener('click', () => {
          if (!selected || !heldSeatId) return;
          handedOffToPayment = true;
          const seat = {
            id: selectedSeat.id,
            seatId: selectedSeat.id,
            section: selectedSeat.section || '일반',
            grade: selectedSeat.grade || selectedSeat.section || 'A',
            gradeName: `${selectedSeat.section || '일반'}석`,
            seatNum: selectedSeat.seatNum || null,
            price: Number(selectedSeat.price || 0),
            label: `${selectedSeat.section || '일반'}석 ${bareSeatId(selectedSeat.id)}`,
          };
          setCurrentOrder({
            concertId: eventId,
            session,
            seat,
            seats: [seat],
            source: 'cancel',
            securedAt: Date.now(),
            cancelDeadline: allocation.expiresAt,
            cancelAllocation: { ...allocation, seatId: selectedSeat.id },
          });
          navigate('payment/cancel');
        });
      } catch (_) {
        if (!destroyed) renderMessage('취소표 정보를 불러오지 못했습니다', '네트워크 상태를 확인하고 다시 시도해주세요.');
      }
    }

    load();
    return () => {
      destroyed = true;
      seatMapApi?.destroy();
      if (heldSeatId && !handedOffToPayment) {
        releaseSeatApi(userId, heldSeatId).catch(() => {});
      }
    };
  },
};
