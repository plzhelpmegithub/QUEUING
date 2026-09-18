# 📂 D:\claude_share\api\redis-api-chart Directory Documentation
QUEUING API를 Kubernetes에 배포하는 Helm 차트다. 애플리케이션 설정과 데이터베이스·SMTP·reCAPTCHA 자격증명 연결을 분리하여, 실제 비밀번호와 Google Secret Key가 Helm values나 Git 저장소에 들어가지 않도록 구성한다.

## 🏗 Directory Structure
- `Chart.yaml`: 차트 이름, 차트 버전, 애플리케이션 버전 등 Helm 메타데이터 정의
- `values.yaml`: 이미지, 서비스, 환경변수, 외부 Secret 참조 및 리소스 기본값 정의
- `templates/deployment.yaml`: API 컨테이너와 환경변수·Kubernetes Secret 참조를 포함한 Deployment 생성
- `templates/service.yaml`: API Pod를 ClusterIP/NodePort/LoadBalancer로 노출하는 Service 생성
- `templates/hpa.yaml`: CPU·메모리 사용률 기반 HorizontalPodAutoscaler 생성
- `templates/serviceaccount.yaml`: API Pod용 ServiceAccount 생성
- `templates/tests/test-connection.yaml`: Helm 배포 후 Service 연결 테스트용 임시 Pod
- `argocd-application.yaml`: Argo CD 배포 시 사용할 Application 예시
- `.helmignore`: Helm 패키징에서 제외할 파일 패턴
- `reademe.txt`: 이전 안내와의 호환을 위한 안내 파일이며, 상세 내용은 이 문서로 연결한다.

현재 Deployment·Service·HPA·ServiceAccount 템플릿의 대상 네임스페이스는 `queuing-a`로 고정되어 있다. 따라서 릴리스와 Secret도 `queuing-a` 기준으로 관리한다.

## ⚙️ Core Logic & Code Description
### `values.yaml`
- **목적:** 배포 환경별 설정을 템플릿과 분리하고, 이미지·네트워크·리소스 값을 재사용한다.
- **주요 기능:** `env`에는 비밀이 아닌 연결 설정을 보관하고, `dbPasswordSecret`, `auth.secret`, `auth.bootstrap.secret`, `smtp.secret`에는 이미 클러스터에 생성된 Secret의 이름과 키만 기록한다. 현재 기본 `values.yaml`의 관계형 DB 대상은 RDS이며, 과거 D-Cloud 주소는 제거했다. `autoAdmissionEnabled`, `autoAdmissionIntervalMs`, `batchSize`, `admissionTimeout`, `admissionTimeoutCheckIntervalMs`로 대기열 자동 승인과 승인 만료 정책을 제어한다. `lastSimulationEnabled`는 Final 공용 좌석 풀·Gmail 링크 검증용 로컬 라우트의 등록 여부를 제어하며, 운영 기본값은 `false`다.
- **Helm 값 적용 순서:** 기본 차트만 배포해도 RDS 설정이 사용된다. ArgoCD를 사용하는 경우 `values.yaml`을 먼저 읽고 `argocd/values-prod.yaml`을 마지막에 읽으며, 같은 키가 있으면 뒤의 운영 파일이 최종값이 된다.
- **RDS 비밀번호 주입:** `dbPasswordSecret`은 AWS Secrets Manager를 직접 읽지 않는다. 운영 override에서 AWS Secrets Manager 원본 `queuing-persistent/app-secrets`의 `RDS_PASSWORD`를 동기화한 Kubernetes Secret(`queuing-a/app-secrets`)을 참조한다. 동기화가 없으면 Deployment가 `CreateContainerConfigError`로 기동하지 않는다.
- **API 명세 / 라우팅 규칙:** API 컨테이너는 기본적으로 3000번 포트를 사용하며, 기본 Service 타입은 NodePort다.

### `templates/deployment.yaml`
- **목적:** Redis, MariaDB, AWS LocalStack 및 선택적 SMTP 설정을 API Pod에 주입한다.
- **주요 기능:** `JWT_AUTH_SECRET`와 `JWT_SECRET`을 `auth.secret`의 외부 Secret에서 항상 주입한다. 둘 중 하나라도 없으면 파드가 생성되지 않으며, 애플리케이션은 32자 미만의 키로 기동하지 않는다. `AUTO_ADMISSION_ENABLED`, `AUTO_ADMISSION_INTERVAL_MS`, `BATCH_SIZE`, `ADMISSION_TIMEOUT`, `ADMISSION_TIMEOUT_CHECK_INTERVAL_MS`를 values에서 주입하여 자동 승인 워커·승인 풀·만료 처리를 제어한다. `auth.bootstrap.enabled: true`일 때만 bootstrap Secret의 관리자·모니터링 계정 변수를 추가 주입한다. `recaptcha.enabled: true`일 때 `RECAPTCHA_SECRET_KEY`(v3)를 외부 Secret에서 주입하고, `RECAPTCHA_REQUIRED`, `RECAPTCHA_SCORE_THRESHOLD`, `RECAPTCHA_ALLOWED_HOSTNAMES`를 values에서 주입한다. `recaptcha.v2Fallback: true`이면 같은 Secret에서 `RECAPTCHA_V2_SECRET_KEY`도 추가 주입한다. `recaptcha.enabled: false`일 때 관련 환경변수를 만들지 않아 기존 배포 흐름을 유지한다. `smtp.enabled: true`일 때 `SMTP_HOST`, `SMTP_PORT`를 values에서 읽고 `SMTP_USER`, `SMTP_PASS`를 `secretKeyRef`로 주입한다. `smtp.enabled: false`일 때 SMTP 환경변수를 만들지 않아 애플리케이션의 AWS SES fallback이 유지된다.
- **API 명세 / 라우팅 규칙:** 이메일 테스트 API는 API 애플리케이션의 `POST /admin/test-email` 라우트를 사용한다. SMTP 자격증명은 HTTP 응답이나 로그에 출력하지 않는다.

### `auth` 설정
- **목적:** 로그인 세션 JWT, 대기열 Admission Token, 취소표 시크릿 링크의 서명 키와 선택적 초기 계정 자격증명을 API Pod에 주입한다.
- **주요 기능:** `auth.secret`은 `JWT_AUTH_SECRET`(Access/Refresh JWT)과 `JWT_SECRET`(Admission/취소표 링크 JWT)을 같은 Secret에서 읽되 서로 다른 값을 사용하도록 한다. Secret은 `required` 참조이므로 누락 시 Helm 배포 후 파드가 시작되지 않는다. `auth.bootstrap.enabled`가 `true`일 때만 `auth-bootstrap-credentials`의 네 계정을 주입한다.
- **API 명세 / 라우팅 규칙:** 로그인은 Access/Refresh JWT를 발급하고, 보호 API는 Access JWT Bearer 헤더를 요구한다. 기존 DB 계정은 bootstrap 설정으로 덮어쓰지 않는다.

### 자동 승인 워커 설정

- `env.autoAdmissionEnabled: true`로 설정하면 API 파드가 `waiting_queue`의 `eligible`·`WAITING` 회차를 찾아 admitted 풀의 빈 슬롯만큼, 최대 `env.batchSize`명까지 자동 승인한다.
- `env.autoAdmissionIntervalMs`는 확인 주기이며 기본 예시는 1초(`"1000"`)다.
- `env.batchSize`는 회차별 admitted 풀의 최대 인원이며 API Pod에 `BATCH_SIZE`로 전달된다. 기본값은 100명이다.
- `env.admissionTimeout`은 승인된 사용자가 좌석 선택 단계로 이동할 수 있도록 유지되는 제한시간(초)이며 `ADMISSION_TIMEOUT`으로 전달된다. 기본값 420초(7분)다.
- `env.admissionTimeoutCheckIntervalMs`는 만료된 승인 사용자를 정리하고 다음 eligible 사용자를 보충하는 점검 주기(밀리초)이며 `ADMISSION_TIMEOUT_CHECK_INTERVAL_MS`로 전달된다.
- `env.lastSimulationEnabled`는 `LAST_SIMULATION_ENABLED`로 전달된다. `false`면 Final 시뮬레이션의 `/admin/last-simulation/*`, `/last-simulation/*` 라우트와 전용 테이블 초기화·만료 스위퍼가 API 프로세스에 등록되지 않는다. AWS 운영에서는 `false`를 유지한다.
- `JWT_SECRET`이 32자 미만이면 워커는 자동 승인을 수행하지 않으므로 인증 Secret을 먼저 생성해야 한다.
- 자동 승인은 `JWT_SECRET`로 Admission Token을 발급하고 MariaDB의 대기 상태를 `ADMITTED`로 변경한다. `standby` 취소표 대기자는 대상이 아니다.
- API 파드가 여러 개여도 회차별 Redis 분산 락을 사용하지만, 운영 환경에서는 자동 승인 배치 크기와 좌석 정책을 별도로 검토해야 한다.
- 승인 만료 시 Redis admitted 상태와 Admission Token을 정리하고 MariaDB 상태를 `EXPIRED`로 동기화한 뒤, 빈 슬롯 1개를 eligible 대기자에게 보충한다.

```yaml
env:
  autoAdmissionEnabled: true
  autoAdmissionIntervalMs: "1000"
  batchSize: "100"
  admissionTimeout: "420"
  admissionTimeoutCheckIntervalMs: "1000"
  lastSimulationEnabled: false
```

## 🔐 API 인증 Secret 설정

실제 JWT 키와 bootstrap 비밀번호는 Helm values, Git, 이미지에 기록하지 않는다. 인프라 담당자가 API 릴리스와 동일한 네임스페이스에 Secret을 먼저 생성한다.

```bash
kubectl -n queuing-a create secret generic auth-credentials \
  --from-literal=JWT_AUTH_SECRET='<32자 이상의 세션용 랜덤 키>' \
  --from-literal=JWT_SECRET='<32자 이상의 Admission·취소표 링크용 랜덤 키>'
```

초기 관리자·모니터링 계정을 새 DB에 만들 때만 다음 Secret과 override를 사용한다. 운영 중인 기존 계정의 비밀번호는 변경하지 않는다.

```bash
kubectl -n queuing-a create secret generic auth-bootstrap-credentials \
  --from-literal=ADMIN_BOOTSTRAP_USER='<관리자 ID>' \
  --from-literal=ADMIN_BOOTSTRAP_PASSWORD='<12자 이상의 관리자 비밀번호>' \
  --from-literal=MONITOR_BOOTSTRAP_USER='<모니터링 ID>' \
  --from-literal=MONITOR_BOOTSTRAP_PASSWORD='<12자 이상의 모니터링 비밀번호>'
```

```yaml
auth:
  bootstrap:
    enabled: true
```

bootstrap을 사용하지 않는 기존 DB라면 `enabled: false`를 유지하고, `auth-credentials`만 생성한다. DB Secret(`mariadb-credentials`)과 reCAPTCHA/SMTP Secret도 모두 API가 배포되는 네임스페이스에 있어야 한다.

### `recaptcha` 설정
- **목적:** 보호된 로그인·회원가입·대기열·좌석 API에 Google reCAPTCHA v3 서버 검증 및 v2 체크박스 폴백을 활성화한다.
- **주요 기능:** 기본값은 `enabled: false`다. 활성화하면 `recaptcha-credentials` Secret에서 `RECAPTCHA_SECRET_KEY`(v3)를 API Pod에 주입하고, 검증 필수 여부·최소 점수·허용 hostname을 함께 설정한다. `v2Fallback: true`이면 같은 Secret에서 `RECAPTCHA_V2_SECRET_KEY`도 주입하여, v3 점수 미달 시 프론트엔드가 v2 체크박스를 표시하고 백엔드가 v2 토큰을 검증하는 폴백 흐름을 활성화한다.
- **API 명세 / 라우팅 규칙:** 애플리케이션은 프론트엔드가 전달한 토큰을 Google `siteverify`로 재검증한다. v3 점수 미달 시 `code: recaptcha_v2_required`를 반환하고, 프론트엔드는 v2 체크박스 완료 후 `recaptchaV2Token`으로 재시도한다. v2 검증 실패 시 HTTP 403과 `code: recaptcha_failed`를 반환한다.

## 🔐 reCAPTCHA Secret 설정

실제 Google Secret Key는 Helm values, Git, 프론트엔드 빌드 결과물에 기록하지 않는다. 인프라 담당자가 API가 배포되는 `queuing-a` 네임스페이스에 Secret을 먼저 생성한다.

```bash
# v3 Secret Key만 사용할 때
kubectl -n queuing-a create secret generic recaptcha-credentials \
  --from-literal=RECAPTCHA_SECRET_KEY='실제 Google v3 Secret Key'

# v2 폴백도 사용할 때 (v3 + v2 키를 하나의 Secret에 함께 보관)
kubectl -n queuing-a create secret generic recaptcha-credentials \
  --from-literal=RECAPTCHA_SECRET_KEY='실제 Google v3 Secret Key' \
  --from-literal=RECAPTCHA_V2_SECRET_KEY='실제 Google v2 Secret Key'
```

운영용 values override 예시는 다음과 같다.

```yaml
recaptcha:
  enabled: true
  required: true
  scoreThreshold: "0.5"
  allowedHostnames: "www.example.com,example.com"
  v2Fallback: true    # v3 점수 미달 시 v2 체크박스 폴백 활성화
  secret:
    name: "recaptcha-credentials"
    v3Key: "RECAPTCHA_SECRET_KEY"
    v2Key: "RECAPTCHA_V2_SECRET_KEY"
```

`allowedHostnames`에는 브라우저가 실제 접속하는 프론트엔드 hostname을 입력한다. `localhost`와 운영 도메인은 Google reCAPTCHA 콘솔에 v3와 v2 사이트 모두 각각 등록해야 한다. 개발·운영 키는 분리하는 것을 권장한다.

### `smtp` 설정
- **목적:** Gmail SMTP 테스트를 활성화하되 App Password를 Git 또는 Helm values에 저장하지 않는다.
- **주요 기능:** 기본값은 `enabled: false`다. 활성화하면 다음 Secret이 `queuing-a` 네임스페이스에 존재해야 한다.

```text
Secret 이름: gmail-smtp-credentials
Secret 키:   SMTP_USER, SMTP_PASS
```

- **API 명세 / 라우팅 규칙:** 애플리케이션은 `SMTP_USER`와 `SMTP_PASS`가 모두 있을 때만 Nodemailer SMTP 모드로 동작한다. `FROM_EMAIL`이 비어 있으면 SMTP 사용자 주소를 발신자로 사용한다.

## 🔐 SMTP Secret 설정

실제 값은 저장소 밖의 로컬 파일에 작성한다.

```dotenv
# .secrets/gmail-smtp.env
SMTP_USER=your-account@gmail.com
SMTP_PASS=replace-with-gmail-app-password
```

그 다음 인프라 담당자가 `queuing-a` 네임스페이스에 Secret을 생성한다.

```powershell
kubectl -n queuing-a create secret generic gmail-smtp-credentials `
  --from-env-file=.secrets/gmail-smtp.env
```

배포 시 SMTP를 켜려면 별도 values 파일 또는 배포 도구의 Helm override에서 다음 값을 지정한다.

```yaml
smtp:
  enabled: true
```

차트는 실제 Secret 리소스를 생성하지 않는다. 따라서 App Password가 Git 기록, Helm values, Argo CD Application manifest에 들어가지 않는다. Gmail SMTP를 사용할 때는 일반 Google 계정 비밀번호가 아닌 App Password를 사용한다.
