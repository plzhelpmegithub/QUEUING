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

# ══════════════════════════════════════════════
# 🔴 IRSA 는 파드를 다시 만들어야 적용된다 (2026-09-10 실제로 겪음)
#
# ServiceAccount 에 eks.amazonaws.com/role-arn 어노테이션을 붙여도, 이미 떠
# 있는 파드에는 소급 적용되지 않는다. EKS 의 Pod Identity Webhook 이 파드가
# "생성되는 순간"에만 토큰 볼륨과 AWS_ROLE_ARN 환경변수를 주입하기 때문이다.
#
# ■ 증상 — 역할이 아니라 노드 역할로 떨어진다
#   AccessDenied: User: arn:aws:sts::...:assumed-role/queuing-eks-node-role/i-0c79...
#   is not authorized to perform: sqs:getqueueattributes
#
#   어노테이션은 분명히 붙어 있는데 노드 역할이 찍혀서 한참 헤맨다.
#   SDK 가 IRSA 자격증명을 못 찾고 IMDS(인스턴스 프로파일)로 넘어간 것이다.
#
# ■ 확인 — 파드에 실제로 주입됐는지 본다
#   kubectl -n <ns> get pod <파드> -o jsonpath="{.spec.containers[0].env[?(@.name=='AWS_ROLE_ARN')].value}"
#   kubectl -n <ns> get pod <파드> -o jsonpath="{.spec.volumes[*].name}"
#   → AWS_ROLE_ARN 이 비었거나 aws-iam-token 볼륨이 없으면 주입 실패다.
#
# ■ 해결
#   kubectl -n <ns> rollout restart deploy <디플로이먼트>
#
# ■ 순서를 지키면 애초에 안 겪는다
#   1) ServiceAccount 를 어노테이션과 함께 먼저 만든다 (차트 values 로)
#   2) 그다음 워크로드를 배포한다
#   차트가 SA 를 만드는 구조라 순서를 못 정하면, 배포 -> annotate -> restart
#   순으로 하고 restart 를 빠뜨리지 않는다.
# ══════════════════════════════════════════════
