# QUEUING - 예매 대기열 API (Part A)

Fastify 기반 Node.js 백엔드 서버. Redis(대기열/좌석 상태/실시간 이벤트)와 MariaDB(영구 저장)를 이중으로 사용하는 티켓 예매 시스템.

**포트**: 3000  
**런타임**: Node.js  
**프레임워크**: Fastify 5.x

---

## 디렉토리 구조

```
api/
├── package.json
└── src/
    ├── app.js                          # 서버 진입점
    ├── config/
    │   ├── redis.js                    # Redis 클라이언트
    │   └── mariadb.js                  # MariaDB 커넥션 풀
    ├── public/
    │   └── index.html                  # 데모 UI (SPA)
    ├── middleware/
    │   └── auth.js                       # Bearer JWT·본인 계정·취소표 링크 권한 검증
    ├── routes/
    │   ├── authRoutes.js               # 인증 (회원가입/로그인)
    │   ├── eventRoutes.js              # 공연 CRUD
    │   ├── queueRoutes.js              # 대기열 관리
    │   ├── seatRoutes.js               # 좌석 선점/결제/해제
    │   ├── membershipRoutes.js         # 멤버십 구독
    │   ├── wishlistRoutes.js           # 위시리스트
    │   ├── backupRoutes.js             # 백업/복구
    │   ├── cancelQueueRoutes.js        # 취소표 대기열
    │   ├── simulationRoutes.js        # AWS·Final Local·통합 티켓팅 시뮬레이션
    │   └── lastSimulationRoutes.js    # Final 공용 취소표 풀·Gmail 링크 검증
    └── services/
        ├── eventCatalogService.js      # Redis·MariaDB 통합 공연 목록 조회
        ├── authService.js              # 인증 로직 (argon2id + bcrypt 하위호환)
        ├── authTokenService.js         # 세션 Access/Refresh JWT 발급·검증
        ├── cancelLinkTokenService.js   # 취소표 시크릿 링크 JWT 발급·검증
        ├── queueService.js             # 대기열 핵심 로직
        ├── seatService.js              # 좌석 상태 머신
        ├── eventService.js             # Redis Pub/Sub 이벤트 발행
        ├── cancellationEventPublisher.js # 취소표 SQS 이벤트 발행 + outbox 패턴(B파트 연동)
        ├── bPartCallbackService.js     # B파트 콜백 API 클라이언트
        ├── lockService.js              # 분산 락 (Redis)
        ├── timerService.js             # 결제 타이머 (Redis TTL)
        ├── tokenService.js             # Admission Token (JWT)
        ├── metricsService.js           # Prometheus 메트릭
        ├── sseService.js               # SSE 실시간 브로드캐스트
        ├── notificationService.js      # 이메일(SES/SMTP)/SMS(SNS) 알림
        ├── membershipService.js        # 멤버십 CRUD
        ├── wishlistService.js          # 위시리스트 CRUD
        ├── backupService.js            # 스냅샷 백업/복구
        ├── cancelAllocationService.js  # 취소표 할당 관리
        ├── redisRecoveryService.js     # Redis 자동 복구·주기적 정합성 점검
        ├── admissionWorker.js           # 대기열 자동 승인 워커
        ├── admissionTimeoutService.js  # 입장 제한시간 만료·슬롯 재충원
        └── dbService.js                # MariaDB 테이블 초기화
```

---

## 파일별 상세 설명

### package.json

프로젝트 메타데이터와 의존성 정의.

| 의존성 | 용도 |
|---|---|
| `fastify` | HTTP 서버 프레임워크 |
| `ioredis` | Redis 클라이언트 |
| `mariadb` | MariaDB 커넥션 풀 |
| `jsonwebtoken` | Admission Token (JWT) 발급/검증 |
| `@node-rs/argon2` | 비밀번호 해싱 (argon2id, Rust 네이티브 바인딩) |
| `bcryptjs` | 비밀번호 해싱 (기존 해시 하위호환) |
| `prom-client` | Prometheus 메트릭 수집 |
| `nodemailer` | 이메일 발송 (SMTP, Gmail 등) |
| `@aws-sdk/client-ses` | 이메일 알림 (AWS SES) |
| `@aws-sdk/client-sns` | SMS 알림 (AWS SNS) |
| `@aws-sdk/client-sqs` | 취소표 반환 이벤트 발행 (AWS SQS) |
| `dotenv` | 환경변수 로드 |

스크립트: `npm start` (운영), `npm run dev` (개발, --watch)

---

### src/app.js — 서버 진입점

서버 시작과 전체 초기화를 담당.

**주요 역할:**
- Fastify 인스턴스 생성 및 `public/` 정적 파일 서빙
- 8개 라우트 모듈 등록 (auth, event, queue, seat, membership, wishlist, backup, cancelQueue)
- SSE 엔드포인트 (`GET /sse`) 등록
- Prometheus 메트릭 엔드포인트 (`GET /metrics`) 등록
- HTTP 요청 응답 시간 측정 미들웨어 (`onRequest` / `onResponse` 훅)
- 헬스체크 (`GET /health`)
- 서버 시작 시 초기화: Redis 만료 리스너, MariaDB 기본 11개 테이블 생성, 관리자 계정 생성. Final 시뮬레이션이 활성화된 경우에만 `cancel_last_*` 4개 전용 테이블을 추가 생성
- 서버 시작 시 MariaDB 기준 Redis 자동 복구를 최대 3회 시도하고, 이후 주기적 정합성 점검 시작
- `AUTO_ADMISSION_ENABLED=true`일 때 DB의 대기 중인 회차를 찾아 빈 입장 슬롯만큼(최대 `BATCH_SIZE`) 주기적으로 자동 승인하고 Admission Token을 발급
- `SIGINT` 시그널 수신 시 Redis 리스너·자동 복구 타이머 정리 후 graceful shutdown

---

### src/config/redis.js — Redis 클라이언트

ioredis 기반 Redis 단일 연결.

- 호스트: `REDIS_HOST` 환경변수 또는 `localhost`
- 최대 3회 재시도, 시도마다 대기 시간 증가 (`retryDelay * attempt`)
- 3회 초과 시 연결 포기 (`null` 반환)

---

### src/config/mariadb.js — MariaDB 커넥션 풀

mariadb 라이브러리 기반 커넥션 풀.

- 호스트/포트/계정/DB명 모두 환경변수에서 읽음 (기본값: `localhost:3306`, `root`, `queuing_db`)
- `connectionLimit: 10`
- `allowPublicKeyRetrieval: true` (MySQL 8 호환)

---

### src/routes/authRoutes.js — 인증 라우트

| 엔드포인트 | 설명 |
|---|---|
| `POST /auth/register` | reCAPTCHA v3 검증 후 회원가입. 이메일/비밀번호 유효성 검사 후 argon2id 해싱하여 MariaDB 저장 |
| `POST /auth/login` | reCAPTCHA v3 검증 후 로그인. 성공 시 Access/Refresh JWT를 발급하며, 기존 bcrypt 해시는 자동으로 argon2id로 마이그레이션 |
| `POST /auth/refresh` | 유효한 Refresh JWT를 검증한 뒤 새 Access/Refresh JWT를 발급 |
| `PATCH /auth/profile` | Bearer JWT와 본인 `userId`를 함께 검증한 뒤 회원정보 수정. 이름·전화번호·비밀번호·마케팅 수신 동의를 저장하며 이메일은 수정하지 않음 |
| `DELETE /auth/account` | Bearer JWT와 본인 `userId`를 검증한 뒤 비밀번호 재확인 후 계정 삭제 |
| `GET /auth/users` | 전체 사용자 목록 조회 (관리자용) |

인증이 필요한 API는 `Authorization: Bearer <accessToken>` 헤더를 사용한다. 다른 사용자의 `userId`를 요청하거나 관리자 API를 일반 사용자 토큰으로 호출하면 각각 `403 user_mismatch` 또는 `403 forbidden`을 반환한다. 서버에 `JWT_AUTH_SECRET` 또는 `JWT_SECRET`이 없거나 32자 미만이면 보호 API는 `503 auth_not_configured`로 거부한다.

---

### src/routes/eventRoutes.js — 공연 이벤트 라우트

| 엔드포인트 | 설명 |
|---|---|
| `POST /event/create` | 공연 생성. 이벤트 ID는 Redis `event:seq` INCR로 자동 증가 순번 발급(`evt-1`, `evt-2`, ...). `sessions: [{ date, time }]`가 여러 개면 회차마다 독립 좌석 inventory를 만들며, `totalSeats`는 전체 회차 합계, `seatsPerSession`은 회차당 좌석 수로 반환 |
| `GET /event/info` | 공연 정보 조회 (Redis 우선, MariaDB 폴백) |
| `PATCH /event/update` | 공연 정보 수정 + 알림 발송 |
| `POST /event/cancel` | 공연 취소. 좌석 전체 정리, 대기열 초기화, 취소 알림 |
| `GET /events` | 이벤트 목록 조회 (Redis 최신 카드 + MariaDB 누락 이벤트 병합, 좌석 원장에서 회차 보완) |
| `GET /events/:eventId/sessions` | 특정 공연의 회차 목록 조회. Redis 이벤트 카드의 `sessions`를 우선 사용하고, 없으면 MariaDB `seats.session_date/session_time`에서 복원. 응답: `{ eventId, eventName, eventDate, sessions: [{ date, time, ... }], count, source }` |
| `PATCH /events/:eventId/open-time` | 예매 오픈 시간 설정/해제. Redis 카드(`events:list`·`event:info`)와 MariaDB `events.ticket_open_at`에 함께 저장. 미래 시간이면 `scheduleTicketing()`으로 예약, 과거/현재면 `openTicketing()`으로 즉시 오픈. 마감 상태(`status === 'closed'`)이거나 `ticketCloseAt`이 과거 시간인 이벤트는 `open`으로 복구하고 `ticket_close_at`도 해제 |
| `PATCH /events/:eventId/close-time` | 공연 마감 시간 설정/해제. "즉시 마감" 시 `closeTicketing()` 호출 + MariaDB `status=closed`, `ticket_open_at=NULL`, `ticket_close_at` 저장. 미래 시간이면 `scheduleCloseTime()`으로 예약. `ticket_open_at` 해제로 Recovery가 마감을 되돌리지 않음 |
| `DELETE /events/:eventId` | 이벤트 삭제. Redis 카드가 이미 없어도 DB 정리를 항상 진행하며, Redis·DB 양쪽 모두에 없을 때만 404 반환 |
| `POST /events/batch-delete` | 최대 5개 이벤트를 순차 삭제하며 Redis 좌석과 MariaDB 관련 데이터를 함께 정리 |
| `POST /events/seed` | 데모용 더미 이벤트 5개 생성 |
| `POST /admin/redis/reset` | Redis 이벤트 상태 초기화. `hard`/`resync`는 MariaDB 기준으로 이벤트 목록을 재구성하며 DB에 저장된 오픈 예정 시간도 복원 |
| `POST /admin/redis/recover` | MariaDB의 이벤트·좌석·대기열·예매 상태를 Redis로 전체 복구하고, 대상 이벤트의 오픈 예정 시간과 자동 오픈 타이머를 재등록 |
| `POST /admin/test-email` | 이메일 발송 테스트. `{ to, subject?, body? }` — `to`만 필수, 나머지는 기본 테스트 메일 사용 |

---

### src/routes/queueRoutes.js — 대기열 라우트

| 엔드포인트 | 설명 |
|---|---|
| `POST /queue/enter` | 로그인 사용자 Bearer JWT와 reCAPTCHA v3 검증 후 대기열 진입. `eventId`, `sessionDate`, `sessionTime`을 함께 보내면 해당 회차 전용 대기열로 처리 |
| `GET /queue/position/:userId` | Bearer JWT의 사용자와 `userId`가 일치할 때 현재 대기 순번 조회. 회차 query(`eventId`, `sessionDate`, `sessionTime`) 지원 |
| `POST /queue/admit` | 관리자 Bearer JWT로 해당 회차 대기열의 상위 100명 일괄 입장 허용 + 회차 전용 Admission Token 발급. 자동 승인 워커가 켜져 있으면 워커가 같은 로직을 주기적으로 실행 |
| `GET /queue/standby` | standby 목록 조회 |
| `POST /queue/standby` | standby 대기열에 직접 추가 |
| `GET /queue/stats` | 대기열 통계 (eligible/standby/admitted 인원 수) |
| `POST /admin/ticketing/open` | 티켓팅 오픈 |
| `POST /admin/ticketing/close` | 티켓팅 마감 |
| `GET /admin/ticketing/status` | 티켓팅 상태 조회 |
| `POST /admin/ticketing/schedule` | 예매 자동 오픈/마감 스케줄 설정 |
| `POST /admin/ticketing/schedule-standby-close` | standby 마감 시간 설정 |
| `POST /admin/hold-duration` | 결제 제한 시간 설정 |
| `GET /admin/hold-duration` | 결제 제한 시간 조회 |
| `POST /admin/admission-timeout` | 입장 승인 후 제한시간(초) 설정 |
| `GET /admin/admission-timeout` | 현재 입장 제한시간 조회 |
| `POST /queue/leave` | 로그인한 본인 사용자의 대기열 이탈 |
| `POST /admin/queue/simulate` | 대량 사용자 시뮬레이션 (Redis pipeline, 5000명 배치) |
| `POST /admin/queue/reset` | 대기열 전체 초기화 |

### src/routes/simulationRoutes.js — 취소표 시뮬레이션

- `POST /admin/simulation/init`은 공연·회차, 좌석 점유용 더미 유저 수와 멤버십 standby용 더미 인원수를 받아 시뮬레이션 메타데이터·테스트 계정을 준비한다. 실제 사용자 이메일이나 멤버십을 관리자 입력으로 받지 않는다.
- `POST /admin/simulation/sellout`은 더미 좌석을 매진 처리하고 일반 `sim-user-*`와 `sim-member-*` 더미를 시뮬레이션 원장에 넣는다. 취소표 화면의 순번은 활성 멤버십 대기자만 집계하므로 일반 더미는 표시 순번과 Secret Link 후보에 포함되지 않는다.
- 실제 활성 멤버십 사용자만 단계1 이후 프론트엔드의 `POST /cancel-queue/join`으로 취소표 대기열에 등록된다. API는 동일 공연·회차의 본 대기열 참여 이력을 확인해 Redis standby와 MariaDB `waiting_queue`를 함께 기록하며, 비멤버십 사용자는 등록·순번 조회 대상이 아니다.
- `POST /admin/simulation/close`는 ticketing 상태를 `closed`로 변경한다. 이후 `POST /admin/simulation/remove-standard-dummies`가 일반 `sim-user-*` 더미를 전체 삭제하고, `POST /admin/simulation/remove-dummy-members`가 선두 더미 멤버십 사용자를 요청 body의 `count` 파라미터(기본 10, 최대 10,000)만큼 standby·본 대기열 이력·테스트 계정에서 제거한다.
- `POST /admin/simulation/issue-links`는 현재 회차의 `waiting_queue`에서 이 시뮬레이션 동안 실제 서비스 경로로 참여했고, 대기열 진입 당시 멤버십이었던 활성 standby 대기자만 `queue_index` 순으로 후보 확인한다. 더미 ID·진입 당시 비회원·본 대기열 참여 이력이 없는 standby 행은 제외하며, 준비된 취소 이벤트를 SQS로 전달한다. A가 임의 사용자를 standby 최우선으로 올리지 않으며 B파트가 후보 정책에 따라 Secret Link 대상을 처리한다.
- 동일한 흐름을 온프레미스에서 검증할 수 있도록 `/admin/local-simulation/*`를 별도 제공한다. 초기화·매진·마감·일반 더미 전체 삭제·멤버십 더미 삭제(지정 인원)·취소표 생성은 AWS 시뮬레이션과 같은 Redis/MariaDB 흐름을 사용한다. 단계4만 B파트 SQS 대신 A 서버의 Gmail SMTP로 시뮬레이션 중 실제로 참여한 멤버십 대기자만 `queue_index` 순서로 1:1 매칭해 각각 5분 제한 A파트 Secret Link를 발송한다. 이미 유효한 할당은 재발송하지 않고, 만료된 할당은 다음 발급에서 재사용한다.
- 기존 AWS·Final 흐름을 변경하지 않고 `/admin/integrated-simulation/*`를 추가 제공한다. `main-queue`가 일반·멤버십 더미를 본 티켓팅 waiting에 함께 등록하고, `sellout`이 멤버십 더미만 취소표 standby로 전환한다. 실제 멤버십 사용자는 매진 화면의 기존 `/cancel-queue/join` 경로로 진입해야 B파트 후보로 추적된다.

### src/routes/lastSimulationRoutes.js — 취소표 시뮬레이션 Final 공용 풀

- B파트 SQS·Lambda·Step Functions를 호출하지 않고 A파트 Fastify·Redis·MariaDB·Gmail SMTP만으로 취소표 공용 풀을 검증하는 Final 후반부 엔진이다. 관리자 화면에서는 기존 Local의 초기화·매진·조기 마감·취소표 생성 단계와 이 라우트의 풀·후보·링크 단계를 하나의 흐름으로 연결한다. `LAST_SIMULATION_ENABLED=true`로 기동한 경우에만 `cancel_last_campaigns`, `cancel_last_pool_seats`, `cancel_last_candidates`, `cancel_last_history` 전용 테이블을 준비하므로 `db_git`의 B파트 스키마를 변경하지 않는다.
- `LAST_SIMULATION_ENABLED=true`일 때만 앱에 등록하고 전용 테이블 초기화와 만료 스위퍼를 시작한다. 미설정 시 기본값은 `false`이므로 모든 환경에서 명시적으로 `true`를 설정해야 활성화된다. 비활성화하면 Last 관리자·사용자 라우트와 전용 테이블 생성이 모두 실행되지 않는다. 이미 존재하는 `cancel_last_*` 테이블과 데이터는 이 설정으로 삭제하지 않는다. 서버 시작 시 `[Config] LAST_SIMULATION_ENABLED=... → resolved=... → active=...` 로그로 실제 적용 값을 확인할 수 있다.
- `GET /admin/last-simulation/events`는 Last 전용 테이블 초기화와 분리된 `eventCatalogService`를 통해 Redis `events:list`와 MariaDB `events`를 `eventId` 기준으로 병합한다. Redis에 아직 카드가 없거나 복구 전인 공연도 DB에서 표시하며, 카드에 회차가 없으면 `seats.session_date/session_time`에서 회차를 보완한다. Last 테이블 초기화 오류가 공연 선택 목록까지 차단하지 않도록 했다.
- `POST /admin/last-simulation/init`은 Final의 Local 단계에서 풀린 선택 공연·회차의 `AVAILABLE` 좌석을 최대 1,000석까지 전용 풀로 저장한다. Local 초기화 시각을 후보 조회 기준으로 사용해, Local 단계 후 본 대기열에 실제로 들어온 멤버십 사용자가 누락되지 않도록 한다. `close`는 본 티켓팅에 참여한 활성 멤버십 standby만 `membership_at_join=1`·본 대기열 참여 이력과 함께 검증해 본 대기열 `queue_index` 순서로 후보를 스냅샷한다.
- `close`의 `openDelaySeconds`로 취소표 공개 시각을 정하며 Final 관리자 화면은 `0`을 전달해 즉시 공개한다. 시각은 UTC 기준으로 저장·비교한다. `open-pool` 이후 `issue-links`는 후보별로 `seat_id=NULL`인 A파트 `cancel_allocations`와 5분 Secret Link를 생성해 Gmail SMTP로 발송한다. 링크는 모든 후보에게 발급되지만 좌석 선점·결제는 현재 순번 한 명만 통과하며, 완료·만료 후 다음 순번이 진행한다.
- `POST /last-simulation/verify-link`, `GET /last-simulation/pool`, `POST /last-simulation/hold`, `POST /last-simulation/confirm`, `POST /last-simulation/expire`는 첨부 mock 화면 전용 API다. Last 링크는 `seat_id=NULL` allocation으로 공용 풀에서 현재 순번 사용자가 좌석을 선택하고, 기존 Local SMTP 링크도 후보 테이블이 없는 `mode:'local'` 호환 분기로 같은 화면을 사용한다. `verify-link` 응답에는 `currentSequenceNo`와 `canSelect`가 포함되어 프론트엔드가 첫 폴링 전에도 현재 순번 여부를 즉시 판별할 수 있다. 좌석 선점은 기존 `seatService` 분산 락을 사용하고, 프론트엔드는 선점 성공 후 기존 `payment/cancel` 화면으로 이동한다. 결제 화면은 Last scoped token으로 `confirm`을 호출해 MariaDB `reservations`, Last 후보, 공용 풀 상태를 함께 확정하며, 이탈·실패·만료는 `expire`로 정리한다. 두 로컬 경로 모두 B파트 콜백을 건너뛰어 AWS B 운영 파이프라인과 충돌하지 않는다.
- `POST /admin/last-simulation/cleanup-event`는 선택한 `eventId`의 모든 Last 테스트 캠페인·후보·공용 풀을 삭제하고 삭제된 공용 풀 좌석 수를 반환한다. Last 후보에 연결된 allocation 중 아직 처리되지 않은 항목은 만료 처리 후 삭제하고, 해당 좌석은 복원한다. `RESPONDED`/`COMPLETED` allocation과 실제 확정 예약 좌석은 보존한다. Final 화면의 Local 정리와 함께 호출되므로 선택한 공연의 시뮬레이션 더미 데이터를 한 번에 초기화할 수 있다.
- 취소표 scoped token은 `/last-simulation/*` API에서만 사용할 수 있으며, 경로 판정은 프록시 환경에서 축약될 수 있는 요청 URL과 Fastify 라우트 메타데이터를 함께 확인한다. 경로 허용과 별개로 allocation 사용자·이벤트·순번 검증은 각 Last API에서 다시 수행한다.

### src/services/admissionWorker.js — 자동 승인 워커

- `AUTO_ADMISSION_ENABLED=true`일 때만 시작한다. `false`이면 기존처럼 관리자 `POST /queue/admit` 수동 승인만 사용한다.
- `AUTO_ADMISSION_INTERVAL_MS` 간격으로 `waiting_queue`의 `eligible`/`WAITING` 회차를 찾고, 각 회차의 빈 입장 슬롯만큼(최대 `BATCH_SIZE`) 자동 승인한다. admitted 수가 한도에 도달하면 다음 사용자를 자동 승인하지 않는다.
- `JWT_SECRET`이 32자 미만이면 사용자를 `admitted`로 이동하지 않고 자동 승인 사이클을 건너뛴다.
- 승인 시 `JWT_SECRET`로 회차 전용 Admission Token을 먼저 저장한 후 Redis의 `admitted` 집합에 등록하며, MariaDB의 `status`를 `ADMITTED`로 동기화한다. 토큰 발급 전 승인 상태가 보이지 않으므로 프론트의 즉시 재진입에 따른 `RE_QUEUED` 경쟁 상태를 방지한다.
- 여러 API 파드가 동시에 실행되어도 회차별 Redis 분산 락으로 중복 승인을 방지한다.
- `standby` 취소표 대기열은 자동 승인 대상이 아니다.

### src/services/admissionTimeoutService.js — 입장 제한시간·슬롯 재충원

- Admission Token 발급과 함께 생성된 `admission:deadline:*` 키를 주기적으로 확인한다.
- 제한시간(기본 420초/7분)이 지나면 해당 사용자를 `admitted`에서 제거하고 토큰을 무효화하며 MariaDB `waiting_queue.status`를 `EXPIRED`로 갱신한다.
- 만료로 빈 슬롯이 생기면 eligible 대기열에서 정확히 한 명을 backfill하여 Admission Token을 발급한다. 오픈 중이고 eligible 대기자가 없을 때만 본 대기열 참여 표식이 있는 standby를 승격하며, 마감 후 standby는 B파트 취소표 흐름과 분리한다.
- `POST /queue/leave`에서 admitted 사용자가 명시적으로 이탈한 경우에도 동일한 슬롯 재충원이 실행된다. 예매 확정 시에는 상태를 `COMPLETED`로 기록한 뒤 슬롯을 반납한다.
- 여러 API 파드가 동시에 실행되어도 admission 워커와 동일한 회차별 Redis 분산 락을 사용한다.

개발환경 예시:

```env
AUTO_ADMISSION_ENABLED=true
AUTO_ADMISSION_INTERVAL_MS=1000
BATCH_SIZE=100
ADMISSION_TIMEOUT=420
ADMISSION_TIMEOUT_CHECK_INTERVAL_MS=1000
```

---

### src/routes/seatRoutes.js — 좌석 라우트

| 엔드포인트 | 설명 |
|---|---|
| `POST /seats/init` | 좌석 초기화 (Redis Hash 생성) |
| `POST /seats/hold` | reCAPTCHA v3와 좌석 ID에 포함된 회차·Admission Token을 검증한 뒤 분산 락·타이머 시작 |
| `POST /seats/confirm` | reCAPTCHA v3 검증 후 결제 확정. MariaDB reservations 저장, 토큰 무효화, 매진 체크. `paymentMethod=vbank`이면 24시간 이내 입금 확인이 필요하다는 무통장 입금 접수 메일을, 그 외에는 예매 확정 메일을 자동 발송 |
| `POST /seats/cancel` | MariaDB의 최신 `CONFIRMED` 예약을 기준으로 본인 소유권을 검증하고, 예약 `CANCELLED` 변경과 좌석 `AVAILABLE` 복구를 한 트랜잭션으로 처리. 본 티켓팅 중이면 다음 본 대기열 참여자를 일반 입장으로 재충원하고, 마감 후에만 B팀 재판매 이벤트를 발행. 동일 요청 재시도는 멱등 성공으로 응답하며 환불 메일을 중복 발송하지 않음 |
| `POST /seats/release` | 좌석 해제 + standby 자동 배정 |
| `GET /seats/timer/:seatId` | 남은 결제 시간 조회 |
| `GET /seats/sold-out` | 매진 여부 확인 |
| `GET /seats/available` | 상태별 좌석 수 집계 |
| `GET /seats` | 좌석 목록 (Redis SMEMBERS + pipeline HMGET). `eventId`, `sessionDate`, `sessionTime` query로 회차 필터링. 응답: `{ eventId, sessionDate, sessionTime, seats: [{seatId, status, section, price, heldBy, heldAt}], count }` |
| `GET /reservations` | 예약 기록 조회 (MariaDB) |
| `GET /reservations/:seatId` | 특정 좌석 예약 정보 |

---

### src/routes/membershipRoutes.js — 멤버십 라우트

| 엔드포인트 | 설명 |
|---|---|
| `POST /membership/subscribe` | 멤버십 가입 (MONTHLY/ANNUAL) |
| `GET /membership/:userId` | 멤버십 조회 |
| `POST /membership/cancel` | 멤버십 해지 |

---

### src/routes/wishlistRoutes.js — 위시리스트 라우트

| 엔드포인트 | 설명 |
|---|---|
| `POST /wishlist/add` | 위시리스트에 공연 추가 |
| `POST /wishlist/remove` | 위시리스트에서 공연 제거 |
| `GET /wishlist/:userId` | 사용자 위시리스트 조회 |
| `GET /wishlist/check/:userId/:eventId` | 위시리스트 등록 여부 확인 |
| `GET /wishlist/count/:eventId` | 공연별 위시리스트 등록 수 |

---

### src/routes/backupRoutes.js — 백업 라우트

| 엔드포인트 | 설명 |
|---|---|
| `POST /admin/backup/queue` | 대기열 스냅샷 백업 (Redis → MariaDB) |
| `POST /admin/backup/seats` | 좌석 스냅샷 백업 |
| `POST /admin/backup/restore/queue` | 대기열 스냅샷 복구 (MariaDB → Redis) |
| `GET /admin/backup/list` | 백업 목록 조회 |
| `GET /admin/backup/:id` | 백업 상세 조회 |

---

### src/routes/cancelQueueRoutes.js — 취소표 대기열 라우트

| 엔드포인트 | 설명 |
|---|---|
| `POST /cancel-queue/join` | 로그인한 본인이 동일 공연·회차의 본 티켓팅 standby 대기열에 등록하거나 기존 순번을 복원한다. 멤버십 여부와 무관하게 본 티켓팅 순번을 기록하며, Secret Link 후보 선정은 별도 멤버십 조건으로 제한한다. |
| `GET /cancel-queue/status/:eventId/:userId` | 동일 공연·회차의 본 티켓팅 참여 이력이 있는 사용자의 대기 종합 상태 조회. 전체 본 대기열 순번과 앞 순번 1명당 5분의 `estimatedWaitMinutes`, 멤버십 여부, Secret Link 상태를 함께 반환 |
| `GET /cancel-queue/mine` | 로그인한 멤버십 사용자의 진행 중인 취소표 대기열을 조회한다. `waiting_queue`와 사용자·공연·회차별 최신 `cancel_allocations`를 함께 판정해 활성 `LINK_SENT` 할당은 Secret Link 발급 상태로 반환하고, 최신 할당이 `EXPIRED`·`COMPLETED`·`RESPONDED` 등 종료 상태이거나 DB 만료시각을 지난 경우에는 standby 행이 `WAITING`으로 남아 있어도 목록에서 제외한다. 활성 AWS·Final 시뮬레이션 회차는 `simulationQueue: true`, 각 대기 행은 `estimatedWaitMinutes = (myNumber - 1) × 5`를 반환한다. |
| `POST /cancel-queue/allocate` | **410 비활성화** — 취소표 배정은 B파트 Step Functions가 담당 |
| `POST /cancel-queue/allocate-next` | **410 비활성화** — A파트 직접 순차 배정 방지 |
| `POST /cancel-queue/hold` | 취소표 좌석 선점. `allocation.seat_id`가 있으면 해당 좌석만 허용하고, `NULL`이면 요청 좌석이 같은 공연·회차의 `AVAILABLE`인지 확인한 뒤 `cancel_allocations.seat_id`에 원자적으로 기록하고 홀드한다. `verify-link`로 발급된 취소표 전용 세션은 allocation 범위를 검증한 뒤 일반 Admission Token 없이 처리 |
| `POST /cancel-queue/expire` | Secret Link 만료 처리 및 선점 해제. body의 `reason: 'manual'`은 수동 양도로 처리해 standby 대기 행을 `COMPLETED`로 종료하고 사용자 이력을 저장한다. `B_CALLBACK_BASE_URL` 설정 시 B파트 `/b-callback/verify-link/expire`로 포워드 |
| `GET /cancel-queue/history/mine` | 로그인한 사용자의 B파트 수동 양도(`PASSED`) 이력 조회. `cancel_queue_history`만 조회하므로 공연 메타데이터 문제와 분리되며, 결제·환불 예약과 구분되는 안내 기록으로 마이페이지 취소/환불내역에 사용 |
| `POST /cancel-queue/respond` | 취소표 링크 사용자가 좌석 처리 완료. `B_CALLBACK_BASE_URL` 설정 시 B파트 `/b-callback/verify-link/complete`로 포워드 |
| `POST /verify-link` | 이메일 Secret Link 랜딩 — A파트가 발급한 Local SMTP JWT를 먼저 검증하고, 유효하지 않은 경우 `B_CALLBACK_BASE_URL` 설정 시 B파트 `/b-callback/verify-link`로 서버 간 검증을 위임한 뒤 할당 정보 + 선택 가능 좌석 목록 + 검증 주체 `source`(`local`/`b`) 반환 |
| `GET /cancel-queue/pool/:eventId` | Redis 좌석 상태 기반 회차별 취소표 현황 조회 |
| `POST /cancel-queue/expire-overdue` | 만료된 할당 일괄 처리 |
| `GET /cancel-queue/history/:eventId` | 이벤트별 할당 내역 조회 |

`/cancel-queue/respond`와 `/cancel-queue/expire`는 `allocationId` 또는 `allocation_id`를 선택적으로 받을 수 있다. 지정하지 않으면 사용자·공연 기준의 현재 처리 대상 할당을 찾는다. 같은 `allocation_id`에 대해 같은 요청을 반복하면 이미 `RESPONDED`/`COMPLETED`인 complete는 `200`과 `idempotent: true`, 이미 `EXPIRED`인 expire는 `200`과 `idempotent: true`로 반환한다. 반대 상태로의 충돌 요청(완료 후 expire, 만료 후 complete)은 `409`로 거부한다.

`POST /verify-link`의 `source`는 프론트 화면 선택 전용이다. `local`은 기존 `private-link` 화면으로, `b`는 Last 스타일의 B 전용 좌석 화면으로 이동한다. B 화면의 수동 양도와 5분 만료는 모두 `POST /cancel-queue/expire`를 호출하므로 `B_CALLBACK_BASE_URL`이 설정된 운영 환경에서는 B파트 만료 콜백과 다음 후보 워크플로우가 그대로 실행된다. 이 중 수동 양도만 `reason: 'manual'`로 전달되어 대기열 종료와 `cancel_queue_history` 기록이 추가로 수행되며, 시간 만료는 기존 만료 흐름만 유지한다.

`GET /cancel-queue/mine`은 공연·회차가 모두 저장된 allocation을 우선 정확히 매칭한다. 과거 AWS B Lambda가 회차를 비워 저장한 활성 allocation은 현재 사용자가 해당 공연에서 하나의 standby 회차만 갖는 경우에만 호환용으로 연결하며, 여러 회차라면 잘못된 Secret Link 표시를 방지하기 위해 연결하지 않는다.

---

### src/routes/simulationRoutes.js — 취소표 시뮬레이션 라우트

멤버십 전용 취소표 대기열과 Secret Link 정책을 어드민에서 단계별로 재현할 수 있는 시뮬레이션 API.

| 엔드포인트 | 설명 |
|---|---|
| `GET /admin/simulation/events` | DB 등록 공연 목록 조회 (드롭다운용) |
| `POST /admin/simulation/init` | 시뮬레이션 초기화 — 좌석 더미와 입력한 수만큼의 더미 멤버십 대기자 계정을 준비. 실제 사용자 입력·계정·멤버십 자동 등록 없음 |
| `POST /admin/simulation/sellout` | [단계1] 매진 연출 — 전체 좌석 더미 점유(SOLD) + 일반·멤버십 더미를 회차별 시뮬레이션 대기열에 등록. 실제 멤버십 유저는 멤버십 더미 뒤 순번으로 직접 진입 |
| `POST /admin/simulation/close` | [단계2] 조기 마감 — ticketing 상태 closed + 현재 시뮬레이션에서 직접 진입한 활성 멤버십 standby 대기자 집계 |
| `POST /admin/simulation/remove-standard-dummies` | [단계2-1] 일반 더미 전체 삭제 — 조기 마감 뒤 모든 `sim-user-*`를 대기열에서 제거 |
| `POST /admin/simulation/remove-dummy-members` | [단계2-2] 멤버십 더미 삭제 — 선두 `sim-member-*`를 `count` 파라미터(기본 10, 최대 10,000)만큼 standby·본 대기열 이력·테스트 계정에서 제거 |
| `POST /admin/simulation/cancel-seats` | [단계3] 취소표 생성 — 조기 마감 뒤 모든 더미 멤버십 대기자가 제거된 경우에만 더미 좌석 랜덤 취소(AVAILABLE 복원) 및 B파트 전송용 이벤트 준비 |
| `POST /admin/simulation/issue-links` | [단계4] 기존 standby 대기열의 최상위 활성 멤버십 사용자를 확인한 뒤 준비된 취소 이벤트를 B파트 SQS로 전송 |
| `POST /admin/simulation/cleanup` | 시뮬레이션 데이터 일괄 삭제 (더미 유저·좌석·대기열·예약 및 시뮬레이션 중 직접 진입한 standby 행, 실제 계정 자체는 유지) |
| `GET /admin/simulation/status` | 현재 시뮬레이션 단계·좌석·대기열·실제유저 상태 조회 |

`/admin/local-simulation/events`, `/init`, `/sellout`, `/close`, `/remove-standard-dummies`, `/remove-dummy-members`, `/cancel-seats`, `/issue-links`, `/cleanup`, `/status`도 같은 요청 형식과 관리자 인증을 사용한다. 매진 단계는 일반·멤버십 더미를 대기열 원장에 등록하되, 취소표 순번·링크 후보에는 활성 멤버십 대기자만 포함한다. 단계2-1은 조기 마감 후 일반 더미 전체를 삭제하고, 단계2-2는 선두 더미 멤버십 사용자를 최대 10명 삭제한다. 모든 멤버십 더미 삭제가 끝난 `dummy_members_removed` 또는 이미 `seats_cancelled`일 때만 단계3 `cancel-seats`가 허용된다. 순서가 맞지 않은 요청은 `409 simulation_stage_order`로 거부한다. 로컬 단계4는 `SMTP_USER`·`SMTP_PASS`와 32자 이상의 `JWT_SECRET`이 필요하며, `LOCAL_FRONTEND_BASE_URL`(미설정 시 `http://localhost:5173`)을 링크의 프론트 주소로 사용한다. 발송 성공 후 allocation은 `LINK_SENT`로 저장되고, 로컬 시뮬레이션 정리 시 아직 사용되지 않은 해당 할당은 `EXPIRED`로 마감한다.

`/admin/integrated-simulation/events`, `/init`, `/main-queue`, `/sellout`, `/close`, `/cancel-seats`, `/issue-links`, `/cleanup`, `/status`는 본 티켓팅과 취소표 전환을 연속 검증하는 별도 관리자 흐름이다. 일반 더미는 본 티켓팅 waiting에만 남고 멤버십 더미만 취소표 standby로 이동한다. 실제 사용자는 기존 서비스 정책대로 활성 멤버십·본 대기열 참여 이력·시뮬레이션 실행 중 직접 진입 조건을 모두 충족해야 링크 후보가 된다. `issue-links`는 B Lambda가 `membership_at_join=1`인 더미까지 후보로 읽는 것을 막기 위해 통합 전용 멤버십 더미를 먼저 제거하며, 정리가 실패하면 SQS 이벤트를 발행하지 않는다. 통합 모드와 기존 모드는 상태 Hash와 더미 계정을 분리하지만 실제 공연 회차의 좌석·대기열 Redis 키는 공유하므로 같은 공연·회차에서 동시에 실행하지 않는다.

**Redis 키:**
- `simulation:{eventId}` (Hash) — 시뮬레이션 메타데이터 (stage, dummyCount, 대상 사용자 등)
- `simulation:{eventId}:standby-users` (Set) — 시뮬레이션이 활성화된 뒤 `POST /cancel-queue/join`으로 직접 진입한 실제 멤버십 사용자 ID 추적
- `simulation:local:{eventId}` (Hash), `simulation:local:{eventId}:standby-users` (Set) — B파트 SQS와 분리된 온프레미스 SMTP 시뮬레이션 상태와 실제 멤버십 대기 사용자 추적
- `simulation:integrated:{eventId}` (Hash), `simulation:integrated:{eventId}:standby-users` (Set) — 본 티켓팅부터 B파트 요청까지 연결한 통합 시뮬레이션 상태와 실제 멤버십 후보 추적

## ⚙️ Core Logic & Code Description — 통합 티켓팅 시뮬레이션

### src/routes/simulationRoutes.js
- **목적:** 기존 AWS·Final 취소표 시뮬레이션을 보존하면서 본 티켓팅 대기열부터 B파트 Secret Link 요청까지 독립적으로 검증한다.
- **주요 기능:** 통합 전용 일반 더미 `sim-integrated-user-*`와 멤버십 더미 `sim-member-integrated-*`를 사용한다. 매진 시 일반 사용자는 본 티켓팅 waiting에 남기고 멤버십 사용자만 취소표 standby로 전환한다. 실제 링크 후보는 더미를 제외하고 시뮬레이션 중 서비스 경로로 직접 진입한 활성 멤버십 사용자만 집계한다.
- **API 명세 / 라우팅 규칙:** `POST /admin/integrated-simulation/init` → `main-queue` → `sellout` → `drain-queue` → `close` → `cancel-seats` → `issue-links` 순서로 실행하며 순서가 어긋나면 `409 simulation_stage_order`를 반환한다. 모든 경로는 관리자 JWT가 필요하고, 링크 요청은 통합 멤버십 더미 자동 정리 후 기존 `CANCELLATION_EVENTS_QUEUE_URL`을 사용한다.

**시뮬레이션 단계 흐름:**
1. `initialized` → 더미 유저 준비 완료
2. `main_queue_open` → 더미로 본 티켓팅 대기열 구성, 실제 사용자 진입 가능
3. `sold_out` → 모든 좌석을 더미에게 SOLD 처리 + 멤버십 사용자를 취소표 standby로 전환
4. `queue_drained` → 대기열에서 더미를 `batchSize`(기본 1000)명씩 점진적으로 제거. `releaseSeatCount` 지정 시 더미 SOLD 좌석을 해당 수만큼 AVAILABLE로 해제. 더미 소진 시 `admitBatch`로 실제 사용자 자동 입장 승인 (반복 호출 가능)
5. `closed` → 티켓팅 마감 + 직접 진입한 멤버십 standby 대기자 집계
6. `seats_cancelled` → 더미 좌석 일부 취소 및 취소 이벤트 준비
7. `link_requested` (B 모드) → 기존 standby 최상위 활성 멤버십 사용자를 확인하고 B파트 SQS로 이벤트 전송
8. `link_requested` (Local 모드) → 준비된 취소 좌석과 활성 멤버십 대기자를 순서대로 1:1 매칭하고, 좌석별 할당을 A파트 `cancel_allocations`에 기록한 뒤 Gmail SMTP로 사용자별 5분 제한 링크 발송
9. `link_requested` (Final 모드) → Local 단계에서 취소한 좌석을 `cancel_last_pool_seats`에 공용 풀로 복사하고, 실제 멤버십 후보를 본 대기열 순서로 확정한 뒤 Gmail 링크를 일괄 발급
10. B 모드는 B파트 Step Functions가 후속 배정하고, Local·Final 모드는 A파트가 Secret Link를 직접 검증

---

### src/services/authService.js — 인증 서비스

- `initUsersTable()`: `ADMIN_BOOTSTRAP_PASSWORD`가 설정된 경우에만 초기 관리자 계정을 생성 (argon2id 해싱). 기존 계정은 덮어쓰지 않음
- `ADMIN_BOOTSTRAP_USER/PASSWORD`: 초기 관리자 계정 생성 전용 환경변수. 비밀번호는 최소 12자이며, 설정하지 않으면 계정을 자동 생성하지 않음
- `register()`: 이메일/비밀번호 유효성 검사, argon2id 해싱 후 저장
- `login()`: argon2id 비교 인증. 기존 bcrypt 해시(`$2` prefix)는 로그인 성공 시 자동으로 argon2id로 재해싱하여 마이그레이션
- `updateProfile()`: 회원정보 수정. 비밀번호 변경 시 argon2id 해싱
- `listUsers()`: 전체 사용자 목록 (비밀번호 제외)

**argon2id 설정:** `@node-rs/argon2` 사용, memoryCost=19456, timeCost=2, parallelism=1, outputLen=32

### src/services/authTokenService.js — 세션 JWT

- 로그인 성공 시 4시간 유효한 Access JWT와 7일 유효한 Refresh JWT를 발급한다.
- `JWT_AUTH_SECRET`가 32자 미만이거나 없으면 발급하지 않으며, production에서는 서버가 기동하지 않는다. 코드에 기본 시크릿 fallback은 없다.
- Refresh JWT는 `POST /auth/refresh`에서만 사용하고, Access JWT는 보호된 API의 Bearer 헤더에 사용한다.

### src/middleware/auth.js — API 권한 검증

- `authenticate`: Bearer Access JWT의 서명·만료·토큰 종류를 검증한다.
- `requireRole('admin')`: 관리자 전용 API를 보호한다.
- `requireSelf`: URL·query·body의 `userId`가 로그인 사용자와 같은지 검증하여 ID 변조를 차단한다.
- `allowUserOrCancelLink` / `requireSelfOrLink`: Authorization 헤더에 실제 Bearer 토큰이 있으면 일반 사용자 JWT로 인증하고, 없으면 요청에 포함된 `linkToken`(cancel link JWT)으로 폴백한다. 빈 Bearer 토큰(`Bearer `)은 인증 시도 없이 cancel link token 경로로 진행한다.

### src/services/cancelLinkTokenService.js — 취소표 시크릿 링크

- 취소표 배정 시 `JWT_SECRET`로 서명된 링크 토큰을 발급하고, 배정 만료 시각을 토큰 만료 시각으로 사용한다.
- 토큰에는 `allocationId`, `userId`, `eventId`, `seatId`를 넣어 다른 사용자·공연·좌석으로 재사용하지 못하게 한다.
- 취소표 발급 이메일은 `SITE_URL/#/mypage/cancel-queue?eventId=...`로 로그인 후 마이페이지를 열도록 안내한다. `linkToken` 원문은 이메일 URL이나 일반 API 응답에 노출하지 않고, 서버 상태 조회는 로그인 Access JWT로 본인 여부를 검증한다.

---

### src/services/recaptchaService.js — Google reCAPTCHA v3 검증

- **목적:** 클라이언트가 발급한 reCAPTCHA v3 토큰을 Google `siteverify` API에서 검증하고, 자동화 요청을 핵심 예매 API에서 차단한다.
- **주요 기능:** 토큰 존재 여부, Google 성공 여부, 요청 action, 최소 점수, `RECAPTCHA_ALLOWED_HOSTNAMES`를 검증한다. `RECAPTCHA_SECRET_KEY`가 없으면 개발 편의를 위해 검증을 비활성화하고 기존 흐름을 유지한다.
- **API 명세 / 라우팅 규칙:** `guardRecaptcha()`가 `/auth/login`, `/auth/register`, `/queue/enter`, `/cancel-queue/join`, `/seats/hold`, `/cancel-queue/hold`, `/seats/confirm`의 POST 요청을 보호한다. 실패 시 HTTP 403과 `code: recaptcha_failed`를 반환한다.

---

### src/services/queueService.js — 대기열 서비스 (핵심)

Redis 기반 대기열 관리의 핵심 로직.

**Redis 키:**
| 키 | 타입 | 설명 |
|---|---|---|
| `queue:waiting` | Sorted Set | 예매 가능 대기열 (eligible). score = 순번 |
| `queue:standby` | Sorted Set | 취소표 대기열 |
| `queue:main-participants` | Set | 본 티켓팅 참여 이력. 취소표 직접 진입 자격 및 오픈 중 standby→일반 입장 승격 확인용 |
| `queue:admitted` | Set | 입장 허용된 사용자 |
| `queue:counter` | String | 대기 번호 카운터 |
| `event:ticketing-status` | String | 이벤트 ID가 없는 레거시 요청용 전역 티켓팅 상태 (open/sold_out/closed). 이벤트별 요청은 `event:ticketing-status:<eventId>:<sessionKey>` 사용 |
| `event:schedule` | Hash | 예약 오픈 시각과 자동 마감 설정 |

**주요 함수:**
- `enter()`: 멤버십 여부와 무관하게 Redis `INCR` 값을 그대로 Sorted Set score로 사용해 완전 선착순으로 대기열에 등록한다. 멤버십 score 보정은 하지 않는다. 참여 표식은 Redis `queue:main-participants`와 MariaDB `waiting_queue`에 남겨 취소표 자격 확인에 사용한다. 이미 standby에 등록된 사용자가 조기 마감 뒤 재요청하면 대기열 데이터를 유지하면서 `status: 'closed'`, `type: 'standby'`, `preserveStandby: true`를 반환해 프론트 마감 안내를 표시한다. session-scoped `totalSeatsKey` Redis 키가 존재하지 않을 경우, `events:list` 카드의 `seatsPerSession` 값으로 자동 복원(self-healing)하여 Redis 재시작 후에도 대기열 진입이 가능하다.
- `enterStandby()`: 활성 멤버십과 동일 공연·회차의 본 티켓팅 참여 이력이 확인된 사용자를 취소표 standby에 등록한다. `/cancel-queue/join`은 이 함수를 사용하므로 일반 사용자는 취소표 대기열에 포함되지 않는다.
- `backfillOne()`: 입장 슬롯이 비면 먼저 일반 eligible 대기자를 승격한다. 본 티켓팅이 열려 있고 일반 대기자가 없을 때만 `main-participants` 표식이 있는 standby 사용자를 일반 Admission Token 대상으로 승격하며, 마감 후 standby는 B파트 Secret Link 흐름으로 남긴다.
- `getStandbyMemberStats()`: 활성 멤버십·본 티켓팅 참여 이력이 확인된 standby 사용자의 회차별 순번·전체 인원을 반환한다. 일반 standby 데이터는 취소표 순번에 포함하지 않는다.
- `getStandbyMemberCount()`: 관리자 통계의 standby 수치를 활성 멤버십 대기자 기준으로 계산한다.
- `recordSimulationStandbyUser()`: 시뮬레이션 Hash가 존재하는 동안 일반 대기열·`enterStandby()` 경로로 참여한 사용자만 별도 Redis Set에 기록한다. 단계4는 이 Set과 MariaDB의 `membership_at_join=1`·본 대기열 참여 조건을 교차 검증해 실제 멤버십 후보만 확인한다. 기록 실패가 실제 대기열 진입을 막지는 않는다.
- `admitBatch()`: admitted 현재 인원을 먼저 확인해 빈 슬롯만큼 eligible 상위 사용자를 선택하고, JWT Admission Token을 먼저 발급·저장한 뒤 admitted로 이동하여 승인 상태가 토큰보다 먼저 노출되는 경쟁 상태를 방지한다. 기본 최대 admitted 수는 `BATCH_SIZE=100`이며 MariaDB의 `status`를 `ADMITTED`로 동기화한다.
- `scheduleTicketing()`: 자동 오픈/마감 타이머 설정
- `restoreTicketingSchedule()`: Redis 초기화·복구 후 저장된 오픈 시각을 기준으로 스케줄과 메모리 타이머를 재등록. 이미 오픈 시각이 지났으면 즉시 `open` 상태로 복구
- `scheduleStandbyClose()`: standby 마감 시간 예약

`eventId`, `sessionDate`, `sessionTime`을 전달한 요청은 `queue:waiting:{eventId}:{sessionKey}`처럼 회차별 Redis 키를 사용한다. 회차별 대기열과 Admission Token이 서로 섞이지 않으며, 컨텍스트를 생략한 기존 관리/테스트 API는 기존 전역 키를 계속 사용한다.

---

### src/services/redisRecoveryService.js — Redis 자동 복구

MariaDB를 원본 데이터로 보고 Redis의 필수 상태를 자동으로 맞춘다.

- API 시작 시 Redis 연결 후 DB를 기준으로 복구를 최대 3회 시도
- Redis가 실행 중인 상태에서도 기본 5분(300초)마다 누락·불일치 여부 점검
- `event:info`, `events:list`, 회차별 좌석, 회차별 대기열, `event:schedule`, `event:ticketing-status` 복구
- 여러 API 인스턴스가 동시에 복구하지 않도록 `lock:redis-recovery` 분산 락 사용
- Redis `FLUSHALL`처럼 키가 모두 사라진 경우 다음 점검 주기에 전체 이벤트·좌석·대기열을 복구
- 복구된 미래 오픈 시간은 Node.js 타이머에 다시 등록하고, API가 재시작되어도 DB의 오픈 시간을 기준으로 타이머 재생성
- **양방향 동기화**: DB에 없는 `events:list` Redis 항목을 `hkeys` 비교 후 `hdel`로 자동 제거. 삭제와 복구가 겹쳐도 다음 주기에서 유령 카드가 정리됨
- **관리자 변경 보존 (periodic 안전 모드)**: periodic 복구는 API의 실시간 변경을 덮어쓰지 않도록 최소한의 작업만 수행 — `events:list`는 누락 카드 추가/stale 카드 제거만, `event:info`는 누락 시에만 재생성, `event:ticketing-status`는 존재 시 스킵. startup/manual/forced 복구에서는 기존대로 전체 재구축
- **마감 상태 인식**: `restoreTicketingState()`가 `status === 'closed'`인 이벤트도 마감 상태를 유지 (cancelled뿐 아니라 관리자 마감도 존중)

자동 복구 관련 환경변수:

| 변수 | 기본값 | 설명 |
|---|---:|---|
| `REDIS_RECOVERY_ATTEMPTS` | `3` | 시작/복구 실패 시 재시도 횟수 |
| `REDIS_RECOVERY_INTERVAL_MS` | `300000` | Redis 정합성 점검 주기(밀리초, 최소 5000) |

---

### src/services/seatService.js — 좌석 서비스

Redis Hash 기반 좌석 상태 머신.

**상태 흐름:** `available → held → sold`

**Redis 키:**
- `seat:{eventId}:{section-seat}` (Hash: status, heldBy, heldAt, section, price, eventId, sessionDate, sessionTime)
- `seat:index:{eventId}` (Set: 해당 이벤트의 모든 좌석 키 집합 — SMEMBERS로 O(N) 단일 조회)

한 공연에 여러 `sessions`가 있으면 동일한 배치를 회차별로 반복 생성한다. 따라서 올림픽홀 3,322석 공연이 2회차이면 Redis와 MariaDB에 6,644석이 생성되고, 각 회차의 `/seats` 조회는 선택한 날짜·시간의 3,322석만 반환한다.

**주요 함수:**
- `holdSeat()`: 일반 흐름은 Admission Token과 admitted 상태를 검증하고, 취소표 Secret Link 흐름은 라우트에서 검증한 allocation 범위 안에서 일반 Admission Token 검사 없이 처리 → 분산 락 획득 → 상태를 held로 변경 → 결제 타이머 시작. 일반 흐름에서만 입장 제한시간(admission deadline)을 취소하며, 기존 좌석 예매 흐름의 토큰은 무효화하지 않음
- `confirmSeat()`: 멱등성 보장 — 좌석이 이미 SOLD이고 동일 사용자가 재시도하면 reservations 테이블에서 기존 예약을 조회하여 `{success: true, idempotent: true}` 반환. 핵심 흐름: Redis에서 좌석 가격(`seatInfo.price`) 추출 → MariaDB 예매 기록 저장(가격 포함) → seats 테이블·Redis SOLD 동기화 → 이후 비핵심 작업(카운터 조정, 타이머 취소, 이벤트 발행, 토큰 무효화, admitted 제거/backfill, 매진 체크)은 개별 try-catch로 보호되어 실패 시에도 결제 확정 성공 응답 반환. 취소표 allocation이 있으면 RESPONDED로 갱신한 뒤 `waiting_queue`의 해당 standby 항목도 `COMPLETED`로 업데이트하여 `/cancel-queue/mine`에서 제거
- `cancelSeat()`: Redis 상태와 무관하게 MariaDB 최신 확정 예약을 기준으로 환불 권한을 검증하고, DB 트랜잭션이 완료된 뒤 Redis 좌석·카운터·매진 플래그를 동기화한다. Redis 동기화가 일시 실패해도 MariaDB의 취소 결과를 유지하며, 최초 처리에서만 B파트용 SQS 취소 이벤트를 발행한다.
- `releaseSeat()`: 선점 만료/해제 좌석을 available로 복구하며 A파트에서 standby를 직접 승격하지 않음
- `cleanupEventSeats()`: 이벤트 취소·삭제 시 공연별 좌석 인덱스 Set에서 대상 키를 조회하고, 좌석 키는 500개 단위 `UNLINK`로 순차 분리해 Redis 이벤트 루프의 대량 `DEL` 블로킹을 완화한 뒤 인덱스 Set과 회차별 카운터를 정리
- `getAllSeats()`: 좌석 인덱스 Set(SMEMBERS) + pipeline HMGET으로 좌석 조회. 1.5초 TTL 인메모리 캐시를 적용하여 동시 다수 요청 시 Redis 왕복을 1회로 축소. 좌석 상태 변경(hold/confirm/cancel/release) 시 해당 eventId 캐시를 즉시 무효화. 회차 컨텍스트가 있으면 해당 회차만 필터링. eventId 없이 호출 시에만 SCAN 폴백
- `recoverSeatsFromMariaDB()`: MariaDB에서 좌석 복구 후 인덱스 Set 재구성

---

### src/services/eventService.js — 이벤트 발행 서비스

Redis Pub/Sub + SSE + Prometheus 연동.

**Pub/Sub 채널:** `events:seat-status`

**이벤트 타입:**
| 타입 | 발생 시점 |
|---|---|
| `HELD` | 좌석 선점 |
| `SOLD` | 결제 완료 |
| `RELEASED` | 좌석 해제 |
| `CANCELLED` | 좌석 취소 |
| `SOLD_OUT` | 전석 매진 |

각 이벤트 발행 시 Redis Pub/Sub 발행 + SSE 브로드캐스트 + Prometheus 카운터 증가를 동시에 수행.

---

### src/services/cancellationEventPublisher.js — 취소표 SQS 이벤트 발행 + Outbox

B파트의 Step Functions + Lambda 재판매 파이프라인에 좌석 반환 이벤트를 전달한다. SQS 발행 실패 시 `cancellation_outbox` 테이블에 저장하고 30초 주기로 재시도하는 outbox 패턴을 사용한다. 어드민 시뮬레이션의 단계4도 같은 발행기를 사용하므로 실제 운영 흐름과 동일한 B파트 연동 경로를 검증할 수 있다.

- `publishCancellationEvent()`: `event_id`, `seat_id`, `reservation_id`, `dedup_key`를 포함한 JSON 메시지를 SQS로 발행. `dedup_key`는 `{event_id}#{seat_id}#{reservation_id}` 형식으로 B파트 Step Functions 실행 이름(멱등성 키)으로 사용된다
- `isConfigured()`: `CANCELLATION_EVENTS_QUEUE_URL` 또는 호환 별칭 설정 여부를 확인한다. 미설정 상태에서 단계4를 실행하면 링크 발급 요청을 보내지 않고 설정 오류를 반환한다
- SQS 발행 실패 시 `cancellation_outbox` 테이블에 PENDING 상태로 저장 (fire-and-forget 방지)
- 큐 URL 미설정 시에도 outbox에 저장하여 나중에 큐가 구성되면 재발행 가능
- `relayCancellationOutbox()`: PENDING 상태 outbox 항목을 최대 50건 조회 → SQS 재발행 시도 → 성공 시 SENT, 3회 실패 시 FAILED로 마킹. `app.js`에서 30초 `setInterval`로 실행

---

### src/services/bPartCallbackService.js — B파트 콜백 API 클라이언트

`B_CALLBACK_BASE_URL` 환경변수가 설정되면 취소표 링크 검증과 할당 상태 전환을 B파트 API에 위임한다. 링크 검증 요청에는 `X-Callback-Secret` 헤더를 함께 전송한다. 미설정 시 `/verify-link`만 A파트의 로컬 JWT 검증을 사용한다 (로컬 개발 모드).

- `isConfigured()`: `B_CALLBACK_BASE_URL` 설정 여부 반환
- `callbackVerifyLink(token)`: B파트 `${B_CALLBACK_BASE_URL}/b-callback/verify-link`에 `POST` — 브라우저에서 전달된 Secret Link 토큰을 B파트에서 검증
- `callbackComplete({ userId, eventId, seatId, allocationId, reservationId })`: B파트 `${B_CALLBACK_BASE_URL}/b-callback/verify-link/complete`에 POST — 확정 예약의 `reservation_id`까지 함께 보내 사용자가 좌석 선택을 완료했음을 B파트 Step Functions에 알림. 이전 outbox payload에 ID가 없으면 A DB의 해당 확정 예약을 조회해 보완한다.
- `callbackExpire({ userId, eventId, seatId, allocationId })`: B파트 `${B_CALLBACK_BASE_URL}/b-callback/verify-link/expire`에 POST — Secret Link 만료를 B파트에 알려 다음 대기자 배정을 트리거

complete/expire 콜백은 B파트가 `200` JSON 또는 `204 No Content`로 응답해도 성공으로 처리한다. complete 본문은 `allocation_id`, `event_id`, `seat_id`, `reservation_id`를 포함한다. A파트의 `/cancel-queue/respond`, `/cancel-queue/expire`는 먼저 A DB의 `cancel_allocations` 상태를 확인하여 terminal 상태의 중복 요청을 B파트로 재전송하지 않는다. 최초 콜백 성공 뒤에는 A DB도 `allocation_id` 기준으로 상태를 동기화한다. expire 콜백 성공 후에는 A Redis의 해당 사용자의 held 좌석도 해제한다. 취소표 사용자의 `POST /seats/confirm`도 활성 할당이 있으면 예약 저장 직후 동일한 complete 콜백을 자동 호출하고, 실패 시 `callback_outbox`에 저장한 뒤 A DB 할당은 응답 완료로 마감한다.

`cancelQueueRoutes.js`의 `/verify-link`, `/respond`, `/expire` 엔드포인트가 이 서비스를 사용한다. B파트 검증 응답의 식별자와 A파트 `cancel_allocations`를 대조하여 다른 할당으로 변조되는 것을 차단한다. B파트 콜백 실패 시 complete/expire 요청은 `callback_outbox`에 저장되어 재시도된다.

#### B파트 `/b-callback/verify-link` 연동 계약

- **요청:** `POST ${B_CALLBACK_BASE_URL}/b-callback/verify-link`
- **헤더:** `Content-Type: application/json`, `X-Callback-Secret: ${B_CALLBACK_SECRET}`
- **본문:** `{ "token": "B파트가 발급한 Secret Link 토큰" }`
- **성공 응답:** `200`과 함께 아래 식별자·만료 정보를 반환해야 한다. 성공 표시는 `valid: true` 또는 B Lambda 호환 응답인 `success: true` 중 하나를 사용하며, 식별자·시간 필드는 camelCase와 snake_case 중 하나를 사용할 수 있다.

```json
{
  "valid": true,
  "success": true,
  "user_id": "user@example.com",
  "event_id": "evt-123",
  "allocation_id": 1,
  "seat_id": null,
  "expires_at": "2026-09-16T15:00:00.000Z",
  "session_date": "2026-09-20",
  "session_time": "19:00"
}
```

- A파트는 `valid: true` 또는 `success: true`가 없거나, `user_id`, `event_id`, `allocation_id` 식별자가 없으면 검증 응답 오류로 처리한다.
- A파트는 `allocation_id`가 자사 `cancel_allocations`의 활성 할당과 일치하는지 확인한 뒤, A파트 DB 만료 시각과 B파트 만료 시각 중 더 이른 시간을 클라이언트에 전달한다.
- 실제 `cancel_allocations.allocation_id`는 `INT AUTO_INCREMENT` 기본 키이므로 B파트가 전달하는 값도 문자열 예시(`ALLOC-001`)가 아닌 A DB에 생성된 정수 ID와 일치해야 한다. `callback_outbox.id`는 별도의 outbox 자동 증가 키다.
- 토큰이 유효하지 않으면 `401`, 만료되었으면 `410`과 `{ "valid": false, "reason": "expired" }`를 반환해야 한다. B파트 연결 실패나 잘못된 응답은 A파트가 `502`로 반환한다.
- A파트는 B파트 토큰을 직접 해석하거나 로그에 기록하지 않는다. 링크 토큰은 서버 간 검증 요청으로만 전달된다.

---

### src/services/lockService.js — 분산 락 서비스

동시 좌석 선점 경합 방지를 위한 Redis 기반 분산 락.

- `acquireLock()`: `SET NX EX`로 락 획득 시도. 최대 3회 재시도 + 랜덤 지터(jitter)로 동시 재시도 분산. TTL 5초 자동 만료(데드락 방지)
- `releaseLock()`: Lua 스크립트로 "본인 토큰일 때만 삭제"를 원자적으로 처리
- `getLockInfo()`: 디버깅용 락 상태 조회

**Redis 키:** `lock:{resource}` (예: `lock:A-001`)

---

### src/services/timerService.js — 결제 타이머 서비스

Redis 키 만료(keyspace notification)를 활용한 결제 시간 제한.

- `startTimer(seatId, userId, customDuration?)`: 좌석 선점 시 호출. `timer:seat:{seatId}` 키를 TTL 설정으로 생성. `customDuration` 전달 시 글로벌 `HOLD_DURATION` 대신 해당 값(초) 사용 (취소표 hold 시 allocation 잔여 시간 동기화용)
- `cancelTimer()`: 결제 완료 시 키 삭제
- `getRemaining()`: 남은 시간(TTL) 조회
- `initExpiryListener()`: 서버 시작 시 1회 호출. `__keyevent@0__:expired` 채널 구독
  - `timer:seat:*` 키 만료 시:
    - 좌석을 available로 복구 (`releaseSeat`)
    - 해당 사용자를 `admitted`에서 제거 (`removeAdmitted`), 토큰 무효화 + MariaDB `EXPIRED` 갱신
    - 빈 슬롯을 eligible 대기열에서 즉시 재충원 (`backfillOne`), 분산 락으로 동시성 보호
  - 상태 변경 시 MariaDB 동기화 + Pub/Sub 이벤트 발행
- `stopExpiryListener()`: graceful shutdown 시 구독 해제

별도 Redis 연결 사용 (subscribe 모드에서는 다른 명령 불가).

---

### src/services/tokenService.js — Admission Token 서비스

대기열 통과 후 좌석 선택 권한을 부여하는 JWT 기반 토큰.

- `issueToken()`: JWT 발급 + Redis에 저장 (TTL 설정). 관리자 설정 결제 시간 또는 기본 600초
- `verifyToken()`: JWT 서명 검증 → 만료 검사 → userId 일치 확인 → Redis 존재 확인 → 저장된 토큰과 일치 확인 (5단계 검증)
- `revokeToken()`: 결제 확정(confirmSeat) 후 Redis 키 삭제로 재사용 방지
- `getTokenInfo()`: 토큰 메타데이터 조회 (디버깅용)
- `getRawToken()`: 클라이언트가 새로고침 등으로 토큰을 잃어버린 경우 Redis에서 원문 JWT 재조회

**Redis 키:** `admission:{userId}`  
**JWT 시크릿:** `JWT_SECRET` 환경변수 필수(32자 이상). 코드에 기본값 fallback이 없으며, 취소표 링크 토큰에도 사용한다.

---

### src/services/metricsService.js — Prometheus 메트릭 서비스

prom-client 기반 Prometheus 메트릭 수집. `/metrics` 엔드포인트에서 scrape.

**Gauge (실시간 수치):**
| 이름 | 설명 |
|---|---|
| `queuing_queue_eligible` | 예매 가능 대기열 인원 수 |
| `queuing_queue_standby` | 취소표 대기열 인원 수 |
| `queuing_queue_admitted` | 입장 허용된 사용자 수 |
| `queuing_seats_available` | 예매 가능 좌석 수 |
| `queuing_seats_held` | 선점 중 좌석 수 |
| `queuing_seats_sold` | 판매 완료 좌석 수 |

**Counter (누적):**
| 이름 | 설명 |
|---|---|
| `queuing_lock_attempts_total` | 분산 락 시도 (result: success/fail) |
| `queuing_seat_events_total` | 좌석 상태 변경 이벤트 (type별) |
| `queuing_timer_expirations_total` | 결제 타이머 만료 횟수 |
| `queuing_booking_operations_total` | 예매 업무 처리 결과 (operation: hold/confirm/cancel, result: success/rejected/error) |
| `queuing_timer_starts_total` | 좌석 선점 결제 타이머 시작 횟수 |
| `queuing_timer_cancellations_total` | 결제 완료·좌석 해제로 실제 삭제된 타이머 수 |

**Histogram:**
| 이름 | 설명 |
|---|---|
| `queuing_http_request_duration_seconds` | HTTP 응답 시간 (method/route/status별, 10ms~5s 구간). route 라벨은 Fastify 등록 라우트 패턴(`request.routeOptions.url`)을 사용하며, 미등록 경로(봇 요청 등)는 `unknown`으로 통합하여 라벨 카디널리티 폭발을 방지 |

`updateGauges()`: Prometheus scrape 시 Redis의 `seat:metrics:aggregate` 집계 해시와 대기열 키를 읽어 Gauge를 갱신한다. 대기열은 기본 키(`queue:waiting`, `queue:standby`, `queue:admitted`)와 회차별 키(`queue:*:{eventId}:{sessionKey}`)를 함께 찾아 각 키의 `ZCARD`/`SCARD`를 합산한다. 사용자 목록 자체는 읽지 않고 cardinality만 pipeline으로 조회하므로, `queuing_queue_eligible` 등 기존 메트릭 이름과 Grafana 쿼리를 유지하면서 회차별 대기열도 포함한다. 좌석 개별 키에 대한 scrape 시 `SCAN`은 실행하지 않는다.

좌석 집계 해시는 `src/services/seatService.js`가 좌석 상태 변경 시 `HINCRBY`로 유지한다. `initializeSeatMetricAggregate()`는 구버전 Redis에 전역 집계 키가 없을 때만 서버 시작 과정에서 기존 회차별 `seat:counter:*` 해시를 한 번 읽어 초기화한다. 집계 정합성 보정은 기존 `POST /seats/reconcile`를 사용한다.

---

### src/services/sseService.js — SSE 서비스

Server-Sent Events로 브라우저에 실시간 이벤트 푸시 (서버 → 클라이언트 단방향).

- `addClient()`: 브라우저의 EventSource 연결을 Set에 등록. 연결 해제 시 자동 제거
- `broadcast()`: 모든 연결된 브라우저에 SSE 형식(`event: 타입\ndata: JSON\n\n`)으로 전송
- `getClientCount()`: 현재 연결 수

---

### src/services/notificationService.js — 알림 서비스

이메일(SES 또는 SMTP) / SMS(SNS) 듀얼 모드 클라이언트.

- `sendEmail()`: `SMTP_USER`/`SMTP_PASS` 환경변수가 있으면 nodemailer SMTP로 발송, 없으면 AWS SES로 발송
- `isSmtpConfigured()`: 로컬 SMTP 시뮬레이션에서 Gmail SMTP 전송 설정 여부를 확인
- `sendSMS()`: AWS SNS로 SMS 발송
- `notifyEventCancellation()`: 공연 취소 알림 (사용자 목록에게 일괄 발송)
- `notifyEventUpdate()`: 공연 정보 변경 알림

`POST /seats/confirm`은 요청의 `paymentMethod`가 `vbank`(또는 `bank_transfer`)인 경우 무통장 입금 접수 메일을 발송한다. 메일에는 예매 접수 시각부터 24시간 이내 입금해야 좌석이 최종 확정되며, 미입금 시 예매가 자동 취소될 수 있다는 안내가 포함된다.

**이메일 모드 선택:**
| 모드 | 조건 | 설명 |
|---|---|---|
| SMTP | `SMTP_USER` + `SMTP_PASS` 설정 | Gmail 등 외부 SMTP 서버로 실제 메일 발송. `SMTP_HOST`(기본 `smtp.gmail.com`), `SMTP_PORT`(기본 `587`) 커스텀 가능 |
| SES | SMTP 환경변수 미설정 | AWS SES로 발송. `AWS_ENDPOINT` 설정 시 LocalStack 사용(테스트용, 실제 발송 안 됨), 미설정 시 실제 AWS |

---

### src/services/membershipService.js — 멤버십 서비스

MariaDB 기반 멤버십 CRUD.

- `subscribe()`: 멤버십 가입. tier_name(MONTHLY/ANNUAL)에 따라 만료일 계산. 중복 가입 방지 후 가입 완료 안내 메일 발송을 시도한다.
- `getMembership()`: 멤버십 조회. 만료 여부 포함
- `cancelMembership()`: 멤버십 해지 (DB 레코드 삭제) 후 해지 완료 안내 메일 발송을 시도한다. 메일 실패가 DB 가입/해지 결과를 되돌리지는 않으며 응답의 `emailSent`로 결과를 확인할 수 있다.
- `sendMembershipEmail()` 내부 흐름: 사용자 `users.email`을 조회하고 `notificationService.sendEmail()`을 호출한다. SMTP 또는 SES 설정을 그대로 따르며, 발송 성공 여부를 `emailSent`로 반환한다.
- `isPriorityUser()`: 기존 호환용 멤버십 등급 조회. 현재 본 티켓팅 대기열의 순번(score)에는 사용하지 않으며, 멤버십/취소표 정책에서만 필요할 때 사용할 수 있다.

---

### src/services/wishlistService.js — 위시리스트 서비스

MariaDB 기반 위시리스트 CRUD.

- `addWishlist()`: 위시리스트 추가 (중복 등록 시 에러 처리)
- `removeWishlist()`: 위시리스트 제거
- `getWishlistByUser()`: 사용자별 위시리스트 조회 (최신순)
- `isWishlisted()`: 등록 여부 확인
- `getWishlistCount()`: 공연별 등록 수

---

### src/services/backupService.js — 백업 서비스

Redis 상태를 MariaDB에 스냅샷으로 저장하고 복구.

- `saveQueueSnapshot()`: 대기열 상태(eligible/standby/admitted/counter/totalSeats)를 JSON으로 MariaDB backups 테이블에 저장
- `saveSeatSnapshot()`: 전체 좌석 상태를 Redis SCAN + pipeline으로 조회 후 JSON 저장
- `restoreQueueSnapshot()`: 백업 ID로 MariaDB에서 JSON 로드 → Redis 키 삭제 후 복원
- `getLatestBackup()`: 최신 백업 조회
- `listBackups()`: 백업 목록 조회

---

### src/services/cancelAllocationService.js — 취소표 할당 서비스

취소표 할당 기록을 조회·만료 처리한다. [보존] B파트가 별도 취소표 사이트를 제공하더라도 A파트 local SMTP/fallback 흐름을 삭제하지 않는다. 다음 대기자 선택과 Secret Link 발급은 B파트 파이프라인이 담당한다. 실제 테이블의 `allocation_id`를 기준으로 할당을 찾고, B파트가 `seat_id = NULL`로 생성한 행도 처리할 수 있도록 모든 상태 UPDATE를 `allocation_id` 기준으로 수행한다 (SQL `WHERE seat_id = NULL`은 항상 0건 매칭되는 버그 방지).

- `markRespondedById(allocationId, seatId)`: allocation_id로 직접 RESPONDED 상태 변경. seatId가 있으면 함께 업데이트
- `markResponded(userId, seatId, eventId)`: 사용자 처리 대상 할당을 조회한 뒤 `markRespondedById()`로 위임
- `markExpiredById(allocationId)`: allocation_id로 직접 EXPIRED 상태 변경
- `markExpired(userId, seatId, eventId)`: 사용자 처리 대상 할당을 조회한 뒤 `markExpiredById()`로 위임
- `getAllocationById(allocationId)`: 실제 PK인 `cancel_allocations.allocation_id`로 단일 할당 조회
- `getLatestAllocation(userId, eventId)`: terminal 상태를 포함하여 사용자·공연의 최신 할당 조회
- `getActionAllocation(userId, eventId)`: 처리되지 않은 `LINK_SENT` 할당을 우선 조회하고, 없으면 최신 terminal 할당을 조회하여 중복 요청 판별에 사용
- `markRespondedById()` / `markExpiredById()`: 조건부 UPDATE의 영향 행이 0이어도 현재 상태를 재조회하여 같은 terminal 상태면 멱등 성공 결과를 반환
- `expireAllOverdue()`: 단일 `UPDATE ... WHERE status='LINK_SENT' AND expires_at < UTC_TIMESTAMP()` 쿼리로 만료 할당 일괄 처리
- `getActiveAllocation()`: 사용자의 활성 할당 조회
- `assignSeatById(allocationId, seatId)`: `seat_id = NULL`인 `LINK_SENT` 할당에 사용자가 고른 좌석을 만료 시각과 상태를 확인하며 원자적으로 기록. 이미 같은 좌석이 기록된 재시도는 멱등 성공으로 반환하고, 다른 좌석 동시 요청은 거부
- `clearSeatAssignmentById(allocationId, seatId)`: 좌석 홀드 실패 시 이번 요청이 기록한 allocation 좌석만 NULL로 되돌림
- `getAllocation()`: 사용자·이벤트별 할당 조회 (만료 포함 여부 선택)
- `getAllocationHistory()`: 이벤트별 전체 할당 내역
- `expireAllocation()`: 활성 할당을 만료시키고 선점 중인 좌석을 해제. `seat_id`가 NULL인 할당은 좌석 해제를 건너뜀

할당에는 `event_id`, `session_date`, `session_time`을 함께 저장해 회차별 Admission Token과 좌석을 분리한다. 판매 좌석 취소(`POST /seats/cancel`)가 성공하면 A파트는 SQS 취소 이벤트만 발행하고, 다음 멤버십 사용자 선택·Secret Link 발급은 B파트가 수행한다. 취소표 예매 확정(`POST /seats/confirm`) 시 B파트 complete 콜백을 호출한 뒤 할당을 `RESPONDED`로 변경한다. 콜백 실패도 outbox에 보관되므로 결제 확정 자체가 중복 콜백으로 되지 않는다.

---

### src/services/dbService.js — DB 초기화 서비스

MariaDB 테이블 생성 및 reservations CRUD.

**A파트가 초기화하는 기본 테이블 (11개):**
| 테이블 | 설명 |
|---|---|
| `users` | 사용자 계정 |
| `memberships` | 멤버십 구독 |
| `events` | 공연 이벤트 |
| `seats` | 좌석 |
| `waiting_queue` | 대기열 (MariaDB 측 동기화용, 기본키 `queue_id`) |
| `cancel_allocations` | 취소표 할당 |
| `cancellation_outbox` | SQS 발행 실패 이벤트 보관 (outbox 패턴) |
| `callback_outbox` | B파트 complete/expire 콜백 실패 요청 보관 (outbox 패턴) |
| `wishlists` | 위시리스트 |
| `backups` | 스냅샷 백업 |
| `reservations` | 예약 확정 기록 |

공연 회차 목록은 Redis 이벤트 카드의 `sessions` 필드에서 관리하고, 실제 MariaDB `events` 테이블에는 회차 JSON을 저장하지 않는다. `seats`, `waiting_queue`, `reservations`, `cancel_allocations`에는 `session_date`·`session_time`을 저장해 날짜가 다른 회차의 좌석·대기열·예약·취소표 할당 기록을 분리한다.
`initTable({ includeLastSimulation })`은 공통 테이블을 항상 준비하고, `includeLastSimulation=true`일 때만 Final 전용 4개 테이블을 추가로 `CREATE TABLE IF NOT EXISTS`한다. `LAST_SIMULATION_ENABLED=false`이면 Final 라우트와 전용 테이블 생성이 모두 비활성화된다. 이미 존재하는 테이블에는 `ALTER TABLE`, `ADD COLUMN`, `MODIFY COLUMN`을 실행하지 않으며, 비활성화 시 기존 `cancel_last_*` 테이블이나 데이터를 삭제하지 않는다. 운영 DB 스키마 변경은 DB 관리자가 별도 마이그레이션으로 수행해야 한다.

현재 운영 스키마에서 `cancel_allocations.allocation_id`는 정수 `AUTO_INCREMENT` PK이며, `seat_id`는 NULL을 허용한다. `cancellation_link`는 B파트가 관리하는 테이블로 A파트의 초기화 대상이 아니다.

reservations CRUD 함수: `saveReservation()`, `getReservationsBySeat()`, `getAllReservations()`, `getReservationsByUser()`, `cancelReservation()`

`saveReservation()`은 `price` 파라미터를 받아 `reservations.price` 컬럼에 저장하며, INSERT 결과의 `reservation_id`(`insertId`)를 `reservationId`로 반환한다. `confirmSeat()`에서 호출 시 Redis 좌석 해시의 `price` 필드를 읽어 전달하므로, 예매 시점의 가격이 예약 레코드에 영구 보존된다. `getReservationsByUser()` 등 SELECT 함수는 `price` 컬럼을 포함하여 반환한다. `cancelReservation()`은 실제 운영 스키마의 기본키 `reservation_id`를 기준으로 트랜잭션과 행 잠금(`FOR UPDATE`)을 사용한다. `CONFIRMED`, `RESERVED`, `PAID` 상태를 활성 예약으로 보고 현재 예약자가 요청 사용자와 일치할 때만 `reservations.status='CANCELLED'` 및 `seats.status='AVAILABLE'`을 함께 반영한다. 이미 취소된 동일 예약은 `idempotent: true`로 반환해 좌석 재판매 이후의 상태를 다시 덮어쓰거나 이메일·SQS 이벤트를 중복 생성하지 않는다.

---

### src/public/index.html — 데모 UI

Fastify static 서빙으로 제공되는 단일 HTML SPA. 전체 예매 플로우를 테스트할 수 있는 데모 페이지.

**페이지 구성:**
| 페이지 | 설명 |
|---|---|
| 홈 | 배너 슬라이더 + 이벤트 카드 그리드 (`GET /events`로 동적 로드) |
| 공연정보 | 공연 상세 + 티켓팅 상태 표시 + 예매 버튼 |
| 대기열 | 대기 순번 표시 + Admission Token 발급 + 자동 입장 |
| 좌석 선택 | 좌석 그리드 (available/held/sold 색상 구분) + 등급별 가격 + 결제 타이머 |
| 결제 | 예매 정보 확인 + 결제 수단 선택 + 타이머 |
| 결제 완료 | 예매 확인 정보 표시 |
| 이벤트로그 | SSE 실시간 이벤트 로그 + WebSocket 좌석 현황 (C팀 `ws://192.168.0.220` 연동) |
| 관리자 | 공연 생성, 티켓팅 제어(3단계), 결제 제한 시간 설정, 실시간 현황, 예약 기록, 공연 취소, 이벤트 목록 관리 |

**기능:**
- 간이 로그인 (커스텀 ID 또는 랜덤 생성)
- SSE 이벤트 자동 수신 + 이벤트 로그 실시간 표시
- 관리자 대시보드 5초 자동 새로고침
- 결제 타이머 3분 남으면 경고 모달

---

## 핵심 흐름

```
1. 공연 생성 (관리자)
   POST /event/create → Redis + MariaDB 저장, 회차별 좌석 inventory 초기화

2. 티켓팅 오픈
   POST /admin/ticketing/open → event:ticketing-status = "open"

3. 대기열 진입 (사용자)
   POST /queue/enter → 선택 회차의 queue:waiting Sorted Set에 추가 (멤버십 우선순위 적용)

4. 입장 허용
   `AUTO_ADMISSION_ENABLED=true`이면 자동 승인 워커가 선택 회차의 admitted 빈 슬롯만큼, `BATCH_SIZE` 설정값을 상한으로 주기적으로 승인한다. 비활성화 시 관리자 Bearer JWT로 POST /queue/admit을 호출한다.

5. 좌석 선점
   POST /seats/hold → Token 검증 → 분산 락 → held 상태 → 결제 타이머 시작

6. 결제 확정
   POST /seats/confirm → sold 상태 → MariaDB reservations 저장 → 매진 체크

7. 타이머 만료 시
   Redis keyspace notification → 좌석 자동 해제 또는 standby 자동 배정

8. Redis 복구
   API 시작 시 자동 복구 → 60초마다 누락 여부 점검 → 필요할 때 MariaDB 이벤트·좌석·대기열·예매 상태 복구 + 이벤트 오픈 시각 복원 + 자동 오픈 타이머 재등록
```

---

## 외부 연동

| 대상 | 용도 | 주소 |
|---|---|---|
| C팀 WebSocket 서버 | 좌석 실시간 현황 | `ws://192.168.0.220` |
| B팀 Step Functions + Lambda | SQS 취소 이벤트 기반 순차 재판매·Secret Link 발급. 검증: `/b-callback/verify-link`, 상태 콜백: `/b-callback/verify-link/complete`, `/b-callback/verify-link/expire` | `queuing-cancellation-events` SQS + `B_CALLBACK_BASE_URL` |
| LocalStack | AWS SES/SNS 로컬 에뮬레이션 | `http://192.168.0.191:4566` |

---

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3000` | 서버 포트 |
| `REDIS_HOST` | `localhost` | Redis 호스트 |
| `REDIS_PORT` | `6379` | Redis 포트 |
| `DB_HOST` | `localhost` | MariaDB 호스트 |
| `DB_PORT` | `3306` | MariaDB 포트 |
| `DB_USER` | `root` | MariaDB 사용자 |
| `DB_PASSWORD` | `root` | MariaDB 비밀번호 |
| `DB_NAME` | `queuing_db` | MariaDB 데이터베이스명 |
| `JWT_AUTH_SECRET` | *(없음; 필수)* | 로그인 세션 Access/Refresh JWT 서명 키. 32자 이상의 랜덤 값 |
| `JWT_SECRET` | *(없음; 필수)* | 대기열 Admission Token 및 취소표 링크 JWT 서명 키. 32자 이상의 랜덤 값 |
| `ADMIN_BOOTSTRAP_USER` | *(없음)* | 초기 관리자 계정 ID. `ADMIN_BOOTSTRAP_PASSWORD`와 함께 설정할 때만 생성 |
| `ADMIN_BOOTSTRAP_PASSWORD` | *(없음)* | 초기 관리자 비밀번호. 12자 이상, 기존 계정은 덮어쓰지 않음 |
| `HOLD_DURATION` | `600` | 결제 제한 시간 (초) |
| `SMTP_USER` | *(없음)* | SMTP 이메일 계정 (설정 시 SMTP 모드 활성화) |
| `SMTP_PASS` | *(없음)* | SMTP 비밀번호 또는 앱 비밀번호 |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP 서버 호스트 |
| `SMTP_PORT` | `587` | SMTP 서버 포트 |
| `FROM_EMAIL` | `SMTP_USER` 또는 `noreply@queuing.com` | 발신자 이메일 주소 |
| `LOCAL_FRONTEND_BASE_URL` | `http://localhost:5173` | Local SMTP 시뮬레이션 이메일에 포함할 프론트엔드 기본 주소 |
| `LAST_SIMULATION_ENABLED` | `false` | Final 공용 좌석 풀·Gmail 링크 시뮬레이션 라우트 등록 여부. 명시적으로 `true`/`1`/`yes`/`on` 설정 시에만 활성화 |
| `RECAPTCHA_SECRET_KEY` | *(없음)* | Google reCAPTCHA v3 서버 비밀 키. 설정하면 검증 활성화 |
| `RECAPTCHA_REQUIRED` | *(설정값에 따름)* | `false`로 설정하면 비상 시 reCAPTCHA 검증을 일시 비활성화 |
| `RECAPTCHA_SCORE_THRESHOLD` | `0.5` | reCAPTCHA v3 최소 허용 점수 |
| `RECAPTCHA_ALLOWED_HOSTNAMES` | *(없음)* | 검증 응답 hostname 허용 목록. 개발 환경은 `localhost` 권장 |
| `CANCELLATION_EVENTS_QUEUE_URL` | *(없음; AWS 운영 필수)* | B파트 재판매 파이프라인 `queuing-cancellation-events` SQS 큐 URL. 미설정 시 outbox에 저장 |
| `SQS_CANCELLATION_EVENTS_QUEUE_URL` | *(없음)* | 위 변수의 호환용 별칭 |
| `B_CALLBACK_BASE_URL` | *(없음)* | B파트 검증/콜백 API의 base URL. 설정 시 `/verify-link`는 `${B_CALLBACK_BASE_URL}/b-callback/verify-link`, `/respond`는 `${B_CALLBACK_BASE_URL}/b-callback/verify-link/complete`, `/expire`는 `${B_CALLBACK_BASE_URL}/b-callback/verify-link/expire`로 서버 간 포워드 |
| `B_CALLBACK_SECRET` | *(없음)* | A↔B 서버 간 공유 시크릿. `X-Callback-Secret` 헤더로 전송하며 Kubernetes Secret 사용 권장 |

---

### Kubernetes Helm 차트의 Gmail SMTP 설정

`redis-api-chart`는 SMTP 자격증명을 차트에 저장하지 않고, `queuing-a` 네임스페이스에 미리 생성된 `gmail-smtp-credentials` Secret을 참조한다. `smtp.enabled`의 기본값은 `false`이므로 기존 AWS SES/LocalStack fallback이 유지된다.

```yaml
# redis-api-chart 배포 override 예시
smtp:
  enabled: true
```

Secret 키는 애플리케이션이 읽는 이름과 동일해야 한다.

```text
SMTP_USER: Gmail 계정 주소
SMTP_PASS: Gmail App Password
```

실제 App Password는 GitHub, Helm values, Argo CD manifest에 기록하지 않고 Kubernetes Secret으로 주입한다. 차트 상세 구조와 생성 명령은 `redis-api-chart/README.md`를 참조한다.

### Kubernetes Helm 차트의 Google reCAPTCHA 설정

`redis-api-chart`는 reCAPTCHA Secret Key를 Helm values나 Git에 기록하지 않고, `queuing-a` 네임스페이스에 미리 생성된 `recaptcha-credentials` Secret을 참조한다. `recaptcha.enabled`의 기본값은 `false`이므로 기존 배포에 자동으로 검증을 강제하지 않는다.

```yaml
# redis-api-chart 배포 override 예시
recaptcha:
  enabled: true
  required: true
  scoreThreshold: "0.5"
  allowedHostnames: "www.example.com,example.com"
  v2Fallback: true
  secret:
    name: "recaptcha-credentials"
    v3Key: "RECAPTCHA_SECRET_KEY"
    v2Key: "RECAPTCHA_V2_SECRET_KEY"
```

활성화 전 인프라 담당자가 다음 Secret을 `queuing-a`에 생성해야 한다.

```text
Secret 이름: recaptcha-credentials
Secret 키:   RECAPTCHA_SECRET_KEY (v3)
              RECAPTCHA_V2_SECRET_KEY (v2Fallback=true일 때)
```

실제 Secret Key는 프론트엔드 S3 파일이나 Helm values에 넣지 않는다. 프론트엔드에는 Google Site Key만 빌드 환경변수로 포함하고, API는 Secret Key로 Google `siteverify` 검증을 수행한다. 차트 상세 구조와 생성 명령은 `redis-api-chart/README.md`를 참조한다.

### Kubernetes Helm 차트의 API 인증 설정

`JWT_AUTH_SECRET`와 `JWT_SECRET`은 반드시 API가 배포되는 네임스페이스의 `auth-credentials` Secret으로 주입한다. 두 값은 서로 다른 32자 이상의 랜덤 문자열을 사용한다. `values.yaml`이나 Git에는 실제 값을 기록하지 않는다.

```bash
kubectl -n queuing-a create secret generic auth-credentials \
  --from-literal=JWT_AUTH_SECRET='<세션용 랜덤 키>' \
  --from-literal=JWT_SECRET='<Admission·취소표 링크용 랜덤 키>'
```

초기 관리자 계정을 새로 만들 때만 별도 bootstrap Secret을 사용한다. 기존 계정의 비밀번호는 덮어쓰지 않으며, 레거시 모니터링 계정은 더 이상 로그인할 수 없으므로 DB에서 별도로 삭제해야 한다. Secret 생성과 Helm 배포는 인프라 담당자가 수행한다.

### Kubernetes Helm 차트의 Prometheus 메트릭 수집 설정

API 서버는 `prom-client`로 `/metrics` 엔드포인트를 노출한다. Helm 차트는 두 가지 방식으로 Prometheus 수집을 지원한다.

**1) Annotation 기반 디스커버리** — `metrics.enabled: true` (기본값)

Pod와 Service에 `prometheus.io/*` 어노테이션이 자동 추가된다. 독립 Prometheus EC2든 클러스터 내 Prometheus든, `kubernetes_sd_configs`의 `__meta_kubernetes_pod_annotation_prometheus_io_scrape` relabel로 자동 타겟 등록 가능.

```yaml
# values.yaml
metrics:
  enabled: true
  path: "/metrics"
```

**2) ServiceMonitor CRD** — `metrics.serviceMonitor.enabled: true`

`kube-prometheus-stack`(Prometheus Operator)이 설치된 클러스터에서 사용. ServiceMonitor 리소스가 생성되어 Prometheus가 자동으로 타겟을 등록하고, Grafana 통합 대시보드에 `queuing_*` 메트릭이 바로 표시된다.

```yaml
# values.yaml
metrics:
  enabled: true
  serviceMonitor:
    enabled: true
    interval: "15s"
    scrapeTimeout: "10s"
    # Prometheus Operator의 serviceMonitorSelector 라벨과 일치해야 함
    labels:
      release: "kube-prometheus-stack"
```

수집되는 주요 커스텀 메트릭: `queuing_queue_eligible`, `queuing_queue_standby`, `queuing_queue_admitted`, `queuing_seats_available`, `queuing_seats_held`, `queuing_seats_sold`, `queuing_lock_attempts_total`, `queuing_seat_events_total`, `queuing_timer_expirations_total`, `queuing_booking_operations_total`, `queuing_timer_starts_total`, `queuing_timer_cancellations_total`, `queuing_http_request_duration_seconds`.

`queuing_seat_events_total`은 Redis 좌석 상태 이벤트(`held`, `sold`, `released`, `cancelled`, `sold_out`)를 세고, `queuing_booking_operations_total`은 `/seats/hold`, `/seats/confirm`, `/seats/cancel` 업무 요청의 처리 결과를 센다. 두 메트릭은 이름과 측정 대상이 다르므로 예매 성공률과 좌석 상태 이벤트를 중복 집계하지 않고 분리해서 분석할 수 있다.

### Kubernetes Helm 차트의 B파트 재판매 파이프라인 연동 설정

`redis-api-chart`는 B파트 SQS 큐 URL과 콜백 API 주소를 `values.yaml`의 `env` 섹션에서 관리한다. 두 값 모두 선택사항이며, 미설정 시 A파트가 로컬 DB를 직접 업데이트한다.

```yaml
# redis-api-chart 배포 override 예시
env:
  cancellationEventsQueueUrl: "https://sqs.ap-northeast-2.amazonaws.com/123456789/queuing-cancellation-events"
  bCallbackBaseUrl: "https://xxxxxxxxxx.lambda-url.ap-northeast-2.on.aws"
```

SQS 권한: 워커 노드 IAM Role 또는 IRSA에 `sqs:SendMessage` 권한을 추가한다. B파트 콜백 URL은 Lambda Function URL 또는 API Gateway 주소를 사용한다.

### Kubernetes Helm 차트의 대기열 승인 환경변수

`redis-api-chart/values.yaml`의 다음 값이 `templates/deployment.yaml`을 통해 API Pod 환경변수로 주입된다.

```yaml
env:
  autoAdmissionEnabled: true
  autoAdmissionIntervalMs: "1000"
  batchSize: "100"
  admissionTimeout: "420"
  admissionTimeoutCheckIntervalMs: "1000"
```

- `batchSize` → `BATCH_SIZE`: 회차별 admitted 풀의 최대 인원
- `admissionTimeout` → `ADMISSION_TIMEOUT`: 승인 후 입장 제한시간(초)
- `admissionTimeoutCheckIntervalMs` → `ADMISSION_TIMEOUT_CHECK_INTERVAL_MS`: 만료 승인 정리·다음 사용자 보충 주기(밀리초)

값을 변경한 뒤에는 Helm 업그레이드가 완료되어 새 API Pod가 생성되어야 적용된다. 현재 실행 중인 Pod에는 자동으로 반영되지 않는다.

### Kubernetes Helm 차트의 네임스페이스 설정

현재 `redis-api-chart`의 Deployment, Service, HPA, ServiceAccount 템플릿은 `queuing-a`를 직접 사용한다. 따라서 인증·DB·reCAPTCHA·SMTP Secret도 `queuing-a`에 생성해야 한다. 릴리스 기록까지 같은 네임스페이스로 관리하려면 Helm 실행에도 `-n queuing-a`를 지정한다. 기본 MariaDB 접속 계정은 `root`이며, 비밀번호는 `mariadb-credentials` Secret에서 주입한다.

```bash
helm upgrade --install api /root/chart/redis-api-chart \
  -n queuing-a \
  --create-namespace
```

기존 릴리스가 `default`에 이미 생성되어 있다면 `helm list -A --all`로 릴리스 위치를 먼저 확인한 뒤, 기존 릴리스를 임의로 삭제하지 않고 네임스페이스 이전 계획을 세운다.

## 배포·확인 시 주의

- 소스 변경은 API 프로세스가 다시 시작되어야 적용된다. 공유 디렉터리에서 실행 중인 `node --watch`가 파일 변경을 감지하지 못하는 환경에서는 담당자가 API 프로세스를 수동 재시작해야 한다.
- Helm 적용 전에는 `helm template` 또는 `helm install --dry-run --debug`로 렌더링 결과를 확인한다.
- API와 프론트엔드의 포스터 일정이 일치하려면 새 공연 생성 요청에 `sessions` 배열이 포함되어야 한다.

## ⚙️ Core Logic & Code Description — Last 취소표 전용 결제·순번 양도

### src/routes/lastSimulationRoutes.js

- **목적:** A파트 로컬 Final 공용 취소표 풀에서 Secret Link 사용자의 좌석 선택, 전용 결제, 순번 양도를 처리한다. B파트 SQS·Lambda 콜백을 호출하지 않는다.
- **주요 기능:** `POST /last-simulation/confirm`은 Redis 홀드 좌석을 일반 예약과 동일하게 확정하고, `waiting_queue`의 대상 standby 행을 `COMPLETED`로 바꾼다. 완료 메일은 사용자 계정과 통합 공연 카탈로그를 기준으로 보내며, 링크 발급 메일 제목도 `취소표 예매 링크 안내 — 공연명` 형식이다. `payment_method`도 가장 최근 확정 예약에 기록한다.
- **API 명세 / 라우팅 규칙:** `POST /last-simulation/pass`는 선택 좌석이 없을 때 사용자가 순번을 반납하는 API다. 선점 좌석이 있으면 해제하고, 후보 상태를 `PASSED`, standby 행을 `COMPLETED`로 바꾼 뒤 `cancel_last_history`에 기록한다. `GET /last-simulation/history/mine`은 일반 로그인 JWT로 본인의 `PASSED` 기록만 반환한다. `cancel_last_history`는 서버 시작 시 자동 생성되고, Final 더미 데이터 정리 시 해당 캠페인 이력도 함께 삭제된다.

### src/services/dbService.js

- **목적:** MariaDB의 A파트 영속 테이블을 기동 시 준비한다.
- **주요 기능:** 공통 영속 테이블을 초기화하고, `initTable({ includeLastSimulation: true })`일 때만 `cancel_last_campaigns`, `cancel_last_pool_seats`, `cancel_last_candidates`, `cancel_last_history`를 생성한다. 순번 양도는 결제가 없으므로 `reservations` 행을 만들지 않고 Final 전용 이력 테이블에 별도 보관한다.

## ⚙️ Core Logic & Code Description — Last 선점 해제·재선택

### src/routes/lastSimulationRoutes.js

- **목적:** Last 취소표 Secret Link 사용자가 결제 전 선택을 취소하거나 페이지를 다시 열어도, 링크·순번을 유지하면서 안전하게 좌석을 다시 고를 수 있게 한다.
- **주요 기능:** `POST /last-simulation/release`는 Redis에서 사용자 소유 `HELD` 좌석만 `AVAILABLE`로 되돌린다. 공용 풀 후보인 경우 `cancel_allocations.seat_id`를 NULL로 되돌리고 `cancel_last_pool_seats`와 `cancel_last_candidates`도 다시 선택 가능한 상태로 복원한다. 사전 배정 Local 링크는 좌석 배정 자체를 유지하고 홀드만 해제한다.
- **API 명세 / 라우팅 규칙:** `POST /last-simulation/release`는 Link scoped JWT 또는 해당 사용자 세션을 요구하며 `allocationId`를 받는다. 이미 선점이 풀린 상태는 멱등 성공으로 처리한다. `POST /last-simulation/verify-link`는 allocation 좌석과 Redis `HELD` 상태가 일치할 때만 `heldSeatId`를 반환하며, stale 기록은 자동으로 정리한다.

## ⚙️ Core Logic & Code Description — Last 순차 Secret Link 발급

### src/routes/lastSimulationRoutes.js

- **목적:** Last 취소표 풀의 멤버십 후보에게 순번이 도달한 시점에만 5분 Secret Link를 발급해, 여러 후보가 동시에 좌석을 선택하지 못하게 한다.
- **주요 기능:** `issueNextCandidateLink()`는 활성 후보가 없을 때 가장 작은 `sequence_no`의 `WAITING` 후보 한 명을 `ISSUING`으로 점유하고, SMTP 발송 성공 시에만 `LINK_SENT` 및 allocation을 기록한다. 결제 완료·순번 양도·만료는 이 함수를 호출해 바로 다음 후보에게 새 링크를 보낸다.
- **API 명세 / 라우팅 규칙:** `POST /admin/last-simulation/issue-links`는 초기 1번 후보에게만 링크를 발급한다. 이후 `POST /last-simulation/confirm`, `POST /last-simulation/pass`, `POST /last-simulation/expire` 또는 미접속 링크 만료 타이머가 다음 후보 발급을 수행한다. 이전 테스트에서 후순위에 미리 발급된 링크는 자동 무효화되고 후보는 다시 `WAITING`으로 정리된다.
