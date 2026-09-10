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
