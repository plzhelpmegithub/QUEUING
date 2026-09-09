# ──────────────────────────────────────────────
# SQS — B파트(건아) 재판매 워커 큐
#
# ■ 출처: 건아(B) 안. 큐 · DLQ · DynamoDB 구성을 그대로 가져왔다.
#
# ■ 바꾼 것 하나
# 건아 안의 provider 는 LocalStack 을 가리키고 있었다.
#   endpoints { sqs = "http://127.0.0.1:4566" }, access_key = "test"
# 온프레미스에서 가짜 AWS 를 쓰기 위한 설정이라 실제 AWS 에서는 빼야 한다.
# 리소스 정의만 가져오고 provider 는 main.tf 의 것을 쓴다.
#
# ■ 온프레미스와 달라지는 점
#   LocalStack 은 메모리에만 저장해서 파드가 재시작되면 큐가 사라졌다.
#   (그 탓에 KEDA 가 NonExistentQueue 로 실패해 ScaledObject 가 Degraded 가 됐고,
#    shared-infra/localstack.yaml 에 부팅 시 큐를 자동 생성하는 훅을 넣어야 했다)
#   SQS 는 관리형이라 그런 일이 없다.
#
# ■ KEDA 설정에서 바꿔야 할 것
#   queueURL     LocalStack 주소 → aws_sqs_queue.resale.url
#   awsEndpoint  제거 (실제 AWS 이므로 불필요)
#   인증          TriggerAuthentication + Secret 대신 IRSA (irsa.tf 참고)
# ──────────────────────────────────────────────

# 처리에 3번 실패한 메시지가 이리로 옮겨진다. 무한 재시도를 막고,
# 실패한 메시지를 나중에 들여다볼 수 있게 남긴다.
resource "aws_sqs_queue" "resale_dlq" {
  name                      = "${var.project}-resale-dlq"
  message_retention_seconds = 1209600 # 14일 (최대값)

  tags = { Name = "${var.project}-resale-dlq", Part = "b" }
}

resource "aws_sqs_queue" "resale" {
  name = "${var.project}-resale-queue"

  # 워커가 메시지를 가져간 뒤 이 시간 안에 삭제하지 않으면 큐로 돌아온다.
  # 워커의 최대 처리 시간보다 넉넉해야 같은 메시지가 중복 처리되지 않는다.
  visibility_timeout_seconds = 60

  # 롱 폴링. 0이면 빈 큐를 계속 조회해 요청 수와 비용이 늘어난다.
  receive_wait_time_seconds = 20

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.resale_dlq.arn
    maxReceiveCount     = 3
  })

  tags = { Name = "${var.project}-resale-queue", Part = "b" }
}

# 배정 상태 저장용. 건아 안에 있던 것을 그대로 가져왔다.
resource "aws_dynamodb_table" "allocation_state" {
  name         = "${var.project}-allocation-state"
  billing_mode = "PAY_PER_REQUEST" # 사용한 만큼만 과금. 트래픽이 불규칙한 티켓팅에 맞다
  hash_key     = "allocation_id"

  attribute {
    name = "allocation_id"
    type = "S"
  }

  tags = { Name = "${var.project}-allocation-state", Part = "b" }
}

# B파트 애플리케이션이 큐를 읽고 쓰기 위한 역할.
# KEDA 는 큐 길이만 보면 되지만(irsa.tf), 워커는 실제로 메시지를 소비해야 한다.
data "aws_iam_policy_document" "worker_b_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.eks.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:sub"
      # B파트 차트의 ServiceAccount 이름에 맞춰야 한다.
      # 지금 차트는 default SA 를 쓰므로, 전용 SA 를 만들거나 이 값을 맞춘다.
      values = ["system:serviceaccount:queuing-b:email-worker"]
    }
  }
}

resource "aws_iam_role" "worker_b" {
  name               = "${var.project}-worker-b-role"
  assume_role_policy = data.aws_iam_policy_document.worker_b_assume.json
}

resource "aws_iam_role_policy" "worker_b" {
  name = "${var.project}-worker-b-sqs"
  role = aws_iam_role.worker_b.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:SendMessage",
          "sqs:GetQueueAttributes",
          "sqs:GetQueueUrl",
        ]
        Resource = [aws_sqs_queue.resale.arn, aws_sqs_queue.resale_dlq.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query"]
        Resource = [aws_dynamodb_table.allocation_state.arn]
      },
    ]
  })
}
