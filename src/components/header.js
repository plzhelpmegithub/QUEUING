// 사이트 전역 헤더 컴포넌트 — 로그인 상태/알림/프로필 드롭다운을 렌더링하고,
// 예매 진행 중(대기열·결제)엔 단순 레이아웃으로, 예매 완료 화면에선 헤더 자체를 숨긴다.
// 좌석선택 제한시간 타이머도 여기서 관리하며 1초마다 갱신한다.

import {
  getState,
  subscribe,
  logout,
  consumeSessionExpiredFlag,
  setReturnTo,
  getNotifications,
  unreadNotificationCount,
  markAllNotificationsRead,
  getSeatSelectDeadline,
  clearSeatSelectTimer,
  clearCurrentOrder,
} from '../state/store.js';
import { navigate } from '../router.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { formatMMSS } from '../utils/format.js';

const NAV_ITEMS = [
  { label: '공연', path: '' , match: /^$|^concert\//},
  { label: '콘서트', path: 'concerts', match: /^concerts$/ },
  { label: '관심 공연', path: 'mypage/interests', match: /^mypage\/interests$/ },
  { label: '마이페이지', path: 'mypage', match: /^mypage/ },
];

// 예매 프로세스(대기열 → 좌석선택 → 결제) 동안은 헤더가 로고 + 마이페이지/예매확인만
// 남는 단순 레이아웃으로 바뀌고, '예매 완료' 화면부터는 헤더 자체가 사라진다.
const BOOKING_FLOW_RE = /^(queue|zones|payment)\//;
const BOOKING_COMPLETE_RE = /^complete\//;

let rootEl = null;
let currentPath = '';
let profileOpen = false;
let notifOpen = false;
let seatTimerInterval = null;

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

function confirmLogout() {
  openModal({
    title: '로그아웃하시겠습니까?',
    bodyHtml: `<p>로그아웃 시 다시 로그인해야 예매내역과 마이페이지를 이용할 수 있습니다.</p>`,
    footerHtml: `
      <button type="button" class="btn btn-ghost" data-modal-close>취소</button>
      <button type="button" class="btn btn-primary" data-confirm-logout>로그아웃</button>
    `,
  });
  document.querySelector('[data-confirm-logout]')?.addEventListener('click', () => {
    closeModal();
    logout();
    navigate('');
  });
}

function showSessionExpiredModal() {
  openModal({
    title: '로그인 세션이 만료되었습니다',
    bodyHtml: `<p>안전한 서비스 이용을 위해 다시 로그인해주세요.</p>`,
    footerHtml: `<button type="button" class="btn btn-primary btn-block" data-modal-close data-relogin>다시 로그인</button>`,
  });
  document.querySelector('[data-relogin]')?.addEventListener('click', () => {
    setReturnTo(currentPath);
    navigate('login');
  });
}

function render() {
  const { user, membership } = getState();

  if (!user && consumeSessionExpiredFlag()) {
    showSessionExpiredModal();
  }

  if (seatTimerInterval) {
    clearInterval(seatTimerInterval);
    seatTimerInterval = null;
  }

  // '예매 완료' 화면부터는 헤더 자체를 완전히 숨김 — 대기열/좌석선택/결제까지는
  // (아래 isBookingFlow 분기로) 계속 유지되던 상단 바가 여기서부터 사라진다.
  if (BOOKING_COMPLETE_RE.test(currentPath)) {
    rootEl.style.display = 'none';
    rootEl.innerHTML = '';
    return;
  }
  rootEl.style.display = '';

  const notifications = getNotifications();
  const unread = unreadNotificationCount();
  const seatDeadline = getSeatSelectDeadline();
  const isBookingFlow = BOOKING_FLOW_RE.test(currentPath);

  const seatTimerHtml = seatDeadline
    ? `<div class="header-seat-timer" data-seat-timer>
        <span class="header-seat-timer__label">좌석선택 제한시간</span>
        <span class="header-seat-timer__clock num-mono" data-seat-timer-clock>--:--</span>
      </div>`
    : '';

  // 예매 프로세스 진행 중엔 헤더가 로고(좌) + 마이페이지/예매확인(우)만 남는
  // 단순 레이아웃으로 바뀐다 — 탐색 메뉴/알림/프로필/로그인 버튼은 숨김.
  rootEl.innerHTML = isBookingFlow
    ? `
    <div class="container">
      <div class="site-header__left">
        <a href="#/" class="site-header__logo">
          <img src="/favicon.svg" alt="" class="site-header__mark" />
          QUEUING
        </a>
      </div>
      <div class="site-header__actions">
        ${seatTimerHtml}
        <a href="#/mypage" class="site-header__ghost-btn">마이페이지</a>
        <a href="#/mypage/bookings" class="site-header__ghost-btn">예매 확인</a>
      </div>
    </div>
  `
    : `
    <div class="container">
      <div class="site-header__left">
        <a href="#/" class="site-header__logo">
          <img src="/favicon.svg" alt="" class="site-header__mark" />
          QUEUING
        </a>
        <nav class="site-header__nav">
          ${NAV_ITEMS.map(
            (item) =>
              `<a href="#/${item.path}" data-path="${item.path}" class="${item.match.test(currentPath) ? 'active' : ''}">${item.label}</a>`
          ).join('')}
        </nav>
      </div>
      <div class="site-header__actions">
        ${seatTimerHtml}
        ${
          user
            ? `
          <div class="notif-wrap">
            <button type="button" class="notif-bell" data-notif-toggle aria-label="알림">
              🔔${unread > 0 ? `<span class="notif-bell__dot">${unread > 9 ? '9+' : unread}</span>` : ''}
            </button>
            <div class="notif-dropdown ${notifOpen ? 'open' : ''}" data-notif-panel>
              <div class="notif-dropdown__head">알림</div>
              ${
                notifications.length
                  ? notifications
                      .slice(0, 8)
                      .map(
                        (n) => `
                    <div class="notif-item ${n.read ? '' : 'is-unread'}">
                      <div class="notif-item__title">${n.title}</div>
                      <div class="notif-item__body">${n.body}</div>
                      <div class="notif-item__time">${timeAgo(n.createdAt)}</div>
                    </div>`
                      )
                      .join('')
                  : `<div class="notif-empty">아직 알림이 없습니다.</div>`
              }
            </div>
          </div>

          <div class="profile-wrap">
            <button type="button" class="site-header__user ${profileOpen ? 'open' : ''}" data-profile-toggle>
              <span>${user.name}님</span>
              ${membership ? `<span class="site-header__member-chip">MEMBERSHIP</span>` : ''}
              ${user.isAdmin ? `<span class="site-header__member-chip site-header__member-chip--admin">ADMIN</span>` : ''}
              ${user.isMonitor ? `<span class="site-header__member-chip site-header__member-chip--admin">MONITOR</span>` : ''}
              <span class="profile-caret">▾</span>
            </button>
            <div class="profile-dropdown ${profileOpen ? 'open' : ''}" data-profile-panel>
              <div class="profile-dropdown__head">${user.name}님</div>
              <a href="#/mypage">마이페이지</a>
              <a href="#/mypage/bookings">예매내역</a>
              <a href="#/mypage/refunds">취소/환불내역</a>
              <a href="#/mypage/profile-edit">회원정보 수정</a>
              <div class="divider" style="margin:6px 0;"></div>
              <button type="button" class="profile-dropdown__logout" data-action="logout">로그아웃</button>
            </div>
          </div>
          ${user.isAdmin ? `<a href="#/admin" class="site-header__ghost-btn">관리</a>` : ''}
          ${user.isMonitor ? `<a href="#/monitoring" class="site-header__ghost-btn">모니터링</a>` : ''}
        `
            : `
          <a href="#/login" class="site-header__ghost-btn">로그인</a>
          <a href="#/signup" class="site-header__solid-btn">회원가입</a>
        `
        }
      </div>
    </div>
  `;

  if (seatDeadline) {
    const clockEl = rootEl.querySelector('[data-seat-timer-clock]');
    const pillEl = rootEl.querySelector('[data-seat-timer]');
    const paint = () => {
      const remaining = getSeatSelectDeadline() - Date.now();
      if (remaining <= 0) {
        clearInterval(seatTimerInterval);
        seatTimerInterval = null;
        clearSeatSelectTimer();
        clearCurrentOrder();
        showToast({ title: '좌석선택 시간이 만료되었습니다', body: '처음부터 다시 예매해주세요.' });
        navigate('');
        return;
      }
      if (clockEl) clockEl.textContent = formatMMSS(remaining);
      if (pillEl) pillEl.classList.toggle('header-seat-timer--urgent', remaining <= 60000);
    };
    paint();
    seatTimerInterval = setInterval(paint, 1000);
  }

  const notifToggle = rootEl.querySelector('[data-notif-toggle]');
  if (notifToggle) {
    notifToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      notifOpen = !notifOpen;
      profileOpen = false;
      if (notifOpen) markAllNotificationsRead();
      render();
    });
  }
  const profileToggle = rootEl.querySelector('[data-profile-toggle]');
  if (profileToggle) {
    profileToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      profileOpen = !profileOpen;
      notifOpen = false;
      render();
    });
  }
  const logoutBtn = rootEl.querySelector('[data-action="logout"]');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      profileOpen = false;
      render();
      confirmLogout();
    });
  }
}

function handleOutsideClick(e) {
  if (!rootEl) return;
  if (!rootEl.contains(e.target)) return;
  if (!e.target.closest('[data-notif-toggle]') && !e.target.closest('[data-notif-panel]') && notifOpen) {
    notifOpen = false;
    render();
  }
  if (!e.target.closest('[data-profile-toggle]') && !e.target.closest('[data-profile-panel]') && profileOpen) {
    profileOpen = false;
    render();
  }
}

export function mountHeader(el) {
  rootEl = el;
  render();
  subscribe(render);
  document.addEventListener('click', (e) => {
    if (!rootEl) return;
    if (!rootEl.contains(e.target)) {
      if (notifOpen) {
        notifOpen = false;
        render();
      }
      if (profileOpen) {
        profileOpen = false;
        render();
      }
      return;
    }
    handleOutsideClick(e);
  });
}

export function setHeaderActivePath(path) {
  const wasBookingFlow = BOOKING_FLOW_RE.test(currentPath);
  const isNowBookingFlow = BOOKING_FLOW_RE.test(path);

  currentPath = path;
  profileOpen = false;
  notifOpen = false;

  if (wasBookingFlow && !isNowBookingFlow) {
    clearSeatSelectTimer();
  }

  render();
}
