# QUEUING B-part Terraform - add SQS module
# Run this FROM INSIDE the same terraform folder as before
# Usage: .\add_sqs_module.ps1
# This overwrites main.tf and outputs.tf (adds sqs module wiring)
# and creates modules\sqs\*.tf - safe to re-run.

New-Item -ItemType Directory -Force -Path "modules\sqs" | Out-Null

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

# Next modules will be chained below:
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

output "sqs_queue_url" {
  value = module.sqs.queue_url
}

output "sqs_queue_arn" {
  value = module.sqs.queue_arn
}

output "sqs_dlq_url" {
  value = module.sqs.dlq_url
}
'@ | Out-File -FilePath "outputs.tf" -Encoding utf8

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

Write-Host "Done. SQS module added, main.tf and outputs.tf updated."
Write-Host "Next steps:"
Write-Host "  terraform init"
Write-Host "  terraform plan"
