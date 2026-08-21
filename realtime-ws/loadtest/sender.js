// sender.js
// 메시지 유실률 측정용 "보내는 쪽" 클라이언트
//
// 채팅 채널에 접속해서 seq 번호가 매겨진 메시지를 일정한 간격으로 계속 전송합니다.
// 이 스크립트가 실행되는 도중에 다른 창에서 kubectl scale로 pod를 줄이면서
// 그 순간 보내진 메시지가 receiver.js 쪽에서 유실되는지를 관찰합니다.
//
// 사용법 예:
//   TOTAL_MESSAGES=300 INTERVAL_MS=100 node sender.js
//   (0.1초 간격으로 300개 = 총 30초간 전송)

const WebSocket = require('ws');

const URL = process.env.WS_URL || 'ws://queuing.co.kr/ws/chat/LOSSTEST1';
const TOTAL_MESSAGES = parseInt(process.env.TOTAL_MESSAGES || '300', 10);
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '100', 10);

const socket = new WebSocket(URL);
let seq = 0;

socket.on('open', () => {
  console.log(`[sender] 연결됨. 총 ${TOTAL_MESSAGES}개 메시지를 ${INTERVAL_MS}ms 간격으로 전송 시작`);
  console.log(`[sender] 예상 소요 시간: 약 ${(TOTAL_MESSAGES * INTERVAL_MS / 1000).toFixed(1)}초`);

  const timer = setInterval(() => {
    seq += 1;
    socket.send(JSON.stringify({ seq, ts: Date.now() }));

    if (seq % 50 === 0) {
      console.log(`[sender] 진행: ${seq}/${TOTAL_MESSAGES}`);
    }

    if (seq >= TOTAL_MESSAGES) {
      clearInterval(timer);
      console.log(`[sender] 전송 완료: 총 ${seq}개`);
      // 마지막 메시지가 브로드캐스트될 시간을 잠깐 기다린 뒤 종료
      setTimeout(() => {
        socket.close();
        process.exit(0);
      }, 2000);
    }
  }, INTERVAL_MS);
});

socket.on('error', (err) => {
  console.error('[sender] 에러:', err.message);
});

socket.on('close', () => {
  console.log('[sender] 연결 종료');
});
