# =============================================================================
# Security Groups — 리소스별 네트워크 접근 제어 (방화벽)
# =============================================================================
#
# [역할]
# 각 리소스(ALB, ECS, RDS, Redis)가 받을 수 있는 트래픽을 제한한다.
# K8s의 NetworkPolicy와 유사한 역할.
#
# [트래픽 허용 체인]
#   인터넷(80/443) → [ALB SG] → (NodePort) → [EKS Worker Node SG] → (6379) → [Redis SG]
#                                                    │
#                                                    └──→ NAT GW → 외부 D-Cloud MariaDB
#
# [보안 원칙]
#   - 최소 권한: 각 SG는 필요한 소스에서만 필요한 포트만 허용
#   - 체인 참조: IP 대역 대신 Security Group ID로 소스를 지정하여
#                IP가 바뀌어도 규칙이 유효하게 유지
# =============================================================================


# -----------------------------------------------------------------------------
# [ALB Security Group] 로드밸런서용 — 인터넷에서 HTTP/HTTPS 허용.
#
# ingress (인바운드):
#   - 80  (HTTP)  : 모든 IP에서 접근 허용. 브라우저 요청 수신.
#   - 443 (HTTPS) : 모든 IP에서 접근 허용. TLS 암호화 요청 수신.
#
# egress (아웃바운드):
#   - 전체 허용 : ALB가 ECS 태스크(Target Group)로 Health Check/요청을 전달해야 하므로.
#
# lifecycle.create_before_destroy:
#   SG 교체 시 새 SG를 먼저 만들고 기존 SG를 삭제. 다운타임 방지.
# -----------------------------------------------------------------------------
resource "aws_security_group" "alb" {
  name_prefix = "${local.name_prefix}-alb-"
  vpc_id      = aws_vpc.main.id
  description = "ALB - inbound HTTP/HTTPS from internet"

  # HTTP 인바운드 허용 (포트 80)
  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]   # 모든 IP에서 접근 가능
  }

  # HTTPS 인바운드 허용 (포트 443)
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # 아웃바운드 전체 허용 (ECS로 요청 전달, Health Check 등)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"              # "-1" = 모든 프로토콜
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-alb-sg" }

  lifecycle { create_before_destroy = true }
}

# -----------------------------------------------------------------------------
# [EKS Worker Node Security Group] K8s 노드용 — ALB에서 NodePort 허용.
#
# ingress:
#   - 30000~32767 (NodePort 범위) : ALB에서 K8s NodePort로 접근.
#     → ALB → Worker Node:NodePort → kube-proxy → Pod:3000
#     → 인터넷에서 Worker Node로 직접 접근 불가. 반드시 ALB를 경유해야 함.
#
# egress:
#   - 전체 허용 : Redis, RDS 연결 + 외부 API 호출(SMTP, reCAPTCHA 등).
# -----------------------------------------------------------------------------
resource "aws_security_group" "ecs" {
  name_prefix = "${local.name_prefix}-ecs-"
  vpc_id      = aws_vpc.main.id
  description = "EKS Worker Nodes - inbound from ALB and self"

  # ALB에서 K8s NodePort 범위 접근 허용 (30000~32767)
  ingress {
    description     = "NodePort from ALB"
    from_port       = 30000
    to_port         = 32767
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]   # ALB SG에 속한 리소스만
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Worker Node 간 통신 허용 (Pod-to-Pod, kube-proxy 등)
  ingress {
    description = "Node to Node"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    self        = true
  }

  tags = { Name = "${local.name_prefix}-eks-node-sg" }

  lifecycle { create_before_destroy = true }
}

# -----------------------------------------------------------------------------
# [RDS Security Group] — 제거됨.
# 외부 D-Cloud MariaDB를 사용하므로 RDS SG는 불필요.
# API Pod → NAT Gateway → IGW → 외부 DB로 통신하며,
# EKS Worker Node SG의 egress(전체 허용)로 외부 DB 접근이 가능.
# -----------------------------------------------------------------------------

# -----------------------------------------------------------------------------
# [Redis Security Group] ElastiCache용 — EC2에서만 6379 포트 허용.
#
# ingress:
#   - 6379 (Redis) : EC2 Security Group에 속한 인스턴스에서만 접근.
#     → 대기열, 좌석 상태, 이벤트 캐시 등 실시간 데이터를 API만 읽고 쓸 수 있다.
# -----------------------------------------------------------------------------
resource "aws_security_group" "redis" {
  name_prefix = "${local.name_prefix}-redis-"
  vpc_id      = aws_vpc.main.id
  description = "ElastiCache Redis - inbound from EC2 only"

  # EC2 인스턴스에서만 Redis 포트(6379) 접근 허용
  ingress {
    description     = "Redis from EC2"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-redis-sg" }

  lifecycle { create_before_destroy = true }
}
