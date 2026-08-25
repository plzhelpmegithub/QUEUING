// 화면 우하단 토스트 알림 컴포넌트 — mountToastRoot로 컨테이너를 등록한 뒤
// showToast로 알림을 띄운다. 클릭하거나 duration(ms)이 지나면 자동으로 사라진다.

let root = null;

export function mountToastRoot(el) {
  root = el;
}

export function showToast({ title, body, actionLabel, onAction, type = 'default', duration = 3600 }) {
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type === 'success' ? 'toast-success' : ''}`;
  el.innerHTML = `
    ${title ? `<div class="toast__title">${title}</div>` : ''}
    ${body ? `<div class="toast__body">${body}</div>` : ''}
    ${actionLabel ? `<div class="toast__action">${actionLabel}</div>` : ''}
  `;
  if (actionLabel && onAction) {
    el.querySelector('.toast__action').addEventListener('click', () => {
      onAction();
      dismiss();
    });
  }
  root.appendChild(el);

  let removed = false;
  function dismiss() {
    if (removed) return;
    removed = true;
    el.style.transition = 'opacity .2s ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  }
  const t = setTimeout(dismiss, duration);
  el.addEventListener('click', () => {
    clearTimeout(t);
    dismiss();
  });
  return dismiss;
}
