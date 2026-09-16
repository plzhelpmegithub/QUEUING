# ──────────────────────────────────────────────
# SQS — B파트(건아) 재판매 워크플로 DLQ
#
# ■ 출처: 건아(B) 안. 원래 워커 큐 · DLQ · DynamoDB 구성이었다.
#
# ■ 2026-09-15 정리
#   email-worker(EKS)가 Step Functions 워크플로로 대체되어 워커 전용 리소스를 뺐다.
#     queuing-resale-queue(워커 큐), queuing-allocation-state(DynamoDB, 데이터는 MySQL 로 이전),
#     worker_b IAM 역할, KEDA IAM 역할(irsa.tf)
#   DLQ 는 남긴다. b_part_resale_workflow.tf 의 PushToDLQ Lambda 가 실패 건을 여기로 보낸다.
# ──────────────────────────────────────────────

# 처리에 실패한 배정 건을 모아둔다. 무한 재시도를 막고, 나중에 들여다볼 수 있게 남긴다.
resource "aws_sqs_queue" "resale_dlq" {
  name                      = "${var.project}-resale-dlq"
  message_retention_seconds = 1209600 # 14일 (최대값)

  tags = { Name = "${var.project}-resale-dlq", Part = "b" }
}
