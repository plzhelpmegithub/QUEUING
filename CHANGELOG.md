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
