# ──────────────────────────────────────────────
# B파트 담당자(건아)에게 Lambda 생성 권한 보완 (2026-09-16, 건아님 요청)
#
# ■ 왜 필요한가
#   건아님 계정은 Queuing_dev+develop 그룹의 PowerUserAccess 로 lambda:* 는 되지만,
#   PowerUserAccess 는 IAM 작업을 막는다. Lambda 를 "새로 만들 때"는 실행 역할을 함수에
#   붙여야 해서 iam:PassRole 이 필요하고, 그 한 가지가 없어 create-function 이 막혔다.
#     AccessDenied: User geonah is not authorized to perform: iam:PassRole
#       on resource: role/queuing-b-workflow-lambda-role
#   (코드만 바꾸는 update-function-code 는 역할을 다시 붙이지 않아 원래부터 됐다)
#
# ■ 범위를 최소로 좁힌다
#   - 역할 하나(queuing-b-workflow-lambda-role)에 대해서만
#   - Lambda 서비스에 넘길 때만 (iam:PassedToService 조건)
#   다른 역할을 EC2 등에 붙이는 것은 여전히 막힌다.
#
# ■ 사용자는 terraform 이 만들지 않는다
#   create_team_iam_users = false 라서 팀원 IAM 사용자는 이 state 밖에 있다.
#   여기서는 이름으로 지목해 인라인 정책만 붙인다. 사용자가 없으면 apply 가 실패한다.
#
# ⚠️ terraform 이 관리하는 함수와 이름이 겹치면 안 된다
#   이미 terraform 이 만드는 함수: queuing-b-get-next-user · generate-signed-link ·
#   send-email-via-ses · update-allocation-status · push-to-dlq · trigger-resale-workflow ·
#   verify-link · verify-link-complete · verify-link-expire
#   건아님이 손으로 만드는 함수는 다른 이름을 쓰는 것이 안전하다.
#
# ■ 끄려면  terraform.tfvars 에 b_lambda_deployer_user = ""
# ──────────────────────────────────────────────

variable "b_lambda_deployer_user" {
  description = "B파트 Lambda 를 직접 만들 수 있게 iam:PassRole 을 줄 IAM 사용자 이름. 비우면 권한을 주지 않는다."
  type        = string
  default     = "geonah"
}

resource "aws_iam_user_policy" "b_lambda_deployer" {
  count = var.b_resale_workflow && var.b_lambda_deployer_user != "" ? 1 : 0

  name = "${var.project}-b-lambda-passrole"
  user = var.b_lambda_deployer_user

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "PassWorkflowLambdaRole"
      Effect   = "Allow"
      Action   = "iam:PassRole"
      Resource = aws_iam_role.b_lambda[0].arn
      Condition = {
        StringEquals = {
          "iam:PassedToService" = "lambda.amazonaws.com"
        }
      }
    }]
  })
}
