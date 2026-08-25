# 실시간 커넥션 플랫폼 (C 파트)

채팅과 좌석 상태 브로드캐스트를 하나의 WebSocket 서버가 처리합니다.
채널은 URL 경로로 구분됩니다.

- 채팅: `ws://<호스트>/ws/chat/{eventId}`
- 좌석 상태: `ws://<호스트>/ws/seats/{eventId}`

## 동작 방식

1. 클라이언트가 위 경로로 WebSocket 접속
2. 채팅 메시지는 클라이언트 → 서버 → Redis publish → 같은 채널 구독 중인 모든 pod → 브로드캐스트
3. 좌석 상태는 A 파트(또는 테스트용 `/publish/seat/:eventId` API)가 Redis에 publish
   → 이 서버가 구독하고 있다가 해당 eventId를 보고 있는 모든 클라이언트에게 브로드캐스트

## 로컬 테스트

```bash
npm install
REDIS_HOST=localhost npm start
```

## Redis 없이 좌석 이벤트 발행 테스트

```bash
curl -X POST http://localhost:8080/publish/seat/EVENT123 \
  -H "Content-Type: application/json" \
  -d '{"seatId": "A-12", "status": "sold"}'
```

## 이미지 빌드 & 배포

```bash
# 1. 이미지 빌드
docker build -t chlwldp/realtime-ws:latest .

# 2. 레지스트리에 push (Harbor, Docker Hub 등)
docker push chlwldp/realtime-ws:latest

# 3. k8s/deployment.yaml에서 image 경로를 본인 레지스트리로 수정 후 적용
kubectl apply -f k8s/deployment.yaml
```

## 확인

```bash
kubectl get pods -n realtime
kubectl logs -n realtime -l app=realtime-ws
```

## 다음에 추가하면 좋은 것 (하드 포인트)

- **커넥션 드레이닝 검증**: `kubectl delete pod <pod이름> -n realtime` 하는 동안
  클라이언트가 붙어있는 상태에서 메시지 유실이 있는지 측정
- **동시 연결 수 메트릭 노출**: `channelClients` 크기를 Prometheus 메트릭으로 노출해서
  HPA가 이 값을 기준으로 스케일링하도록 연결 (Prometheus Adapter 필요)
- **k6 부하테스트**: xk6-websocket 확장으로 동시접속 시나리오 작성
