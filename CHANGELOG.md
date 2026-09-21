## [2026-09-21 14:17] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: `/remove-dummy-members` 라우트에서 하드코딩된 `limit: 10`을 요청 body의 `count` 파라미터로 교체. 관리자가 삭제할 더미 멤버십 인원수를 1~10,000 범위로 자유롭게 지정 가능. 미지정 시 기본값 10. 통합 시뮬레이션 모드에서 `closed` 스테이지 이후에도 삭제 가능하도록 스테이지 체크 분기 추가

## [2026-09-21 10:19] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/queueService.js]**: `enter()` 함수에서 session-scoped `totalSeatsKey` Redis 키가 없을 때(0), `events:list` 카드의 `seatsPerSession` 값으로 자동 복원하도록 폴백 로직 추가. 복원 시 Redis 키도 재설정하여 이후 호출에서는 정상 동작

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 대기열 카운트다운 완료 후 자동 진입 시 "이벤트 좌석이 설정되지 않았습니다" 에러 발생
- **원인(Cause):** `totalSeatsKey`는 session-scoped Redis 키(`event:total-seats:evt-301:2027-02-28_18:00`)로, 이벤트 생성 시에만 설정됨. Redis 재시작이나 키 만료 시 해당 키가 사라지면 `enter()` 함수가 `totalSeats === 0`으로 판단하여 에러 반환
- **해결(Solution):** `enter()` 함수 내에서 이미 파싱하고 있는 `events:list` 카드의 `seatsPerSession` 값을 `cardSeatsPerSession` 변수로 추출. `totalSeats === 0`일 때 이 값으로 폴백하고, Redis 키도 함께 복원하여 자가 치유(self-healing) 동작 구현

## [2026-09-21 10:04] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/eventRoutes.js]**: open-time API에서 `ticketCloseAt` 정리 조건을 확장. 기존 `card.status === 'closed'`뿐 아니라 `ticketCloseAt`이 과거 시간인 경우(`hasExpiredClose`)에도 `status='open'`, `ticketCloseAt=null`로 정리. events:list 카드, event:info, MariaDB 모두 동일 적용

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** "즉시 마감" 후 "10초 후 오픈"을 설정하면, 공연 페이지 큐 진입 시 오픈 시간이 지나도 "마감되었습니다" 모달이 표시됨. admin에서도 계속 "마감됨" 배지가 유지됨
- **원인(Cause):** open-time API의 `ticketCloseAt` 정리 조건이 `card.status === 'closed'`만 확인. Recovery가 status를 'open'으로 복구하면 `wasClosedByAdmin`이 false가 되어 `ticketCloseAt`(과거 시간)이 남음. `enter()`는 `ticketOpenAt` 통과 후에도 `ticketCloseAt <= now`를 보고 `eventClosed = true` 반환
- **해결(Solution):** `hasExpiredClose = card.ticketCloseAt && new Date(card.ticketCloseAt).getTime() <= Date.now()` 조건을 추가하여, status가 'open'이어도 과거 `ticketCloseAt`이 있으면 정리

## [2026-09-21 09:19] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/redisRecoveryService.js]**: periodic 복구 시 이미 존재하는 `events:list` 카드를 덮어쓰지 않도록 변경. DB에 없는 신규 카드만 추가, stale 카드만 제거. Recovery와 API 간 레이스 컨디션으로 관리자 변경이 구 데이터로 덮어씌워지는 문제 해결
- **[src/services/redisRecoveryService.js]**: periodic 복구 시 `event:info`도 누락된 경우에만 재생성. 기존 `event:info`가 있으면 스킵하여 API가 설정한 데이터를 보존

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 관리자가 "지금 바로 오픈"을 눌러 API가 200 응답 + `[Ticketing] 오픈`이 출력되지만, 직후 recovery가 `events:list` 카드를 구 DB 데이터로 덮어씌워 `enter()` 함수가 구 `ticketOpenAt`(미래)을 보고 대기열 진입 거부. Recovery가 다시 돌아야 정상 복구됨
- **원인(Cause):** `recoverAll()`의 `events:list` pipeline이 모든 카드를 DB 기준으로 무조건 덮어씀. Recovery가 API의 DB UPDATE보다 먼저 SELECT를 실행한 경우, 구 데이터로 API의 Redis 변경을 덮어쓰는 레이스 컨디션 발생
- **해결(Solution):** periodic 복구 시 이미 존재하는 `events:list` 카드는 건드리지 않고, 신규(누락) 카드만 추가. `event:info`도 같은 원칙 적용. startup/manual/forced 복구에서는 기존대로 전체 재구축

## [2026-09-21 08:26] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/redisRecoveryService.js]**: Redis 자동 복구 주기를 60초(`60 * 1000`)에서 5분(`5 * 60 * 1000`)으로 변경. 불필요한 전체 복구 반복으로 인한 MariaDB/Redis 부하를 1/5로 감소시킴
- **[src/routes/eventRoutes.js]**: close-time API "즉시 마감" 시 `ticket_open_at`을 MariaDB·Redis 양쪽에서 NULL로 해제하도록 수정. Recovery가 DB의 미래 `ticket_open_at`을 읽고 마감을 되돌리는 문제 해결
- **[src/services/redisRecoveryService.js]**: `restoreTicketingState()`에서 `status === 'closed'`인 이벤트도 마감 상태를 유지하도록 조건 추가 (기존에는 `cancelled`만 처리)
- **[src/services/redisRecoveryService.js]**: `recoverAll()`에서 periodic 복구 시 `event:ticketing-status`가 이미 존재하면 ticketing 복구를 스킵하도록 조건부 처리 추가. startup/manual 복구에서는 항상 실행

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 관리자가 "즉시 마감" 후 "지금 바로 오픈"을 누르면 약 30초~1분 후 다시 마감됨
- **원인(Cause):** (1) close-time API가 `ticket_open_at`을 DB에서 해제하지 않아, Recovery가 DB의 미래 `ticket_open_at`을 읽고 "미래인데 open이다"로 판단하여 강제로 closed로 되돌림. (2) `restoreTicketingState()`가 `status === 'closed'`를 처리하지 않아 마감된 이벤트도 `ticketOpenAt` 기준으로 재스케줄링됨. (3) periodic 복구가 매 주기마다 무조건 ticketing 상태를 DB 기준으로 덮어씀
- **해결(Solution):** (1) "즉시 마감" 시 DB/Redis의 `ticket_open_at`을 NULL로 해제하여 Recovery가 미래 오픈 시간으로 판단하지 않도록 함. (2) `restoreTicketingState()`에서 `closed` 상태도 마감 유지. (3) periodic 복구 시 `event:ticketing-status`가 존재하면 ticketing 복구를 스킵하여 관리자 변경을 보존

## [2026-09-20 21:05] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/redisRecoveryService.js]**: `recoverAll()` 함수에서 DB에 없는 `events:list` Redis 항목을 자동 제거하는 양방향 동기화 로직 추가. `hkeys`로 Redis 전체 필드를 조회한 뒤 DB `event_id` Set과 비교하여 stale 항목을 pipeline `hdel`로 일괄 제거
- **[src/routes/eventRoutes.js]**: `deleteEventData()` 함수에서 Redis 카드가 없어도(hdel 결과 0) DB 정리를 항상 진행하도록 수정. Redis와 DB 양쪽 모두에 없을 때만 404 반환. `events` 테이블 DELETE 결과의 `affectedRows`를 확인하여 DB 삭제 여부 판단

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 관리자 화면에서 공연을 삭제해도 목록에 다시 나타남. 로그에 `events:list 40/39` 경고가 60초마다 반복
- **원인(Cause):** (1) 60초 주기 Redis 자동 복구(`recoverAll`)가 DB를 읽어 `events:list`에 `hset`하지만, DB에 없는 Redis 항목은 제거하지 않아 한 번 되살아난 유령 카드가 영구화됨. (2) 복구의 DB 읽기와 삭제가 겹치면 읽어둔 옛 목록이 Redis에 다시 써지며, 방금 지운 공연이 부활. (3) `deleteEventData`는 Redis 카드가 없으면 404로 끝나 DB 행을 삭제하지 않아 역방향 유령(DB에만 남는 공연)도 발생
- **해결(Solution):** (1) 복구 시 `hkeys`로 Redis 전체 필드를 조회 → DB `event_id` Set과 비교 → stale 필드를 같은 pipeline에서 `hdel`하여 양방향 동기화. (2) 삭제 함수에서 Redis hdel 결과와 무관하게 항상 DB 정리 진행. Redis·DB 양쪽 모두 없을 때만 404 반환

## [2026-09-20 16:45] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/dbService.js]**: `saveReservation()` 함수에서 `insertResult.insertId`가 BigInt 타입일 경우 `Number()`로 변환하여 반환
- **[src/services/seatService.js]**: `confirmSeat()` 멱등성 처리에서 DB 조회 결과의 `reservation_id`도 BigInt → Number 변환 추가
- **[src/services/bPartCallbackService.js]**: `resolveReservationId()` 함수에서 반환되는 `reservation_id`를 BigInt → Number 변환. 직접 전달받은 `reservationId`도 동일하게 변환

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** `/seats/confirm` 호출 시 500 에러 — `TypeError: Do not know how to serialize a BigInt`. B 콜백도 실패하고 outbox 저장도 실패
- **원인(Cause):** MariaDB 드라이버(`mariadb` npm)가 INSERT 결과의 `insertId`를 `BigInt` 타입으로 반환. `saveReservation()`의 `reservationId`가 BigInt인 채로 `confirmSeat()` 결과 객체에 포함 → Fastify의 `JSON.stringify()` 직렬화에서 `BigInt` 타입을 처리할 수 없어 500 발생. 같은 BigInt가 B 콜백 payload에도 포함되어 `callbackComplete`와 `saveCallbackToOutbox` 모두 실패
- **해결(Solution):** `insertId`를 사용하는 모든 지점에서 `typeof val === 'bigint' ? Number(val) : val` 변환 적용. `reservation_id`는 INT(11) 범위이므로 Number 변환 시 정밀도 손실 없음

## [2026-09-20 16:21] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/seatService.js]**: `confirmSeat()` 함수에 멱등성(idempotency) 처리 추가 — 좌석이 이미 SOLD이고 동일 사용자가 재시도하면 reservations 테이블에서 기존 예약을 조회하여 `{success: true, idempotent: true}` 반환
- **[src/services/seatService.js]**: `confirmSeat()` 함수의 post-SOLD 비핵심 작업들을 개별 try-catch로 보호 — `adjustSeatCounter`, `cancelTimer`, `publishSeatEvent`, `revokeToken`, `removeAdmitted`/`backfillOne`, 매진 체크가 실패해도 결제 확정 성공 응답 반환

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** `/seats/confirm` 호출 시 500 Internal Server Error 발생, 재시도 시 409 (좌석이 이미 SOLD 상태)
- **원인(Cause):** `confirmSeat()` 함수에서 예약 저장 및 좌석 SOLD 처리 이후의 비핵심 작업(카운터 조정, 타이머 취소, 이벤트 발행, 토큰 폐기, admission 제거, 매진 체크)이 try-catch 없이 실행되어 이 중 하나가 throw하면 전체 핸들러가 500을 반환. 좌석은 이미 SOLD로 변경되었으므로 재시도 시 409 발생
- **해결(Solution):** (1) 멱등성 처리 — 좌석이 SOLD이고 같은 사용자가 confirm하면 기존 예약을 조회하여 성공 반환 (2) post-SOLD 작업을 개별 try-catch로 감싸 비핵심 작업 실패가 결제 확정 응답에 영향을 주지 않도록 방어적 처리

## [2026-09-20 15:01] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/timerService.js]**: `startTimer()` 함수에 `customDuration` 매개변수 추가. 전달 시 글로벌 `HOLD_DURATION` 대신 커스텀 값으로 좌석 hold 타이머 설정
- **[src/services/seatService.js]**: `holdSeat()` 함수에서 `options.holdDuration`을 `startTimer()`에 전달하도록 수정
- **[src/routes/cancelQueueRoutes.js]**: `POST /cancel-queue/hold` 엔드포인트에서 취소표 allocation의 `expiresAt`까지 남은 시간을 계산하여 `holdDuration`으로 전달. 취소표 좌석 hold가 allocation 만료시간과 동기화됨

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** B파트 취소표 결제 시 "선점 상태가 아닌 좌석입니다" 오류(HTTP 409)로 결제 실패
- **원인(Cause):** 좌석 hold 타이머 기본값이 `HOLD_DURATION` 환경변수 미설정 시 60초로 설정됨. 결제 폼 작성 중 hold가 만료되어 좌석이 자동으로 AVAILABLE 상태로 복원됨. 반면 프론트엔드의 Secret Link 타이머는 5분(allocation.expiresAt 기준)이어서 두 타이머 간 불일치 발생
- **해결(Solution):** 취소표 hold 요청 시 allocation의 `expiresAt` 남은 시간을 계산하여 좌석 hold 타이머에 동기화. `startTimer(seatId, userId, customDuration)` → `holdSeat(options.holdDuration)` → `cancelQueueRoutes`에서 `Math.max(60, remaining)` 전달

## [2026-09-20 14:02] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/seatService.js]**: `confirmSeat()` 함수에서 취소표 allocation을 RESPONDED로 갱신한 뒤, `waiting_queue` 테이블의 해당 standby 항목 상태를 `COMPLETED`로 업데이트하는 로직 추가
- **[src/routes/cancelQueueRoutes.js]**: `GET /cancel-queue/mine` 쿼리에 `AND status NOT IN ('COMPLETED', 'LEFT')` 필터 추가. 결제 완료된 취소표 대기열 항목이 마이페이지 대기 목록에서 제거됨

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 취소표 결제 완료 후에도 마이페이지 취소표 대기열에 해당 항목이 "대기 중"으로 계속 표시됨. 또한 결제 성공 시 본 티켓팅 좌석 페이지(`zones/`)로 이동하며, 시크릿 링크가 만료되지 않음
- **원인(Cause):** (1) `confirmSeat()`이 allocation만 RESPONDED로 갱신하고 `waiting_queue` 상태는 변경하지 않았음 (2) `/cancel-queue/mine` SQL이 standby 항목의 status를 필터하지 않아 COMPLETED 항목도 반환됨 (3) 프론트엔드 `payment.js`의 에러 fallback이 `zones/` 경로로 하드코딩되어 취소표 결제에서도 본 티켓팅 좌석 페이지로 이동 (4) 결제 성공 시 `expireCancelAllocation` 호출이 없어 시크릿 링크가 만료되지 않음
- **해결(Solution):** (1) `confirmSeat()`에 `waiting_queue` COMPLETED 업데이트 추가 (2) `/cancel-queue/mine` 쿼리에 status 필터 추가 (3) 프론트엔드 payment.js 수정은 nginx 측 CHANGELOG 참고

---

## [2026-09-20 13:27] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/queueService.js]**: `getPosition` 함수에 `statusKey` 'closed' 상태 확인 추가. 대기열이 마감된 상태에서 eligible(본 대기열) 사용자에게 `status: 'closed'` 응답 반환

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 통합 시뮬레이션에서 "티켓팅 마감" 버튼을 누른 후 대기열 페이지에 "예매가 마감되었습니다" 알럿이 표시되지 않음
- **원인(Cause):** `getPosition` 함수가 Redis `statusKey`의 'closed' 상태를 확인하지 않아, 대기 중인 사용자가 계속 `status: 'waiting'` 응답만 수신. 프론트엔드 `pollPosition`에도 `pos.status === 'closed'` 분기가 없어 마감 UI가 트리거되지 않음
- **해결(Solution):** 백엔드 `getPosition`에 `statusKey` 확인 로직 추가 (eligible 사용자에게 `status: 'closed'` 반환), 프론트엔드 `pollPosition`에 `pos.status === 'closed'` → `showClosedUI()` 분기 추가

---

## [2026-09-20 13:05] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/app.js]**: `LAST_SIMULATION_ENABLED` 환경 변수 기본값을 환경별 분기(`NODE_ENV === 'production' ? 'false' : 'true'`)에서 항상 `'false'`로 변경. 시작 시 환경 변수 원본값·변환값·활성화 여부를 콘솔에 출력하는 디버깅 로그 추가

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** AWS에서 `LAST_SIMULATION_ENABLED=false`로 설정했음에도 `cancel_last_*` DB 테이블이 계속 생성됨
- **원인(Cause):** `app.js`의 기본값 로직이 `NODE_ENV !== 'production'`일 때 `'true'`로 fallback되어, 환경 변수가 컨테이너에 전달되지 않거나 `NODE_ENV`가 정확히 `'production'`이 아닌 경우 Last 시뮬레이션이 활성화됨
- **해결(Solution):** 기본값을 `'false'`로 고정하여 명시적으로 `LAST_SIMULATION_ENABLED=true` 설정 시에만 활성화되도록 변경. 추가로 시작 시 디버깅 로그 출력

---

## [2026-09-20 12:38] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/notificationService.js]**: SES 취소표 메일의 빨간색 브랜드 카드 디자인(`wrapEmailHtml`)을 공통 함수로 추출. 헤더(#E11D2E), 콘텐츠 영역, 회색 푸터 3단 구조
- **[src/routes/seatRoutes.js]**: 예매 완료(일반/무통장), 예매 취소 및 환불 메일에 카드 디자인 적용. 무통장은 입금 기한 경고 배지 포함
- **[src/services/membershipService.js]**: 멤버십 가입 완료, 멤버십 해지 완료 메일에 카드 디자인 적용
- **[src/routes/lastSimulationRoutes.js]**: 취소표 예매 완료, 취소표 예매 링크 안내 메일에 카드 디자인 + CTA 버튼 적용
- **[src/routes/simulationRoutes.js]**: Local SMTP 취소표 Secret Link 발급 메일에 카드 디자인 + CTA 버튼 적용
- **[src/services/notificationService.js]**: 공연 취소 안내, 공연 정보 변경 안내 메일에 카드 디자인 적용
- **[src/routes/simulationRoutes.js]**: drain-queue 엔드포인트가 멤버십 더미도 함께 제거하도록 수정. drain 후 `admittedKey`에 남은 더미를 추가 정리하여 `admitBatch` 슬롯 확보. drain 스테이지를 `main_queue_open` 이후로 복원, sellout은 `queue_drained`도 허용

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 대기열 드레인 후 더미가 전부 제거되었지만 실제 사용자가 입장되지 않음
- **원인(Cause):** 1) drain 필터가 일반 더미(`sim-integrated-user-*`)만 제거하고 멤버십 더미(`sim-member-integrated-*`)는 남겨둠 2) `admittedKey`에 이미 입장된 더미가 100명(BATCH_SIZE) 가까이 차 있어 `admitBatch`의 `availableSlots`가 0
- **해결(Solution):** drain 필터에 멤버십 더미 접두사 추가. drain 실행 시 `admittedKey`에 남은 더미를 `smembers` → `srem`으로 추가 정리하여 입장 슬롯 확보

## [2026-09-20 11:07] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: `POST /simulation/integrated/drain-queue` 엔드포인트를 매진(sold_out) **이후** 동작하도록 전면 재작성. `batchSize`(기본 1000)만큼 더미를 대기열에서 제거하고, `releaseSeatCount`만큼 더미 SOLD 좌석을 AVAILABLE로 해제. 더미 소진 시 `admitBatch`로 실제 사용자 자동 입장 승인. 누적 통계(`totalDrained`, `totalSeatsReleased`) 추적
- **[src/routes/simulationRoutes.js]**: sellout 단계의 허용 스테이지를 `main_queue_open`만으로 복원 (`queue_drained` 제거). 스테이지 순서: `main_queue_open` → `sold_out` → `queue_drained` → `closed`

## [2026-09-20 10:42] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: 통합 시뮬레이션에 `POST /simulation/integrated/drain-queue` 엔드포인트 추가. 본 티켓팅 대기열에서 더미 사용자를 일괄 제거하고 실제 사용자를 `admitBatch`로 입장 승인하여 좌석 선택 → 결제 흐름을 테스트할 수 있게 함. 새 스테이지 `queue_drained` 추가
- **[src/routes/simulationRoutes.js]**: sellout 단계의 허용 스테이지에 `queue_drained` 추가 — 실제 사용자가 좌석을 선점한 뒤 나머지 좌석을 더미에게 매진 처리 가능

## [2026-09-20 08:40] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/cancelQueueRoutes.js]**: `POST /verify-link` 성공 응답에 검증 주체(`local` 또는 `b`)를 추가해 프론트엔드가 Local SMTP 링크와 B파트 링크의 화면을 안전하게 구분하도록 변경했습니다.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 통합 티켓팅 시뮬레이션 단계6에서 발급된 B파트 링크가 Last 시뮬레이션용 좌석 화면이 아니라 기존 간단한 개인 링크 화면으로 이동했습니다.
- **원인(Cause):** A파트 `/verify-link`가 Local JWT와 B 콜백 검증을 하나의 동일 응답으로 정규화해, 프론트엔드가 링크의 검증 주체를 구분할 수 없었습니다.
- **해결(Solution):** 검증 성공 응답에 `source`를 포함했습니다. 이 값은 화면 라우팅에만 사용하며 완료·만료 상태 전이는 기존 B 콜백 경계를 그대로 유지합니다.

## [2026-09-20 08:18] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/app.js]**: 기존 AWS·Final 시뮬레이션과 분리된 `/admin/integrated-simulation/*` 라우트 모드를 추가 등록했습니다.
- **[src/routes/simulationRoutes.js]**: 일반·멤버십 더미를 본 티켓팅 대기열에 구성한 뒤 매진 시 멤버십 더미만 취소표 standby로 전환하고, 마감·취소 좌석 생성·B파트 SQS 링크 요청까지 이어지는 통합 시뮬레이션 API를 추가했습니다. 통합 모드는 별도 Redis 상태 키와 더미 사용자 접두사를 사용합니다.
- **[src/routes/simulationRoutes.js]**: 통합 단계6 직전에 `sim-member-integrated-*` 대기 행과 테스트 계정을 자동 정리해 B Lambda의 `membership_at_join=1` 후보 조회가 더미 메일 주소를 선택하지 않도록 보호했습니다. 정리가 실패하면 SQS 발행을 중단합니다.
- **[src/services/queueService.js]**: 통합 시뮬레이션 실행 중 실제 서비스 경로로 취소표 대기열에 진입한 멤버십 사용자를 별도 후보 Set에 기록하도록 확장했습니다.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** AWS 또는 Final 취소표 시뮬레이션만으로는 일반 본 티켓팅 대기열부터 멤버십 전용 취소표 대기열, B파트 링크 발급까지 한 화면에서 연속 검증할 수 없었습니다.
- **원인(Cause):** 기존 두 시뮬레이터는 취소표 단계 검증을 목적으로 하며 본 티켓팅 대기열 구성 단계를 별도로 제공하지 않았습니다.
- **해결(Solution):** 기존 라우트의 정책을 변경하지 않고 통합 전용 모드·상태 키·더미 ID를 추가해 두 대기열의 책임을 분리한 6단계 검증 흐름을 만들었습니다.
- **추가 검증:** B파트 후보 SQL은 더미 ID를 별도로 제외하지 않으므로, 통합 시뮬레이션은 링크 요청 직전 전용 멤버십 더미를 제거한 뒤 실제 사용자 후보만 남깁니다.

## [2026-09-19 15:41] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/cancelQueueRoutes.js]**: 취소표 대기열 등록·상태 조회·마이페이지 목록을 다시 활성 멤버십 회원 전용으로 제한했습니다. 비멤버십 사용자는 취소표 대기열 행과 순번을 조회할 수 없습니다.
- **[src/services/queueService.js]**: 취소표 순번·전체 인원 집계를 일반 Redis standby 전체가 아니라 활성 멤버십 대기자 기준으로 복원했습니다.
- **[src/routes/simulationRoutes.js]**: AWS·Final 공통 시뮬레이션을 `조기 마감 → 일반 더미 전체 삭제 → 멤버십 더미 10명씩 삭제 → 취소표 생성` 흐름으로 복원했습니다.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 시뮬레이션 편의를 위해 일반 본 티켓팅 대기열 정책을 취소표 대기열과 마이페이지에까지 적용해 기존 멤버십 전용 서비스 경계가 사라졌습니다.
- **원인(Cause):** `/cancel-queue/join`이 일반 `enter()`를 사용하고, 순번 집계가 전체 Redis standby를 기준으로 변경되어 있었습니다.
- **해결(Solution):** `/cancel-queue/join`을 `enterStandby()`로 되돌리고, 활성 멤버십 대기자만 조회·표시하도록 복원했습니다. B 완료 콜백의 `reservation_id` 전달 보완은 유지합니다.

## [2026-09-19 15:20] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: AWS(`/admin/simulation/*`)와 Final이 사용하는 Local(`/admin/local-simulation/*`) 공통 시뮬레이션 흐름에서 일반 더미 전체 삭제 단계를 제거했습니다. 단계1 매진 후 조기 마감 전에 지정한 `sim-user-` 번호만 대기열에서 이탈시키는 `POST /remove-standard-dummy-users`를 추가했습니다.
- **[src/routes/simulationRoutes.js]**: 조기 마감 뒤 더미 멤버십 사용자를 선두 순서가 아니라 관리자가 입력한 번호로 최대 10명씩 선택 삭제하도록 변경했습니다. 각 삭제 후 Redis 순번과 MariaDB 대기열 행을 함께 갱신하고, 모든 멤버십 더미가 제거되어야 단계3이 활성화됩니다.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 일반 더미 전체 삭제가 조기 마감 뒤 한 번에 실행되어, 마감 전 실제 대기 순번이 점진적으로 줄어드는 본 티켓팅 흐름을 재현할 수 없었습니다.
- **원인(Cause):** 일반 더미 제거 API가 전체 `sim-user-*` 행을 일괄 삭제하고, 시뮬레이션 상태를 별도 단계로 강제했기 때문입니다.
- **해결(Solution):** 지정한 더미 번호만 Redis Sorted Set과 해당 회차의 `waiting_queue`에서 제거하도록 바꾸고, `sold_out → closed → dummy_members_removed` 순서를 단순화했습니다.

## [2026-09-18 07:40] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/middleware/auth.js]**: `allowUserOrCancelLink` 미들웨어에서 빈 Bearer 토큰(`Bearer `)도 truthy로 인식해 `authenticate` 경로로 진입하던 문제 수정 — 실제 토큰 값이 있을 때만 Bearer 인증을 시도하고, 없으면 cancel link token 폴백 경로로 진행. `requireSelfOrLink`에서 cancel link token의 `seatId`가 비어있을 때(Last 공용 풀 모드) 사용자 선택 좌석과의 불일치로 403이 발생하던 문제 수정 — `seatId`가 미배정인 경우 미들웨어 레벨 검증을 건너뛰고 route handler에서 좌석 유효성 검증
- **[src/routes/lastSimulationRoutes.js]**: `POST /last-simulation/verify-link` 핸들러에서 `currentCandidate()` 호출을 읽기 전용 쿼리로 교체 — 기존 `currentCandidate()`는 만료된 allocation을 EXPIRED로 변경하는 부작용이 있어, 링크 검증 시점에 사용자 자신의 allocation이 만료 처리될 위험이 있었음

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** Last 취소표 링크 페이지에서 "선택 가능" 표시는 정상이나, 좌석 클릭 시 아무 반응 없음. 네트워크 탭에서 모든 `/last-simulation/*` 인증 요청(pool 폴링, hold)이 403 Forbidden 반환
- **원인(Cause):** 세 가지 원인이 겹쳐 발생.
  1. `JWT_AUTH_SECRET` 미설정 시 `issueScopedCancelToken()`이 `null` 반환 → 프론트엔드가 `Authorization: Bearer ` (빈 토큰)을 전송 → `allowUserOrCancelLink` 미들웨어가 빈 헤더도 truthy로 판단해 `authenticate()` 경로 진입 → cancel link token 폴백 미작동
  2. `verify-link`에서 `currentCandidate()` 호출 시 side effect로 만료된 allocation/candidate 상태를 EXPIRED로 변경하여 후속 API 호출에서 `allocation.status !== 'LINK_SENT'` 조건 불일치
  3. `requireSelfOrLink`의 seatId 검증: Last 공용 풀 모드에서 cancel link token의 `seatId`가 비어있는데(`allocation.seatId = null`), POST /hold 요청에는 사용자가 선택한 좌석 ID가 포함 → `'' !== '선택좌석ID'` → `linkMatches = false` → 403
- **해결(Solution):** 
  1. `allowUserOrCancelLink`: `header` 존재 여부가 아닌 Bearer 뒤의 실제 토큰 값(`bearerToken`) 확인으로 변경
  2. `verify-link`: `currentCandidate()` 대신 `cancel_last_candidates`에 대한 읽기 전용 SELECT 쿼리 사용
  3. `requireSelfOrLink`: cancel link token에 `seatId`가 미배정(`''`)이면 seatId 검증 건너뜀 — `!request.cancelLink.seatId` 조건 추가
  4. 프론트엔드: `lastHeaders()`에서 토큰이 비어있으면 Authorization 헤더 미전송, 모든 API 호출에 `linkToken` 파라미터 추가하여 Bearer 토큰 실패 시 cancel link token으로 폴백

## [2026-09-18 01:35] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/lastSimulationRoutes.js]**: `POST /last-simulation/verify-link` 응답에 `currentSequenceNo`와 `canSelect` 필드를 추가하여 프론트엔드 초기 렌더링 시 현재 순번 여부를 즉시 판별할 수 있도록 변경

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** Last 취소표 링크를 열면 DB에 정상 데이터(allocation LINK_SENT, sequence_no=1)가 있어도 초기 화면에 "현재 순번 전"이 표시되고 좌석 선택 불가. 2초 후 첫 폴링이 성공해야 수정되지만, 폴링 실패 시 계속 "순번 전" 상태로 남음
- **원인(Cause):** `verify-link` 응답에 `currentSequenceNo`가 없어서 프론트엔드 `renderValid()`가 `data.sequenceNo === data.currentSequenceNo` → `1 === undefined` → `false`로 평가, 초기 렌더링에서 모든 좌석의 `selectable`을 `false`로 설정
- **해결(Solution):** `verify-link`에서 후보 행이 있는 경우 `currentCandidate(campaign_id)`를 호출해 현재 활성 순번을 조회하고, `currentSequenceNo`와 `canSelect`를 응답에 포함. 프론트엔드가 첫 폴링 전에도 순번을 정확히 판별

## [2026-09-17 23:08] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/middleware/auth.js]**: 취소표 scoped token의 경로 허용 검사를 `request.url` 하나에 의존하지 않고 Fastify 라우트 메타데이터·원본 URL까지 함께 확인하도록 보완

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** Last 좌석 화면의 `/last-simulation/pool` 요청이 `403 scope_restricted`로 반복되어, 실제 순번 1번 사용자도 좌석을 선택하거나 결제 화면으로 이동할 수 없었음
- **원인(Cause):** 프록시 또는 라우트 prefix 환경에서 scoped token 검증 시 실제 취소표 라우트 경로를 인식하지 못해 허용 목록에서 제외될 수 있었음
- **해결(Solution):** `request.routeOptions.url`, `request.routerPath`, `request.url`, `request.raw.url`을 함께 검사해 `/last-simulation` 경로를 안정적으로 허용. 사용자 식별·allocation·순번 검증은 그대로 유지

## [2026-09-17 21:50] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/lastSimulationRoutes.js]**: Final 시뮬레이션 정리 API에 `eventId` 기준 일괄 삭제 경로를 추가하고, 해당 공연의 Last 캠페인·후보·취소표 풀·미처리 allocation을 함께 정리하도록 변경
- **[src/routes/lastSimulationRoutes.js]**: 아직 결제 확정되지 않은 취소표 좌석만 복원하고, `RESPONDED`/`COMPLETED` 상태의 좌석은 실제 예약 보호를 위해 강제 해제하지 않도록 보완
- **[src/routes/lastSimulationRoutes.js]**: Last 시뮬레이션 삭제 결과에 실제 삭제된 `cancel_last_pool_seats` 좌석 수를 포함하고, 선택한 공연의 공용 풀 삭제 여부를 관리자 응답 메시지에서 확인할 수 있도록 보완

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** Final 시뮬레이션에서 `데이터 삭제`를 실행해도 `cancel_last_campaigns`, `cancel_last_candidates`, `cancel_last_pool_seats`의 이전 테스트 데이터가 남아 있었음
- **원인(Cause):** 화면 새로고침으로 `campaignId`가 사라지면 기존 Local 정리 API만 호출되었고, Last 전용 테이블은 캠페인별 삭제 API를 별도로 호출해야 했으며 풀 삭제 결과도 확인하기 어려웠음
- **해결(Solution):** `POST /admin/last-simulation/cleanup-event`를 추가해 선택한 `event_id`의 모든 Last 테스트 캠페인과 공용 풀을 정리하고, Final 화면이 Local 정리 후 이 API를 호출하도록 연결했다. 캠페인별 풀 좌석 수를 `poolSeatsDeleted`로 응답한다.

## [2026-09-17 18:59] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/lastSimulationRoutes.js]**: Last 전용 `confirm` 및 `expire` API가 기존 결제 화면에서 전달되는 allocation·좌석·scoped token 요청을 처리하도록 유지

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 좌석 선점 이후 결제 화면으로 이동하면 일반 `/seats/confirm` 경로로 빠져 Last 후보·공용 풀 상태가 갱신되지 않을 수 있었음
- **원인(Cause):** 기존 결제 페이지는 모든 취소표 주문을 일반 좌석 확정 API로 처리했음
- **해결(Solution):** 프론트엔드가 Last allocation을 식별해 전용 `/last-simulation/confirm`을 호출하도록 분기하고, scoped token으로 사용자·allocation 소유권을 검증

## [2026-09-17 18:50] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/lastSimulationRoutes.js]**: Final 취소표 풀의 공개 시각을 UTC SQL 문자열로 저장하고 MariaDB `UTC_TIMESTAMP()` 기준으로 공개 여부를 판정하도록 변경
- **[README.md]**: Final 화면의 공개 지연 기본값이 즉시(`openDelaySeconds=0`)이며 Secret Link 유효 시간이 5분임을 명시

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 취소표 풀을 10석으로 생성했는데 링크 화면에서 좌석이 전부 매진처럼 보이고, 즉시 링크 발급 단계에서도 “아직 취소표 공개 시간 전” 오류가 발생할 수 있었음
- **원인(Cause):** 좌석의 `AVAILABLE` 상태와 현재 순번의 `selectable` 권한을 같은 회색 표시로 처리해 공용 풀 좌석이 매진으로 오인되었고, MariaDB `DATETIME`에 JS `Date`를 직접 저장할 때 애플리케이션·DB 타임존 차이로 `open_at`이 미래로 판정될 수 있었음
- **해결(Solution):** Last 공용 풀의 AVAILABLE 좌석은 현재 순번이 아니어도 보라색으로 표시하되 클릭은 차단하고, 공개 시각은 UTC 문자열로 저장한 뒤 MariaDB `UTC_TIMESTAMP()`와 비교하도록 수정

## [2026-09-17 18:35] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/lastSimulationRoutes.js]**: Final Last 공용 풀 화면에서 기존 Local SMTP Secret Link도 검증할 수 있도록 `mode: 'local'` 호환 분기를 추가하고, 배정 좌석 홀드·결제 확정·만료/좌석 해제를 연결
- **[src/routes/lastSimulationRoutes.js]**: `seat_id=NULL` allocation은 회차의 AVAILABLE 좌석을 검증한 뒤 선택 좌석을 allocation에 기록하고 기존 좌석 분산 락으로 홀드하도록 보강
- **[src/routes/lastSimulationRoutes.js]**: Final 캠페인 후보 조회 기준 시각을 Local 시뮬레이션 시작 시각과 연계해 Local 단계 이후 실제 본 대기열에 들어온 멤버십 사용자가 누락되지 않도록 수정
- **[README.md]**: Local 단계와 Last 공용 풀을 하나의 Final 흐름으로 사용하는 API 동작 및 로컬 링크 호환 정책을 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 관리자에서 `POST /admin/last-simulation/init` 요청 시 `Route POST:/admin/last-simulation/init not found` 404가 발생하고 API 터미널에도 요청 로그가 남지 않음
- **원인(Cause):** 현재 소스에는 `lastSimulationRoutes` 등록과 해당 라우트가 존재하지만, 실행 중인 Fastify 프로세스가 라우트 추가 전 코드로 기동되어 최신 라우트를 로드하지 않은 상태였음. 또한 Vite 개발 프록시에 `/last-simulation` 경로가 없으면 Last 화면 API가 A파트 서버로 전달되지 않음
- **해결(Solution):** `app.js`의 `lastSimulationRoutes` 등록을 유지하고 Vite에 `/last-simulation` 프록시를 추가했다. API 프로세스와 Vite 개발 서버를 최신 소스로 재시작해야 새 라우트가 실제 실행 환경에 반영된다.

## [2026-09-17 17:46] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/eventCatalogService.js]**: Redis `events:list`와 MariaDB `events`를 공연 ID 기준으로 병합하는 공통 카탈로그 조회 로직을 추가하고, Redis 카드에 회차가 없을 때 MariaDB `seats`에서 날짜·시간을 보완
- **[src/routes/eventRoutes.js]**: 일반 공연 목록 API가 통합 카탈로그를 사용하도록 변경해 Redis에 누락된 DB 공연도 목록에 포함
- **[src/routes/simulationRoutes.js]**: 기존 취소표 시뮬레이션의 공연 선택 API가 통합 카탈로그를 사용하도록 변경
- **[src/routes/lastSimulationRoutes.js]**: Last 시뮬레이션의 공연 선택 API가 통합 카탈로그를 사용하도록 변경
- **[src/routes/lastSimulationRoutes.js]**: Last 공연 목록 조회에서 전용 테이블 초기화를 분리해 테이블 권한·스키마 오류가 드롭다운 조회를 차단하지 않도록 보완
- **[README.md]**: 공연 목록 조회의 Redis·MariaDB 병합 및 회차 보완 정책을 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 어드민에서 공연을 생성했는데 취소표 시뮬레이션의 “공연을 선택하세요” 드롭다운에 공연이 나타나지 않음
- **원인(Cause):** 시뮬레이션 목록 API가 Redis `events:list`만 조회했고, 패널도 페이지 진입 시 한 번만 목록을 불러와 MariaDB에만 남은 공연이나 생성 이후 추가된 공연을 반영하지 못함
- **해결(Solution):** Redis와 MariaDB를 모두 조회해 `eventId` 기준으로 병합하고, Redis 회차 정보가 없으면 좌석 테이블에서 회차를 복원하도록 수정했다. 일반·기존 시뮬레이션·Last 시뮬레이션 목록 API에 동일 로직을 적용했다.

## [2026-09-18 09:52] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/lastSimulationRoutes.js]**: Last 시뮬레이션의 링크 발급을 후보 전체 일괄 발송에서 현재 순번 1명 발송으로 변경했습니다. 후보 상태를 `ISSUING`으로 원자적으로 점유한 뒤 메일 발송 성공 시에만 `LINK_SENT`로 전환합니다.
- **[src/routes/lastSimulationRoutes.js]**: 1번 사용자의 결제 완료, 순번 양도, 링크 만료 후 다음 `WAITING` 후보에게 새 5분 Secret Link를 자동 발급하도록 추가했습니다. 미접속 링크 만료도 프로세스 타이머로 처리하고, 재시작 뒤에는 기존 DB 만료 확인으로 보완합니다.
- **[src/routes/lastSimulationRoutes.js]**: 이전 일괄 발송 테스트에서 남은 후순위 `LINK_SENT` 링크는 무효화하고 `WAITING`으로 되돌려, 앞 순번 종료 뒤 새 링크가 발급되도록 보정했습니다.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 1번과 2번 후보가 모두 5분 Secret Link 이메일을 동시에 받아 순번 제어가 무력화됨
- **원인(Cause):** 관리자 링크 발급 API가 취소표 풀 수만큼 모든 `WAITING` 후보를 순회하며 allocation 생성과 SMTP 발송을 수행했음
- **해결(Solution):** 유효 링크가 하나라도 있으면 다음 발급을 중단하고, 앞 순번의 `COMPLETED`·`PASSED`·`EXPIRED` 전환 뒤에만 다음 후보를 원자적으로 발급한다. 후순위에 미리 생성된 allocation도 정리해 새 순번 시점에 새 이메일이 발송되도록 했다.

## [2026-09-19 13:05] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/cancelQueueRoutes.js]**: `/cancel-queue/mine`이 회차 값이 비어 있는 초기 AWS B파트 `LINK_SENT` allocation도, 동일 공연에 참여 중인 회차가 하나일 때만 안전하게 standby 행에 연결하도록 보완했습니다. 응답 allocation에는 화면 표시용 회차 값도 함께 반환합니다.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** AWS에서 Secret Link가 발급된 `cancel_allocations` 행이 있어도 마이페이지 대기열에서는 링크 미발급으로 표시될 수 있었습니다.
- **원인(Cause):** 대기열 행은 공연·회차 키로 allocation을 찾지만, 이전 B Lambda가 생성한 allocation은 `session_date`, `session_time`이 빈 값일 수 있어 키가 일치하지 않았습니다.
- **해결(Solution):** 정확한 회차 키 매칭을 우선 유지하고, 활성 legacy allocation이 하나이며 사용자의 해당 공연 standby 회차도 하나인 경우에만 연결합니다. 여러 회차가 있으면 잘못된 링크 표시를 막기 위해 기존처럼 연결하지 않습니다.

## [2026-09-18 09:27] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/lastSimulationRoutes.js]**: Last Secret Link의 활성 상태는 유지한 채 Redis 선점만 해제하는 `POST /last-simulation/release` API를 추가했습니다. Last 공용 풀 후보는 해제 시 allocation의 `seat_id`, 풀 좌석, 후보 상태를 다시 선택 가능한 상태로 복구합니다.
- **[src/routes/lastSimulationRoutes.js]**: 링크 재접속 시 `cancel_allocations.seat_id`만 남고 Redis `HELD` 상태가 사라진 stale 선택을 자동 정리합니다. 실제 Redis 선점이 남아 있는 경우에만 `heldSeatId`를 반환해 결제 단계로 안전하게 복구합니다.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 결제 전에 페이지를 이탈하거나 다시 열면 기존 선택 좌석이 계속 선택 중으로 남아, 링크 만료 전에도 다른 좌석을 고를 수 없었음
- **원인(Cause):** 화면 이탈을 링크 만료 처리로 연결했고, allocation의 좌석 기록과 Redis 실제 선점 상태를 구분하지 않았음
- **해결(Solution):** 링크 만료와 좌석 선점 해제를 분리했습니다. 해제 API는 Redis 좌석을 `AVAILABLE`로 되돌리고 Last 후보의 allocation 연결만 지우며, 재접속 검증 시에도 실제 Redis `HELD` 상태를 기준으로 이전 결제 단계를 복원합니다.

## [2026-09-17 23:53] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/lastSimulationRoutes.js]**: Last 취소표 링크 메일 제목과 본문에 `evt-*` ID 대신 통합 공연 카탈로그의 공연명을 사용하도록 변경하고, 취소표 전용 결제가 완료되면 결제수단 저장·MariaDB 예약 확정·완료 메일 발송을 한 흐름으로 처리하도록 보완
- **[src/routes/lastSimulationRoutes.js]**: 결제 완료 또는 `다음 순번에게 넘기기` 처리 시 해당 `waiting_queue` standby 행을 `COMPLETED`로 종료하도록 추가. 순번 양도는 `cancel_last_history`에 별도 기록하고, `GET /last-simulation/history/mine` 및 `POST /last-simulation/pass` API를 신설
- **[src/routes/lastSimulationRoutes.js]**: Last 공용 풀의 좌석 홀드 도중 예외가 발생하면 방금 기록한 allocation 좌석을 조건부로 되돌리도록 보강
- **[src/services/dbService.js]**: 서버 기동 시 `cancel_last_history` 테이블을 함께 생성하도록 추가

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** Last Secret Link에서 좌석을 골라도 일반 예매 결제 화면으로 이동했고, 완료 후 대기열 행이 남거나 원하는 좌석이 없을 때 순번을 명시적으로 포기할 수 없었음
- **원인(Cause):** Last 전용 좌석 선점 이후의 결제·대기열 종료·안내 이력이 일반 결제 화면과 분리되어 있지 않았고, 결제하지 않은 순번 양도를 저장할 영속 이력이 없었음
- **해결(Solution):** Last 전용 confirm 흐름에서 예약·메일·standby 종료를 원자적 순서로 연결했다. 순번 양도는 좌석을 해제하고 후보 상태를 `PASSED`로 전환한 뒤, 예약을 만들지 않고 별도 이력 테이블에 기록한다.

## [2026-09-17 17:11] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/queueService.js]**: 취소표 standby 대상 조회에 `membership_at_join=1`, 본 대기열 참여 이력 존재, 시뮬레이션 더미 ID 제외 조건을 추가해 실제 멤버십 참여자만 집계하도록 보강
- **[src/routes/simulationRoutes.js]**: B파트·Local 시뮬레이션의 단계4 후보를 시뮬레이션 추적 Set과 MariaDB 검증 결과의 교집합으로 제한하고, 실제 후보 수·queue_id 목록을 상태에 기록
- **[README.md]**: 실제 멤버십 후보 선별 조건과 단계4 동작을 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 관리자 취소표 시뮬레이션 단계4가 현재 활성 멤버십만 확인하면 대기열 진입 당시 비회원이었던 계정이나 시뮬레이션과 무관한 standby 데이터가 후보로 섞일 수 있었음
- **원인(Cause):** 후보 조회에 `membership_at_join`, 본 대기열 참여 이력, 시뮬레이션 참여 추적 여부를 동시에 적용하지 않았음
- **해결(Solution):** MariaDB에서 진입 당시 멤버십·본 대기열 참여·활성 standby를 검증하고, 시뮬레이션 Hash 이후 실제 서비스 경로로 기록된 사용자 Set과 교차 필터링했다. 더미 ID는 별도로 제외하여 단계4 링크 발급 대상이 실제 멤버십 사용자로 한정되도록 수정

## [2026-09-17 11:47] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/queueService.js]**: 조기 마감 후 기존 standby 사용자의 `/queue/enter` 재요청에 `closed` 응답을 반환하도록 복원. Redis Sorted Set과 MariaDB 대기 이력은 유지해 프론트의 멤버십 안내 또는 멤버십 가입 유도 알럿이 표시되도록 변경
- **[README.md]**: 조기 마감 시 standby 데이터 보존과 마감 안내 응답 정책 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 시뮬레이터에서 단계2 조기 마감 후 대기열 페이지가 마감 알럿을 표시하지 않고 계속 대기 상태로 남음
- **원인(Cause):** 기존 standby 사용자의 조기 마감 후 `/queue/enter` 재요청을 `standby` 응답으로만 반환해 프론트의 `showClosedUI()` 호출 조건인 `status: 'closed'`가 충족되지 않음
- **해결(Solution):** standby 존재 여부는 유지한 채 티켓팅 상태가 `closed`이면 `status: 'closed'`, `type: 'standby'`, `preserveStandby: true`를 반환. 프론트는 해당 응답으로 멤버십 상태에 따른 안내 알럿을 표시하고, standby 이탈 처리로 `LEFT` 변경을 하지 않음

## [2026-09-17 11:28] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/queueService.js]**: 본 티켓팅 대기열에서 멤버십 score 보정을 제거하고 Redis `INCR` 기반 완전 선착순으로 변경. 본 대기열 참여 표식과 MariaDB 이력을 기록하며, 참여 이력이 없는 활성 멤버십 사용자의 `/cancel-queue/join` 직접 진입을 `main_queue_required`로 차단
- **[src/routes/queueRoutes.js]**: 대기열 이탈 시 본 티켓팅 참여 표식을 제거하고 관련 대기 이력을 `LEFT`로 갱신해 이탈 사용자가 취소표 대기 자격을 유지하지 않도록 변경
- **[src/services/seatService.js]**: 본 티켓팅 오픈 중 환불은 B파트 SQS 이벤트를 발행하지 않고 다음 본 대기열 참여자를 재충원하도록 변경. 마감 후 환불만 B파트 취소표 이벤트로 전달하며, 마감 상태에서 환불해도 신규 본 티켓팅이 다시 열리지 않도록 보완
- **[src/routes/cancelQueueRoutes.js]**: 취소표 상태 조회와 마이페이지 목록도 본 티켓팅 참여 이력이 없는 사용자를 제외하도록 검증 범위를 확장
- **[src/routes/simulationRoutes.js]**: 로컬 취소표 시뮬레이션 정리 시 본 티켓팅 참여 표식도 함께 삭제
- **[README.md]**: 본 티켓팅 FIFO, 취소표 직접 진입 조건, 오픈 중 재충원과 마감 후 B파트 연동 정책 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 멤버십만 가입한 사용자가 본 티켓팅 대기열을 거치지 않고 취소표 대기열에 직접 들어갈 수 있었고, 오픈 중 환불 좌석이 B파트 취소표 흐름으로만 발행되어 본 대기열 후순위 사용자에게 재충원되지 않음
- **원인(Cause):** `enterStandby()`가 활성 멤버십만 확인했으며 본 대기열 참여 여부를 확인하지 않았음. `enter()`는 멤버십 등급별 score 보정을 사용했고, `cancelSeat()`는 티켓팅 마감 여부와 관계없이 취소 이벤트를 B파트로 발행했음
- **해결(Solution):** 회차별 `queue:main-participants` 표식과 `waiting_queue` 참여 이력을 함께 확인하도록 게이트를 추가하고, score는 Redis `INCR` 원값을 사용하도록 변경. 오픈 중에는 빈 입장 슬롯을 본 대기열 참여자에게만 일반 Admission Token으로 재충원하고, `closed` 상태에서만 B파트 취소표 이벤트를 발행하도록 분리

## [2026-09-17 01:13] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: 기존 B파트 SQS 시뮬레이션과 분리된 `/admin/local-simulation/*` 라우트를 추가하고, 단계4에서 활성 멤버십 대기자에게 5분 제한 A파트 Secret Link를 Gmail SMTP로 발송하도록 구현
- **[src/app.js]**: 시뮬레이션 라우트를 B 모드와 Local 모드로 각각 등록하고 더미 유저 관리 라우트는 B 모드에서만 등록하도록 중복 라우트 충돌을 방지
- **[src/services/notificationService.js]**: SMTP 설정 여부를 확인하는 `isSmtpConfigured()`를 추가
- **[src/services/cancelAllocationService.js]**: Local SMTP 링크 발급에 사용할 `LINK_SENT` 취소표 할당 생성 함수 추가
- **[src/routes/cancelQueueRoutes.js]**: B 콜백이 설정되어 있어도 A파트가 발급한 로컬 Secret Link JWT를 먼저 검증하도록 보완
- **[src/services/queueService.js]**: 실제 사용자가 취소표 대기열에 진입할 때 B/Local 시뮬레이션별 추적 Set에 사용자 ID 기록
- **[README.md]**: Local SMTP 시뮬레이션 API, Redis 키, 환경변수 및 단계 흐름 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** B파트 콜백 설정이 있는 온프레미스 API에서 Local SMTP 시뮬레이션 링크를 열면 A파트가 발급한 토큰도 B파트 검증으로 전달될 수 있었고, 시뮬레이션 플러그인을 두 번 등록하면 더미 유저 라우트가 중복될 수 있었음
- **원인(Cause):** `/verify-link`가 B 콜백 설정 여부만 먼저 판단했고, B/Local 라우트 등록 시 공통 더미 라우트를 모드 구분 없이 등록함
- **해결(Solution):** A JWT를 먼저 검증하고 실패한 경우에만 B 콜백으로 위임하도록 순서를 조정했으며, 더미 유저 라우트는 B 모드에서만 등록하도록 조건을 추가

## [2026-09-17 09:42] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: Local SMTP 단계4가 준비된 취소 좌석과 활성 멤버십 standby 대기자를 순서대로 1:1 매칭해 사용자별 Secret Link를 발송하도록 변경. 유효한 기존 할당은 재발송하지 않고 만료 할당만 재사용
- **[README.md]**: Local SMTP 단계4의 다중 좌석·다중 대기자 발급 정책을 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 단계4에서 여러 취소표가 준비되어도 첫 번째 멤버십 대기자에게만 메일이 발송되었고, 이메일 링크 진입 시 `오류 발생` 화면이 표시됨
- **원인(Cause):** Local SMTP 발급 코드가 `preparedEvents.find()`와 `memberStandbyRows[0]`만 사용해 한 건만 처리했으며, 프론트의 `POST /verify-link` 경로가 Vite 개발 프록시에서 A파트 API로 전달되지 않음
- **해결(Solution):** 준비 좌석·활성 멤버십 대기자를 순서대로 반복 처리하고 중복 발급 방지 이력을 추가했으며, Vite에 `/verify-link` API 프록시를 등록

## [2026-09-17 00:13] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/queueService.js]**: `getPosition()`과 `getStats()`의 취소표 인원·순번을 활성 멤버십 대기자 기준으로 적용
- **[src/services/queueService.js]**: 활성 멤버십 확인 없이 standby에 들어갈 수 있던 경로를 차단하고 `membership_required` 응답 추가
- **[src/routes/cancelQueueRoutes.js]**: `/cancel-queue/status`도 비멤버십 사용자의 취소표 상태 조회를 차단하고 `/mine`은 멤버십 대기자 수만 반환

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 취소표 서비스가 멤버십 전용이어도 비회원의 기존·신규 standby 접근이 가능하고, Redis에 남은 비회원이 전체 대기자 수에 포함될 수 있었음
- **원인(Cause):** `enterStandby()`에 활성 멤버십 진입 검사가 없었고, 상세 상태와 마이페이지가 Redis Sorted Set 전체를 대기자 기준으로 사용함
- **해결(Solution):** 활성 `memberships`와 `waiting_queue`를 조인해 현재 회차의 회원만 순번·전체 인원으로 집계하며, 비회원의 join/status/mine 접근을 제한

## [2026-09-17 00:12] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/queueService.js]**: standby 순번·전체 대기자 계산에서 Redis 전체 수 fallback을 제거하고 MariaDB 활성 멤버십 대기자 기준으로 유지
- **[src/routes/cancelQueueRoutes.js]**: 마이페이지 대기열 수치도 멤버십 집계 실패 시 비회원이 섞인 Redis 수치를 표시하지 않도록 수정
- **[README.md]**: 대기자 수의 MariaDB 기준을 명확히 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** Redis standby Sorted Set에 과거 테스트 비회원이 남아 있으면 전체 대기자 수와 순번에 포함될 수 있었음
- **원인(Cause):** 멤버십 집계 DB 조회가 실패할 때 Redis `zcard`·`zrank` 결과를 그대로 fallback으로 사용함
- **해결(Solution):** 멤버십 기준 조회가 실패한 경우에도 Redis 전체 standby 수를 노출하지 않고, DB `queue_index` 또는 미확인 수치만 유지하도록 변경

## [2026-09-17 00:07] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/queueService.js]**: 취소표 standby 진입을 활성 멤버십 회원으로 제한하고, 가입 시 멤버십 플래그를 정확히 저장
- **[src/services/queueService.js]**: 취소표 순번·전체 대기자·관리자 standby 통계를 MariaDB의 활성 멤버십 대기자 기준으로 계산
- **[src/routes/cancelQueueRoutes.js]**: `/cancel-queue/mine`과 `/cancel-queue/status`에서 비멤버십 사용자의 취소표 대기열 조회를 차단
- **[README.md]**: 멤버십 전용 정책과 멤버십 대기자 집계 기준 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 취소표 대기열의 전체 인원과 순번에 시뮬레이션 비회원 또는 과거 테스트 사용자가 포함될 수 있었음
- **원인(Cause):** Redis `standby` Sorted Set을 그대로 `zrank`·`zcard`하여 멤버십 가입 여부를 검증하지 않았고, `enterStandby()`도 비회원 진입을 차단하지 않았음
- **해결(Solution):** 취소표 진입 전에 활성 멤버십을 확인하고, `waiting_queue`와 활성 `memberships`를 조인해 멤버십 대기자만 순번·전체 인원으로 계산. 마이페이지 API도 비멤버십 사용자에게 빈 목록을 반환하도록 수정

## [2026-09-16 23:44] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/cancelQueueRoutes.js]**: `/cancel-queue/mine`을 `waiting_queue` 핵심 조회와 공연·취소표 할당 부가 조회로 분리
- **[src/routes/cancelQueueRoutes.js]**: DB 조회 단계별 오류를 기록하고 핵심 대기열 조회 실패 시에만 `503 cancel_queue_unavailable`을 반환하도록 보완

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 실제 DB의 `waiting_queue`에 `standby`·`WAITING` 행이 있어도 `/cancel-queue/mine`이 500을 반환하여 마이페이지가 빈 목록을 표시함
- **원인(Cause):** `waiting_queue`, `events`, `cancel_allocations`를 한 번의 `LEFT JOIN`으로 묶어 부가 테이블의 컬럼·스키마 차이 하나가 전체 조회 실패로 전파될 수 있었음
- **해결(Solution):** 공통 컬럼만 사용하는 `waiting_queue` 조회를 먼저 실행하고, 공연·할당 정보는 각각 보조 조회로 처리한다. 보조 조회 실패 시에도 대기열 행과 이벤트 ID를 반환하며, 핵심 DB 오류만 단계 로그와 함께 503으로 반환한다.

## [2026-09-16 23:21] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/cancelQueueRoutes.js]**: `/cancel-queue/mine` 조회에서 환경별로 존재하지 않을 수 있는 `queue_status` 의존을 제거하고 `waiting_queue.status` 기준으로 조회하도록 수정

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 브라우저에서 `GET /cancel-queue/mine`이 HTTP 500을 반환함
- **원인(Cause):** API가 연결된 DB의 `waiting_queue` 스키마와 코드가 참조한 컬럼 구성이 달라 `queue_status` 조회 SQL이 실패할 수 있었음
- **해결(Solution):** 모든 환경에서 공통으로 확인되는 `status = 'WAITING'` 조건으로 대기열을 조회하고, 조기마감 시뮬레이션의 기존 행 복구만 `queue_status` 컬럼 유무에 따라 fallback 처리

## [2026-09-16 23:09] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: 조기마감 시뮬레이션에서 기존 standby 행을 상태와 무관하게 찾고, `LEFT`로 남은 행도 `WAITING`으로 복구하도록 수정. 실제 DB의 `queue_id`와 회차 정보를 유지하면서 대기순번을 갱신한다.
- **[src/routes/cancelQueueRoutes.js]**: DB 환경별 `waiting_queue` 스키마 차이로 500이 발생하지 않도록 `/cancel-queue/mine`의 핵심 조회는 공통 컬럼인 `status`를 사용하도록 정리했다.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 조기마감 시뮬레이션 화면에는 실제 사용자가 standby 1번으로 보이지만, 마이페이지 취소표 대기열은 빈 화면으로 표시됨.
- **원인(Cause):** MariaDB 행이 존재해도 `status = 'LEFT'`이면 `/cancel-queue/mine`의 `WAITING` 조건에서 제외되었고, 이전 테스트의 `LEFT` 행을 조기마감 재실행 시 활성 대기 행으로 복구하지 않았음.
- **해결(Solution):** 조기마감 시 기존 회차 standby 행을 `status = 'WAITING'`으로 복구하고, 마이페이지 조회 SQL은 실제 공통 스키마에 존재하는 `status`만 사용하도록 변경했다. `queue_status`가 있는 DB에서는 시뮬레이션 복구 시 함께 갱신하되, 해당 컬럼이 없는 DB도 fallback UPDATE로 처리한다.

## [2026-09-16 22:52] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: 시뮬레이션 입력값이 이메일이어도 `users.user_id`를 찾아 `waiting_queue`·Redis·멤버십 조회에 동일한 사용자 식별자를 사용하도록 보완
- **[src/routes/cancelQueueRoutes.js]**: `/cancel-queue/mine`이 로그인 ID와 users 테이블의 이메일을 연결해 실제 `waiting_queue` 대기 행을 조회하도록 보완하고, 기존 Redis 멤버 ID도 순번 보정에 사용
- **[README.md]**: 시뮬레이션 실제 사용자 식별자와 마이페이지 대기열 조회 기준을 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 조기 마감이 완료되어도 실제 사용자 마이페이지의 취소표 대기열이 빈 목록으로 표시됨
- **원인(Cause):** 시뮬레이션 관리자가 입력한 이메일과 로그인 JWT의 `userId`가 다르면 `waiting_queue.user_id`와 마이페이지 조회 조건이 일치하지 않을 수 있었고, `/events` 지연 시 프론트가 API가 반환한 대기 행까지 숨길 수 있었음
- **해결(Solution):** 초기화 시 users의 `user_id`를 해석해 시뮬레이션 상태에 저장하고, 마이페이지 API가 ID·이메일 후보를 함께 조회하도록 변경. 프론트는 공연 목록이 늦어도 서버 대기 행의 공연명 fallback으로 표시

## [2026-09-16 22:10] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: 취소표 시뮬레이션 단계 4에서 실제 `waiting_queue` 기본키인 `queue_id`를 조회하고 정렬하도록 수정
- **[src/routes/cancelQueueRoutes.js]**: 취소표 대기 목록 조회와 응답 매핑에서 `w.id`·`row.id` 대신 `w.queue_id`·`row.queue_id`를 사용하도록 수정
- **[src/services/dbService.js]**: 신규 `waiting_queue` 테이블 정의를 `queue_id` 기본키와 `membership_at_join` 컬럼 기준으로 실제 DB 스키마와 정렬

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 어드민 취소표 시뮬레이션 단계 4 또는 취소표 대기 목록 조회 시 `Unknown column 'id' in 'field list'` 오류가 발생할 수 있음
- **원인(Cause):** 실제 MariaDB `waiting_queue` 테이블의 자동 증가 기본키는 `queue_id`인데 일부 SQL이 존재하지 않는 `id` 컬럼을 참조함
- **해결(Solution):** `SELECT queue_id`, `ORDER BY queue_id DESC`, `w.queue_id`, `row.queue_id`로 관련 SQL과 반환 매핑을 통일. 신규 테이블 정의도 동일한 PK를 사용하도록 수정

## [2026-09-16 21:46] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/dbService.js]**: 실제 MariaDB `reservations` 스키마의 기본키인 `reservation_id`에 맞춰 예약 목록 조회, 최신 예약 정렬, 소유권 확인, 환불 UPDATE, 멱등 응답 및 로그의 컬럼 참조를 모두 통일
- **[src/services/dbService.js]**: 신규 DB 생성용 `reservations` 정의도 `reservation_id`, `reservation_status`, `payment_method` 구조로 실제 운영 스키마와 일치시킴

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 마이페이지에서 환불 시 `Unknown column 'id' in 'field list'` 오류가 발생하여 환불 처리가 실패함
- **원인(Cause):** 실제 테이블의 PK는 `reservation_id`인데 `SELECT id`, `ORDER BY id`, `WHERE id = ?`와 `active.id`·`previous.id` 참조가 남아 있었음. `toItem()`만 먼저 수정되어 SQL과 응답 변환 로직이 서로 다른 컬럼명을 사용하고 있었음
- **해결(Solution):** 모든 예약 SQL을 `reservation_id` 기준으로 변경하고, 반환 객체에서는 `reservationId`로 변환하도록 통일. 환불 트랜잭션과 동일 예약 재요청의 멱등 처리도 같은 PK를 사용하도록 수정

## [2026-09-16 17:52] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/dbService.js]**: `saveReservation()`이 MariaDB INSERT 결과의 `insertId`를 `reservationId`로 반환하도록 유지하고, `cancelReservation()`의 활성 예약 상태 목록을 `CONFIRMED`, `RESERVED`, `PAID`로 통합
- **[src/services/seatService.js]**: 환불은 MariaDB 트랜잭션 성공을 기준으로 확정하고 Redis는 후속 캐시 동기화 대상으로 처리. Redis 응답 지연·키 누락이 DB 환불 성공을 실패로 되돌리지 않도록 유지

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 프론트엔드가 예약 자료를 늦게 받거나 오래된 좌석 ID를 사용하면 마이페이지 환불 요청이 실패하거나 환불 상태와 DB 상태가 달라질 수 있었음
- **원인(Cause):** 확정 예약 상태가 데이터 버전에 따라 달랐고, 환불 요청이 Redis 좌석 상태에 의존하면 캐시 지연·누락의 영향을 받음
- **해결(Solution):** MariaDB에서 현재 소유자의 활성 예약을 행 잠금으로 확인하고 예약과 좌석을 같은 트랜잭션에서 취소한다. 동일 환불 재요청은 `idempotent: true` 성공으로 반환해 프론트엔드 재시도와 중복 이메일·재판매 이벤트를 안전하게 처리

## [2026-09-16 17:44] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/dbService.js]**: 환불 대상 확정 예약 상태에 `CONFIRMED`뿐 아니라 기존 데이터에서 사용될 수 있는 `RESERVED`, `PAID`도 포함. 신규 예약 INSERT 결과의 `reservationId`도 반환
- **[README.md]**: 환불 가능한 예약 상태와 DB 우선 처리 기준을 문서에 반영

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 결제 완료 내역이 존재해도 과거 상태값으로 저장된 예약은 마이페이지 환불 요청이 `취소 가능한 확정 예약을 찾을 수 없습니다.`로 거절될 수 있음
- **원인(Cause):** 환불 SQL이 `reservations.status = 'CONFIRMED'` 하나만 조회했음
- **해결(Solution):** `CONFIRMED`, `RESERVED`, `PAID`를 활성 예약 상태로 취급하여 MariaDB 트랜잭션에서 동일하게 소유권 검증·취소 처리

---

## [2026-09-16 17:32] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/dbService.js]**: 환불 시 MariaDB의 최신 `CONFIRMED` 예약을 행 잠금으로 조회하고, 예약 `CANCELLED` 변경과 좌석 `AVAILABLE` 복구를 단일 트랜잭션으로 처리하도록 `cancelReservation()`을 개편. 재시도된 동일 환불은 `idempotent: true`로 응답하고 예약 조회 응답에 `reservationId`를 포함
- **[src/services/seatService.js]**: `cancelSeat()`의 기준 데이터를 Redis 좌석 상태에서 MariaDB 예약으로 변경. Redis 조회도 DB 환불 완료 뒤로 이동하고 좌석·카운터·매진 플래그를 후속 동기화하며, Redis 키가 없으면 DB 좌석 메타데이터로 캐시를 재구성. Redis 장애 시에도 DB 환불 결과를 유지
- **[src/routes/seatRoutes.js]**: 멱등 환불 재시도에서는 취소·환불 안내 이메일을 중복 발송하지 않도록 처리
- **[README.md]**: MariaDB 우선 환불 흐름, 트랜잭션, 소유권 검증 및 멱등 처리 규칙을 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 마이페이지에서 관리자·일반 사용자 모두 예매 내역은 조회되지만 환불 요청이 `판매 완료 상태가 아닌 좌석입니다`로 거절될 수 있음
- **원인(Cause):** 기존 `cancelSeat()`이 MariaDB의 확정 예약을 조회하기 전에 Redis 좌석 해시의 `SOLD` 상태부터 검사하여, Redis 재시작·복구 지연·키 누락 시 정상 예약도 환불할 수 없었음. 또한 Redis를 먼저 변경해 DB 취소 실패 시 상태가 어긋날 위험이 있었음
- **해결(Solution):** MariaDB를 기준 데이터로 사용해 현재 확정 예약자 검증과 예약·좌석 상태 변경을 트랜잭션으로 먼저 완료한 뒤 Redis를 캐시로 동기화. 동일 요청은 멱등 성공으로 처리해 재판매 좌석 및 중복 알림을 보호

---

## [2026-09-16 15:40] 업데이트 로그 — 대기열 미구현 기능 완성 (timerService·seatService 연동)

### 🔄 변경 및 수정 사항
- **[timerService.js]**: seat hold 만료 시 `removeAdmitted()` + `backfillOne()` 호출 추가. 결제 시간 초과로 좌석이 해제될 때 해당 사용자를 admitted에서 제거하고 빈 슬롯을 eligible 대기열에서 즉시 재충원. 분산 락으로 동시성 보호
- **[seatService.js]**: `holdSeat()` 성공 시 `cancelAdmissionDeadline()` 호출 추가. 좌석 선점에 성공하면 입장 제한시간(7분)을 해제하고, 결제 시간 제한(seat timer)이 시간 관리를 이어받음
- **[README.md]**: timerService 만료 핸들러 동작 설명 갱신, seatService holdSeat/confirmSeat 함수 설명에 admitted 정리·backfill 흐름 반영

---

## [2026-09-16 14:45] 업데이트 로그 — Helm 대기열 환경변수 주입

### 🔄 변경 및 수정 사항
- **[redis-api-chart/values.yaml]**: admitted 풀 크기(`batchSize`)와 승인 만료 시간·점검 주기(`admissionTimeout`, `admissionTimeoutCheckIntervalMs`) 기본값 추가
- **[redis-api-chart/templates/deployment.yaml]**: `BATCH_SIZE`, `ADMISSION_TIMEOUT`, `ADMISSION_TIMEOUT_CHECK_INTERVAL_MS`를 API Pod에 전달
- **[redis-api-chart/Chart.yaml]**: Helm 템플릿 변경을 반영하여 차트 버전을 `2.2.1`로 증가. API 이미지 버전은 유지
- **[README.md / redis-api-chart/README.md]**: Helm 설정값과 런타임 환경변수 매핑 및 기본 정책 문서화

---

## [2026-09-15 17:42] 업데이트 로그 — /seats 인메모리 캐시 도입 (Redis 부하 감소)

### 🔄 변경 및 수정 사항
- **[src/services/seatService.js]**: `getAllSeats()` 결과를 Node.js 프로세스 메모리에 1.5초 TTL로 캐시. Redis 조회 로직을 `fetchAllSeats()` 내부 함수로 분리하고, `getAllSeats()`는 캐시 히트 시 Redis 왕복 없이 즉시 반환
- **[src/services/seatService.js]**: 좌석 상태 변경 함수(`initSeats`, `holdSeat`, `releaseSeat`, `confirmSeat`, `cancelSeat`, `cleanupEventSeats`, `recoverSeatsFromMariaDB`) 7곳에 `invalidateSeatsCache(eventId)` 호출 추가. 상태 변경 즉시 해당 이벤트의 캐시를 무효화하여 다음 조회 시 최신 데이터 반환 보장

---

## [2026-09-15 16:07] 업데이트 로그 — Prometheus 라벨 카디널리티 폭발 방지

### 🔄 변경 및 수정 사항
- **[src/app.js]**: `onResponse` 훅의 `httpRequestDuration` 메트릭 route 라벨을 `request.url`(실제 URL) → `request.routeOptions?.url || 'unknown'`(등록된 라우트 패턴)으로 변경. 봇 요청(`/1xmomo.php`, `/.env` 등)과 쿼리스트링이 고유 라벨로 무한 생성되는 카디널리티 폭발을 방지하여 Prometheus 메모리 사용량 안정화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 봇이 존재하지 않는 경로(`/1xmomo.php`, `/wp-login.php` 등)로 요청 시 각 경로가 `queuing_http_request_duration_seconds` 히스토그램의 고유 route 라벨로 생성되어 Prometheus 메모리가 지속 증가
- **원인(Cause):** `request.url`은 쿼리스트링 포함 실제 요청 URL을 그대로 반환하므로, 등록되지 않은 경로 + 파라미터 조합마다 새로운 시계열(time series)이 생성됨
- **해결(Solution):** Fastify v5의 `request.routeOptions.url`은 등록된 라우트 패턴(예: `/seats/:id`)을 반환하고, 매칭되지 않는 요청에는 `undefined`를 반환하므로 `'unknown'`으로 폴백 처리하여 라벨 수를 등록 라우트 수로 고정

---

## [2026-09-15 09:18] 업데이트 로그 — /seats 엔드포인트 성능 최적화 (SCAN 제거, 응답 경량화, 배치 사이즈)

### 🔄 변경 및 수정 사항
- **[src/services/seatService.js]**: `getAllSeats()` — Redis SCAN 루프(~24,569회/호출, 0.82초)를 SMEMBERS 단일 호출로 교체. 이벤트별 좌석 인덱스 Set(`seat:index:{eventId}`) 도입
- **[src/services/seatService.js]**: `getAllSeats()` — pipeline HGETALL → pipeline HMGET 변환. eventId 제외 필요 필드(status, heldBy, heldAt, section, price, sessionDate, sessionTime)만 조회
- **[src/services/seatService.js]**: `initSeats()` — 좌석 생성 시 `seat:index:{eventId}` Set에 좌석 키 일괄 등록 (SADD)
- **[src/services/seatService.js]**: `cleanupEventSeats()` — SCAN → SMEMBERS 전환, 인덱스 Set도 함께 삭제
- **[src/services/seatService.js]**: `recoverSeatsFromMariaDB()` — SCAN → SMEMBERS 전환, 복구 완료 후 인덱스 Set 재구성
- **[src/routes/seatRoutes.js]**: `GET /seats` — 응답에서 좌석별 중복 필드(eventId, sessionDate, sessionTime) 제거 → 최상위로 이동. 3,322석 기준 ~626KB → ~450KB 절감
- **[src/services/queueService.js]**: `BATCH_SIZE` 기본값 100 → 10 변경 (부하테스트용). 환경변수 `BATCH_SIZE`로 런타임 오버라이드 가능

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** `/seats` TTFB 1.0~1.8초 — Redis SCAN이 전체 키스페이스를 순회하며 0.82초 소비 (3,322석 이벤트 기준 ~24,569 SCAN 반복)
- **원인(Cause):** SCAN은 O(N) 전체 키 순회 + 패턴 매칭이므로 좌석 수와 무관하게 Redis 키스페이스 크기에 비례하여 느려짐. 응답 JSON도 좌석마다 동일한 eventId/sessionDate/sessionTime을 반복하여 626KB까지 팽창
- **해결(Solution):** 이벤트별 좌석 인덱스 Set(`seat:index:{eventId}`)을 도입하여 SMEMBERS O(N) 단일 호출로 교체. N은 해당 이벤트의 좌석 수(3,322)이므로 전체 키스페이스와 무관. HMGET으로 필요 필드만 조회하고, 응답에서 중복 필드를 최상위로 추출

---

## [2026-09-14 17:18] 업데이트 로그 — B파트 피드백 반영 (콜백 재시도 큐, 인증 헤더, 스코프 제한 세션)

### 🔄 변경 및 수정 사항
- **[src/services/bPartCallbackService.js]**: `B_CALLBACK_SECRET` 환경변수로 `X-Callback-Secret` 인증 헤더 추가. B파트와 공유 시크릿으로 요청 출처 검증
- **[src/services/bPartCallbackService.js]**: `saveCallbackToOutbox(action, payload)` 및 `relayCallbackOutbox()` 함수 추가 — 콜백 실패 시 로컬 DB 폴백 대신 `callback_outbox` 테이블에 저장 후 30초 주기 재시도
- **[src/routes/cancelQueueRoutes.js]**: `/respond`, `/expire` 콜백 실패 시 로컬 `markResponded`/`expireAllocation` 폴백을 제거하고, `saveCallbackToOutbox()`로 재시도 큐 저장 + 202 Accepted 반환
- **[src/services/authTokenService.js]**: `issueScopedCancelToken()` 함수 추가 — `cancel_link_session` 타입 JWT 발급. 만료는 allocation.expiresAt과 동기화
- **[src/services/authTokenService.js]**: `verifyAccessToken()`이 `cancel_link_session` 타입도 수용하도록 확장. scope/eventId/allocationId 정보를 반환
- **[src/middleware/auth.js]**: 스코프 제한 세션(`scope: cancel_queue`) 감지 시 `/cancel-queue/*`, `/verify-link`, `/seats/*` 경로만 허용하고 나머지 403 차단
- **[src/routes/cancelQueueRoutes.js]**: `/verify-link` 엔드포인트가 `accessToken` (스코프 제한 JWT)을 응답에 포함. 프론트엔드가 이 토큰으로 인증
- **[src/services/dbService.js]**: `callback_outbox` 테이블 추가 (action, payload, status, attempts, last_error, created_at, sent_at). 전체 테이블 수 10→11
- **[src/app.js]**: `relayCallbackOutbox` 30초 인터벌 워커 등록
- **[nginx/src/pages/verifyLink.js]**: 서버가 발급한 `data.accessToken`을 `login()` 세션에 저장 — 기존 빈 토큰 대신 스코프 제한 JWT 사용

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** B파트 콜백 실패 시 A파트가 로컬 DB를 직접 업데이트하면 Step Functions 상태와 DB 상태가 불일치(SFN은 대기 중인데 DB만 RESPONDED) → 다음 순번 미배정 또는 좌석 중복 배정 가능
- **원인(Cause):** 콜백 실패 폴백이 "로컬 DB 직접 UPDATE"로 구현되어 있어 B파트 파이프라인이 상태 변화를 감지 못함
- **해결(Solution):** 폴백을 `callback_outbox` 테이블 저장으로 변경. 30초 주기 릴레이 워커가 최대 5회 재시도 후 FAILED 마킹. 클라이언트에는 202 Accepted 반환

- **증상(Issue):** B_CALLBACK_BASE_URL만 알면 인증 없이 타인의 할당을 complete/expire 처리 가능
- **원인(Cause):** 콜백 API에 인증 메커니즘 부재
- **해결(Solution):** `B_CALLBACK_SECRET` 공유 시크릿을 `X-Callback-Secret` 헤더로 전송. B파트에서 수신 시 검증 로직 추가 필요

- **증상(Issue):** /verify-link 간이 로그인으로 전체 계정 세션이 생성되어 링크 유출 시 계정 전체 접근 가능
- **원인(Cause):** 기존 `login()` 호출이 일반 로그인과 동일한 세션을 생성
- **해결(Solution):** `cancel_link_session` 타입의 스코프 제한 JWT 발급 (allocation 만료와 동기화). `authenticate` 미들웨어가 이 토큰의 접근 경로를 `/cancel-queue/*`, `/verify-link`, `/seats/*`로 제한

---

## [2026-09-14 16:36] 업데이트 로그 — B파트 재판매 파이프라인 연동 수정

### 🔄 변경 및 수정 사항
- **[src/services/cancelAllocationService.js]**: `createAllocation` 함수 및 `issueCancelLinkToken` import 제거 — 링크 발급 경로를 B파트 단일화
- **[src/services/cancelAllocationService.js]**: `markResponded`, `markExpired`를 `allocation_id` 기준 UPDATE로 변경 — `seat_id`가 NULL인 B파트 할당을 정상 처리
- **[src/services/cancelAllocationService.js]**: `expireAllOverdue`를 단일 UPDATE 쿼리로 변경 — 만료 대상이 아닌 최신 할당을 잘못 만료시키는 쿼리 버그 수정
- **[src/services/cancelAllocationService.js]**: `expireAllocation`에서 `seatId`가 null인 할당의 좌석 해제 분기 추가
- **[src/routes/cancelQueueRoutes.js]**: `/cancel-queue/hold`에서 `allocation.seatId`가 없는 경우(B파트가 좌석 미지정으로 발급) 사용자 좌석 선택 허용
- **[src/routes/cancelQueueRoutes.js]**: `/cancel-queue/respond`, `/cancel-queue/expire` — `B_CALLBACK_BASE_URL` 설정 시 B파트 콜백 API로 포워딩, 실패 시 로컬 폴백
- **[src/routes/cancelQueueRoutes.js]**: `POST /verify-link` 엔드포인트 신설 — cancelLinkToken JWT를 검증하고 할당 정보 + 선택 가능 좌석 반환
- **[src/services/cancellationEventPublisher.js]**: SQS 페이로드에 `reservation_id`, `dedup_key` 필드 추가
- **[src/services/cancellationEventPublisher.js]**: SQS 발행 실패 시 `cancellation_outbox` 테이블에 저장하는 outbox 패턴 구현 + 30초 주기 릴레이
- **[src/services/dbService.js]**: `cancellation_outbox` 테이블 신규 생성 (event_payload JSON, attempts, last_error)
- **[src/services/dbService.js]**: `cancelReservation`이 취소된 예약의 `reservation_id`를 반환하도록 변경
- **[src/services/seatService.js]**: `publishCancellationEvent` 호출 시 `reservationId` 전달
- **[src/services/bPartCallbackService.js]**: B파트 Step Functions 콜백 서비스 신규 생성 (`callbackComplete`, `callbackExpire`)
- **[src/config/mariadb.js]**: 커넥션 타임존을 `'+00:00'`으로 변경 + `initSql`로 세션 `time_zone` 명시. B파트 PyMySQL과 UTC 통일
- **[src/app.js]**: outbox 릴레이 워커 30초 주기 등록
- **[redis-api-chart/values.yaml]**: `env.cancellationEventsQueueUrl`, `env.bCallbackBaseUrl` 추가
- **[redis-api-chart/templates/deployment.yaml]**: `CANCELLATION_EVENTS_QUEUE_URL`, `B_CALLBACK_BASE_URL` 환경변수 조건부 주입
- **[.env / .env.example]**: `B_CALLBACK_BASE_URL`, `CANCELLATION_EVENTS_QUEUE_URL` 환경변수 추가

### 프론트엔드 변경
- **[nginx/src/pages/verifyLink.js]**: 이메일 Secret Link 착지 페이지 신규 생성 — 토큰 기반 비로그인 진입 허용
- **[nginx/src/pages/privateLink.js]**: 비로그인 접근 허용, 타이머 바를 서버 응답 `remainingSeconds` 기준으로 변경 (5분 하드코딩 제거), `seatId` null일 때 "선택 가능" 표시
- **[nginx/src/main.js]**: `/verify-link` 라우트 등록

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** B파트가 `seat_id = NULL`로 만든 할당 행에 대해 `/cancel-queue/hold`가 무조건 409 반환, `markResponded`/`markExpired`도 SQL `NULL = ?` 불일치로 매칭 실패
- **원인(Cause):** 모든 쿼리가 `WHERE seat_id = ?` 조건을 사용하여 NULL과 비교 시 false. `ORDER BY created_at DESC LIMIT 1`이 만료 대상이 아닌 최신 행을 잡을 수 있었음
- **해결(Solution):** `allocation_id` 기반 UPDATE로 전환. `/hold`에서 `allocation.seatId`가 없으면 사용자 선택 좌석 허용

- **증상(Issue):** SQS 발행 실패 시 취소 이벤트가 영구 유실되어 B파트가 해당 좌석 재판매를 인지하지 못함
- **원인(Cause):** `publishCancellationEvent`가 fire-and-forget 구조로, 예외 발생 시 catch에서 로그만 남기고 이벤트 소실
- **해결(Solution):** outbox 패턴 도입 — 발행 실패 시 `cancellation_outbox` 테이블에 저장, 30초 주기 릴레이 워커가 최대 3회 재시도

## [2026-09-14 12:53] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/metricsService.js]**: `/metrics` 요청에서 `seat:*` 전체 `SCAN`과 좌석별 순차 `HGET`을 제거하고, `seat:metrics:aggregate` 해시를 읽어 좌석 Gauge를 갱신하도록 변경
- **[src/services/metricsService.js]**: 구버전 Redis 호환을 위해 서버 시작 시 전역 집계 키가 없을 때만 기존 `seat:counter:*` 카운터를 pipeline으로 1회 이관하는 초기화 로직 추가
- **[src/services/seatService.js]**: 좌석 생성·선점·해제·확정·취소·복구·이벤트 삭제 시 회차별 카운터와 전역 좌석 집계 카운터를 함께 `HINCRBY`로 갱신
- **[src/app.js]**: 서버 기동 과정에서 좌석 전역 집계 초기화를 호출하되, 메트릭 초기화 실패가 API 기동을 막지 않도록 오류를 격리
- **[README.MD]**: Prometheus 메트릭 집계 방식과 정합성 보정 방법 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** `/metrics` 요청마다 약 8.3만 개의 좌석 키를 `SCAN`하고 각 키에 `HGET`을 순차 실행해 45~100초가 걸림. Prometheus scrape timeout으로 요청이 누적되고 API 파드와 공용 ElastiCache 부하가 증가함
- **원인(Cause):** 좌석 상태 변경 시 저장하던 카운터를 사용하지 않고, Prometheus 요청 경로에서 좌석 전체를 다시 집계함
- **해결(Solution):** 좌석 상태 변경 지점에서 전역 `seat:metrics:aggregate` 해시를 원자적으로 갱신하고 `/metrics`는 `HGETALL` 1회로 저장된 값을 반환하도록 변경. 기존 데이터는 서버 시작 시 회차별 카운터를 pipeline으로 이관

## [2026-09-14 11:00] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[redis-api-chart/templates/servicemonitor.yaml]**: Prometheus Operator ServiceMonitor CRD 템플릿 신규 생성. `metrics.serviceMonitor.enabled: true`일 때 Prometheus가 자동으로 API 서비스를 스크래핑 대상으로 등록
- **[redis-api-chart/values.yaml]**: `metrics` 섹션 추가 — `/metrics` 경로, ServiceMonitor interval/scrapeTimeout/labels 설정 가능. `metrics.enabled: true`이면 Pod/Service에 Prometheus 어노테이션 자동 주입
- **[redis-api-chart/templates/deployment.yaml]**: `metrics.enabled` 조건부로 Pod에 `prometheus.io/scrape`, `prometheus.io/port`, `prometheus.io/path` 어노테이션 자동 추가
- **[redis-api-chart/templates/service.yaml]**: Service metadata에 동일한 Prometheus 어노테이션 추가 (annotation 기반 디스커버리 지원)

## [2026-09-11 17:54] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/seatRoutes.js]**: `/seats/confirm` 요청의 `paymentMethod`를 받아 무통장 입금(`vbank`/`bank_transfer`)이면 24시간 이내 입금 확인이 필요하다는 접수 안내 메일을 발송하고, 카드·간편결제는 기존 확정 메일을 유지
- **[README.MD]**: 결제 수단별 메일 발송 규칙과 무통장 입금 안내 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 무통장 입금 예매도 일반 결제와 동일한 “예매 완료” 메일이 발송되어 입금 기한과 좌석 확정 조건을 알 수 없었음
- **원인(Cause):** 백엔드가 결제 수단을 받지 않고 모든 `/seats/confirm` 요청에 동일한 메일 템플릿을 사용함
- **해결(Solution):** 프론트엔드가 `paymentMethod`를 전달하고, API가 무통장 입금 요청을 별도 템플릿으로 분기해 “예매 접수 시각부터 24시간 이내 입금 확인 필요”를 안내하도록 수정

## [2026-09-11 17:11] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/authService.js]**: 모니터링 bootstrap 계정 생성 로직 제거. 기존 DB의 `monitor` 역할 계정도 로그인할 수 없도록 차단
- **[src/routes/authRoutes.js]**: 공개 회원가입에서 관리자·모니터링 역할을 지정할 수 없고 항상 일반 사용자로 생성되도록 수정
- **[.env.example]**: `MONITOR_BOOTSTRAP_USER/PASSWORD` 제거
- **[README.MD]**: 모니터링 계정 관련 환경변수와 설명 제거

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 사용하지 않는 모니터링 계정이 bootstrap 환경변수와 로그인 경로에 남아 있었음
- **원인(Cause):** `initUsersTable()`이 관리자와 모니터링 계정을 함께 초기화하고, 인증 응답이 모니터링 역할을 허용하고 있었음
- **해결(Solution):** 모니터링 계정 자동 생성과 로그인 경로를 제거하고, 기존 레거시 계정은 로그인 거부하도록 변경

## [2026-09-11 16:55] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/dbService.js]**: 기존 테이블의 누락 컬럼을 자동으로 추가·변경하던 `addColumns()`·`modifyColumns()` 함수와 모든 호출 제거
- **[README.MD]**: `initTable()`은 테이블이 없을 때만 생성하며 기존 테이블 스키마는 변경하지 않는다는 운영 원칙 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** API 시작 시 DB 스키마를 코드가 임의로 변경하거나, 컬럼 오류를 내부에서 무시해 실제 스키마 불일치가 늦게 발견될 수 있음
- **원인(Cause):** `dbService.js`가 서버 시작 때 `ALTER TABLE ... ADD COLUMN` 및 `MODIFY COLUMN`을 시도하고 오류를 무시했음
- **해결(Solution):** 자동 컬럼 추가·변경 로직을 삭제하고 테이블 생성(`CREATE TABLE IF NOT EXISTS`)만 유지함. 컬럼이 필요한 경우 DB 관리자가 명시적으로 마이그레이션하도록 변경

## [2026-09-11 16:44] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/cancellationEventPublisher.js]**: `queuing-cancellation-events` SQS 큐로 `event_id`, `seat_id`, `status`, `timestamp`, `user_id`를 발행하는 B파트 연동 모듈 추가
- **[src/services/seatService.js]**: `cancelSeat()`의 A파트 직접 `allocateNextForSeat()` 호출 제거. 예약 취소 후 SQS 이벤트만 발행하도록 변경하고, `releaseSeat()`의 standby 직접 승격 제거
- **[src/services/timerService.js]**: 선점 만료 시 standby 승격·Secret Link 발급·할당 기록을 제거하고 좌석 해제만 수행
- **[src/services/cancelAllocationService.js]**: 할당 만료 후 다음 사용자 직접 재배정 로직과 `allocateNextForSeat()` 제거
- **[src/routes/cancelQueueRoutes.js]**: 과거 수동 배정 엔드포인트를 HTTP 410으로 비활성화해 A파트 이중 배정 방지
- **[src/routes/simulationRoutes.js]**: 시뮬레이션 취소 시 직접 승격 대신 SQS 이벤트를 발행하고 수동 링크 발급 엔드포인트 비활성화
- **[package.json]**: SQS 발행을 위한 `@aws-sdk/client-sqs` 의존성 추가
- **[.env.example]**: B파트 SQS 큐 URL 환경변수 예시 추가
- **[README.MD]**: B파트 위임 구조, SQS 환경변수, 비활성화된 엔드포인트 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 좌석 취소·선점 만료 시 A파트와 B파트가 동시에 다음 대기자를 처리할 수 있음
- **원인(Cause):** `seatService.js`, `timerService.js`, `cancelAllocationService.js`, 시뮬레이션 라우트에 A파트의 standby 승격 및 Secret Link 직접 발급 경로가 남아 있었음
- **해결(Solution):** A파트는 좌석 상태/예약 취소를 처리한 뒤 SQS 이벤트만 발행하고, 다음 사용자 선택·링크 발급은 B파트 Step Functions + Lambda의 단일 책임으로 정리함

## [2026-09-11 14:53] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/queueService.js]**: eligible 및 standby 승인 시 Admission Token을 먼저 발급·저장한 뒤 Redis `admitted` 집합에 등록하도록 순서를 변경. 승인 직후 토큰이 아직 없는 순간에 `/queue/enter`가 사용자를 `RE_QUEUED`로 되돌리는 경쟁 상태를 방지하고, 이미 승인됐지만 토큰이 없는 요청에는 재대기 대신 토큰 재발급을 시도하도록 수정
- **[src/services/queueService.js]**: 승인 상태를 MariaDB의 `status`와 `queue_status`에 함께 기록해 두 상태 컬럼의 불일치를 완화
- **[README.md]**: Admission Token 발급 순서와 토큰 미준비 상태 처리 방식을 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 대기열 사용자가 DB에서 `ADMITTED`로 바뀐 뒤에도 화면에 남고, 일부 요청에서 `RE_QUEUED`가 반복됨
- **원인(Cause):** Redis `admitted` 등록이 Admission Token 저장보다 먼저 실행되어, 프론트가 토큰 발급 전 승인 상태를 관찰할 수 있었음
- **해결(Solution):** 모든 승인 대상의 토큰을 먼저 저장한 후 `zrem`·`sadd`를 실행하고, 승인 상태에서 토큰이 누락된 경우 사용자를 제거하지 않고 토큰을 재발급하도록 변경

## [2026-09-11 10:32] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: 취소표 발급 이메일의 링크를 삭제된 독립 페이지 대신 `SITE_URL/#/mypage/cancel-queue?eventId=...`로 변경하고 URL에 `linkToken`·사용자 ID·할당 ID를 포함하지 않도록 수정
- **[README.MD]**: 시뮬레이션 발급 이메일과 취소표 인증 흐름을 로그인 기반 마이페이지 경로에 맞춰 갱신

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 독립 취소표 페이지를 제거하면 기존 시크릿 링크 이메일이 존재하지 않는 HTML을 가리키게 됨
- **원인(Cause):** 이메일 템플릿이 `/cancel-ticketing.html`과 URL의 만료형 `linkToken`을 직접 사용하고 있었음
- **해결(Solution):** 이메일은 `SITE_URL/#/mypage/cancel-queue?eventId=...`로 이동시키고, 실제 사용자·할당 검증은 로그인 Access JWT를 사용하는 기존 서버 API에 위임했다.

## [2026-09-10 12:58] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/admissionWorker.js]**: MariaDB의 회차별 `eligible`·`WAITING` 대기열을 주기적으로 조회하고 Redis 대기 순서 상위 `BATCH_SIZE`명을 자동 승인하는 워커 추가. 승인 시 Admission Token 발급 및 MariaDB 상태 동기화. `JWT_SECRET` 미설정 시 상태를 변경하지 않고 사이클을 건너뛰도록 보호
- **[src/app.js]**: 서버 시작·종료 과정에 자동 승인 워커 시작/정리 연결
- **[.env]**: 온프레미스 테스트용 `AUTO_ADMISSION_ENABLED=true`, `AUTO_ADMISSION_INTERVAL_MS=1000` 설정 추가
- **[.env.example]**: 자동 승인 워커 설정 예시 추가. 기본값은 `false`
- **[redis-api-chart/values.yaml]**: Kubernetes에서 자동 승인 워커 활성화 여부와 실행 주기 설정 추가
- **[redis-api-chart/templates/deployment.yaml]**: `AUTO_ADMISSION_ENABLED`, `AUTO_ADMISSION_INTERVAL_MS` 환경변수 주입 추가
- **[redis-api-chart/Chart.yaml]**: 차트 버전을 `1.0.7`, API 이미지 기준 버전을 `1.0.9`로 갱신
- **[redis-api-chart/README.md]**: 자동 승인 워커 설정 및 배포 시 주의사항 문서화

---

## [2026-09-10 08:35] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[.env.example]**: `RECAPTCHA_V2_SECRET_KEY` 환경변수 항목 추가. v3 점수 미달 시 v2 체크박스 폴백 검증에 사용

---

## [2026-09-09 22:45] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: 더미 유저 · HOT 공연 관리 API 3개 추가
  - `POST /admin/dummy/create-users` — 지정 수만큼 더미 유저(`sim-user-XXXXXX@test.com`) 일괄 생성 (INSERT IGNORE, 2000건 배치)
  - `POST /admin/dummy/distribute-interests` — 더미 유저를 현재 등록된 공연 중 랜덤 N개(기본 5개)에 위시리스트로 분배. 기존 더미 위시리스트를 초기화 후 재분배하여 메인 페이지 "요즘 HOT 공연" 순위에 반영
  - `POST /admin/dummy/cleanup` — 더미 유저 및 위시리스트 일괄 삭제

---

## [2026-09-09 21:45] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/authService.js]**: `deleteAccount(userId, password)` 함수 추가 — 비밀번호 재확인 후 wishlists, waiting_queue, reservations, memberships, users 순서로 관련 데이터 정리 및 계정 삭제. admin 계정은 탈퇴 차단
- **[src/routes/authRoutes.js]**: `DELETE /auth/account` 라우트 추가 — userId + password 필수
- **[redis-api-chart/values.yaml]**: AWS SES용 `fromEmail`(`noreply@queuing.kr`), `siteUrl`(`https://www.queuing.kr`) 환경변수 추가
- **[redis-api-chart/templates/deployment.yaml]**: `FROM_EMAIL`, `SITE_URL` 환경변수를 파드에 조건부 주입하도록 수정

---

## [2026-09-09 19:20] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/timerService.js]**: `redis.config('SET', ...)` 호출을 try/catch로 감싸 ElastiCache 환경에서도 정상 기동되도록 수정

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** EKS 파드 CrashLoopBackOff — `ReplyError: ERR unknown command 'config'` (Exit Code 1)
- **원인(Cause):** AWS ElastiCache는 보안상 `CONFIG` 명령을 차단함. `timerService.js:44`의 `redis.config('SET', 'notify-keyspace-events', 'Ex')`가 `app.js:81 start()` 첫 줄에서 실행되어 프로세스 즉시 종료
- **해결(Solution):** try/catch로 감싸서 관리형 Redis에서는 경고 로그만 남기고 진행. `notify-keyspace-events=Ex`는 ElastiCache 파라미터 그룹(`queuing-redis7-params`)에 이미 설정되어 있으므로 앱이 직접 설정할 필요 없음. 온프레미스 Redis에서는 기존과 동일하게 동작

---

## [2026-09-08 21:55] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[terraform/]**: WAF 추가, Redis Multi-AZ 전환, RDS 제거, ALB ACM 자동발급.

  **1. WAF (신규 — waf.tf)**
  - `aws_wafv2_web_acl.cloudfront`: CloudFront 앞단 WAF (us-east-1에 생성).
  - 규칙 4개: CommonRuleSet(OWASP Top 10), SQLiRuleSet(SQL Injection), KnownBadInputs(Log4j 등), Rate Limiting(IP당 요청 제한).
  - `cloudfront.tf`에 `web_acl_id` 연동. `waf_enabled` 변수로 On/Off 가능.

  **2. Redis Multi-AZ (elasticache.tf 전면 재작성)**
  - `aws_elasticache_cluster` → `aws_elasticache_replication_group`으로 교체.
  - Primary(AZ-a) + Replica(AZ-c) 구성. 자동 페일오버(automatic_failover) 활성화.
  - AES-256 at-rest 암호화 추가. 일일 스냅샷 백업.
  - 변수: `redis_num_cache_nodes` → `redis_num_replicas` (기본값 1 = Multi-AZ).

  **3. RDS 제거 (rds.tf 비움)**
  - 외부 D-Cloud MariaDB 사용. AWS RDS 리소스 전체 제거.
  - `security.tf`: RDS Security Group(`aws_security_group.rds`) 제거.
  - `variables.tf`: db_instance_class, db_allocated_storage, db_name, db_username 제거. db_password만 유지(외부 DB용).
  - `outputs.tf`: rds_endpoint 제거.
  - `secrets.tf`: DB_PASSWORD 주석을 "외부 D-Cloud MariaDB"로 갱신.
  - API Pod → NAT Gateway → IGW → 외부 DB로 접속.

  **4. ALB ACM 자동발급 (alb.tf + route53.tf)**
  - `aws_acm_certificate.alb`: api.queuing.kr용 ACM 인증서 ap-northeast-2에서 자동 발급.
  - `aws_acm_certificate_validation.alb`: Route 53 DNS 검증 자동 완료 대기.
  - `route53.tf`: ALB ACM 검증용 CNAME 레코드 추가.
  - HTTPS 리스너: `acm_certificate_arn` 수동 변수 → `domain_name` 기반 자동 적용.
  - HTTP 리스너: `acm_certificate_arn` 조건 → `domain_name` 조건으로 변경.
  - `variables.tf`: `acm_certificate_arn` 변수 제거 (자동화로 불필요).
  - `terraform.tfvars.example`: RDS 제거, Redis Multi-AZ, WAF, ALB ACM 자동화 반영.

---

## [2026-09-08 15:15] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[terraform/]**: EC2 Auto Scaling Group → EKS + Managed Node Group 아키텍처 전환.
  - **eks.tf** (신규): EKS Cluster, OIDC Provider, EKS Addons(vpc-cni, coredns, kube-proxy), Managed Node Group, IAM Roles(Cluster/Node), Launch Template, ASG↔ALB 연결.
  - **ec2.tf**: EC2 ASG 리소스 제거 (eks.tf로 대체).
  - **user_data.sh.tpl**: 미사용 처리 (EKS 최적화 AMI가 kubelet/Docker 자동 설정).
  - **main.tf**: tls provider 추가 (OIDC 인증서 지문 조회용), 아키텍처 다이어그램 EKS로 갱신.
  - **alb.tf**: Target Group 포트를 3000 → NodePort(30084)로 변경. 헬스체크도 NodePort 경유.
  - **security.tf**: EC2 SG → EKS Worker Node SG로 전환. NodePort 범위(30000-32767) 허용, 노드 간 self-referencing 통신 추가.
  - **variables.tf**: EC2 변수 제거, EKS 변수 추가 (eks_cluster_version, eks_node_instance_type, eks_node_volume_size, k8s_nodeport).
  - **outputs.tf**: EC2 출력 → EKS 출력 (cluster name/endpoint, kubeconfig 명령어, node group, OIDC URL).
  - **terraform.tfvars.example**: EKS 설정 예시.

---

## [2026-09-08 14:45] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[terraform/]**: 프론트엔드 배포용 Terraform 추가 (S3 + CloudFront + Route 53 + ACM).
  - **s3.tf** (신규): S3 버킷 (퍼블릭 차단, 버전 관리, 암호화, OAC 버킷 정책).
  - **cloudfront.tf** (신규): ACM 인증서 (us-east-1 자동 발급/DNS 검증), OAC, CloudFront Distribution (SPA 에러 페이지, Gzip 압축, 캐싱).
  - **route53.tf** (신규): Hosted Zone, ACM 검증 레코드, 프론트엔드 A/AAAA (→CloudFront), API A/AAAA (→ALB).
  - **main.tf**: us-east-1 provider 별칭 추가 (CloudFront ACM 인증서용).
  - **variables.tf**: 프론트엔드 변수 추가 (frontend_bucket_name, frontend_subdomain, api_subdomain).
  - **outputs.tf**: 프론트엔드 출력 추가 (S3 버킷, CloudFront URL/ID, Route 53 NS, frontend_url, api_url).
  - **terraform.tfvars.example**: 프론트엔드/도메인 설정 예시 추가.

---

## [2026-09-08 14:20] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[terraform/]**: ECS Fargate → EC2 Auto Scaling Group 아키텍처 전환. AMI `ami-0bc151a94289adb52` 적용.
  - **ec2.tf** (신규): IAM Role + Instance Profile, Launch Template(AMI·인스턴스타입·User Data), Auto Scaling Group, CPU 기반 Scaling Policy.
  - **user_data.sh.tpl** (신규): EC2 시작 시 Docker 설치 → Secrets Manager 조회 → 컨테이너 실행 자동화 스크립트.
  - **ecs.tf**: ECS Fargate 리소스 전부 제거 (ec2.tf로 대체).
  - **alb.tf**: Target Group target_type을 "ip"에서 "instance"로 변경.
  - **variables.tf**: Fargate 전용 변수(api_cpu, api_memory) 제거. EC2 변수(ec2_ami_id, ec2_instance_type, ec2_volume_size) 추가.
  - **security.tf**: ECS 관련 주석을 EC2로 전면 업데이트.
  - **outputs.tf**: ECS 클러스터/서비스 출력을 ASG/Launch Template/AMI 출력으로 교체.
  - **terraform.tfvars.example**: EC2 설정 예시로 업데이트.

---

## [2026-09-08 13:15] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[terraform/]**: API 백엔드를 AWS로 이전하기 위한 Terraform IaC 전체 구성 작성.
  - **main.tf**: Provider(ap-northeast-2), 원격 state backend(S3+DynamoDB lock) 템플릿.
  - **variables.tf**: 전체 입력 변수 정의 (VPC CIDR, ECS CPU/메모리, RDS/Redis 인스턴스 유형, SMTP, reCAPTCHA 등).
  - **vpc.tf**: 2 AZ, Public/Private Subnet, NAT Gateway, Route Table. ALB는 Public, ECS/RDS/Redis는 Private.
  - **security.tf**: 4개 Security Group — ALB(80/443 inbound), ECS(ALB→3000), RDS(ECS→3306), Redis(ECS→6379).
  - **ecr.tf**: API Docker 이미지 프라이빗 레포. 최근 10개 이미지만 유지하는 Lifecycle Policy.
  - **alb.tf**: ALB + Target Group(health check /health). ACM 인증서 유무에 따라 HTTP 직접/HTTPS 리다이렉트 분기.
  - **ecs.tf**: Fargate Task Definition (환경변수 + Secrets Manager 참조), Service, Auto Scaling (CPU 70% 목표).
  - **elasticache.tf**: Managed Redis 7.1 (Private Subnet).
  - **rds.tf**: Managed MariaDB 10.11, gp3 스토리지, prod 환경 Multi-AZ 자동 활성화.
  - **secrets.tf**: DB 비밀번호·SMTP·reCAPTCHA Secret Key를 Secrets Manager JSON으로 통합 관리.
  - **outputs.tf**: ALB DNS, ECR URL, RDS/Redis 엔드포인트, CloudWatch 로그 그룹 등 핵심 출력.
  - **terraform.tfvars.example**: 변수 예시 파일 (실제 값은 .gitignore 처리).

## [2026-09-08 16:28] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[redis-api-chart/values.yaml]**: MariaDB 기본 접속 계정을 `team2`에서 `root`로 변경하여 현재 DB 사용 계획과 일치시킴.
- **[redis-api-chart/Chart.yaml]**: 차트 버전을 `1.0.7`로 증가.
- **[redis-api-chart/README.md / README.MD]**: root DB 계정과 `mariadb-credentials` Secret의 관계를 문서화.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** API Pod의 `DB_USER`가 `team2`로 설정되어 root 계정 접속 계획과 불일치.
- **원인(Cause):** Helm values의 이전 DB 계정 기본값이 남아 있었음.
- **해결(Solution):** `env.dbUser: root`로 변경하고 Secret의 `MARIADB_ROOT_PASSWORD`에는 root 계정 비밀번호를 사용하도록 정리했다.

## [2026-09-08 16:26] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[redis-api-chart/templates/namespace.yaml]**: Namespace 이름도 `.Release.Namespace`를 사용하도록 변경하여 API 차트의 배포 대상 네임스페이스 일관성을 보완.
- **[redis-api-chart/Chart.yaml]**: 차트 버전을 `1.0.6`으로 증가.
- **[redis-api-chart/README.md / README.MD]**: Namespace 리소스까지 포함한 Helm 릴리스 네임스페이스 운영 원칙을 문서화.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** API 차트의 일부 리소스와 Namespace 생성 템플릿이 `queuing-a`로 고정되어 배포 대상 네임스페이스 변경 시 일관성이 깨짐.
- **원인(Cause):** `templates/namespace.yaml`의 Namespace 이름이 하드코딩되어 있었음.
- **해결(Solution):** Namespace 이름과 namespaced 리소스의 `metadata.namespace`를 모두 `.Release.Namespace` 기준으로 통일했다.

## [2026-09-08 16:25] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[redis-api-chart/templates/deployment.yaml / service.yaml / hpa.yaml / serviceaccount.yaml]**: 하드코딩된 `queuing-a`를 `.Release.Namespace`로 변경하여 API Helm 릴리스와 namespaced 리소스의 네임스페이스를 일치시킴.
- **[redis-api-chart/Chart.yaml]**: 차트 버전을 `1.0.5`로 증가.
- **[redis-api-chart/README.md / README.MD]**: 동일 네임스페이스 배포 원칙과 기존 릴리스 확인 절차를 문서화.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** `helm upgrade ... -n queuing-a` 실행 시 `api has no deployed releases`가 발생하지만 API Pod는 `queuing-a`에서 실행됨.
- **원인(Cause):** Helm 릴리스 네임스페이스와 차트 템플릿에 하드코딩된 리소스 네임스페이스가 달랐음.
- **해결(Solution):** API 차트의 namespaced 리소스가 `.Release.Namespace`를 사용하도록 통일했다. 기존 릴리스의 실제 위치는 `helm list -A --all`로 확인한다.

## [2026-09-08 12:55] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[redis-api-chart/values.yaml]**: Google reCAPTCHA v3 활성화 여부, 검증 정책 및 외부 Kubernetes Secret 참조 설정을 추가.
- **[redis-api-chart/templates/deployment.yaml]**: reCAPTCHA 활성화 시 API Pod에 Secret Key와 검증 환경변수를 주입하도록 연결.
- **[redis-api-chart/Chart.yaml]**: 차트 템플릿 변경을 반영하여 차트 버전을 `1.0.5`로 증가.
- **[redis-api-chart/README.md / README.MD]**: Helm Secret 생성 방법, 운영 values override 및 Site Key/Secret Key 분리 원칙 문서화.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** API `.env.example`에는 reCAPTCHA 설정이 있지만 Helm 배포에서는 API Pod로 해당 환경변수가 전달되지 않음.
- **원인(Cause):** Helm 차트의 `values.yaml`과 Deployment 템플릿에 reCAPTCHA 설정 및 Secret 참조가 누락되어 있었음.
- **해결(Solution):** `recaptcha.enabled: true`인 경우에만 외부 `recaptcha-credentials` Secret과 `RECAPTCHA_*` 환경변수를 주입하도록 추가했다. 기본값은 false로 유지한다.

## [2026-09-08 10:27] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/recaptchaService.js]**: Google reCAPTCHA v3 서버 검증 서비스를 추가. `siteverify` 응답의 성공 여부, action, 점수, 허용 hostname을 확인하고 실패 시 핵심 요청을 차단하도록 구성.
- **[src/routes/authRoutes.js / src/routes/queueRoutes.js / src/routes/cancelQueueRoutes.js / src/routes/seatRoutes.js]**: 로그인·회원가입·대기열 진입·취소표 대기열/좌석 선점·결제 확정 요청에 action별 reCAPTCHA 검증 적용.
- **[.env.example]**: 개발용 `RECAPTCHA_SECRET_KEY`, `RECAPTCHA_REQUIRED`, `RECAPTCHA_SCORE_THRESHOLD`, `RECAPTCHA_ALLOWED_HOSTNAMES` 설정 예시 추가.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 프론트엔드만의 로딩 화면이나 검증 표시로는 API를 직접 호출하는 매크로 요청을 차단할 수 없음.
- **원인(Cause):** 서버가 Google reCAPTCHA 토큰의 유효성·action·점수를 확인하지 않으면 클라이언트 검증을 우회할 수 있음.
- **해결(Solution):** 프론트엔드는 보호 요청 직전에 v3 토큰을 발급하고, API는 Google `siteverify`에 서버 비밀 키로 재검증한다. `RECAPTCHA_SECRET_KEY`가 없을 때는 개발 기능이 깨지지 않도록 검증을 비활성화한다.
- **보완:** reCAPTCHA 실패 응답 후 원래 라우트가 계속 실행되지 않도록 `guardRecaptcha()`가 `false`를 반환하고 라우트 핸들러를 즉시 종료하게 했다.

## [2026-09-08 09:56] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: `POST /admin/simulation/cancel-seats` 엔드포인트에 standby 대기자 자동 프로모션 로직 추가.
  - 더미 좌석 취소 후, 취소된 좌석 수만큼 standby 대기열 상위 유저를 `promoteStandby()`로 자동 승격.
  - 승격된 유저는 `admittedKey`로 이동 + Admission Token 즉시 발급.
  - 응답에 `promotedCount`, `promotions` 필드 추가.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 시뮬레이션 매진 후 대기열에 진입한 유저의 순번이 줄어들지 않음.
- **원인(Cause):** 시뮬레이션 매진(`sellout`)이 대기열을 거치지 않고 좌석을 직접 SOLD 처리. `cancel-seats`로 좌석이 해제되어도 standby → admitted 프로모션이 없어 대기열이 진행되지 않음. `admitBatch()`는 eligible queue(`waitingKey`)만 처리하고 standby queue(`standbyKey`)는 무시.
- **해결(Solution):** `cancel-seats`에서 좌석 취소 완료 후 `getNextStandby()` + `promoteStandby()`를 취소 좌석 수만큼 반복 호출. 프론트엔드 `pollPosition()`에서 `admitted` 상태 감지 시 `/queue/enter`로 기존 토큰을 가져와 좌석 선택 페이지로 이동.

## [2026-09-08 09:25] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/seatService.js]**: HINCRBY 실시간 좌석 카운터 도입 — 5초 TTL 캐시를 대체.
  - **카운터 키**: `seat:counter:{eventId}:{sessionDate}:{sessionTime}` (Redis Hash, TTL 없음)
  - **`seatCounterKey()`**: eventId + session으로 카운터 키를 생성하는 헬퍼.
  - **`adjustSeatCounter(eventId, context, from, to)`**: 상태 전환 시 HINCRBY로 `from -1, to +1` 원자적 갱신. 카운터 미초기화 시 skip.
  - **`initSeats()`**: 좌석 생성 시 `total`, `available` 카운터 HINCRBY로 누적 초기화.
  - **`holdSeat()`**: 성공 시 `available -1, held +1`.
  - **`confirmSeat()`**: 성공 시 `held -1, sold +1`.
  - **`cancelSeat()`**: 성공 시 `sold -1, available +1`.
  - **`releaseSeat()`**: AVAILABLE 복귀 경로만 `held -1, available +1`. standby 재배정(HELD→HELD)은 카운터 변경 없음.
  - **`cleanupEventSeats()`**: `seat:counter:{eventId}:*` 키도 함께 삭제.
  - **`recoverSeatsFromMariaDB()`**: sessionStats에 `total`/`sold` 추적 추가, 복구 완료 후 카운터 동기화.
  - **`reconcileSeatCounters(eventId, context)`**: 실제 좌석 SCAN 후 카운터를 재계산·덮어쓰기하는 수동 보정 함수. exports에 추가.
  - **`getAvailableCount()`**: 카운터 HGETALL 1회로 즉시 응답(~0.1ms). 카운터 미존재 시 `reconcileSeatCounters()`로 자동 초기화 후 반환.
  - 기존 5초 TTL 캐시(`seat:count:*`) 로직 완전 제거.

- **[src/routes/seatRoutes.js]**: `POST /seats/reconcile` 엔드포인트 추가.
  - body: `{ eventId, sessionDate?, sessionTime? }` → 카운터 재계산 후 결과 반환.
  - 카운터 drift 발생 시 어드민에서 수동 호출용.

### 🛠 트러블슈팅 (Troubleshooting)
- **배경:** JMeter 테스트에서 `GET /seats/available` 11.2초 → 5초 TTL 캐시로 1차 개선 후 HINCRBY 카운터로 2차 개선.
- **원리:** 좌석 상태가 변하는 4개 지점(hold/confirm/cancel/release)에서 O(1) HINCRBY로 카운터 갱신. 조회는 HGETALL 1회(4필드)로 완료. 좌석이 수만 개로 늘어도 응답 시간 불변.
- **drift 대비:** `reconcileSeatCounters()`가 SCAN 기반 실제 좌석 수를 세서 카운터를 덮어쓰므로, 서버 재시작·Redis 장애 복구 후 `POST /seats/reconcile` 1회 호출로 정합성 복원 가능.

## [2026-09-07 19:30] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/seatService.js]**: `getAvailableCount()` Redis 5초 TTL 캐시 적용.
  - 캐시 키: `seat:count:{eventId}:{sessionDate}:{sessionTime}` — 회차별로 독립 캐싱.
  - 캐시 히트 시 SCAN + pipeline + filter 전체 생략 → 응답 ~1ms.
  - 3회 `.filter()` 호출을 단일 `for` 루프로 통합 (캐시 미스 시에도 절반 정도 빨라짐).
  - `eventId` 미지정 시 `EVENT_KEY`에서 조회하는 로직을 캐시 키 생성 전으로 이동해 캐시가 정확히 매칭되도록 수정.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** JMeter 7,292건 부하 테스트에서 `GET /seats/available` 평균 11.2초, APDEX 0.004.
- **원인(Cause):** `getAvailableCount()`가 `getAllSeats()`로 전체 좌석 SCAN(6,600석 기준 SCAN 60+회 순차 왕복) 후 3번 filter → 숫자 4개만 반환. 동시 100명이 같은 계산을 매번 새로 실행.
- **해결(Solution):** Redis `seat:count:*` 키에 결과를 5초 TTL로 캐싱. 5초 내 재요청은 GET 1회(~0.1ms)로 응답. 다음 단계로 HINCRBY 실시간 카운터 도입 예정.

## [2026-09-07 17:45] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/eventRoutes.js]**: `PATCH /events/:eventId/close-time` 엔드포인트에서 즉시 마감 시 이벤트 `status`를 `closed`로 업데이트하도록 수정.
  - `ticketCloseAt ≤ 현재시간`이면 `isImmediatelyClosed = true` 판정.
  - Redis `EVENT_LIST_KEY`의 카드에 `status: 'closed'` 반영 → `GET /events` 폴링에서 즉시 감지 가능.
  - 현재 활성 이벤트(`EVENT_KEY`)의 `status`도 `closed`로 갱신.
  - DB `events` 테이블의 `status` 컬럼도 `closed`로 동시 업데이트.
  - `cancelled`, `sold_out` 상태인 경우 status 덮어쓰기 방지.
  - 미래 마감 시간 설정(`ticketCloseAt > now`)은 기존과 동일하게 `ticketCloseAt`만 저장 (status 변경 없음).

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 어드민 "즉시 마감" 클릭 후 메인 페이지 뱃지가 "예매중"으로 유지됨.
- **원인(Cause):** `close-time` 엔드포인트가 `ticketCloseAt`만 설정하고 `event.status`를 `closed`로 변경하지 않아, `GET /events` 응답에서 `status: 'open'`이 유지되었음. 메인 페이지 10초 폴링은 `status` 변경 여부로 감지하므로 업데이트 불가.
- **해결(Solution):** 즉시 마감 시 Redis 카드·Event_KEY·DB 모두 `status = 'closed'`로 동기 업데이트. 이후 메인 페이지 폴링이 변경을 감지하면 자동으로 뱃지와 카드를 갱신.

## [2026-09-07 12:21] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[redis-api-chart/values.yaml]**: Gmail SMTP 활성화 플래그와 외부 Kubernetes Secret 참조 설정을 추가. 기본값은 비활성화하여 기존 AWS SES/LocalStack fallback 유지.
- **[redis-api-chart/templates/deployment.yaml]**: SMTP 계정과 App Password를 `secretKeyRef`로 주입하도록 조건부 환경변수 렌더링 추가.
- **[redis-api-chart/Chart.yaml]**: 차트 템플릿 변경에 맞춰 버전을 `1.0.2`로 증가.
- **[.env.example / .gitignore]**: 로컬 SMTP 테스트 환경변수 예시 추가 및 환경변수·Secret 원본 파일의 커밋 방지 규칙 추가.
- **[redis-api-chart/README.md]**: Helm SMTP 설정과 인프라 담당자 작업 절차 문서화.
- **[redis-api-chart/reademe.txt]**: 비밀번호를 명령행에 직접 입력하도록 안내하던 오래된 내용을 보안 안내로 교체.

## [2026-09-07 15:25] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/queueService.js]**: DB 관리자 제공 파일 적용. `waiting_queue` INSERT 3곳(`enter()` standby/eligible, `enterStandby()`)에 `membership_at_join` 컬럼 추가. `enter()` 및 `enterStandby()` 진입 시점에 `isPriorityUser()` 결과를 기반으로 `membershipAtJoin(0|1)` 값을 산출하여 저장. 응답 객체에도 `membershipAtJoin` 필드 추가.
- **[src/services/dbService.js]**: `waiting_queue` `addColumns()` 목록에 `membership_at_join TINYINT(1) NOT NULL DEFAULT 0` 추가. 서버 재시작 시 컬럼이 없는 환경에서도 자동 생성됨.

## [2026-09-07 10:50] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: `formatSeatLabel(seatId, sections)` 헬퍼 함수 추가. 취소표 알림 이메일 본문의 `${seat.seatId}` 원시 ID를 `${formatSeatLabel(seat.seatId, card.sections)}` 호출로 교체하여 "Floor구역 VIP석 840번" 형식으로 사람이 읽기 좋은 형태로 표시.

## [2026-09-07 09:44] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/cancelAllocationService.js]**: `getAllocation`, `getAllocationHistory` 쿼리의 `id` → `allocation_id AS id`로 변경.
- **[src/services/dbService.js]**: `cancel_allocations` CREATE TABLE의 PK 컬럼명을 `id` → `allocation_id`로 수정하여 실제 DB 스키마와 일치시킴.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** DB에 유효한 할당 레코드가 있음에도 "링크 만료" 오류 표시.
- **원인(Cause):** `cancel_allocations` 테이블이 다른 파트에서 `allocation_id`를 PK 컬럼명으로 먼저 생성되어 있어, `CREATE TABLE IF NOT EXISTS`가 스킵됨. 서비스 코드가 `SELECT id`로 조회 → `Unknown column 'id'` 에러 → 상태 API 500 반환 → 프론트가 `secretLink.active`를 읽지 못해 "링크 만료"로 오인. `COALESCE(id, allocation_id)`도 MariaDB에서는 두 컬럼 모두 파싱하므로 동일 에러 발생.
- **해결(Solution):** 쿼리를 `allocation_id AS id`로 직접 수정. dbService.js CREATE TABLE도 동일하게 수정.

## [2026-09-07 09:30] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/eventRoutes.js]**: `deleteEventData()` 함수에서 이벤트 삭제 시 `cancel_allocations` 테이블의 관련 레코드도 함께 삭제하도록 추가. 기존에는 이벤트를 삭제해도 취소표 할당 이력이 남아 있어, 같은 eventId로 시뮬레이션을 재실행할 때 만료된 이전 할당이 조회되는 문제 발생 가능.

## [2026-09-07 09:35] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/config/mariadb.js]**: 커넥션 풀에 `timezone: 'Etc/UTC'` 추가. Node.js Date 객체가 UTC 기준으로 직렬화되므로 MariaDB 드라이버도 UTC로 통일.
- **[src/services/cancelAllocationService.js]**: `getAllocation`의 만료 필터를 `NOW()` → `UTC_TIMESTAMP()`로 변경. `expireAllOverdue`의 만료 조건도 동일하게 변경. MariaDB 서버가 KST 타임존일 때 `NOW()`가 UTC 기준 `expires_at`보다 9시간 앞서 있어 발급 즉시 만료로 판단되던 문제 수정.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 시크릿 링크를 클릭하면 즉시 "취소표 링크가 만료되었습니다" 오류 표시.
- **원인(Cause):** Node.js가 `expires_at`을 UTC 기준으로 저장(`new Date(Date.now() + 300s)`)하지만, MariaDB 서버 타임존이 KST(UTC+9)여서 `NOW()`가 9시간 앞선 값을 반환. DB 조회 시 `expires_at > NOW()` 조건에서 방금 생성된 레코드도 이미 만료된 것으로 판단.
- **해결(Solution):** MariaDB 커넥션에 `timezone: 'Etc/UTC'` 설정 추가, 만료 비교 쿼리를 `UTC_TIMESTAMP()`로 변경하여 Node.js-MariaDB 간 타임존을 UTC로 통일.

## [2026-09-07 09:20] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/cancelQueueRoutes.js]**: `GET /cancel-queue/status/:eventId/:userId` 핸들러에서 userId를 URL path parameter 대신 query string(`?userId=`)으로 우선 읽도록 변경. 이메일 주소처럼 `.`이 포함된 userId가 Fastify 라우터에서 파일 확장자로 오인되어 잘리는 문제 수정.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 시크릿 링크 클릭 시 "현재 사용 가능한 취소표 링크가 없습니다. 이미 만료되었거나 사용된 링크입니다." 오류 표시.
- **원인(Cause):** userId가 이메일 형식(`ggreang212@gmail.com`)일 때 Fastify가 URL path의 `.com` 부분을 파일 확장자로 파싱해 userId 값이 잘림. 결과적으로 DB 조회 시 userId 불일치로 할당 레코드를 찾지 못함.
- **해결(Solution):** 프론트엔드에서 userId를 path parameter가 아닌 query string으로 전달하고, 서버에서도 `request.query.userId`를 우선 사용하도록 수정.

## [2026-09-07 08:00] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/app.js]**: `CORS_ORIGIN` 환경변수가 설정된 경우 CORS 헤더를 응답에 추가하는 훅 추가. 로컬 테스트 시 `CORS_ORIGIN=*` 또는 `CORS_ORIGIN=http://192.168.x.x:포트`로 설정하면 외부 origin에서의 API 호출을 허용. 운영 환경에서는 미설정 시 비활성.
- **[src/routes/simulationRoutes.js]**: 시크릿 링크 이메일 URL에 `API_BASE` 환경변수가 설정된 경우 `apiBase` 쿼리 파라미터를 추가. 로컬에서 `cancel-ticketing.html`을 열어도 API 호출이 VM 백엔드로 향하도록 지원.

## [2026-09-07 03:25] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: 시크릿 링크 이메일의 URL을 SPA 해시 라우트(`/#/private-link`)에서 독립 HTML 페이지(`/cancel-ticketing.html`)로 변경. cancel-ticketing.html은 풀 예매 워크플로(좌석 확인 → 결제수단 선택 → 결제 완료)를 제공하는 전용 UI.

## [2026-09-06 21:33] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: 멤버십 회원 전용 취소표 시뮬레이션 라우트 신규 생성.
  - `GET /admin/simulation/events` — DB 등록 공연 목록 조회 (드롭다운 용도).
  - `POST /admin/simulation/init` — 시뮬레이션 초기화: 더미 유저 최대 50,000명 생성, 실제 멤버십 유저 계정/멤버십 자동 등록, Redis `simulation:{eventId}` 해시에 메타 저장.
  - `POST /admin/simulation/sellout` — [단계1] 매진 연출: 전체 좌석을 더미 유저로 SOLD 처리 (Redis pipeline + DB batch), 잔여 더미를 standby 큐에 등록, 실제 유저를 score=0으로 최우선 배치.
  - `POST /admin/simulation/close` — [단계2] 조기 마감: 이벤트 상태 closed 전환 + MariaDB `ticket_close_at` 갱신, standby 대기열 전수 검사 → 멤버십 적격/비적격 교차 검증.
  - `POST /admin/simulation/cancel-seats` — [단계3] 취소표 생성: 지정 수량만큼 더미 좌석 랜덤 선택 후 AVAILABLE 복원 (Redis + DB), 예약 CANCELLED 처리.
  - `POST /admin/simulation/issue-links` — [단계4] 시크릿 링크 발급: AVAILABLE 좌석마다 `allocateNextForSeat()` 호출, 멤버십 유저 자동 매칭 + 이메일 발송.
  - `POST /admin/simulation/cleanup` — 더미 유저/좌석/대기열/예약/멤버십 일괄 삭제, Redis 큐 키 초기화.
  - `GET /admin/simulation/status` — 현재 시뮬레이션 단계, 좌석 상태, 대기열 수치, 실제 유저 상태(standby 위치·입장 허용·시크릿 링크 할당) 조회.
- **[src/app.js]**: `simulationRoutes` require 및 Fastify 등록 추가.

## [2026-09-06 21:07] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/dbService.js]**: `events` 테이블에 `ticket_close_at DATETIME NULL` 컬럼 추가 (CREATE TABLE + addColumns).
- **[src/routes/eventRoutes.js]**: `PATCH /events/:eventId/close-time` 핸들러에 MariaDB `ticket_close_at` 저장/해제 추가. 기존에는 Redis에만 반영되고 DB에는 저장되지 않아서, Redis 복구 시 마감 해제가 원복되는 문제가 있었음.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 관리자가 "5분 후 마감" 후 "지금 바로 오픈"을 눌러도 마감 상태가 해제되지 않음.
- **원인(Cause):** `PATCH /events/:eventId/close-time` 핸들러가 Redis(`events:list`, `event:info`)에만 `ticketCloseAt`을 저장/해제하고, MariaDB `events.ticket_close_at`에는 반영하지 않았음. 또한 `ticket_close_at` 컬럼 자체가 DB 스키마에 없어서 저장이 불가능했음. Redis 복구 서비스는 MariaDB의 `ticket_close_at`을 기준으로 복원하므로, DB에 값이 없으면 해제가 무효화됨.
- **해결(Solution):** `events` 테이블에 `ticket_close_at DATETIME NULL` 컬럼 추가, `close-time` PATCH 핸들러에서 MariaDB도 함께 업데이트하도록 수정. 서버 재시작 시 `addColumns()`가 누락된 컬럼을 자동 추가.

## [2026-09-06 20:24] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/seatRoutes.js]**: 예매 완료/취소 이메일의 공연 정보 조회 수정. seatId 파싱을 `split('-')` → `split(':')[0]`으로 변경하여 eventId를 정확히 추출. Redis 좌석 해시에서 `section`, `sessionDate`, `sessionTime`을 가져와 이메일에 반영. 좌석 표시를 raw ID(`Floor-001`) 대신 `Floor구역 VIP석 1번` 형식으로 변환하는 `formatSeatLabel()` 추가. 올림픽홀 구역별 등급 매핑(`GRADE_MAP`) 추가.

## [2026-09-06 20:09] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/seatRoutes.js]**: `POST /seats/confirm` 결제 확정 성공 시 예매 완료 안내 메일 자동 발송. `POST /seats/cancel` 예매 취소 성공 시 취소 및 환불 안내 메일 자동 발송. MariaDB에서 사용자 이메일을 조회하고, Redis 이벤트 카드에서 공연 정보를 가져와 HTML 이메일 발송. 메일 발송은 비동기로 처리하여 API 응답을 지연시키지 않음.

## [2026-09-06 19:12] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/notificationService.js]**: Gmail SMTP 발송 기능 추가 (nodemailer). `SMTP_USER`/`SMTP_PASS` 환경변수가 설정되면 SMTP 모드, 미설정 시 기존 AWS SES 모드로 동작. `SMTP_HOST`(기본 `smtp.gmail.com`), `SMTP_PORT`(기본 `587`) 커스텀 가능.
- **[package.json]**: `nodemailer` (^6.9.0) 의존성 추가.
- **[src/routes/eventRoutes.js]**: `POST /admin/test-email` 엔드포인트 추가. 수신자(`to`), 제목(`subject`), 본문(`body`)을 지정하여 이메일 발송 테스트 가능.

## [2026-09-06 12:05] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/authService.js]**: argon2 패키지를 `argon2`(node-argon2)에서 `@node-rs/argon2`로 교체. Node.js 20 환경에서 node-gyp 빌드 없이 동작하는 Rust 기반 네이티브 바인딩 사용. `Algorithm.Argon2id` 명시적 지정, 옵션을 `@node-rs/argon2` API에 맞게 변환 (memoryCost=19456, timeCost=2, parallelism=1, outputLen=32).
- **[package.json]**: `argon2` (^0.41.1) → `@node-rs/argon2` (^2.0.2)로 교체. `bcryptjs`는 기존 해시 호환을 위해 유지.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** API 서버 시작 시 `Error: Cannot find module 'argon2'` 발생. `npm install argon2` 실행해도 Node.js 20.20.2 환경에서 네이티브 빌드 실패.
- **원인(Cause):** `argon2` (node-argon2) 패키지가 공식적으로 Node.js 22 이상을 요구하며, node-gyp 빌드 도구(Python 3, C++ 컴파일러)가 필요함. 서버 환경(Node.js 20.20.2)에서 호환되지 않음.
- **해결(Solution):** `@node-rs/argon2`로 교체. 이 패키지는 Rust로 사전 컴파일된 바이너리를 제공하여 node-gyp 없이 설치 가능하고, Node.js 20을 지원함. API는 `hash(password, options)` / `verify(storedHash, password)` 형태로 유사하나, `type: argon2.argon2id` 대신 `algorithm: Algorithm.Argon2id`를 사용하고, `memoryCost`/`timeCost` 기본값이 다름.

## [2026-09-06 11:35] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/authService.js]**: 비밀번호 해싱을 `bcryptjs`에서 `argon2id`로 전환. 회원가입, 로그인, 비밀번호 변경, 관리자 계정 초기화 모두 argon2id 적용. 기존 bcrypt 해시 사용자는 로그인 시 자동으로 argon2id로 마이그레이션.
- **[package.json]**: `@node-rs/argon2` (^2.0.2) 의존성 추가. `bcryptjs`는 기존 해시 호환을 위해 유지.
- **[README.MD]**: 인증 서비스 설명을 argon2id 기반으로 갱신. 의존성 목록, API 명세, authService.js 로직 설명에서 bcrypt → argon2id 전환 및 자동 마이그레이션 내용 반영.

## [2026-09-06 11:30] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/eventRoutes.js]**: `PATCH /events/:eventId/open-time` 핸들러에서 `restoreTicketingSchedule()` 호출 제거. `PATCH /events/:eventId/close-time` 핸들러에서 `scheduleCloseTime()`/`cancelCloseSchedule()` 호출 제거. 이벤트별 오픈/마감 시간 설정이 전역 `event:ticketing-status` 키를 변경하지 않도록 수정.
- **[src/services/queueService.js]**: `enter()` 함수에 이벤트 카드의 `ticketCloseAt` 검사 추가. 마감 시간이 지난 이벤트는 대기열 진입 시 `ticketing_closed` 코드로 차단.
- **[README.MD]**: `PATCH /events/:eventId/open-time`, `PATCH /events/:eventId/close-time` API 명세를 갱신하여 전역 스케줄/상태를 변경하지 않음을 명시.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 공연 A를 생성하고 공연 B에 예매 오픈/마감 시간을 설정하면, 공연 A의 예매 버튼을 눌렀을 때 대기열이 "마감"이라며 접속 불가.
- **원인(Cause):** `PATCH /events/:eventId/open-time`이 `restoreTicketingSchedule()`을 호출하면, 내부적으로 `scheduleTicketing()` → `closeTicketing()`이 전역 `event:ticketing-status`를 `'closed'`로 설정함. `close-time`도 동일하게 `scheduleCloseTime()` → `closeTicketing()`이 전역 상태를 변경. `enter()` 함수는 이벤트별 scoped 상태 키를 우선 확인하도록 이전에 수정되었지만, 전역 상태 변경 자체가 불필요한 부작용이었음.
- **해결(Solution):** 두 PATCH 핸들러에서 전역 스케줄/타이머 함수 호출을 모두 제거. `enter()` 함수가 이벤트 카드의 `ticketOpenAt`(오픈 전 차단)과 `ticketCloseAt`(마감 후 차단)을 직접 확인하여 동적으로 판단하므로, 전역 스케줄 타이머가 불필요함. 이로써 한 이벤트의 시간 설정이 다른 이벤트의 대기열 진입을 차단하지 않음.

## [2026-09-06 10:42] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/dbService.js]**: `events` 테이블 `addColumns()` 목록에 `sessions JSON NULL` 추가. `seats`, `waiting_queue`, `reservations` 테이블 `addColumns()` 목록에 `session_date`, `session_time` 추가.
- **[README.MD]**: 회차(session) 관련 컬럼이 이제 서버 시작 시 `addColumns()`를 통해 기존 운영 테이블에도 자동으로 추가됨을 반영.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 운영 서버 로그에 `Unknown column 'session_date' in 'field list'` (seats INSERT), `Unknown column 'sessions' in 'field list'` (events INSERT) 에러 발생. 좌석 초기화가 3회 재시도 후 최종 실패로 SyncRetry 큐에 계속 쌓임.
- **원인(Cause):** `CREATE TABLE IF NOT EXISTS` 문에는 `sessions`(events), `session_date`/`session_time`(seats, waiting_queue, reservations) 컬럼이 포함돼 있었지만, 테이블이 이미 존재하는 운영 DB에 컬럼을 추가해주는 `addColumns()` 호출 목록에는 이 컬럼들이 빠져 있었음. `CREATE TABLE IF NOT EXISTS`는 테이블이 이미 있으면 아무 동작도 하지 않으므로, 회차 기능 추가 이전에 생성된 테이블에는 해당 컬럼이 끝내 반영되지 않았음.
- **해결(Solution):** `addColumns('events', [...])`에 `"sessions JSON NULL"`을, `addColumns('seats'/'waiting_queue'/'reservations', [...])`에 `"session_date VARCHAR(50) DEFAULT ''"`, `"session_time VARCHAR(10) DEFAULT ''"`를 추가. `addColumns()`는 내부적으로 `ALTER TABLE ... ADD COLUMN`을 실행하고 실패(이미 존재 등)는 무시하므로, 다음 서버 재시작 시 누락된 컬럼이 자동으로 채워진다.

## [2026-09-04 17:10] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/queueService.js]**: `eventId`가 포함된 대기열 요청에서 전역 `event:ticketing-status`를 fallback으로 사용하지 않도록 수정. 해당 이벤트 카드의 `ticketOpenAt`과 이벤트 전용 상태만 확인하도록 변경.
- **[src/routes/eventRoutes.js / src/services/queueService.js]**: 한 이벤트의 오픈 예약이 다른 이벤트의 예매 흐름에 영향을 주지 않도록 이벤트별 오픈 시간 검증을 추가.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 윤하 공연의 오픈 시간을 설정하면 오픈 시간이 설정되지 않은 악뮤 공연도 사용자 화면에서 오픈 예정으로 표시됨. 관리자 목록에서는 악뮤가 예매중으로 표시되어 화면 간 상태가 달랐음.
- **원인(Cause):** 공연 상세 페이지가 해당 공연에 `ticketOpenAt`이 없을 때 전역 `/admin/ticketing/schedule`을 fallback으로 조회함. 대기열 API도 이벤트 요청에서 전역 티켓팅 상태를 fallback으로 사용했음.
- **해결(Solution):** 공연별 `ticketOpenAt`이 있을 때만 해당 공연의 카운트다운을 표시하고, 없으면 다른 공연의 전역 스케줄을 사용하지 않도록 수정. 이벤트 ID가 있는 대기열 요청도 해당 이벤트 전용 상태와 오픈 시간을 검증하도록 분리.

## [2026-09-04 13:55] 업데이트 로그
### 🔄 변경 및 수정 사항
- **[src/services/redisRecoveryService.js]**: API 시작 시 MariaDB를 기준으로 `event:info`, 이벤트 목록, 좌석, 회차별 대기열, `event:schedule`, `event:ticketing-status`를 최대 3회 재시도하여 복구하도록 추가.
- **[src/services/redisRecoveryService.js]**: Redis 실행 중에도 기본 60초마다 키 누락·DB와의 불일치를 점검하고 필요한 경우 자동 복구하도록 추가. 여러 API 인스턴스의 중복 복구를 막기 위해 `lock:redis-recovery` 분산 락 적용.
- **[src/app.js]**: 서버 시작 시 Redis 자동 복구를 실행하고 주기적 점검을 시작하도록 연결. 종료 시 자동 복구 타이머 정리.
- **[src/routes/eventRoutes.js]**: 관리자 `POST /admin/redis/recover`를 전체 이벤트·좌석·대기열·예매 상태 복구 서비스와 통합.
- **[src/services/queueService.js]**: 회차별 대기열 복구 시 전역 카운터가 아닌 회차별 카운터 키를 복원하도록 수정.
- **[README.MD]**: Redis 자동 복구 범위, 시작 복구, 주기적 점검, 환경변수 문서화.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** `redis-cli FLUSHALL` 또는 Redis 장애 후 오픈 시간·좌석·대기열·예매 상태가 Redis에 다시 생기지 않음.
- **원인(Cause):** 기존 코드는 오픈 시간 복구 API는 있었지만 API 시작 시점이나 Redis 키 삭제를 감지해 전체 복구하는 백그라운드 작업이 없었고, Node.js 메모리 타이머도 재시작 시 사라짐.
- **해결(Solution):** MariaDB를 기준으로 시작 시 최대 3회 복구하고, 이후 60초마다 필수 키와 DB 상태를 점검하도록 추가했다. 누락이 감지되면 전체 이벤트·좌석·회차별 대기열을 복구하고 미래 오픈 스케줄과 예매 상태를 다시 등록한다.

## [2026-09-04 13:22] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/eventRoutes.js]**: 관리자 오픈 시간 설정을 MariaDB `events.ticket_open_at`에도 저장하도록 수정하고, 이벤트 목록·Redis 복구 시 DB의 오픈 예정 시간을 ISO 형식으로 함께 복원하도록 통합.
- **[src/routes/eventRoutes.js]**: `/admin/redis/recover`가 `event:info`에 `ticketOpenAt`을 복원하고, 대상 이벤트의 미래 오픈 스케줄을 재등록하도록 수정.
- **[src/services/queueService.js]**: Redis 초기화·복구 후 오픈 예정 시간을 메모리 타이머와 `event:schedule`에 재등록하는 `restoreTicketingSchedule()`을 추가. 미래 시간에는 대기열을 닫고, 시간이 지나면 자동으로 오픈하도록 처리.
- **[README.MD]**: 오픈 시간 영구 저장, Redis 복구, 자동 오픈 스케줄 동작과 관련 API·Redis 키 문서화.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** Redis 전체 초기화 후 MariaDB에서 이벤트를 복구해도 오픈 예정 공연이 오픈 예정 목록에서 사라짐.
- **원인(Cause):** 관리자 오픈 시간 API가 `events:list`와 `event:info` Redis 값만 수정하고 MariaDB `events.ticket_open_at`에는 저장하지 않음. 복구 코드는 MariaDB의 `ticket_open_at`을 읽으므로 항상 `null`이 되었고, `event:info` 복구에도 해당 필드와 자동 오픈 타이머가 빠져 있었음.
- **해결(Solution):** 오픈 시간 설정 시 MariaDB `ticket_open_at`을 함께 갱신하고, 이벤트 카드·`event:info` 복구 시 같은 값을 ISO 형식으로 재생성한다. 미래 오픈 시간이 있으면 `restoreTicketingSchedule()`이 Redis 스케줄과 메모리 타이머를 재등록하고, 이미 시간이 지난 경우 즉시 예매중 상태로 복구한다.

## [2026-09-03 21:15] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/eventRoutes.js]**: 이벤트 ID를 밀리초 타임스탬프(`evt-1788429141132`) 방식에서 Redis INCR 기반 자동 증가 번호(`evt-1`, `evt-2`, ...)로 변경. `event:seq` 키로 순번을 원자적으로 발급하여 충돌 방지. 기존 공연 데이터는 영향 없음(새 공연부터 적용).

## [2026-09-03 16:05] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/notificationService.js]**: 하드코딩된 LocalStack IP(`192.168.0.191:4566`)와 임시 자격증명(`fakekey`/`fakesecret`)을 제거하고, 환경변수 기반 설정으로 전환. `AWS_ENDPOINT`가 없으면 AWS SDK 기본 엔드포인트 사용, `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`가 없으면 IAM Role 등 SDK 기본 자격증명 체인 사용.

## [2026-09-03 15:20] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/lockService.js]**: Redis SET NX EX 기능 설명 주석 제거. 데드락 방지·경합 완화·원자적 실행 관련 안전성 주석은 유지.
- **[src/services/seatService.js]**: 토큰 무효화 시점·standby 배정 정책·sold_out 상태 구분·소유자 검증 등 기능 설명 주석 5건 제거. 분산 락 획득·데드락 방지·DB-Redis 실행 순서 관련 안전성 주석은 유지.
- **[src/services/queueService.js]**: 토큰 재발급 로직·재진입 시 대기열 복귀 정책 설명 주석 2건 제거. INCR 원자성 관련 안전성 주석은 유지.
- **[src/services/timerService.js]**: 키 필터링 설명 주석 제거. Redis subscribe 별도 연결 필요 사유 주석은 유지.
- **[src/routes/eventRoutes.js]**: /events 목록 카드 동기화 기능 설명 주석 제거. 이벤트 ID 생성 순서 관련 안전성 주석(Redis 키 충돌 방지)은 유지.
- **[src/routes/queueRoutes.js]**: 기존 엔드포인트 재사용 안내 주석 제거.

## [2026-09-03 12:53] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/authRoutes.js]**: `PATCH /auth/profile`이 회원정보 수정 시 이메일을 받거나 검증하지 않고, 전화번호 등 허용된 프로필 값만 서비스에 전달하도록 정리.
- **[src/services/authService.js]**: 회원정보 수정 SQL에서 이메일 변경을 제외하고 `phone` 변경을 MariaDB `users` 테이블에 저장하도록 유지.
## [2026-09-03 15:08] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/eventRoutes.js]**: 최대 5개 이벤트를 순차 삭제하는 `POST /events/batch-delete` API를 추가하고, 기존 단일 이벤트 삭제와 공통 삭제 로직을 사용하도록 정리.
- **[src/routes/eventRoutes.js]**: 일괄 삭제 시 Redis 좌석 키, 관심 공연, 좌석, 예매 기록, 이벤트 정보를 이벤트별로 정리하도록 구성.
## [2026-09-03 16:49] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/eventRoutes.js]**: 공연 생성 시 `sessions`의 각 회차마다 좌석 inventory와 회차별 대기열 수용량을 생성하도록 변경. `totalSeats`는 전체 회차 합계, `seatsPerSession`은 회차당 좌석 수로 반환.
- **[src/services/seatService.js / src/services/queueService.js / src/services/tokenService.js]**: 좌석 조회·선점·결제·대기열·Admission Token을 공연 날짜/시간 기준으로 분리하고 기존 단일 회차 API 호환성을 유지.
- **[src/services/dbService.js]**: `events.sessions` 및 좌석·대기열·예약의 `session_date`, `session_time` 컬럼을 자동 마이그레이션하도록 추가.
- **[src/routes/seatRoutes.js / src/routes/queueRoutes.js]**: 회차 컨텍스트를 받는 조회·대기열 API를 추가.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 3,322석 공연을 2일 일정으로 생성해도 좌석이 3,322석만 생성됨.
- **원인(Cause):** 기존 생성 로직이 `sessions`를 공연 정보로만 저장하고 좌석·대기열은 공연당 한 번만 초기화함.
- **해결(Solution):** 회차별 좌석 ID·Redis 키·DB 기록을 분리하고 선택한 회차만 조회하도록 수정해 3,322석 × 2회차 = 6,644석이 생성되도록 처리.
## [2026-09-03 17:05] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/dbService.js]**: 기존 테이블에 회차 관련 컬럼을 자동으로 추가하던 마이그레이션 항목을 제거. 신규 테이블 생성 정의에는 회차 컬럼을 유지.
- **[README.MD]**: 회차 컬럼은 운영 DB에 사전 준비해야 한다는 전제에 맞춰 문서 흐름을 유지.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** API 시작 시 기존 DB 구조가 자동으로 변경됨.
- **원인(Cause):** `addColumns()`에 회차 컬럼이 포함되어 있었음.
- **해결(Solution):** 회차 컬럼의 자동 `ALTER TABLE` 실행을 제거하고, DB 스키마 변경을 운영자가 직접 관리하도록 수정.
## [2026-09-06 14:13] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/cancelQueueRoutes.js]**: 취소표 상태·Pool 조회, Secret Link 좌석 선점, 만료 재배정 API를 추가하고 대기열 조회에 공연 회차 컨텍스트를 전달.
- **[src/services/cancelAllocationService.js]**: 취소표 할당에 `session_date`·`session_time`을 저장하고, 다음 멤버십 대기자 자동 할당 및 만료 후 재배정 로직을 추가.
- **[src/services/seatService.js]**: 판매 좌석 취소 성공 시 다음 멤버십 standby 사용자에게 Secret Link를 자동 발급하고, 취소표 결제 확정 시 할당을 `RESPONDED`로 마감.
- **[src/services/queueService.js]**: 멤버십 미가입 standby 사용자를 실제 대기열에서 `SKIPPED` 처리하는 로직 추가.
- **[src/services/timerService.js]**: 취소표 선점 만료 시 좌석 해제·할당 만료·다음 사용자 재배정을 분리하고 회차 정보를 할당에 저장.
- **[src/services/dbService.js]**: `cancel_allocations` 테이블에 회차 컬럼(`session_date`, `session_time`) 추가 및 기존 DB 자동 보정.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 취소표 프론트가 임의 대기번호·랜덤 Pool·로컬 좌석 상태를 사용하고, 결제 시 `/seats/confirm`을 호출하지 않아 MariaDB에 취소표 예매가 확정되지 않음.
- **원인(Cause):** `cancelQueue.js`, `cancelSeatSelect.js`, `payment.js`가 데모용 로컬 상태 흐름과 백엔드 취소표 할당 API를 분리해서 사용함.
- **해결(Solution):** 서버가 발급한 `cancel_allocations`와 Admission Token을 기준으로 `/cancel-queue/status`, `/cancel-queue/hold`, `/seats/confirm`을 순서대로 연결하고, 시간 초과 시 `/cancel-queue/expire`로 같은 좌석을 다음 대기자에게 재배정하도록 수정.
## [2026-09-06 14:18] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/queueService.js]**: 일반 예매 상태의 사용자를 회차별 취소표 standby 대기열로 이동시키는 `enterStandby()`를 추가.
- **[src/routes/cancelQueueRoutes.js]**: `POST /cancel-queue/join`을 추가해 매진 안내에서 실제 취소표 대기열 등록이 가능하도록 연결.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 일반 예매 중 매진 안내를 받은 사용자가 기존 `admitted` 상태 때문에 취소표 standby 대기열에 등록되지 않음.
- **원인(Cause):** 기존 `/queue/enter`는 이미 일반 대기열에 등록된 사용자를 재사용하며, 취소표 전용 이동 처리가 없었음.
- **해결(Solution):** `enterStandby()`가 기존 일반 대기열 상태를 정리하고 standby 순번을 발급하도록 분리한 뒤 `POST /cancel-queue/join`으로 프론트에서 호출.
## [2026-09-10 11:08] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/authTokenService.js / src/services/tokenService.js]**: 세션 JWT와 Admission JWT의 하드코딩 fallback을 제거하고, 각각 환경변수 키를 32자 이상으로 강제. production에서 키가 없거나 약하면 기동을 중단하도록 변경
- **[src/middleware/auth.js / src/routes/*.js]**: Bearer Access JWT 인증, 관리자 역할 검사, 요청 `userId`와 인증 사용자 일치 검증을 보호 API에 적용. 취소표 흐름에는 서버 발급 링크 토큰 또는 로그인 토큰만 허용
- **[src/services/authService.js]**: 기존 관리자·모니터링 기본 비밀번호를 제거하고 bootstrap Secret 환경변수가 설정된 경우에만 초기 계정을 생성. 기존 계정은 덮어쓰지 않음
- **[src/services/cancelLinkTokenService.js / src/services/cancelAllocationService.js / src/routes/simulationRoutes.js]**: 취소표 할당 시 사용자·공연·좌석·할당 ID와 만료시각을 묶은 서명 링크 토큰을 발급하고 이메일 링크에 전달
- **[.env.example / redis-api-chart/values.yaml / redis-api-chart/templates/deployment.yaml]**: JWT Secret과 선택적 bootstrap Secret을 Kubernetes Secret에서 주입하도록 설정 및 문서화
- **[README.MD]**: 인증 헤더, 사용자 소유권 검증, 취소표 링크 토큰, Helm Secret 배포 전제조건을 갱신

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 코드에 고정 JWT 키와 관리자 초기 비밀번호가 남아 있으면 외부 사용자가 토큰을 위조하거나 알려진 계정으로 로그인할 위험이 있음. 또한 `userId`만 바꾼 요청으로 타 사용자 데이터에 접근할 수 있었음.
- **원인(Cause):** 토큰 서명 키의 코드 fallback과 계정 생성용 평문 비밀번호가 있었고, 일부 사용자 API가 요청 ID와 로그인 주체의 소유권을 재검증하지 않았음. 독립 취소표 페이지는 일반 Bearer 헤더를 사용할 수 없음.
- **해결(Solution):** 환경변수 기반 강제 키 검증, Access/Refresh JWT 인증, 관리자·본인 계정 권한 미들웨어, 만료형 취소표 링크 JWT를 도입했다. 독립 페이지는 linkToken을 전달하고 서버에서 사용자·공연·좌석·할당 범위를 재검증한다.

---
## [2026-09-11 16:27] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: 취소표 시뮬레이션의 `매진 연출` 단계에서 실제 멤버십 유저를 standby 대기열에 사전 등록하지 않도록 수정. 실제 유저는 매진 후 프론트엔드에서 `/queue/enter`를 호출할 때만 취소표 대기번호를 발급받음
- **[src/routes/simulationRoutes.js]**: 실제 유저를 제외한 더미 standby 수에 맞춰 Redis 대기열 카운터와 응답 메시지·통계를 조정
- **[README.MD]**: 시뮬레이션 매진 단계와 실제 유저의 대기열 진입 절차를 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** `매진 연출` 직후 실제 멤버십 유저에게 취소표 대기 등록 완료 모달과 대기번호가 표시됨
- **원인(Cause):** 시뮬레이션 API가 매진 처리와 동시에 `realUserEmail`을 standby Redis Sorted Set에 등록하고 있었음
- **해결(Solution):** 매진 단계에서는 더미 standby만 생성하고 실제 유저 등록을 제거. 실제 사용자의 `/queue/enter` 요청이 들어올 때 `queueService.enter()`가 `sold_out` 상태를 확인해 standby 대기번호를 발급하도록 변경
## [2026-09-15 13:53] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/metricsService.js]**: `queuing_booking_operations_total`, `queuing_timer_starts_total`, `queuing_timer_cancellations_total` 메트릭을 추가해 예매 업무 처리와 좌석 상태 이벤트를 분리
- **[src/routes/seatRoutes.js]**: 좌석 선점·예매 확정·환불 API 결과를 `success/rejected/error`로 기록
- **[src/services/timerService.js]**: 타이머 시작 및 실제 삭제 동작을 별도 카운터로 기록
- **[README.MD]**: 신규 예매·타이머 메트릭 이름과 `queuing_seat_events_total`과의 측정 범위를 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 기존 `queuing_seat_events_total{type="sold"}`만으로는 좌석 상태 이벤트와 예매 API 처리 결과를 구분하기 어려움
- **원인(Cause):** 좌석 상태 변경 이벤트와 사용자 예매 업무 결과가 서로 다른 관측 대상인데 별도 메트릭이 없었음
- **해결(Solution):** 좌석 이벤트 메트릭은 유지하고 예매 업무·타이머 시작·타이머 삭제를 전용 Counter로 분리
## [2026-09-16 13:45] 업데이트 로그 — B파트 Secret Link 검증 프록시 연동

### 🔄 변경 및 수정 사항
- **[src/services/bPartCallbackService.js]**: `callbackVerifyLink(token)` 추가 — A 서버가 브라우저의 Secret Link 토큰을 B파트 `/b-callback/verify-link`로 전달하고 `X-Callback-Secret` 인증 헤더를 사용
- **[src/routes/cancelQueueRoutes.js]**: `B_CALLBACK_BASE_URL`이 설정된 경우 `/verify-link`의 A파트 자체 JWT 검증 대신 B파트 서버 검증을 사용하도록 변경
- **[src/routes/cancelQueueRoutes.js]**: B파트 응답의 `user_id/userId`, `event_id/eventId`, `allocation_id/allocationId`, `expires_at/expiresAt` 형식을 수용하고, A파트 `cancel_allocations`의 할당 ID와 일치 여부를 검증
- **[src/routes/cancelQueueRoutes.js]**: B파트 검증 결과와 A파트 DB 만료 시각 중 더 이른 시각을 사용하여 Secret Link 세션의 만료 시간을 제한
- **[README.md]**: `/verify-link` B파트 프록시 동작, 응답 계약, 환경변수 설명을 갱신

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** B파트가 발급한 토큰은 A파트와 서명키·형식이 달라 기존 `jwt.verify(token, JWT_SECRET)` 검증을 통과하지 못함
- **원인(Cause):** A파트 `/verify-link`가 토큰 발급 주체인 B파트를 호출하지 않고 A파트 전용 `cancel_link` JWT만 검증함
- **해결(Solution):** 운영 환경에서 `B_CALLBACK_BASE_URL`이 설정되면 A파트가 토큰을 B파트 `/b-callback/verify-link`에 서버 간 POST로 전달하고, `X-Callback-Secret`으로 인증하도록 변경. B파트가 응답한 할당 식별자와 A파트 DB를 추가 대조함

---
## [2026-09-16 14:33] 업데이트 로그 — 대기열 입장 풀 제한·만료 재충원·이탈 처리

### 🔄 변경 및 수정 사항
- **[src/services/queueService.js]**: admitted 현재 인원을 기준으로 `BATCH_SIZE`만큼만 입장시키도록 슬롯 상한을 적용하고, 입장 제한시간 기본값 420초를 Redis deadline 키로 관리하도록 보완
- **[src/services/admissionTimeoutService.js]**: `admission:deadline:*` 만료 감시 워커를 추가해 만료 사용자의 Admission Token·대기 상태를 정리하고 eligible 대기자 1명을 재입장시키도록 구현
- **[src/routes/queueRoutes.js]**: `/admin/admission-timeout` 조회·설정 API를 추가하고 `/queue/leave`에서 대기열 이탈, admitted 슬롯 반납, 후속 backfill을 처리
- **[src/services/seatService.js]**: 예매 확정 시 admitted 슬롯을 `COMPLETED`로 반납하고 다음 eligible 대기자를 재입장시키도록 연결
- **[src/app.js]**: API 시작·종료 생명주기에 입장 제한시간 워커를 등록·정리
- **[README.md]**: 입장 제한시간, admitted 상한, backfill 규칙 및 신규 API·환경변수 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 자동 승인 워커가 주기마다 `BATCH_SIZE`만큼 추가 승인하여 admitted 풀이 100명을 초과할 수 있었고, 대기열 페이지 이탈을 서버가 인식하지 못했음
- **원인(Cause):** 승인 시 현재 admitted 수를 차감하지 않았고, 브라우저 이탈을 알리는 프론트엔드 요청과 서버 측 입장 제한시간 감시가 없었음. 또한 일부 갱신 SQL이 실제 `waiting_queue` 스키마에 없는 `queue_status` 컬럼을 참조했음
- **해결(Solution):** admitted 슬롯을 `BATCH_SIZE - 현재 admitted 수`로 계산하고, Redis deadline 메타데이터를 감시하는 워커와 keepalive `/queue/leave` 호출을 추가했다. 실제 스키마에 맞춰 `waiting_queue.status`만 갱신하도록 정리했다.

---
## [2026-09-16 15:06] 업데이트 로그 — 취소표 complete/expire 멱등 처리

### 🔄 변경 및 수정 사항
- **[src/services/cancelAllocationService.js]**: 실제 `cancel_allocations` 컬럼(`allocation_id`, `status`, `responded_at`, `seat_id`)을 기준으로 terminal 상태를 조회하고 중복 요청 결과를 반환하도록 수정
- **[src/routes/cancelQueueRoutes.js]**: `/cancel-queue/respond`와 `/cancel-queue/expire`가 `allocationId`/`allocation_id`를 지원하고, 동일 할당의 중복 요청은 성공으로 처리하며 상태 충돌은 거부하도록 변경
- **[src/services/bPartCallbackService.js]**: B파트 complete/expire의 빈 응답 또는 `204 No Content`를 불필요한 재시도로 판단하지 않도록 처리
- **[README.md]**: 실제 스키마와 A↔B 콜백 경로, allocation ID 형식, 멱등 정책 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** complete/expire 요청이 네트워크 재시도나 브라우저 중복 호출로 여러 번 도착하면 이미 처리된 `cancel_allocations`에 대해 다시 상태 변경 또는 B파트 콜백을 시도할 수 있음
- **원인(Cause):** 기존 로직이 `LINK_SENT` 활성 행만 조회하고 `UPDATE` 결과가 0건인 경우를 이미 처리된 요청으로 구분하지 않음
- **해결(Solution):** `allocation_id`로 현재 행을 재조회하고 `RESPONDED`/`COMPLETED` complete, `EXPIRED` expire를 `idempotent: true` 성공으로 반환한다. `EXPIRED → RESPONDED`, `RESPONDED/COMPLETED → EXPIRED` 같은 역방향 전이는 `409`로 차단한다. 실제 스키마 변경은 필요하지 않다.

---
## [2026-09-16 15:11] 업데이트 로그 — 실제 MariaDB 스키마 정렬

### 🔄 변경 및 수정 사항
- **[src/routes/eventRoutes.js]**: 실제 `events` 테이블에 존재하지 않는 `sessions` 컬럼을 생성 INSERT에서 제거하고, 필수 `title`을 `event_name`과 함께 저장
- **[src/services/seatService.js]**: Redis 이벤트 카드의 MariaDB 자동 복구 INSERT를 실제 `events` 컬럼(`title`, `event_name`, `event_date`, `venue`, `total_seats` 등)에 맞게 수정
- **[src/services/seatService.js]**: 취소표 결제 확정 시 B파트 `/verify-link/complete`를 호출하고, 실패한 콜백은 `callback_outbox`에 저장한 뒤 A파트 상태를 `RESPONDED`로 마감
- **[src/services/dbService.js]**: 신규 DB 초기화 정의를 실제 스키마 기준으로 정렬(`memberships.membership_id`, `tier_name`, `cancel_allocations.seat_id NULL`, `hold_duration`, `failed_at`, `callback_outbox` LONGTEXT 등)
- **[README.md]**: A파트 초기화 테이블 수와 실제 회차·취소표·콜백 저장 구조 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 실제 `events` 테이블에는 `sessions` 컬럼이 없는데 이벤트 생성 및 Redis 장애 후 MariaDB 자동 복구 SQL이 해당 컬럼을 INSERT 대상으로 사용함
- **원인(Cause):** 초기 개발 스키마와 현재 운영 MariaDB 스키마가 달라졌지만 `CREATE TABLE IF NOT EXISTS`는 기존 테이블을 변경하지 않음
- **해결(Solution):** A파트 SQL을 실제 컬럼만 사용하도록 조정하고, 회차 목록은 Redis 이벤트 카드에서 유지하며 좌석·대기열·예약·취소표 할당에는 회차별 `session_date`/`session_time`을 저장하도록 기준을 명확히 함. 기존 운영 테이블에 대한 자동 ALTER나 마이그레이션은 수행하지 않음.

---
## [2026-09-16 15:14] 업데이트 로그 — 취소표 결제 complete 콜백 연결

### 🔄 변경 및 수정 사항
- **[src/services/seatService.js]**: 취소표 할당이 있는 `POST /seats/confirm` 성공 시 B파트 `/verify-link/complete`를 호출하고, 실패 시 `callback_outbox`에 저장하도록 연결
- **[src/routes/cancelQueueRoutes.js]**: B파트 expire 콜백 성공 후 A Redis의 held 좌석도 해제하도록 보완
- **[src/services/cancelAllocationService.js]**: 만료된 `LINK_SENT` 할당이 complete로 전환되지 않도록 `expires_at` 조건을 원자적 UPDATE에 추가
- **[README.md]**: 결제 확정과 B파트 complete 콜백의 실제 연결 흐름을 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 취소표 결제는 A DB에서 `RESPONDED`로 바뀌지만 B파트의 complete 콜백이 호출되지 않음
- **원인(Cause):** 프론트엔드는 `/seats/confirm`을 호출하고, 기존 B 콜백은 별도 `/cancel-queue/respond` 요청에서만 실행됨
- **해결(Solution):** `seatService.confirmSeat()`에서 활성 `cancel_allocations.allocation_id`를 조회해 B complete를 호출하고, 콜백 실패는 `callback_outbox`로 재전달한다. 이후 A 상태도 `allocation_id` 기준으로 멱등 마감한다.

---
## [2026-09-16 15:38] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: 어드민 시뮬레이션 단계3은 취소표 좌석을 복구하고 B파트 전송용 이벤트를 저장하도록 변경. 단계4에서 활성 멤버십 실제 유저를 standby 최우선에 등록한 뒤 저장된 이벤트를 B파트 SQS로 전송
- **[src/services/cancellationEventPublisher.js]**: `isConfigured()`를 추가해 B파트 취소 이벤트 SQS 연결 여부를 명확하게 확인
- **[src/routes/simulationRoutes.js]**: 단계4 응답에 즉시 전송·재시도 outbox·실패 건수를 포함하고, 활성 할당이 이미 있으면 멱등 성공으로 반환

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 어드민의 `단계4: B파트 링크 발급` 버튼이 항상 비활성화되고 API도 `410`을 반환함
- **원인(Cause):** A파트의 중복 배정을 막기 위해 기존 수동 링크 발급 경로를 차단한 상태였으며, 시뮬레이션 단계3에서 B파트 이벤트를 먼저 소비하면 실제 테스트 사용자가 standby에 등록되기 전에 대상에서 빠질 수 있었음
- **해결(Solution):** 단계3은 이벤트를 Redis 시뮬레이션 상태에 준비하고, 단계4에서 멤버십을 확인한 실제 사용자를 standby 최우선에 등록한 다음 동일한 SQS 발행기를 통해 B파트에 위임하도록 순서를 조정

## [2026-09-16 16:00] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: 시뮬레이션 단계2(마감)에서 지정한 실제 유저를 회차별 Redis `queue:standby`와 MariaDB `waiting_queue`에 멱등 등록하도록 수정
- **[src/routes/cancelQueueRoutes.js]**: 로그인 사용자의 `standby`·`WAITING` 대기 공연을 조회하는 `GET /cancel-queue/mine` 추가. Redis가 사용 가능하면 현재 순번과 전체 대기자 수를 보정
- **[src/routes/cancelQueueRoutes.js]**: 대기 행이 `PASSED`로 변경되어도 활성 `cancel_allocations`가 있으면 마이페이지 목록에 유지하도록 조회 조건 보완
- **[src/services/queueService.js]**: standby 접수 마감 후에도 기존 등록 사용자의 상태 재조회는 허용하고 신규 등록만 차단

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 어드민 시뮬레이션에서 공연을 마감해도 마이페이지의 취소표 대기열에 해당 공연이 표시되지 않음
- **원인(Cause):** 마감 API가 실제 테스트 계정을 standby에 등록하지 않았고, 프론트엔드 마이페이지도 서버 `waiting_queue`가 아닌 브라우저 메모리 `cancelQueues`만 사용함
- **해결(Solution):** 마감 시 실제 계정의 Redis·MariaDB 대기열을 함께 기록하고, 마이페이지가 `GET /cancel-queue/mine`을 최초 진입 및 5초 주기로 조회하도록 연결. 시뮬레이션 정리 시 해당 실제 계정의 회차별 standby 기록도 삭제

## [2026-09-16 16:07] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: `waiting_queue.membership_at_join` 컬럼이 없는 초기 스키마에서도 시뮬레이션 실제 유저 등록을 공통 컬럼으로 재시도하도록 호환 처리

---

## [2026-09-16 16:15] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: 조기 마감 처리에서 시뮬레이션의 `realUserEmail`을 지역 변수로 명시해 실제 사용자의 Redis standby 및 MariaDB `waiting_queue` 등록이 실행되도록 수정
- **[README.md]**: 매진·조기 마감 단계의 실제 사용자 등록 동작을 현재 코드 기준으로 갱신

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 조기 마감 후에도 실제 사용자 마이페이지의 취소표 대기열에 공연이 표시되지 않음
- **원인(Cause):** 조기 마감 라우트가 선언되지 않은 `realUserEmail`을 참조하여 실제 사용자 등록 전에 `ReferenceError`로 중단됨
- **해결(Solution):** `const realUserEmail = simData.realUserEmail;`을 추가하여 시뮬레이션 초기화 때 저장한 실제 사용자와 대기열 등록 대상을 일치시킴

---
## [2026-09-17 00:31] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: 취소표 시뮬레이션 초기화에서 실제 멤버십 유저 이메일 입력·계정 생성·멤버십 자동 가입을 제거
- **[src/routes/simulationRoutes.js]**: 단계2 조기 마감은 특정 사용자를 자동 등록하지 않고, 일반 `/cancel-queue/join`으로 직접 진입한 활성 멤버십 대기자만 집계하도록 변경
- **[src/routes/simulationRoutes.js]**: 단계4는 시뮬레이션 중 직접 진입한 `waiting_queue`의 활성 멤버십 standby 최상위 사용자를 확인한 뒤 B파트 SQS로 취소 이벤트를 전달하도록 변경
- **[src/routes/simulationRoutes.js]**: 시뮬레이션 직접 진입 사용자 추적 Set을 추가하고, 정리 시 해당 standby 행만 삭제하도록 보완하여 실제 사용자 계정은 삭제하지 않도록 변경
- **[src/services/queueService.js]**: 일반 `enterStandby()` 성공 경로에서 시뮬레이션 중 직접 진입한 사용자 ID를 기록하는 보조 로직 추가. 추적 실패가 정상 대기열 진입을 차단하지 않도록 처리
- **[README.md]**: 실제 사용자 수동 대기열 진입을 기준으로 한 시뮬레이션 단계 및 B파트 연동 흐름 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 관리자 시뮬레이션의 실제 멤버십 이메일 입력값에 의존해야만 단계2·4를 실행할 수 있어, 실제 사용자가 사이트에서 대기열에 진입한 운영 흐름을 그대로 검증하기 어려움
- **원인(Cause):** 시뮬레이션 초기화가 지정 이메일을 자동으로 사용자·멤버십으로 만들고, 조기 마감과 링크 발급이 해당 ID를 강제로 standby에 등록·최우선 처리함
- **해결(Solution):** 실제 사용자는 일반 `POST /cancel-queue/join`을 통해서만 standby에 등록하도록 변경하고, 단계4는 MariaDB의 활성 멤버십 `WAITING` 행과 시뮬레이션 추적 Set을 기준으로 최상위 대기자를 확인한 뒤 B파트에 이벤트를 위임
## [2026-09-17 01:13] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: 기존 B파트 SQS 시뮬레이션과 분리된 `/admin/local-simulation/*` 라우트를 추가하고, 단계4에서 활성 멤버십 대기자에게 5분 제한 A파트 Secret Link를 Gmail SMTP로 발송하도록 구현
- **[src/app.js]**: 시뮬레이션 라우트를 B 모드와 Local 모드로 각각 등록하고 더미 유저 관리 라우트는 B 모드에서만 등록하도록 중복 라우트 충돌을 방지
- **[src/services/notificationService.js]**: SMTP 설정 여부를 확인하는 `isSmtpConfigured()`를 추가
- **[src/services/cancelAllocationService.js]**: Local SMTP 링크 발급에 사용할 `LINK_SENT` 취소표 할당 생성 함수 추가
- **[src/routes/cancelQueueRoutes.js]**: B 콜백이 설정되어 있어도 A파트가 발급한 로컬 Secret Link JWT를 먼저 검증하도록 보완
- **[src/services/queueService.js]**: 실제 사용자가 취소표 대기열에 진입할 때 B/Local 시뮬레이션별 추적 Set에 사용자 ID 기록
- **[README.md]**: Local SMTP 시뮬레이션 API, Redis 키, 환경변수 및 단계 흐름 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** B파트 콜백 설정이 있는 온프레미스 API에서 Local SMTP 시뮬레이션 링크를 열면 A파트가 발급한 토큰도 B파트 검증으로 전달될 수 있었고, 시뮬레이션 플러그인을 두 번 등록하면 더미 유저 라우트가 중복될 수 있었음
- **원인(Cause):** `/verify-link`가 B 콜백 설정 여부만 먼저 판단했고, B/Local 라우트 등록 시 공통 더미 라우트를 모드 구분 없이 등록함
- **해결(Solution):** A JWT를 먼저 검증하고 실패한 경우에만 B 콜백으로 위임하도록 순서를 조정했으며, 더미 유저 라우트는 B 모드에서만 등록하도록 조건을 추가
## [2026-09-17 09:55] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/cancelQueueRoutes.js]**: 취소표 전용 세션 JWT의 event/allocation 범위를 검증하고, 로컬 SMTP 링크 좌석 선점 시 일반 Redis Admission Token 조회를 생략하도록 수정
- **[src/services/seatService.js]**: 일반 좌석 예매와 취소표 Secret Link 좌석 선점을 구분하는 옵션을 추가하고, 취소표 흐름에서는 일반 대기열 admitted 슬롯 해제를 호출하지 않도록 보완
- **[README.md]**: 취소표 전용 토큰을 사용하는 좌석 선점 동작을 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** Gmail SMTP로 발급된 취소표 링크를 열어도 좌석 선점 단계에서 `취소표 입장 토큰이 만료되었거나 유효하지 않습니다.`가 표시됨
- **원인(Cause):** `/cancel-queue/hold`가 취소표 전용 JWT를 사용하지 않고 Redis의 일반 Admission Token만 조회했으며, 로컬 SMTP 발급 흐름에는 일반 대기열 토큰이 없음
- **해결(Solution):** `verify-link`에서 발급한 `cancel_link_session` JWT의 공연·allocation 범위를 라우트에서 확인한 후 `seatService.holdSeat(..., { cancelLink: true })`로 처리하도록 변경
## [2026-09-17 10:47] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/queueService.js]**: 이미 취소표 standby에 등록된 사용자는 공연 카드의 `ticketCloseAt` 또는 회차별 `closed` 상태가 되어도 `/queue/enter` 재호출에서 `closed`로 종료하지 않고 기존 standby 상태를 유지하도록 수정
- **[src/routes/simulationRoutes.js]**: 로컬·B파트 취소표 시뮬레이션의 단계3 `cancel-seats`가 단계2 조기 마감(`closed`) 이후에만 실행되도록 서버 검증 추가
- **[README.md]**: 시뮬레이션 단계 순서와 조기 마감 후 standby 유지 규칙 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 로컬 시뮬레이션에서 단계2 전에 단계3을 실행할 수 있었고, 이미 대기 중인 사용자가 조기 마감 후 `/queue/enter` 재호출에서 `closed`로 처리되어 취소표 흐름을 계속할 수 없었음
- **원인(Cause):** 취소 좌석 생성 API에 단계 순서 검증이 없었으며, `enter()`가 기존 standby 여부를 확인하기 전에 공연 마감 상태를 우선 반환함
- **해결(Solution):** 단계3을 `closed` 이후로 제한하고, `enter()`가 기존 standby score를 먼저 확인해 마감 판정에서 해당 사용자를 제외하도록 수정. 좌석 선택 페이지는 단계3만으로 열리지 않고, 단계4에서 발급된 Gmail/B파트 Secret Link를 클릭한 경우에만 진입한다.

---
## [2026-09-17 11:41] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/metricsService.js]**: `queuing_queue_eligible`, `queuing_queue_standby`, `queuing_queue_admitted` 갱신 시 기본 Redis 키뿐 아니라 이벤트·회차별 `queue:*:{eventId}:{sessionKey}` 키를 탐색하고 cardinality를 합산하도록 변경. 기존 메트릭 이름과 Grafana 쿼리는 유지
- **[README.md]**: 대기열 메트릭이 회차별 Redis 키를 합산하는 방식과 조회 범위를 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** Prometheus scrape와 Grafana 시계열은 정상 생성되지만 `queuing_queue_eligible` 값이 계속 0으로 표시됨
- **원인(Cause):** 일반 대기열은 회차 컨텍스트가 있으면 `queue:waiting:{eventId}:{sessionKey}`에 저장되는데, 메트릭 갱신 코드는 무회차 기본 키 `queue:waiting`만 조회함
- **해결(Solution):** 기본 키와 회차별 키를 `SCAN`으로 찾은 뒤 사용자 목록이 아닌 각 Sorted Set/Set의 `ZCARD`/`SCARD`만 pipeline으로 합산하여 기존 Gauge에 반영

---
## [2026-09-17 12:11] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/eventRoutes.js]**: `GET /events/:eventId/sessions` 전용 회차 목록 API를 추가
- **[src/routes/eventRoutes.js]**: Redis 이벤트 카드의 `sessions`를 우선 반환하고, 회차 정보가 없으면 MariaDB `seats.session_date/session_time`을 `DISTINCT` 조회하여 복원하도록 구현
- **[README.md]**: 신규 회차 목록 API의 URL, 응답 구조, 데이터 조회 우선순위를 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** B파트가 특정 공연의 회차 목록을 조회할 전용 API가 없어 프론트엔드의 날짜 하드코딩 또는 전체 이벤트 목록 조회에 의존해야 함
- **원인(Cause):** 기존에는 `/events`와 `/event/info` 응답에만 `sessions`가 포함되고, `event_id` 기준의 회차 조회 경로가 없었음
- **해결(Solution):** `GET /events/:eventId/sessions`를 추가하여 `eventId`, `eventName`, `eventDate`, `sessions`, `count`, `source`를 반환한다. Redis에 회차 정보가 없을 경우 MariaDB 좌석의 회차 컬럼에서 복원하고, 좌석 데이터도 없을 때만 이벤트 기본 날짜를 최종 fallback으로 사용한다.
## [2026-09-17 12:32] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/cancelQueueRoutes.js]**: `allocation.seat_id`가 NULL인 취소표 Secret Link도 선택한 회차의 전체 AVAILABLE 좌석을 대상으로 처리하도록 기존 `/cancel-queue/hold` 흐름을 보존·문서화
- **[src/services/cancelAllocationService.js]**: NULL 좌석 할당에 선택 좌석을 `allocation_id` 기준으로 원자적으로 기록하고, 홀드 실패 시 이번 요청의 기록만 되돌리는 `assignSeatById()` / `clearSeatAssignmentById()` 흐름을 보존
- **[README.md]**: B파트 별도 취소표 사이트가 추가되어도 A파트 local SMTP/fallback 링크와 좌석 직접 선택 API를 삭제하지 않도록 보존 정책 및 두 가지 좌석 모드 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** B파트가 `cancel_allocations.seat_id = NULL`로 링크를 발급하는 경우 A파트 기존 화면은 서버가 미리 배정한 좌석만 선택하는 구조로 동작할 수 있었음
- **원인(Cause):** `seat_id`가 NULL인 할당에 대한 좌석 선택·allocation 기록·홀드의 연결 흐름이 명시적으로 분리되어 있지 않았음
- **해결(Solution):** `/verify-link`에서 해당 회차 AVAILABLE 좌석 목록을 반환하고, A파트 화면에서 사용자가 좌석을 선택하면 `/cancel-queue/hold`가 회차·AVAILABLE 상태를 확인한 뒤 allocation 좌석 기록과 Redis/MariaDB 홀드를 이어서 처리한다. 기존 `seat_id`가 있는 서버 배정 모드는 그대로 유지한다.

## [2026-09-17 12:34] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/cancelQueueRoutes.js]**: NULL 좌석 모드에서 취소표 전용 세션·일반 토큰 검증을 allocation 좌석 기록보다 먼저 수행하도록 순서를 정리

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 좌석 선택 요청이 인증·토큰 검증에서 실패해도 그 전에 기록된 `cancel_allocations.seat_id`가 남을 수 있었음
- **원인(Cause):** NULL 모드의 allocation 좌석 기록이 토큰 검증보다 먼저 실행됨
- **해결(Solution):** 인증과 토큰 확인을 완료한 뒤에만 `assignSeatById()`를 실행하고, 이후 좌석 홀드 실패 시에만 해당 요청의 기록을 조건부 NULL 복구하도록 정리
## [2026-09-17 17:33] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/dbService.js]**: B파트 `db_git` 스키마를 변경하지 않고 공용 취소표 풀 검증에 필요한 `cancel_last_campaigns`, `cancel_last_pool_seats`, `cancel_last_candidates` 전용 테이블을 자동 생성하도록 추가
- **[src/routes/lastSimulationRoutes.js]**: 회차별 임의 취소표 풀, 본 티켓팅 참여 멤버십 후보 스냅샷, 순번별 5분 Gmail Secret Link, 공용 좌석 직접 선점·결제·만료 API를 신설. Last confirm은 B파트 콜백을 호출하지 않도록 분리
- **[src/services/seatService.js]**: 기존 좌석 확정 로직을 유지하면서 Last 로컬 테스트가 B파트 complete 콜백을 건너뛸 수 있는 선택 옵션 추가
- **[src/middleware/auth.js]**: Last 취소표 scoped JWT가 전용 좌석 API에 접근할 수 있도록 허용 경로 추가
- **[src/app.js]**: Last 로컬 시뮬레이션 라우트 등록

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 기존 Local 시뮬레이션은 취소 좌석을 사용자별로 1:1 사전 배정하므로, 100석 공용 풀에서 멤버십 순번대로 직접 선택하는 흐름과 B파트 연동 없이 테스트하는 흐름을 검증하기 어려웠음
- **원인(Cause):** 기존 `simulationRoutes.js`는 B파트 이벤트 또는 A파트 Local 1:1 allocation을 기준으로 동작하고, B파트 `cancel_allocations.seat_id` 스키마는 담당 영역이었음
- **해결(Solution):** A파트에 Last 전용 캠페인·풀·후보 테이블과 API를 분리했다. `seat_id=NULL` allocation을 생성한 뒤 현재 순번만 `seatService.holdSeat()`로 공용 풀 좌석을 선점하게 하고, confirm은 MariaDB 예약 저장·Redis SOLD 전환만 수행해 AWS B 콜백과 충돌하지 않도록 했다.
## [2026-09-17 17:46] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/eventCatalogService.js]**: Redis `events:list`와 MariaDB `events`를 공연 ID 기준으로 병합하는 공통 카탈로그 조회 로직을 추가하고, Redis 카드에 회차가 없을 때 MariaDB `seats`에서 날짜·시간을 보완
- **[src/routes/eventRoutes.js]**: 일반 공연 목록 API가 통합 카탈로그를 사용하도록 변경해 Redis에 누락된 DB 공연도 목록에 포함
- **[src/routes/simulationRoutes.js]**: 기존 취소표 시뮬레이션의 공연 선택 API가 통합 카탈로그를 사용하도록 변경
- **[src/routes/lastSimulationRoutes.js]**: Last 시뮬레이션의 공연 선택 API가 통합 카탈로그를 사용하도록 변경
- **[README.md]**: 공연 목록 조회의 Redis·MariaDB 병합 및 회차 보완 정책을 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 어드민에서 공연을 생성했는데 취소표 시뮬레이션의 “공연을 선택하세요” 드롭다운에 공연이 나타나지 않음
- **원인(Cause):** 시뮬레이션 목록 API가 Redis `events:list`만 조회했고, 패널도 페이지 진입 시 한 번만 목록을 불러와 MariaDB에만 남은 공연이나 생성 이후 추가된 공연을 반영하지 못함
- **해결(Solution):** Redis와 MariaDB를 모두 조회해 `eventId` 기준으로 병합하고, Redis 회차 정보가 없으면 좌석 테이블에서 회차를 복원하도록 수정했다. 일반·기존 시뮬레이션·Last 시뮬레이션 목록 API에 동일 로직을 적용했다.
## [2026-09-18 10:07] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/app.js]**: `LAST_SIMULATION_ENABLED` 환경변수가 `true`일 때만 Final 공용 좌석 풀 시뮬레이션 라우트를 등록하도록 변경. 개발 환경은 미설정 시 기존처럼 활성화하고, production은 기본 비활성화해 Final 전용 테이블 초기화·만료 스위퍼가 실행되지 않도록 분리.
- **[redis-api-chart/values.yaml / templates/deployment.yaml / Chart.yaml]**: `env.lastSimulationEnabled` Helm 값과 `LAST_SIMULATION_ENABLED` Pod 환경변수를 추가하고 운영 기본값을 `false`로 설정. 템플릿 변경에 따라 차트 버전을 `2.2.3`으로 증가.
- **[.env.example / README.md / redis-api-chart/README.md / ../argocd/values-prod.yaml]**: 로컬 활성화·AWS 운영 비활성화 기준과 배포 override 값을 문서화.
## [2026-09-18 11:49] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[../argocd/values-prod.yaml]**: AWS API 배포의 DB 연결 대상을 D-Cloud MariaDB(`211.46.52.164:13306`)에서 RDS MariaDB(`queuing-mariadb.cto8u6c4yxyv.ap-northeast-2.rds.amazonaws.com:3306`)로 전환하고, `DB_PASSWORD`를 `app-secrets/RDS_PASSWORD` Kubernetes Secret 참조로 분리.
- **[redis-api-chart/README.md]**: Helm `secretKeyRef`가 AWS Secrets Manager 원본을 직접 읽지 않으며, External Secrets Operator 또는 Secrets Store CSI를 통한 Kubernetes Secret 동기화가 선행되어야 함을 명시.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** Secrets Manager에만 RDS 비밀번호가 있는 상태에서 API Pod가 DB 비밀번호를 주입받지 못할 수 있음.
- **원인(Cause):** Helm Deployment는 Kubernetes Secret 참조만 생성하며 AWS Secrets Manager API 호출 기능이 없음.
- **해결(Solution):** RDS 비밀번호의 원본은 Secrets Manager에 유지하고, `queuing-a/app-secrets`의 `RDS_PASSWORD` 키를 동기화 대상으로 지정.
## [2026-09-18 17:07] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/membershipService.js]**: 멤버십 가입 완료 및 해지 완료 후 사용자 이메일을 조회하여 `notificationService.sendEmail()`로 안내 메일을 발송하도록 추가. 가입/해지 API 응답에 `emailSent`와 메일 실패 사유를 포함하고, 메일 오류가 DB 처리를 실패로 되돌리지 않도록 분리.
- **[README.md]**: 멤버십 가입/해지 메일 발송 흐름과 SMTP/SES 설정 의존성을 문서화.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 마이페이지에서 멤버십 가입 또는 해지를 완료해도 이메일 안내가 발송되지 않음.
- **원인(Cause):** `membershipService.js`가 DB 변경과 프론트 응답만 처리하고 `notificationService.sendEmail()`을 호출하지 않음.
- **해결(Solution):** 가입 성공 후 가입 유형과 만료일을 포함한 메일을, 해지 성공 후 해지 완료 안내 메일을 발송하도록 추가. SMTP/SES 발송 실패는 로그와 `emailSent: false`로 알리되 멤버십 DB 상태는 유지.
## [2026-09-18 17:32] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/dbService.js]**: `initTable()`에 `includeLastSimulation` 옵션을 추가하고, `cancel_last_campaigns`, `cancel_last_pool_seats`, `cancel_last_candidates`, `cancel_last_history` 생성을 Final 시뮬레이션 활성화 시에만 수행하도록 분리했습니다.
- **[src/app.js]**: `LAST_SIMULATION_ENABLED` 값을 `initTable({ includeLastSimulation })`에 전달하도록 변경했습니다. Final 시뮬레이션이 비활성화된 운영 환경에서는 전용 라우트와 전용 테이블 생성이 모두 실행되지 않습니다.
- **[README.md]**: 기본 테이블과 Final 전용 테이블의 초기화 조건 및 기존 테이블·데이터를 자동 삭제하지 않는 정책을 문서화했습니다.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** `lastSimulationEnabled: false`인데도 API 재시작 시 Final 전용 `cancel_last_*` 테이블이 생성될 수 있었습니다.
- **원인(Cause):** 서버 시작 시 항상 호출되는 `initTable()` 내부에 Final 전용 `CREATE TABLE IF NOT EXISTS` 구문이 공통 테이블 초기화와 함께 들어 있었습니다.
- **해결(Solution):** Final 전용 DDL을 `includeLastSimulation` 조건 블록으로 이동하고, `app.js`가 `LAST_SIMULATION_ENABLED`를 기준으로 해당 옵션을 전달하도록 수정했습니다. 설정을 꺼도 이미 존재하는 테이블·데이터는 삭제하지 않습니다.
## [2026-09-18 23:23] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/cancelQueueRoutes.js]**: B파트 ALB 검증 Lambda의 성공 응답 `success: true`를 기존 `valid: true`와 동등한 검증 성공 신호로 수용하도록 보완. 응답의 식별자·만료 시각 교차 검증은 그대로 유지한다.
- **[README.md]**: `/b-callback/verify-link` 연동 계약에 `success: true` 호환 응답을 문서화했다.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** B Lambda가 유효한 링크에 `200 { "success": true, ... }`를 반환해도 A API가 취소표 링크를 무효로 처리했다.
- **원인(Cause):** A API 어댑터가 `valid === true`만 성공으로 판정했고, B의 기존 응답 계약인 `success === true`를 읽지 않았다.
- **해결(Solution):** 성공 판정을 `source.valid === true || source.success === true`로 제한적으로 확장해 두 응답 형식을 모두 수용했다.
## [2026-09-19 09:50] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/bPartCallbackService.js]**: B파트 완료·만료 콜백 경로를 ALB 리스너 규칙과 동일한 `/b-callback/verify-link/complete`, `/b-callback/verify-link/expire`로 변경. 기존 경로는 ALB의 B Lambda 대상 그룹 규칙과 일치하지 않아 기본 대상 그룹으로 전달될 수 있었음.
- **[README.md]**: 취소표 완료·만료 API, B파트 콜백 서비스, 외부 연동 표, `B_CALLBACK_BASE_URL` 환경변수 설명을 실제 ALB 경로로 갱신.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 취소표 결제 완료 또는 링크 만료 시 A API가 B파트 콜백 Lambda에 상태를 전달하지 못할 수 있음.
- **원인(Cause):** 검증 콜백만 `/b-callback/verify-link`를 사용하고 완료·만료 콜백은 `/verify-link/complete`, `/verify-link/expire`로 호출해 ALB 리스너의 경로 기반 규칙과 불일치.
- **해결(Solution):** 세 콜백을 모두 `/b-callback/verify-link/*` 네임스페이스로 통일해 ALB가 각각의 Lambda 대상 그룹으로 라우팅하도록 수정.
## [2026-09-19 13:48] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: AWS(`/admin/simulation`)와 Final Local(`/admin/local-simulation`) 시뮬레이션에 회차별 `sim-member-*` 더미 멤버십 대기자를 추가했습니다. 실제 멤버십 사용자는 이 더미 대기자 뒤 순번으로 등록되며, 단계2 뒤 `POST /remove-dummy-members`로 더미를 제거해야 단계3 취소표 생성이 진행됩니다. 더미 계정은 링크 발급 후보에서 제외하고, 실제 멤버십 사용자만 B파트 또는 SMTP 링크 대상이 되도록 유지했습니다.
- **[src/routes/cancelQueueRoutes.js]**: 취소표 상태·마이페이지 목록 응답에 앞 순번 전체를 기준으로 한 `estimatedWaitMinutes`와 1인당 5분 기준값을 추가했습니다.
- **[src/routes/lastSimulationRoutes.js]**: Final Last 후보 스냅샷에서 `sim-member-*` 테스트 계정을 제외해 실제 멤버십 사용자만 Secret Link를 받도록 보완했습니다.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 매진 시뮬레이션에서 실제 사용자가 더미 대기자보다 앞선 1번으로 보였고, Final 단계의 후보 선정에 더미 멤버십 계정이 섞일 수 있었습니다.
- **원인(Cause):** 기존 `sim-user-*`는 멤버십 standby 통계에서 의도적으로 제외되므로 실제 사용자의 멤버십 순번을 밀어 줄 수 없었습니다.
- **해결(Solution):** 멤버십·본 대기열 이력을 갖는 전용 `sim-member-{mode}-*` 행을 Redis와 MariaDB에 함께 생성하고, 순번 표시는 이를 포함하되 후보 선정 함수에서는 해당 접두사를 제외했습니다. 조기 마감 뒤 전용 삭제 단계로 더미를 제거하면 실제 사용자의 순번과 예상 시간이 즉시 다시 계산됩니다.
## [2026-09-19 14:20] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/simulationRoutes.js]**: 매진 연출 시 비회원 `sim-user-*` 더미도 회차별 Redis standby와 MariaDB `waiting_queue`의 본 대기열·standby 행에 모두 등록하도록 보완했습니다. 비회원 더미는 `membership_at_join=0`으로 기록되어 B파트 Secret Link 후보에서는 제외됩니다.
- **[src/routes/simulationRoutes.js]**: 더미 멤버십 삭제 API가 전체 삭제 대신 회차의 선두 대기자 10명씩만 삭제하도록 변경했습니다. 남은 인원이 0일 때만 단계3을 허용하며, 매 요청마다 남은 더미 수를 반환합니다.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 매진에 사용한 비회원 더미 10,000명은 좌석 점유만 하고 대기열 원장에는 보이지 않았으며, 더미 멤버십 삭제 시 실제 사용자의 예상 대기시간 변화 과정을 확인할 수 없었습니다.
- **원인(Cause):** 기존 매진 로직은 남은 좌석보다 많은 일부 일반 더미만 Redis에 임시 추가했고 MariaDB `waiting_queue`를 동기화하지 않았으며, 멤버십 더미 삭제가 일괄 처리였습니다.
- **해결(Solution):** 모든 일반 더미의 `eligible`·`standby` 행을 배치 삽입하고, 멤버십 더미 삭제는 정렬된 선두 10명만 Redis·MariaDB·계정에서 함께 제거하도록 변경했습니다.

## [2026-09-19 14:39] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/queueService.js]**: 활성화된 AWS·Final 시뮬레이션 회차에서는 멤버십 전용 통계 대신 Redis standby 전체 순번을 반환하도록 보완했습니다. 일반 더미 10,000명과 멤버십 더미 100명이 있으면 실제 사용자가 10,101번으로 표시됩니다.
- **[src/routes/simulationRoutes.js]**: 조기 마감 뒤 일반 `sim-user-*` 대기열 행을 한 번에 제거하는 `POST /remove-standard-dummies` 단계를 추가했습니다. 계정과 매진 좌석 기록은 유지하므로 이후 단계3 취소표 생성은 그대로 수행됩니다.
- **[README.md]**: AWS·Final 공통의 전체 순번 표시 및 일반 더미 삭제 후 멤버십 더미를 10명씩 제거하는 단계 순서를 갱신했습니다.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 일반 더미 10,000명과 멤버십 더미 100명을 만든 뒤 실제 사용자가 대기열에서 101번으로만 표시되었습니다.
- **원인(Cause):** 취소표 대기열 통계가 멤버십 standby만 세도록 되어 있어 일반 더미의 순번 부하가 표시에서 제외되었습니다.
- **해결(Solution):** 시뮬레이션 회차에 한해서 Redis 전체 standby rank를 표시하고, 조기 마감 후 일반 더미의 대기열 행만 별도 삭제하는 단계로 실제 순번 변화와 이후 링크 후보 정책을 분리했습니다.

## [2026-09-19 14:43] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/seatService.js]**: AWS 취소표 시뮬레이션을 포함한 B파트 연동 결제 확정 시 MariaDB 예약 저장 결과의 `reservationId`를 complete callback payload에 추가했습니다.
- **[src/services/bPartCallbackService.js]**: complete callback의 잘못된 `reservation_Id` 인자명을 정정하고 B Lambda 필수 본문 필드인 `reservation_id`를 전송하도록 수정했습니다. 이전 `callback_outbox`의 누락 payload는 사용자·공연·좌석 기준의 최신 `CONFIRMED` 예약을 조회해 재시도 시 보완합니다.
- **[README.md]**: B complete callback의 예약 ID 전달 계약과 활성 시뮬레이션의 전체 순번 표시 규칙을 갱신했습니다.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** AWS 시뮬레이션에서 결제를 완료해도 B Lambda `/b-callback/verify-link/complete`가 `400 { "reason": "missing_fields" }`를 반환해 다음 후보가 즉시 전환되지 않았습니다.
- **원인(Cause):** A파트가 `reservation_id` 없이 완료 콜백을 전송했고, 콜백 서비스의 인자명도 `reservation_Id`로 잘못되어 있었습니다.
- **해결(Solution):** 예약 확정 뒤 생성된 ID를 `reservationId`로 전달하고, B 요청 JSON에는 `reservation_id`로 직렬화했습니다. 과거 재시도 건도 확정 예약을 조회해 같은 필드를 채웁니다.

## [2026-09-19 14:51] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/services/queueService.js]**: AWS·Final 시뮬레이션 회차 판정에서 `HH:mm`과 `HH:mm:ss` 시간 형식을 동일하게 비교하도록 보완했습니다. 활성 시뮬레이션이면 Redis 전체 standby 순번·총원을 반환합니다.
- **[src/routes/cancelQueueRoutes.js]**: `/cancel-queue/mine` 응답에 전체 시뮬레이션 순번인지 구분하는 `simulationQueue` 플래그를 추가했습니다.
- **[README.md]**: 시뮬레이션 대기열의 전체 순번 조건과 시간 형식 호환 규칙을 갱신했습니다.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 일반 더미 10,000명과 멤버십 더미 100명을 생성했지만 실제 사용자의 마이페이지에는 101번만 표시되었습니다.
- **원인(Cause):** 시뮬레이션 상태와 대기열의 회차 시간이 `HH:mm`과 `HH:mm:ss`로 다르게 저장되면 활성 시뮬레이션 판정이 실패해 멤버십 전용 순번으로 폴백할 수 있었습니다.
- **해결(Solution):** 초 단위를 제외해 같은 회차를 판정하고, 시뮬레이션 전체 순번임을 응답 플래그로 전달했습니다.

## [2026-09-19 15:00] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/routes/cancelQueueRoutes.js]**: `/cancel-queue/join`, 상태 조회, 마이페이지 목록을 본 티켓팅 대기열 기준으로 변경해 멤버십 여부와 무관하게 일반 사용자도 standby 순번을 확인할 수 있도록 수정했습니다.
- **[src/services/queueService.js]**: standby 표시 순번·전체 인원을 Redis의 전체 본 티켓팅 대기자로 계산하도록 변경했습니다. B파트의 `getActiveStandbyMembers()`는 그대로 활성 멤버십 사용자만 Secret Link 후보로 선택합니다.
- **[README.md]**: 일반 대기열 참여와 멤버십 Secret Link 후보 정책을 분리해 문서화했습니다.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 비멤버십 일반 더미와 사용자가 본 티켓팅 standby에 존재해도 취소표 대기열 화면에는 멤버십 대기자만 표시되었습니다.
- **원인(Cause):** 표시·목록 API가 멤버십 확인을 선행하고, 순번 집계도 멤버십 후보 SQL만 사용했습니다.
- **해결(Solution):** 본 티켓팅 standby의 전체 Redis rank를 표시 기준으로 사용하고, 이메일 Secret Link 발급을 담당하는 B파트 후보 SQL에만 멤버십 조건을 유지했습니다.
