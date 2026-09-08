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
