// 공연 상세 페이지의 실시간 채팅 컴포넌트 — WebSocket으로 서버에 연결하고,
// 연결 실패/종료 시 3초 후 자동 재연결, 메시지 전송 후 5초 쿨다운(도배 방지).
// 비로그인 상태에서 전송 시도 시 로그인 페이지로 이동한다.

import { formatNumber } from '../utils/format.js';
import { isLoggedIn, getState, setReturnTo } from '../state/store.js';
import { navigate } from '../router.js';
import { connectChat } from '../services/realtimeIntegration.js';

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const COOLDOWN_MS = 5000;

export function mountLiveChat(el, { concertId, artist }) {
  const messages = [];
  let viewers = 0;
  let chatHandle = null;
  let cooldownTimer = null;
  let cooldownUntil = 0;
  let reconnectTimer = null;
  let destroyed = false;

  async function ensureRoom() {
    try {
      await fetch(`/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: concertId, name: `${artist} 채팅방` }),
      });
    } catch (_) {}
  }

  async function connect() {
    if (destroyed) return;
    await ensureRoom();
    if (destroyed) return;

    const user = getState().user;
    const userId = user?.userId || 'anonymous';
    const nickname = user?.name || '게스트';

    try {
      chatHandle = connectChat(concertId, userId, nickname, {
        onMessage: (data) => {
          if (data.type === 'chat') {
            const me = getState().user;
            messages.push({
              id: `${data.ts}-${Math.random()}`,
              author: data.author,
              text: data.message,
              mine: !!(me && data.author === me.name),
            });
            if (messages.length > 200) messages.shift();
            renderMessages();
          }
        },
        onClose: () => {
          if (!destroyed) reconnectTimer = setTimeout(connect, 3000);
        },
        onError: () => {
          if (chatHandle) chatHandle.close();
        },
      });
    } catch (_) {
      if (!destroyed) reconnectTimer = setTimeout(connect, 3000);
    }
  }

  function renderShell() {
    el.innerHTML = `
      <div class="live-panel__viewers">
        <span class="live-dot"></span>
        현재 <b data-viewers class="num-mono">${formatNumber(viewers)}</b>명이 함께 보고 있어요
      </div>
      <div class="live-chat">
        <div class="live-chat__head">
          <span>실시간 채팅</span>
          <span class="badge badge-gray">${artist} 전용방</span>
        </div>
        <div class="live-chat__list" data-list></div>
        <form class="live-chat__form" data-form>
          <input type="text" data-input maxlength="120" placeholder="${isLoggedIn() ? '메시지를 입력하세요' : '로그인 후 채팅에 참여할 수 있어요'}" />
          <button type="submit" class="btn btn-primary btn-sm" data-send>전송</button>
        </form>
        <div class="live-chat__notice" data-cooldown-notice>채팅 도배 방지를 위해 메시지 전송 후 5초 뒤에 다음 메시지를 보낼 수 있습니다.</div>
      </div>
    `;
    renderMessages();

    const input = el.querySelector('[data-input]');
    const sendBtn = el.querySelector('[data-send]');

    el.querySelector('[data-form]').addEventListener('submit', (e) => {
      e.preventDefault();
      if (sendBtn.disabled) return;
      const text = input.value.trim();
      if (!text) return;
      if (!isLoggedIn()) {
        setReturnTo(`concert/${concertId}`);
        navigate('login');
        return;
      }
      if (!chatHandle || chatHandle.readyState !== WebSocket.OPEN) return;
      chatHandle.sendMessage(text);
      input.value = '';
      startCooldown();
    });
  }

  function startCooldown() {
    const input = el.querySelector('[data-input]');
    const sendBtn = el.querySelector('[data-send]');
    const notice = el.querySelector('[data-cooldown-notice]');
    if (!input || !sendBtn) return;

    cooldownUntil = Date.now() + COOLDOWN_MS;
    input.disabled = true;
    sendBtn.disabled = true;
    if (cooldownTimer) clearInterval(cooldownTimer);

    function tick() {
      const remaining = cooldownUntil - Date.now();
      if (remaining <= 0) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
        input.disabled = false;
        sendBtn.disabled = false;
        sendBtn.textContent = '전송';
        if (notice) notice.textContent = '채팅 도배 방지를 위해 메시지 전송 후 5초 뒤에 다음 메시지를 보낼 수 있습니다.';
        return;
      }
      sendBtn.textContent = `${Math.ceil(remaining / 1000)}초`;
      if (notice) notice.textContent = `다음 메시지를 보내려면 ${Math.ceil(remaining / 1000)}초 기다려주세요.`;
    }
    tick();
    cooldownTimer = setInterval(tick, 200);
  }

  function renderMessages() {
    const list = el.querySelector('[data-list]');
    if (!list) return;
    list.innerHTML = messages.length
      ? messages
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

  function refreshViewers() {
    fetch(`/rooms/${concertId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || destroyed) return;
        viewers = data.chatConnections || 0;
        const vEl = el.querySelector('[data-viewers]');
        if (vEl) vEl.textContent = formatNumber(viewers);
      })
      .catch(() => {});
  }

  renderShell();
  connect();
  refreshViewers();

  const viewerTimer = setInterval(refreshViewers, 5000);

  return () => {
    destroyed = true;
    clearInterval(viewerTimer);
    if (cooldownTimer) clearInterval(cooldownTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (chatHandle) chatHandle.close();
  };
}
