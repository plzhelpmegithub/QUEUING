#!/bin/bash
# =============================================
# QUEUING A파트 (Queue API) — 전체 흐름 테스트 콘솔
# =============================================
#
# 사전 준비:
#   터미널 1: cd ~/queue-api && node src/app.js
#   터미널 2: redis-cli SUBSCRIBE events:seat-status  ← 이벤트 구독 확인용
#   터미널 3: 이 스크립트 실행
#
# 터미널 2는 좌석 상태 이벤트(held/sold/released/cancelled/sold_out)가
# 실시간으로 출력됩니다. C파트가 받게 될 이벤트를 눈으로 확인하는 용도입니다.
# =============================================

BASE_URL="http://localhost:3000"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

line() { echo ""; echo "─────────────────────────────────────────"; }

main_menu() {
  clear
  echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║        QUEUING Queue API 테스트 콘솔         ║${NC}"
  echo -e "${CYAN}╠══════════════════════════════════════════════╣${NC}"
  echo -e "${CYAN}║                                              ║${NC}"
  echo -e "${CYAN}║  ${YELLOW}[관리자 — 공연 관리]${CYAN}                        ║${NC}"
  echo -e "${CYAN}║   1. 공연 생성 (구역/가격 설정)              ║${NC}"
  echo -e "${CYAN}║   2. 공연 정보 조회                          ║${NC}"
  echo -e "${CYAN}║   3. 공연 정보 수정 (날짜/장소/가격)         ║${NC}"
  echo -e "${CYAN}║   4. 공연 취소 (사유 + 이메일/문자 발송)     ║${NC}"
  echo -e "${CYAN}║                                              ║${NC}"
  echo -e "${CYAN}║  ${YELLOW}[관리자 — 티켓팅 제어]${CYAN}                      ║${NC}"
  echo -e "${CYAN}║   5. 티켓팅 수동 오픈                        ║${NC}"
  echo -e "${CYAN}║   6. 티켓팅 수동 마감                        ║${NC}"
  echo -e "${CYAN}║   7. 티켓팅 상태 확인                        ║${NC}"
  echo -e "${CYAN}║   8. 티켓팅 예약 오픈 (자동 타이머)          ║${NC}"
  echo -e "${CYAN}║   9. 티켓팅 예약 스케줄 확인                 ║${NC}"
  echo -e "${CYAN}║  10. 티켓팅 예약 스케줄 취소                 ║${NC}"
  echo -e "${CYAN}║  11. 결제 제한 시간 설정                     ║${NC}"
  echo -e "${CYAN}║  12. 결제 제한 시간 조회                     ║${NC}"
  echo -e "${CYAN}║                                              ║${NC}"
  echo -e "${CYAN}║  ${GREEN}[예매자]${CYAN}                                    ║${NC}"
  echo -e "${CYAN}║  13. 대기열 진입 (줄 서기)                   ║${NC}"
  echo -e "${CYAN}║  14. 내 순번 확인                            ║${NC}"
  echo -e "${CYAN}║  15. 입장 허용 (배치)                        ║${NC}"
  echo -e "${CYAN}║  16. 좌석 선점 (결제 시작)                   ║${NC}"
  echo -e "${CYAN}║  17. 결제 확정                               ║${NC}"
  echo -e "${CYAN}║  18. 결제 남은 시간 확인                     ║${NC}"
  echo -e "${CYAN}║  19. 좌석 취소 (재판매 트리거)               ║${NC}"
  echo -e "${CYAN}║                                              ║${NC}"
  echo -e "${CYAN}║  ${BLUE}[모니터링]${CYAN}                                  ║${NC}"
  echo -e "${CYAN}║  20. 대기열 현황 (eligible/standby)          ║${NC}"
  echo -e "${CYAN}║  21. 좌석 현황 (available/held/sold)         ║${NC}"
  echo -e "${CYAN}║  22. 매진 여부 확인                          ║${NC}"
  echo -e "${CYAN}║  23. 전체 좌석 상태 목록                     ║${NC}"
  echo -e "${CYAN}║  24. DynamoDB 예약 기록 조회                 ║${NC}"
  echo -e "${CYAN}║  25. Prometheus 메트릭 확인                  ║${NC}"
  echo -e "${CYAN}║                                              ║${NC}"
  echo -e "${CYAN}║  ${RED}[취소표 대기 — B파트 연동]${CYAN}                  ║${NC}"
  echo -e "${CYAN}║  26. standby 1순위 확인                      ║${NC}"
  echo -e "${CYAN}║  27. standby → 입장 전환                     ║${NC}"
  echo -e "${CYAN}║                                              ║${NC}"
  echo -e "${CYAN}║  ${MAGENTA}[시스템]${CYAN}                                    ║${NC}"
  echo -e "${CYAN}║  28. Redis 전체 초기화                       ║${NC}"
  echo -e "${CYAN}║  29. 자동 시나리오 (전체 흐름 한번에)        ║${NC}"
  echo -e "${CYAN}║   0. 종료                                   ║${NC}"
  echo -e "${CYAN}║                                              ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${YELLOW}※ 이벤트 확인: 별도 터미널에서 redis-cli SUBSCRIBE events:seat-status${NC}"
  echo ""
  echo -n "선택: "
}

# =============================================
# 1. 공연 생성
# =============================================
create_event() {
  line
  echo -e "${YELLOW}[관리자] 공연 생성${NC}"
  echo ""
  echo "  1) 구역별 생성 (VIP/R/S)"
  echo "  2) 단일 구역 간편 생성"
  echo -n "  선택: "
  read sub_choice

  if [ "$sub_choice" == "1" ]; then
    echo -n "  공연명: "; read event_name
    echo -n "  날짜 (예: 2026-12-25): "; read event_date
    echo -n "  장소: "; read venue

    sections="["
    while true; do
      echo -n "  구역명 (예: VIP, 완료하려면 enter): "; read sec_name
      [ -z "$sec_name" ] && break
      echo -n "  ${sec_name}석 좌석 수: "; read sec_seats
      echo -n "  ${sec_name}석 가격: "; read sec_price
      [ "$sections" != "[" ] && sections="$sections,"
      sections="$sections{\"name\":\"$sec_name\",\"seats\":$sec_seats,\"price\":$sec_price}"
    done
    sections="$sections]"

    curl -s -X POST $BASE_URL/event/create \
      -H "Content-Type: application/json" \
      -d "{\"eventName\":\"$event_name\",\"eventDate\":\"$event_date\",\"venue\":\"$venue\",\"sections\":$sections}" | jq

  elif [ "$sub_choice" == "2" ]; then
    echo -n "  공연명: "; read event_name
    echo -n "  총 좌석 수: "; read total_seats
    echo -n "  가격: "; read price

    curl -s -X POST $BASE_URL/event/create \
      -H "Content-Type: application/json" \
      -d "{\"eventName\":\"$event_name\",\"totalSeats\":$total_seats,\"price\":${price:-0}}" | jq
  fi
}

# =============================================
# 2. 공연 정보 조회
# =============================================
get_event_info() {
  line
  echo -e "${YELLOW}[관리자] 공연 정보 조회${NC}"
  curl -s $BASE_URL/event/info | jq
}

# =============================================
# 3. 공연 정보 수정
# =============================================
update_event() {
  line
  echo -e "${YELLOW}[관리자] 공연 정보 수정${NC}"
  echo ""
  echo "  수정할 항목 (빈칸이면 변경 안 함):"
  echo -n "  새 공연명: "; read new_name
  echo -n "  새 날짜: "; read new_date
  echo -n "  새 장소: "; read new_venue
  echo -n "  변경 사유: "; read reason

  body="{"
  [ -n "$new_name" ] && body="$body\"eventName\":\"$new_name\","
  [ -n "$new_date" ] && body="$body\"eventDate\":\"$new_date\","
  [ -n "$new_venue" ] && body="$body\"venue\":\"$new_venue\","
  [ -n "$reason" ] && body="$body\"reason\":\"$reason\","

  echo -n "  구역 가격 수정? (y/n): "; read price_yn
  if [ "$price_yn" == "y" ]; then
    echo -n "  구역명 (예: VIP): "; read pu_section
    echo -n "  새 가격: "; read pu_price
    body="$body\"priceUpdates\":[{\"section\":\"$pu_section\",\"price\":$pu_price}],"
  fi

  body="$body\"notify\":false}"

  curl -s -X PATCH $BASE_URL/event/update \
    -H "Content-Type: application/json" \
    -d "$body" | jq
}

# =============================================
# 4. 공연 취소
# =============================================
cancel_event() {
  line
  echo -e "${RED}[관리자] 공연 취소${NC}"
  echo ""
  echo -n "  취소 사유: "; read reason
  echo -e "  ${RED}정말 취소하시겠습니까? (y/n): ${NC}"
  read confirm
  [ "$confirm" != "y" ] && echo "  취소 중단." && return

  curl -s -X POST $BASE_URL/event/cancel \
    -H "Content-Type: application/json" \
    -d "{\"reason\":\"$reason\",\"users\":[]}" | jq
}

# =============================================
# 5. 티켓팅 수동 오픈
# =============================================
ticketing_open() {
  line
  echo -e "${YELLOW}[관리자] 티켓팅 수동 오픈${NC}"
  curl -s -X POST $BASE_URL/admin/ticketing/open | jq
  echo ""
  echo -e "  ${GREEN}→ 이제 사용자가 대기열에 진입할 수 있습니다 (메뉴 13번)${NC}"
}

# =============================================
# 6. 티켓팅 수동 마감
# =============================================
ticketing_close() {
  line
  echo -e "${YELLOW}[관리자] 티켓팅 수동 마감${NC}"
  echo -e "  ${YELLOW}※ 마감해도 이미 standby인 사용자는 취소표 대기가 유지됩니다${NC}"
  curl -s -X POST $BASE_URL/admin/ticketing/close | jq
}

# =============================================
# 7. 티켓팅 상태 확인
# =============================================
ticketing_status() {
  line
  echo -e "${YELLOW}[관리자] 티켓팅 상태 확인${NC}"
  curl -s $BASE_URL/admin/ticketing/status | jq
}

# =============================================
# 8. 티켓팅 예약 오픈 (자동 타이머)
# =============================================
ticketing_schedule() {
  line
  echo -e "${YELLOW}[관리자] 티켓팅 예약 오픈 설정${NC}"
  echo ""
  echo -e "  현재 서버 시간: $(date '+%Y-%m-%dT%H:%M:%S')"
  echo -n "  오픈 시간 (예: 2026-12-25T20:00:00): "; read open_at
  echo -n "  오픈 유지 시간 (분, 없으면 수동 마감): "; read duration

  body="{\"openAt\":\"$open_at\""
  [ -n "$duration" ] && body="$body,\"durationMinutes\":$duration"
  body="$body}"

  curl -s -X POST $BASE_URL/admin/ticketing/schedule \
    -H "Content-Type: application/json" \
    -d "$body" | jq
  echo ""
  echo -e "  ${YELLOW}→ 설정한 시간이 되면 서버 로그에 자동 오픈 메시지가 출력됩니다${NC}"
}

# =============================================
# 9. 티켓팅 예약 스케줄 확인
# =============================================
ticketing_schedule_info() {
  line
  echo -e "${YELLOW}[관리자] 예약 스케줄 확인${NC}"
  curl -s $BASE_URL/admin/ticketing/schedule | jq
}

# =============================================
# 10. 티켓팅 예약 스케줄 취소
# =============================================
ticketing_cancel_schedule() {
  line
  echo -e "${YELLOW}[관리자] 예약 스케줄 취소${NC}"
  curl -s -X POST $BASE_URL/admin/ticketing/cancel-schedule | jq
}

# =============================================
# 11. 결제 제한 시간 설정
# =============================================
set_hold_duration() {
  line
  echo -e "${YELLOW}[관리자] 결제 제한 시간 설정${NC}"
  echo ""
  echo -n "  결제 제한 시간 (초, 예: 600 = 10분): "; read seconds
  curl -s -X POST $BASE_URL/admin/hold-duration \
    -H "Content-Type: application/json" \
    -d "{\"seconds\":$seconds}" | jq
}

# =============================================
# 12. 결제 제한 시간 조회
# =============================================
get_hold_duration() {
  line
  echo -e "${YELLOW}[관리자] 결제 제한 시간 조회${NC}"
  curl -s $BASE_URL/admin/hold-duration | jq
}

# =============================================
# 13. 대기열 진입
# =============================================
enter_queue() {
  line
  echo -e "${GREEN}[예매자] 대기열 진입${NC}"
  echo ""
  echo "  1) 사용자 1명 진입"
  echo "  2) 여러 명 한번에 진입"
  echo -n "  선택: "
  read sub_choice

  if [ "$sub_choice" == "1" ]; then
    echo -n "  사용자 ID (예: user-001): "; read user_id
    curl -s -X POST $BASE_URL/queue/enter \
      -H "Content-Type: application/json" \
      -d "{\"userId\":\"$user_id\"}" | jq

  elif [ "$sub_choice" == "2" ]; then
    echo -n "  시작 번호 (예: 1): "; read start_num
    echo -n "  끝 번호 (예: 10): "; read end_num
    for i in $(seq $start_num $end_num); do
      result=$(curl -s -X POST $BASE_URL/queue/enter \
        -H "Content-Type: application/json" \
        -d "{\"userId\":\"user-$(printf '%03d' $i)\"}")
      type=$(echo $result | jq -r '.type // .status')
      echo "  user-$(printf '%03d' $i) → $type"
    done
  fi
}

# =============================================
# 14. 내 순번 확인
# =============================================
check_position() {
  line
  echo -e "${GREEN}[예매자] 내 순번 확인${NC}"
  echo -n "  사용자 ID: "; read user_id
  curl -s $BASE_URL/queue/position/$user_id | jq
}

# =============================================
# 15. 입장 허용
# =============================================
admit_batch() {
  line
  echo -e "${GREEN}[시스템] 입장 허용 (배치 — eligible에서 100명씩)${NC}"
  curl -s -X POST $BASE_URL/queue/admit | jq
}

# =============================================
# 16. 좌석 선점
# =============================================
hold_seat() {
  line
  echo -e "${GREEN}[예매자] 좌석 선점${NC}"
  echo -n "  사용자 ID: "; read user_id
  echo -n "  좌석 ID (예: A-1, VIP-01): "; read seat_id
  echo ""
  duration=$(curl -s $BASE_URL/admin/hold-duration | jq -r '.display')
  echo -e "  ${YELLOW}⏱  선점 후 ${duration} 내에 결제해야 합니다!${NC}"
  curl -s -X POST $BASE_URL/seats/hold \
    -H "Content-Type: application/json" \
    -d "{\"userId\":\"$user_id\",\"seatId\":\"$seat_id\"}" | jq
  echo ""
  echo -e "  ${YELLOW}→ 터미널2에 seat.held 이벤트가 출력되었는지 확인하세요${NC}"
}

# =============================================
# 17. 결제 확정
# =============================================
confirm_seat() {
  line
  echo -e "${GREEN}[예매자] 결제 확정${NC}"
  echo -n "  사용자 ID: "; read user_id
  echo -n "  좌석 ID: "; read seat_id
  curl -s -X POST $BASE_URL/seats/confirm \
    -H "Content-Type: application/json" \
    -d "{\"userId\":\"$user_id\",\"seatId\":\"$seat_id\"}" | jq
  echo ""
  echo -e "  ${YELLOW}→ 터미널2에 seat.sold 이벤트 확인${NC}"
  echo -e "  ${YELLOW}→ 마지막 좌석이면 seat.sold_out + 자동 마감${NC}"
}

# =============================================
# 18. 결제 남은 시간
# =============================================
check_timer() {
  line
  echo -e "${GREEN}[예매자] 결제 남은 시간 확인${NC}"
  echo -n "  좌석 ID: "; read seat_id
  curl -s $BASE_URL/seats/timer/$seat_id | jq
}

# =============================================
# 19. 좌석 취소
# =============================================
cancel_seat() {
  line
  echo -e "${GREEN}[예매자] 좌석 취소 (재판매 트리거)${NC}"
  echo -n "  사용자 ID: "; read user_id
  echo -n "  좌석 ID: "; read seat_id
  curl -s -X POST $BASE_URL/seats/cancel \
    -H "Content-Type: application/json" \
    -d "{\"userId\":\"$user_id\",\"seatId\":\"$seat_id\"}" | jq
  echo ""
  echo -e "  ${YELLOW}→ 터미널2에 seat.cancelled 이벤트 확인${NC}"
  echo -e "  ${YELLOW}→ B파트가 이 이벤트를 받아서 standby 대기자에게 이메일/문자 발송${NC}"
}

# =============================================
# 20. 대기열 현황
# =============================================
queue_stats() {
  line
  echo -e "${BLUE}[모니터링] 대기열 현황${NC}"
  curl -s $BASE_URL/queue/stats | jq
}

# =============================================
# 21. 좌석 현황
# =============================================
seat_available() {
  line
  echo -e "${BLUE}[모니터링] 좌석 현황${NC}"
  curl -s $BASE_URL/seats/available | jq
}

# =============================================
# 22. 매진 여부
# =============================================
sold_out() {
  line
  echo -e "${BLUE}[모니터링] 매진 여부${NC}"
  curl -s $BASE_URL/seats/sold-out | jq
}

# =============================================
# 23. 전체 좌석 목록
# =============================================
all_seats() {
  line
  echo -e "${BLUE}[모니터링] 전체 좌석 상태${NC}"
  curl -s $BASE_URL/seats | jq
}

# =============================================
# 24. DynamoDB 예약 기록
# =============================================
reservations() {
  line
  echo -e "${BLUE}[모니터링] DynamoDB 예약 기록${NC}"
  echo ""
  echo "  1) 전체 예약 기록"
  echo "  2) 특정 좌석 이력"
  echo -n "  선택: "
  read sub_choice

  if [ "$sub_choice" == "1" ]; then
    curl -s $BASE_URL/reservations | jq
  elif [ "$sub_choice" == "2" ]; then
    echo -n "  좌석 ID: "; read seat_id
    curl -s $BASE_URL/reservations/$seat_id | jq
  fi
}

# =============================================
# 25. Prometheus 메트릭
# =============================================
metrics() {
  line
  echo -e "${BLUE}[모니터링] Prometheus 메트릭${NC}"
  echo ""
  echo "  1) Queue API 커스텀 메트릭만"
  echo "  2) 전체 메트릭"
  echo -n "  선택: "
  read sub_choice

  if [ "$sub_choice" == "1" ]; then
    echo ""
    echo -e "  ${CYAN}--- 대기열 ---${NC}"
    curl -s $BASE_URL/metrics | grep -E "^queuing_queue_"
    echo -e "  ${CYAN}--- 좌석 ---${NC}"
    curl -s $BASE_URL/metrics | grep -E "^queuing_seats_"
    echo -e "  ${CYAN}--- 락/이벤트/타이머 ---${NC}"
    curl -s $BASE_URL/metrics | grep -E "^queuing_(lock|seat_events|timer)"
  elif [ "$sub_choice" == "2" ]; then
    curl -s $BASE_URL/metrics
  fi
}

# =============================================
# 26. standby 1순위
# =============================================
standby_next() {
  line
  echo -e "${RED}[B파트 연동] standby 1순위 확인${NC}"
  curl -s $BASE_URL/queue/standby/next | jq
}

# =============================================
# 27. standby → 입장 전환
# =============================================
standby_promote() {
  line
  echo -e "${RED}[B파트 연동] standby → 입장 전환${NC}"
  NEXT=$(curl -s $BASE_URL/queue/standby/next | jq -r '.userId')
  if [ "$NEXT" == "null" ]; then
    echo "  취소표 대기자가 없습니다."
    return
  fi
  echo "  다음 대기자: $NEXT"
  echo -n "  이 사용자를 입장 전환하시겠습니까? (y/n): "; read confirm
  [ "$confirm" != "y" ] && return

  curl -s -X POST $BASE_URL/queue/standby/promote \
    -H "Content-Type: application/json" \
    -d "{\"userId\":\"$NEXT\"}" | jq
  echo ""
  echo -e "  ${YELLOW}→ $NEXT 가 이제 좌석 선점 가능합니다 (메뉴 16번)${NC}"
}

# =============================================
# 28. Redis 초기화
# =============================================
flush_redis() {
  line
  echo -e "${RED}[시스템] Redis 전체 초기화${NC}"
  echo -n "  정말 초기화하시겠습니까? 모든 데이터가 삭제됩니다. (y/n): "; read confirm
  [ "$confirm" != "y" ] && echo "  취소." && return
  redis-cli FLUSHALL
  echo -e "  ${GREEN}초기화 완료${NC}"
}

# =============================================
# 29. 자동 시나리오
# =============================================
auto_scenario() {
  line
  echo -e "${MAGENTA}[자동 시나리오] 좌석 3석, 사용자 5명 — 전체 흐름${NC}"
  echo ""
  echo "  이 시나리오가 자동으로 실행합니다:"
  echo ""
  echo "  [관리자]"
  echo "    1) Redis 초기화"
  echo "    2) 공연 생성 (3석, 99000원)"
  echo "    3) 결제 제한 시간 15초 설정"
  echo "    4) 티켓팅 오픈"
  echo ""
  echo "  [예매자]"
  echo "    5) 사용자 5명 진입 (3명 eligible + 2명 standby)"
  echo "    6) eligible 3명 입장 → 선점 → 결제"
  echo "    7) 전석 매진 확인 + 자동 마감 확인"
  echo ""
  echo "  [취소 → 재판매]"
  echo "    8) user-002가 A-2 취소"
  echo "    9) standby user-004에게 자동 배정 확인"
  echo "   10) user-004 결제"
  echo "   11) 최종 현황"
  echo ""
  echo -e "  ${YELLOW}※ 터미널2 (redis-cli SUBSCRIBE)에서 이벤트 흐름을 같이 보세요${NC}"
  echo ""
  echo -n "  시작하시겠습니까? (y/n): "; read confirm
  [ "$confirm" != "y" ] && return

  echo ""
  echo -e "${CYAN}--- 1) Redis 초기화 ---${NC}"
  redis-cli FLUSHALL
  sleep 0.5

  echo -e "${CYAN}--- 2) 공연 생성 (3석, 99000원) ---${NC}"
  curl -s -X POST $BASE_URL/event/create \
    -H "Content-Type: application/json" \
    -d '{"eventName":"테스트 콘서트","totalSeats":3,"price":99000}' | jq
  sleep 0.5

  echo -e "${CYAN}--- 3) 결제 제한 시간 15초 설정 ---${NC}"
  curl -s -X POST $BASE_URL/admin/hold-duration \
    -H "Content-Type: application/json" \
    -d '{"seconds":15}' | jq
  sleep 0.5

  echo -e "${CYAN}--- 4) 티켓팅 오픈 ---${NC}"
  curl -s -X POST $BASE_URL/admin/ticketing/open | jq
  sleep 0.5

  echo -e "${CYAN}--- 5) 사용자 5명 진입 ---${NC}"
  for i in $(seq 1 5); do
    result=$(curl -s -X POST $BASE_URL/queue/enter \
      -H "Content-Type: application/json" \
      -d "{\"userId\":\"user-$(printf '%03d' $i)\"}")
    type=$(echo $result | jq -r '.type')
    echo "  user-$(printf '%03d' $i) → $type"
  done
  sleep 0.5

  echo -e "${CYAN}--- 6) 현황 확인 ---${NC}"
  curl -s $BASE_URL/queue/stats | jq
  sleep 0.5

  echo -e "${CYAN}--- 7) eligible 입장 허용 ---${NC}"
  curl -s -X POST $BASE_URL/queue/admit | jq
  sleep 0.5

  echo -e "${CYAN}--- 8) 3명 선점 + 결제 ---${NC}"
  for i in 1 2 3; do
    curl -s -X POST $BASE_URL/seats/hold \
      -H "Content-Type: application/json" \
      -d "{\"userId\":\"user-$(printf '%03d' $i)\",\"seatId\":\"A-$i\"}" > /dev/null
    curl -s -X POST $BASE_URL/seats/confirm \
      -H "Content-Type: application/json" \
      -d "{\"userId\":\"user-$(printf '%03d' $i)\",\"seatId\":\"A-$i\"}" > /dev/null
    echo "  user-$(printf '%03d' $i) → A-$i 결제 완료"
  done
  sleep 0.5

  echo -e "${CYAN}--- 9) 매진 확인 ---${NC}"
  curl -s $BASE_URL/seats/sold-out | jq

  echo -e "${CYAN}--- 10) 티켓팅 자동 마감 확인 ---${NC}"
  curl -s $BASE_URL/admin/ticketing/status | jq
  sleep 0.5

  echo -e "${CYAN}--- 11) user-002가 A-2 취소 ---${NC}"
  curl -s -X POST $BASE_URL/seats/cancel \
    -H "Content-Type: application/json" \
    -d '{"userId":"user-002","seatId":"A-2"}' | jq
  sleep 0.5

  echo -e "${CYAN}--- 12) standby 1순위 확인 ---${NC}"
  curl -s $BASE_URL/queue/standby/next | jq
  sleep 0.5

  echo -e "${CYAN}--- 13) user-004 입장 전환 ---${NC}"
  curl -s -X POST $BASE_URL/queue/standby/promote \
    -H "Content-Type: application/json" \
    -d '{"userId":"user-004"}' | jq
  sleep 0.5

  echo -e "${CYAN}--- 14) user-004가 A-2 선점 + 결제 ---${NC}"
  curl -s -X POST $BASE_URL/seats/hold \
    -H "Content-Type: application/json" \
    -d '{"userId":"user-004","seatId":"A-2"}' | jq
  curl -s -X POST $BASE_URL/seats/confirm \
    -H "Content-Type: application/json" \
    -d '{"userId":"user-004","seatId":"A-2"}' | jq
  sleep 0.5

  echo -e "${CYAN}--- 15) 최종 현황 ---${NC}"
  curl -s $BASE_URL/queue/stats | jq
  curl -s $BASE_URL/seats/available | jq

  echo ""
  echo -e "${GREEN}=== 자동 시나리오 완료 ===${NC}"
  echo ""
  echo -e "${YELLOW}터미널2에서 확인할 이벤트 순서:${NC}"
  echo "  seat.held × 3    (3명 선점)"
  echo "  seat.sold × 3    (3명 결제)"
  echo "  seat.sold_out    (전석 매진 + 자동 마감)"
  echo "  seat.cancelled   (user-002 취소)"
  echo "  seat.held        (user-004 선점)"
  echo "  seat.sold        (user-004 결제)"
}

# =============================================
# 메인 루프
# =============================================
while true; do
  main_menu
  read choice
  case $choice in
    1) create_event ;;
    2) get_event_info ;;
    3) update_event ;;
    4) cancel_event ;;
    5) ticketing_open ;;
    6) ticketing_close ;;
    7) ticketing_status ;;
    8) ticketing_schedule ;;
    9) ticketing_schedule_info ;;
    10) ticketing_cancel_schedule ;;
    11) set_hold_duration ;;
    12) get_hold_duration ;;
    13) enter_queue ;;
    14) check_position ;;
    15) admit_batch ;;
    16) hold_seat ;;
    17) confirm_seat ;;
    18) check_timer ;;
    19) cancel_seat ;;
    20) queue_stats ;;
    21) seat_available ;;
    22) sold_out ;;
    23) all_seats ;;
    24) reservations ;;
    25) metrics ;;
    26) standby_next ;;
    27) standby_promote ;;
    28) flush_redis ;;
    29) auto_scenario ;;
    0) echo "종료합니다."; exit 0 ;;
    *) echo "잘못된 입력입니다." ;;
  esac
  echo ""
  echo -n "Enter를 누르면 메뉴로 돌아갑니다..."
  read
done
