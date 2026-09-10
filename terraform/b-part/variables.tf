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
