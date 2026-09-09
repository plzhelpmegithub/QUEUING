# ──────────────────────────────────────────────
# ECR — Docker 이미지 저장소
# (기존 DockerHub chlwldp/realtime-ws 대체)
# ──────────────────────────────────────────────

resource "aws_ecr_repository" "ws_server" {
  name                 = "${var.project}/realtime-ws"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = { Name = "${var.project}-ecr-ws" }
}

resource "aws_ecr_repository" "api_server" {
  name                 = "${var.project}/api-server"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = { Name = "${var.project}-ecr-api" }
}

# 오래된 이미지 자동 정리 (최근 10개만 유지)
resource "aws_ecr_lifecycle_policy" "ws_cleanup" {
  repository = aws_ecr_repository.ws_server.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_ecr_lifecycle_policy" "api_cleanup" {
  repository = aws_ecr_repository.api_server.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}
