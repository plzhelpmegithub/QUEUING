import { formatNumber } from '../utils/format.js';
import { getChatRoom, sendChatMessage, isLoggedIn, getState, setReturnTo } from '../state/store.js';
import { navigate } from '../router.js';

const FAN_NAMES = [
  '별빛소녀', '레드오션', '달빛팬심', '콩순이', '초코라떼',
  '응원봉장인', '매진각', '앞자리사수', '티켓팅요정', '불타는금요일',
  '오늘도무사히', '심장쿵쾅', '직관가자', '캐리어끌고',
];
const FAN_LINES = [
  '드디어 예매 뜬다!!', '너무 떨려요 ㅠㅠ', '다들 티켓팅 화이팅!!', '이번 공연 진짜 기대돼요',
  '좌석 잘 잡히길 바라요', '저번 공연도 진짜 좋았어요', '카운트다운 보는 중...', '긴장된다 진짜',
  '서버 시간 보면서 기다리는 중', '다들 성공하세요!!', '와이파이 미리 체크하자', '새로고침 하지 마세요 다들!!',
  '심장 터질 것 같아요', '제발 잡히자 내 자리', '오늘 컨디션 최상 가보자', '한 곡만 들어도 눈물날듯',
];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function mountLiveChat(el, { concertId, artist }) {
  const room = getChatRoom(concertId);

  function renderShell() {
    el.innerHTML = `
      <div class="live-panel__viewers">
        <span class="live-dot"></span>
        현재 <b data-viewers class="num-mono">${formatNumber(room.viewers)}</b>명이 함께 보고 있어요
      </div>
      <div class="live-chat">
        <div class="live-chat__head">
          <span>실시간 채팅</span>
          <span class="badge badge-gray">${artist} 전용방</span>
        </div>
        <div class="live-chat__list" data-list></div>
        <form class="live-chat__form" data-form>
          <input type="text" data-input maxlength="120" placeholder="${isLoggedIn() ? '메시지를 입력하세요' : '로그인 후 채팅에 참여할 수 있어요'}" />
          <button type="submit" class="btn btn-primary btn-sm">전송</button>
        </form>
      </div>
    `;
    renderMessages();

    el.querySelector('[data-form]').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = el.querySelector('[data-input]');
      const text = input.value.trim();
      if (!text) return;
      if (!isLoggedIn()) {
        setReturnTo(`concert/${concertId}`);
        navigate('login');
        return;
      }
      sendChatMessage(concertId, {
        id: `${Date.now()}-${Math.random()}`,
        author: getState().user.name,
        text,
        mine: true,
      });
      input.value = '';
      renderMessages();
    });
  }

  function renderMessages() {
    const list = el.querySelector('[data-list]');
    if (!list) return;
    list.innerHTML = room.messages.length
      ? room.messages
          .map(
            (m) => `
        <div class="chat-msg ${m.mine ? 'chat-msg--mine' : ''}">
          <div class="chat-msg__author">${escapeHtml(m.author)}</div>
          <div class="chat-msg__bubble">${escapeHtml(m.text)}</div>
        </div>`
          )
          .join('')
      : `<div class="chat-msg__empty">아직 채팅이 없어요. 가장 먼저 인사해보세요!</div>`;
    list.scrollTop = list.scrollHeight;
  }

  renderShell();

  const viewerTimer = setInterval(() => {
    room.viewers = Math.max(15, room.viewers + Math.floor((Math.random() - 0.45) * 14));
    const vEl = el.querySelector('[data-viewers]');
    if (vEl) vEl.textContent = formatNumber(room.viewers);
  }, 3000);

  const botTimer = setInterval(() => {
    if (Math.random() < 0.65) {
      room.messages.push({
        id: `${Date.now()}-${Math.random()}`,
        author: randomFrom(FAN_NAMES),
        text: randomFrom(FAN_LINES),
        mine: false,
      });
      if (room.messages.length > 200) room.messages.shift();
      renderMessages();
    }
  }, 4500 + Math.random() * 3000);

  return () => {
    clearInterval(viewerTimer);
    clearInterval(botTimer);
  };
}
