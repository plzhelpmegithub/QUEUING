# 📂 D:\claude_share\api\redis-api-chart Directory Documentation
QUEUING API를 Kubernetes에 배포하는 Helm 차트다. 애플리케이션 설정과 데이터베이스·SMTP 자격증명 연결을 분리하여, 실제 비밀번호가 Helm values나 Git 저장소에 들어가지 않도록 구성한다.

## 🏗 Directory Structure
- `Chart.yaml`: 차트 이름, 차트 버전, 애플리케이션 버전 등 Helm 메타데이터 정의
- `values.yaml`: 이미지, 서비스, 환경변수, 외부 Secret 참조 및 리소스 기본값 정의
- `templates/deployment.yaml`: API 컨테이너와 환경변수·Kubernetes Secret 참조를 포함한 Deployment 생성
- `templates/service.yaml`: API Pod를 ClusterIP/NodePort/LoadBalancer로 노출하는 Service 생성
- `templates/hpa.yaml`: CPU·메모리 사용률 기반 HorizontalPodAutoscaler 생성
- `templates/namespace.yaml`: `queuing-a` 네임스페이스 생성
- `templates/serviceaccount.yaml`: API Pod용 ServiceAccount 생성
- `templates/tests/test-connection.yaml`: Helm 배포 후 Service 연결 테스트용 임시 Pod
- `argocd-application.yaml`: Argo CD 배포 시 사용할 Application 예시
- `.helmignore`: Helm 패키징에서 제외할 파일 패턴
- `reademe.txt`: 이전 안내와의 호환을 위한 안내 파일이며, 상세 내용은 이 문서로 연결한다.

## ⚙️ Core Logic & Code Description
### `values.yaml`
- **목적:** 배포 환경별 설정을 템플릿과 분리하고, 이미지·네트워크·리소스 값을 재사용한다.
- **주요 기능:** `env`에는 비밀이 아닌 연결 설정을 보관하고, `dbPasswordSecret` 및 `smtp.secret`에는 이미 클러스터에 생성된 Secret의 이름과 키만 기록한다.
- **API 명세 / 라우팅 규칙:** API 컨테이너는 기본적으로 3000번 포트를 사용하며, 기본 Service 타입은 NodePort다.

### `templates/deployment.yaml`
- **목적:** Redis, MariaDB, AWS LocalStack 및 선택적 SMTP 설정을 API Pod에 주입한다.
- **주요 기능:** `smtp.enabled: true`일 때 `SMTP_HOST`, `SMTP_PORT`를 values에서 읽고 `SMTP_USER`, `SMTP_PASS`를 `secretKeyRef`로 주입한다. `smtp.enabled: false`일 때 SMTP 환경변수를 만들지 않아 애플리케이션의 AWS SES fallback이 유지된다.
- **API 명세 / 라우팅 규칙:** 이메일 테스트 API는 API 애플리케이션의 `POST /admin/test-email` 라우트를 사용한다. SMTP 자격증명은 HTTP 응답이나 로그에 출력하지 않는다.

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
