# ──────────────────────────────────────────────
# VPC — 퍼블릭(ALB, NAT Instance, Wireguard) + 프라이빗(EKS, Redis) 서브넷
#
# ■ IP 대역 매핑 (온프레미스 → AWS)
#
#   온프레미스 (192.168.0.0/24)         AWS VPC (10.0.0.0/16)
#   ─────────────────────────          ─────────────────────────────
#   개발PC (.190~.195)            →    각자 PC에서 AWS CLI/kubectl 접속 (IP 불필요)
#   K8s 노드 (.194, .195, .220+) →    EKS 워커 노드 (10.0.10.x, 10.0.11.x)
#   Redis (.190:6379)             →    ElastiCache (10.0.10~11.x)
#   D-Cloud (211.46.52.164)       →    NAT Instance 의 EIP 로 나가 공인망 접속
#
#   VPC CIDR = 10.0.0.0/16 → 온프레미스 192.168.0.0/24과 겹치지 않음
#   (2026-09-08 Wireguard VPN 제거 — nat_instance.tf 주석 참고)
#
# ■ 트래픽 흐름
#
#   [EKS Pod] → D-Cloud DB접속   : Pod → NAT Instance → 인터넷 → D-Cloud
#   [EKS Pod] → ECR 이미지 Pull  : Pod → NAT Instance → IGW → 인터넷
#   [외부 유저] → 웹 접속        : 인터넷 → CloudFront → ALB → EKS Pod
# ──────────────────────────────────────────────

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.project}-vpc" }
}

# ── 퍼블릭 서브넷 (ALB, NAT Instance, Wireguard) ──

resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = var.az_a
  map_public_ip_on_launch = true

  tags = { Name = "${var.project}-pub-a" }
}

resource "aws_subnet" "public_c" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.2.0/24"
  availability_zone       = var.az_c
  map_public_ip_on_launch = true

  tags = { Name = "${var.project}-pub-c" }
}

# ── 프라이빗 서브넷 (EKS 워커 노드, ElastiCache Redis) ──

resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = var.az_a

  tags = { Name = "${var.project}-priv-a" }
}

resource "aws_subnet" "private_c" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.11.0/24"
  availability_zone = var.az_c

  tags = { Name = "${var.project}-priv-c" }
}

# ── 인터넷 게이트웨이 ──

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${var.project}-igw" }
}

# ── 라우팅 테이블 ──

# 퍼블릭: 인터넷 직접 연결 (ALB, NAT Instance, Wireguard가 사용)
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }

  tags = { Name = "${var.project}-rt-pub" }
}

# 프라이빗: 모든 아웃바운드가 NAT Instance 를 거친다 (D-Cloud 포함)
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${var.project}-rt-priv" }
}

# 기본 아웃바운드 → NAT Instance (ECR pull, AWS API 호출 등)
resource "aws_route" "private_nat" {
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  network_interface_id   = aws_instance.nat.primary_network_interface_id
}

# ── 라우팅 테이블 연결 ──

resource "aws_route_table_association" "pub_a" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "pub_c" {
  subnet_id      = aws_subnet.public_c.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "priv_a" {
  subnet_id      = aws_subnet.private_a.id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "priv_c" {
  subnet_id      = aws_subnet.private_c.id
  route_table_id = aws_route_table.private.id
}
