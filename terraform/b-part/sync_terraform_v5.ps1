# QUEUING B-part Terraform - FULL SYNC (v5)
# Per team lead: stop running a separate VPC/EKS. Team shares
# one VPC + one EKS cluster (deploy into the queuing-b namespace
# directly via kubectl/helm) and one shared ElastiCache
# (queuing-redis). This build keeps only SQS + DynamoDB, which
# are VPC-independent and already working.
#
# Network/EKS module CODE is untouched on disk (modules\network,
# modules\eks) - only removed from main.tf's module calls, so
# running this + 'terraform apply' will DESTROY the currently
# running VPC/subnets/NAT/route tables (the ~$33/mo NAT Gateway)
# while leaving SQS and DynamoDB completely untouched.
#
# Run this FROM INSIDE the terraform folder.
# Usage: .\sync_terraform_v5.ps1

New-Item -ItemType Directory -Force -Path "modules\db" | Out-Null
New-Item -ItemType Directory -Force -Path "modules\eks" | Out-Null
New-Item -ItemType Directory -Force -Path "modules\network" | Out-Null
New-Item -ItemType Directory -Force -Path "modules\sqs" | Out-Null

@'
# --- Network & EKS: NOT deployed here ---
# Team runs a single shared VPC + EKS cluster. B-part work happens in the
# "queuing-b" namespace on that shared cluster (kubectl/helm directly,
# not via this terraform). Module code is kept on disk in case a truly
# isolated environment is needed later - just uncomment and re-apply.
#
# module "network" {
#   source = "./modules/network"
#   project_name = "queuing-b"
#   vpc_cidr     = var.vpc_cidr
#   az_count     = var.az_count
# }
#
# module "eks" {
#   source = "./modules/eks"
#   project_name       = var.project_name
#   aws_account_id     = var.aws_account_id
#   private_subnet_ids = module.network.private_subnet_ids
#   public_subnet_ids  = module.network.public_subnet_ids
# }

module "sqs" {
  source = "./modules/sqs"

  project_name = var.project_name
}

module "db" {
  source = "./modules/db"

  project_name = var.project_name
}

# ElastiCache: using team-shared queuing-redis, no module needed here.
'@ | Out-File -FilePath "main.tf" -Encoding utf8

@'
# waiting_queue: ordered list of people eligible for cancellation-ticket
# links, per event. PK=event_id groups all waiters for one show;
# SK=queue_index gives a natural sort order so "get the next N waiters"
# is a single cheap Query (begins/ends at a queue_index range).
resource "aws_dynamodb_table" "waiting_queue" {
  name         = "${var.project_name}-waiting-queue"
  billing_mode = "PAY_PER_REQUEST" # on-demand: traffic is spiky and bursty

  hash_key  = "event_id"
  range_key = "queue_index"

  attribute {
    name = "event_id"
    type = "S"
  }

  attribute {
    name = "queue_index"
    type = "N"
  }

  tags = {
    Name = "${var.project_name}-waiting-queue"
  }
}

# cancel_allocations: current seat -> user assignment when a cancellation
# link is issued. PK=event_id, SK=seat_id since a seat only has one
# active allocation at a time.
resource "aws_dynamodb_table" "cancel_allocations" {
  name         = "${var.project_name}-cancel-allocations"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "event_id"
  range_key = "seat_id"

  attribute {
    name = "event_id"
    type = "S"
  }

  attribute {
    name = "seat_id"
    type = "S"
  }

  # Best-effort cleanup of stale allocations. The exact 5-minute
  # enforcement still happens in Redis (ElastiCache) - this TTL is
  # just garbage collection, not the real-time timer.
  ttl {
    attribute_name = "expires_at_epoch"
    enabled        = true
  }

  tags = {
    Name = "${var.project_name}-cancel-allocations"
  }
}

# cancellation_link: the single-use token a user actually clicks.
# PK=token because lookups happen by token only (user opens the link).
# A GSI on seat_id lets a worker find "the link for this seat" when it
# needs to expire/reissue one from the allocation side.
resource "aws_dynamodb_table" "cancellation_link" {
  name         = "${var.project_name}-cancellation-link"
  billing_mode = "PAY_PER_REQUEST"

  hash_key = "token"

  attribute {
    name = "token"
    type = "S"
  }

  attribute {
    name = "seat_id"
    type = "S"
  }

  global_secondary_index {
    name            = "seat_id-index"
    hash_key        = "seat_id"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expires_at_epoch"
    enabled        = true
  }

  tags = {
    Name = "${var.project_name}-cancellation-link"
  }
}
'@ | Out-File -FilePath "modules\db\main.tf" -Encoding utf8

@'
output "waiting_queue_table_name" {
  value = aws_dynamodb_table.waiting_queue.name
}

output "waiting_queue_table_arn" {
  value = aws_dynamodb_table.waiting_queue.arn
}

output "cancel_allocations_table_name" {
  value = aws_dynamodb_table.cancel_allocations.name
}

output "cancel_allocations_table_arn" {
  value = aws_dynamodb_table.cancel_allocations.arn
}

output "cancellation_link_table_name" {
  value = aws_dynamodb_table.cancellation_link.name
}

output "cancellation_link_table_arn" {
  value = aws_dynamodb_table.cancellation_link.arn
}
'@ | Out-File -FilePath "modules\db\outputs.tf" -Encoding utf8

@'
variable "project_name" {
  type = string
}
'@ | Out-File -FilePath "modules\db\variables.tf" -Encoding utf8

@'
# This account blocks iam:GetRole/ListAttachedUserPolicies for students,
# so we cannot look roles up via data source. An admin pre-provisioned
# the roles this project needs (confirmed via `aws iam list-roles`,
# which IS allowed) - build their ARNs directly instead of reading them.
locals {
  cluster_role_arn = "arn:aws:iam::${var.aws_account_id}:role/queuing-eks-cluster-role"
  node_role_arn     = "arn:aws:iam::${var.aws_account_id}:role/queuing-eks-node-role"
}
'@ | Out-File -FilePath "modules\eks\iam.tf" -Encoding utf8

@'
resource "aws_eks_cluster" "this" {
  name     = "${var.project_name}-eks"
  role_arn = local.cluster_role_arn
  version  = var.cluster_version

  vpc_config {
    subnet_ids = concat(var.private_subnet_ids, var.public_subnet_ids)
  }

  tags = {
    Name = "${var.project_name}-eks"
  }
}

resource "aws_eks_node_group" "this" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "${var.project_name}-workers"
  node_role_arn   = local.node_role_arn
  subnet_ids      = var.private_subnet_ids

  instance_types = var.node_instance_types

  scaling_config {
    desired_size = var.desired_size
    min_size     = var.min_size
    max_size     = var.max_size
  }

  tags = {
    Name = "${var.project_name}-workers"
  }
}

# OIDC provider - lets Kubernetes service accounts assume IAM roles
# (IRSA). KEDA's SQS scaler will use this later to read queue depth
# without needing broad node-level IAM permissions.
# NOTE: if this also fails with AccessDenied (iam:CreateOpenIDConnectProvider),
# check whether one already exists: aws iam list-open-id-connect-providers
data "tls_certificate" "eks" {
  url = aws_eks_cluster.this.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "eks" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.this.identity[0].oidc[0].issuer
}
'@ | Out-File -FilePath "modules\eks\main.tf" -Encoding utf8

@'
output "cluster_name" {
  value = aws_eks_cluster.this.name
}

output "cluster_endpoint" {
  value = aws_eks_cluster.this.endpoint
}

output "cluster_certificate_authority_data" {
  value = aws_eks_cluster.this.certificate_authority[0].data
}

output "oidc_provider_arn" {
  value = aws_iam_openid_connect_provider.eks.arn
}

output "oidc_provider_url" {
  value = aws_iam_openid_connect_provider.eks.url
}
'@ | Out-File -FilePath "modules\eks\outputs.tf" -Encoding utf8

@'
variable "project_name" {
  type = string
}

variable "aws_account_id" {
  description = "AWS account ID, used to build IAM role ARNs directly without calling iam:GetRole (blocked for this account)"
  type        = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "cluster_version" {
  description = "Kubernetes version for the EKS control plane"
  type        = string
  default     = "1.31"
}

variable "node_instance_types" {
  description = "EC2 instance types for the managed node group"
  type        = list(string)
  default     = ["t3.small"]
}

variable "desired_size" {
  type    = number
  default = 1
}

variable "min_size" {
  type    = number
  default = 1
}

variable "max_size" {
  type    = number
  default = 3
}
'@ | Out-File -FilePath "modules\eks\variables.tf" -Encoding utf8

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
# Dead Letter Queue - holds messages that failed processing
# after max_receive_count retries. Lets you inspect/replay bad events
# instead of losing them silently.
resource "aws_sqs_queue" "dlq" {
  name                      = "${var.project_name}-cancellation-events-dlq"
  message_retention_seconds = 1209600 # 14 days, the SQS max

  tags = {
    Name = "${var.project_name}-cancellation-events-dlq"
  }
}

# Main queue - buffers "ticket cancelled" events so a traffic spike
# (many cancellations at once) doesn't hit the backend/DB directly.
# Workers (EKS + KEDA) will poll this queue.
resource "aws_sqs_queue" "cancellation_events" {
  name                       = "${var.project_name}-cancellation-events"
  visibility_timeout_seconds = var.visibility_timeout_seconds
  message_retention_seconds  = var.message_retention_seconds
  receive_wait_time_seconds  = 10 # long polling, cuts empty-receive cost

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = var.max_receive_count
  })

  tags = {
    Name = "${var.project_name}-cancellation-events"
  }
}

# Let the main queue's DLQ policy actually point at a queue this account
# owns and can redrive into - required by AWS for redrive_allow_policy.
resource "aws_sqs_queue_redrive_allow_policy" "dlq" {
  queue_url = aws_sqs_queue.dlq.id

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.cancellation_events.arn]
  })
}
'@ | Out-File -FilePath "modules\sqs\main.tf" -Encoding utf8

@'
output "queue_url" {
  value = aws_sqs_queue.cancellation_events.id
}

output "queue_arn" {
  value = aws_sqs_queue.cancellation_events.arn
}

output "dlq_url" {
  value = aws_sqs_queue.dlq.id
}

output "dlq_arn" {
  value = aws_sqs_queue.dlq.arn
}
'@ | Out-File -FilePath "modules\sqs\outputs.tf" -Encoding utf8

@'
variable "project_name" {
  type = string
}

variable "visibility_timeout_seconds" {
  description = "How long a message is hidden after a worker picks it up, before it becomes visible again if not deleted"
  type        = number
  default     = 30
}

variable "message_retention_seconds" {
  description = "How long an unprocessed message stays in the queue"
  type        = number
  default     = 345600 # 4 days
}

variable "max_receive_count" {
  description = "How many times a worker can fail to process a message before it moves to the DLQ"
  type        = number
  default     = 5
}
'@ | Out-File -FilePath "modules\sqs\variables.tf" -Encoding utf8

@'
# Network/EKS outputs removed along with the modules (see main.tf).
# Uncomment if those modules are re-enabled later.
#
# output "vpc_id" {
#   value = module.network.vpc_id
# }
# output "public_subnet_ids" {
#   value = module.network.public_subnet_ids
# }
# output "private_subnet_ids" {
#   value = module.network.private_subnet_ids
# }
# output "eks_cluster_name" {
#   value = module.eks.cluster_name
# }
# output "eks_cluster_endpoint" {
#   value = module.eks.cluster_endpoint
# }
# output "eks_oidc_provider_arn" {
#   value = module.eks.oidc_provider_arn
# }

output "sqs_queue_url" {
  value = module.sqs.queue_url
}

output "sqs_queue_arn" {
  value = module.sqs.queue_arn
}

output "sqs_dlq_url" {
  value = module.sqs.dlq_url
}

output "waiting_queue_table_name" {
  value = module.db.waiting_queue_table_name
}

output "cancel_allocations_table_name" {
  value = module.db.cancel_allocations_table_name
}

output "cancellation_link_table_name" {
  value = module.db.cancellation_link_table_name
}
'@ | Out-File -FilePath "outputs.tf" -Encoding utf8

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

variable "aws_account_id" {
  description = "AWS account ID (this account blocks iam:GetRole, so ARNs are built from this instead of looked up)"
  type        = string
  default     = "230790682749"
}
'@ | Out-File -FilePath "variables.tf" -Encoding utf8

@'
terraform {
  required_version = ">= 1.6"

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

Write-Host "Done. main.tf now only calls sqs + db modules."
Write-Host "Next: terraform init && terraform plan"
Write-Host "Expect ~14 resources to DESTROY (network module only)"
Write-Host "and 0 changes to sqs/db. Review carefully before apply."
