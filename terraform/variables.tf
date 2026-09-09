# =============================================================================
# 입력 변수 (Input Variables)
# =============================================================================
#
# [역할]
# terraform apply 시 외부에서 주입할 수 있는 값들을 정의한다.
# 값 지정 방법 (우선순위 순):
#   1. terraform apply -var="db_password=xxx"       (CLI 플래그)
#   2. terraform.tfvars 파일에 key = "value" 작성    (가장 일반적)
#   3. TF_VAR_db_password 환경변수                   (CI/CD 파이프라인)
#   4. 아래 default 값                               (미지정 시 사용)
#
# sensitive = true 로 표시된 변수는 plan/apply 출력에서 값이 마스킹된다.
# =============================================================================


# ─────────────────────────────────────────────────────────────────────────────
# 공통 설정
# ─────────────────────────────────────────────────────────────────────────────

variable "aws_region" {
  description = "리소스를 생성할 AWS 리전. 서울(ap-northeast-2)이 기본값."
  type        = string
  default     = "ap-northeast-2"
}

variable "environment" {
  description = "배포 환경 이름. 리소스 이름 접두사와 조건부 설정(Multi-AZ 등)에 사용."
  type        = string
  default     = "prod"
  # "dev", "staging", "prod" 중 하나를 권장.
  # prod이면: RDS Multi-AZ 활성화, deletion_protection 활성화, final_snapshot 생성.
  # dev이면:  단일 AZ, 스냅샷 생략으로 비용 절감.
}


# ─────────────────────────────────────────────────────────────────────────────
# VPC 네트워크
# ─────────────────────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "VPC 전체 IP 대역. /16이면 65,536개 IP 사용 가능."
  type        = string
  default     = "10.0.0.0/16"
  # cidrsubnet()으로 서브넷을 자동 분할한다:
  #   Public  : 10.0.0.0/24, 10.0.1.0/24   (각 256 IP)
  #   Private : 10.0.10.0/24, 10.0.11.0/24  (각 256 IP)
}


# ─────────────────────────────────────────────────────────────────────────────
# EKS 클러스터
# ─────────────────────────────────────────────────────────────────────────────

variable "eks_cluster_version" {
  description = "EKS K8s 버전. AWS가 마이너 패치를 자동 적용."
  type        = string
  default     = "1.30"
  # 지원 버전 확인: aws eks describe-addon-versions --kubernetes-version 1.30
  # EKS는 보통 4개 마이너 버전을 동시 지원 (1.27~1.30 등).
  # 온프레미스 K8s 버전과 맞추는 것을 권장.
}

variable "eks_node_instance_type" {
  description = "EKS Worker Node EC2 인스턴스 유형."
  type        = string
  default     = "t3.medium"
  # t3.small  : 2 vCPU, 2 GiB RAM (개발/테스트)
  # t3.medium : 2 vCPU, 4 GiB RAM (소규모 프로덕션, 권장 최소)
  # t3.large  : 2 vCPU, 8 GiB RAM (중규모 프로덕션)
  # ⚠️ t3.micro/small은 Pod 수 제한이 낮아 EKS에 비권장.
  #    t3.medium은 최대 17개 Pod 실행 가능 (ENI 기준).
}

variable "eks_node_volume_size" {
  description = "Worker Node EBS 루트 볼륨 크기(GiB)."
  type        = number
  default     = 30
  # gp3 기본: 3,000 IOPS, 125 MiB/s 포함.
  # Docker 이미지 레이어 캐시 + OS + kubelet 로그 고려하여 30GiB.
}

variable "k8s_nodeport" {
  description = "K8s API Service의 NodePort. ALB Target Group이 이 포트로 트래픽 전달."
  type        = number
  default     = 30084
  # Helm 차트(redis-api-chart)의 Service NodePort와 일치해야 한다.
  # 온프레미스 K8s에서 사용하던 NodePort: 30084.
}


# ─────────────────────────────────────────────────────────────────────────────
# EKS Node Group 스케일링
# ─────────────────────────────────────────────────────────────────────────────

variable "api_desired_count" {
  description = "EKS Node Group이 유지할 기본 Worker Node 수."
  type        = number
  default     = 2
  # K8s Node 수. Pod 스케일링은 HPA가 담당 (Helm 차트에서 설정).
}

variable "api_min_count" {
  description = "Node Group 최소 Worker Node 수. 이 수만큼은 항상 실행."
  type        = number
  default     = 1
}

variable "api_max_count" {
  description = "Node Group 최대 Worker Node 수. Cluster Autoscaler가 이 범위 내에서 조절."
  type        = number
  default     = 10
}


# ─────────────────────────────────────────────────────────────────────────────
# 외부 D-Cloud MariaDB
# ─────────────────────────────────────────────────────────────────────────────
# RDS는 사용하지 않음. 외부 D-Cloud MariaDB에 NAT Gateway를 통해 접속.
# DB_HOST, DB_PORT, DB_USER는 K8s ConfigMap이나 환경변수로 주입.
# DB_PASSWORD만 Secrets Manager에 저장 (secrets.tf).
# ─────────────────────────────────────────────────────────────────────────────

variable "db_password" {
  description = "외부 D-Cloud MariaDB 비밀번호. terraform.tfvars에 작성하고 절대 커밋하지 않는다."
  type        = string
  sensitive   = true
  # Secrets Manager에 저장되어 EKS Pod가 런타임에 참조.
}


# ─────────────────────────────────────────────────────────────────────────────
# ElastiCache (Redis)
# ─────────────────────────────────────────────────────────────────────────────

variable "redis_node_type" {
  description = "ElastiCache 노드 유형. Primary/Replica 모두 이 유형으로 생성."
  type        = string
  default     = "cache.t3.micro"
  # cache.t3.micro : 0.5 GiB (프리티어 대상, 개발/테스트)
  # cache.t3.small : 1.37 GiB (소규모 프로덕션)
  # cache.t3.medium: 3.09 GiB (중규모 프로덕션)
  # 좌석 6,600개 기준 Redis 메모리 ~50MB 사용 → micro면 충분.
}

variable "redis_num_replicas" {
  description = "Redis Replica 수. 1이면 Primary + Replica 1 = Multi-AZ 구성. 0이면 단일 노드."
  type        = number
  default     = 1
  # 1 = Primary(AZ-a) + Replica(AZ-c), 자동 페일오버 활성화
  # 2 = Primary + Replica 2, 읽기 분산 강화
  # 0 = 단일 노드 (개발 환경, Multi-AZ/페일오버 비활성화)
}


# ─────────────────────────────────────────────────────────────────────────────
# SMTP (Gmail 이메일 발송)
# ─────────────────────────────────────────────────────────────────────────────

variable "smtp_user" {
  description = "Gmail SMTP 로그인 이메일. 비어있으면 SMTP 비활성화."
  type        = string
  default     = ""
  sensitive   = true
}

variable "smtp_pass" {
  description = "Gmail App Password (16자리). 계정 비밀번호가 아닌 앱 전용 비밀번호."
  type        = string
  default     = ""
  sensitive   = true
  # Google 계정 → 보안 → 2단계 인증 → 앱 비밀번호에서 생성.
}


# ─────────────────────────────────────────────────────────────────────────────
# Google reCAPTCHA v3 (봇 차단)
# ─────────────────────────────────────────────────────────────────────────────

variable "recaptcha_secret_key" {
  description = "Google reCAPTCHA v3 서버 시크릿 키. 비어있으면 검증 비활성화."
  type        = string
  default     = ""
  sensitive   = true
}

variable "recaptcha_enabled" {
  description = "true면 로그인/회원가입/대기열 진입 등에 reCAPTCHA 검증을 강제."
  type        = bool
  default     = false
}

variable "recaptcha_allowed_hostnames" {
  description = "reCAPTCHA 토큰 발급을 허용할 도메인. 쉼표로 구분 (예: 'queuing.com,www.queuing.com')."
  type        = string
  default     = ""
}


# ─────────────────────────────────────────────────────────────────────────────
# 프론트엔드 (S3 + CloudFront)
# ─────────────────────────────────────────────────────────────────────────────

variable "frontend_bucket_name" {
  description = "프론트엔드 S3 버킷 이름. 전역 고유해야 한다."
  type        = string
  default     = "team2-queuing"
  # S3 버킷 이름 규칙:
  #   - 소문자, 숫자, 하이픈만 사용 가능
  #   - 3~63자
  #   - 전 세계 모든 AWS 계정에서 고유해야 함
}

variable "frontend_subdomain" {
  description = "프론트엔드 서브도메인. domain_name과 결합되어 www.queuing.kr 형태가 된다."
  type        = string
  default     = "www"
}

variable "api_subdomain" {
  description = "API 서브도메인. domain_name과 결합되어 api.queuing.kr 형태가 된다."
  type        = string
  default     = "api"
  # 프론트엔드 코드에서 API base URL로 사용:
  #   fetch("https://api.queuing.kr/seats/available")
}


# ─────────────────────────────────────────────────────────────────────────────
# 도메인 & SSL (선택사항)
# ─────────────────────────────────────────────────────────────────────────────
# domain_name을 설정하면 다음이 자동 생성된다:
#   - Route 53 Hosted Zone
#   - ACM 인증서 (us-east-1, CloudFront용) + DNS 자동 검증
#   - www.도메인 → CloudFront (프론트엔드)
#   - api.도메인 → ALB (API 백엔드)
#
# domain_name이 비어있으면 DNS 관련 리소스가 생성되지 않고,
# CloudFront 기본 URL(xxxxx.cloudfront.net)과 ALB DNS로 접속.
# ─────────────────────────────────────────────────────────────────────────────

variable "domain_name" {
  description = "루트 도메인 (예: queuing.kr). 비어있으면 Route 53, ACM 미생성."
  type        = string
  default     = ""
  # 설정하면:
  #   Route 53 Hosted Zone 생성 → NS 4개를 도메인 구매처에 등록해야 함.
  #   ACM 인증서 자동 발급 (us-east-1, DNS 검증).
  #   www.queuing.kr → CloudFront, api.queuing.kr → ALB 자동 연결.
}

# acm_certificate_arn 변수는 제거됨.
# domain_name 설정 시 CloudFront용(us-east-1)과 ALB용(ap-northeast-2) ACM 인증서가
# 모두 자동으로 발급되고 DNS 검증·적용된다.
# → cloudfront.tf (프론트엔드 HTTPS)
# → alb.tf (API HTTPS)


# ─────────────────────────────────────────────────────────────────────────────
# WAF (Web Application Firewall)
# ─────────────────────────────────────────────────────────────────────────────

variable "waf_enabled" {
  description = "true면 CloudFront에 WAF를 적용하여 웹 공격 방어 활성화."
  type        = bool
  default     = true
  # WAF 비용: Web ACL $5 + Rule $1×4 + 요청당 $0.60/100만건 ≈ 월 $10~15
}

variable "waf_rate_limit" {
  description = "WAF Rate Limiting: 5분간 동일 IP에서 허용할 최대 요청 수."
  type        = number
  default     = 2000
  # 2000 = 5분간 2,000건 = 약 6.7 req/sec.
  # 정상 사용자에게 충분하지만, 매크로/봇의 과도한 요청은 차단.
  # 예매 오픈 시 정상 사용자가 초당 1~2회 새로고침 = 5분에 300~600건.
}
