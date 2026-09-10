# ──────────────────────────────────────────────
# ⚠️ 기본적으로 아무것도 만들지 않는다 (create_team_iam_users = false)
#
# 2026-09-09: 지예님이 IAM 사용자를 콘솔에서 직접 만들어 팀원들에게 전달하고
# PowerUserAccess 를 부여한 상태다. 그래서 이 파일이 만들려던 것은 전부 불필요하고,
# 켜두면 오히려 해롭다.
#
#   - 사용자 이름이 이미 존재하면 apply 가 EntityAlreadyExists 로 실패한다
#   - 이름이 다르면 중복 사용자 4개가 더 생긴다
#   - 액세스 키와 콘솔 비밀번호가 tfstate 에 평문으로 기록된다
#
# 파일을 지우지 않고 남긴 이유는, 나중에 계정을 테라폼으로 관리하기로 하면
# create_team_iam_users = true 한 줄로 되돌릴 수 있게 하기 위함이다.
# 그때는 콘솔에서 만든 사용자를 먼저 지우거나 terraform import 해야 한다.
#
# ■ EKS 접근 권한은 이것과 별개다
#   PowerUserAccess 는 AWS API 권한이고, 쿠버네티스 RBAC 는 별도다.
#   팀원이 kubectl 로 붙으려면 eks_access.tf 의 Access Entry 가 필요하다.
#   그 파일은 그대로 유지한다.
# ──────────────────────────────────────────────

# ──────────────────────────────────────────────
# 팀원 IAM 계정 — 전원 콘솔/CLI 접근
#
# 지예님 계정에만 학원 크레딧($700)이 있어서, 팀원 각자 AWS 계정을 새로
# 만드는 게 아니라 이 계정 "안에" IAM User로 들어옴 (계정이 다르면 크레딧이
# 적용 안 됨 — 반드시 하나의 계정 안에서 리소스를 다 돌려야 함).
#
# 권한은 두 겹으로 나뉨:
#  ① AWS 레벨(이 파일) — ECR push/pull, EKS 정보 조회, 로그 조회 정도만 공통 허용
#  ② K8s 레벨(아래 eks_access.tf) — 각자 자기 파트 네임스페이스에서만 배포 가능
# ──────────────────────────────────────────────

resource "aws_iam_user" "team" {
  # create_team_iam_users = false 면 빈 map 이 되어 아무것도 만들지 않는다.
  for_each = var.create_team_iam_users ? { for m in var.team_members : m.username => m } : {}
  name     = each.key
  tags     = { Part = each.value.part }
}

# 콘솔 로그인용 — 최초 로그인 시 비밀번호 변경 강제.
# ⚠️ apply 후 나오는 비밀번호는 tfstate에 평문으로 남으니, tfstate를 git에
# 올리지 말고 개인 메신저 등 안전한 채널로 한 번만 전달할 것.
resource "aws_iam_user_login_profile" "team" {
  # aws_iam_user.team 이 빈 map 이면 여기도 0개가 된다 — 별도 조건이 필요 없다.
  for_each = aws_iam_user.team

  user                    = each.value.name
  password_reset_required = true
}

# CLI/kubectl용 액세스 키
resource "aws_iam_access_key" "team" {
  for_each = aws_iam_user.team
  user     = each.value.name
}

resource "aws_iam_group" "team" {
  count = var.create_team_iam_users ? 1 : 0

  name = "${var.project}-team"
}

resource "aws_iam_group_membership" "team" {
  count = var.create_team_iam_users ? 1 : 0

  name  = "${var.project}-team-membership"
  group = aws_iam_group.team[0].name
  users = [for u in aws_iam_user.team : u.name]
}

resource "aws_iam_group_policy" "team_common" {
  count = var.create_team_iam_users ? 1 : 0

  name  = "${var.project}-team-common"
  group = aws_iam_group.team[0].name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECRPushPull"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
        ]
        Resource = "*"
      },
      {
        # kubectl로 클러스터에 붙기 위한 최소 권한 — 실제 배포 가능 범위는
        # EKS Access Entry(eks_access.tf)가 네임스페이스 단위로 제한함
        Sid      = "EKSConnect"
        Effect   = "Allow"
        Action   = ["eks:DescribeCluster", "eks:ListClusters", "eks:AccessKubernetesApi"]
        Resource = "*"
      },
      {
        Sid    = "LogsRead"
        Effect = "Allow"
        Action = [
          "logs:GetLogEvents",
          "logs:DescribeLogStreams",
          "logs:DescribeLogGroups",
          "logs:FilterLogEvents",
        ]
        Resource = "*"
      },
      {
        # 크레딧이 얼마나 남았는지 각자 콘솔에서 확인 가능하게
        Sid      = "BillingView"
        Effect   = "Allow"
        Action   = ["ce:Get*", "budgets:View*"]
        Resource = "*"
      },
    ]
  })
}
