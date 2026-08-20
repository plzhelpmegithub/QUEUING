// Minimal hash-based router for the QUEUING SPA (no build step required).

const routes = [];
let currentCleanup = null;
let container = null;
let onRouteChange = () => {};

export function registerRoute(pattern, page) {
  routes.push({ pattern, page });
}

export function navigate(path) {
  const target = `#/${path}`.replace(/^#\/\/+/, '#/');
  if (location.hash === target) {
    route(); // force re-render even if same hash
  } else {
    location.hash = target;
  }
}

function parseHash() {
  let h = location.hash || '#/';
  h = h.replace(/^#\/?/, '');
  const [pathPart, queryPart] = h.split('?');
  const query = {};
  if (queryPart) {
    new URLSearchParams(queryPart).forEach((v, k) => (query[k] = v));
  }
  return { path: pathPart, query };
}

function matchRoute(path) {
  for (const r of routes) {
    const m = path.match(r.pattern);
    if (m) return { page: r.page, params: m.groups || {} };
  }
  return null;
}

function route() {
  const { path, query } = parseHash();
  const matched = matchRoute(path);

  if (typeof currentCleanup === 'function') {
    try {
      currentCleanup();
    } catch (e) {
      console.error(e);
    }
  }
  currentCleanup = null;
  container.innerHTML = '';

  if (!matched) {
    container.innerHTML = `<div class="center-state"><div class="center-state__icon">🎫</div><div class="center-state__title">페이지를 찾을 수 없습니다</div><div class="center-state__desc">주소를 다시 확인해주세요.</div></div>`;
    onRouteChange(path);
    return;
  }

  const result = matched.page.render(container, matched.params, query);
  if (typeof result === 'function') currentCleanup = result;
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  onRouteChange(path);
}

export function initRouter(containerEl, { onChange } = {}) {
  container = containerEl;
  if (onChange) onRouteChange = onChange;
  window.addEventListener('hashchange', route);
  route();
}
