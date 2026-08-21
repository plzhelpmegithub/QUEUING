// receiver.js
// 메시지 유실률 측정용 "받는 쪽" 클라이언트
//
// 채팅 채널에 접속해서 들어오는 메시지의 seq 번호를 계속 기록합니다.
// 연결이 끊기면(pod 스케일 다운 포함) 실제 사용자처럼 자동 재연결을 시도합니다.
// Ctrl+C로 종료하면 지금까지 받은 고유 메시지 개수를 파일로 저장하고 끝납니다.

const WebSocket = require('ws');

const URL = process.env.WS_URL || 'ws://queuing.co.kr/ws/chat/LOSSTEST1';
const received = new Set();
let reconnectCount = 0;

function connect() {
  const socket = new WebSocket(URL);

  socket.on('open', () => {
    console.log(`[receiver] 연결됨 (누적 재연결 횟수: ${reconnectCount})`);
  });

  socket.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      // 서버는 chat 메시지를 { type, eventId, message, ts } 형태로 감싸서 보냄
      // message 필드 안에 sender.js가 보낸 원본 JSON 문자열이 그대로 들어있음
      const inner = JSON.parse(parsed.message);
      if (inner && typeof inner.seq === 'number') {
        received.add(inner.seq);
      }
    } catch (e) {
      // 형식이 다른 메시지(예: hello 메시지 등)는 무시
    }
  });

  socket.on('close', (code, reason) => {
    console.log(`[receiver] 연결 끊김 (code: ${code}) → 1초 후 재연결 시도`);
    reconnectCount += 1;
    setTimeout(connect, 1000);
  });

  socket.on('error', (err) => {
    console.error('[receiver] 에러:', err.message);
  });
}

connect();

function saveAndExit() {
  console.log('\n=== 수신 결과 ===');
  console.log(`고유 수신 메시지 개수: ${received.size}`);
  console.log(`재연결 횟수: ${reconnectCount}`);

  const fs = require('fs');
  const sorted = [...received].sort((a, b) => a - b);
  fs.writeFileSync('received-seqs.json', JSON.stringify(sorted));
  console.log('received-seqs.json 파일에 저장했습니다.');
  process.exit(0);
}

process.on('SIGINT', saveAndExit);
process.on('SIGTERM', saveAndExit);
