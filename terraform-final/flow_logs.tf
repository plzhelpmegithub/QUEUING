# ──────────────────────────────────────────────
# VPC Flow Logs — 네트워크 통신 기록
#
# ■ 출처: 어느 안에도 없었다. 팀 요청으로 추가한다.
#
# 지금은 "누가 어디로 통신했는지"에 대한 기록이 아예 없다. 보안 사고가 나도,
# 파드가 DB 에 못 붙어도, 실제로 패킷이 어디까지 갔는지 확인할 방법이 없다.
#
# ■ 이 프로젝트에서 실제로 쓰일 곳
#   - use_rds = false 라 파드가 NAT 를 거쳐 외부 D-Cloud MariaDB 로 나간다.
#     화이트리스트 등록이 안 됐거나 막혔을 때 REJECT 기록으로 바로 확인된다.
#     (온프레미스에서 A파트가 "Connection is closed" 로 죽었을 때, 앱 로그만으로는
#      DB 쪽 문제인지 네트워크 문제인지 구분이 안 됐다)
#   - 보안그룹을 좁혔을 때 무엇이 막혔는지 REJECT 로 확인
#   - 예상치 못한 아웃바운드(예: 이미지에 딸려온 것이 외부로 통신) 탐지
#
# ■ 목적지를 CloudWatch Logs 로 정한 이유
# S3 가 저장 단가는 싸지만(약 1/3), 조회하려면 Athena 테이블을 따로 만들어야 한다.
# CloudWatch 는 Logs Insights 로 콘솔에서 바로 질의할 수 있다. 우리 규모에서는
# 전체 비용 차이가 월 몇 달러 수준이라, 실제로 들여다볼 수 있는 쪽을 골랐다.
#
# ■ 비용
#   Vended Logs 수집 약 $0.50/GB + 보관.
#   보관 기간을 7일로 짧게 잡았다 — 장애 원인 추적은 대개 당일~며칠 안에 한다.
#   양이 예상보다 많으면 traffic_type 을 "REJECT" 로 바꾸면 급감한다(아래 참고).
#
#   ⚠️ 배포 후 3~4일 지나면 실제 사용량을 꼭 확인할 것:
#     aws logs describe-log-groups --log-group-name-prefix /aws/vpc-flow-logs \
#       --query 'logGroups[].[logGroupName,storedBytes]' --output table
#
# ■ 끄려면
#   flow_logs_enabled = false
# ──────────────────────────────────────────────

# ⚠️ destroy 후 다시 apply 하면 여기서 막힐 수 있다 (2026-09-09 실제로 겪음)
#
#   ResourceAlreadyExistsException: The specified log group already exists
#
# 테라폼이 destroy 때 이 그룹을 지우지만, VPC Flow Logs 서비스가 마지막 배치를
# 쓰면서 같은 이름으로 다시 만들어버리는 경우가 있다. CloudWatch 로그 그룹은
# 쓰는 쪽이 없으면 자동 생성되기 때문이다. 그러면 AWS 에는 있고 상태에는 없는
# 상태가 되어 다음 apply 가 실패한다.
#
# ■ 막혔을 때
#   aws logs delete-log-group --log-group-name /aws/vpc-flow-logs/${var.project}
#   terraform apply        # 나머지는 이어서 만들어진다
#
# ■ 예방 — destroy 할 때 Flow Log 를 먼저 지운다
#   terraform destroy -target=aws_flow_log.vpc
#   terraform destroy
# 그러면 로그를 쓰는 주체가 먼저 사라져서 그룹이 되살아나지 않는다.
resource "aws_cloudwatch_log_group" "flow_logs" {
  count = var.flow_logs_enabled ? 1 : 0

  name              = "/aws/vpc-flow-logs/${var.project}"
  retention_in_days = var.flow_logs_retention_days

  tags = { Name = "${var.project}-flow-logs" }
}

# ── Flow Logs 서비스가 맡을 역할 ──
#
# 신뢰 정책의 주체는 vpc-flow-logs.amazonaws.com 이다.
#   https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs-iam-role.html
#
# aws:SourceAccount 조건은 혼동된 대리인(confused deputy) 방지용이다. 이게 없으면
# 다른 계정이 자기 Flow Log 를 우리 역할로 쓰게 만들 여지가 남는다. AWS 문서가
# SourceArn 조건도 권하지만, Flow Log ID 를 미리 알 수 없어(생성 시점에 정해진다)
# 계정 조건만 건다 — 문서도 ID 를 모르면 와일드카드를 쓰라고 안내한다.
resource "aws_iam_role" "flow_logs" {
  count = var.flow_logs_enabled ? 1 : 0

  name = "${var.project}-vpc-flow-logs"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "vpc-flow-logs.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = {
          "aws:SourceAccount" = data.aws_caller_identity.current.account_id
        }
      }
    }]
  })

  tags = { Name = "${var.project}-vpc-flow-logs-role" }
}

# 문서가 요구하는 최소 권한 5가지.
#
# ⚠️ Resource 를 이 로그 그룹으로 좁히지 않았다.
# DescribeLogGroups/DescribeLogStreams 는 특정 로그 그룹 ARN 으로 제한할 수 없는
# 계정 범위 동작이다. AWS 문서의 예시 정책도 Resource: "*" 로 되어 있다.
# 대신 권한을 logs 5개로만 한정했고, 신뢰 정책에서 이 역할을 맡을 수 있는 주체를
# Flow Logs 서비스 + 우리 계정으로 묶어뒀다.
resource "aws_iam_role_policy" "flow_logs" {
  count = var.flow_logs_enabled ? 1 : 0

  name = "publish-flow-logs"
  role = aws_iam_role.flow_logs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
      ]
      Resource = "*"
    }]
  })
}

# ── VPC 전체에 대한 Flow Log ──
#
# resource_id 를 VPC 로 지정하면 그 안의 모든 ENI(노드, 파드, ALB, ElastiCache,
# NAT)가 자동으로 포함된다. 나중에 서브넷이나 노드가 늘어도 따로 추가할 필요가 없다.
#
# traffic_type
#   "ALL"    : 허용 + 거부 전부. 통신 흐름 전체를 본다. 양이 가장 많다.
#   "REJECT" : 막힌 것만. 양이 훨씬 적고, 보안그룹 문제를 찾을 때는 이것으로 충분하다.
#   "ACCEPT" : 통과한 것만.
# 기본을 "ALL" 로 두되, 비용이 부담되면 변수로 "REJECT" 로 낮출 수 있게 했다.
#
# max_aggregation_interval = 60
#   기록을 60초 단위로 묶는다. 기본값 600(10분)이면 문제가 생긴 시점을 10분
#   단위로밖에 못 좁힌다. 60 으로 두면 레코드 수가 늘어나는 대신 시점이 선명해진다.
#   부하 테스트 구간을 분석하려면 60 이 필요하다.
resource "aws_flow_log" "vpc" {
  count = var.flow_logs_enabled ? 1 : 0

  vpc_id = aws_vpc.main.id

  log_destination_type     = "cloud-watch-logs"
  log_destination          = aws_cloudwatch_log_group.flow_logs[0].arn
  iam_role_arn             = aws_iam_role.flow_logs[0].arn
  traffic_type             = var.flow_logs_traffic_type
  max_aggregation_interval = 60

  tags = { Name = "${var.project}-vpc-flow-log" }
}
