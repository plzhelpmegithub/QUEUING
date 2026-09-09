# ──────────────────────────────────────────────
# IRSA — ServiceAccount 별 AWS 권한 (IAM Roles for Service Accounts)
#
# ■ 출처: 예지(D) 안. 세 안 중 유일하게 이걸 갖고 있었다.
#
# ■ 왜 필요한가
# IRSA 가 없으면 파드가 AWS 를 호출할 때 노드 인스턴스 역할을 빌려 쓴다.
# 그러면 그 노드에 뜬 모든 파드가 같은 권한을 갖는다 — B파트 워커만 SQS 를
# 읽어야 하는데 A·C·D 파드까지 읽을 수 있게 된다.
#
# OIDC 공급자를 등록하면 쿠버네티스 ServiceAccount 하나하나에 IAM 역할을
# 매달 수 있다. 액세스 키를 파드에 넣을 필요도 없어진다.
#
# ■ 여기서 만드는 역할
#   ebs-csi-controller-sa   EBS 볼륨 생성/연결 (PVC 를 쓰려면 필수)
#   keda-operator           SQS 큐 길이 조회 (B파트 오토스케일링)
# ──────────────────────────────────────────────

data "tls_certificate" "eks" {
  url = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "eks" {
  url             = aws_eks_cluster.main.identity[0].oidc[0].issuer
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks.certificates[0].sha1_fingerprint]

  tags = { Name = "${var.project}-oidc" }
}

locals {
  # "https://oidc.eks.ap-northeast-2.amazonaws.com/id/XXXX" 에서 https:// 를 뗀 것.
  # 신뢰 정책의 조건 키 이름에 이 형태로 들어간다.
  oidc_host = replace(aws_iam_openid_connect_provider.eks.url, "https://", "")
}

# ── EBS CSI 드라이버 ──
#
# EKS 는 EBS CSI 드라이버를 기본 설치하지 않는다. 없으면 PVC 가 영원히 Pending
# 상태로 남는다. 온프레미스에서는 hostPath PV 를 손으로 만들어 썼지만
# (그러다 Grafana 볼륨이 마운트 타임아웃으로 실패했다) AWS 에서는 이 드라이버가
# EBS 볼륨을 자동으로 만들어 붙인다.

data "aws_iam_policy_document" "ebs_csi_assume" {
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
      values   = ["system:serviceaccount:kube-system:ebs-csi-controller-sa"]
    }
  }
}

resource "aws_iam_role" "ebs_csi" {
  name               = "${var.project}-ebs-csi-role"
  assume_role_policy = data.aws_iam_policy_document.ebs_csi_assume.json
}

resource "aws_iam_role_policy_attachment" "ebs_csi" {
  role       = aws_iam_role.ebs_csi.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
}

resource "aws_eks_addon" "ebs_csi" {
  cluster_name             = aws_eks_cluster.main.name
  addon_name               = "aws-ebs-csi-driver"
  service_account_role_arn = aws_iam_role.ebs_csi.arn

  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [aws_eks_node_group.main]

  tags = { Name = "${var.project}-addon-ebs-csi" }
}

# ── KEDA (B파트 SQS 오토스케일링) ──
#
# 온프레미스에서는 LocalStack 에 더미 자격증명("test"/"test")을 Secret 으로 넣고
# TriggerAuthentication 으로 참조했다. AWS 에서는 그 방식을 쓸 필요가 없다 —
# KEDA 오퍼레이터의 ServiceAccount 에 이 역할을 매달면 키 없이 SQS 를 읽는다.
#
# 적용: KEDA 설치 후 ServiceAccount 에 어노테이션을 붙인다.
#   kubectl -n keda annotate sa keda-operator \
#     eks.amazonaws.com/role-arn=$(terraform output -raw keda_role_arn)
#   kubectl -n keda rollout restart deploy keda-operator

data "aws_iam_policy_document" "keda_assume" {
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
      values   = ["system:serviceaccount:keda:keda-operator"]
    }
  }
}

resource "aws_iam_role" "keda" {
  name               = "${var.project}-keda-role"
  assume_role_policy = data.aws_iam_policy_document.keda_assume.json
}

resource "aws_iam_role_policy" "keda_sqs" {
  name = "${var.project}-keda-sqs-read"
  role = aws_iam_role.keda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      # 큐 길이를 읽는 데 필요한 최소 권한. 메시지를 지우거나 보낼 수는 없다.
      Action   = ["sqs:GetQueueAttributes", "sqs:GetQueueUrl"]
      Resource = [aws_sqs_queue.resale.arn, aws_sqs_queue.resale_dlq.arn]
    }]
  })
}
