import { getState, subscribe, logout } from '../state/store.js';
import { navigate } from '../router.js';

const NAV_ITEMS = [
  { label: '공연', path: '' , match: /^$|^concert\//},
  { label: '콘서트', path: 'concerts', match: /^concerts$/ },
  { label: '관심 공연', path: 'mypage/interests', match: /^mypage\/interests$/ },
  { label: '마이페이지', path: 'mypage', match: /^mypage/ },
];

let rootEl = null;
let currentPath = '';

function initials(name) {
  return (name || 'Q').slice(0, 1).toUpperCase();
}

function render() {
  const { user, membership } = getState();

  rootEl.innerHTML = `
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
        ${
          user
            ? `
          <div class="site-header__user">
            <span>${user.name}님</span>
            ${membership ? `<span class="site-header__member-chip">MEMBERSHIP</span>` : ''}
            ${user.isAdmin ? `<span class="site-header__member-chip site-header__member-chip--admin">ADMIN</span>` : ''}
          </div>
          ${user.isAdmin ? `<a href="#/admin" class="site-header__ghost-btn">모니터링</a>` : ''}
          <button class="site-header__ghost-btn" data-action="logout">로그아웃</button>
        `
            : `
          <a href="#/login" class="site-header__ghost-btn">로그인</a>
          <a href="#/signup" class="site-header__solid-btn">회원가입</a>
        `
        }
      </div>
    </div>
  `;

  const logoutBtn = rootEl.querySelector('[data-action="logout"]');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      logout();
      navigate('');
    });
  }
}

export function mountHeader(el) {
  rootEl = el;
  render();
  subscribe(render);
}

export function setHeaderActivePath(path) {
  currentPath = path;
  render();
}
