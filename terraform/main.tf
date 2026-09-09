# =============================================================================
# QUEUING API — AWS 인프라 (Terraform) 메인 설정
# =============================================================================
#
# [역할]
# Terraform 프로바이더, 버전 제약, 원격 상태 백엔드, 공통 로컬 변수를 정의한다.
# 모든 .tf 파일이 이 설정을 공유하며, 여기서 선언된 provider "aws"가
# 다른 파일의 aws_* 리소스를 생성할 때 사용된다.
#
# [아키텍처 요약]
#   사용자 → CloudFront → S3 (프론트엔드 정적 파일)
#         → CloudFront → ALB → EC2 ASG (API 서버)
#                                 │            │
#                           ElastiCache      RDS MariaDB
#                             (Redis)
#
# [온프레미스 → AWS 매핑]
#   K8s Deployment     → EKS + Managed Node Group (eks.tf)
#   K8s HPA            → 기존 HPA 그대로 사용     (Helm 차트)
#   K8s NodePort       → ALB + Target Group      (alb.tf)
#   온프레미스 Redis    → ElastiCache             (elasticache.tf)
#   외부 MariaDB       → RDS                     (rds.tf)
#   K8s Secret         → Secrets Manager          (secrets.tf)
#   Nginx 정적 서빙    → S3 + CloudFront + OAC   (s3.tf, cloudfront.tf)
#   도메인 DNS         → Route 53                 (route53.tf)
# =============================================================================

# -----------------------------------------------------------------------------
# [terraform 블록] Terraform 자체의 버전 제약과 필요한 프로바이더를 선언.
#
#   required_version : 이 코드를 실행하려면 Terraform CLI 1.5.0 이상 필요.
#   required_providers : AWS 프로바이더 5.x 버전을 HashiCorp 레지스트리에서 가져온다.
# -----------------------------------------------------------------------------
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"   # HashiCorp 공식 AWS 프로바이더
      version = "~> 5.0"          # 5.0 이상 ~ 6.0 미만
    }
    tls = {
      source  = "hashicorp/tls"   # OIDC Provider 인증서 지문 조회용
      version = "~> 4.0"
    }
  }

  # ---------------------------------------------------------------------------
  # [원격 상태 백엔드 (S3 + DynamoDB)]
  # terraform.tfstate 파일을 S3에 저장하고, DynamoDB로 동시 실행을 잠금(lock)한다.
  # 팀 협업 시 주석을 해제하고 미리 S3 버킷 + DynamoDB 테이블을 생성해야 한다.
  #
  #   bucket         : tfstate 파일을 저장할 S3 버킷 이름
  #   key            : 버킷 내 tfstate 파일 경로 (폴더처럼 구분 가능)
  #   region         : S3 버킷이 위치한 리전
  #   dynamodb_table : 동시 terraform apply 방지를 위한 잠금 테이블
  #   encrypt        : tfstate 파일 서버사이드 암호화 (AES-256)
  # ---------------------------------------------------------------------------
  # backend "s3" {
  #   bucket         = "queuing-terraform-state"
  #   key            = "api/terraform.tfstate"
  #   region         = "ap-northeast-2"
  #   dynamodb_table = "terraform-locks"
  #   encrypt        = true
  # }
}

# -----------------------------------------------------------------------------
# [provider "aws"] AWS API 호출에 사용할 인증·리전·기본 태그 설정.
#
#   region       : 리소스가 생성될 AWS 리전 (서울: ap-northeast-2)
#   default_tags : 이 프로바이더로 생성하는 모든 리소스에 자동으로 붙는 태그.
#                  비용 추적, 리소스 필터링, 소유자 식별에 사용.
# -----------------------------------------------------------------------------
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "queuing"        # 비용 추적용 프로젝트 태그
      Environment = var.environment  # dev / staging / prod 환경 구분
      ManagedBy   = "terraform"      # 수동 생성 리소스와 구분
    }
  }
}

# -----------------------------------------------------------------------------
# [provider "aws" — us-east-1] CloudFront용 ACM 인증서 전용 프로바이더.
#
# CloudFront는 us-east-1(N. Virginia) 리전의 ACM 인증서만 인식한다.
# alias로 별도 프로바이더를 정의하여 ACM 인증서를 us-east-1에 생성.
# 사용법: resource "aws_acm_certificate" "..." { provider = aws.us_east_1 }
# -----------------------------------------------------------------------------
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "queuing"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# -----------------------------------------------------------------------------
# [Data Sources] 실행 시점에 AWS에서 동적으로 조회하는 읽기 전용 데이터.
#
#   aws_caller_identity : 현재 AWS 계정 ID를 가져온다.
#                         → ECR 레포 URL, IAM ARN 등에서 계정 ID가 필요할 때 참조.
#   aws_availability_zones : 해당 리전에서 사용 가능한 AZ(가용 영역) 목록을 가져온다.
#                            → 하드코딩("ap-northeast-2a") 대신 동적으로 AZ를 배정.
# -----------------------------------------------------------------------------
data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" {
  state = "available"  # "available" 상태인 AZ만 필터
}

# -----------------------------------------------------------------------------
# [locals] 여러 파일에서 반복 사용하는 값을 변수처럼 정의.
#   terraform.tfvars에서 바꿀 수 없고, 코드 내에서만 참조된다.
#
#   name_prefix : 모든 리소스 이름 앞에 붙는 접두사 (예: "queuing-prod")
#                 → 동일 계정에서 dev/prod를 이름으로 구분할 수 있다.
#   azs         : 가용 영역 목록에서 앞 2개만 사용 (2 AZ 고가용성 구성)
#   common_tags : default_tags 외에 추가로 붙일 태그 (현재는 사용하지 않음)
# -----------------------------------------------------------------------------
locals {
  name_prefix = "queuing-${var.environment}"
  azs         = slice(data.aws_availability_zones.available.names, 0, 2)

  common_tags = {
    Project     = "queuing"
    Environment = var.environment
  }
}
