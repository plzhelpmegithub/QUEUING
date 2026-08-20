import { CONCERTS, getConcertStatus } from '../data/concerts.js';
import { formatDateRange, formatNumber } from '../utils/format.js';
import { navigate } from '../router.js';
import { isInterested, toggleInterest, subscribe } from '../state/store.js';

function statusBadge(c) {
  const st = getConcertStatus(c);
  if (st === 'soldout') return `<span class="badge badge-dark-red">SOLD OUT</span>`;
  if (st === 'upcoming') return `<span class="badge badge-outline">예매 예정</span>`;
  return `<span class="badge badge-red">예매중</span>`;
}

export const concertsListPage = {
  render(container) {
    container.innerHTML = `
      <section class="page-section">
        <div class="container">
          <div class="eyebrow">ALL CONCERTS</div>
          <h2 class="section-title">예매 가능한 공연</h2>
          <p class="section-sub">QUEUING에서 진행 중인 모든 공연을 확인하세요</p>
          <div class="interest-grid mt-24">
            ${CONCERTS.map(
              (c) => `
              <div class="card fade-in" style="overflow:hidden;">
                <div style="height:180px;background:${c.grad};position:relative;cursor:pointer;" data-open="${c.id}">
                  <div style="position:absolute;top:10px;left:10px;">${statusBadge(c)}</div>
                  <button type="button" class="badge" data-heart="${c.id}" style="position:absolute;top:10px;right:10px;border:none;background:rgba(0,0,0,0.35);color:#fff;cursor:pointer;">
                    ${isInterested(c.id) ? '♥' : '♡'}
                  </button>
                </div>
                <div style="padding:16px;">
                  <div class="text-red" style="font-size:12px;font-weight:700;">${c.artist}</div>
                  <div style="font-weight:800;font-size:14.5px;margin:4px 0 10px;line-height:1.4;height:38px;overflow:hidden;">${c.title}</div>
                  <div class="text-secondary" style="font-size:12px;">${formatDateRange(c.dateStart, c.dateEnd)}</div>
                  <div class="text-secondary" style="font-size:12px;margin-top:2px;">${c.venue} · ${formatNumber(c.totalSeats)}석</div>
                </div>
              </div>`
            ).join('')}
          </div>
        </div>
      </section>
    `;

    container.querySelectorAll('[data-open]').forEach((el) => {
      el.addEventListener('click', () => navigate(`concert/${el.dataset.open}`));
    });
    container.querySelectorAll('[data-heart]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleInterest(el.dataset.heart);
      });
    });
    const unsub = subscribe(() => {
      container.querySelectorAll('[data-heart]').forEach((el) => {
        el.textContent = isInterested(el.dataset.heart) ? '♥' : '♡';
      });
    });
    return unsub;
  },
};
