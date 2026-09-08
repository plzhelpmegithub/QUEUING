# ──────────────────────────────────────────────
# NAT Instance — 프라이빗 서브넷의 유일한 아웃바운드 경로
#
# EKS 노드는 프라이빗 서브넷에 있어서 직접 인터넷으로 못 나간다.
# 이 인스턴스가 그 트래픽을 중계한다.
#   - ECR / Docker Hub 이미지 pull
#   - EKS API 엔드포인트, AWS API 호출
#   - D-Cloud MariaDB (211.46.52.164:13306)   ← 2026-09-08 변경
#
# ■ Wireguard VPN 을 걷어냈다 (2026-09-08)
# 원래 D-Cloud 만 별도로 VPN 터널을 태웠으나, 팀 결정으로 NAT 를 통한
# 공인망 접속으로 단순화했다. 관리 대상이 EC2 두 대에서 한 대로 줄고
# 터널 설정(공개키 교환, wg-quick)이라는 수동 단계가 사라진다.
#
#   변경 전:  Pod → 10.100.0.0/24 라우팅 → Wireguard EC2 → 터널 → D-Cloud
#             앱의 DB 호스트가 터널 IP(10.100.0.2)
#   변경 후:  Pod → NAT Instance → 인터넷 → D-Cloud 공인 IP
#             앱의 DB 호스트가 실제 주소(211.46.52.164)
#
# ⚠️ 보안상 알고 쓸 것
# MySQL 프로토콜은 기본이 평문이라, 이제 DB 계정과 조회 데이터가 인터넷
# 구간을 암호화 없이 지나간다. VPN 을 쓸 때는 터널이 그걸 감싸고 있었다.
# 완화하려면 MariaDB 연결에 TLS 를 켜야 하는데, D-Cloud 인증서가 자체 서명이라
# 현재는 클라이언트가 --skip-ssl 로 붙고 있다(검증을 끄고 접속).
#
# ⚠️ D-Cloud 측 작업이 반드시 필요하다
# D-Cloud 는 접속 허용을 출발지 IP 로 관리한다(사무실 IP 로 붙을 때
# 'team2'@'118.131.22.85' 형태로 계정이 잡히는 것에서 확인됨).
# 아래 EIP 를 D-Cloud 관리자에게 전달해 화이트리스트에 추가해야 한다.
# 그 전에는 EKS 에서 DB 접속이 Access denied 로 막힌다.
#
#   terraform output nat_eip
#
# ■ NAT Gateway 대신 NAT Instance 를 쓰는 이유
#   NAT Gateway  ~$32/월  (관리형, 다중 AZ 자동, 대역폭 자동 확장)
#   NAT Instance ~$8.50/월 (t3.micro 한 대, 직접 관리, 단일 장애점)
# 고정 공인 IP 로 나간다는 요건은 둘 다 충족한다. 크레딧이 제한된 학습
# 프로젝트라 저렴한 쪽을 유지한다. Gateway 로 바꾸려면 이 파일의 인스턴스를
# aws_nat_gateway 로 교체하고 vpc.tf 의 라우팅을 nat_gateway_id 로 바꾸면 된다.
# ──────────────────────────────────────────────

# EC2 두 대(NAT/Wireguard)가 공유하던 리소스를 vpn.tf 에서 여기로 옮겼다.
# Wireguard 를 걷어내면서 vpn.tf 가 통째로 사라졌기 때문이다.
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ── SSM 접속용 IAM (SSH 키 없이 콘솔/CLI 로 접속) ──
# NAT 인스턴스에 문제가 생겼을 때 키페어 없이 들어가 iptables 를 확인할 수 있다.
#   aws ssm start-session --target <instance-id>

resource "aws_iam_role" "nat_instance" {
  name = "${var.project}-nat-instance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "nat_ssm" {
  role       = aws_iam_role.nat_instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "nat" {
  name = "${var.project}-nat-profile"
  role = aws_iam_role.nat_instance.name
}

# ── NAT 인스턴스 ──

resource "aws_instance" "nat" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = var.nat_instance_type
  subnet_id              = aws_subnet.public_a.id
  vpc_security_group_ids = [aws_security_group.nat.id]
  iam_instance_profile   = aws_iam_instance_profile.nat.name

  # NAT 역할이므로 반드시 꺼야 한다. 켜져 있으면 AWS 가
  # "이 패킷의 목적지가 이 인스턴스가 아니다"라며 드롭시킨다.
  source_dest_check = false

  user_data = <<-USERDATA
#!/bin/bash
set -e

# IP 포워딩 활성화
echo "net.ipv4.ip_forward = 1" > /etc/sysctl.d/99-nat.conf
sysctl -p /etc/sysctl.d/99-nat.conf

# iptables NAT 마스커레이드 — 프라이빗 서브넷(10.0.10~11.x)에서 오는 패킷의
# 출발지 IP 를 이 인스턴스의 EIP 로 바꿔서 내보낸다. D-Cloud 가 화이트리스트로
# 보게 되는 주소가 바로 이 EIP 다.
dnf install -y iptables-services
iptables -t nat -A POSTROUTING -s 10.0.0.0/16 -o ens5 -j MASQUERADE
iptables-save > /etc/sysconfig/iptables
systemctl enable iptables

# 온프레미스 노드에서 겪은 것과 같은 문제를 예방한다.
# 이 호스트에 IPv6 경로가 없는데 커널에서 IPv6 가 켜져 있으면, Go 로 만들어진
# 클라이언트(containerd 등)가 AAAA 레코드를 받아 IPv6 로 접속을 시도하다
# "network is unreachable" 로 실패한다. 우리 구성은 전 구간 IPv4 다.
# (shared-infra/node-setup.md 참고)
echo "net.ipv6.conf.all.disable_ipv6 = 1" >> /etc/sysctl.d/99-nat.conf
echo "net.ipv6.conf.default.disable_ipv6 = 1" >> /etc/sysctl.d/99-nat.conf
sysctl -p /etc/sysctl.d/99-nat.conf
USERDATA

  tags = { Name = "${var.project}-nat-instance" }

  lifecycle {
    ignore_changes = [ami]
  }
}

# D-Cloud 화이트리스트에 등록할 고정 공인 IP.
# 인스턴스를 재시작해도 이 주소는 유지된다.
resource "aws_eip" "nat" {
  instance = aws_instance.nat.id
  domain   = "vpc"

  tags = { Name = "${var.project}-nat-eip" }

  depends_on = [aws_internet_gateway.igw]
}
