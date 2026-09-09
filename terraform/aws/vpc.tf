# VPC 자체 - 우리 서비스 전용 가상 네트워크 공간
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${var.project_name}-vpc"
  }
}

# 인터넷 게이트웨이 - VPC가 외부 인터넷과 통신하기 위한 관문
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-igw"
  }
}

# 가용영역 목록 자동 조회 (서울 리전은 보통 2a, 2b, 2c 존재)
data "aws_availability_zones" "available" {
  state = "available"
}

# Public 서브넷 - 외부에서 접근 가능한 영역 (ALB, NAT Gateway 등이 위치)
# 가용영역 2개에 나눠서 만들어 장애 대비 (고가용성)
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name                                        = "${var.project_name}-public-${count.index + 1}"
    "kubernetes.io/role/elb"                     = "1"  # EKS가 ALB 만들 때 이 서브넷을 인식하도록
  }
}

# Private 서브넷 - 실제 EKS 워커 노드(Pod)가 위치, 외부에서 직접 접근 불가
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name                                        = "${var.project_name}-private-${count.index + 1}"
    "kubernetes.io/role/internal-elb"            = "1"
  }
}

# NAT Gateway용 고정 IP (Private 서브넷이 외부로 나갈 때 씀)
resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name = "${var.project_name}-nat-eip"
  }
}

# NAT Gateway - Private 서브넷(Pod)이 외부 인터넷에 나갈 수 있게 해줌 (예: Docker Hub에서 이미지 pull)
resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name = "${var.project_name}-nat"
  }
}

# Public 라우팅 테이블 - 인터넷 게이트웨이로 나가는 길
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${var.project_name}-public-rt"
  }
}

# Private 라우팅 테이블 - NAT Gateway를 거쳐 나가는 길
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = {
    Name = "${var.project_name}-private-rt"
  }
}

# 서브넷과 라우팅 테이블 연결
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
