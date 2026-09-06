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
