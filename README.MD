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
    ├── routes/
    │   ├── authRoutes.js               # 인증 (회원가입/로그인)
    │   ├── eventRoutes.js              # 공연 CRUD
    │   ├── queueRoutes.js              # 대기열 관리
    │   ├── seatRoutes.js               # 좌석 선점/결제/해제
    │   ├── membershipRoutes.js         # 멤버십 구독
    │   ├── wishlistRoutes.js           # 위시리스트
    │   ├── backupRoutes.js             # 백업/복구
    │   └── cancelQueueRoutes.js        # 취소표 대기열
    └── services/
        ├── authService.js              # 인증 로직 (bcrypt)
        ├── queueService.js             # 대기열 핵심 로직
        ├── seatService.js              # 좌석 상태 머신
        ├── eventService.js             # Redis Pub/Sub 이벤트 발행
        ├── lockService.js              # 분산 락 (Redis)
        ├── timerService.js             # 결제 타이머 (Redis TTL)
        ├── tokenService.js             # Admission Token (JWT)
        ├── metricsService.js           # Prometheus 메트릭
        ├── sseService.js               # SSE 실시간 브로드캐스트
        ├── notificationService.js      # AWS SES/SNS 알림
        ├── membershipService.js        # 멤버십 CRUD
        ├── wishlistService.js          # 위시리스트 CRUD
        ├── backupService.js            # 스냅샷 백업/복구
        ├── cancelAllocationService.js  # 취소표 할당 관리
        ├── redisRecoveryService.js     # Redis 자동 복구·주기적 정합성 점검
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
| `bcryptjs` | 비밀번호 해싱 |
| `prom-client` | Prometheus 메트릭 수집 |
| `@aws-sdk/client-ses` | 이메일 알림 (AWS SES) |
| `@aws-sdk/client-sns` | SMS 알림 (AWS SNS) |
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
| `POST /auth/register` | 회원가입. 이메일/비밀번호 유효성 검사 후 bcrypt 해싱하여 MariaDB 저장 |
| `POST /auth/login` | 로그인. bcrypt 비교 후 사용자 정보 반환 |
| `PATCH /auth/profile` | 회원정보 수정. 이름·전화번호·비밀번호·마케팅 수신 동의를 저장하며 이메일은 수정하지 않음 |
| `GET /auth/users` | 전체 사용자 목록 조회 (관리자용) |

---

### src/routes/eventRoutes.js — 공연 이벤트 라우트

| 엔드포인트 | 설명 |
|---|---|
| `POST /event/create` | 공연 생성. 이벤트 ID는 Redis `event:seq` INCR로 자동 증가 순번 발급(`evt-1`, `evt-2`, ...). `sessions: [{ date, time }]`가 여러 개면 회차마다 독립 좌석 inventory를 만들며, `totalSeats`는 전체 회차 합계, `seatsPerSession`은 회차당 좌석 수로 반환 |
| `GET /event/info` | 공연 정보 조회 (Redis 우선, MariaDB 폴백) |
| `PATCH /event/update` | 공연 정보 수정 + 알림 발송 |
| `POST /event/cancel` | 공연 취소. 좌석 전체 정리, 대기열 초기화, 취소 알림 |
| `GET /events` | 이벤트 목록 조회 (MariaDB 폴백) |
| `PATCH /events/:eventId/open-time` | 예매 오픈 시간 설정/해제. Redis 캐시와 MariaDB `events.ticket_open_at`에 함께 저장하며, 현재 활성 이벤트이면 자동 오픈 스케줄도 등록 |
| `PATCH /events/:eventId/close-time` | 공연 마감 시간 설정/해제 (자동 마감) |
| `DELETE /events/:eventId` | 이벤트 삭제 |
| `POST /events/batch-delete` | 최대 5개 이벤트를 순차 삭제하며 Redis 좌석과 MariaDB 관련 데이터를 함께 정리 |
| `POST /events/seed` | 데모용 더미 이벤트 5개 생성 |
| `POST /admin/redis/reset` | Redis 이벤트 상태 초기화. `hard`/`resync`는 MariaDB 기준으로 이벤트 목록을 재구성하며 DB에 저장된 오픈 예정 시간도 복원 |
| `POST /admin/redis/recover` | MariaDB의 이벤트·좌석·대기열·예매 상태를 Redis로 전체 복구하고, 대상 이벤트의 오픈 예정 시간과 자동 오픈 타이머를 재등록 |

---

### src/routes/queueRoutes.js — 대기열 라우트

| 엔드포인트 | 설명 |
|---|---|
| `POST /queue/enter` | 대기열 진입. `eventId`, `sessionDate`, `sessionTime`을 함께 보내면 해당 회차 전용 대기열로 처리 |
| `GET /queue/position/:userId` | 현재 대기 순번 조회. 회차 query(`eventId`, `sessionDate`, `sessionTime`) 지원 |
| `POST /queue/admit` | 해당 회차 대기열의 상위 100명 일괄 입장 허용 + 회차 전용 Admission Token 발급 |
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
| `POST /queue/leave` | 대기열 이탈 |
| `POST /admin/queue/simulate` | 대량 사용자 시뮬레이션 (Redis pipeline, 5000명 배치) |
| `POST /admin/queue/reset` | 대기열 전체 초기화 |

---

### src/routes/seatRoutes.js — 좌석 라우트

| 엔드포인트 | 설명 |
|---|---|
| `POST /seats/init` | 좌석 초기화 (Redis Hash 생성) |
| `POST /seats/hold` | 좌석 선점. 좌석 ID에 포함된 회차와 Admission Token을 검증한 뒤 분산 락·타이머 시작 |
| `POST /seats/confirm` | 결제 확정. MariaDB reservations 저장, 토큰 무효화, 매진 체크 |
| `POST /seats/cancel` | 좌석 취소. available 복구, B팀 재판매 트리거 |
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
| `GET /cancel-queue/status/:eventId/:userId` | 사용자 취소표 대기 종합 상태 (대기 순번 + 멤버십 + Secret Link) |
| `POST /cancel-queue/allocate` | 취소표 발생 시 standby 1순위에게 Secret Link 발급 (멤버십 필수) |
| `POST /cancel-queue/allocate-next` | 비회원 스킵하며 순차적으로 멤버십 회원 찾아 발급 |
| `POST /cancel-queue/expire-overdue` | 만료된 할당 일괄 처리 |
| `GET /cancel-queue/history/:eventId` | 이벤트별 할당 내역 조회 |

---

### src/services/authService.js — 인증 서비스

- `initUsersTable()`: users 테이블 생성 + 기본 관리자 계정 생성 (`admin@queuing.kr` / `admin1234`)
- `register()`: 이메일/비밀번호 유효성 검사, bcrypt 해싱 후 저장
- `login()`: bcrypt 비교 인증
- `listUsers()`: 전체 사용자 목록 (비밀번호 제외)

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
| `event:ticketing-status` | String | 티켓팅 상태 (open/sold_out/closed) |
| `event:schedule` | Hash | 예약 오픈 시각과 자동 마감 설정 |

**주요 함수:**
- `enter()`: 대기열 진입. 티켓팅 상태에 따라 eligible 또는 standby 배정. 멤버십 레벨당 score -50 우선순위 부여. 중복 진입 방지. 이미 admitted인데 토큰이 없는 경우(결제 확정으로 소모 또는 만료) admitted에서 제거 후 대기열 맨 뒤로 재배정
- `admitBatch()`: eligible 상위 100명을 admitted로 이동 + JWT Admission Token 발급
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
- `cancelSeat()`: available 복구 + B팀 재판매 트리거 (POST to `192.168.0.191:8000`)
- `releaseSeat()`: available 복구 + standby 자동 배정
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
    - standby 대기자가 있으면 → 바로 다음 사용자에게 held 전환 (available 거치지 않음)
    - standby 없으면 → available 복구
  - 상태 변경 시 MariaDB 동기화 + Pub/Sub 이벤트 발행 + cancel_allocations 기록
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
**JWT 시크릿:** `JWT_SECRET` 환경변수 또는 기본값

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

`updateGauges()`: Prometheus scrape 시 Redis에서 현재 값을 읽어 Gauge 갱신.

---

### src/services/sseService.js — SSE 서비스

Server-Sent Events로 브라우저에 실시간 이벤트 푸시 (서버 → 클라이언트 단방향).

- `addClient()`: 브라우저의 EventSource 연결을 Set에 등록. 연결 해제 시 자동 제거
- `broadcast()`: 모든 연결된 브라우저에 SSE 형식(`event: 타입\ndata: JSON\n\n`)으로 전송
- `getClientCount()`: 현재 연결 수

---

### src/services/notificationService.js — 알림 서비스

AWS SES(이메일) / SNS(SMS) 클라이언트.

- `sendEmail()`: AWS SES로 이메일 발송
- `sendSMS()`: AWS SNS로 SMS 발송
- `notifyEventCancellation()`: 공연 취소 알림 (사용자 목록에게 일괄 발송)
- `notifyEventUpdate()`: 공연 정보 변경 알림

> 환경변수 `AWS_ENDPOINT`를 설정하면 LocalStack 등 커스텀 엔드포인트를 사용하고, 미설정 시 AWS SDK 기본 엔드포인트(실제 AWS)를 사용. 자격증명도 환경변수(`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`) 또는 IAM Role 등 SDK 기본 체인으로 주입.

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

취소표 발생 시 standby 대기자에게 Secret Link를 발급하고 관리.

- `createAllocation()`: 할당 생성 (LINK_SENT 상태, TTL 기본 600초)
- `markResponded()`: 사용자가 링크를 통해 응답 시 RESPONDED로 상태 변경
- `markExpired()`: 시간 초과 시 EXPIRED로 상태 변경
- `expireAllOverdue()`: 만료 시간 지난 할당 일괄 EXPIRED 처리
- `getActiveAllocation()`: 사용자의 활성 할당 조회
- `getAllocationHistory()`: 이벤트별 전체 할당 내역

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
기존 운영 테이블에 이 컬럼을 추가하는 `ALTER TABLE`은 API가 자동 실행하지 않으므로, 운영 DB 스키마에 필요한 컬럼을 사전에 직접 준비해야 한다.

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

4. 입장 허용 (관리자 또는 자동)
   POST /queue/admit → 선택 회차의 상위 100명 → queue:admitted + 회차 전용 Admission Token 발급

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
| B팀 FastAPI | 취소 시 재판매 트리거 | `http://192.168.0.191:8000` |
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
| `JWT_SECRET` | `queuing-admission-secret-key-2026` | JWT 서명 키 |
| `HOLD_DURATION` | `600` | 결제 제한 시간 (초) |

---

## 배포·확인 시 주의

- 소스 변경은 API 프로세스가 다시 시작되어야 적용된다. 공유 디렉터리에서 실행 중인 `node --watch`가 파일 변경을 감지하지 못하는 환경에서는 담당자가 API 프로세스를 수동 재시작해야 한다.
- Helm 적용 전에는 `helm template` 또는 `helm install --dry-run --debug`로 렌더링 결과를 확인한다.
- API와 프론트엔드의 포스터 일정이 일치하려면 새 공연 생성 요청에 `sessions` 배열이 포함되어야 한다.
