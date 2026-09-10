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
