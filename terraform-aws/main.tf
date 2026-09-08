terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project = var.project
      Team    = "2team"
    }
  }
}

# CloudFront에 붙일 ACM 인증서는 반드시 us-east-1(버지니아)에 있어야 한다.
# AWS가 정한 제약이라 우회할 방법이 없어서, 그 인증서 전용으로 별칭 프로바이더를 둔다.
# ALB용 인증서는 서울(var.region)에 만든다 — 같은 도메인이라도 인증서가 두 장 필요하다.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project = var.project
      Team    = "2team"
    }
  }
}

data "aws_caller_identity" "current" {}
