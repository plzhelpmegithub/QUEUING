# ──────────────────────────────────────────────
# C파트 (최지예) — 실시간 WebSocket 서버 전용 리소스
#
# 큰 틀에 이미 포함된 공용 리소스 (여기서 안 만듦):
#   - VPC, EKS, ALB 본체, ElastiCache Redis, IAM
#   - ECR (ecr.tf에 ws_server 저장소 이미 있음)
#   - ALB 타겟그룹 + 라우팅 규칙 (alb.tf에 이미 있음)
#
# 이 파일에는 C파트만의 추가 리소스를 넣음.
# 다른 파트(A/B/D)도 이런 식으로 자기 파일을 추가하면 됨.
# ──────────────────────────────────────────────

# C파트 전용 CloudWatch 로그 그룹
resource "aws_cloudwatch_log_group" "realtime_ws" {
  name              = "/eks/${var.project}/realtime-ws"
  retention_in_days = 14

  tags = { Name = "${var.project}-logs-realtime-ws", Part = "c" }
}
