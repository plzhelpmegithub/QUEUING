// Minimal reusable modal — one at a time, closes on backdrop click / Esc / close button.

let active = null;

export function closeModal() {
  if (active) active.close();
}

export function openModal({ title, bodyHtml, footerHtml = '', size = '', onClose = null }) {
  closeModal();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box ${size}" role="dialog" aria-modal="true">
      <div class="modal-box__head">
        <h3>${title}</h3>
        <button type="button" class="modal-box__close" data-modal-close aria-label="닫기">&times;</button>
      </div>
      <div class="modal-box__body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-box__footer">${footerHtml}</div>` : ''}
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');

  function escHandler(e) {
    if (e.key === 'Escape') close();
  }

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', escHandler);
    if (active === api) active = null;
    if (typeof onClose === 'function') onClose();
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelectorAll('[data-modal-close]').forEach((btn) => btn.addEventListener('click', close));
  document.addEventListener('keydown', escHandler);

  const api = { el: overlay, close };
  active = api;
  return api;
}
