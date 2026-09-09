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

  depends_on = [aws_iam_role_policy_attachment.eks_cluster_policy]

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
  ]

  tags = { Name = "${var.project}-eks-nodes" }
}

