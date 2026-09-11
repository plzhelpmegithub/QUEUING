# ──────────────────────────────────────────────
# 예지님 Grafana EC2 → 클러스터 Prometheus 사설 연결 (이 파일 하나에 전부)
#
# ■ 경로
#   Grafana EC2 (기본 VPC, terraform-yeji-grafana 가 관리, 매일 지우지 않음)
#     → VPC 피어링
#     → 내부 NLB 10.0.20.10:9090   (전용 /27 서브넷에 IP 고정. 2b 에도 서브넷 하나 더)
#     → 노드 NodePort 30090        (노드그룹 ASG 에 붙어서 새 노드도 자동 등록)
#     → Prometheus 파드
#   Grafana 데이터소스 주소: http://10.0.20.10:9090  (output yeji_prometheus_url, 매일 같다)
#
# ■ 왜 EC2 를 이 VPC 로 옮기지 않았나 (예지님 요청은 "같은 VPC 로 재생성")
#   이 VPC(aws_vpc.main)는 매일 저녁 destroy 되고 아침마다 ID 가 바뀐다.
#     CloudTrail CreateVpc: 9/9 vpc-0f53…, 9/10 vpc-002d…, 9/11 vpc-0545…
#   - 다른 state 의 EC2 가 이 VPC 에 있으면 저녁 destroy 가 서브넷·VPC 삭제에서 막힌다.
#   - EC2 를 이 파일에 넣어 같이 지우면 "클러스터가 죽어도 CloudWatch 패널은 살아 있다"
#     는 B안의 목적이 깨지고, Grafana 설정도 매일 사라진다.
#   그래서 EC2 는 그대로 두고 연결 통로만 매일 만들고 지운다.
#
# ■ 왜 NLB 를 두나
#   노드 IP 는 매일(노드가 교체될 때마다) 바뀐다. 노드 IP:30090 을 데이터소스에 적으면
#   매일 고쳐야 한다. NLB IP 는 이 파일이 고정하므로 주소가 바뀌지 않는다.
#   NLB 전용 서브넷을 따로 두는 이유: 노드 서브넷에서는 VPC CNI 가 파드용 IP 를 미리
#   잡아두기 때문에, 고정하려는 IP 가 이미 쓰이고 있어 NLB 생성이 실패할 수 있다.
#
#   ⚠️ NLB 는 노드가 있는 AZ 마다 서브넷이 있어야 한다 (2026-09-11 실제로 겪음).
#   처음엔 2a 에만 두었더니 cross-zone 을 켰는데도 2b 노드가 "Target.NotInUse — AZ 가
#   로드밸런서에 켜져 있지 않다" 로 빠졌다. 노드가 2b 로만 몰리는 날 연결이 끊긴다.
#   Grafana 는 2a 의 10.0.20.10 만 쓰고, 2b 서브넷은 NLB 가 2b 노드로 보내기 위해 있다.
#
# ■ 접근 제한 — Prometheus 는 인증이 없다
#   - NLB 보안그룹: 9090 을 Grafana EC2 사설 IP /32 에서만 받는다.
#   - 기본 VPC 쪽 경로: NLB 서브넷(/27)만 피어링으로 보낸다. EKS VPC 의 다른 곳은 못 간다.
#   - EKS 쪽 경로: Grafana EC2 IP /32 로만 돌아간다.
#   - 노드: 30090 을 NLB 보안그룹에서만 받는다. 인터넷 ALB 와는 무관하다.
#
# ■ 노드 규칙을 aws_security_group.eks_nodes 가 아니라 클러스터 SG 에 거는 이유
#   eks_nodes 는 inline 규칙이라 밖에서 규칙을 따로 붙이면 다음 apply 가 지워버린다.
#   노드에는 EKS 클러스터 SG 도 붙어 있다(eks.tf 런치 템플릿 vpc_security_group_ids).
#
# ■ 짝이 맞아야 하는 값
#   queuing-aws.ps1 의 $MonitoringValues  prometheus.service.nodePort = var.prometheus_nodeport
#
# ■ 비용  NLB 시간당 약 $0.0225 + 사용량. 피어링은 무료, 같은 AZ(2a) 라 전송비도 거의 없다.
# ■ 끄기  terraform.tfvars 에 yeji_prometheus_link = false
#         (예지님 EC2 가 없어지면 아래 data 조회가 실패하므로 반드시 끈다)
# ──────────────────────────────────────────────

variable "yeji_prometheus_link" {
  description = "예지님 Grafana EC2 에서 클러스터 Prometheus 로 가는 사설 연결을 만든다"
  type        = bool
  default     = true
}

variable "prometheus_nodeport" {
  description = "Prometheus Service NodePort. queuing-aws.ps1 모니터링 값과 같아야 한다."
  type        = number
  default     = 30090
}

locals {
  prom_link = var.yeji_prometheus_link ? 1 : 0
  # 노드 서브넷(aws_subnet.private)과 같은 AZ 순서로 만든다. 기존 서브넷(/24: 0,1,10,11)과 겹치지 않는다.
  prom_subnet_cidrs = [for i in range(2) : cidrsubnet(var.vpc_cidr, 11, 160 + i)] # 10.0.20.0/27, 10.0.20.32/27
  prom_nlb_ips      = [for c in local.prom_subnet_cidrs : cidrhost(c, 10)]        # 10.0.20.10, 10.0.20.42
  prom_subnet_cidr  = local.prom_subnet_cidrs[0]
  prom_nlb_ip       = local.prom_nlb_ips[0] # Grafana 데이터소스 주소
}

# ── 예지님 쪽 (읽기만 한다. terraform-yeji-grafana 가 관리) ──

data "aws_vpc" "yeji_default" {
  count   = local.prom_link
  default = true
}

data "aws_instance" "yeji_grafana" {
  count = local.prom_link

  filter {
    name   = "tag:Name"
    values = ["queuing-yeji-grafana"]
  }
  filter {
    name   = "instance-state-name"
    values = ["pending", "running", "stopping", "stopped"]
  }
}

# Grafana 서브넷은 전용 라우팅 테이블 연결이 없어서 VPC 메인 라우팅 테이블을 쓴다 (2026-09-11 확인).
data "aws_route_table" "yeji_default_main" {
  count  = local.prom_link
  vpc_id = data.aws_vpc.yeji_default[0].id

  filter {
    name   = "association.main"
    values = ["true"]
  }
}

# ── 피어링 ──

resource "aws_vpc_peering_connection" "yeji_grafana" {
  count       = local.prom_link
  vpc_id      = aws_vpc.main.id
  peer_vpc_id = data.aws_vpc.yeji_default[0].id
  auto_accept = true # 같은 계정·같은 리전

  tags = { Name = "${var.project}-yeji-grafana-peering" }
}

# 기본 VPC → NLB 서브넷만
resource "aws_route" "yeji_default_to_prom" {
  count                     = local.prom_link
  route_table_id            = data.aws_route_table.yeji_default_main[0].id
  destination_cidr_block    = local.prom_subnet_cidr
  vpc_peering_connection_id = aws_vpc_peering_connection.yeji_grafana[0].id
}

# ── NLB 전용 서브넷 (노드 서브넷과 같은 AZ 두 개) ──

resource "aws_subnet" "prom_link" {
  count             = local.prom_link * 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.prom_subnet_cidrs[count.index]
  availability_zone = aws_subnet.private[count.index].availability_zone

  tags = { Name = "${var.project}-prom-link" }
}

# NLB 응답이 Grafana EC2 로 돌아가는 길. 인터넷 경로는 두지 않는다.
resource "aws_route_table" "prom_link" {
  count  = local.prom_link
  vpc_id = aws_vpc.main.id

  route {
    cidr_block                = "${data.aws_instance.yeji_grafana[0].private_ip}/32"
    vpc_peering_connection_id = aws_vpc_peering_connection.yeji_grafana[0].id
  }

  tags = { Name = "${var.project}-rt-prom-link" }
}

resource "aws_route_table_association" "prom_link" {
  count          = local.prom_link * 2
  subnet_id      = aws_subnet.prom_link[count.index].id
  route_table_id = aws_route_table.prom_link[0].id
}

# ── 보안그룹 ──

resource "aws_security_group" "prom_nlb" {
  count       = local.prom_link
  name_prefix = "${var.project}-prom-nlb-"
  vpc_id      = aws_vpc.main.id
  description = "Prometheus NLB - 9090 from yeji Grafana EC2 only"

  ingress {
    description = "Prometheus query from yeji Grafana EC2 over VPC peering"
    from_port   = 9090
    to_port     = 9090
    protocol    = "tcp"
    cidr_blocks = ["${data.aws_instance.yeji_grafana[0].private_ip}/32"]
  }

  egress {
    description = "Prometheus NodePort on worker nodes, including health checks"
    from_port   = var.prometheus_nodeport
    to_port     = var.prometheus_nodeport
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  tags = { Name = "${var.project}-sg-prom-nlb" }

  lifecycle { create_before_destroy = true }
}

resource "aws_vpc_security_group_ingress_rule" "nodes_from_prom_nlb" {
  count                        = local.prom_link
  security_group_id            = aws_eks_cluster.main.vpc_config[0].cluster_security_group_id
  referenced_security_group_id = aws_security_group.prom_nlb[0].id
  ip_protocol                  = "tcp"
  from_port                    = var.prometheus_nodeport
  to_port                      = var.prometheus_nodeport
  description                  = "Prometheus NodePort from internal NLB (yeji Grafana)"
}

# ── 내부 NLB ──

resource "aws_lb" "prom" {
  count                            = local.prom_link
  name                             = "${var.project}-prom-nlb"
  internal                         = true
  load_balancer_type               = "network"
  security_groups                  = [aws_security_group.prom_nlb[0].id]
  enable_cross_zone_load_balancing = true # Grafana 는 2a 주소로만 들어오므로 2a 에서 2b 노드로도 보내야 한다

  dynamic "subnet_mapping" {
    for_each = aws_subnet.prom_link
    content {
      subnet_id            = subnet_mapping.value.id
      private_ipv4_address = local.prom_nlb_ips[subnet_mapping.key]
    }
  }

  tags = { Name = "${var.project}-prom-nlb" }
}

resource "aws_lb_target_group" "prom" {
  count       = local.prom_link
  name        = "${var.project}-prom-tg"
  port        = var.prometheus_nodeport
  protocol    = "TCP"
  vpc_id      = aws_vpc.main.id
  target_type = "instance"

  # 노드가 NLB IP 를 출발지로 보게 한다. 그래야 노드 규칙에서 NLB 보안그룹을 출발지로 쓸 수 있다.
  preserve_client_ip = "false"

  health_check {
    protocol            = "HTTP"
    path                = "/-/ready"
    port                = "traffic-port"
    interval            = 30
    healthy_threshold   = 3
    unhealthy_threshold = 3
  }

  tags = { Name = "${var.project}-prom-tg" }
}

resource "aws_lb_listener" "prom" {
  count             = local.prom_link
  load_balancer_arn = aws_lb.prom[0].arn
  port              = 9090
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.prom[0].arn
  }
}

resource "aws_autoscaling_attachment" "prom_nodes" {
  count                  = local.prom_link
  autoscaling_group_name = tolist(aws_eks_node_group.main.resources[0].autoscaling_groups)[0].name
  lb_target_group_arn    = aws_lb_target_group.prom[0].arn
}

output "yeji_prometheus_url" {
  description = "예지님 Grafana 의 Prometheus 데이터소스 주소 (매일 같다)"
  value       = var.yeji_prometheus_link ? "http://${local.prom_nlb_ip}:9090" : null
}
