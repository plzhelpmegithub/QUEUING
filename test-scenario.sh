#!/bin/bash
# QUEUING 시나리오 테스트: 1000석, 10000명
BASE_URL="http://localhost:3000"

echo "=== Redis 초기화 ==="
redis-cli FLUSHALL

echo ""
echo "=== 1. 총 좌석 1000석 설정 ==="
curl -s -X POST $BASE_URL/queue/set-seats \
  -H "Content-Type: application/json" \
  -d '{"totalSeats": 1000}' | jq

echo ""
echo "=== 2. 좌석 1000개 생성 ==="
# 좌석 ID 배열 생성 (A-001 ~ A-1000)
SEAT_IDS=""
for i in $(seq 1 1000); do
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
echo "=== 3. 사용자 10000명 대기열 진입 ==="
for i in $(seq 1 10000); do
  curl -s -X POST $BASE_URL/queue/enter \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"user-$(printf '%05d' $i)\"}" > /dev/null
  # 진행 상황 표시
  if [ $((i % 1000)) -eq 0 ]; then
    echo "  $i명 진입 완료..."
  fi
done

echo ""
echo "=== 4. 대기열 현황 ==="
curl -s $BASE_URL/queue/stats | jq

echo ""
echo "=== 5. user-001 순번 확인 (eligible) ==="
curl -s $BASE_URL/queue/position/user-00001 | jq

echo ""
echo "=== 6. user-1001 순번 확인 (standby) ==="
curl -s $BASE_URL/queue/position/user-01001 | jq

echo ""
echo "=== 7. eligible 전원 입장 허용 (100명씩 10회) ==="
for batch in $(seq 1 10); do
  curl -s -X POST $BASE_URL/queue/admit > /dev/null
  echo "  배치 $batch 완료 (${batch}00명 입장)"
done

echo ""
echo "=== 8. 입장 후 현황 ==="
curl -s $BASE_URL/queue/stats | jq

echo ""
echo "=== 9. 1000명 좌석 선점 + 결제 ==="
for i in $(seq 1 1000); do
  USER_ID="user-$(printf '%05d' $i)"
  SEAT_ID="A-$(printf '%03d' $i)"
  curl -s -X POST $BASE_URL/seats/hold \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"$USER_ID\", \"seatId\": \"$SEAT_ID\"}" > /dev/null
  curl -s -X POST $BASE_URL/seats/confirm \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"$USER_ID\", \"seatId\": \"$SEAT_ID\"}" > /dev/null
  if [ $((i % 200)) -eq 0 ]; then
    echo "  $i명 결제 완료..."
  fi
done

echo ""
echo "=== 10. 매진 확인 ==="
curl -s $BASE_URL/seats/sold-out | jq

echo ""
echo "=== 11. 남은 좌석 확인 ==="
curl -s $BASE_URL/seats/available | jq

echo ""
echo "=== 12. 취소 발생 (user-00500이 A-500 취소) ==="
curl -s -X POST $BASE_URL/seats/cancel \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-00500", "seatId": "A-500"}' | jq

echo ""
echo "=== 13. 매진 해제 확인 ==="
curl -s $BASE_URL/seats/sold-out | jq

echo ""
echo "=== 14. standby 1순위 확인 ==="
curl -s $BASE_URL/queue/standby/next | jq

echo ""
echo "=== 15. standby → admitted 전환 ==="
NEXT_USER=$(curl -s $BASE_URL/queue/standby/next | jq -r '.userId')
curl -s -X POST $BASE_URL/queue/standby/promote \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"$NEXT_USER\"}" | jq

echo ""
echo "=== 16. $NEXT_USER 가 취소 좌석 선점 + 결제 ==="
curl -s -X POST $BASE_URL/seats/hold \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"$NEXT_USER\", \"seatId\": \"A-500\"}" | jq

curl -s -X POST $BASE_URL/seats/confirm \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"$NEXT_USER\", \"seatId\": \"A-500\"}" | jq

echo ""
echo "=== 17. 최종 현황 ==="
curl -s $BASE_URL/queue/stats | jq
curl -s $BASE_URL/seats/available | jq

echo ""
echo "=== 18. DynamoDB 예약 기록 수 ==="
curl -s $BASE_URL/reservations | jq '.count'

echo ""
echo "=== 테스트 완료 ==="
