# ──────────────────────────────────────────────
# B파트 콜백 API — A파트가 서버 대 서버로 부르는 Lambda 3개 (ALB 타겟그룹)
#
# ■ 코드 출처 (읽기만 한다. 건아님 저장소는 고치지 않는다)
#   origin/geonah/aws-migration : lambda/b-part/callback-api/
#     verify_link/handler.py · verify_link_complete/handler.py · verify_link_expire/handler.py
#     common/ (alb.py · auth.py · db.py) — 세 함수가 공유한다. zip 마다 같이 넣어야 한다.
#   requirements.txt 는 워크플로 Lambda 와 공용이다 (PyJWT, PyMySQL. boto3 는 런타임 내장).
#
# ■ 흐름 (2026-09-14 건아님·찬규님 합의)
#   브라우저 → A파트 /verify-link
#     → A 서버가 여기로 프록시 (서버 대 서버, 헤더 X-Callback-Secret)
#         POST https://api.queuing.kr/b-callback/verify-link           토큰 검증 + 좌석 목록
#         POST https://api.queuing.kr/b-callback/verify-link/complete  좌석 확정 → SendTaskSuccess
#         POST https://api.queuing.kr/b-callback/verify-link/expire    만료      → SendTaskFailure
#     → 멈춰 있던 Step Functions(SendEmailAndWait)가 깨어나 다음 단계로 간다
#
# ■ 워크플로 Lambda(b_part_resale_workflow.tf)와 다른 점
#   - DB 환경변수 이름이 다르다. common/db.py 는 DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME 를 읽는다
#     (워크플로 쪽은 MYSQL_* 다). 이름을 틀리면 파드가 아니라 호출 때 500 이 난다.
#   - zip 이 함수마다 따로다. handler.py 가 셋 다 같은 이름이라 한 zip 에 넣을 수 없다.
#     queuing-aws.ps1 의 Build-BPartWorkflow 가 callback-<함수>.zip 으로 만든다.
#   - IAM 역할은 워크플로 Lambda 와 같은 역할(b_lambda)을 쓰고, 여기서 SendTaskSuccess/Failure 만 더한다.
#
# ■ 인터넷에 열리는 경로다 — 두 겹으로 막는다
#   1) ALB 규칙의 source_ip 조건: NAT 게이트웨이 주소에서 온 요청만 통과 (A 파드는 NAT 로 나간다)
#   2) Lambda 안의 X-Callback-Secret 검증 (common/auth.py)
#   두 번째 값은 terraform 에 넣지 않는다. Secrets Manager 의
#   queuing-persistent/b-callback-secret 을 스크립트가 TF_VAR_b_callback_secret 로 넘긴다.
#   A파트 K8s Secret b-callback-credentials 와 반드시 같은 값이어야 한다.
#
# ■ 끄려면  terraform.tfvars 에 b_callback_api = false
# ──────────────────────────────────────────────

variable "b_callback_api" {
  description = "true 면 B파트 콜백 API Lambda 3개와 ALB /b-callback 경로를 만든다. b_resale_workflow 가 false 면 어차피 만들지 않는다."
  type        = bool
  default     = true
}

variable "b_callback_secret" {
  description = "A↔B 공유 비밀값 수동 지정용. 비우면 Secrets Manager 의 queuing-persistent/b-callback-secret 을 읽는다(권장). 채우면 그쪽이 우선한다."
  type        = string
  default     = ""
  sensitive   = true
}

# queuing-persistent/ 는 terraform 밖에서 관리되는 영구 시크릿이라 destroy 해도 남는다.
# JSON 이 아니라 평문 문자열로 저장되어 있어 jsondecode 하지 않는다.
data "aws_secretsmanager_secret_version" "b_callback" {
  secret_id = "queuing-persistent/b-callback-secret"
}

variable "b_callback_allowed_cidrs" {
  description = "콜백 경로를 부를 수 있는 출처. 비워두면 NAT 게이트웨이 주소만 허용한다(A 파드의 나가는 주소)."
  type        = list(string)
  default     = []
}

locals {
  b_cb = var.b_resale_workflow && var.b_callback_api ? 1 : 0

  # 키 = zip 이름(callback-<키>.zip). 우선순위는 긴 경로를 먼저 본다.
  # verify_link_complete 만 handler 가 다르다 (2026-09-18). 건아님이 이 함수만
  # verify_link_complete.py 로 다시 만들어 직접 올렸다. handler.handler 로 두면
  # apply 때 없는 파일을 가리켜 ImportModuleError 가 난다.
  b_callback_functions = {
    verify_link_complete = { suffix = "verify-link-complete", path = "/b-callback/verify-link/complete", priority = 40, handler = "verify_link_complete.handler" }
    verify_link_expire   = { suffix = "verify-link-expire", path = "/b-callback/verify-link/expire", priority = 41, handler = "handler.handler" }
    verify_link          = { suffix = "verify-link", path = "/b-callback/verify-link", priority = 42, handler = "handler.handler" }
  }

  # ⚠️ 워크플로 Lambda 와 이름이 다르다 (common/db.py 기준)
  #    DB 접속 정보는 워크플로 Lambda 와 같은 값을 쓴다(b_part_resale_workflow.tf).
  #    두 쪽이 갈라지면 같은 전환에서 한쪽만 옮겨가는 사고가 난다.
  b_callback_env = {
    DB_HOST           = local.b_db_host
    DB_PORT           = tostring(local.b_db_port)
    DB_USER           = var.dcloud_db_user
    DB_PASSWORD       = local.b_db_password
    DB_NAME           = "queuing_db"
    JWT_SECRET        = one(aws_secretsmanager_secret_version.b_link_jwt[*].secret_string)
    B_CALLBACK_SECRET = local.b_callback_token
  }

  # A↔B 공유 비밀값도 Secrets Manager 에서 읽는다. 이것도 비어 있으면
  # ignore_changes 를 뗀 순간 빈 값으로 덮인다. 평문 문자열로 저장되어 있다.
  b_callback_token = var.b_callback_secret != "" ? var.b_callback_secret : data.aws_secretsmanager_secret_version.b_callback.secret_string

  b_callback_source_cidrs = length(var.b_callback_allowed_cidrs) > 0 ? var.b_callback_allowed_cidrs : ["${aws_nat_gateway.main.public_ip}/32"]
}

# ── Step Functions 를 깨울 권한 (워크플로 Lambda 역할에 추가) ──
#
# ⚠️ Resource 를 상태머신 ARN 으로 좁힐 수 없다. SendTaskSuccess/SendTaskFailure 는
#    작업 토큰으로 동작해서 리소스 단위 권한을 지원하지 않는다(AWS 문서). "*" 가 맞다.
resource "aws_iam_role_policy" "b_callback_sfn" {
  count = local.b_cb
  name  = "${var.project}-b-callback-sfn"
  role  = aws_iam_role.b_lambda[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "ResumeWaitingWorkflow"
      Effect   = "Allow"
      Action   = ["states:SendTaskSuccess", "states:SendTaskFailure", "states:SendTaskHeartbeat"]
      Resource = "*"
    }]
  })
}

# ── Lambda ──
resource "aws_cloudwatch_log_group" "b_callback" {
  for_each          = local.b_cb == 1 ? local.b_callback_functions : {}
  name              = "/aws/lambda/${var.project}-b-${each.value.suffix}"
  retention_in_days = 7
}

resource "aws_lambda_function" "b_callback" {
  for_each = local.b_cb == 1 ? local.b_callback_functions : {}

  function_name = "${var.project}-b-${each.value.suffix}"
  role          = aws_iam_role.b_lambda[0].arn
  runtime       = "python3.12"
  architectures = ["x86_64"]
  handler       = each.value.handler
  timeout       = 30
  memory_size   = 256

  # zip 은 queuing-aws.ps1 의 Build-BPartWorkflow 가 만든다.
  filename         = "${local.b_build_dir}/callback-${each.key}.zip"
  source_code_hash = fileexists("${local.b_build_dir}/callback-${each.key}.zip") ? filebase64sha256("${local.b_build_dir}/callback-${each.key}.zip") : null

  environment {
    variables = local.b_callback_env
  }

  # ignore_changes = [environment] 를 뗐다 (2026-09-18).
  # DB 비밀번호와 A↔B 공유 비밀값을 모두 Secrets Manager 에서 읽으므로
  # 빈 값으로 덮일 일이 없다. 사유는 b_part_resale_workflow.tf 주석 참고.

  # 워크플로 Lambda 와 같은 조건·같은 보안그룹으로 VPC 에 넣는다.
  # ALB → Lambda 타겟그룹 호출은 VPC 여부와 무관하게 그대로 된다.
  dynamic "vpc_config" {
    for_each = local.b_db_on_rds ? [1] : []
    content {
      subnet_ids         = aws_subnet.private[*].id
      security_group_ids = [aws_security_group.b_lambda[0].id]
    }
  }

  depends_on = [aws_cloudwatch_log_group.b_callback, aws_iam_role_policy_attachment.b_lambda_logs, aws_iam_role_policy_attachment.b_lambda_vpc]
}

# ── ALB 타겟그룹 (target_type = lambda) ──
resource "aws_lb_target_group" "b_callback" {
  for_each = local.b_cb == 1 ? local.b_callback_functions : {}

  name        = "${var.project}-tg-b-${replace(each.value.suffix, "verify-link", "vl")}"
  target_type = "lambda"

  # ALB 가 받은 그대로(헤더·본문)를 Lambda 에 넘긴다. common/alb.py 가 그 형식을 읽는다.
  lambda_multi_value_headers_enabled = false

  tags = { Name = "${var.project}-tg-b-${each.value.suffix}", Part = "b" }
}

resource "aws_lambda_permission" "b_callback_alb" {
  for_each = local.b_cb == 1 ? local.b_callback_functions : {}

  statement_id  = "AllowExecutionFromALB"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.b_callback[each.key].function_name
  principal     = "elasticloadbalancing.amazonaws.com"
  source_arn    = aws_lb_target_group.b_callback[each.key].arn
}

resource "aws_lb_target_group_attachment" "b_callback" {
  for_each = local.b_cb == 1 ? local.b_callback_functions : {}

  target_group_arn = aws_lb_target_group.b_callback[each.key].arn
  target_id        = aws_lambda_function.b_callback[each.key].arn

  # 권한이 먼저 있어야 등록이 된다.
  depends_on = [aws_lambda_permission.b_callback_alb]
}

# ── ALB 규칙: 경로 + 출처 IP 를 모두 만족해야 통과한다 ──
resource "aws_lb_listener_rule" "b_callback" {
  for_each = local.b_cb == 1 ? local.b_callback_functions : {}

  listener_arn = aws_lb_listener.https.arn
  priority     = each.value.priority

  condition {
    path_pattern {
      values = [each.value.path]
    }
  }

  condition {
    source_ip {
      values = local.b_callback_source_cidrs
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.b_callback[each.key].arn
  }

  tags = { Name = "${var.project}-rule-b-${each.value.suffix}", Part = "b" }
}

# ── 출력 ──
output "b_callback_base_url" {
  description = "A파트 차트의 env.bCallbackBaseUrl 에 넣을 주소. 콜백 API 를 끄면 빈 값이다."
  value       = local.b_cb == 1 ? "https://${local.api_domain}/b-callback" : ""
}

output "b_callback_allowed_from" {
  description = "콜백 경로가 허용하는 출처 (기본: NAT 게이트웨이 주소)"
  value       = local.b_cb == 1 ? local.b_callback_source_cidrs : []
}
