# ──────────────────────────────────────────────
# VPC — 퍼블릭(ALB, NAT) + 프라이빗(EKS 노드, RDS, ElastiCache)
#
# ■ 통합 출처
#   서브넷 계산(cidrsubnet + count)      찬규(A) · 예지(D) 두 사람이 같은 방식을 썼다
#   가용영역 자동 조회                    예지(D) — AZ 이름을 하드코딩하지 않는다
#   EKS 서브넷 태그                       예지(D) — 아래 설명 참고
#   NAT Gateway                           찬규(A) · 예지(D)
#
# 지예(C) 안은 CIDR 4개를 손으로 적고 AZ 도 변수로 고정했는데, 두 사람 방식이
# AZ 를 늘릴 때 손댈 곳이 없어 더 낫다. 그대로 가져왔다.
#
# ■ IP 대역
#   VPC          10.0.0.0/16
#   퍼블릭       10.0.0.0/24, 10.0.1.0/24     (cidrsubnet 8, 0~1)
#   프라이빗     10.0.10.0/24, 10.0.11.0/24   (cidrsubnet 8, 10~11)
#   온프레미스   192.168.0.0/24  — 겹치지 않는다
# ──────────────────────────────────────────────

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.project}-vpc" }
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${var.project}-igw" }
}

# ── 퍼블릭 서브넷 (ALB, NAT Gateway) ──
#
# kubernetes.io/role/elb 태그는 EKS 가 인터넷 대면 로드밸런서를 만들 때
# 어느 서브넷에 배치할지 찾는 표식이다. 이 태그가 없으면 AWS Load Balancer
# Controller 가 서브넷을 못 찾아 "could not discover subnets" 로 실패한다.
# 지금은 ALB 를 테라폼으로 직접 만들지만, 나중에 Ingress 로 전환할 때를 대비해
# 미리 붙여둔다(붙어 있어도 해가 없다). — 예지(D) 안에서 가져옴
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name                     = "${var.project}-pub-${count.index + 1}"
    "kubernetes.io/role/elb" = "1"
  }
}

# ── 프라이빗 서브넷 (EKS 노드, RDS, ElastiCache) ──
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name                              = "${var.project}-priv-${count.index + 1}"
    "kubernetes.io/role/internal-elb" = "1"
  }
}

# ── NAT Gateway ──
#
# 프라이빗 서브넷의 유일한 아웃바운드 경로다. ECR/Docker Hub 이미지 pull,
# EKS API 엔드포인트, D-Cloud DB 접속이 모두 여기를 지난다.
#
# ⚠️ D-Cloud 화이트리스트
# D-Cloud 는 출발지 IP 로 접속을 허용한다(사무실에서 붙을 때 계정이
# 'team2'@'118.131.22.85' 형태로 잡히는 것에서 확인됨). RDS 대신 D-Cloud 를
# 계속 쓴다면 아래 EIP 를 D-Cloud 관리자에게 전달해 등록해야 한다.
#   terraform output nat_eip
#
# NAT Instance(t3.micro, 월 ~$8.5) 대신 Gateway(월 ~$32)를 쓴다. 네 사람 중
# 두 사람이 Gateway 로 설계했고, EC2 한 대가 단일 장애점이 되는 것을 피한다.
resource "aws_eip" "nat" {
  domain = "vpc"

  tags = { Name = "${var.project}-nat-eip" }

  depends_on = [aws_internet_gateway.igw]
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = { Name = "${var.project}-nat" }

  depends_on = [aws_internet_gateway.igw]
}

# ── 라우팅 ──

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }

  tags = { Name = "${var.project}-rt-pub" }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = { Name = "${var.project}-rt-priv" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# ──────────────────────────────────────────────
# S3 게이트웨이 VPC 엔드포인트
#
# ■ 출처: 어느 안에도 없었다. 통합하면서 추가한다.
#
# ECR 에서 이미지를 받을 때 실제 레이어 데이터는 S3 에서 온다. 엔드포인트가
# 없으면 그 트래픽이 전부 NAT 게이트웨이를 지나고, 처리 요금이 GB 당 $0.045 다.
# 노드가 2대에서 10대로 늘어나는 순간 같은 이미지를 8번 더 받는다.
#
# 게이트웨이 엔드포인트는 요금이 없다. 프라이빗 라우팅 테이블에 S3 접두사
# 목록으로 가는 경로 하나가 추가되는 방식이라, NAT 를 지나지 않고 바로 간다.
# 인터페이스 엔드포인트(ECR API 용)와 달리 시간당 요금도 없다.
#
# ⚠️ 이것만으로 ECR 트래픽 전부가 NAT 를 우회하지는 않는다.
# ECR API 호출(인증·매니페스트 조회)은 여전히 NAT 를 지난다. 그것까지 없애려면
# com.amazonaws.<리전>.ecr.api / .ecr.dkr 인터페이스 엔드포인트가 필요한데,
# 이쪽은 엔드포인트당 시간당 요금이 붙는다(AZ 2개면 월 약 $15/개). 지금 규모에서는
# 오히려 NAT 요금보다 비싸질 수 있어 넣지 않았다.
# ──────────────────────────────────────────────

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"

  # 프라이빗 라우팅 테이블에만 붙인다. 퍼블릭 서브넷은 IGW 로 바로 나가므로
  # NAT 를 거치지 않아 절약할 것이 없다.
  route_table_ids = [aws_route_table.private.id]

  tags = { Name = "${var.project}-vpce-s3" }
}
