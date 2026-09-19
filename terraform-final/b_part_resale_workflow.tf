# ──────────────────────────────────────────────
# B파트(건아) 취소표 순차 배정 — Step Functions + Lambda 5개 (이 파일 하나에 전부)
#
# ■ 코드 출처 (읽기만 한다. 건아님 저장소는 고치지 않는다)
#   origin/geonah/aws-migration
#     lambda/b-part/*.py, requirements.txt
#     step-functions/b-part/resale-workflow.asl.json
#   ASL 주석: "FunctionName 값들은 팀장이 terraform 으로 실제 Lambda 를 만들 때 실제
#   이름/ARN 으로 바꿔야 함" → 아래 aws_sfn_state_machine 에서 바꿔 끼운다.
#
# ■ 흐름
#   A파트가 좌석 취소 확정 → SQS queuing-cancellation-events
#     → Lambda TriggerResaleWorkflow (SQS 연결, 2026-09-11 18:00 건아님 추가)
#     → Step Functions queuing-b-resale-workflow (Lambda 5개를 순서대로)
#   큐는 건아님 terraform(state)이 만든 것이라 매일 지워지지 않는다. 여기서는 이름으로 찾아 읽기만 한다.
#
# ■ 패키지는 queuing-aws.ps1 up 이 apply 전에 만든다
#   git archive 로 위 폴더를 꺼내 pip 로 리눅스용(python3.12) 의존성을 받고 zip 으로 묶어
#   terraform-final/.terraform/queuing-build/b-part/ 에 둔다 (.terraform/ 은 깃에 안 올라간다).
#   그래서 terraform apply 를 손으로만 돌리면 패키지가 없거나 옛날 코드일 수 있다.
#
# ■ 비밀값은 terraform 에 넣지 않는다
#   - D-Cloud DB 비밀번호: 이 PC 의 비밀값 저장소에만 있다 (tfvars·state 에는 없다).
#     스크립트가 apply 할 때만 TF_VAR_b_lambda_db_password 로 넘긴다.
#   - 링크 서명용 JWT 키: 아침 apply 때 Secrets Manager 가 새로 만든다 (매일 바뀐다).
#     스크립트가 같은 값을 queuing-b 의 Secret b-part-workflow(JWT_SECRET_KEY)로 넣어
#     /verify-link(B파트 앱)가 같은 키로 검증하게 한다. 링크 유효시간은 10분이라 매일 바뀌어도 된다.
#   - Lambda environment 는 ignore_changes 다. 낮에 terraform apply 를 손으로 돌려도
#     (TF_VAR 가 없어도) 비밀번호가 빈 값으로 덮이지 않는다. 대신 환경변수를 바꾸면
#     다음날 아침 새로 만들 때 반영된다.
#
# ■ Lambda 를 VPC 밖에 두는 이유
#   - D-Cloud 13306 은 NAT IP 가 아닌 AWS IP 에서도 열려 있다 (2026-09-11 Jenkins EC2 3.35.29.193 에서 확인).
#   - VPC 에 넣으면 매일 destroy 때 Lambda 네트워크 인터페이스 정리를 기다리느라 서브넷 삭제가 늦어진다.
#
# ■ 건아님이 따로 해야 하는 것 (이 파일이 하지 않는다)
#   - lambda/b-part/schema_fixes.sql 을 D-Cloud queuing_db 에 적용
#   - /verify-link(B파트 앱)가 SendTaskSuccess 를 부를 때 쓸 값은
#     queuing-b 의 ConfigMap/Secret b-part-workflow 에서 읽는다 (queuing-aws.ps1 이 매일 만든다)
#   - (찬규님) 좌석 취소 확정 시 queuing-cancellation-events 로 발행 — 2026-09-11 기준 A파트 코드에 아직 없다
#
# ■ 끄기  terraform.tfvars 에 b_resale_workflow = false
# ──────────────────────────────────────────────

variable "b_resale_workflow" {
  description = "B파트 취소표 순차 배정 Step Functions + Lambda 를 만든다"
  type        = bool
  default     = true
}

variable "b_lambda_db_password" {
  description = "B파트 Lambda 의 DB 비밀번호 수동 지정용. 비우면 Secrets Manager 의 queuing-persistent/app-secrets 에서 읽는다(권장). 채우면 그쪽이 우선한다."
  type        = string
  default     = ""
  sensitive   = true
}

variable "b_lambda_use_rds" {
  description = <<-DESC
    B파트 Lambda 가 RDS 를 볼지 D-Cloud 를 볼지 정한다.

    ⚠️ 찬규님 api 와 반드시 같은 시점에 바꿔야 한다. api 는 Helm values 의
       DB_HOST·DB_PORT 로 전환하고, Lambda 는 이 값으로 전환한다. 한쪽만
       넘어가면 취소표 재판매가 서로 다른 DB 를 읽어 깨진다.

    전환 절차:
      1. 찬규님이 api Helm values 를 RDS 로 바꾸고 helm upgrade
      2. tfvars 에 b_lambda_use_rds = true 를 넣고 terraform apply
      3. CronJob rds-to-dcloud-backup 의 suspend 를 푼다
         (그때부터 RDS 가 원본, D-Cloud 가 백업이라 방향이 맞다)

    2026-09-18 전환 완료. 기본값을 실제 상태인 true 로 둔다. terraform.tfvars 는
    .gitignore 대상이라, 기본값이 false 면 다른 사람이 clone 해서 apply 할 때
    Lambda 가 D-Cloud 로 되돌아간다.
  DESC
  type        = bool
  default     = true
}

variable "b_link_base_url" {
  description = "취소표 메일 속 링크 주소."
  type        = string

  # 2026-09-18 19:31 찬규님이 콘솔에서 해시 라우팅 주소(/#/verify-link)로 바꾼 값이다.
  # 프론트엔드가 해시 라우터라 /#/ 없이는 화면이 열리지 않는다.
  default = "https://www.queuing.kr/#/verify-link"
}

variable "b_hold_duration_seconds" {
  description = "링크 유효 시간(초). 이 시간이 지나면 다음 대기자에게 넘어간다."
  type        = number
  default     = 600
}

variable "b_trigger_enabled" {
  description = "SQS queuing-cancellation-events → 트리거 Lambda 연결을 켠다. 끄면 큐에 메시지가 쌓이기만 한다."
  type        = bool
  default     = true
}

variable "b_part_build_dir" {
  description = "Lambda zip 과 ASL 이 있는 폴더. 비워두면 terraform-final/.terraform/queuing-build/b-part"
  type        = string
  default     = ""
}

locals {
  b_wf        = var.b_resale_workflow ? 1 : 0
  b_build_dir = var.b_part_build_dir != "" ? var.b_part_build_dir : "${path.module}/.terraform/queuing-build/b-part"
  b_zip       = "${local.b_build_dir}/lambda.zip"
  b_asl       = "${local.b_build_dir}/resale-workflow.asl.json"

  # 논리 이름(ASL 의 FunctionName) → 실제 함수
  b_functions = {
    GetNextUser            = { name = "${var.project}-b-get-next-user", handler = "get_next_user.handler" }
    GenerateSignedLink     = { name = "${var.project}-b-generate-signed-link", handler = "generate_signed_link.handler" }
    SendEmailViaSES        = { name = "${var.project}-b-send-email-via-ses", handler = "send_email_via_ses.lambda_handler" } # 이 파일만 lambda_handler
    UpdateAllocationStatus = { name = "${var.project}-b-update-allocation-status", handler = "update_allocation_status.handler" }
    PushToDLQ              = { name = "${var.project}-b-push-to-dlq", handler = "push_to_dlq.handler" }
  }

  # ── DB 전환 (2026-09-18) ──
  #
  # 찬규님 api 와 B파트 Lambda 는 반드시 같은 DB 를 봐야 한다. 한쪽만 옮기면
  # 취소표 재판매가 서로 다른 데이터를 읽어 깨진다. 그래서 전환은 두 곳을
  # 같은 시점에 바꾼다 — api 는 Helm values, Lambda 는 이 변수다.
  #
  # use_rds 를 그대로 쓰지 않는 이유: use_rds 는 이미 true 다(RDS 를 만들어 두었다).
  # 하지만 api 가 아직 D-Cloud 를 보고 있어서 Lambda 만 먼저 넘어가면 안 된다.
  b_db_on_rds = var.b_lambda_use_rds
  # b_lambda_use_proxy 를 켜면 RDS 대신 Proxy 로 붙는다 (rds_proxy.tf).
  # 포트·계정·비밀번호는 같아서 주소만 바뀐다.
  b_db_host = local.b_db_on_rds ? (
    var.b_lambda_use_proxy && local.rds_proxy_on
    ? one(aws_db_proxy.mariadb[*].endpoint)
    : one(aws_db_instance.mariadb[*].address)
  ) : var.dcloud_host
  b_db_port = local.b_db_on_rds ? 3306 : var.dcloud_db_port

  # 비밀번호는 Secrets Manager 에서 읽는다. 예전에는 queuing-aws.ps1 이
  # TF_VAR_b_lambda_db_password 로만 넘겨서, 그 값 없이 apply 하면 Lambda 환경변수가
  # 빈 비밀번호로 덮였다. 그걸 막으려고 ignore_changes 를 걸어두었던 것인데,
  # 이제 값을 항상 얻을 수 있으므로 ignore_changes 가 필요 없다.
  # 환경변수를 주면 그쪽이 우선한다.
  b_db_password = var.b_lambda_db_password != "" ? var.b_lambda_db_password : try(
    local.app_secrets[local.b_db_on_rds ? "RDS_PASSWORD" : "DB_PASSWORD"], ""
  )

  b_db_env = {
    MYSQL_HOST     = local.b_db_host
    MYSQL_PORT     = tostring(local.b_db_port)
    MYSQL_USER     = var.dcloud_db_user
    MYSQL_PASSWORD = local.b_db_password
    MYSQL_DB       = "queuing_db"
  }

  # 함수마다 필요한 값만 준다 (JWT 키는 서명하는 함수에만)
  b_extra_env = {
    GetNextUser            = {}
    GenerateSignedLink     = { JWT_SECRET = one(aws_secretsmanager_secret_version.b_link_jwt[*].secret_string), HOLD_DURATION_SECONDS = tostring(var.b_hold_duration_seconds) }
    SendEmailViaSES        = { SES_SENDER_EMAIL = "noreply@queuing.kr", LINK_BASE_URL = var.b_link_base_url }
    UpdateAllocationStatus = {}
    PushToDLQ              = { DLQ_QUEUE_URL = aws_sqs_queue.resale_dlq.url }
  }

  b_asl_raw = fileexists(local.b_asl) ? file(local.b_asl) : ""
  b_asl_definition = local.b_wf == 0 ? "" : replace(replace(replace(replace(replace(local.b_asl_raw,
    "\"FunctionName\": \"GetNextUser\"", "\"FunctionName\": \"${aws_lambda_function.b["GetNextUser"].arn}\""),
    "\"FunctionName\": \"GenerateSignedLink\"", "\"FunctionName\": \"${aws_lambda_function.b["GenerateSignedLink"].arn}\""),
    "\"FunctionName\": \"SendEmailViaSES\"", "\"FunctionName\": \"${aws_lambda_function.b["SendEmailViaSES"].arn}\""),
    "\"FunctionName\": \"UpdateAllocationStatus\"", "\"FunctionName\": \"${aws_lambda_function.b["UpdateAllocationStatus"].arn}\""),
  "\"FunctionName\": \"PushToDLQ\"", "\"FunctionName\": \"${aws_lambda_function.b["PushToDLQ"].arn}\"")
}

# ── 링크 서명용 JWT 키 (매일 아침 새로) ──

data "aws_secretsmanager_random_password" "b_link_jwt" {
  count               = local.b_wf
  password_length     = 64
  exclude_punctuation = true
}

resource "aws_secretsmanager_secret" "b_link_jwt" {
  count                   = local.b_wf
  name                    = "${var.project}/b-link-jwt"
  description             = "B파트 취소표 링크 서명 키. Lambda GenerateSignedLink 와 queuing-b Secret b-part-workflow 가 같은 값을 쓴다."
  recovery_window_in_days = 0 # 매일 destroy 후 같은 이름으로 다시 만든다
}

resource "aws_secretsmanager_secret_version" "b_link_jwt" {
  count         = local.b_wf
  secret_id     = aws_secretsmanager_secret.b_link_jwt[0].id
  secret_string = data.aws_secretsmanager_random_password.b_link_jwt[0].random_password

  # 데이터 소스는 plan 할 때마다 새 값을 만든다. 처음 만든 값을 그날 내내 유지한다.
  lifecycle { ignore_changes = [secret_string] }
}

# ── Lambda ──

resource "aws_iam_role" "b_lambda" {
  count = local.b_wf
  name  = "${var.project}-b-workflow-lambda-role"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "b_lambda_logs" {
  count      = local.b_wf
  role       = aws_iam_role.b_lambda[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "b_lambda" {
  count = local.b_wf
  name  = "${var.project}-b-workflow-lambda"
  role  = aws_iam_role.b_lambda[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SendLinkEmail"
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = "arn:aws:ses:${var.region}:${data.aws_caller_identity.current.account_id}:identity/queuing.kr"
      },
      {
        Sid      = "PushFailedToDLQ"
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.resale_dlq.arn
      },
    ]
  })
}

# ── Lambda 를 VPC 안에 넣는다 (2026-09-18) ──
#
# D-Cloud 는 공인 IP 라 VPC 밖 Lambda 도 인터넷으로 붙을 수 있었다. RDS 는
# publicly_accessible = false 인 VPC 안 프라이빗 DB 라, b_lambda_use_rds = true 로
# 주소만 바꾸면 물리적으로 닿지 않는다(건아님이 VpcConfig: null 로 찾아냈다).
#
# RDS 보안그룹(sg-rds)을 Lambda 에 그대로 붙이면 안 된다. 그 그룹은 "EKS 노드에서
# 온 3306" 만 받는 규칙이라 자기 자신에게서 오는 연결은 허용하지 않는다. 그래서
# Lambda 전용 그룹을 따로 만들고 RDS 쪽에서 이 그룹을 허용한다(security_groups.tf).
#
# 프라이빗 서브넷은 0.0.0.0/0 이 NAT 로 나가므로 VPC 안에 들어가도 SES·Step Functions·
# SQS 호출은 그대로 된다.
resource "aws_security_group" "b_lambda" {
  count       = local.b_wf
  name_prefix = "${var.project}-b-lambda-"
  vpc_id      = aws_vpc.main.id
  description = "B-part Lambda - outbound only (RDS, AWS APIs via NAT)"

  egress {
    description = "RDS 3306 and AWS APIs through NAT"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-sg-b-lambda" }

  lifecycle { create_before_destroy = true }
}

# VPC 에 들어가는 Lambda 는 ENI 를 스스로 만들어야 한다. 이 권한이 없으면
# vpc_config 를 붙이는 apply 가 InvalidParameterValueException 으로 실패한다.
resource "aws_iam_role_policy_attachment" "b_lambda_vpc" {
  count      = local.b_wf
  role       = aws_iam_role.b_lambda[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# Lambda 가 처음 호출될 때 스스로 만들면 terraform 이 모르는 채로 남아 매일 쌓인다. 먼저 만든다.
resource "aws_cloudwatch_log_group" "b_lambda" {
  for_each          = var.b_resale_workflow ? local.b_functions : {}
  name              = "/aws/lambda/${each.value.name}"
  retention_in_days = 7
}

resource "aws_lambda_function" "b" {
  for_each      = var.b_resale_workflow ? local.b_functions : {}
  function_name = each.value.name
  role          = aws_iam_role.b_lambda[0].arn
  runtime       = "python3.12"
  architectures = ["x86_64"]
  handler       = each.value.handler
  timeout       = 30
  memory_size   = 256

  filename = local.b_zip
  # 밤에 destroy 할 때는 zip 이 없어도 되게 한다. apply 때 없으면 생성이 실패한다.
  source_code_hash = fileexists(local.b_zip) ? filebase64sha256(local.b_zip) : null

  environment {
    variables = merge(local.b_db_env, local.b_extra_env[each.key])
  }

  # ignore_changes = [environment] 를 뗐다 (2026-09-18).
  #
  # 걸어둔 이유는 TF_VAR 없이 apply 하면 비밀번호가 빈 값으로 덮이는 것을 막기
  # 위해서였다. 이제 Secrets Manager 에서 항상 읽으므로 빈 값이 될 일이 없다.
  # 떼지 않으면 b_lambda_use_rds 를 바꿔도 기존 함수에 반영되지 않는다.

  # RDS 를 볼 때만 VPC 에 넣는다. D-Cloud(공인 IP)로 되돌리면 VPC 밖으로 나온다.
  dynamic "vpc_config" {
    for_each = local.b_db_on_rds ? [1] : []
    content {
      subnet_ids         = aws_subnet.private[*].id
      security_group_ids = [aws_security_group.b_lambda[0].id]
    }
  }

  depends_on = [aws_cloudwatch_log_group.b_lambda, aws_iam_role_policy_attachment.b_lambda_logs, aws_iam_role_policy_attachment.b_lambda_vpc]
}

# ── Step Functions ──

resource "aws_iam_role" "b_sfn" {
  count = local.b_wf
  name  = "${var.project}-b-workflow-sfn-role"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "states.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "b_sfn" {
  count = local.b_wf
  name  = "${var.project}-b-workflow-invoke-lambda"
  role  = aws_iam_role.b_sfn[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["lambda:InvokeFunction"]
      Resource = flatten([for f in aws_lambda_function.b : [f.arn, "${f.arn}:*"]])
    }]
  })
}

resource "aws_sfn_state_machine" "b_resale" {
  count      = local.b_wf
  name       = "${var.project}-b-resale-workflow"
  type       = "STANDARD" # waitForTaskToken 은 STANDARD 에서만 된다
  role_arn   = aws_iam_role.b_sfn[0].arn
  definition = local.b_asl_definition

  lifecycle {
    # ASL 의 Task 6개(GetNextUser, GenerateSignedLink, SendEmailViaSES, MarkCompleted, MarkExpired, PushToDLQ)가
    # 전부 실제 Lambda ARN 으로 바뀌었는지 확인한다. 건아님이 ASL 구조를 바꾸면 여기서 멈춘다.
    # ASL 파일이 없으면(밤 destroy 때 등) 검사하지 않는다. apply 때 없으면 빈 정의라 생성 자체가 실패한다.
    precondition {
      condition     = local.b_asl_raw == "" || length(regexall("\"FunctionName\": \"arn:aws:lambda:", local.b_asl_definition)) == 6
      error_message = "ASL 의 FunctionName 6개가 모두 Lambda ARN 으로 바뀌지 않았다. queuing-aws.ps1 up 으로 패키지를 다시 만들고, 건아님 ASL 이 바뀌었는지 확인한다."
    }
  }
}

# ── 트리거: SQS queuing-cancellation-events → StartExecution ──

data "aws_sqs_queue" "b_cancellation_events" {
  count = local.b_wf
  name  = "${var.project}-cancellation-events"
}

resource "aws_iam_role" "b_trigger" {
  count = local.b_wf
  name  = "${var.project}-b-trigger-lambda-role"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "b_trigger_logs" {
  count      = local.b_wf
  role       = aws_iam_role.b_trigger[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# 2026-09-19 건아 코드부터 trigger 도 DB 를 본다 (같은 공연에 LINK_SENT 가 살아 있으면 건너뛴다).
# 그래서 다른 B파트 Lambda 처럼 VPC 에 들어가야 하고, ENI 를 만들 권한이 필요하다.
resource "aws_iam_role_policy_attachment" "b_trigger_vpc" {
  count      = local.b_wf
  role       = aws_iam_role.b_trigger[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "b_trigger" {
  count = local.b_wf
  name  = "${var.project}-b-trigger"
  role  = aws_iam_role.b_trigger[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "StartResaleWorkflow"
        Effect   = "Allow"
        Action   = ["states:StartExecution"]
        Resource = aws_sfn_state_machine.b_resale[0].arn
      },
      {
        # Lambda SQS 연결이 큐를 읽고 처리한 메시지를 지우는 데 필요한 권한 (이 큐 하나만)
        Sid      = "ConsumeCancellationEvents"
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:ChangeMessageVisibility"]
        Resource = data.aws_sqs_queue.b_cancellation_events[0].arn
      },
    ]
  })
}

resource "aws_cloudwatch_log_group" "b_trigger" {
  count             = local.b_wf
  name              = "/aws/lambda/${var.project}-b-trigger-resale-workflow"
  retention_in_days = 7
}

# 상태 머신 ARN 을 환경변수로 받으므로 위의 Lambda 5개(aws_lambda_function.b)와 따로 둔다.
# 한 묶음에 넣으면 "상태 머신 → Lambda → 상태 머신" 순환이 된다.
resource "aws_lambda_function" "b_trigger" {
  count         = local.b_wf
  function_name = "${var.project}-b-trigger-resale-workflow"
  role          = aws_iam_role.b_trigger[0].arn
  runtime       = "python3.12"
  architectures = ["x86_64"]
  handler       = "trigger_resale_workflow.lambda_handler"
  # 큐 가시성 타임아웃(30초)보다 길면 SQS 연결 생성이 거부된다. StartExecution 한 번이라 10초면 된다.
  timeout     = 10
  memory_size = 128

  filename         = local.b_zip
  source_code_hash = fileexists(local.b_zip) ? filebase64sha256(local.b_zip) : null

  # MYSQL_* 가 없으면 KeyError 로 배치 전체가 실패하고, 5번 재시도 뒤 DLQ 로 간다 (2026-09-19 12:26 실제로 그랬다).
  environment {
    variables = merge(local.b_db_env, { STATE_MACHINE_ARN = aws_sfn_state_machine.b_resale[0].arn })
  }

  dynamic "vpc_config" {
    for_each = local.b_db_on_rds ? [1] : []
    content {
      subnet_ids         = aws_subnet.private[*].id
      security_group_ids = [aws_security_group.b_lambda[0].id]
    }
  }

  depends_on = [aws_cloudwatch_log_group.b_trigger, aws_iam_role_policy_attachment.b_trigger_logs, aws_iam_role_policy_attachment.b_trigger_vpc]
}

resource "aws_lambda_event_source_mapping" "b_trigger" {
  count            = local.b_wf
  event_source_arn = data.aws_sqs_queue.b_cancellation_events[0].arn
  function_name    = aws_lambda_function.b_trigger[0].arn
  batch_size       = 10
  enabled          = var.b_trigger_enabled

  # 코드가 batchItemFailures 로 실패한 메시지만 돌려준다. 이게 켜져 있어야 성공한 메시지가 다시 처리되지 않는다.
  function_response_types = ["ReportBatchItemFailures"]

  # 권한이 붙기 전에 연결을 만들면 "ReceiveMessage 권한 없음" 으로 거부된다.
  depends_on = [aws_iam_role_policy.b_trigger]
}

output "b_resale_state_machine_arn" {
  description = "B파트 앱이 StartExecution 할 상태 머신"
  value       = one(aws_sfn_state_machine.b_resale[*].arn)
}

output "b_resale_dlq_url" {
  description = "PushToDLQ Lambda 가 실패 건을 넣는 큐"
  value       = var.b_resale_workflow ? aws_sqs_queue.resale_dlq.url : null
}

output "b_link_jwt_secret_id" {
  description = "링크 서명 키가 든 Secrets Manager 이름 (값은 출력하지 않는다)"
  value       = one(aws_secretsmanager_secret.b_link_jwt[*].name)
}

output "b_lambda_function_names" {
  value = merge(
    { for k, f in aws_lambda_function.b : k => f.function_name },
    { for f in aws_lambda_function.b_trigger : "TriggerResaleWorkflow" => f.function_name },
  )
}
