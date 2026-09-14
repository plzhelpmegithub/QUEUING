# ──────────────────────────────────────────────
# Cluster Autoscaler — 노드 자동 증설용 IAM 역할 (IRSA)
#
# ■ 왜 필요한가
# HPA·KEDA 는 "파드 수"만 늘린다. 노드(t3.medium)는 파드 17개까지만 받으므로
# 노드 2대로는 34자리가 끝이다. 평소 27개가 떠 있어 HPA 가 7개를 넘게 늘리면
# 나머지 파드는 Pending 으로 멈춘다. Pending 파드를 보고 노드그룹(Auto Scaling
# 그룹)의 desired 를 올리고, 한가해지면 다시 내리는 것이 Cluster Autoscaler 다.
#
# ■ 왜 terraform 과 스크립트 두 곳인가
#   terraform (이 파일)   AWS 쪽 권한. 파드가 ASG 를 조작하려면 IAM 역할이 있어야 한다.
#   queuing-aws.ps1 up    클러스터 안 설치(helm). KEDA·모니터링과 같은 방식이다.
#                         terraform 에 helm provider 를 넣으면 "클러스터가 아직 없는데
#                         클러스터에 접속해야 하는" 순서 문제가 생기고, 매일 destroy 할 때
#                         헬름 릴리즈와 클러스터 삭제 순서까지 terraform 이 챙겨야 한다.
#
# ■ 왜 IRSA 인가 (EKS Pod Identity 가 아니라)
#   OIDC 공급자가 이미 있다 (irsa.tf — EBS CSI·KEDA·B워커가 같은 방식).
#   Pod Identity 는 에이전트 DaemonSet 이 노드마다 파드 1개씩 더 먹는다. 자리가 부족한
#   지금 구조에서는 손해다.
#
# ■ 왜 Cluster Autoscaler 인가 (Karpenter · EKS Auto Mode 가 아니라)
#   Karpenter   노드를 terraform 밖에서 직접 만든다. 매일 destroy 할 때 그 EC2 가 state 에
#               없어서 서브넷·VPC 삭제가 막힐 수 있다. SQS·EventBridge·NodePool 설정도 추가.
#   Auto Mode   클러스터 구성을 통째로 바꿔야 하고, 관리형 인스턴스마다 관리 요금이 붙는다.
#   CA          기존 관리형 노드그룹의 desired 만 바꾼다. 노드는 계속 노드그룹 소속이라
#               destroy 가 그대로 지우고, ALB·Prometheus NLB 의 ASG 연결(alb.tf,
#               yeji_prometheus_link.tf)도 새 노드를 자동으로 대상에 넣는다.
#
# ■ 권한 범위
#   조회(Describe*)는 전체, 크기 변경(SetDesiredCapacity·Terminate)은 이 클러스터
#   노드그룹의 ASG 하나로 제한한다. ASG 이름은 매일 바뀌므로 노드그룹 결과에서 읽는다.
#   정책 원문: kubernetes/autoscaler cluster-autoscaler/cloudprovider/aws/README.md
#
# ■ 비용
#   역할·파드: 0원 (CA 파드는 기존 노드에서 50m CPU 로 돈다)
#   늘어난 노드: t3.medium $0.052/시간 + 루트 gp3 30GiB 약 $0.004/시간 → 대당 약 $0.056/시간
#   상한: eks_node_max_size = 6 → 최악이면 4대 추가, 시간당 약 $0.22. 저녁 destroy 로 끝난다.
#   줄어드는 시점: 노드가 10분 넘게 한가하면 제거 (CA 기본값)
#
# ■ 끄기: terraform.tfvars 에 cluster_autoscaler_enabled = false
#   스크립트는 출력이 없으면 설치를 건너뛴다.
# ──────────────────────────────────────────────

variable "cluster_autoscaler_enabled" {
  description = "노드 자동 증설(Cluster Autoscaler) IAM 역할을 만든다. 설치는 queuing-aws.ps1 up 이 한다"
  type        = bool
  default     = true
}

locals {
  cluster_autoscaler    = var.cluster_autoscaler_enabled ? 1 : 0
  cluster_autoscaler_sa = "cluster-autoscaler" # queuing-aws.ps1 의 rbac.serviceAccount.name 과 같아야 한다
  cluster_autoscaler_ns = "kube-system"
  eks_node_asg_name     = tolist(aws_eks_node_group.main.resources[0].autoscaling_groups)[0].name
}

data "aws_iam_policy_document" "cluster_autoscaler_assume" {
  count = local.cluster_autoscaler

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.eks.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:sub"
      values   = ["system:serviceaccount:${local.cluster_autoscaler_ns}:${local.cluster_autoscaler_sa}"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "cluster_autoscaler" {
  count              = local.cluster_autoscaler
  name               = "${var.project}-cluster-autoscaler"
  assume_role_policy = data.aws_iam_policy_document.cluster_autoscaler_assume[0].json
}

resource "aws_iam_role_policy" "cluster_autoscaler" {
  count = local.cluster_autoscaler
  name  = "${var.project}-cluster-autoscaler"
  role  = aws_iam_role.cluster_autoscaler[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Read"
        Effect = "Allow"
        Action = [
          "autoscaling:DescribeAutoScalingGroups",
          "autoscaling:DescribeAutoScalingInstances",
          "autoscaling:DescribeLaunchConfigurations",
          "autoscaling:DescribeScalingActivities",
          "ec2:DescribeImages",
          "ec2:DescribeInstanceTypes",
          "ec2:DescribeLaunchTemplateVersions",
          "ec2:GetInstanceTypesFromInstanceRequirements",
          "eks:DescribeNodegroup",
        ]
        Resource = "*"
      },
      {
        Sid    = "ScaleOnlyThisNodeGroup"
        Effect = "Allow"
        Action = [
          "autoscaling:SetDesiredCapacity",
          "autoscaling:TerminateInstanceInAutoScalingGroup",
        ]
        Resource = "arn:aws:autoscaling:${var.region}:${data.aws_caller_identity.current.account_id}:autoScalingGroup:*:autoScalingGroupName/${local.eks_node_asg_name}"
      },
    ]
  })
}

# queuing-aws.ps1 up 이 이 값으로 helm 설치를 한다. 꺼져 있으면 null → 설치 건너뜀.
output "cluster_autoscaler" {
  description = "Cluster Autoscaler 설치 값 (IRSA 역할, 대상 ASG, 최소/최대 노드 수)"
  value = var.cluster_autoscaler_enabled ? {
    role_arn = aws_iam_role.cluster_autoscaler[0].arn
    asg_name = local.eks_node_asg_name
    min_size = var.eks_node_min_size
    max_size = var.eks_node_max_size
  } : null
}
