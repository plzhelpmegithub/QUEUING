variable "aws_region" {
  description = "AWS 리전 (서울)"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "프로젝트 이름 (리소스 태그/이름에 공통으로 붙임)"
  type        = string
  default     = "queuing"
}

variable "environment" {
  description = "배포 환경"
  type        = string
  default     = "production"
}

variable "vpc_cidr" {
  description = "VPC 전체 IP 대역"
  type        = string
  default     = "10.0.0.0/16"
}
