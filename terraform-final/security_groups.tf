# ──────────────────────────────────────────────
# 보안 그룹
# ──────────────────────────────────────────────

# ALB — 인터넷에서 HTTP/HTTPS 인바운드
resource "aws_security_group" "alb" {
  name_prefix = "${var.project}-alb-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
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

  ingress {
    from_port       = 30000
    to_port         = 32767
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    from_port = 0
    to_port   = 0
    protocol  = "-1"
    self      = true
  }

  egress {
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

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_nodes.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-sg-redis" }

  lifecycle { create_before_destroy = true }
}

# ── NAT Instance ──
# NAT Gateway 대체. 프라이빗 서브넷의 아웃바운드 인터넷 트래픽 중계.
resource "aws_security_group" "nat" {
  name_prefix = "${var.project}-nat-"
  vpc_id      = aws_vpc.main.id

  # 프라이빗 서브넷(EKS 노드)에서 오는 모든 트래픽
  ingress {
    description = "All from private subnets"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["10.0.10.0/24", "10.0.11.0/24"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-sg-nat" }

  lifecycle { create_before_destroy = true }
}

# ── RDS MariaDB ──
# EKS 노드에서 오는 3306 만 허용한다. 인터넷은 물론 같은 VPC 의 다른 대역에서도
# 못 붙는다. (찬규 안의 구성을 EKS 노드 SG 기준으로 옮겼다)
resource "aws_security_group" "rds" {
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
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-sg-rds" }

  lifecycle { create_before_destroy = true }
}
