## [2026-09-18 13:37] 업데이트 로그 — 운영 DB 기본값 분리

### 🔄 변경 및 수정 사항
- **[values.yaml]**: 기본 Helm 값에서 D-Cloud MariaDB의 실제 공인 주소와 계정을 제거하고, DB 연결 키는 운영 override가 누락되었을 때 잘못된 외부 DB로 연결되지 않도록 빈 기본값으로 변경
- **[values.yaml]**: Redis 연결은 유지하되 AWS 운영용 실제 엔드포인트는 `argocd/values-prod.yaml`에서 관리하도록 역할을 명확히 문서화
- **[README.md]**: 공통 values와 운영 RDS/ElastiCache override의 적용 순서 및 책임을 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 기본 `values.yaml`에 이전 D-Cloud DB 주소가 남아 있어 운영 override 누락 시 API가 잘못된 DB로 연결할 위험이 있었고, 운영 override의 Redis 주소는 `PLACEHOLDER` 상태였다.
- **원인(Cause):** Helm 기본값과 AWS 운영값의 경계가 명확하지 않았으며, 운영 파일의 Redis placeholder가 기본 Redis 값을 덮어쓸 수 있었다.
- **해결(Solution):** 기본 파일에서는 D-Cloud 실DB 주소를 제거하고, ArgoCD가 `values.yaml` 후 `values-prod.yaml`을 적용하도록 유지했다. 운영 파일에는 RDS와 실제 ElastiCache 엔드포인트를 명시했다.

---

## [2026-09-16 14:45] 업데이트 로그 — 대기열 승인 정책 환경변수 추가

### 🔄 변경 및 수정 사항
- **[values.yaml]**: `batchSize`, `admissionTimeout`, `admissionTimeoutCheckIntervalMs` 기본값을 추가하여 admitted 풀 크기와 승인 만료 정책을 Helm values에서 조정할 수 있도록 변경
- **[templates/deployment.yaml]**: `BATCH_SIZE`, `ADMISSION_TIMEOUT`, `ADMISSION_TIMEOUT_CHECK_INTERVAL_MS`를 API Pod 환경변수로 주입
- **[Chart.yaml]**: 템플릿 변경을 반영하여 차트 버전을 `2.2.1`로 증가. API 이미지 버전은 변경하지 않음
- **[README.md]**: Helm values와 API 환경변수의 매핑, admitted 풀 상한 및 만료 시 보충 동작을 문서화

---

## [2026-09-10 12:58] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[values.yaml]**: 자동 승인 워커 설정(`autoAdmissionEnabled`, `autoAdmissionIntervalMs`) 추가 및 이미지 태그를 `1.0.9`로 갱신
- **[templates/deployment.yaml]**: 자동 승인 워커 환경변수 주입 추가
- **[Chart.yaml]**: 차트 버전을 `1.0.7`, API 이미지 기준 버전을 `1.0.9`로 갱신
- **[README.md]**: 자동 승인 워커의 동작과 온프레미스·Kubernetes 설정 방법 문서화

---

## [2026-09-10 09:25] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[values.yaml]**: reCAPTCHA 설정에 `v2Fallback` 플래그와 `secret.v3Key`/`secret.v2Key` 구조 추가. 기존 `secret.key`를 `secret.v3Key`로 변경하여 v3/v2 Secret Key를 하나의 Kubernetes Secret에서 분리 관리
- **[templates/deployment.yaml]**: `recaptcha.v2Fallback: true`일 때 `RECAPTCHA_V2_SECRET_KEY`를 동일 Secret에서 추가 주입하는 조건부 렌더링 추가
- **[README.md]**: reCAPTCHA Secret 생성 명령과 values override 예시에 v2 폴백 설정 반영

---

## [2026-09-08 12:55] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[values.yaml]**: Google reCAPTCHA v3 활성화 여부, 필수 검증 여부, 최소 점수, 허용 hostname 및 외부 Kubernetes Secret 참조 설정을 추가. 기본값은 `recaptcha.enabled: false`로 지정.
- **[templates/deployment.yaml]**: reCAPTCHA 활성화 시 `RECAPTCHA_SECRET_KEY`를 `secretKeyRef`로 주입하고, 나머지 검증 설정을 환경변수로 전달하도록 조건부 렌더링 추가.
- **[Chart.yaml]**: Helm 템플릿 변경을 반영하여 차트 버전을 `1.0.5`로 증가.
- **[README.md]**: reCAPTCHA Secret 생성 방법, values override 예시, 운영 hostname 설정 및 보안 원칙 문서화.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** API 소스와 `.env.example`에는 reCAPTCHA 설정이 있지만 Helm 배포 시 API Pod에 `RECAPTCHA_SECRET_KEY`가 전달되지 않음.
- **원인(Cause):** `values.yaml`과 `templates/deployment.yaml`에 reCAPTCHA 환경변수 및 Kubernetes Secret 참조가 정의되어 있지 않았음.
- **해결(Solution):** `recaptcha.enabled`가 true일 때만 외부 `recaptcha-credentials` Secret과 검증 설정을 API Pod에 주입하도록 차트 템플릿을 추가했다. 기본값은 false로 유지하여 기존 배포에 대한 호환성을 보장한다.

## [2026-09-07 12:21] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[values.yaml]**: Gmail SMTP 사용 여부, SMTP 호스트·포트·발신자 주소 및 외부 Kubernetes Secret 키 설정을 추가하고 기본값을 `smtp.enabled: false`로 지정.
- **[templates/deployment.yaml]**: SMTP 활성화 시 `SMTP_USER`와 `SMTP_PASS`를 `secretKeyRef`로 주입하고, SMTP 비활성화 시 기존 AWS SES/LocalStack fallback을 유지하도록 조건부 환경변수 렌더링 추가.
- **[Chart.yaml]**: 템플릿 변경을 반영하여 차트 버전을 `1.0.2`로 증가.
- **[api/.env.example]**: 로컬 Gmail SMTP 테스트용 환경변수 예시와 App Password 사용 주의사항 추가.
- **[api/.gitignore]**: `.env`, `.secrets/`, 로컬 Secret 파일이 저장소에 들어가지 않도록 ignore 규칙 추가.
- **[README.md]**: 외부 SMTP Secret 생성 방법, 차트 동작 방식, 배포 전제조건 문서화.
- **[reademe.txt]**: 명령행에 비밀번호를 직접 입력하도록 안내하던 오래된 내용을 제거하고 보안 문서로 연결.
## [2026-09-10 11:08] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[values.yaml]**: `auth.secret`에 세션용 `JWT_AUTH_SECRET`과 Admission/취소표 링크용 `JWT_SECRET`의 외부 Secret 참조를 추가하고, 선택적 `auth.bootstrap` Secret 참조를 추가
- **[templates/deployment.yaml]**: 두 JWT 키를 필수 `secretKeyRef`로 API Pod에 주입하고, bootstrap 활성화 시에만 관리자·모니터링 초기 계정 환경변수를 주입
- **[Chart.yaml]**: 인증 Secret 주입 템플릿 변경을 반영하여 차트 버전을 `1.0.6`으로 증가
- **[README.md]**: 인증 Secret 생성 명령, 32자 이상 키 규칙, bootstrap 동작과 기존 계정 비덮어쓰기 정책을 문서화
- **[README.md / api/README.MD]**: 현재 차트 리소스가 `queuing-a` 네임스페이스를 고정 사용하는 동작을 명시하여 Helm 릴리스·Secret 위치 혼동을 줄임

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** JWT Secret을 차트에 넣지 않으면 인증 보호가 우회되거나, Secret 누락 상태가 파드 기동 이후에야 발견될 수 있음.
- **원인(Cause):** 애플리케이션 코드에 있던 기본 서명 키와 Helm 차트의 인증 Secret 연결이 일관되지 않았음.
- **해결(Solution):** `auth-credentials`를 필수 Secret 참조로 지정하고 API 코드에서도 32자 미만 키를 거부했다. bootstrap 계정은 별도 Secret과 `auth.bootstrap.enabled`가 동시에 활성화된 경우에만 생성된다.

---
## [2026-09-18 13:42] 업데이트 로그 — 기본 Helm 값의 RDS 전환

### 🔄 변경 및 수정 사항
- **[values.yaml]**: 직접 Helm 배포 시에도 RDS를 바라보도록 `dbHost`, `dbPort`, `dbUser`, `dbName`을 RDS 연결값으로 변경
- **[values.yaml]**: DB 비밀번호 Secret 참조를 `app-secrets/RDS_PASSWORD`로 변경하여 ArgoCD override 없이도 현재 RDS Secret 구조를 사용하도록 조정
- **[README.md]**: 기본 차트 배포와 ArgoCD 배포 모두 RDS를 사용하는 구조로 설명을 갱신

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** ArgoCD를 담당하지 않는 환경에서 기본 `values.yaml`로 Helm 배포하면 DB 값이 비어 있어 API가 RDS에 연결할 수 없음.
- **원인(Cause):** RDS 값을 운영 override 파일에만 두고 기본 차트에서는 제거했기 때문.
- **해결(Solution):** 기본 `values.yaml` 자체를 RDS 엔드포인트와 `app-secrets/RDS_PASSWORD` 참조로 변경했다. D-Cloud 주소는 기본값에서 제거했다.

---
