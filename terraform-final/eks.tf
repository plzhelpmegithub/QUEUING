# ──────────────────────────────────────────────
# EKS — 지금 자체 운영 중인 K8s 클러스터(master+worker2대)와 같은 개념을
# AWS 관리형으로 옮긴 것. 기존에 쓰던 deployment.yaml / hpa.yaml / Helm
# 차트를 그대로 재사용할 수 있음 (컨테이너 오케스트레이터 자체는 동일).
# ──────────────────────────────────────────────

# ── 컨트롤 플레인 IAM ──

resource "aws_iam_role" "eks_cluster" {
  name = "${var.project}-eks-cluster-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "eks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "eks_cluster_policy" {
  role       = aws_iam_role.eks_cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

# ── 클러스터 ──

resource "aws_eks_cluster" "main" {
  name     = "${var.project}-eks"
  role_arn = aws_iam_role.eks_cluster.arn
  version  = var.eks_cluster_version

  vpc_config {
    subnet_ids = concat(aws_subnet.private[*].id, aws_subnet.public[*].id)
    # 팀원 각자 PC에서 kubectl로 붙어야 하므로 public endpoint 유지.
    # (사내망 안에서만 접근하게 하려면 false로 바꾸고 VPN/베스천 필요 — 지금 단계에선 과함)
    endpoint_private_access = true
    endpoint_public_access  = true
  }

  # EKS Access Entry로 팀원별 권한을 관리하기 위한 모드.
  # bootstrap_cluster_creator_admin_permissions = true → terraform apply를 실행한
  # 계정(지예님)이 자동으로 클러스터 관리자 권한을 가짐.
  access_config {
    authentication_mode                         = "API"
    bootstrap_cluster_creator_admin_permissions = true
  }

  # ── 컨트롤 플레인 로그 (찬규 안에서 가져옴) ──
  #
  # 이 줄이 없으면 아래 CloudWatch 로그 그룹만 생기고 내용은 영원히 비어 있다.
  # 통합 직후 내 쪽이 그 상태였다 — 로그 그룹은 만들었는데 클러스터에서
  # 내보내도록 켜지 않았다.
  #
  #   api           : kubectl 요청/응답. 누가 무엇을 했는지.
  #   audit         : 리소스 변경 감사. "대시보드가 왜 초기화됐는지" 같은 추적에 쓴다.
  #   authenticator : IAM 인증 실패. RBAC 가 막았을 때 원인이 여기 남는다.
  #
  # ⚠️ 비용: 수집 $0.50/GB + 보관. audit 은 양이 많다. 아껴야 하면
  #    ["api", "authenticator"] 만 켠다.
  enabled_cluster_log_types = ["api", "audit", "authenticator"]

  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster_policy,

    # 로그 그룹이 먼저 있어야 한다. 없으면 EKS 가 이름 그대로 자동 생성하는데,
    # 그때는 retention 이 "만료 없음"(= 무기한 과금)으로 잡힌다.
    aws_cloudwatch_log_group.eks_cluster,
  ]

  tags = { Name = "${var.project}-eks" }
}

resource "aws_cloudwatch_log_group" "eks_cluster" {
  name              = "/aws/eks/${var.project}-eks/cluster"
  retention_in_days = 14
}

# ── 워커 노드 (Managed Node Group) ──

resource "aws_iam_role" "eks_node" {
  name = "${var.project}-eks-node-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "eks_node_worker" {
  role       = aws_iam_role.eks_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
}

resource "aws_iam_role_policy_attachment" "eks_node_cni" {
  role       = aws_iam_role.eks_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
}

resource "aws_iam_role_policy_attachment" "eks_node_ecr" {
  role       = aws_iam_role.eks_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

# EBS CSI 권한은 노드 역할이 아니라 IRSA 로 준다 — irsa.tf 참고.
# 노드 역할에 붙이면 그 노드의 모든 파드가 EBS 를 조작할 수 있게 된다.

# 노드 인스턴스에 우리 SG(ALB → NodePort 인바운드 허용)를 추가로 붙이기 위한
# 커스텀 launch template. (EKS 관리형 노드그룹은 기본적으로 자체 클러스터 SG만
# 붙이는데, 거기에 우리 SG를 더하려면 launch template이 필요함)
resource "aws_launch_template" "eks_nodes" {
  name_prefix = "${var.project}-eks-node-"

  # ⚠️ 클러스터 SG를 반드시 함께 넣어야 한다.
  #
  # AWS 문서 원문:
  #   "If you specify custom security groups in the launch template ...,
  #    Amazon EKS doesn't add the cluster security group. So, you must ensure
  #    that the inbound and outbound rules of your security groups enable
  #    communication with the endpoint of your cluster. If your security group
  #    rules are incorrect, the worker nodes can't join the cluster."
  #   https://docs.aws.amazon.com/eks/latest/userguide/launch-templates.html
  #
  # 컨트롤 플레인 ENI에 붙은 클러스터 SG의 기본 인바운드는 "Self"뿐이라,
  # 노드가 우리 SG만 달고 있으면 노드 → API서버 443이 막혀 클러스터 조인이
  # 실패한다 (노드그룹 생성이 ~15분 대기 후 NodeCreationFailure).
  # 컨트롤플레인 → 노드 10250(kubelet)도 막혀서 kubectl logs/exec 와
  # metrics-server(= HPA 전체)가 동작하지 않는다.
  vpc_security_group_ids = [
    aws_security_group.eks_nodes.id,
    aws_eks_cluster.main.vpc_config[0].cluster_security_group_id,
  ]

  # ── 보안 설정 (찬규 안에서 가져옴) ──

  # IMDSv2 강제. 인스턴스 메타데이터(임시 자격증명 포함)를 읽으려면 먼저 토큰을
  # 받아야 하게 만든다. IMDSv1 은 단순 GET 만으로 읽혀서, 앱에 SSRF 취약점이
  # 있으면 노드 자격증명이 그대로 노출된다.
  # hop limit 2 — EKS 관리형 노드그룹이 커스텀 런치 템플릿에서 쓰는 기본값이다.
  # 파드(컨테이너 네트워크)에서 한 번 더 홉을 거치므로 1이면 닿지 않는다.
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  # 루트 볼륨 암호화. 노드 디스크에는 컨테이너 이미지와 임시 파일뿐이지만,
  # 로그나 캐시에 민감한 값이 남을 수 있어 켜둔다.
  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = var.eks_node_volume_size
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  monitoring {
    enabled = true
  }

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${var.project}-eks-node" }
  }

  lifecycle { create_before_destroy = true }
}

resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${var.project}-nodes"
  node_role_arn   = aws_iam_role.eks_node.arn
  subnet_ids      = aws_subnet.private[*].id

  instance_types = [var.eks_node_instance_type]

  # ⚠️ AL2023 을 명시한다.
  #
  # 찬규 안은 ami_type = "AL2_x86_64" 였다. AL2 기반 EKS 최적화 AMI 는
  # K8s 1.32 까지만 배포되고 2025-11-26 에 발행이 중단됐다. 1.33 부터는
  # AL2023 또는 Bottlerocket 만 나온다. 찬규님 기본값이 1.30 이어서 그쪽에서는
  # 문제가 없었지만, 통합본은 1.34 이므로 AL2 를 그대로 쓰면 노드그룹 생성이
  # 실패한다.
  #   https://docs.aws.amazon.com/eks/latest/userguide/eks-ami-deprecation-faqs.html
  #
  # 1.30 이상 클러스터의 새 관리형 노드그룹은 지정하지 않아도 AL2023 이
  # 기본값이지만, 눈에 보이게 적어둔다.
  #   https://docs.aws.amazon.com/eks/latest/userguide/eks-optimized-ami.html
  #
  # AL2 → AL2023 은 cgroup v1 → v2 전환을 포함한다. 앱이 cgroup 경로를
  # 직접 읽지 않으면 영향 없다 — 우리 4개 파트 모두 해당 없음.
  ami_type = "AL2023_x86_64_STANDARD"

  launch_template {
    id      = aws_launch_template.eks_nodes.id
    version = aws_launch_template.eks_nodes.latest_version
  }

  scaling_config {
    desired_size = var.eks_node_desired_size
    min_size     = var.eks_node_min_size
    max_size     = var.eks_node_max_size
  }

  update_config {
    max_unavailable = 1
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_node_worker,
    aws_iam_role_policy_attachment.eks_node_cni,
    aws_iam_role_policy_attachment.eks_node_ecr,

    # 노드는 프라이빗 서브넷에 뜨므로, NAT 게이트웨이와 경로가 먼저 살아 있어야
    # EKS API 엔드포인트와 ECR에 닿을 수 있다. 이 의존성이 없으면
    # Terraform이 병렬로 만들다가 경로보다 노드가 먼저 떠서 조인에 실패한다.
    # (클러스터 생성이 10분쯤 걸려 대개는 우연히 통과하지만, 실패했을 때
    #  원인을 찾기가 매우 어려운 종류라 명시해둔다)
    aws_nat_gateway.main,
    aws_route_table_association.private,

    # 네트워킹 애드온이 먼저 자리를 잡은 뒤에 노드를 띄운다.
    #
    # EKS 는 클러스터를 만들 때 vpc-cni/kube-proxy 를 self-managed 로 미리
    # 깔아둔다. 그 상태에서 관리형 애드온을 OVERWRITE 로 덮으면 DaemonSet 이
    # 재시작되는데, 하필 그때 노드가 조인 중이면 파드에 IP 가 붙지 않는
    # 구간이 생긴다. 이 의존성이 없으면 Terraform 이 둘을 병렬로 진행한다.
    #
    # (coredns 는 반대다 — Deployment 라서 스케줄될 노드가 있어야 한다.
    #  그래서 coredns 쪽에 depends_on = [aws_eks_node_group.main] 이 있고,
    #  여기에 넣으면 순환 의존이 된다)
    aws_eks_addon.vpc_cni,
    aws_eks_addon.kube_proxy,
  ]

  tags = { Name = "${var.project}-eks-nodes" }

  # ── desired_size 를 테라폼이 되돌리지 않게 한다 (찬규 안에서 가져옴) ──
  #
  # HPA 가 파드를 늘려 노드가 모자라면 Cluster Autoscaler(또는 Karpenter)가
  # 이 노드그룹의 desired_size 를 올린다. 그 상태에서 terraform apply 를 하면
  # 변수값(기본 2)으로 되돌려 버려서, 부하가 걸린 중에 노드가 줄어든다.
  #
  # ⚠️ 대신 apply 로는 노드 수를 바꿀 수 없게 된다. 바꾸려면
  #    eksctl/콘솔에서 직접 조정하거나 이 블록을 일시적으로 주석 처리한다.
  lifecycle {
    ignore_changes = [scaling_config[0].desired_size]
  }
}


# ──────────────────────────────────────────────
# 노드 접속용 SSM 권한 (찬규 안에서 가져옴)
#
# 이 정책이 붙으면 SSH 키·22번 포트·베스천 호스트 없이 노드에 들어갈 수 있다.
#   aws ssm start-session --target i-xxxxxxxx
#
# 온프레미스에서 노드 디스크가 83% 까지 찼을 때, IPv6 를 끄려고 sysctl 을
# 만질 때 모두 노드에 직접 들어가야 했다. AWS 에서 프라이빗 서브넷에 있는
# 노드에 들어갈 방법이 이것뿐이다 — 없으면 노드 안을 볼 수 없다.
#
# 보안상으로도 SSH 키를 돌려쓰는 것보다 낫다. 접속 기록이 CloudTrail 에
# 남고, 권한을 IAM 으로 회수할 수 있다.
# ──────────────────────────────────────────────

resource "aws_iam_role_policy_attachment" "eks_node_ssm" {
  role       = aws_iam_role.eks_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# ──────────────────────────────────────────────
# EKS 관리형 애드온 (찬규 안에서 가져옴)
#
# ■ 왜 테라폼으로 관리하나
# 이 세 개는 EKS 가 클러스터 생성 시 "self-managed" 로 알아서 깔아준다.
# 그래서 없어도 클러스터는 돈다. 차이는 업그레이드 때 드러난다.
#   self-managed : K8s 버전을 올릴 때 각 컴포넌트를 수동으로 맞춰야 한다.
#                  버전이 어긋나면 CoreDNS 가 안 뜨거나 파드에 IP 가 안 붙는다.
#   관리형 애드온 : AWS 가 호환 버전을 보장하고, 콘솔/CLI 로 업데이트한다.
#
# 온프레미스에서 1.31.14 로 고정해두고 손대지 못한 것이 이 이유였다.
#
# ■ 각각이 하는 일
#   vpc-cni    : 파드에 VPC IP 를 직접 준다. 파드가 ElastiCache·RDS 에
#                NAT 없이 바로 붙는 근거. (Calico 를 대체)
#   kube-proxy : NodePort → 파드 라우팅. ALB 트래픽이 파드에 닿는 경로.
#   coredns    : 클러스터 내부 DNS. redis-master.realtime.svc.cluster.local
#                같은 이름 해석. 이게 죽으면 파드끼리 서로를 못 찾는다.
#
# resolve_conflicts_on_update = "OVERWRITE"
#   EKS 가 미리 깔아둔 self-managed 버전과 설정이 충돌할 때 애드온 쪽으로
#   덮어쓴다. 이게 없으면 첫 apply 에서 "conflict" 로 실패한다.
#
# ⚠️ coredns 는 노드가 있어야 스케줄된다. 노드그룹보다 먼저 만들면
#    Degraded 상태로 멈춘다 — depends_on 이 그래서 필요하다.
#
# ■ EBS CSI 애드온은 여기가 아니라 irsa.tf 에 있다
#   권한을 노드 역할이 아니라 ServiceAccount 에 줘야 해서 IRSA 와 묶여 있다.
# ──────────────────────────────────────────────

resource "aws_eks_addon" "vpc_cni" {
  cluster_name                = aws_eks_cluster.main.name
  addon_name                  = "vpc-cni"
  resolve_conflicts_on_update = "OVERWRITE"

  tags = { Name = "${var.project}-addon-vpc-cni" }
}

resource "aws_eks_addon" "kube_proxy" {
  cluster_name                = aws_eks_cluster.main.name
  addon_name                  = "kube-proxy"
  resolve_conflicts_on_update = "OVERWRITE"

  tags = { Name = "${var.project}-addon-kube-proxy" }
}

resource "aws_eks_addon" "coredns" {
  cluster_name                = aws_eks_cluster.main.name
  addon_name                  = "coredns"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [aws_eks_node_group.main]

  tags = { Name = "${var.project}-addon-coredns" }
}
