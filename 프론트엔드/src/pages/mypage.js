import { CONCERTS, getConcert } from '../data/concerts.js';
import { formatDate, formatPrice, formatNumber, formatDateRange } from '../utils/format.js';
import { navigate } from '../router.js';
import { mountCalendar } from '../components/calendar.js';
import { buildCalendarEvents } from '../utils/calendarEvents.js';
import {
  getState,
  isLoggedIn,
  setReturnTo,
  hasMembership,
  isInterested,
  toggleInterest,
} from '../state/store.js';

const NAV = [
  { key: '', label: '마이페이지' },
  { key: 'bookings', label: '예매내역' },
  { key: 'cancel-queue', label: '취소표 대기열' },
  { key: 'membership', label: '멤버십' },
  { key: 'interests', label: '관심 공연' },
  { key: 'calendar', label: '캘린더' },
  { key: 'profile', label: '회원정보' },
];

function statusLabel(b) {
  if (b.status === 'confirmed') return `<span class="badge badge-green">예매 확정</span>`;
  return `<span class="badge badge-orange">결제 대기</span>`;
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
            <div class="mypage-avatar">${user.name.slice(0, 1)}</div>
            <div>
              <div style="font-weight:800;font-size:14px;">${user.name}</div>
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
    let cleanup = null;

    if (section === 'bookings') renderBookings();
    else if (section === 'cancel-queue') renderCancelQueue();
    else if (section === 'membership') renderMembership();
    else if (section === 'interests') renderInterests();
    else if (section === 'calendar') renderCalendarSection();
    else if (section === 'profile') renderProfile();
    else renderOverview();

    function renderOverview() {
      const confirmedCount = bookings.length;
      const interestCount = interests.size;
      const cancelQueueCount = Object.keys(cancelQueues).length;
      content.innerHTML = `
        <div class="stat-cards">
          <div class="stat-card"><div class="stat-card__label">예매한 티켓</div><div class="stat-card__value red">${confirmedCount}건</div></div>
          <div class="stat-card"><div class="stat-card__label">관심 공연</div><div class="stat-card__value">${interestCount}건</div></div>
          <div class="stat-card"><div class="stat-card__label">취소표 대기</div><div class="stat-card__value">${cancelQueueCount}건</div></div>
          <div class="stat-card"><div class="stat-card__label">멤버십</div><div class="stat-card__value">${hasMembership() ? '<span class="text-red">ACTIVE</span>' : 'INACTIVE'}</div></div>
        </div>

        <div class="mypage-section-title">최근 예매내역</div>
        ${
          bookings.length
            ? bookings
                .slice(0, 3)
                .map((b) => bookingRowHtml(b))
                .join('')
            : emptyRow('아직 예매한 티켓이 없습니다.')
        }

        <div class="mypage-section-title">내 캘린더</div>
        <div class="cal" data-cal></div>
      `;
      mountCalendar(content.querySelector('[data-cal]'), {
        events: buildCalendarEvents(),
        onSelectConcert: (id) => navigate(`concert/${id}`),
      });
    }

    function renderBookings() {
      content.innerHTML = `
        <div class="mypage-section-title" style="margin-top:0;">예매내역</div>
        ${bookings.length ? bookings.map((b) => bookingRowHtml(b)).join('') : emptyRow('아직 예매한 티켓이 없습니다.')}
      `;
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
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:13px;color:var(--color-text-secondary);margin-bottom:8px;">멤버십 상태</div>
              <div style="font-size:24px;font-weight:900;" class="${m ? 'text-red' : ''}">${m ? 'ACTIVE' : 'INACTIVE'}</div>
              ${m ? `<div class="text-secondary" style="font-size:12.5px;margin-top:6px;">플랜: ${m.plan === 'yearly' ? '연간 멤버십' : '월간 멤버십'}</div>` : ''}
            </div>
            ${!m ? `<button class="btn btn-primary" data-join>멤버십 가입하기</button>` : `<span class="badge badge-red">✓ 이용중</span>`}
          </div>
        </div>
      `;
      content.querySelector('[data-join]')?.addEventListener('click', () => navigate('membership'));
    }

    function renderInterests() {
      const list = CONCERTS.filter((c) => interests.has(c.id));
      content.innerHTML = `
        <div class="mypage-section-title" style="margin-top:0;">관심 공연</div>
        <div class="interest-grid">
          ${
            list.length
              ? list
                  .map(
                    (c) => `
              <div class="card" style="overflow:hidden;">
                <div style="height:150px;background:${c.grad};cursor:pointer;position:relative;" data-open="${c.id}">
                  <button class="badge" data-heart="${c.id}" style="position:absolute;top:10px;right:10px;border:none;background:rgba(0,0,0,0.35);color:#fff;cursor:pointer;">♥</button>
                </div>
                <div style="padding:14px;">
                  <div class="text-red" style="font-size:12px;font-weight:700;">${c.artist}</div>
                  <div style="font-weight:800;font-size:13.5px;margin:4px 0 8px;">${c.title}</div>
                  <div class="text-secondary" style="font-size:12px;">${formatDateRange(c.dateStart, c.dateEnd)}</div>
                </div>
              </div>`
                  )
                  .join('')
              : ''
          }
        </div>
        ${list.length ? '' : emptyRow('관심 등록한 공연이 없습니다.')}
      `;
      content.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => navigate(`concert/${el.dataset.open}`)));
      content.querySelectorAll('[data-heart]').forEach((el) =>
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleInterest(el.dataset.heart);
          renderInterests();
        })
      );
    }

    function renderCalendarSection() {
      content.innerHTML = `
        <div class="mypage-section-title" style="margin-top:0;">내 캘린더</div>
        <div class="mypage-cal-layout">
          <div class="cal cal--lg" data-cal></div>
          <div class="card" style="padding:24px;">
            <h3 style="font-size:15px;font-weight:800;margin-bottom:16px;">범례 안내</h3>
            <div class="kv-row"><span><span class="cal__dot cal__dot--booked" style="display:inline-block;"></span>&nbsp; 예매 완료</span><span>확정된 예매 공연 일정</span></div>
            <div class="kv-row"><span>♥ &nbsp;관심 공연</span><span>관심 등록한 공연 일정</span></div>
            <div class="kv-row"><span><span class="cal__dot cal__dot--upcoming" style="display:inline-block;"></span>&nbsp; 예매 오픈</span><span>예매 시작 예정 공연</span></div>
          </div>
        </div>
      `;
      mountCalendar(content.querySelector('[data-cal]'), {
        events: buildCalendarEvents(),
        onSelectConcert: (id) => navigate(`concert/${id}`),
      });
    }

    function renderProfile() {
      content.innerHTML = `
        <div class="mypage-section-title" style="margin-top:0;">회원정보</div>
        <div class="card" style="padding:28px;max-width:480px;">
          <div class="field"><label>이름</label><input type="text" value="${user.name}" readonly /></div>
          <div class="field"><label>아이디</label><input type="text" value="${user.userId}" readonly /></div>
          <div class="field"><label>이메일</label><input type="text" value="${user.email}" readonly /></div>
          <div class="badge badge-gray">데모 계정 정보는 수정할 수 없습니다</div>
        </div>
      `;
    }

    function bookingRowHtml(b) {
      const c = getConcert(b.concertId);
      if (!c) return '';
      return `
        <div class="ticket-row">
          <div>
            <div class="ticket-row__concert">${c.artist} · ${c.title} ${b.source === 'cancel' ? '<span class="badge badge-red-light">취소표</span>' : ''}</div>
            <div class="ticket-row__meta">${formatDate(c.dateStart)} · ${b.seat.gradeName} ${b.seat.section} ${b.seat.row}열 ${b.seat.seatNum}번</div>
          </div>
          <div style="text-align:right;">
            <div class="ticket-row__price num-mono">${formatPrice(b.price)}</div>
            <div class="ticket-row__meta">${statusLabel(b)}</div>
          </div>
        </div>
      `;
    }

    function emptyRow(msg) {
      return `<div class="card" style="padding:40px;text-align:center;color:var(--color-disabled);font-size:13.5px;">${msg}</div>`;
    }

    return cleanup;
  },
};
