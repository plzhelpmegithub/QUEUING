terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # AWS 계정 준비되면 S3 버킷 만들어서 아래처럼 원격 state 관리 권장
  # (지금은 로컬에 state 저장, 팀 협업 시 충돌 위험 있음 - 나중에 꼭 바꿀 것)
  # backend "s3" {
  #   bucket = "queuing-terraform-state"
  #   key    = "aws/terraform.tfstate"
  #   region = "ap-northeast-2"
  # }
}

provider "aws" {
  region = var.aws_region
}
