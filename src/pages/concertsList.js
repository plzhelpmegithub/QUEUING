// 콘서트 목록 페이지 — 전체 공연을 카드 그리드로 나열하고, 관심 공연 토글·예매상태 뱃지를 표시.

import { navigate } from '../router.js';
import { isInterested, toggleInterest, subscribe } from '../state/store.js';

function statusBadge(status) {
  if (status === 'sold_out') return `<span class="badge badge-dark-red">SOLD OUT</span>`;
  if (status === 'closed' || status === 'cancelled') return `<span class="badge badge-outline">마감</span>`;
  return `<span class="badge badge-red">예매중</span>`;
}

function cardHtml(e) {
  const grad = `linear-gradient(135deg,${e.color || '#667eea,#764ba2'})`;
  return `
    <div class="card fade-in" style="overflow:hidden;">
      <div style="height:180px;background:${grad};position:relative;cursor:pointer;" data-open="${e.eventId}">
        <div style="position:absolute;top:10px;left:10px;">${statusBadge(e.status)}</div>
        <button type="button" class="badge" data-heart="${e.eventId}" style="position:absolute;top:10px;right:10px;border:none;background:rgba(0,0,0,0.35);color:#fff;cursor:pointer;">
          ${isInterested(e.eventId) ? '♥' : '♡'}
        </button>
      </div>
      <div style="padding:16px;">
        <div style="font-weight:800;font-size:14.5px;margin:4px 0 10px;line-height:1.4;height:38px;overflow:hidden;">${e.eventName}</div>
        <div class="text-secondary" style="font-size:12px;">${e.eventDate || '-'}</div>
        <div class="text-secondary" style="font-size:12px;margin-top:2px;">${e.venue || '-'} · ${Number(e.totalSeats || 0).toLocaleString()}석</div>
      </div>
    </div>`;
}

export const concertsListPage = {
  render(container) {
    container.innerHTML = `
      <section class="page-section">
        <div class="container">
          <div class="eyebrow">ALL CONCERTS</div>
          <h2 class="section-title">예매 가능한 공연</h2>
          <p class="section-sub">QUEUING에서 진행 중인 모든 공연을 확인하세요</p>
          <div class="interest-grid mt-24" data-grid>
            <p style="color:#666">공연 목록 불러오는 중...</p>
          </div>
        </div>
      </section>
    `;

    const grid = container.querySelector('[data-grid]');

    function draw(events) {
      if (events.length === 0) {
        grid.innerHTML = '<p style="color:#666">등록된 공연이 없습니다.</p>';
        return;
      }
      grid.innerHTML = events.map(cardHtml).join('');

      grid.querySelectorAll('[data-open]').forEach((el) => {
        el.addEventListener('click', () => navigate(`concert/${el.dataset.open}`));
      });
      grid.querySelectorAll('[data-heart]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleInterest(el.dataset.heart);
        });
      });
    }

    fetch('/events')
      .then((res) => res.json())
      .then((data) => draw(data.events || []))
      .catch(() => {
        grid.innerHTML = '<p style="color:#e31b23">공연 목록을 불러오지 못했습니다.</p>';
      });

    const unsub = subscribe(() => {
      grid.querySelectorAll('[data-heart]').forEach((el) => {
        el.textContent = isInterested(el.dataset.heart) ? '♥' : '♡';
      });
    });
    return unsub;
  },
};
