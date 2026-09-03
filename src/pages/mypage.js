// 마이페이지 — 예매내역, 취소·환불내역, 관심 공연, 회원정보 수정 섹션으로 구성.
// URL 해시의 section 파라미터(/mypage/:section)로 하위 탭을 직접 링크할 수 있다.

import { CONCERTS, getConcert, getConcertImage } from '../data/concerts.js';
import { formatDate, formatPrice, formatNumber, formatDateRange } from '../utils/format.js';
import { navigate } from '../router.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { calcCancelFeeRate } from '../data/refundPolicy.js';
import {
  getState,
  isLoggedIn,
  setReturnTo,
  hasMembership,
  isInterested,
  toggleInterest,
  requestRefund,
  cancelUnpaidBooking,
  subscribe,
  cancelMembership,
  getNotifications,
  markAllNotificationsRead,
  updateProfileOnServer,
  addBookingSilently,
  hasBookingForSeat,
} from '../state/store.js';

const PHONE_RE = /^01[016789]-\d{3,4}-\d{4}$/;

function formatPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, digits.length === 10 ? 6 : 7)}-${digits.slice(digits.length === 10 ? 6 : 7)}`;
}

function escapeAttr(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

const NAV = [
  { key: '', label: '마이페이지' },
  { key: 'bookings', label: '예매내역' },
  { key: 'refunds', label: '취소/환불내역' },
  { key: 'cancel-queue', label: '취소표 대기열' },
  { key: 'membership', label: '멤버십' },
  { key: 'interests', label: '관심 공연' },
  { key: 'notifications', label: '알림' },
  { key: 'profile', label: '회원정보' },
  { key: 'profile-edit', label: '회원정보 수정' },
];

// b.seats(신규, 1~4매 배열)와 b.seat(구형/백엔드 재구성 데이터, 단일 좌석) 둘 다
// 지원 — 좌석마다 "등급/구역 + 좌석번호"만 보여주고(내부 row/id는 노출 안 함),
// 여러 매면 쉼표로 이어붙인다.
function seatLabel(b) {
  const list = b.seats && b.seats.length ? b.seats : b.seat ? [b.seat] : [];
  return list.map((s) => `${s.gradeName || s.section} ${s._displayNum || s.seatNum}번`).join(', ');
}

function statusLabel(b) {
  if (b.status === 'confirmed') return `<span class="badge badge-green">예매 확정</span>`;
  if (b.status === 'unpaid') return `<span class="badge badge-orange">미입금</span>`;
  if (b.status === 'cancelled') return `<span class="badge badge-gray">예매 취소</span>`;
  if (b.status === 'refund_pending') return `<span class="badge badge-orange">환불 처리 중</span>`;
  if (b.status === 'refunded') return `<span class="badge badge-gray">환불 완료</span>`;
  return `<span class="badge badge-orange">결제 대기</span>`;
}

// A booking's concertId can point at either a mock CONCERTS entry (older demo
// data) or a real /events event (the queue→seat→payment flow that's actually
// wired to the backend now) — this normalizes both into the small shape the
// booking/refund rows actually need, so callers don't care which one it was.
function resolveConcert(concertId, realEvents) {
  const mock = getConcert(concertId);
  if (mock) {
    return {
      name: `${mock.artist} · ${mock.title}`,
      dateStart: mock.dateStart,
      venue: mock.venue,
      image: getConcertImage(mock.artist || mock.title),
    };
  }
  const real = (realEvents || []).find((e) => e.eventId === concertId);
  if (real) {
    return {
      name: real.eventName,
      dateStart: real.eventDate || null,
      venue: real.venue,
      image: getConcertImage(real.eventName || real.eventId),
    };
  }
  return null;
}

function daysUntilShow(b, meta) {
  const dateStr = b.session?.date || meta.dateStart?.slice(0, 10);
  if (!dateStr) return 999; // 공연일을 알 수 없으면 취소 수수료 없이 취소 가능한 쪽으로 처리
  const [y, m, d] = dateStr.split('-').map(Number);
  const showDate = new Date(y, m - 1, d);
  const today = new Date();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((showDate - todayMid) / 86400000);
}

function openRefundConfirm(b, meta) {
  const isUnpaid = b.status === 'unpaid';
  const days = daysUntilShow(b, meta);
  const rate = isUnpaid ? 0 : calcCancelFeeRate(days);
  const fee = Math.round(b.price * rate);
  const refundAmount = Math.max(0, b.price - fee);
  const rawDate = b.session?.date || meta.dateStart?.slice(0, 10);
  const dateLabel = rawDate ? rawDate.replaceAll('-', '.') : '';

  openModal({
    title: isUnpaid ? '입금 전 예매를 취소하시겠습니까?' : '예매를 취소하시겠습니까?',
    bodyHtml: `
      <p style="margin-bottom:14px;"><strong>${meta.name}</strong> 티켓을 ${isUnpaid ? '취소하시겠습니까?' : '환불하시겠습니까?'}</p>
      ${dateLabel ? `<div class="kv-row"><span>공연일</span><b>${dateLabel}${b.session?.time ? ' ' + b.session.time : ''}</b></div>` : ''}
      <div class="kv-row"><span>좌석</span><b>${seatLabel(b)}</b></div>
      <div class="divider"></div>
      <div class="kv-row"><span>결제금액</span><b class="num-mono">${formatPrice(b.price)}</b></div>
      ${isUnpaid ? '<div class="notice-box mt-16"><p>아직 입금 전이므로 취소 수수료와 환불 금액이 없습니다.</p></div>' : `
        <div class="kv-row"><span>취소 수수료</span><b class="num-mono text-red">-${formatPrice(fee)}</b></div>
        <div class="kv-row" style="font-size:15px;"><span><b>예상 환불금액</b></span><b class="num-mono text-red" style="font-size:19px;">${formatPrice(refundAmount)}</b></div>`}
      ${rate >= 1 ? `<div class="notice-box mt-16"><p>공연 당일에는 취소 및 환불이 불가합니다.</p></div>` : ''}
    `,
    footerHtml: `
      <button type="button" class="btn btn-ghost" data-modal-close>취소하지 않기</button>
      <button type="button" class="btn btn-primary" data-confirm-refund ${rate >= 1 ? 'disabled' : ''}>${isUnpaid ? '예매 취소' : '네, 환불합니다'}</button>
    `,
  });

  document.querySelector('[data-confirm-refund]')?.addEventListener('click', () => {
    const confirmBtn = document.querySelector('[data-confirm-refund]');
    if (confirmBtn) confirmBtn.disabled = true;

    const finish = () => {
      if (isUnpaid) cancelUnpaidBooking(b.bookingId);
      else requestRefund(b.bookingId);
      closeModal();
      showToast({
        title: isUnpaid ? '입금 전 예매가 취소되었습니다' : '환불 신청이 접수되었습니다',
        body: isUnpaid ? '좌석이 다시 예매 가능한 상태로 변경되었습니다.' : '환불 처리 중 상태로 변경되며, 완료되면 상태가 업데이트됩니다.',
        type: 'success',
      });
    };

    // Real (backend-confirmed) bookings need every seat actually released
    // server-side and its MariaDB reservation marked cancelled (one call per
    // seat — a booking can now hold up to 4) — mock/demo bookings have no
    // backend counterpart, so just flip the local status straight away.
    const userId = getState().user?.userId || getState().user?.email;
    const bookingSeats = b.seats && b.seats.length ? b.seats : b.seat ? [b.seat] : [];
    const realSeats = bookingSeats.filter((s) => typeof s.id === 'string' && s.id.includes(':'));
    if (realSeats.length && userId) {
      Promise.all(
        realSeats.map((s) =>
          fetch('/seats/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, seatId: s.id }),
          }).then((r) => r.json().then((data) => ({ ok: r.ok, data })))
        )
      )
        .then((results) => {
          const failed = results.find((r) => !r.ok || !r.data.success);
          if (failed) {
            if (confirmBtn) confirmBtn.disabled = false;
            showToast({ title: '환불 처리에 실패했습니다', body: failed.data.message || '잠시 후 다시 시도해주세요.', type: 'default' });
            return;
          }
          finish();
        })
        .catch(() => {
          if (confirmBtn) confirmBtn.disabled = false;
          showToast({ title: '환불 요청에 실패했습니다', body: '네트워크 상태를 확인하고 다시 시도해주세요.', type: 'default' });
        });
    } else {
      finish();
    }
  });
}

export const myPage = {
  render(container, params) {
    if (!isLoggedIn()) {
      setReturnTo('mypage');
      navigate('login');
      return;
    }
    const section = params.section || '';
    const { user, bookings, interests, cancelQueues } = getState();

    container.innerHTML = `
      <div class="container mypage-body">
        <aside class="mypage-nav">
          <div class="mypage-profile-card">
            <div data-mypage-avatar class="mypage-avatar">${escapeAttr(user.name.slice(0, 1))}</div>
            <div>
              <div data-mypage-user-name style="font-weight:800;font-size:14px;">${escapeAttr(user.name)}</div>
              <div class="text-secondary" style="font-size:12px;">${user.email}</div>
            </div>
          </div>
          ${NAV.map(
            (n) =>
              `<a href="#/mypage${n.key ? '/' + n.key : ''}" class="${section === n.key ? 'active' : ''}">${n.label}</a>`
          ).join('')}
        </aside>
        <div data-content></div>
      </div>
    `;

    const content = container.querySelector('[data-content]');

    // 예매/관심 공연이 목업 콘서트가 아니라 실제 /events 이벤트를 가리킬 수도 있으므로
    // (대기열~결제 플로우가 실제 API로 붙어있음) 캘린더/관심공연 목록에서 같이 보여주기 위해
    // 한 번만 받아와서 섹션 전환 시 재사용
    let realEventsCache = null;
    function withRealEvents(cb) {
      if (realEventsCache) {
        cb(realEventsCache);
        return;
      }
      fetch('/events')
        .then((res) => res.json())
        .then((data) => {
          realEventsCache = data.events || [];
          cb(realEventsCache);
        })
        .catch(() => cb([]));
    }

    // 예매/취소 내역은 그동안 브라우저 메모리(state.bookings)에만 있어서 새로고침하면
    // 사라졌음 — 실제 결제 확정(/seats/confirm)·취소(/seats/cancel)는 MariaDB
    // reservations 테이블에도 남으므로, 마이페이지 진입 시 그걸 조회해서 아직 로컬에
    // 없는 건만 채워 넣는다. seatId(예: "evt-...:VIP-001")에서 이벤트/구역 정보를
    // 복원하기 위해 /events, /seats도 같이 조회.
    const REFUND_HYDRATE_MS = 7 * 24 * 60 * 60 * 1000; // 7일 넘게 지난 취소 건은 굳이 복원 안 함

    function syncBookingsFromServer() {
      const userId = user?.userId || user?.email;
      if (!userId) return;
      fetch(`/reservations/user/${encodeURIComponent(userId)}`)
        .then((r) => r.json())
        .then(({ reservations }) => {
          const missing = (reservations || []).filter(
            (r) =>
              !hasBookingForSeat(r.seatId) &&
              (r.status !== 'CANCELLED' || (r.cancelledAt && Date.now() - new Date(r.cancelledAt).getTime() <= REFUND_HYDRATE_MS))
          );
          if (!missing.length) return;
          return Promise.all([fetch('/events').then((r) => r.json()), fetch('/seats').then((r) => r.json())]).then(
            ([eventsData, seatsData]) => {
              const seatById = new Map((seatsData.seats || []).map((s) => [s.seatId, s]));
              missing.forEach((r) => {
                const eventId = r.seatId.split(':')[0];
                const c = (eventsData.events || []).find((e) => e.eventId === eventId);
                if (!c) return;
                const bareId = r.seatId.includes(':') ? r.seatId.split(':').pop() : r.seatId;
                const seatInfo = seatById.get(r.seatId);
                const section = seatInfo?.section || bareId.split('-')[0];
                const isCancelled = r.status === 'CANCELLED';
                addBookingSilently({
                  bookingId: `R-${r.seatId}`,
                  concertId: eventId,
                  session: null,
                  zone: { id: section, label: `${section}구역` },
                  seat: {
                    id: r.seatId,
                    section,
                    row: bareId.split('-')[0],
                    seatNum: parseInt(bareId.split('-')[1], 10) || 0,
                    grade: section,
                    gradeName: `${section}구역`,
                  },
                  price: Number(seatInfo?.price) || 0,
                  status: isCancelled ? 'refunded' : 'confirmed',
                  cancelledAt: isCancelled ? new Date(r.cancelledAt).getTime() : undefined,
                  source: 'regular',
                  paymentMethod: 'card',
                  paidAt: new Date(r.reservedAt).getTime() || Date.now(),
                });
              });
            }
          );
        })
        .catch(() => {});
    }
    syncBookingsFromServer();

    function renderCurrentSection() {
      if (section === 'bookings') renderBookings();
      else if (section === 'cancel-queue') renderCancelQueue();
      else if (section === 'membership') renderMembership();
      else if (section === 'interests') renderInterests();
      else if (section === 'profile') renderProfile();
      else if (section === 'refunds') renderRefunds();
      else if (section === 'notifications') renderNotifications();
      else if (section === 'profile-edit') renderProfileEdit();
      else renderOverview();
    }
    renderCurrentSection();

    // Refund status flips from "처리 중" to "완료" a few seconds after the user
    // confirms — re-render the booking list/overview so that shows up live.
    const cleanup = subscribe(() => {
      if (section === 'bookings' || section === '') renderCurrentSection();
    });

    function renderOverview() {
      const activeBookings = bookings.filter((b) => b.status !== 'refunded' && b.status !== 'refund_pending');
      const interestCount = interests.size;
      const cancelQueueCount = Object.keys(cancelQueues).length;
      const membershipActive = hasMembership();
      withRealEvents((realEvents) => {
        content.innerHTML = `
          <div class="stat-cards">
            <div class="stat-card"><div class="stat-card__label">예매한 티켓</div><div class="stat-card__value red">${activeBookings.length}건</div></div>
            <div class="stat-card"><div class="stat-card__label">관심 공연</div><div class="stat-card__value">${interestCount}건</div></div>
            <div class="stat-card"><div class="stat-card__label">취소표 대기</div><div class="stat-card__value">${cancelQueueCount}건</div></div>
            <div class="stat-card">
              <div class="stat-card__label">멤버십</div>
              <div class="stat-card__value membership-mini-status ${membershipActive ? 'is-active' : 'is-standby'}" role="img" aria-label="${membershipActive ? '멤버십 활성화' : '멤버십 비활성화'}" title="${membershipActive ? '멤버십 활성화' : '멤버십 비활성화'}">
                <span class="membership-mini-stage" aria-hidden="true"><span class="membership-rocket-emoji">🚀</span></span>
              </div>
            </div>
          </div>

          <div class="mypage-section-title">최근 예매내역</div>
          ${
            activeBookings.length
              ? activeBookings
                  .slice(0, 3)
                  .map((b) => bookingRowHtml(b, realEvents))
                  .join('')
              : emptyRow('아직 예매한 티켓이 없습니다.')
          }

        `;
        wireBookingRows(content);
      });
    }

    function renderBookings() {
      const activeBookings = bookings.filter((b) => b.status !== 'refunded' && b.status !== 'refund_pending');
      withRealEvents((realEvents) => {
        content.innerHTML = `
          <div class="mypage-section-title" style="margin-top:0;">예매내역</div>
          ${activeBookings.length ? activeBookings.map((b) => bookingRowHtml(b, realEvents)).join('') : emptyRow('아직 예매한 티켓이 없습니다.')}
        `;
        wireBookingRows(content);
      });
    }

    function renderCancelQueue() {
      const entries = Object.entries(cancelQueues);
      content.innerHTML = `
        <div class="mypage-section-title" style="margin-top:0;">취소표 대기열</div>
        ${
          entries.length
            ? entries
                .map(([concertId, q]) => {
                  const c = getConcert(concertId);
                  if (!c) return '';
                  return `
                  <div class="ticket-row" data-open="${concertId}" style="cursor:pointer;">
                    <div>
                      <div class="ticket-row__concert">${c.artist} · ${c.title}</div>
                      <div class="ticket-row__meta">전체 대기자 ${formatNumber(q.total)}명 · 예상 대기시간 약 ${Math.max(1, Math.round((q.myNumber / q.total) * 210))}분</div>
                    </div>
                    <div style="text-align:right;">
                      <div class="ticket-row__price num-mono text-red">${formatNumber(q.myNumber)}번</div>
                      <div class="ticket-row__meta">${hasMembership() ? 'Private Link 이용 가능' : '멤버십 필요'}</div>
                    </div>
                  </div>`;
                })
                .join('')
            : emptyRow('취소표 대기열에 참여 중인 공연이 없습니다.')
        }
      `;
      content.querySelectorAll('[data-open]').forEach((el) => {
        el.addEventListener('click', () => navigate(`cancel-queue/${el.dataset.open}`));
      });
    }

    function renderMembership() {
      const m = getState().membership;
      content.innerHTML = `
        <div class="mypage-section-title" style="margin-top:0;">멤버십</div>
        <div class="card" style="padding:28px;">
          <div class="membership-status-row">
            <div class="membership-status-visual ${m ? 'is-active' : 'is-standby'}" role="img" aria-label="${m ? '멤버십 활성화' : '멤버십 비활성화'}">
              <div class="membership-rocket-stage">
                <span class="membership-rocket-emoji" aria-hidden="true">🚀</span>
                ${m ? '' : '<span class="membership-rocket__standby-light" aria-hidden="true"></span>'}
              </div>
              <div class="membership-status-visual__copy">
                <strong>${m ? '멤버십 활성화' : '멤버십 발사 대기'}</strong>
                <span>${m ? '취소표 우선 예매 준비 완료' : '멤버십 가입 후 이용할 수 있습니다'}</span>
              </div>
            </div>
            <div class="membership-status-actions">
              ${!m ? `<button class="btn btn-primary" data-join>멤버십 가입하기</button>` : `<span class="badge badge-red">✓ 이용중</span>`}
            </div>
          </div>
          ${m ? `<div class="membership-plan-meta">
            <div class="text-secondary" style="font-size:12.5px;">플랜: ${m.plan === 'yearly' ? '연간 멤버십' : '월간 멤버십'}</div>
            ${m.since ? `<div class="text-secondary" style="font-size:12px;margin-top:4px;">가입일: ${new Date(m.since).toLocaleDateString('ko-KR')}</div>` : ''}
          </div>` : ''}
          ${m ? `
          <div style="border-top:1px solid var(--color-border);margin-top:24px;padding-top:20px;">
            <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;">멤버십 혜택</h4>
            <ul style="font-size:13px;color:var(--color-text-secondary);line-height:2;">
              <li>취소표 대기열 우선 배정</li>
              <li>Secret Link 전용 예매 기회</li>
              <li>비회원 대비 빠른 순번 배정</li>
            </ul>
            <button class="btn btn-outline btn-block mt-24" style="color:var(--color-text-secondary);border-color:var(--color-border);" data-cancel-membership>멤버십 해지하기</button>
          </div>
          ` : ''}
        </div>
      `;
      content.querySelector('[data-join]')?.addEventListener('click', () => navigate('membership'));
      content.querySelector('[data-cancel-membership]')?.addEventListener('click', () => {
        openModal({
          title: '멤버십을 해지하시겠습니까?',
          bodyHtml: `
            <p style="margin-bottom:14px;">멤버십을 해지하시면 다음 혜택을 더 이상 이용할 수 없습니다.</p>
            <ul style="font-size:13.5px;color:var(--color-text-secondary);line-height:2;margin-bottom:14px;">
              <li>취소표 대기열 우선 배정</li>
              <li>Secret Link 전용 예매 기회</li>
            </ul>
            <div class="notice-box"><p>해지 후 재가입은 언제든 가능합니다.</p></div>
          `,
          footerHtml: `
            <button type="button" class="btn btn-ghost" data-modal-close>유지하기</button>
            <button type="button" class="btn btn-primary" style="background:var(--color-text-secondary);" data-confirm-cancel>해지하기</button>
          `,
        });
        document.querySelector('[data-confirm-cancel]')?.addEventListener('click', () => {
          const btn = document.querySelector('[data-confirm-cancel]');
          if (btn) { btn.disabled = true; btn.textContent = '처리 중...'; }
          cancelMembership().then((result) => {
            if (result.success) {
              closeModal();
              showToast({ title: '멤버십이 해지되었습니다', body: '재가입은 멤버십 페이지에서 언제든 가능합니다.', type: 'success' });
              renderMembership();
            } else {
              if (btn) { btn.disabled = false; btn.textContent = '해지하기'; }
              showToast({ title: '해지에 실패했습니다', body: result.message || '잠시 후 다시 시도해주세요.' });
            }
          });
        });
      });
    }

    function mockInterestCardHtml(c) {
      return `
        <div class="card" style="overflow:hidden;">
          <div class="interest-card__poster-wrap" data-open="${c.id}">
            <img class="interest-card__poster" src="${getConcertImage(c.artist || c.title)}" alt="${escapeAttr(c.artist)} 포스터" loading="lazy" />
            <button class="badge" data-heart="${c.id}" style="position:absolute;top:10px;right:10px;border:none;background:rgba(0,0,0,0.35);color:#fff;cursor:pointer;">♥</button>
          </div>
          <div style="padding:14px;">
            <div class="text-red" style="font-size:12px;font-weight:700;">${c.artist}</div>
            <div style="font-weight:800;font-size:13.5px;margin:4px 0 8px;">${c.title}</div>
            <div class="text-secondary" style="font-size:12px;">${formatDateRange(c.dateStart, c.dateEnd)}</div>
          </div>
        </div>`;
    }

    function realInterestCardHtml(e) {
      return `
        <div class="card" style="overflow:hidden;">
          <div class="interest-card__poster-wrap" data-open="${e.eventId}">
            <img class="interest-card__poster" src="${getConcertImage(e.eventName || e.eventId)}" alt="${escapeAttr(e.eventName)} 포스터" loading="lazy" />
            <button class="badge" data-heart="${e.eventId}" style="position:absolute;top:10px;right:10px;border:none;background:rgba(0,0,0,0.35);color:#fff;cursor:pointer;">♥</button>
          </div>
          <div style="padding:14px;">
            <div style="font-weight:800;font-size:13.5px;margin:4px 0 8px;">${e.eventName}</div>
            <div class="text-secondary" style="font-size:12px;">${e.eventDate || ''} · ${e.venue || '-'}</div>
          </div>
        </div>`;
    }

    function renderInterests() {
      withRealEvents((realEvents) => {
        const mockList = CONCERTS.filter((c) => interests.has(c.id));
        const realList = realEvents.filter((e) => interests.has(e.eventId));
        const cardsHtml = mockList.map(mockInterestCardHtml).join('') + realList.map(realInterestCardHtml).join('');
        const hasAny = mockList.length + realList.length > 0;
        content.innerHTML = `
          <div class="mypage-section-title" style="margin-top:0;">관심 공연</div>
          <div class="interest-grid">${cardsHtml}</div>
          ${hasAny ? '' : emptyRow('관심 등록한 공연이 없습니다.')}
        `;
        content.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => navigate(`concert/${el.dataset.open}`)));
        content.querySelectorAll('[data-heart]').forEach((el) =>
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleInterest(el.dataset.heart);
            renderInterests();
          })
        );
      });
    }

    function renderProfile() {
      content.innerHTML = `
        <div class="mypage-section-title" style="margin-top:0;">회원정보</div>
        <div class="card" style="padding:28px;max-width:480px;">
          <div class="field"><label>이름</label><input type="text" value="${escapeAttr(user.name)}" readonly /></div>
          <div class="field"><label>아이디</label><input type="text" value="${escapeAttr(user.userId)}" readonly /></div>
          <div class="field"><label>이메일</label><input type="text" value="${escapeAttr(user.email)}" readonly /></div>
          <div class="field"><label>휴대폰 번호</label><input type="text" value="${escapeAttr(formatPhone(user.phone || ''))}" readonly /></div>
          ${user.birthDate ? `<div class="field"><label>생년월일</label><input type="text" value="${escapeAttr(user.birthDate)}" readonly /></div>` : ''}
          <button type="button" class="btn btn-primary btn-block mt-16" data-go-profile-edit>회원정보 수정</button>
        </div>
      `;
      content.querySelector('[data-go-profile-edit]')?.addEventListener('click', () => navigate('mypage/profile-edit'));
    }

    function refundRowHtml(b, realEvents) {
      const meta = resolveConcert(b.concertId, realEvents);
      if (!meta) return '';
      const days = daysUntilShow(b, meta);
      const rate = calcCancelFeeRate(days);
      const fee = Math.round(b.price * rate);
      const refundAmount = Math.max(0, b.price - fee);
      const statusText =
        b.status === 'refunded'
          ? `<span class="badge badge-gray">환불 완료</span>`
          : `<span class="badge badge-orange">환불 처리 중</span>`;
      return `
        <div class="ticket-row" style="align-items:flex-start;">
          <div>
            <div class="ticket-row__concert">${meta.name}</div>
            <div class="ticket-row__meta">취소일 ${b.cancelledAt ? formatDate(b.cancelledAt) : '-'}</div>
          </div>
          <div style="text-align:right;">
            <div class="kv-row"><span>결제금액</span><b class="num-mono">${formatPrice(b.price)}</b></div>
            <div class="kv-row"><span>취소 수수료</span><b class="num-mono text-red">-${formatPrice(fee)}</b></div>
            <div class="kv-row"><span>환불금액</span><b class="num-mono">${formatPrice(refundAmount)}</b></div>
            <div class="mt-8">${statusText}</div>
          </div>
        </div>
      `;
    }

    const REFUND_HISTORY_MS = 7 * 24 * 60 * 60 * 1000; // 취소/환불내역은 7일만 유지

    function renderRefunds() {
      withRealEvents((realEvents) => {
        const list = bookings.filter(
          (b) =>
            (b.status === 'refund_pending' || b.status === 'refunded') &&
            (!b.cancelledAt || Date.now() - b.cancelledAt <= REFUND_HISTORY_MS)
        );
        content.innerHTML = `
          <div class="mypage-section-title" style="margin-top:0;">취소/환불내역</div>
          <div class="notice-box mt-8" style="margin-bottom:16px;"><p>취소/환불내역은 취소일로부터 7일간만 보관됩니다.</p></div>
          ${list.length ? list.map((b) => refundRowHtml(b, realEvents)).join('') : emptyRow('취소 및 환불 내역이 없습니다.')}
        `;
      });
    }

    function renderNotifications() {
      const list = getNotifications();
      content.innerHTML = `
        <div class="mypage-section-title" style="margin-top:0;">알림</div>
        ${
          list.length
            ? list
                .map(
                  (n) => `
              <div class="notif-list-item ${n.read ? '' : 'is-unread'}">
                <div class="notif-list-item__title">${n.title}</div>
                <div class="notif-list-item__body text-secondary">${n.body}</div>
                <div class="notif-list-item__time text-secondary">${new Date(n.createdAt).toLocaleString('ko-KR')}</div>
              </div>`
                )
                .join('')
            : emptyRow('아직 알림이 없습니다.')
        }
      `;
      markAllNotificationsRead();
    }

    function renderProfileEdit() {
      content.innerHTML = `
        <div class="mypage-section-title" style="margin-top:0;">회원정보 수정</div>
        <div class="card" style="padding:28px;max-width:480px;">
          <div class="field"><label>이름</label><input type="text" data-edit="name" value="${escapeAttr(user.name)}" maxlength="50" /></div>
          <div class="field">
            <label>이메일</label>
            <input type="text" value="${escapeAttr(user.email)}" readonly />
            <div class="text-secondary" style="font-size:12px;margin-top:4px;">이메일은 계정 식별자로 사용되어 수정할 수 없습니다.</div>
          </div>
          <div class="field"><label>휴대폰 번호</label><input type="tel" data-edit="phone" value="${escapeAttr(formatPhone(user.phone || ''))}" placeholder="010-1234-5678" maxlength="13" /></div>
          <div class="field"><label>새 비밀번호</label><input type="password" data-edit="password" placeholder="변경하지 않으려면 비워두세요" /></div>
          <div class="field"><label>새 비밀번호 확인</label><input type="password" data-edit="password-confirm" placeholder="새 비밀번호를 한 번 더 입력해주세요" /></div>
          <label class="terms-row" style="margin:4px 0 6px;">
            <input type="checkbox" data-edit="marketing" ${user.marketingOptIn ? 'checked' : ''} />
            <span>이벤트 및 마케팅 정보 수신 동의</span>
          </label>
          ${user.birthDate ? `<div class="field"><label>생년월일</label><input type="text" value="${escapeAttr(user.birthDate)}" readonly /></div>` : ''}
          ${user.joinedAt ? `<div class="text-secondary" style="font-size:12px;">가입일 · ${formatDate(user.joinedAt)}</div>` : ''}
          <button type="button" class="btn btn-primary btn-block mt-24" data-save-profile>저장하기</button>
        </div>
      `;
      const phoneInput = content.querySelector('[data-edit="phone"]');
      phoneInput?.addEventListener('input', () => {
        phoneInput.value = formatPhone(phoneInput.value);
      });

      const saveButton = content.querySelector('[data-save-profile]');
      saveButton.addEventListener('click', async () => {
        const name = content.querySelector('[data-edit="name"]').value.trim();
        const phone = content.querySelector('[data-edit="phone"]').value.trim();
        const password = content.querySelector('[data-edit="password"]').value;
        const passwordConfirm = content.querySelector('[data-edit="password-confirm"]').value;
        const marketing = content.querySelector('[data-edit="marketing"]').checked;
        if (!name) {
          showToast({ title: '이름을 입력해주세요.' });
          return;
        }
        if (phone && !PHONE_RE.test(phone)) {
          showToast({ title: '휴대폰 번호 형식을 확인해주세요.' });
          return;
        }
        if (password && password.length < 4) {
          showToast({ title: '새 비밀번호는 4자 이상이어야 합니다.' });
          return;
        }
        if (password !== passwordConfirm) {
          showToast({ title: '새 비밀번호가 일치하지 않습니다.' });
          return;
        }

        saveButton.disabled = true;
        saveButton.textContent = '저장 중...';
        const result = await updateProfileOnServer({
          name,
          phone,
          password,
          marketingOptIn: marketing,
        });
        if (!result.success) {
          saveButton.disabled = false;
          saveButton.textContent = '저장하기';
          showToast({ title: result.message || '회원정보를 저장하지 못했습니다.' });
          return;
        }
        showToast({ title: '회원정보가 수정되었습니다', type: 'success' });
        const userNameEl = container.querySelector('[data-mypage-user-name]');
        if (userNameEl) userNameEl.textContent = getState().user?.name || '';
        const avatarEl = container.querySelector('[data-mypage-avatar]');
        if (avatarEl) avatarEl.textContent = (getState().user?.name || '게').slice(0, 1);
        renderProfileEdit();
      });
    }

    function bookingRowHtml(b, realEvents) {
      const meta = resolveConcert(b.concertId, realEvents);
      if (!meta) return '';
      const dateLabel = b.session?.date ? b.session.date.replaceAll('-', '.') : meta.dateStart ? formatDate(meta.dateStart) : '';
      return `
        <div class="ticket-row" style="align-items:flex-start;flex-wrap:wrap;">
          <div class="ticket-row__main">
            <img class="ticket-row__poster" src="${meta.image}" alt="${escapeAttr(meta.name)} 포스터" loading="lazy" />
            <div class="ticket-row__info">
            <div class="ticket-row__concert">${meta.name} ${b.source === 'cancel' ? '<span class="badge badge-red-light">취소표</span>' : ''}</div>
            <div class="ticket-row__meta">${dateLabel}${b.session?.time ? ' ' + b.session.time : ''}${dateLabel ? ' · ' : ''}${seatLabel(b)}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div class="ticket-row__price num-mono">${formatPrice(b.price)}</div>
            <div class="ticket-row__meta mt-8">${statusLabel(b)}</div>
            <div class="ticket-row__actions mt-8">
              <button type="button" class="btn btn-ghost btn-sm" data-ticket="${b.bookingId}">티켓 확인</button>
              ${b.status === 'confirmed' ? `<button type="button" class="btn btn-outline btn-sm" data-refund="${b.bookingId}">환불하기</button>` : ''}
              ${b.status === 'unpaid' ? `<button type="button" class="btn btn-outline btn-sm" data-refund="${b.bookingId}">입금 취소</button>` : ''}
            </div>
          </div>
          ${b.status === 'unpaid' && b.virtualAccount ? vbankInfoHtml(b) : ''}
        </div>
      `;
    }

    function vbankInfoHtml(b) {
      return `
        <div class="vbank-box" style="width:100%;margin-top:14px;">
          <div class="vbank-box__label">가상계좌 입금 정보</div>
          <div class="kv-row"><span>결제 수단</span><b>무통장입금</b></div>
          <div class="vbank-box__bank">${b.virtualAccount.bank}</div>
          <div class="vbank-box__number num-mono">${b.virtualAccount.number}</div>
          <div class="vbank-box__amount">입금액 <b class="num-mono">${formatPrice(b.price)}</b></div>
          ${b.vbankDeadline ? `<div class="kv-row"><span>입금기한</span><b>${new Date(b.vbankDeadline).toLocaleString('ko-KR')}</b></div>` : ''}
          <div class="kv-row"><span>입금상태</span><b>${statusLabel(b)}</b></div>
        </div>
      `;
    }

    function wireBookingRows(scopeEl) {
      scopeEl.querySelectorAll('[data-ticket]').forEach((btn) => {
        btn.addEventListener('click', () => navigate(`complete/${btn.dataset.ticket}`));
      });
      scopeEl.querySelectorAll('[data-refund]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const booking = getState().bookings.find((x) => x.bookingId === btn.dataset.refund);
          if (!booking) return;
          withRealEvents((realEvents) => {
            const meta = resolveConcert(booking.concertId, realEvents);
            if (meta) openRefundConfirm(booking, meta);
          });
        });
      });
    }

    function emptyRow(msg) {
      return `<div class="card" style="padding:40px;text-align:center;color:var(--color-disabled);font-size:13.5px;">${msg}</div>`;
    }

    return cleanup;
  },
};
