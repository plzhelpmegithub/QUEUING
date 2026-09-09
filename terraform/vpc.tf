# =============================================================================
# VPC (Virtual Private Cloud) — 격리된 가상 네트워크
# =============================================================================
#
# [역할]
# AWS 리소스들이 통신하는 격리된 네트워크를 생성한다.
# 온프레미스 K8s 클러스터의 물리 네트워크를 대체.
#
# [구조] 2개 AZ(가용 영역)에 걸쳐 고가용성(HA) 구성
#
#   VPC (10.0.0.0/16)
#   ├── Public Subnet AZ-a  (10.0.0.0/24)  ── ALB, NAT Gateway
#   ├── Public Subnet AZ-c  (10.0.1.0/24)  ── ALB
#   ├── Private Subnet AZ-a (10.0.10.0/24) ── ECS Fargate, RDS, Redis
#   └── Private Subnet AZ-c (10.0.11.0/24) ── ECS Fargate, RDS, Redis
#
# [트래픽 흐름]
#   인터넷 → IGW → Public Subnet(ALB) → Private Subnet(ECS) → Redis/RDS
#   ECS → NAT Gateway → 인터넷 (Docker Hub Pull, SMTP, reCAPTCHA 검증 등)
#
# [Public vs Private 서브넷의 차이]
#   Public  : Route Table에 IGW(인터넷 게이트웨이) 경유 라우트가 있음 → 인터넷 직접 연결
#   Private : Route Table에 NAT Gateway 경유 라우트만 있음 → 아웃바운드만 가능, 인바운드 불가
# =============================================================================


# -----------------------------------------------------------------------------
# [VPC] 전체 네트워크의 최상위 컨테이너.
#
#   cidr_block           : VPC 내에서 사용할 IP 대역. /16 = 65,536개 IP.
#   enable_dns_support   : VPC 내 DNS 확인 기능 활성화 (RDS 엔드포인트 등에 필요).
#   enable_dns_hostnames : EC2/ECS에 퍼블릭 DNS 호스트네임 자동 할당.
# -----------------------------------------------------------------------------
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${local.name_prefix}-vpc" }
}

# -----------------------------------------------------------------------------
# [Internet Gateway] VPC ↔ 인터넷 연결 통로.
# VPC당 하나만 생성 가능. Public Subnet의 라우트 테이블이 이걸 가리킨다.
# 이게 없으면 VPC 내부에서 인터넷에 접근할 수 없다.
# -----------------------------------------------------------------------------
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name_prefix}-igw" }
}

# -----------------------------------------------------------------------------
# [Public Subnets] 인터넷에서 직접 접근 가능한 서브넷 (ALB 배치용).
#
#   count = 2 : 2개 AZ에 각각 하나씩 생성. ALB는 최소 2개 AZ에 서브넷이 필요.
#   cidrsubnet(var.vpc_cidr, 8, count.index):
#     10.0.0.0/16 + 8비트 확장 → /24 서브넷 (256 IP)
#     count.index=0 → 10.0.0.0/24 (AZ-a)
#     count.index=1 → 10.0.1.0/24 (AZ-c)
#   map_public_ip_on_launch : 이 서브넷에 생성되는 인스턴스에 퍼블릭 IP 자동 할당.
# -----------------------------------------------------------------------------
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "${local.name_prefix}-public-${local.azs[count.index]}" }
}

# -----------------------------------------------------------------------------
# [Private Subnets] 인터넷에서 직접 접근 불가능한 서브넷 (ECS, RDS, Redis 배치용).
#
#   count.index + 10 으로 CIDR 오프셋:
#     count.index=0 → 10.0.10.0/24 (AZ-a)
#     count.index=1 → 10.0.11.0/24 (AZ-c)
#   Public 서브넷(0, 1)과 겹치지 않도록 10부터 시작.
# -----------------------------------------------------------------------------
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = local.azs[count.index]

  tags = { Name = "${local.name_prefix}-private-${local.azs[count.index]}" }
}

# -----------------------------------------------------------------------------
# [Elastic IP] NAT Gateway에 부여할 고정 퍼블릭 IP.
# NAT Gateway가 교체되어도 이 IP는 유지된다.
# 외부 서비스(Google reCAPTCHA, SMTP 등)에서 화이트리스트가 필요하면 이 IP를 등록.
# -----------------------------------------------------------------------------
resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${local.name_prefix}-nat-eip" }
}

# -----------------------------------------------------------------------------
# [NAT Gateway] Private Subnet → 인터넷 아웃바운드 전용 통로.
#
# Private Subnet의 ECS 태스크가 외부로 나갈 때 사용:
#   - Docker Hub에서 이미지 Pull
#   - Gmail SMTP로 이메일 발송
#   - Google reCAPTCHA siteverify API 호출
#   - AWS API 호출 (Secrets Manager, CloudWatch 등)
#
# 인바운드 트래픽은 차단된다 (인터넷 → NAT → Private 불가).
#
#   allocation_id : 위에서 만든 Elastic IP를 연결
#   subnet_id     : Public Subnet에 배치해야 인터넷에 연결됨
#   depends_on    : IGW가 먼저 생성되어야 NAT가 인터넷에 접근 가능
# -----------------------------------------------------------------------------
resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags       = { Name = "${local.name_prefix}-nat" }
  depends_on = [aws_internet_gateway.main]
}

# -----------------------------------------------------------------------------
# [Public Route Table] Public Subnet의 트래픽 라우팅 규칙.
#
#   0.0.0.0/0 → IGW : "모든 외부 트래픽은 인터넷 게이트웨이로 보내라"
#   → 이 규칙이 있어야 "Public" Subnet이 된다.
# -----------------------------------------------------------------------------
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name_prefix}-public-rt" }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"        # 모든 외부 IP
  gateway_id             = aws_internet_gateway.main.id  # IGW로 보냄
}

# 2개 Public Subnet에 이 Route Table을 연결
resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# -----------------------------------------------------------------------------
# [Private Route Table] Private Subnet의 트래픽 라우팅 규칙.
#
#   0.0.0.0/0 → NAT Gateway : "모든 외부 트래픽은 NAT를 경유해서 나가라"
#   → 아웃바운드만 가능, 인바운드는 불가 (보안).
# -----------------------------------------------------------------------------
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name_prefix}-private-rt" }
}

resource "aws_route" "private_nat" {
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"           # 모든 외부 IP
  nat_gateway_id         = aws_nat_gateway.main.id  # NAT로 보냄
}

# 2개 Private Subnet에 이 Route Table을 연결
resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}
