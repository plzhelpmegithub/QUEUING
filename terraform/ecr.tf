# =============================================================================
# ECR (Elastic Container Registry) — Docker 이미지 프라이빗 저장소
# =============================================================================
#
# [역할]
# Docker Hub 대신 AWS 내부에 이미지를 저장하는 프라이빗 레지스트리.
# 현재는 Docker Hub(mover14/redis-api-backend)를 직접 사용하므로 선택사항이다.
# Docker Hub Rate Limit(6시간/100회)이 문제되면 ECR로 전환.
#
# [전환 방법]
#   1. docker pull mover14/redis-api-backend:1.0.8
#   2. docker tag ... <ECR_URL>:1.0.8
#   3. docker push <ECR_URL>:1.0.8
#   4. terraform.tfvars에서 api_image_repo = "<ECR_URL>" 로 변경
# =============================================================================


# -----------------------------------------------------------------------------
# [ECR Repository] Docker 이미지를 저장하는 레포지토리.
#
#   name                 : 레포 이름 (예: "queuing-prod-api")
#   image_tag_mutability : "MUTABLE"이면 같은 태그(예: latest)에 새 이미지를 덮어쓸 수 있음.
#                          "IMMUTABLE"이면 한번 Push된 태그는 변경 불가 (프로덕션 안전).
#   force_delete         : true면 이미지가 남아있어도 terraform destroy로 레포 삭제 가능.
#   scan_on_push         : Push할 때마다 자동으로 보안 취약점 스캔 (CVE 검사).
# -----------------------------------------------------------------------------
resource "aws_ecr_repository" "api" {
  name                 = "${local.name_prefix}-api"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true   # 이미지 Push 시 자동 취약점 스캔
  }

  tags = { Name = "${local.name_prefix}-api-ecr" }
}

# -----------------------------------------------------------------------------
# [ECR Lifecycle Policy] 오래된 이미지를 자동 삭제하여 스토리지 비용 절약.
#
#   rulePriority : 규칙 우선순위 (낮을수록 먼저 적용)
#   tagStatus    : "any" = 태그 유무와 관계없이 모든 이미지 대상
#   countType    : "imageCountMoreThan" = 이미지 개수가 N개를 넘으면
#   countNumber  : 10 = 최근 10개만 유지, 나머지는 삭제
#
# 예: 11번째 이미지가 Push되면 가장 오래된 1개가 자동 삭제됨.
# -----------------------------------------------------------------------------
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "최근 10개 이미지만 유지"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = { type = "expire" }
      }
    ]
  })
}
