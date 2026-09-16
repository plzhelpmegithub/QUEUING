# ──────────────────────────────────────────────
# A파트 → B파트 취소 이벤트 발행 권한 (2026-09-16)
#
# ■ 무엇을 푸는가
#   A파트(src/services/cancellationEventPublisher.js)는 좌석 취소가 확정되면
#   SQS queuing-cancellation-events 로 메시지를 보낸다. 그 메시지를 건아님 트리거 Lambda 가
#   받아 Step Functions(재판매 워크플로)를 시작한다.
#
#   그런데 두 가지가 비어 있었다.
#     1) A 파드에 큐 주소(CANCELLATION_EVENTS_QUEUE_URL)가 없다
#        → 코드가 큐 대신 DB 테이블 cancellation_outbox 에 쌓아두기만 한다.
#     2) A 파드의 IAM 역할에 SQS 발행 권한이 없다
#        → 주소만 넣으면 이번엔 AccessDenied 가 난다.
#   여기서 2번을 풀고, 1번은 queuing-aws.ps1 이 helm 값(env.cancellationEventsQueueUrl)으로 넣는다.
#   (차트에 자리는 이미 있다. 찬규님 코드 수정은 필요 없다)
#
# ■ 권한을 붙이는 역할
#   A 파드의 ServiceAccount 가 쓰는 IRSA 역할(aws_iam_role.ses_send, ses.tf)에 더한다.
#   액세스 키를 만들지 않는 기존 방식 그대로다.
#
# ■ 큐는 terraform 이 만들지 않는다
#   queuing-cancellation-events 는 건아님 terraform 이 만든 것이라 매일 destroy 에도 남는다.
#   여기서는 이름으로 찾아(data) ARN 만 참조한다 — b_part_resale_workflow.tf 와 같은 방식이다.
#
# ■ 범위를 좁힌다
#   Resource 를 이 큐 하나로 제한한다. 계정에 다른 큐가 생겨도 A 가 건드리지 못한다.
#   ReceiveMessage·DeleteMessage 는 주지 않는다. A 는 보내기만 하고, 읽는 쪽은 건아님 Lambda 다.
# ──────────────────────────────────────────────

resource "aws_iam_role_policy" "a_cancellation_publish" {
  # 워크플로를 끄면(b_resale_workflow = false) 큐 참조 자체가 없어지므로 같이 꺼진다.
  count = local.b_wf

  name = "${var.project}-a-cancellation-publish"
  role = aws_iam_role.ses_send.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "PublishCancellationEvents"
      Effect = "Allow"
      Action = [
        "sqs:SendMessage",
        "sqs:GetQueueUrl",
        "sqs:GetQueueAttributes",
      ]
      Resource = data.aws_sqs_queue.b_cancellation_events[0].arn
    }]
  })
}

output "cancellation_events_queue_url" {
  description = "A파트 차트의 env.cancellationEventsQueueUrl 에 넣을 큐 주소. 워크플로를 끄면 빈 값이다."
  value       = local.b_wf == 1 ? data.aws_sqs_queue.b_cancellation_events[0].url : ""
}
