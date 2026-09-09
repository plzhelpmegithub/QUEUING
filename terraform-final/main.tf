# ──────────────────────────────────────────────
# QUEUING — AWS 인프라 통합 (terraform-final)
#
# 네 사람이 각자 만든 테라폼을 하나로 합쳤다. 어느 파일의 어느 부분이 누구
# 안에서 온 것인지는 각 파일 머리말에 적어두었다.
#
#   실행 기반    EKS            (지예 C · 예지 D 안이 일치)
#   VPC/서브넷   cidrsubnet     (찬규 A · 예지 D 안이 일치)
#   IRSA/SES     예지 D
#   RDS/보안설정 찬규 A
#   SQS/DynamoDB 건아 B
#   ALB/도메인   지예 C
# ──────────────────────────────────────────────

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # ── 원격 상태 백엔드 (찬규 안에서 가져옴) ──
  #
  # 지금은 상태 파일이 apply 를 실행한 사람의 PC 에만 있다. 두 사람이 각자
  # apply 하면 서로의 상태를 모른 채 같은 리소스를 두 번 만들거나 지운다.
  #
  # S3 에 두면 상태가 한 곳에 모이고, DynamoDB 잠금이 동시 실행을 막는다.
  # 쓰려면 버킷과 테이블을 먼저 만들어야 해서(닭과 달걀) 주석으로 둔다.
  #
  #   aws s3api create-bucket --bucket queuing-tfstate-<계정ID> \
  #     --region ap-northeast-2 \
  #     --create-bucket-configuration LocationConstraint=ap-northeast-2
  #   aws s3api put-bucket-versioning --bucket queuing-tfstate-<계정ID> \
  #     --versioning-configuration Status=Enabled
  #   aws dynamodb create-table --table-name queuing-tfstate-lock \
  #     --attribute-definitions AttributeName=LockID,AttributeType=S \
  #     --key-schema AttributeName=LockID,KeyType=HASH \
  #     --billing-mode PAY_PER_REQUEST --region ap-northeast-2
  #
  # 그다음 아래 주석을 풀고 terraform init -migrate-state 를 실행한다.
  #
  # backend "s3" {
  #   bucket         = "queuing-tfstate-<계정ID>"
  #   key            = "terraform-final/terraform.tfstate"
  #   region         = "ap-northeast-2"
  #   dynamodb_table = "queuing-tfstate-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.region

  # 모든 리소스에 자동으로 붙는 태그. 비용 탐색기에서 프로젝트별로 묶어 볼 수
  # 있고, 나중에 무엇이 이 프로젝트 것인지 구분할 때도 쓴다. (찬규 안에서 가져옴)
  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# CloudFront 에 붙일 ACM 인증서는 반드시 us-east-1(버지니아)에 있어야 한다.
# AWS 가 정한 제약이라 우회할 방법이 없다. 세 사람 모두 이 별칭을 두고 있었다.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}
