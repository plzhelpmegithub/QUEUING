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
