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
