# ──────────────────────────────────────────────
# ECR — Docker 이미지 저장소
# (기존 DockerHub chlwldp/realtime-ws 대체)
# ──────────────────────────────────────────────

# ──────────────────────────────────────────────
# 파트별 저장소 (2026-09-09: 2개 → 4개)
#
# 원래 C·A파트만 있었다. 네 파트 전부 젠킨스로 빌드해서 올리므로 4개가 필요하다.
# 온프레미스 Docker Hub 경로와 대응은 이렇다.
#
#   A 찬규  mover14/redis-api-backend  → queuing/api-server
#   B 건아  dororonge/queuing-worker   → queuing/worker
#   C 지예  chlwldp/realtime-ws        → queuing/realtime-ws
#   D 예지  ttomang/backend-counter    → queuing/counter
#
# ⚠️ 각 파트 Helm values.yaml 의 image.repository 를 아래 주소로 바꿔야 한다.
#    terraform output ecr_repositories 로 전체 주소가 나온다.
#      230790682749.dkr.ecr.ap-northeast-2.amazonaws.com/queuing/<이름>
#
# ■ image_tag_mutability = "MUTABLE"
#   같은 태그에 덮어쓸 수 있다. IMMUTABLE 로 두면 안전하지만, 지금처럼 태그를
#   손으로 올리는 흐름에서 실수로 같은 번호를 쓰면 빌드가 실패한다. 팀이
#   익숙해지면 IMMUTABLE 로 바꾸는 편이 낫다.
#
# ■ force_delete = true
#   저장소에 이미지가 남아 있어도 terraform destroy 로 지울 수 있다.
#   실습 환경이라 켜뒀다.
# ──────────────────────────────────────────────

locals {
  # ⚠️ 이 값들은 태그로 나간다. AWS 태그 값은 문자 집합이 제한된다.
  #   허용: 글자, 숫자, 공백, 그리고 _ . : / = + - @
  #   금지: 괄호 ( ), em 대시 —, 물음표, 퍼센트 등
  # 처음에 "A 찬규 — 예매 API (기존 ...)" 로 썼다가 괄호와 em 대시가 걸렸다.
  #
  # ⚠️ terraform validate 는 이걸 못 잡는다. 스키마가 아니라 AWS API 가
  #    거부하는 것이라 apply 도중에 실패한다. 한글 자체는 허용된다(글자).
  ecr_repos = {
    "api-server"  = "A part chan booking API. was mover14/redis-api-backend"
    "worker"      = "B part geonah resale worker. was dororonge/queuing-worker"
    "realtime-ws" = "C part choi websocket. was chlwldp/realtime-ws"
    "counter"     = "D part yeji counter. was ttomang/backend-counter"
  }
}

resource "aws_ecr_repository" "part" {
  for_each = local.ecr_repos

  name                 = "${var.project}/${each.key}"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${var.project}-ecr-${each.key}"
    Desc = each.value
  }
}

# 오래된 이미지 자동 정리 — 최근 10개만 남긴다.
# 없으면 태그를 올릴 때마다 계속 쌓여서 저장 요금($0.10/GB/월)이 늘어난다.
resource "aws_ecr_lifecycle_policy" "part" {
  for_each   = aws_ecr_repository.part
  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep only the 10 most recent images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}
