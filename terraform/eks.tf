# =============================================================================
# EKS (Elastic Kubernetes Service) — 관리형 쿠버네티스
# =============================================================================
#
# [역할]
# 온프레미스 K8s 클러스터를 AWS 관리형 쿠버네티스로 대체.
# Control Plane(API Server, etcd, scheduler 등)은 AWS가 관리 → 패치·HA·백업 자동.
# Worker Node(EC2)만 사용자가 관리 (Managed Node Group으로 간소화).
#
# [온프레미스 K8s → EKS 매핑]
#   K8s Master Node       → EKS Control Plane (AWS 관리, 비용 $73/월)
#   K8s Worker Node       → EKS Managed Node Group (EC2 인스턴스)
#   K8s Deployment + Pod  → 기존 Helm 차트(redis-api-chart) 그대로 사용
#   K8s HPA               → 기존 HPA 설정 그대로 사용
#   K8s NodePort Service  → ALB Target Group ↔ NodePort 연결
#   kubectl / Helm        → 동일하게 사용 (kubeconfig만 변경)
#
# [예매 사이트에 EKS가 적합한 이유]
#   - Pod 스케일링이 수 초 (EC2 ASG는 수 분)
#   - 기존 노드에 Pod 즉시 추가 → 티켓 오픈 트래픽 급증 대응
#   - Pod 크래시 시 kubelet이 즉시 재시작 (EC2 교체는 수 분)
#   - 기존 Helm 차트(redis-api-chart) 재활용 가능
#
# [구성 요소]
#   1. CloudWatch Log Group  : EKS Control Plane 로그 저장
#   2. IAM Role - Cluster    : EKS Control Plane 권한
#   3. EKS Cluster           : 관리형 K8s Control Plane
#   4. OIDC Provider         : IRSA (Pod별 IAM 역할 부여) 기반
#   5. EKS Addons            : VPC CNI, CoreDNS, kube-proxy
#   6. IAM Role - Node Group : Worker Node EC2 권한
#   7. Launch Template       : Worker Node EC2 명세 (SG, 볼륨, 모니터링)
#   8. Managed Node Group    : Worker Node 오토스케일링 그룹
#   9. ASG ↔ ALB 연결        : Worker Node를 ALB Target Group에 자동 등록
#
# [트래픽 흐름]
#   사용자 → ALB:80/443 → EC2 Worker:NodePort(30084) → kube-proxy → Pod:3000
# =============================================================================


# -----------------------------------------------------------------------------
# [1] CloudWatch Log Group — EKS Control Plane 로그
#
# API Server, Audit, Authenticator 로그를 CloudWatch에 저장.
# kubectl 요청 기록, 인증 실패, 리소스 변경 이력 등을 추적할 수 있다.
# -----------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "eks" {
  name              = "/aws/eks/${local.name_prefix}-cluster/cluster"
  retention_in_days = 14

  tags = { Name = "${local.name_prefix}-eks-logs" }
}

# CloudWatch Log Group — Pod/컨테이너 로그 (Fluent Bit 등으로 수집 시 사용)
resource "aws_cloudwatch_log_group" "api" {
  name              = "/eks/${local.name_prefix}-api"
  retention_in_days = 14

  tags = { Name = "${local.name_prefix}-api-logs" }
}


# =============================================================================
# [2] IAM Role — EKS Cluster (Control Plane)
# =============================================================================
#
# EKS Control Plane이 VPC 네트워크 관리, 로그 전송 등에 사용하는 권한.
# AmazonEKSClusterPolicy: Control Plane이 필요한 모든 AWS API 호출 권한 포함.
# =============================================================================
resource "aws_iam_role" "eks_cluster" {
  name = "${local.name_prefix}-eks-cluster"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "eks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${local.name_prefix}-eks-cluster-role" }
}

resource "aws_iam_role_policy_attachment" "eks_cluster_policy" {
  role       = aws_iam_role.eks_cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}


# =============================================================================
# [3] EKS Cluster — 관리형 K8s Control Plane
# =============================================================================
#
# [주요 속성]
#   name    : 클러스터 이름. kubectl, Helm에서 참조.
#   version : K8s 버전. AWS가 마이너 버전 패치를 자동 적용.
#
# [vpc_config]
#   subnet_ids : Control Plane ENI가 배치될 서브넷.
#                Private + Public 모두 포함해야 내부/외부 통신 모두 가능.
#   endpoint_private_access : true = VPC 내부에서 kubectl 접근 가능
#   endpoint_public_access  : true = 인터넷에서 kubectl 접근 가능
#                             (IAM 인증 필요하므로 보안 유지)
#
# [enabled_cluster_log_types]
#   api           : API Server 요청/응답 로그
#   audit         : K8s 리소스 변경 감사 로그
#   authenticator : IAM 인증 로그 (RBAC 디버깅)
# =============================================================================
resource "aws_eks_cluster" "main" {
  name     = "${local.name_prefix}-cluster"
  role_arn = aws_iam_role.eks_cluster.arn
  version  = var.eks_cluster_version

  vpc_config {
    subnet_ids = concat(
      aws_subnet.private[*].id,
      aws_subnet.public[*].id
    )
    endpoint_private_access = true
    endpoint_public_access  = true
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator"]

  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster_policy,
    aws_cloudwatch_log_group.eks,
  ]

  tags = { Name = "${local.name_prefix}-cluster" }
}


# =============================================================================
# [4] OIDC Provider — IRSA (IAM Roles for Service Accounts)
# =============================================================================
#
# K8s Service Account에 IAM Role을 부여하는 기능.
# Pod별로 최소 권한을 부여할 수 있다 (Node Role 공유보다 안전).
#
# [사용 예]
#   - AWS Load Balancer Controller Service Account → ALB 관리 권한
#   - Cluster Autoscaler Service Account → ASG 조정 권한
#   - 앱 Service Account → Secrets Manager 읽기 권한
#
# thumbprint_list : EKS OIDC 발급자의 TLS 인증서 지문 (신뢰 검증용)
# =============================================================================
data "tls_certificate" "eks" {
  url = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "eks" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.main.identity[0].oidc[0].issuer

  tags = { Name = "${local.name_prefix}-eks-oidc" }
}


# =============================================================================
# [5] EKS Addons — 클러스터 필수 네트워크/DNS 컴포넌트
# =============================================================================
#
# EKS 관리형 애드온: AWS가 버전 호환성 보장, 자동 업데이트.
#
# vpc-cni    : Pod에 VPC IP를 직접 할당하는 CNI 플러그인.
#              각 Pod가 실제 VPC IP를 받아 ALB, RDS, Redis와 직접 통신.
# coredns    : K8s 내부 DNS. Service 이름으로 Pod를 찾을 수 있게 해줌.
#              (예: redis-master.realtime.svc.cluster.local)
# kube-proxy : iptables/IPVS 규칙으로 K8s Service → Pod 트래픽 라우팅.
#              NodePort 트래픽이 올바른 Pod에 도달하게 해줌.
# =============================================================================
resource "aws_eks_addon" "vpc_cni" {
  cluster_name = aws_eks_cluster.main.name
  addon_name   = "vpc-cni"

  resolve_conflicts_on_update = "OVERWRITE"
}

resource "aws_eks_addon" "kube_proxy" {
  cluster_name = aws_eks_cluster.main.name
  addon_name   = "kube-proxy"

  resolve_conflicts_on_update = "OVERWRITE"
}

resource "aws_eks_addon" "coredns" {
  cluster_name = aws_eks_cluster.main.name
  addon_name   = "coredns"

  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [aws_eks_node_group.main]
}


# =============================================================================
# [6] IAM Role — Node Group (Worker Node EC2)
# =============================================================================
#
# Worker Node EC2 인스턴스가 AWS 서비스를 호출할 때 사용하는 권한.
#
# [AWS 관리형 정책]
#   AmazonEKSWorkerNodePolicy       : kubelet이 EKS API와 통신
#   AmazonEKS_CNI_Policy            : VPC CNI가 ENI/IP를 관리
#   AmazonEC2ContainerRegistryReadOnly : ECR에서 이미지 Pull (ECR 전환 시 필요)
#   AmazonSSMManagedInstanceCore     : SSM Session Manager로 노드 접속
#
# [인라인 정책]
#   ses-send : SES 이메일 발송 (예매 확인 메일)
#
# ⚠️ 프로덕션 권장: Node Role 대신 IRSA로 Pod별 최소 권한 부여
# =============================================================================
resource "aws_iam_role" "eks_nodes" {
  name = "${local.name_prefix}-eks-nodes"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${local.name_prefix}-eks-nodes-role" }
}

resource "aws_iam_role_policy_attachment" "eks_worker" {
  role       = aws_iam_role.eks_nodes.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
}

resource "aws_iam_role_policy_attachment" "eks_cni" {
  role       = aws_iam_role.eks_nodes.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
}

resource "aws_iam_role_policy_attachment" "eks_ecr" {
  role       = aws_iam_role.eks_nodes.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_iam_role_policy_attachment" "eks_ssm" {
  role       = aws_iam_role.eks_nodes.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# --- SES 이메일 발송 권한 (Node Role에 부여) ---
resource "aws_iam_role_policy" "eks_nodes_ses" {
  name = "ses-send"
  role = aws_iam_role.eks_nodes.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ses:SendEmail", "ses:SendRawEmail"]
      Resource = ["*"]
    }]
  })
}


# =============================================================================
# [7] Launch Template — Worker Node EC2 인스턴스 명세
# =============================================================================
#
# Managed Node Group이 EC2를 시작할 때 참조하는 템플릿.
# 보안그룹, EBS 볼륨, 모니터링, 메타데이터 옵션을 정의.
#
# [보안그룹 구성]
#   cluster_security_group : EKS가 자동 생성. Control Plane ↔ Node 통신.
#   aws_security_group.ecs : ALB → NodePort 접근 + RDS/Redis 아웃바운드.
#
# [metadata_options]
#   http_put_response_hop_limit = 2 : EKS Pod가 IMDS(인스턴스 메타데이터)에
#   접근하려면 hop 2가 필요 (Pod → 컨테이너 네트워크 → 호스트).
# =============================================================================
resource "aws_launch_template" "eks_nodes" {
  name_prefix = "${local.name_prefix}-eks-nodes-"

  vpc_security_group_ids = [
    aws_eks_cluster.main.vpc_config[0].cluster_security_group_id,
    aws_security_group.ecs.id,
  ]

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

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "${local.name_prefix}-eks-node"
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}


# =============================================================================
# [8] Managed Node Group — Worker Node 오토스케일링
# =============================================================================
#
# AWS가 관리하는 EC2 Auto Scaling Group. 노드 업데이트·교체를 자동 처리.
# K8s HPA가 Pod를 늘리면, Cluster Autoscaler가 노드 부족 시 이 그룹을 확장.
#
# [주요 속성]
#   instance_types : Worker Node EC2 인스턴스 유형.
#   ami_type       : AL2_x86_64 = Amazon Linux 2 EKS 최적화 AMI (Docker + kubelet 포함).
#
# [scaling_config]
#   desired_size : 유지할 노드 수 (기본 2)
#   min_size     : 최소 노드 수 (1)
#   max_size     : 최대 노드 수 (10). Cluster Autoscaler가 이 범위 내에서 조절.
#
# [update_config]
#   max_unavailable : 노드 업데이트 시 동시에 교체할 최대 노드 수.
#                     1 = 한 번에 1개씩 순차 교체 (Rolling Update).
#
# [lifecycle.ignore_changes]
#   desired_size를 무시 → Cluster Autoscaler가 조정한 노드 수를
#   terraform apply가 원래 값으로 덮어쓰는 것을 방지.
# =============================================================================
resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${local.name_prefix}-nodes"
  node_role_arn   = aws_iam_role.eks_nodes.arn
  subnet_ids      = aws_subnet.private[*].id
  instance_types  = [var.eks_node_instance_type]
  ami_type        = "AL2_x86_64"

  scaling_config {
    desired_size = var.api_desired_count
    min_size     = var.api_min_count
    max_size     = var.api_max_count
  }

  update_config {
    max_unavailable = 1
  }

  launch_template {
    id      = aws_launch_template.eks_nodes.id
    version = "$Latest"
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_worker,
    aws_iam_role_policy_attachment.eks_cni,
    aws_iam_role_policy_attachment.eks_ecr,
  ]

  tags = { Name = "${local.name_prefix}-nodes" }

  lifecycle {
    ignore_changes = [scaling_config[0].desired_size]
  }
}


# =============================================================================
# [9] ASG ↔ ALB Target Group 연결
# =============================================================================
#
# Managed Node Group의 내부 ASG를 ALB Target Group에 자동 연결.
# Worker Node가 추가/제거되면 Target Group에도 자동 등록/해제.
#
# ALB → Worker Node:NodePort(30084) → kube-proxy → Pod:3000 흐름으로
# 사용자 트래픽이 K8s Pod에 도달한다.
# =============================================================================
resource "aws_autoscaling_attachment" "eks_alb" {
  autoscaling_group_name = aws_eks_node_group.main.resources[0].autoscaling_groups[0].name
  lb_target_group_arn    = aws_lb_target_group.api.arn
}
