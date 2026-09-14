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
    │   └── simulationRoutes.js        # 취소표 시뮬레이션 (어드민)
    └── services/
        ├── authService.js              # 인증 로직 (argon2id + bcrypt 하위호환)
        ├── authTokenService.js         # 세션 Access/Refresh JWT 발급·검증
        ├── cancelLinkTokenService.js   # 취소표 시크릿 링크 JWT 발급·검증
        ├── queueService.js             # 대기열 핵심 로직
        ├── seatService.js              # 좌석 상태 머신
        ├── eventService.js             # Redis Pub/Sub 이벤트 발행
        ├── cancellationEventPublisher.js # 취소표 SQS 이벤트 발행(B파트 연동)
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
- 서버 시작 시 초기화: Redis 만료 리스너, MariaDB 9개 테이블 생성, 관리자 계정 생성
- 서버 시작 시 MariaDB 기준 Redis 자동 복구를 최대 3회 시도하고, 이후 주기적 정합성 점검 시작
- `AUTO_ADMISSION_ENABLED=true`일 때 DB의 대기 중인 회차를 찾아 대기열 상위 `BATCH_SIZE`명을 주기적으로 자동 승인하고 Admission Token을 발급
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
| `GET /events` | 이벤트 목록 조회 (MariaDB 폴백) |
| `PATCH /events/:eventId/open-time` | 예매 오픈 시간 설정/해제. Redis 이벤트 카드(`events:list`)와 MariaDB `events.ticket_open_at`에 함께 저장. 전역 `event:ticketing-status`나 스케줄 타이머를 변경하지 않음 — 대기열 진입 시 `enter()` 함수가 해당 이벤트 카드의 `ticketOpenAt`을 직접 확인하므로 다른 이벤트에 영향 없음 |
| `PATCH /events/:eventId/close-time` | 공연 마감 시간 설정/해제. 이벤트 카드(`events:list`)에만 저장하며 전역 `event:ticketing-status`를 변경하지 않음 — `enter()` 함수가 해당 이벤트 카드의 `ticketCloseAt`을 직접 확인하므로 다른 이벤트에 영향 없음 |
| `DELETE /events/:eventId` | 이벤트 삭제 |
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
| `POST /queue/leave` | 로그인한 본인 사용자의 대기열 이탈 |
| `POST /admin/queue/simulate` | 대량 사용자 시뮬레이션 (Redis pipeline, 5000명 배치) |
| `POST /admin/queue/reset` | 대기열 전체 초기화 |

### src/routes/simulationRoutes.js — 취소표 시뮬레이션

- `POST /admin/simulation/init`에서 지정한 실제 유저 이메일은 시뮬레이션 대상 계정과 멤버십만 준비한다.
- `POST /admin/simulation/sellout`은 더미 좌석을 매진 처리하고 더미 standby 대기자 및 `sold_out` 상태를 만든다. 실제 유저는 이 단계에서 사전 등록하지 않으며, 프론트엔드의 일반 예매 흐름에서 `/queue/enter`를 호출할 때 취소표 standby 대기번호를 발급받는다.
- 매진 단계 이후 응답의 `realUserPosition`은 `null`이며, 상태 조회에서도 실제 유저가 직접 진입하기 전에는 `아직 대기열에 진입하지 않음`으로 표시된다.

### src/services/admissionWorker.js — 자동 승인 워커

- `AUTO_ADMISSION_ENABLED=true`일 때만 시작한다. `false`이면 기존처럼 관리자 `POST /queue/admit` 수동 승인만 사용한다.
- `AUTO_ADMISSION_INTERVAL_MS` 간격으로 `waiting_queue`의 `eligible`/`WAITING` 회차를 찾고, 각 회차의 Redis 대기열 상위 `BATCH_SIZE`명을 자동 승인한다.
- `JWT_SECRET`이 32자 미만이면 사용자를 `admitted`로 이동하지 않고 자동 승인 사이클을 건너뛴다.
- 승인 시 `JWT_SECRET`로 회차 전용 Admission Token을 먼저 저장한 후 Redis의 `admitted` 집합에 등록하며, MariaDB의 `status`·`queue_status`를 `ADMITTED`로 동기화한다. 토큰 발급 전 승인 상태가 보이지 않으므로 프론트의 즉시 재진입에 따른 `RE_QUEUED` 경쟁 상태를 방지한다.
- 여러 API 파드가 동시에 실행되어도 회차별 Redis 분산 락으로 중복 승인을 방지한다.
- `standby` 취소표 대기열은 자동 승인 대상이 아니다.

개발환경 예시:

```env
AUTO_ADMISSION_ENABLED=true
AUTO_ADMISSION_INTERVAL_MS=1000
BATCH_SIZE=100
```

---

### src/routes/seatRoutes.js — 좌석 라우트

| 엔드포인트 | 설명 |
|---|---|
| `POST /seats/init` | 좌석 초기화 (Redis Hash 생성) |
| `POST /seats/hold` | reCAPTCHA v3와 좌석 ID에 포함된 회차·Admission Token을 검증한 뒤 분산 락·타이머 시작 |
| `POST /seats/confirm` | reCAPTCHA v3 검증 후 결제 확정. MariaDB reservations 저장, 토큰 무효화, 매진 체크. `paymentMethod=vbank`이면 24시간 이내 입금 확인이 필요하다는 무통장 입금 접수 메일을, 그 외에는 예매 확정 메일을 자동 발송 |
| `POST /seats/cancel` | 좌석 취소. available 복구, B팀 재판매 트리거. 성공 시 사용자 이메일로 취소 및 환불 안내 메일 자동 발송 |
| `POST /seats/release` | 좌석 해제 + standby 자동 배정 |
| `GET /seats/timer/:seatId` | 남은 결제 시간 조회 |
| `GET /seats/sold-out` | 매진 여부 확인 |
| `GET /seats/available` | 상태별 좌석 수 집계 |
| `GET /seats` | 좌석 목록 (Redis SCAN). `eventId`, `sessionDate`, `sessionTime` query를 주면 선택한 회차 좌석만 반환 |
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
| `POST /cancel-queue/join` | 로그인 사용자 Bearer JWT로 일반 예매 대기/입장 상태를 정리하고 회차별 standby 취소표 대기열에 등록 |
| `GET /cancel-queue/status/:eventId/:userId` | 로그인 사용자 JWT 또는 유효한 본인용 linkToken으로 사용자 취소표 대기 종합 상태 조회 (대기 순번 + 멤버십 + Secret Link) |
| `POST /cancel-queue/allocate` | **410 비활성화** — 취소표 배정은 B파트 Step Functions가 담당 |
| `POST /cancel-queue/allocate-next` | **410 비활성화** — A파트 직접 순차 배정 방지 |
| `POST /cancel-queue/hold` | 로그인 사용자 JWT 또는 유효한 Secret Link 보유자가 본인에게 배정된 좌석을 Admission Token으로 선점 |
| `POST /cancel-queue/expire` | Secret Link 만료 처리 및 선점 해제. 다음 배정은 B파트 파이프라인이 담당 |
| `POST /cancel-queue/respond` | 취소표 링크 사용자가 배정된 좌석 처리 완료 상태를 기록 |
| `GET /cancel-queue/pool/:eventId` | Redis 좌석 상태 기반 회차별 취소표 현황 조회 |
| `POST /cancel-queue/expire-overdue` | 만료된 할당 일괄 처리 |
| `GET /cancel-queue/history/:eventId` | 이벤트별 할당 내역 조회 |

---

### src/routes/simulationRoutes.js — 취소표 시뮬레이션 라우트

멤버십 회원 전용 취소표 티켓팅의 전체 흐름을 어드민에서 단계별로 재현할 수 있는 시뮬레이션 API.

| 엔드포인트 | 설명 |
|---|---|
| `GET /admin/simulation/events` | DB 등록 공연 목록 조회 (드롭다운용) |
| `POST /admin/simulation/init` | 시뮬레이션 초기화 — 더미 유저 생성 + 실제 멤버십 유저 계정/멤버십 자동 등록 |
| `POST /admin/simulation/sellout` | [단계1] 매진 연출 — 전체 좌석 더미 점유(SOLD) + 잔여를 standby 큐 등록. 실제 유저는 이후 직접 진입 |
| `POST /admin/simulation/close` | [단계2] 조기 마감 — ticketing 상태 closed + 멤버십/대기열 유지 교차 검증 |
| `POST /admin/simulation/cancel-seats` | [단계3] 취소표 생성 — 더미 좌석 랜덤 취소(AVAILABLE 복원) 후 SQS 이벤트 발행 |
| `POST /admin/simulation/issue-links` | **410 비활성화** — SQS 이벤트를 받은 B파트가 순차 배정·Secret Link 발급 |
| `POST /admin/simulation/cleanup` | 시뮬레이션 데이터 일괄 삭제 (더미 유저·좌석·대기열·예약·멤버십) |
| `GET /admin/simulation/status` | 현재 시뮬레이션 단계·좌석·대기열·실제유저 상태 조회 |

**Redis 키:**
- `simulation:{eventId}` (Hash) — 시뮬레이션 메타데이터 (stage, realUserEmail, dummyCount 등)

**시뮬레이션 단계 흐름:**
1. `initialized` → 더미 유저 + 실제 유저 준비 완료
2. `sold_out` → 전석 SOLD + standby 대기열 구성
3. `closed` → 티켓팅 마감 + 멤버십 검증
4. `seats_cancelled` → 더미 좌석 일부 취소 (취소표 생성)
5. B파트 Step Functions가 SQS 이벤트를 소비해 순차 배정·시크릿 링크 발급

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
- `allowUserOrCancelLink` / `requireSelfOrLink`: 일반 사용자 JWT 또는 짧은 만료시간의 취소표 링크 JWT만 취소표 흐름에 허용한다.

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
| `queue:admitted` | Set | 입장 허용된 사용자 |
| `queue:counter` | String | 대기 번호 카운터 |
| `event:ticketing-status` | String | 이벤트 ID가 없는 레거시 요청용 전역 티켓팅 상태 (open/sold_out/closed). 이벤트별 요청은 `event:ticketing-status:<eventId>:<sessionKey>` 사용 |
| `event:schedule` | Hash | 예약 오픈 시각과 자동 마감 설정 |

**주요 함수:**
- `enter()`: 대기열 진입. 티켓팅 상태에 따라 eligible 또는 standby 배정. 멤버십 레벨당 score -50 우선순위 부여. 중복 진입 방지. 이미 admitted인데 토큰이 없으면 admitted 상태를 유지한 채 Admission Token을 재발급하며, 일시적으로 발급할 수 없을 때는 `admitting` 상태를 반환한다.
- `enterStandby()`: 매진 후 사용자를 일반 예매 상태에서 회차별 standby 취소표 대기열로 이동시키고 MariaDB 동기화
- `admitBatch()`: eligible 상위 100명에 대한 JWT Admission Token을 먼저 발급·저장한 뒤 admitted로 이동하여, 승인 상태가 토큰보다 먼저 노출되는 경쟁 상태를 방지한다. MariaDB의 `status`와 `queue_status`도 `ADMITTED`로 동기화한다.
- `scheduleTicketing()`: 자동 오픈/마감 타이머 설정
- `restoreTicketingSchedule()`: Redis 초기화·복구 후 저장된 오픈 시각을 기준으로 스케줄과 메모리 타이머를 재등록. 이미 오픈 시각이 지났으면 즉시 `open` 상태로 복구
- `scheduleStandbyClose()`: standby 마감 시간 예약

`eventId`, `sessionDate`, `sessionTime`을 전달한 요청은 `queue:waiting:{eventId}:{sessionKey}`처럼 회차별 Redis 키를 사용한다. 회차별 대기열과 Admission Token이 서로 섞이지 않으며, 컨텍스트를 생략한 기존 관리/테스트 API는 기존 전역 키를 계속 사용한다.

---

### src/services/redisRecoveryService.js — Redis 자동 복구

MariaDB를 원본 데이터로 보고 Redis의 필수 상태를 자동으로 맞춘다.

- API 시작 시 Redis 연결 후 DB를 기준으로 복구를 최대 3회 시도
- Redis가 실행 중인 상태에서도 기본 60초마다 누락·불일치 여부 점검
- `event:info`, `events:list`, 회차별 좌석, 회차별 대기열, `event:schedule`, `event:ticketing-status` 복구
- 여러 API 인스턴스가 동시에 복구하지 않도록 `lock:redis-recovery` 분산 락 사용
- Redis `FLUSHALL`처럼 키가 모두 사라진 경우 다음 점검 주기에 전체 이벤트·좌석·대기열을 복구
- 복구된 미래 오픈 시간은 Node.js 타이머에 다시 등록하고, API가 재시작되어도 DB의 오픈 시간을 기준으로 타이머 재생성

자동 복구 관련 환경변수:

| 변수 | 기본값 | 설명 |
|---|---:|---|
| `REDIS_RECOVERY_ATTEMPTS` | `3` | 시작/복구 실패 시 재시도 횟수 |
| `REDIS_RECOVERY_INTERVAL_MS` | `60000` | Redis 정합성 점검 주기(밀리초, 최소 5000) |

---

### src/services/seatService.js — 좌석 서비스

Redis Hash 기반 좌석 상태 머신.

**상태 흐름:** `available → held → sold`

**Redis 키:** `seat:{eventId}:{sessionKey}:{section-seat}` (Hash: status, heldBy, heldAt, section, price, sessionDate, sessionTime 등)

한 공연에 여러 `sessions`가 있으면 동일한 배치를 회차별로 반복 생성한다. 따라서 올림픽홀 3,322석 공연이 2회차이면 Redis와 MariaDB에 6,644석이 생성되고, 각 회차의 `/seats` 조회는 선택한 날짜·시간의 3,322석만 반환한다.

**주요 함수:**
- `holdSeat()`: Admission Token 검증 → 분산 락 획득 → 상태를 held로 변경 → 결제 타이머 시작. 토큰은 무효화하지 않음(좌석 변경 허용)
- `confirmSeat()`: MariaDB 예매 기록 저장 → 상태를 sold로 변경 → 토큰 무효화 → 매진 시 `sold_out` 설정(standby 접수 유지, closed와 구분)
- `cancelSeat()`: 예약을 CANCELLED로 기록하고 좌석을 available로 복구한 뒤 B파트용 SQS 취소 이벤트만 발행
- `releaseSeat()`: 선점 만료/해제 좌석을 available로 복구하며 A파트에서 standby를 직접 승격하지 않음
- `cleanupEventSeats()`: 이벤트 취소 시 좌석 Redis 키 일괄 삭제
- `getAllSeats()`: Redis SCAN으로 좌석을 조회하며 회차 컨텍스트가 있으면 해당 회차만 반환

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

### src/services/cancellationEventPublisher.js — 취소표 SQS 이벤트 발행

B파트의 Step Functions + Lambda 재판매 파이프라인에 좌석 반환 이벤트를 전달한다.

- `publishCancellationEvent()`: `CANCELLATION_EVENTS_QUEUE_URL`로 `event_id`, `seat_id`, `status`, `timestamp`, `user_id`를 JSON 메시지로 발행
- 실제 예약 취소(`cancelSeat()`)와 취소표 시뮬레이션 취소는 `status: CANCELLED`로 발행
- 큐 URL이 없으면 A파트의 좌석 취소는 유지하고 경고 로그와 `published: false` 결과를 남김
- SQS 발행 실패도 좌석 취소 자체를 롤백하지 않으므로 운영 환경에서는 큐 URL과 IAM `sqs:SendMessage` 권한을 반드시 설정

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

- `startTimer()`: 좌석 선점 시 호출. `timer:seat:{seatId}` 키를 TTL 설정으로 생성
- `cancelTimer()`: 결제 완료 시 키 삭제
- `getRemaining()`: 남은 시간(TTL) 조회
- `initExpiryListener()`: 서버 시작 시 1회 호출. `__keyevent@0__:expired` 채널 구독
  - `timer:seat:*` 키 만료 시:
    - standby 여부와 관계없이 → available 복구
    - A파트에서 대기자 승격·Secret Link 발급을 수행하지 않음
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

**Histogram:**
| 이름 | 설명 |
|---|---|
| `queuing_http_request_duration_seconds` | HTTP 응답 시간 (method/route/status별, 10ms~5s 구간) |

`updateGauges()`: Prometheus scrape 시 Redis의 `seat:metrics:aggregate` 집계 해시와 대기열 집합을 읽어 Gauge를 갱신한다. 좌석 개별 키에 대한 `SCAN`/개별 `HGET`은 실행하지 않으므로 좌석 수가 증가해도 scrape 시간이 좌석 수에 비례해 늘어나지 않는다.

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

- `subscribe()`: 멤버십 가입. tier_name(MONTHLY/ANNUAL)에 따라 만료일 계산. 중복 가입 방지
- `getMembership()`: 멤버십 조회. 만료 여부 포함
- `cancelMembership()`: 멤버십 해지 (DB 레코드 삭제)
- `isPriorityUser()`: priority_level 반환 (대기열 우선순위 산정에 사용)

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

취소표 할당 기록을 조회·만료 처리한다. 다음 대기자 선택과 Secret Link 발급은 B파트 파이프라인이 담당한다.

- `createAllocation()`: 호환 호출을 위한 할당 생성 (LINK_SENT 상태, TTL 기본 600초). A파트 취소 처리에서는 호출하지 않음
- `markResponded()`: 사용자가 링크를 통해 응답 시 RESPONDED로 상태 변경
- `markExpired()`: 시간 초과 시 EXPIRED로 상태 변경
- `expireAllOverdue()`: 만료 시간 지난 할당 일괄 EXPIRED 처리. 다음 사용자 배정은 수행하지 않음
- `getActiveAllocation()`: 사용자의 활성 할당 조회
- `getAllocationHistory()`: 이벤트별 전체 할당 내역
- `expireAllocation()`: 활성 할당을 만료시키고 선점 중인 좌석을 해제. 다음 사용자 배정은 B파트가 담당

할당에는 `event_id`, `session_date`, `session_time`을 함께 저장해 회차별 Admission Token과 좌석을 분리한다. 판매 좌석 취소(`POST /seats/cancel`)가 성공하면 A파트는 SQS 취소 이벤트만 발행하고, 다음 멤버십 사용자 선택·Secret Link 발급은 B파트가 수행한다. 취소표 예매 확정(`POST /seats/confirm`) 시 할당을 `RESPONDED`로 변경한다.

---

### src/services/dbService.js — DB 초기화 서비스

MariaDB 테이블 생성 및 reservations CRUD.

**생성하는 테이블 (9개):**
| 테이블 | 설명 |
|---|---|
| `users` | 사용자 계정 |
| `memberships` | 멤버십 구독 |
| `events` | 공연 이벤트 |
| `seats` | 좌석 |
| `waiting_queue` | 대기열 (MariaDB 측 동기화용) |
| `cancel_allocations` | 취소표 할당 |
| `wishlists` | 위시리스트 |
| `backups` | 스냅샷 백업 |
| `reservations` | 예약 확정 기록 |

`events.sessions`에는 공연 회차 목록을 JSON으로 저장하고, `seats`, `waiting_queue`, `reservations`에는 `session_date`·`session_time`을 저장해 날짜가 다른 회차의 좌석·대기열·예약 기록을 분리한다.
`initTable()`은 `CREATE TABLE IF NOT EXISTS`만 수행한다. 이미 존재하는 테이블에는 `ALTER TABLE`, `ADD COLUMN`, `MODIFY COLUMN`을 실행하지 않으므로, 기존 DB에 필요한 컬럼이 없으면 API가 컬럼을 자동 생성하지 않고 해당 SQL 오류를 그대로 드러낸다. 운영 DB 스키마 변경은 DB 관리자가 별도 마이그레이션으로 수행해야 한다.

reservations CRUD 함수: `saveReservation()`, `getReservations()`, `getReservationBySeat()`

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
   `AUTO_ADMISSION_ENABLED=true`이면 자동 승인 워커가 선택 회차의 상위 100명을 주기적으로 승인한다. 비활성화 시 관리자 Bearer JWT로 POST /queue/admit을 호출한다.

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
| B팀 Step Functions + Lambda | SQS 취소 이벤트 기반 순차 재판매·Secret Link 발급 | `queuing-cancellation-events` |
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
| `RECAPTCHA_SECRET_KEY` | *(없음)* | Google reCAPTCHA v3 서버 비밀 키. 설정하면 검증 활성화 |
| `RECAPTCHA_REQUIRED` | *(설정값에 따름)* | `false`로 설정하면 비상 시 reCAPTCHA 검증을 일시 비활성화 |
| `RECAPTCHA_SCORE_THRESHOLD` | `0.5` | reCAPTCHA v3 최소 허용 점수 |
| `RECAPTCHA_ALLOWED_HOSTNAMES` | *(없음)* | 검증 응답 hostname 허용 목록. 개발 환경은 `localhost` 권장 |
| `CANCELLATION_EVENTS_QUEUE_URL` | *(없음; AWS 운영 필수)* | B파트 재판매 파이프라인 `queuing-cancellation-events` SQS 큐 URL |
| `SQS_CANCELLATION_EVENTS_QUEUE_URL` | *(없음)* | 위 변수의 호환용 별칭 |

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

수집되는 주요 커스텀 메트릭: `queuing_queue_eligible`, `queuing_queue_standby`, `queuing_queue_admitted`, `queuing_seats_available`, `queuing_seats_held`, `queuing_seats_sold`, `queuing_lock_attempts_total`, `queuing_seat_events_total`, `queuing_timer_expirations_total`, `queuing_http_request_duration_seconds`.

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
