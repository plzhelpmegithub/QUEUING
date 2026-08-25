#!/bin/bash
# =============================================
# QUEUING Queue API — 전체 흐름 테스트 콘솔
# =============================================
#
# 사전 준비:
#   터미널 1: cd ~/queue-api && node src/app.js
#   터미널 2: redis-cli SUBSCRIBE events:seat-status
#   터미널 3: 이 스크립트 실행
# =============================================

BASE_URL="http://localhost:3000"
RED='\033[0;31m';GREEN='\033[0;32m';YELLOW='\033[1;33m';BLUE='\033[0;34m';CYAN='\033[0;36m';MAGENTA='\033[0;35m';NC='\033[0m'
line(){ echo "";echo "─────────────────────────────────────────";}

main_menu(){
  clear
  echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║         QUEUING Queue API 테스트 콘솔 v2         ║${NC}"
  echo -e "${CYAN}╠══════════════════════════════════════════════════╣${NC}"
  echo -e "${CYAN}║  ${YELLOW}[관리자 — 공연 관리]${CYAN}                            ║${NC}"
  echo -e "${CYAN}║   1. 공연 생성 (구역/가격 설정)                  ║${NC}"
  echo -e "${CYAN}║   2. 공연 정보 조회                              ║${NC}"
  echo -e "${CYAN}║   3. 공연 정보 수정                              ║${NC}"
  echo -e "${CYAN}║   4. 공연 취소 (사유 + 알림)                     ║${NC}"
  echo -e "${CYAN}║  ${YELLOW}[관리자 — 티켓팅 제어]${CYAN}                          ║${NC}"
  echo -e "${CYAN}║   5. 티켓팅 수동 오픈                            ║${NC}"
  echo -e "${CYAN}║   6. 티켓팅 수동 마감                            ║${NC}"
  echo -e "${CYAN}║   7. 티켓팅 상태 확인                            ║${NC}"
  echo -e "${CYAN}║   8. 티켓팅 예약 오픈 (자동 타이머)              ║${NC}"
  echo -e "${CYAN}║   9. 예약 스케줄 확인                            ║${NC}"
  echo -e "${CYAN}║  10. 예약 스케줄 취소                            ║${NC}"
  echo -e "${CYAN}║  11. 결제 제한 시간 설정                         ║${NC}"
  echo -e "${CYAN}║  12. 결제 제한 시간 조회                         ║${NC}"
  echo -e "${CYAN}║  ${GREEN}[예매자 — 대기열]${CYAN}                               ║${NC}"
  echo -e "${CYAN}║  13. 대기열 진입 (줄 서기)                       ║${NC}"
  echo -e "${CYAN}║  14. 내 순번 확인                                ║${NC}"
  echo -e "${CYAN}║  15. 입장 허용 (배치 + 토큰 발급)                ║${NC}"
  echo -e "${CYAN}║  16. 입장 가능 여부 확인 (종합 상태)             ║${NC}"
  echo -e "${CYAN}║  17. Admission Token 정보 조회                   ║${NC}"
  echo -e "${CYAN}║  18. 대기열 이탈 (자발적 나가기)                 ║${NC}"
  echo -e "${CYAN}║  ${GREEN}[예매자 — 좌석]${CYAN}                                 ║${NC}"
  echo -e "${CYAN}║  19. 좌석 선점 (토큰 필요)                       ║${NC}"
  echo -e "${CYAN}║  20. 결제 확정                                   ║${NC}"
  echo -e "${CYAN}║  21. 결제 남은 시간 확인                         ║${NC}"
  echo -e "${CYAN}║  22. 좌석 취소 (재판매 트리거)                   ║${NC}"
  echo -e "${CYAN}║  ${BLUE}[모니터링]${CYAN}                                      ║${NC}"
  echo -e "${CYAN}║  23. 대기열 현황                                 ║${NC}"
  echo -e "${CYAN}║  24. 좌석 현황                                   ║${NC}"
  echo -e "${CYAN}║  25. 매진 여부                                   ║${NC}"
  echo -e "${CYAN}║  26. 전체 좌석 상태 목록                         ║${NC}"
  echo -e "${CYAN}║  27. DynamoDB 예약 기록                          ║${NC}"
  echo -e "${CYAN}║  28. Prometheus 메트릭                           ║${NC}"
  echo -e "${CYAN}║  ${RED}[B파트 연동 — 취소표 대기]${CYAN}                      ║${NC}"
  echo -e "${CYAN}║  29. standby 1순위 확인                          ║${NC}"
  echo -e "${CYAN}║  30. standby → 입장 전환 (토큰 발급)             ║${NC}"
  echo -e "${CYAN}║  ${MAGENTA}[시스템]${CYAN}                                        ║${NC}"
  echo -e "${CYAN}║  31. Redis 전체 초기화                           ║${NC}"
  echo -e "${CYAN}║  32. Redis 영속화 설정                           ║${NC}"
  echo -e "${CYAN}║  33. 자동 시나리오 (전체 흐름)                   ║${NC}"
  echo -e "${CYAN}║   0. 종료                                       ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  echo -e "${YELLOW}※ 이벤트 확인: redis-cli SUBSCRIBE events:seat-status${NC}"
  echo -n "선택: "
}

# 1. 공연 생성
create_event(){
  line;echo -e "${YELLOW}[관리자] 공연 생성${NC}";echo ""
  echo "  1) 구역별 생성 (VIP/R/S)";echo "  2) 단일 구역 간편 생성";echo -n "  선택: ";read sub
  if [ "$sub" == "1" ];then
    echo -n "  공연명: ";read en;echo -n "  날짜 (예: 2026-12-25): ";read ed;echo -n "  장소: ";read ev
    sections="[";while true;do echo -n "  구역명 (완료=enter): ";read sn;[ -z "$sn" ]&&break;echo -n "  ${sn}석 좌석 수: ";read ss;echo -n "  ${sn}석 가격: ";read sp;[ "$sections" != "[" ]&&sections="$sections,";sections="$sections{\"name\":\"$sn\",\"seats\":$ss,\"price\":$sp}";done;sections="$sections]"
    curl -s -X POST $BASE_URL/event/create -H "Content-Type: application/json" -d "{\"eventName\":\"$en\",\"eventDate\":\"$ed\",\"venue\":\"$ev\",\"sections\":$sections}" | jq
  elif [ "$sub" == "2" ];then
    echo -n "  공연명: ";read en;echo -n "  총 좌석 수: ";read ts;echo -n "  가격: ";read pr
    curl -s -X POST $BASE_URL/event/create -H "Content-Type: application/json" -d "{\"eventName\":\"$en\",\"totalSeats\":$ts,\"price\":${pr:-0}}" | jq
  fi
}

# 2. 공연 정보 조회
get_event(){ line;echo -e "${YELLOW}[관리자] 공연 정보 조회${NC}";curl -s $BASE_URL/event/info | jq;}

# 3. 공연 수정
update_event(){
  line;echo -e "${YELLOW}[관리자] 공연 정보 수정${NC}";echo ""
  echo -n "  새 날짜 (빈칸=변경없음): ";read nd;echo -n "  새 장소: ";read nv;echo -n "  변경 사유: ";read nr
  body="{";[ -n "$nd" ]&&body="$body\"eventDate\":\"$nd\",";[ -n "$nv" ]&&body="$body\"venue\":\"$nv\",";[ -n "$nr" ]&&body="$body\"reason\":\"$nr\",";body="$body\"notify\":false}"
  curl -s -X PATCH $BASE_URL/event/update -H "Content-Type: application/json" -d "$body" | jq
}

# 4. 공연 취소
cancel_event(){
  line;echo -e "${RED}[관리자] 공연 취소${NC}";echo -n "  취소 사유: ";read r;echo -n "  정말 취소? (y/n): ";read c;[ "$c" != "y" ]&&return
  curl -s -X POST $BASE_URL/event/cancel -H "Content-Type: application/json" -d "{\"reason\":\"$r\",\"users\":[]}" | jq
}

# 5~7. 티켓팅 오픈/마감/상태
tk_open(){ line;echo -e "${YELLOW}[관리자] 티켓팅 오픈${NC}";curl -s -X POST $BASE_URL/admin/ticketing/open | jq;echo -e "  ${GREEN}→ 사용자가 대기열 진입 가능${NC}";}
tk_close(){ line;echo -e "${YELLOW}[관리자] 티켓팅 마감${NC}";echo -e "  ${YELLOW}※ standby 대기자는 영향 없음${NC}";curl -s -X POST $BASE_URL/admin/ticketing/close | jq;}
tk_status(){ line;echo -e "${YELLOW}[관리자] 티켓팅 상태${NC}";curl -s $BASE_URL/admin/ticketing/status | jq;}

# 8~10. 스케줄
tk_schedule(){
  line;echo -e "${YELLOW}[관리자] 티켓팅 예약 오픈${NC}";echo -e "  현재 시간: $(date '+%Y-%m-%dT%H:%M:%S')"
  echo -n "  오픈 시간 (예: 2026-12-25T20:00:00): ";read oa;echo -n "  오픈 유지 시간 (분, 빈칸=수동 마감): ";read dm
  body="{\"openAt\":\"$oa\"";[ -n "$dm" ]&&body="$body,\"durationMinutes\":$dm";body="$body}"
  curl -s -X POST $BASE_URL/admin/ticketing/schedule -H "Content-Type: application/json" -d "$body" | jq
}
tk_schedule_info(){ line;curl -s $BASE_URL/admin/ticketing/schedule | jq;}
tk_cancel_schedule(){ line;curl -s -X POST $BASE_URL/admin/ticketing/cancel-schedule | jq;}

# 11~12. 결제 시간
set_hold(){ line;echo -e "${YELLOW}[관리자] 결제 제한 시간 설정${NC}";echo -n "  초 (예: 600): ";read s;curl -s -X POST $BASE_URL/admin/hold-duration -H "Content-Type: application/json" -d "{\"seconds\":$s}" | jq;}
get_hold(){ line;echo -e "${YELLOW}[관리자] 결제 제한 시간 조회${NC}";curl -s $BASE_URL/admin/hold-duration | jq;}

# 13. 대기열 진입
enter_queue(){
  line;echo -e "${GREEN}[예매자] 대기열 진입${NC}";echo "";echo "  1) 1명 진입";echo "  2) 여러 명 진입";echo -n "  선택: ";read sub
  if [ "$sub" == "1" ];then echo -n "  사용자 ID: ";read uid;curl -s -X POST $BASE_URL/queue/enter -H "Content-Type: application/json" -d "{\"userId\":\"$uid\"}" | jq
  elif [ "$sub" == "2" ];then echo -n "  시작 번호: ";read s;echo -n "  끝 번호: ";read e
    for i in $(seq $s $e);do r=$(curl -s -X POST $BASE_URL/queue/enter -H "Content-Type: application/json" -d "{\"userId\":\"user-$(printf '%03d' $i)\"}");t=$(echo $r|jq -r '.type // .status');echo "  user-$(printf '%03d' $i) → $t";done
  fi
}

# 14. 순번 확인
check_pos(){ line;echo -e "${GREEN}[예매자] 내 순번 확인${NC}";echo -n "  사용자 ID: ";read uid;curl -s $BASE_URL/queue/position/$uid | jq;}

# 15. 입장 허용
admit(){ line;echo -e "${GREEN}[시스템] 입장 허용 (배치 + 토큰 발급)${NC}";curl -s -X POST $BASE_URL/queue/admit | jq;echo -e "  ${YELLOW}→ tokens 안의 token 값을 좌석 선점 시 사용${NC}";}

# 16. 입장 가능 여부
queue_status(){ line;echo -e "${GREEN}[예매자] 입장 가능 여부 확인${NC}";echo -n "  사용자 ID: ";read uid;curl -s $BASE_URL/queue/status/$uid | jq;}

# 17. 토큰 정보
token_info(){ line;echo -e "${GREEN}[예매자] Admission Token 정보${NC}";echo -n "  사용자 ID: ";read uid;curl -s $BASE_URL/queue/token/$uid | jq;}

# 18. 대기열 이탈
queue_leave(){
  line;echo -e "${GREEN}[예매자] 대기열 이탈${NC}";echo -n "  사용자 ID: ";read uid;echo -n "  정말 이탈? (y/n): ";read c;[ "$c" != "y" ]&&return
  curl -s -X POST $BASE_URL/queue/leave -H "Content-Type: application/json" -d "{\"userId\":\"$uid\"}" | jq
  echo -e "  ${YELLOW}→ 재접속은 13번(대기열 진입)으로 새 순번 부여${NC}"
}

# 19. 좌석 선점 (토큰 필요)
hold_seat(){
  line;echo -e "${GREEN}[예매자] 좌석 선점 (Admission Token 필요)${NC}"
  echo -n "  사용자 ID: ";read uid;echo -n "  좌석 ID: ";read sid;echo -n "  Admission Token: ";read tk
  dur=$(curl -s $BASE_URL/admin/hold-duration|jq -r '.display')
  echo -e "  ${YELLOW}⏱ 선점 후 ${dur} 내에 결제 필요${NC}"
  curl -s -X POST $BASE_URL/seats/hold -H "Content-Type: application/json" -d "{\"userId\":\"$uid\",\"seatId\":\"$sid\",\"token\":\"$tk\"}" | jq
  echo -e "  ${YELLOW}→ 터미널2에 seat.held 이벤트 확인${NC}"
  echo -e "  ${YELLOW}→ 선점 성공 시 토큰 자동 무효화 (재사용 불가)${NC}"
}

# 20. 결제 확정
confirm_seat(){
  line;echo -e "${GREEN}[예매자] 결제 확정 (토큰 불필요)${NC}"
  echo -n "  사용자 ID: ";read uid;echo -n "  좌석 ID: ";read sid
  curl -s -X POST $BASE_URL/seats/confirm -H "Content-Type: application/json" -d "{\"userId\":\"$uid\",\"seatId\":\"$sid\"}" | jq
  echo -e "  ${YELLOW}→ 터미널2에 seat.sold 이벤트 확인${NC}"
  echo -e "  ${YELLOW}→ 마지막 좌석이면 seat.sold_out + 자동 마감${NC}"
}

# 21. 타이머
check_timer(){ line;echo -e "${GREEN}[예매자] 결제 남은 시간${NC}";echo -n "  좌석 ID: ";read sid;curl -s $BASE_URL/seats/timer/$sid | jq;}

# 22. 좌석 취소
cancel_seat(){
  line;echo -e "${GREEN}[예매자] 좌석 취소 (재판매 트리거)${NC}";echo -n "  사용자 ID: ";read uid;echo -n "  좌석 ID: ";read sid
  curl -s -X POST $BASE_URL/seats/cancel -H "Content-Type: application/json" -d "{\"userId\":\"$uid\",\"seatId\":\"$sid\"}" | jq
  echo -e "  ${YELLOW}→ 터미널2에 seat.cancelled 이벤트 확인${NC}"
}

# 23~28. 모니터링
mon_queue(){ line;echo -e "${BLUE}[모니터링] 대기열 현황${NC}";curl -s $BASE_URL/queue/stats | jq;}
mon_seats(){ line;echo -e "${BLUE}[모니터링] 좌석 현황${NC}";curl -s $BASE_URL/seats/available | jq;}
mon_soldout(){ line;echo -e "${BLUE}[모니터링] 매진 여부${NC}";curl -s $BASE_URL/seats/sold-out | jq;}
mon_allseats(){ line;echo -e "${BLUE}[모니터링] 전체 좌석 상태${NC}";curl -s $BASE_URL/seats | jq;}
mon_reservations(){
  line;echo -e "${BLUE}[모니터링] DynamoDB 예약 기록${NC}";echo "  1) 전체";echo "  2) 특정 좌석";echo -n "  선택: ";read sub
  if [ "$sub" == "1" ];then curl -s $BASE_URL/reservations | jq;elif [ "$sub" == "2" ];then echo -n "  좌석 ID: ";read sid;curl -s $BASE_URL/reservations/$sid | jq;fi
}
mon_metrics(){
  line;echo -e "${BLUE}[모니터링] Prometheus 메트릭${NC}";echo "  1) 커스텀만";echo "  2) 전체";echo -n "  선택: ";read sub
  if [ "$sub" == "1" ];then echo -e "  ${CYAN}--- 대기열 ---${NC}";curl -s $BASE_URL/metrics|grep -E "^queuing_queue_";echo -e "  ${CYAN}--- 좌석 ---${NC}";curl -s $BASE_URL/metrics|grep -E "^queuing_seats_";echo -e "  ${CYAN}--- 락/이벤트/타이머 ---${NC}";curl -s $BASE_URL/metrics|grep -E "^queuing_(lock|seat_events|timer)"
  elif [ "$sub" == "2" ];then curl -s $BASE_URL/metrics;fi
}

# 29. standby 1순위
standby_next(){ line;echo -e "${RED}[B파트] standby 1순위${NC}";curl -s $BASE_URL/queue/standby/next | jq;}

# 30. standby 전환
standby_promote(){
  line;echo -e "${RED}[B파트] standby → 입장 전환 + 토큰 발급${NC}"
  NEXT=$(curl -s $BASE_URL/queue/standby/next|jq -r '.userId');if [ "$NEXT" == "null" ];then echo "  대기자 없음";return;fi
  echo "  다음 대기자: $NEXT";echo -n "  전환? (y/n): ";read c;[ "$c" != "y" ]&&return
  curl -s -X POST $BASE_URL/queue/standby/promote -H "Content-Type: application/json" -d "{\"userId\":\"$NEXT\"}" | jq
  echo -e "  ${YELLOW}→ 반환된 token으로 19번(좌석 선점) 가능${NC}"
}

# 31. Redis 초기화
flush_redis(){ line;echo -e "${RED}[시스템] Redis 전체 초기화${NC}";echo -n "  정말? (y/n): ";read c;[ "$c" != "y" ]&&return;redis-cli FLUSHALL;echo -e "  ${GREEN}완료${NC}";}

# 32. Redis 영속화
setup_persistence(){
  line;echo -e "${MAGENTA}[시스템] Redis 영속화 설정${NC}"
  echo -e "  RDB: 60초 내 100개 변경 시 스냅샷"
  echo -e "  AOF: 1초마다 쓰기 로그 저장"
  echo -n "  설정? (y/n): ";read c;[ "$c" != "y" ]&&return
  redis-cli CONFIG SET save "60 100"
  redis-cli CONFIG SET appendonly yes
  redis-cli CONFIG SET appendfsync everysec
  redis-cli CONFIG REWRITE
  echo -e "  ${GREEN}영속화 설정 완료 — Redis 재시작해도 데이터 보존${NC}"
}

# 33. 자동 시나리오
auto_scenario(){
  line;echo -e "${MAGENTA}[자동 시나리오] 좌석 3석, 사용자 5명 — Admission Token 포함${NC}"
  echo "";echo "  1) Redis 초기화 → 공연 생성 → 결제시간 300초 → 오픈"
  echo "  2) 5명 진입 → 3명 eligible + 2명 standby"
  echo "  3) 입장 허용 + 토큰 발급 → 토큰으로 선점 → 결제"
  echo "  4) 매진 + 자동 마감 → 취소 → standby 전환 → 재선점"
  echo "";echo -n "  시작? (y/n): ";read c;[ "$c" != "y" ]&&return

  echo -e "${CYAN}--- 1) 초기화 + 공연 생성 ---${NC}"
  redis-cli FLUSHALL > /dev/null
  curl -s -X POST $BASE_URL/event/create -H "Content-Type: application/json" -d '{"eventName":"자동 테스트","totalSeats":3,"price":99000}' | jq
  curl -s -X POST $BASE_URL/admin/hold-duration -H "Content-Type: application/json" -d '{"seconds":300}' > /dev/null
  curl -s -X POST $BASE_URL/admin/ticketing/open > /dev/null
  echo -e "  오픈 완료, 결제 시간 300초"

  echo -e "${CYAN}--- 2) 5명 진입 ---${NC}"
  for i in $(seq 1 5);do r=$(curl -s -X POST $BASE_URL/queue/enter -H "Content-Type: application/json" -d "{\"userId\":\"user-$(printf '%03d' $i)\"}");t=$(echo $r|jq -r '.type');echo "  user-$(printf '%03d' $i) → $t";done

  echo -e "${CYAN}--- 3) 입장 허용 + 토큰 발급 ---${NC}"
  ADMIT_RESULT=$(curl -s -X POST $BASE_URL/queue/admit)
  echo "$ADMIT_RESULT" | jq '.tokens | keys[]'

  echo -e "${CYAN}--- 4) 3명 선점 + 결제 ---${NC}"
  for i in 1 2 3;do
    uid="user-$(printf '%03d' $i)"
    tk=$(echo "$ADMIT_RESULT"|jq -r ".tokens.\"$uid\".token")
    curl -s -X POST $BASE_URL/seats/hold -H "Content-Type: application/json" -d "{\"userId\":\"$uid\",\"seatId\":\"A-$i\",\"token\":\"$tk\"}" > /dev/null
    curl -s -X POST $BASE_URL/seats/confirm -H "Content-Type: application/json" -d "{\"userId\":\"$uid\",\"seatId\":\"A-$i\"}" > /dev/null
    echo "  $uid → A-$i 결제 완료"
  done

  echo -e "${CYAN}--- 5) 매진 + 자동 마감 확인 ---${NC}"
  curl -s $BASE_URL/seats/sold-out | jq
  curl -s $BASE_URL/admin/ticketing/status | jq

  echo -e "${CYAN}--- 6) user-002 취소 ---${NC}"
  curl -s -X POST $BASE_URL/seats/cancel -H "Content-Type: application/json" -d '{"userId":"user-002","seatId":"A-2"}' | jq

  echo -e "${CYAN}--- 7) standby 1순위 → 전환 ---${NC}"
  PROMOTE=$(curl -s -X POST $BASE_URL/queue/standby/promote -H "Content-Type: application/json" -d '{"userId":"user-004"}')
  echo "$PROMOTE" | jq
  P_TOKEN=$(echo "$PROMOTE"|jq -r '.token')

  echo -e "${CYAN}--- 8) user-004 선점 + 결제 ---${NC}"
  curl -s -X POST $BASE_URL/seats/hold -H "Content-Type: application/json" -d "{\"userId\":\"user-004\",\"seatId\":\"A-2\",\"token\":\"$P_TOKEN\"}" | jq
  curl -s -X POST $BASE_URL/seats/confirm -H "Content-Type: application/json" -d '{"userId":"user-004","seatId":"A-2"}' | jq

  echo -e "${CYAN}--- 9) 최종 현황 ---${NC}"
  curl -s $BASE_URL/queue/stats | jq
  curl -s $BASE_URL/seats/available | jq

  echo -e "${GREEN}=== 자동 시나리오 완료 ===${NC}"
  echo -e "${YELLOW}터미널2 이벤트: held×3 → sold×3 → sold_out → cancelled → held → sold${NC}"
}

# 메인 루프
while true;do
  main_menu;read choice
  case $choice in
    1)create_event;;2)get_event;;3)update_event;;4)cancel_event;;
    5)tk_open;;6)tk_close;;7)tk_status;;8)tk_schedule;;9)tk_schedule_info;;10)tk_cancel_schedule;;
    11)set_hold;;12)get_hold;;
    13)enter_queue;;14)check_pos;;15)admit;;16)queue_status;;17)token_info;;18)queue_leave;;
    19)hold_seat;;20)confirm_seat;;21)check_timer;;22)cancel_seat;;
    23)mon_queue;;24)mon_seats;;25)mon_soldout;;26)mon_allseats;;27)mon_reservations;;28)mon_metrics;;
    29)standby_next;;30)standby_promote;;
    31)flush_redis;;32)setup_persistence;;33)auto_scenario;;
    0)echo "종료";exit 0;;*)echo "잘못된 입력";;
  esac;echo "";echo -n "Enter로 메뉴 복귀...";read
done
