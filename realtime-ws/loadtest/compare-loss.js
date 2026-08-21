// compare-loss.js
// receiver.js가 저장한 received-seqs.json 파일을 읽어서
// 총 발송 개수 대비 유실률을 계산합니다.
//
// 사용법: node compare-loss.js 300
//   (300은 sender.js에서 사용한 TOTAL_MESSAGES 값과 반드시 일치시켜야 함)

const fs = require('fs');

const TOTAL_MESSAGES = parseInt(process.argv[2] || process.env.TOTAL_MESSAGES || '300', 10);

if (!fs.existsSync('received-seqs.json')) {
  console.error('received-seqs.json 파일이 없습니다. receiver.js를 Ctrl+C로 먼저 정상 종료했는지 확인하세요.');
  process.exit(1);
}

const received = JSON.parse(fs.readFileSync('received-seqs.json', 'utf-8'));
const receivedSet = new Set(received);

const missing = [];
for (let i = 1; i <= TOTAL_MESSAGES; i++) {
  if (!receivedSet.has(i)) missing.push(i);
}

const lossRate = (missing.length / TOTAL_MESSAGES) * 100;

console.log('=== 메시지 유실률 측정 결과 ===');
console.log(`보낸 메시지 총 개수: ${TOTAL_MESSAGES}`);
console.log(`받은 고유 메시지 개수: ${receivedSet.size}`);
console.log(`유실된 메시지 개수: ${missing.length}`);
console.log(`유실된 메시지 번호: ${missing.length > 0 ? missing.join(', ') : '없음'}`);
console.log(`유실률: ${lossRate.toFixed(2)}%`);
