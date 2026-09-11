# ──────────────────────────────────────────────
# 예지님(D파트) 모니터링용 Grafana EC2
#
# 위치: D:\realtime-ws-work\terraform-yeji-grafana\
#
# ■ 왜 terraform-final 과 따로 두나
# terraform-final 은 매일 저녁 destroy 한다. 거기 넣으면 이 EC2 와 그 안의 Grafana
# 설정·대시보드도 매일 사라진다. 이 폴더는 state 가 따로라서 queuing-aws.ps1 down 에
# 영향을 받지 않는다.
#
#   ⚠️ 이 폴더에서는 매일 destroy 하지 않는다. 필요 없어졌을 때만 한 번 destroy 한다.
#
# ■ 왜 queuing-vpc 가 아니라 기본 VPC 인가
# queuing-vpc(aws_vpc.main)도 매일 destroy 된다. 그 안에 두면 EC2 가 같이 지워진다.
# CloudWatch 조회는 VPC 와 무관한 AWS API 라서 어느 VPC 에 있어도 된다.
#
# ■ 접속 — 들어오는 포트는 전부 닫혀 있다 (2026-09-11 예지님 요청으로 3000 도 닫음)
#   Grafana : SSM 포트 포워딩 후 브라우저에서 http://localhost:3000
#             aws ssm start-session --region ap-northeast-2 --target <인스턴스 ID> --document-name AWS-StartPortForwardingSession --parameters "portNumber=3000,localPortNumber=3000"
#             (PC 에 Session Manager 플러그인이 있어야 한다)
#   쉘      : AWS 콘솔 > EC2 > 인스턴스 선택 > 연결 > Session Manager  (키·22번 포트 없음)
#
# ■ 퍼블릭 IP(EIP)를 남겨두는 이유
#   들어오는 연결용이 아니다. SSM 에이전트·Grafana 패키지 설치·CloudWatch API 가 모두
#   밖으로 나가는 통신이라 인터넷 출구가 필요하다. 없애려면 SSM·CloudWatch 용 VPC
#   엔드포인트를 따로 만들어야 해서 비용이 더 든다. 보안그룹에 인바운드 규칙이 없으므로
#   퍼블릭 IP 로 들어올 수 있는 포트는 없다.
#
# ■ 클러스터 Prometheus 연결
#   terraform-final/yeji_prometheus_link.tf 가 매일 피어링 + 내부 NLB 를 만든다.
#   데이터소스 주소: http://10.0.20.10:9090  (클러스터가 내려가 있을 때는 응답 없음)
#
# ■ 적용 (지예님, PowerShell)
#   cd D:\realtime-ws-work\terraform-yeji-grafana
#   terraform init
#   terraform apply
# ──────────────────────────────────────────────

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "region" {
  type    = string
  default = "ap-northeast-2"
}

variable "allowed_cidrs" {
  description = "Grafana(3000) 를 직접 열 IP. 기본은 비어 있다 — SSM 포트 포워딩으로만 접속한다."
  type        = list(string)
  default     = []
}

variable "instance_type" {
  type    = string
  default = "t3.small"
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project   = "queuing"
      Part      = "d"
      Owner     = "yeji"
      Purpose   = "grafana"
      ManagedBy = "terraform-yeji-grafana"
    }
  }
}

# ── 네트워크: 기본 VPC (destroy 대상이 아니다) ──
data "aws_vpc" "default" {
  default = true
}

data "aws_subnet" "default_2a" {
  vpc_id            = data.aws_vpc.default.id
  availability_zone = "${var.region}a"
  default_for_az    = true
}

# Amazon Linux 2023 최신 이미지
data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

resource "aws_security_group" "grafana" {
  name        = "queuing-yeji-grafana-sg"
  description = "Grafana 3000 from team IP only. No SSH - use SSM."
  vpc_id      = data.aws_vpc.default.id

  # ⚠️ 위 description 은 예전 문구지만 고치지 않는다. description 이 바뀌면 보안그룹을
  #    새로 만들어야 하는데, 인스턴스에 붙어 있어서 교체가 실패한다.
  #
  # ⚠️ ingress 를 블록이 아니라 목록(= [...])으로 쓴다. 블록이 0개면 terraform 은
  #    "인바운드를 관리하지 않음" 으로 보고 기존 3000 규칙을 지우지 않는다
  #    (2026-09-11 plan 으로 확인). 목록이 [] 이면 규칙이 전부 지워진다.
  ingress = [for c in(length(var.allowed_cidrs) > 0 ? [var.allowed_cidrs] : []) : {
    description      = "Grafana web from team IP"
    from_port        = 3000
    to_port          = 3000
    protocol         = "tcp"
    cidr_blocks      = c
    ipv6_cidr_blocks = []
    prefix_list_ids  = []
    security_groups  = []
    self             = false
  }]

  # Grafana/패키지 설치와 CloudWatch API 호출, SSM 에이전트 통신에 필요하다.
  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "queuing-yeji-grafana-sg" }
}

# ── 권한: SSM 접속 + CloudWatch 지표 읽기 (로그는 제외) ──
resource "aws_iam_role" "grafana" {
  name = "queuing-yeji-grafana-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.grafana.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Grafana CloudWatch 데이터소스가 쓰는 권한. 지표 읽기와 차원 이름 조회만 준다.
# CloudWatch Logs 는 넣지 않는다 (EKS 감사 로그에 리소스 변경 내용이 남는다).
resource "aws_iam_role_policy" "cloudwatch_read" {
  name = "queuing-yeji-grafana-cloudwatch-read"
  role = aws_iam_role.grafana.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "MetricsRead"
        Effect = "Allow"
        Action = [
          "cloudwatch:GetMetricData",
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:ListMetrics",
          "cloudwatch:DescribeAlarms",
          "cloudwatch:DescribeAlarmsForMetric",
          "cloudwatch:DescribeAlarmHistory",
          "cloudwatch:GetInsightRuleReport",
        ]
        Resource = "*"
      },
      {
        # 대시보드에서 인스턴스·ASG 이름을 고를 때 쓴다
        Sid    = "DimensionLookup"
        Effect = "Allow"
        Action = [
          "tag:GetResources",
          "ec2:DescribeInstances",
          "ec2:DescribeRegions",
          "ec2:DescribeTags",
          "autoscaling:DescribeAutoScalingGroups",
        ]
        Resource = "*"
      },
    ]
  })
}

resource "aws_iam_instance_profile" "grafana" {
  name = "queuing-yeji-grafana-profile"
  role = aws_iam_role.grafana.name
}

# ── 인스턴스 ──
resource "aws_instance" "grafana" {
  ami                         = data.aws_ssm_parameter.al2023.value
  instance_type               = var.instance_type
  subnet_id                   = data.aws_subnet.default_2a.id
  vpc_security_group_ids      = [aws_security_group.grafana.id]
  iam_instance_profile        = aws_iam_instance_profile.grafana.name
  associate_public_ip_address = true
  # 키 페어를 만들지 않는다. 쉘은 SSM 으로만 들어간다.

  metadata_options {
    http_tokens = "required" # IMDSv2 만 허용
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    encrypted   = true
  }

  # ⚠️ AMI 는 SSM 파라미터로 "최신"을 가리킨다. 새 이미지가 나올 때마다 다음 apply 가
  #    인스턴스를 교체하려 들고, 그러면 안에 설치한 Grafana 와 대시보드가 사라진다.
  lifecycle {
    ignore_changes = [ami]
  }

  tags = { Name = "queuing-yeji-grafana" }
}

# 인스턴스를 껐다 켜도 주소가 바뀌지 않게 고정한다.
# (퍼블릭 IPv4 는 붙어 있는 동안 어차피 시간당 과금이라 추가 비용은 없다)
resource "aws_eip" "grafana" {
  domain   = "vpc"
  instance = aws_instance.grafana.id
  tags     = { Name = "queuing-yeji-grafana-eip" }
}

output "grafana_port_forward" {
  description = "PowerShell 에서 실행한 뒤 브라우저로 http://localhost:3000"
  value       = "aws ssm start-session --region ${var.region} --target ${aws_instance.grafana.id} --document-name AWS-StartPortForwardingSession --parameters \"portNumber=3000,localPortNumber=3000\""
}

output "instance_id" {
  value = aws_instance.grafana.id
}

output "connect" {
  value = <<-EOT
    쉘 접속 (둘 중 하나)
      1) AWS 콘솔 > EC2 > queuing-yeji-grafana 선택 > 연결 > Session Manager > 연결
      2) aws ssm start-session --region ${var.region} --target ${aws_instance.grafana.id}
         (PC 에 Session Manager 플러그인이 있어야 한다)
    Grafana 는 이 서버에 직접 설치한다. 들어오는 포트는 없고 SSM 포트 포워딩으로만 연다.
    클러스터 Prometheus 데이터소스: http://10.0.20.10:9090
  EOT
}
