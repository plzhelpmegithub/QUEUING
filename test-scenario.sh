#!/bin/bash
# QUEUING 시나리오 테스트: 50석, 100명
BASE_URL="http://localhost:3000"

echo "=== Redis 초기화 ==="
redis-cli FLUSHALL

echo ""
echo "=== 1. 총 좌석 50석 설정 ==="
curl -s -X POST $BASE_URL/queue/set-seats \
  -H "Content-Type: application/json" \
  -d '{"totalSeats": 50}' | jq

echo ""
echo "=== 2. 좌석 50개 생성 ==="
SEAT_IDS=""
for i in $(seq 1 50); do
  if [ $i -eq 1 ]; then
    SEAT_IDS="\"A-$(printf '%03d' $i)\""
  else
    SEAT_IDS="$SEAT_IDS,\"A-$(printf '%03d' $i)\""
  fi
done
curl -s -X POST $BASE_URL/seats/init \
  -H "Content-Type: application/json" \
  -d "{\"seatIds\": [$SEAT_IDS]}" | jq

echo ""
echo "=== 3. 사용자 100명 대기열 진입 ==="
for i in $(seq 1 100); do
  curl -s -X POST $BASE_URL/queue/enter \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"user-$(printf '%03d' $i)\"}" > /dev/null
  if [ $((i % 25)) -eq 0 ]; then
    echo "  $i명 진입 완료..."
  fi
done

echo ""
echo "=== 4. 대기열 현황 (eligible: 50, standby: 50) ==="
curl -s $BASE_URL/queue/stats | jq

echo ""
echo "=== 5. user-001 순번 확인 (eligible) ==="
curl -s $BASE_URL/queue/position/user-001 | jq

echo ""
echo "=== 6. user-051 순번 확인 (standby) ==="
curl -s $BASE_URL/queue/position/user-051 | jq

echo ""
echo "=== 7. eligible 전원 입장 허용 ==="
curl -s -X POST $BASE_URL/queue/admit | jq

echo ""
echo "=== 8. 50명 좌석 선점 + 결제 ==="
for i in $(seq 1 50); do
  USER_ID="user-$(printf '%03d' $i)"
  SEAT_ID="A-$(printf '%03d' $i)"
  curl -s -X POST $BASE_URL/seats/hold \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"$USER_ID\", \"seatId\": \"$SEAT_ID\"}" > /dev/null
  curl -s -X POST $BASE_URL/seats/confirm \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"$USER_ID\", \"seatId\": \"$SEAT_ID\"}" > /dev/null
  if [ $((i % 10)) -eq 0 ]; then
    echo "  $i명 결제 완료..."
  fi
done

echo ""
echo "=== 9. 매진 확인 ==="
curl -s $BASE_URL/seats/sold-out | jq

echo ""
echo "=== 10. 남은 좌석 확인 ==="
curl -s $BASE_URL/seats/available | jq

echo ""
echo "=== 11. 취소 발생 (user-025가 A-025 취소) ==="
curl -s -X POST $BASE_URL/seats/cancel \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-025", "seatId": "A-025"}' | jq

echo ""
echo "=== 12. 매진 해제 확인 ==="
curl -s $BASE_URL/seats/sold-out | jq

echo ""
echo "=== 13. standby 1순위 확인 ==="
curl -s $BASE_URL/queue/standby/next | jq

echo ""
echo "=== 14. standby → admitted 전환 ==="
NEXT_USER=$(curl -s $BASE_URL/queue/standby/next | jq -r '.userId')
curl -s -X POST $BASE_URL/queue/standby/promote \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"$NEXT_USER\"}" | jq

echo ""
echo "=== 15. $NEXT_USER 가 취소 좌석 선점 + 결제 ==="
curl -s -X POST $BASE_URL/seats/hold \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"$NEXT_USER\", \"seatId\": \"A-025\"}" | jq

curl -s -X POST $BASE_URL/seats/confirm \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"$NEXT_USER\", \"seatId\": \"A-025\"}" | jq

echo ""
echo "=== 16. 최종 현황 ==="
curl -s $BASE_URL/queue/stats | jq
curl -s $BASE_URL/seats/available | jq

echo ""
echo "=== 17. DynamoDB 예약 기록 수 ==="
curl -s $BASE_URL/reservations | jq '.count'

echo ""
echo "=== 테스트 완료 ==="
