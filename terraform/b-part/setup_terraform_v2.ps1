# QUEUING B-part Terraform scaffolding script (PowerShell)
# Run this FROM INSIDE the folder where you want the .tf files
# (e.g. C:\Users\CloudDX\Desktop\QUEUING-B\terraform)
# Usage: .\setup_terraform.ps1

New-Item -ItemType Directory -Force -Path "modules\network" | Out-Null

@'
terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Using local state for now.
  # Switch to the s3 backend below once you need shared/team state.
  # backend "s3" {
  #   bucket         = "queuing-tfstate-xxxx"
  #   key            = "b-part/terraform.tfstate"
  #   region         = "ap-northeast-2"
  #   dynamodb_table = "queuing-tfstate-lock"
  #   encrypt        = true
  # }
}
'@ | Out-File -FilePath "versions.tf" -Encoding utf8

@'
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
'@ | Out-File -FilePath "providers.tf" -Encoding utf8

@'
variable "aws_region" {
  description = "AWS region to deploy resources into"
  type        = string
  default     = "ap-northeast-2" # Seoul
}

variable "environment" {
  description = "Environment name (dev/stage/prod)"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Prefix used for resource names"
  type        = string
  default     = "queuing"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.20.0.0/16"
}

variable "az_count" {
  description = "Number of availability zones to use"
  type        = number
  default     = 2
}
'@ | Out-File -FilePath "variables.tf" -Encoding utf8

@'
module "network" {
  source = "./modules/network"

  project_name = var.project_name
  vpc_cidr     = var.vpc_cidr
  az_count     = var.az_count
}

# Next modules will be chained below:
# module "sqs" { ... }
# module "eks" { ... }
# module "db"  { ... }  # DynamoDB + ElastiCache
'@ | Out-File -FilePath "main.tf" -Encoding utf8

@'
output "vpc_id" {
  value = module.network.vpc_id
}

output "public_subnet_ids" {
  value = module.network.public_subnet_ids
}

output "private_subnet_ids" {
  value = module.network.private_subnet_ids
}
'@ | Out-File -FilePath "outputs.tf" -Encoding utf8

@'
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

# Public subnets (ALB, NAT Gateway)
resource "aws_subnet" "public" {
  count                   = var.az_count
  vpc_id                  = aws_vpc.this.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name                      = "${var.project_name}-public-${count.index}"
    "kubernetes.io/role/elb"  = "1"
  }
}

# Private subnets (EKS worker nodes, ElastiCache)
resource "aws_subnet" "private" {
  count             = var.az_count
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + var.az_count)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name                               = "${var.project_name}-private-${count.index}"
    "kubernetes.io/role/internal-elb"  = "1"
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
'@ | Out-File -FilePath "modules\network\main.tf" -Encoding utf8

@'
variable "project_name" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "az_count" {
  type = number
}
'@ | Out-File -FilePath "modules\network\variables.tf" -Encoding utf8

@'
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
'@ | Out-File -FilePath "modules\network\outputs.tf" -Encoding utf8

Write-Host "Done. Files created in current directory."
Write-Host "Next steps:"
Write-Host "  terraform init"
Write-Host "  terraform plan"
