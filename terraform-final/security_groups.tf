# ──────────────────────────────────────────────
# 보안 그룹
#
# 모든 SG 와 모든 규칙에 description 을 붙인다 — 찬규(A) 안의 방식이다.
# AWS 콘솔의 보안그룹 규칙 목록은 포트와 소스만 보여주기 때문에, 설명이 없으면
# "이 구멍이 왜 열려 있는지"를 테라폼 코드까지 열어봐야 알 수 있다.
# 규칙을 지워도 되는지 판단할 때 이 차이가 크다.
#
# ⚠️ description 은 나중에 수정할 수 없다. 바꾸려면 규칙을 지웠다 다시 만들어야
#    한다(테라폼이 알아서 하지만, 그 순간 짧게 규칙이 사라진다).
# ──────────────────────────────────────────────

# ALB — 인터넷에서 HTTP/HTTPS 인바운드
resource "aws_security_group" "alb" {
  name_prefix = "${var.project}-alb-"
  vpc_id      = aws_vpc.main.id
  description = "ALB - 인터넷에서 오는 HTTP/HTTPS 수신"

  ingress {
    description = "HTTP - 443 리다이렉트용. 실제 라우팅은 하지 않는다"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS - api.queuing.kr 진입점. C파트 wss:// 도 여기로 들어온다"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "타겟그룹(워커 노드 NodePort)으로 전달 + 헬스체크"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-sg-alb" }

  lifecycle { create_before_destroy = true }
}

# EKS 워커 노드 — ALB의 NodePort 트래픽 + 노드 간 통신
resource "aws_security_group" "eks_nodes" {
  name_prefix = "${var.project}-eks-nodes-"
  vpc_id      = aws_vpc.main.id
  description = "EKS 워커 노드 - ALB 의 NodePort 트래픽과 노드 간 통신"

  ingress {
    description     = "NodePort 범위 - ALB 에서만. 인터넷에서 노드로 직접은 불가"
    from_port       = 30000
    to_port         = 32767
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description = "노드 간 통신 - 파드 사이 통신과 kube-proxy 가 여기에 의존"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    self        = true
  }

  egress {
    description = "ElastiCache/RDS + NAT 경유 외부(ECR, SQS, SES, D-Cloud DB)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-sg-eks-nodes" }

  lifecycle { create_before_destroy = true }
}

# ElastiCache Redis — EKS 노드에서만 접근
resource "aws_security_group" "redis" {
  name_prefix = "${var.project}-redis-"
  vpc_id      = aws_vpc.main.id
  description = "ElastiCache Redis - EKS 노드에서만 6379"

  ingress {
    description     = "Redis 6379 - EKS 노드에서만. 대기열/좌석/채팅 데이터"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_nodes.id]
  }

  egress {
    description = "복제(Primary-Replica) 통신"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-sg-redis" }

  lifecycle { create_before_destroy = true }
}

# ── NAT 보안그룹은 없다 ──
#
# 한때 aws_security_group.nat 이 있었지만 지웠다. vpc.tf 는 NAT "인스턴스"가
# 아니라 NAT "게이트웨이"(aws_nat_gateway.main)를 쓰는데, NAT 게이트웨이는
# AWS 관리형이라 보안그룹을 붙일 수 없다. 붙는 곳 없이 만들어지기만 하던
# 리소스였고, 프라이빗 서브넷 대역(10.0.10.0/24, 10.0.11.0/24)이 하드코딩되어
# 있어서 vpc_cidr 을 바꾸면 조용히 어긋나는 상태이기도 했다.
#
# NAT 게이트웨이의 접근 통제는 라우팅 테이블이 한다 — 프라이빗 서브넷의
# 0.0.0.0/0 경로만 이 게이트웨이를 가리킨다(vpc.tf 참고).

# ── RDS MariaDB ──
# EKS 노드에서 오는 3306 만 허용한다. 인터넷은 물론 같은 VPC 의 다른 대역에서도
# 못 붙는다. (찬규 안의 구성을 EKS 노드 SG 기준으로 옮겼다)
resource "aws_security_group" "rds" {
  # RDS 를 만들 때만 이 보안그룹도 만든다.
  # use_rds = false(현재 기본값)인데 이 count 가 없으면, 붙을 DB 가 없는
  # 보안그룹만 계정에 남는다. rds.tf 의 다른 리소스는 전부 count 가 있었는데
  # 여기만 빠져 있었다.
  count = var.use_rds ? 1 : 0

  name_prefix = "${var.project}-rds-"
  vpc_id      = aws_vpc.main.id
  description = "RDS MariaDB - inbound from EKS nodes only"

  ingress {
    description     = "MariaDB from EKS nodes"
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_nodes.id]
  }

  egress {
    description = "RDS 자체 아웃바운드(백업/모니터링). 실사용은 인바운드뿐"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-sg-rds" }

  lifecycle { create_before_destroy = true }
}
