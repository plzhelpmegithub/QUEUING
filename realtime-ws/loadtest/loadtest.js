// loadtest.js
// k6 동시접속 급증 시나리오
// - VU(가상 사용자)를 단계적으로 늘려가며 WebSocket 연결을 생성
// - HPA가 ws_active_connections_total 값을 보고 실제로 pod를 늘리는지 검증
// - 실행 중 Grafana 대시보드(실시간 접속자 수 / Pod 개수)를 같이 보면서
//   두 그래프가 같이 올라가는지 확인하는 용도

import ws from 'k6/ws';
import { check, sleep } from 'k6';

// 실행 시 -e 옵션으로 덮어쓸 수 있게 환경변수로 뺌
const HOST = __ENV.WS_HOST || 'queuing.co.kr';
const EVENT_ID = __ENV.EVENT_ID || 'LOADTEST1';

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // 30초에 걸쳐 20명까지 서서히 증가
    { duration: '30s', target: 60 },   // 60명까지 증가
    { duration: '1m', target: 60 },    // 60명 유지 (HPA가 반응할 시간을 줌)
    { duration: '30s', target: 0 },    // 다시 0명으로 감소
  ],
};

export default function () {
  const url = `ws://${HOST}/ws/chat/${EVENT_ID}`;

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      // 접속 직후 메시지 하나 전송 (연결이 살아있음을 확인하는 용도)
      socket.send(JSON.stringify({ vu: __VU, hello: true, ts: Date.now() }));
    });

    socket.on('message', () => {
      // 받는 메시지는 이 테스트에서는 검사하지 않음 (연결 유지가 목적)
    });

    socket.on('error', (e) => {
      console.error(`[VU ${__VU}] 에러: ${e.error()}`);
    });

    // 연결을 20~40초 사이 랜덤하게 유지하다가 스스로 종료
    // (실제 사용자가 페이지를 왔다갔다 하는 것처럼 흉내)
    const stayMs = 20000 + Math.random() * 20000;
    socket.setTimeout(() => {
      socket.close();
    }, stayMs);
  });

  check(res, { 'WebSocket 연결 성공 (status 101)': (r) => r && r.status === 101 });

  sleep(1);
}
