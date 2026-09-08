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
# EC2 / API 서버
# ─────────────────────────────────────────────────────────────────────────────

variable "ec2_ami_id" {
  description = "EC2 인스턴스에 사용할 AMI ID."
  type        = string
  default     = "ami-0bc151a94289adb52"
  # 사용자 지정 AMI. Amazon Linux 2 기반.
  # 리전별로 AMI ID가 다르므로 ap-northeast-2 전용.
}

variable "ec2_instance_type" {
  description = "EC2 인스턴스 유형. vCPU와 메모리 크기를 결정."
  type        = string
  default     = "t3.micro"
  # t3.micro  : 2 vCPU, 1 GiB RAM (프리티어, 개발/테스트)
  # t3.small  : 2 vCPU, 2 GiB RAM (소규모 프로덕션)
  # t3.medium : 2 vCPU, 4 GiB RAM (중규모 프로덕션)
  # 현재 K8s: requests 200m CPU, 128Mi RAM → t3.micro면 충분.
  # 부하 테스트 후 필요 시 상향.
}

variable "ec2_volume_size" {
  description = "EC2 루트 볼륨 크기(GiB). Docker 이미지 저장 공간 포함."
  type        = number
  default     = 20
  # gp3 기본: 3,000 IOPS, 125 MiB/s 포함.
  # Docker 이미지(~500MB) + OS + 로그 고려하여 20GiB.
}

variable "api_image_repo" {
  description = "API Docker 이미지 저장소. Docker Hub 경로 또는 ECR URL."
  type        = string
  default     = "mover14/redis-api-backend"
  # Docker Hub에서 직접 Pull한다.
  # ECR로 전환할 때 이 값만 ECR URL로 변경하면 된다.
  # 예: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/queuing-prod-api"
}

variable "api_image_tag" {
  description = "API Docker 이미지 태그(버전). Dockerfile 빌드 시 지정한 태그와 일치해야 한다."
  type        = string
  default     = "1.0.8"
}

variable "api_desired_count" {
  description = "Auto Scaling Group이 유지할 기본 인스턴스 수."
  type        = number
  default     = 2
  # K8s replicaCount: 2와 동일.
}

variable "api_min_count" {
  description = "Auto Scaling 최소 인스턴스 수. 트래픽이 없어도 이 수만큼은 항상 실행."
  type        = number
  default     = 1
  # K8s HPA minReplicas: 1과 동일.
}

variable "api_max_count" {
  description = "Auto Scaling 최대 인스턴스 수. CPU 과부하 시 이 수까지 스케일 아웃."
  type        = number
  default     = 10
  # K8s HPA maxReplicas: 10과 동일.
}

variable "api_autoscaling_cpu_target" {
  description = "CPU 사용률이 이 값(%)을 넘으면 인스턴스를 추가. 밑돌면 축소."
  type        = number
  default     = 70
  # K8s HPA targetCPUUtilizationPercentage: 70과 동일.
}


# ─────────────────────────────────────────────────────────────────────────────
# RDS (MariaDB)
# ─────────────────────────────────────────────────────────────────────────────

variable "db_instance_class" {
  description = "RDS 인스턴스 유형. vCPU와 메모리 크기를 결정."
  type        = string
  default     = "db.t3.micro"
  # db.t3.micro : 2 vCPU, 1 GiB RAM (프리티어 대상, 개발/테스트용)
  # db.t3.small : 2 vCPU, 2 GiB RAM (소규모 프로덕션)
  # db.t3.medium: 2 vCPU, 4 GiB RAM (중규모 프로덕션)
}

variable "db_allocated_storage" {
  description = "RDS 초기 스토리지 크기(GiB). max_allocated_storage까지 자동 확장."
  type        = number
  default     = 20
  # max_allocated_storage = 이 값 × 2 = 40GiB 까지 자동 확장.
  # gp3 스토리지: 기본 3,000 IOPS, 125 MiB/s 처리량 포함.
}

variable "db_name" {
  description = "RDS 인스턴스 생성 시 자동으로 만들 데이터베이스 이름."
  type        = string
  default     = "queuing_db"
  # API 코드의 DB_NAME 환경변수와 일치해야 한다.
}

variable "db_username" {
  description = "RDS 마스터 사용자 이름."
  type        = string
  default     = "team2"
  # 온프레미스 DB_USER: "team2"와 동일하게 유지.
}

variable "db_password" {
  description = "RDS 마스터 비밀번호. terraform.tfvars에 작성하고 절대 커밋하지 않는다."
  type        = string
  sensitive   = true
  # plan/apply 출력에서 "(sensitive value)"로 마스킹됨.
  # Secrets Manager에도 저장되어 ECS Task가 런타임에 참조.
}


# ─────────────────────────────────────────────────────────────────────────────
# ElastiCache (Redis)
# ─────────────────────────────────────────────────────────────────────────────

variable "redis_node_type" {
  description = "ElastiCache 노드 유형. 메모리 크기를 결정."
  type        = string
  default     = "cache.t3.micro"
  # cache.t3.micro : 0.5 GiB (프리티어 대상, 개발/테스트)
  # cache.t3.small : 1.37 GiB (소규모 프로덕션)
  # cache.t3.medium: 3.09 GiB (중규모 프로덕션)
  # 좌석 6,600개 기준 Redis 메모리 ~50MB 사용 → micro면 충분.
}

variable "redis_num_cache_nodes" {
  description = "Redis 클러스터 노드 수. 1이면 단일 노드(Cluster Mode 비활성화)."
  type        = number
  default     = 1
  # 고가용성이 필요하면 Replication Group으로 전환 권장 (별도 리소스).
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

variable "acm_certificate_arn" {
  description = "ALB용 ACM 인증서 ARN (ap-northeast-2). 지정하면 HTTPS(443) 리스너 활성화."
  type        = string
  default     = ""
  # CloudFront용 인증서는 Terraform이 us-east-1에 자동 발급 (cloudfront.tf).
  # 이 변수는 ALB 전용. api.queuing.kr HTTPS가 필요하면 ap-northeast-2에서 별도 발급:
  #   aws acm request-certificate --domain-name api.queuing.kr --validation-method DNS
}
