# QUEUING B-part Terraform - add DynamoDB module
# (waiting_queue, cancel_allocations, cancellation_link)
# Run this FROM INSIDE the same terraform folder as before
# Usage: .\add_db_module.ps1
# Overwrites main.tf, outputs.tf (adds db wiring)
# and creates modules\db\*.tf - safe to re-run.

New-Item -ItemType Directory -Force -Path "modules\db" | Out-Null

@'
module "network" {
  source = "./modules/network"

  project_name = var.project_name
  vpc_cidr     = var.vpc_cidr
  az_count     = var.az_count
}

module "sqs" {
  source = "./modules/sqs"

  project_name = var.project_name
}

module "eks" {
  source = "./modules/eks"

  project_name       = var.project_name
  private_subnet_ids = module.network.private_subnet_ids
  public_subnet_ids  = module.network.public_subnet_ids
}

module "db" {
  source = "./modules/db"

  project_name = var.project_name
}

# Next: ElastiCache (Redis) for distributed locking + precise TTL timers
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

output "sqs_queue_url" {
  value = module.sqs.queue_url
}

output "sqs_queue_arn" {
  value = module.sqs.queue_arn
}

output "sqs_dlq_url" {
  value = module.sqs.dlq_url
}

output "eks_cluster_name" {
  value = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "eks_oidc_provider_arn" {
  value = module.eks.oidc_provider_arn
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
variable "project_name" {
  type = string
}
'@ | Out-File -FilePath "modules\db\variables.tf" -Encoding utf8

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

Write-Host "Done. DynamoDB module added, root files updated."
Write-Host "Next steps:"
Write-Host "  terraform init"
Write-Host "  terraform plan"
