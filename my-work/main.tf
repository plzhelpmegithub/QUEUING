# 1. 테라폼 플러그인 버전 고정 (LocalStack 안정성 확보)
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# 2. AWS 프로바이더 설정
provider "aws" {
  region                      = "ap-northeast-2"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    sqs      = "http://127.0.0.1:4566"
    dynamodb = "http://127.0.0.1:4566"
    sts      = "http://127.0.0.1:4566"  # <- 테라폼이 자원을 잃어버리지 않게 잡아주는 핵심 키!
  }
}

# 3. Dead Letter Queue (DLQ)
resource "aws_sqs_queue" "dlq" {
  name = "resale-email-dlq"
}

# 4. Main Queue 및 Redrive Policy
resource "aws_sqs_queue" "main_queue" {
  name = "resale-email"

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })
}

# 5. DynamoDB 상태 관리 테이블 (우리가 설계한 구조 그대로!)
resource "aws_dynamodb_table" "state_table" {
  name         = "allocation-state"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "allocation_id"

  attribute {
    name = "allocation_id"
    type = "S"
  }
}
