# 부하테스트 & 메시지 유실률 측정 가이드

## 사전 준비

VM(마스터 노드)의 `~/apps/realtime-ws/` 안에 이 `loadtest` 폴더를 그대로 옮겨두세요.
`receiver.js`, `sender.js`, `compare-loss.js`는 `ws` 패키지가 필요한데,
`~/apps/realtime-ws/node_modules`에 이미 설치되어 있으므로 별도 설치 없이
`~/apps/realtime-ws/loadtest/` 위치에서 바로 실행하면 됩니다.

```bash
cd ~/apps/realtime-ws
mkdir -p loadtest
# 이 폴더 안의 4개 파일(loadtest.js, receiver.js, sender.js, compare-loss.js)을
# ~/apps/realtime-ws/loadtest/ 안으로 복사
```

---

## Part 1. k6 동시접속 급증 테스트 (HPA 검증)

### 실행

```bash
cd ~/apps/realtime-ws
k6 run -e WS_HOST=queuing.co.kr -e EVENT_ID=LOADTEST1 loadtest/loadtest.js
```

### 관찰할 것 (다른 창에서 동시에)

```bash
# 1) HPA가 반응하는지
kubectl get hpa -n realtime -w

# 2) pod 개수가 실제로 늘어나는지
kubectl get pods -n realtime -w
```

**동시에 Grafana 대시보드도 열어두고** `실시간 접속자 수`와 `Pod 개수` 그래프가
같이 올라가는지 확인하세요. k6가 60명까지 VU를 늘리는 동안 `ws_active_connections_total`이
50을 넘으면(HPA 임계값) pod가 자동으로 늘어나는 걸 볼 수 있습니다.

k6 실행이 끝나면 터미널에 `checks`, `http_req_duration` 등 요약 리포트가 출력됩니다.
이 결과를 스크린샷으로 남겨두면 좋습니다.

---

## Part 2. 메시지 유실률 측정

**터미널 3개**가 필요합니다.

### 창 A: 수신 클라이언트 실행 (먼저 켜두기)

```bash
cd ~/apps/realtime-ws/loadtest
WS_URL=ws://queuing.co.kr/ws/chat/LOSSTEST1 node receiver.js
```

`[receiver] 연결됨` 로그가 뜨면 그대로 켜둔 채로 둡니다.

### 창 B: 발신 클라이언트 실행

```bash
cd ~/apps/realtime-ws/loadtest
WS_URL=ws://queuing.co.kr/ws/chat/LOSSTEST1 TOTAL_MESSAGES=300 INTERVAL_MS=100 node sender.js
```

이 명령은 0.1초 간격으로 300개(약 30초 분량)를 전송합니다.

### 창 C: sender.js가 돌아가는 도중 pod 스케일 다운

sender가 절반쯤 진행됐을 때(터미널 B에 `[sender] 진행: 150/300` 같은 로그가 보일 때),
**창 C**에서:

```bash
kubectl get pods -n realtime   # 현재 pod 개수 확인
kubectl scale deployment realtime-ws -n realtime --replicas=2
```

(만약 HPA가 켜져 있어서 replicas를 줄여도 자동으로 다시 늘어난다면,
`kubectl delete hpa realtime-ws-hpa -n realtime`로 잠깐 꺼두고 진행하세요.
테스트 끝나면 `kubectl apply -f k8s/hpa.yaml`로 다시 켜면 됩니다.)

### 결과 확인

sender.js가 `[sender] 전송 완료` 를 출력하고 종료될 때까지 기다립니다.

그 다음 **창 A(receiver.js)**로 가서 `Ctrl+C`를 눌러 정상 종료하세요.
`received-seqs.json` 파일이 생성됐다는 로그가 뜹니다.

마지막으로 유실률 계산:

```bash
node compare-loss.js 300
```

(300은 sender.js에서 쓴 `TOTAL_MESSAGES` 값과 반드시 일치시켜야 합니다)

### 출력 예시

```
=== 메시지 유실률 측정 결과 ===
보낸 메시지 총 개수: 300
받은 고유 메시지 개수: 297
유실된 메시지 개수: 3
유실된 메시지 번호: 148, 149, 150
유실률: 1.00%
```

---

## 결과 해석 가이드

- **유실률 0%**: pod 스케일 다운 시점이 메시지 전송과 안 겹쳤거나, graceful shutdown이 완벽하게 처리한 경우
- **유실이 있고, 번호가 스케일 다운 시점 근처에 몰려있다면**: 앞서 설명한 "SIGTERM과 메시지 전송이 겹치는 순간"의 유실 (server.js의 `ws.close()` 처리 타이밍 이슈)
- **재연결 횟수(reconnectCount)가 1 이상**: receiver.js가 실제로 스케일 다운으로 인해 연결이 끊겼다가 재연결했다는 뜻 (커넥션 드레이닝이 정상적으로 트리거된 증거)

이 결과를 리포트에 정리할 때는:
1. 몇 %의 유실률이 나왔는지
2. 유실이 스케일 다운 시점과 상관관계가 있는지
3. 왜 유실이 발생하는지 (원인 분석)
4. 어떻게 개선할 수 있는지 (예: ACK 메커니즘, 메시지 큐잉 등)

를 포함하면 좋은 검증 리포트가 됩니다.
