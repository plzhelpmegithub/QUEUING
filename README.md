# QUEUING
**실시간 사전 예매 플랫폼 — 대기열 기반 티켓팅 시스템**

CLoudDX 7기 팀 프로젝트 협업 공간. 

EKS 기반 마이크로서비스 아키텍처로 구축한 실시간 좌석 예매 플랫폼으로, 
대기열을 통해 순차적으로 서버에 접속하고, HPA/Cluster Autoscaler를 활용한 오토스케일링과 부하 테스트를 통해 트래픽 급증 시에도 무중단 서비스가 가능하도록 하는 인프라 프로젝트.


## 본 프로젝트의 최종 토폴로지

<img width="1467" height="869" alt="image" src="https://github.com/user-attachments/assets/7f91b9f6-84f1-4444-ba45-53c9cc21aff5" />

---

## 프로젝트 구조

본 프로젝트는 서비스별로 브랜치를 분리하여 개발함.

### 정찬규 (A파트 — 예매 대기열 API)

| 브랜치 | 설명 |
|---|---|
| [`feature/chan`](../../tree/feature/chan) | 예매 대기열 API 서버 (Fastify + Redis + MariaDB) |
| [`feature/frontend`](../../tree/feature/frontend) | 프론트엔드 (Vite + Vanilla JS + Nginx) |
| [`chan/aws-migration`](../../tree/chan/aws-migration) | A파트 Terraform 인프라 코드 |

### 김건아 (B파트 — 취소표 양도 서비스)

| 브랜치 | 설명 |
|---|---|
| [`feature/geonah`](../../tree/feature/geonah) | 취소표 양도 백엔드 (FastAPI + SQS + IRSA) |
| [`geonah/migration`](../../tree/geonah/migration) | 취소표 레이스 컨디션 수정, 원자적 락 도입 |
| [`geonah/aws-migration`](../../tree/geonah/aws-migration) | B파트 ALB 타겟그룹 연동, Step Functions 콜백 |

### 최지예 (C파트 — WebSocket 실시간 서버 · AWS 인프라)

| 브랜치 | 설명 |
|---|---|
| [`feature-jiye`](../../tree/feature-jiye) | WebSocket 실시간 서버 (ws + Express + Redis Pub/Sub) + 팀 전체 Terraform 인프라 |

### 최예지 (D파트 — 백엔드 카운터 · 모니터링)

| 브랜치 | 설명 |
|---|---|
| [`feature/yeji`](../../tree/feature/yeji) | Spring Boot 트래픽 카운터 + Grafana 대시보드 + JMeter |
| [`yeji/aws-migration`](../../tree/yeji/aws-migration) | D-Cloud → AWS RDS 전환, RDS Proxy 엔드포인트 적용 |

---

## 인프라 아키텍처

- **AWS EKS 1.34** — AL2023 AMI, containerd CRI, t3.medium 노드 2~6대
- **VPC** — 2개 AZ, Public/Private Subnet 분리
- **CloudFront + ALB** — HTTPS 종단, 글로벌 캐싱
- **WAF 2중 구성** — CloudFront WAF (us-east-1) + ALB WAF (서울)
- **RDS MariaDB 10.11** — Multi-AZ, RDS Proxy 커넥션 풀링
- **ElastiCache Redis 7.1** — 실시간 데이터 + Pub/Sub
- **Terraform IaC** — 28개 .tf 파일, 전체 인프라 코드화
- **CI/CD** — Jenkins → Docker Hub → ArgoCD GitOps
- **모니터링** — kube-prometheus-stack (Grafana + Prometheus + Alertmanager)
- **Cluster Autoscaler** — 노드 자동 확장/축소

---

## 팀원별 상세

### 정찬규 — A파트 (예매 대기열 API 서버)

**담당 역할**: 예매 대기열 API 백엔드 서버 개발 및 Redis 기반 실시간 데이터 처리

**개발 언어**: JavaScript (Node.js 20)

**사용 기술**:
- **Fastify 5** — REST API 프레임워크
- **Redis (ioredis 5.4)** — 대기열 관리, 세션, 실시간 좌석 상태
- **MariaDB (mariadb 3.4)** — 회원/이벤트/예매 영속 데이터
- **JWT (jsonwebtoken 9.0)** — 사용자 인증 토큰
- **AWS SES/SNS/SQS** — 이메일 알림, 메시지 큐 연동
- **Argon2 (@node-rs/argon2)** — 비밀번호 해싱
- **prom-client 15.1** — Prometheus 커스텀 메트릭
- **Docker** — 컨테이너 이미지 빌드
- **Helm Chart** — K8s 배포 관리 (redis-api-chart)

**주요 기능**:
- 대기열 진입/순번 관리 (queueRoutes)
- 좌석 조회/선택/예매 (seatRoutes)
- 공연 이벤트 CRUD (eventRoutes)
- 회원 인증/가입 (authRoutes)
- 멤버십 관리 (membershipRoutes)
- 위시리스트 기능 (wishlistRoutes)
- 취소표 재판매 시뮬레이션 (simulationRoutes, lastSimulationRoutes)
- 취소 대기열 (cancelQueueRoutes)
- 데이터 백업 API (backupRoutes)
- B파트 콜백 연동 (bPartCallbackService)

**오토스케일링**:
- HPA — 최소 2 / 최대 10 Pod, CPU 70% 기준

**브랜치**: [`feature/chan`](../../tree/feature/chan), [`chan/aws-migration`](../../tree/chan/aws-migration)

---

### 김건아 — B파트 (취소표 양도 서비스)

**담당 역할**: 취소표 양도/재판매 백엔드 서비스 및 SQS 메시지 워커 개발

**개발 언어**: Python 3

**사용 기술**:
- **FastAPI** — REST API 프레임워크
- **Uvicorn** — ASGI 서버
- **PyMySQL** — MariaDB 연결
- **PyJWT** — JWT 토큰 인증
- **APScheduler** — 만료 체크 스케줄링
- **Boto3 (AWS SDK)** — SQS 메시지 수신, SES 이메일 발송
- **AWS IRSA** — EKS 서비스 어카운트 기반 AWS 권한
- **Docker** — 컨테이너 이미지 빌드
- **Helm Chart** — K8s 배포 관리 (queuing-chart)
- **KEDA ScaledObject** — SQS 큐 깊이 기반 오토스케일링

**주요 기능**:
- 취소표 양도 서비스 (Resale Service)
- JWT 토큰 기반 시크릿 링크 검증
- SQS 메시지 워커 (큐 메시지 소비 → DB 반영)
- 취소표 만료 자동 체크 (expire_checker)
- AWS SES 이메일 발송 (send_user)
- 멤버십 관리 API

**브랜치**: [`feature/geonah`](../../tree/feature/geonah), [`geonah/migration`](../../tree/geonah/migration), [`geonah/aws-migration`](../../tree/geonah/aws-migration)

---

### 최지예 — C파트 (WebSocket 실시간 서버 · AWS 인프라)

**담당 역할**: WebSocket 기반 실시간 좌석/채팅 서버 개발 및 팀 전체 AWS 인프라 구축·운영

**개발 언어**: JavaScript (Node.js 20), HCL (Terraform)

**사용 기술**:
- **ws 8.18** — WebSocket 서버
- **Express 4.19** — REST API (헬스체크, 메트릭, 관리)
- **Redis Pub/Sub (ioredis 5.4)** — Pod 간 실시간 메시지 전파
- **JWT (jsonwebtoken 9.0)** — 채팅 인증
- **prom-client 15.1** — Prometheus 커스텀 메트릭 (ws_active_connections, ws_messages_total 등)
- **Terraform** — 전체 팀 AWS 인프라 코드화 (EKS, VPC, RDS, ElastiCache, CloudFront, ALB, WAF, IAM 등 28개 .tf 파일)
- **Docker** — 컨테이너 이미지 빌드 (node:20-alpine)
- **Helm Chart** — K8s 배포 관리 (realtime-ws-chart)
- **Jenkins** — CI 파이프라인 구성
- **ArgoCD** — GitOps 기반 CD

**주요 기능**:
- 실시간 좌석 상태 브로드캐스트 (seats 채널, 회차별 격리)
- 실시간 채팅 (chat 채널, 쿨다운 5초, 비속어 필터)
- 실시간 접속자 통계 (stats 채널)
- Heartbeat (30초 ping/pong, ALB 60초 유휴 타임아웃 대응)
- Backpressure (소켓 버퍼 1MB 초과 시 연결 종료, OOMKill 방지)
- Graceful Shutdown (SIGTERM → 드레이닝 → 안전 종료)
- 공백/특수문자 우회 방지 비속어 필터
- 회차별 채널 격리 (seats:{eventId}:{sessionId})

**인프라 구축**:
- EKS 1.34 (AL2023, containerd, t3.medium 2~6노드)
- VPC 2AZ Private Subnet 설계
- CloudFront + ALB + WAF 2중 보안
- RDS MariaDB Multi-AZ + RDS Proxy
- ElastiCache Redis 7.1
- IAM 최소 권한, 네임스페이스 분리
- kube-prometheus-stack 88.6.0 모니터링
- Cluster Autoscaler 9.53.0

**오토스케일링**:
- HPA — 최소 2 / 최대 10 Pod, CPU 80% 기준

**부하 테스트 성과**:
- 1,000 동시접속 기준 p95 응답시간 92ms, 연결 끊김 0건

**브랜치**: [`feature-jiye`](../../tree/feature-jiye)

---

### 최예지 — D파트 (백엔드 카운터 · 모니터링)

**담당 역할**: Spring Boot 기반 트래픽 카운터 백엔드 개발 및 Grafana 모니터링 대시보드 구성

**개발 언어**: Java 17

**사용 기술**:
- **Spring Boot 3.2.5** — 백엔드 프레임워크
- **Spring Data Redis** — Redis 기반 실시간 카운터
- **Spring Actuator + Micrometer** — Prometheus 메트릭 노출
- **Gradle** — 빌드 도구
- **Grafana** — 모니터링 대시보드 설계 (백엔드 + 팀 통합)
- **JMeter** — 부하 테스트
- **Docker** — 컨테이너 이미지 빌드
- **Terraform** — 인프라 코드 (SES 이메일 발신 등)
- **K8s 매니페스트** — Deployment, Service, ServiceMonitor

**주요 기능**:
- 페이지별 실시간 접속자 수 카운팅 (enterPage / leavePage)
- 페이지별 혼잡도 계산 (Redis 기반)
- 방문자 카운터 (increment / getCount)
- 좋아요 기능 (LikeController)
- 트래픽 모니터링 (TrafficController, MonitorController)
- Grafana 대시보드 (backend-counter + team-integrated)
- JMeter 부하 테스트 시나리오

**브랜치**: [`feature/yeji`](../../tree/feature/yeji), [`yeji/aws-migration`](../../tree/yeji/aws-migration)

---

### 프론트엔드

**담당**: 공동 개발 (정찬규 주도)

**사용 기술**:
- **Vite 5** — 번들러
- **Vanilla JavaScript** — SPA 라우팅
- **HTML/CSS** — UI
- **Nginx** — 정적 파일 서빙 (Docker 배포)
- **Docker** — 컨테이너 이미지 빌드

**주요 화면**:
- 좌석 선택 페이지 (seat_editor.html)
- 취소 티켓팅 페이지 (cancel-ticketing.html)
- 메인 페이지 (index.html)
- 컴포넌트 기반 SPA 구조 (src/components, src/pages)

**브랜치**: [`feature/frontend`](../../tree/feature/frontend)

---

## 공통 기술 스택

| 분류 | 기술 |
|---|---|
| 컨테이너 오케스트레이션 | AWS EKS 1.34 (Kubernetes) |
| 컨테이너 런타임 | containerd (AL2023) |
| 이미지 빌드 | Docker |
| 이미지 레지스트리 | Docker Hub |
| IaC | Terraform (>= 1.5, AWS Provider ~> 5.0) |
| CI | Jenkins |
| CD | ArgoCD (GitOps) |
| 패키지 매니저 | Helm 3 |
| DB | Amazon RDS MariaDB 10.11 (Multi-AZ) |
| 캐시/메시지 | Amazon ElastiCache Redis 7.1 |
| CDN | Amazon CloudFront |
| 로드밸런서 | AWS ALB (Application Load Balancer) |
| 보안 | AWS WAF, IAM, ACM (SSL/TLS) |
| 도메인 | Route 53 (queuing.kr) |
| 모니터링 | Prometheus + Grafana (kube-prometheus-stack 88.6.0) |
| 오토스케일링 | HPA + Cluster Autoscaler 9.53.0 |
| OS | Amazon Linux 2023 |
