# 🎟️ QUEUING: 대기열 및 리세일 자동화 플랫폼

CloudDX 7기 팀 프로젝트 - 대규모 트래픽 분산 및 무중지 티켓팅/리세일 서비스 인프라

---

## 📌 1. 프로젝트 개요
* **서비스명**: QUEUING
* **개발 배경**: 인기 공연/티켓 오픈 시 발생하는 폭발적인 트래픽(트래픽 쏠림 현상)으로 인한 서버 다운을 방지하고, 공정한 대기열 시스템과 오토스케일링을 통해 안정적인 예매 경험을 제공합니다.
* **핵심 기능**:
  1. **입구 컷 대기열 시스템**: 유료 멤버십 회원만 진입 가능한 취소표/리세일 대기열(`resale_queues`) 운영
  2. **5분 제한 1회용 보안 링크**: 순번이 도래한 사용자에게 JWT 기반의 5분 제한 입장 링크 발급 및 이메일 자동 통보
  3. **비동기 메시징 및 오토스케일링**: AWS SQS와 KEDA(Kubernetes Event-driven Autoscaling)를 연동하여 트래픽에 따라 워커 파드가 0~10개로 자동 확장/축소

---

## 🔄 2. 핵심 비즈니스 시나리오 (Workflow)

1. **대기열 등록 (Join)**
   * 유료 멤버십 가입 회원만 취소표 대기열(`waiting_queue` / `resale_queues`)에 진입할 수 있습니다. (일반 회원은 403 차단)
2. **순차 배정 및 워커 처리 (Producer & Worker)**
   * 백그라운드 워커가 대기 순번에 따라 다음 유저를 선점(`FOR UPDATE` 비관적 락 적용)합니다.
   * 검증된 회원에게 SQS 큐(`resale-queue`)를 통해 메시지가 발행됩니다.
3. **이메일 안내 및 5분 제한 링크 발급**
   * 워커가 SQS 메시지를 받아 5분 유효 시간이 담긴 JWT 보안 링크(`private_token`)를 생성하고, 사용자에게 안내 이메일을 발송합니다.
4. **링크 검증 및 입장 (`/verify-link`)**
   * 사용자가 링크를 클릭해 접속하면 서버가 JWT 유효성과 DB 상태(`ACTIVE`)를 검증한 뒤 좌석 선택 페이지로 진입시킵니다.
5. **만료 자동 처리 (Expire Checker)**
   * 5분 내에 응답이 없는 경우, 배치가 자동으로 상태를 `EXPIRED`로 변경하고 다음 대기자에게 기회를 넘깁니다.

---

## 🛠️ 3. 기술 스택 및 인프라 아키텍처
* **Backend**: FastAPI, Python, PyMySQL, APScheduler, PyJWT
* **Database**: MySQL (10개 테이블 스키마 설계, 정규화 및 외래 키 제약 조건 적용)
* **Messaging & Cloud Simulation**: LocalStack (AWS SQS, DynamoDB 모사)
* **Infrastructure & Autoscaling**: Kubernetes (Minikube), KEDA, Terraform (IaC)
