#!/usr/bin/env bash
# QUEUING B-part Terraform 스캐폴딩 스크립트
# 실행: bash setup_terraform.sh
set -e

mkdir -p terraform/modules/network

cat > terraform/versions.tf << 'TFEOF'
terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # 지금은 local state로 시작.
  # 나중에 팀/CI에서 같이 쓸 때는 아래 backend "s3" 블록으로 바꾸면 됨.
  # backend "s3" {
  #   bucket         = "queuing-tfstate-xxxx"
  #   key            = "b-part/terraform.tfstate"
  #   region         = "ap-northeast-2"
  #   dynamodb_table = "queuing-tfstate-lock"
  #   encrypt        = true
  # }
}
TFEOF

cat > terraform/providers.tf << 'TFEOF'
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "queuing"
      Part        = "b-part"
      ManagedBy   = "terraform"
      Environment = var.environment
    }
  }
}
TFEOF

cat > terraform/variables.tf << 'TFEOF'
variable "aws_region" {
  description = "리소스를 배포할 AWS 리전"
  type        = string
  default     = "ap-northeast-2" # 서울 리전
}

variable "environment" {
  description = "환경 구분 (dev/stage/prod)"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "리소스 이름에 붙는 프로젝트 접두사"
  type        = string
  default     = "queuing"
}

variable "vpc_cidr" {
  description = "VPC CIDR 블록"
  type        = string
  default     = "10.20.0.0/16"
}

variable "az_count" {
  description = "사용할 가용영역(AZ) 개수"
  type        = number
  default     = 2
}
TFEOF

cat > terraform/main.tf << 'TFEOF'
module "network" {
  source = "./modules/network"

  project_name = var.project_name
  vpc_cidr     = var.vpc_cidr
  az_count     = var.az_count
}

# 다음 단계에서 여기 아래로 이어붙일 모듈들:
# module "sqs" { ... }
# module "eks" { ... }
# module "db" { ... }  # DynamoDB + ElastiCache
TFEOF

cat > terraform/outputs.tf << 'TFEOF'
output "vpc_id" {
  value = module.network.vpc_id
}

output "public_subnet_ids" {
  value = module.network.public_subnet_ids
}

output "private_subnet_ids" {
  value = module.network.private_subnet_ids
}
TFEOF

cat > terraform/modules/network/main.tf << 'TFEOF'
data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${var.project_name}-vpc"
  }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "${var.project_name}-igw"
  }
}

# 퍼블릭 서브넷 (ALB, NAT Gateway용)
resource "aws_subnet" "public" {
  count                   = var.az_count
  vpc_id                  = aws_vpc.this.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name                                          = "${var.project_name}-public-${count.index}"
    "kubernetes.io/role/elb"                      = "1"
  }
}

# 프라이빗 서브넷 (EKS 워커노드, ElastiCache용)
resource "aws_subnet" "private" {
  count             = var.az_count
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + var.az_count)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name                                          = "${var.project_name}-private-${count.index}"
    "kubernetes.io/role/internal-elb"             = "1"
  }
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags = {
    Name = "${var.project_name}-nat-eip"
  }
}

resource "aws_nat_gateway" "this" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name = "${var.project_name}-nat"
  }

  depends_on = [aws_internet_gateway.this]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = {
    Name = "${var.project_name}-public-rt"
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this.id
  }

  tags = {
    Name = "${var.project_name}-private-rt"
  }
}

resource "aws_route_table_association" "public" {
  count          = var.az_count
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = var.az_count
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}
TFEOF

cat > terraform/modules/network/variables.tf << 'TFEOF'
variable "project_name" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "az_count" {
  type = number
}
TFEOF

cat > terraform/modules/network/outputs.tf << 'TFEOF'
output "vpc_id" {
  value = aws_vpc.this.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "vpc_cidr_block" {
  value = aws_vpc.this.cidr_block
}
TFEOF

echo "terraform/ 폴더 생성 완료"
echo "다음 명령 실행하세요:"
echo "  cd terraform && terraform init && terraform plan"
