# ──────────────────────────────────────────────
# EKS Access Entry — "기능이 파트별로 나뉘어 있다"를 K8s 네임스페이스
# 단위로 반영. 각 팀원은 자기 파트 네임스페이스(queuing-a/b/c/d)에서만
# 배포/수정 가능하고, 다른 파트 네임스페이스는 손댈 수 없음.
#
# 네임스페이스 자체(queuing-a 등)는 Terraform이 아니라 클러스터 생성 후
# kubectl로 한 번만 만들면 됨 (아래 참고) — Terraform에서 kubernetes
# provider까지 얹으면 최초 apply 때 순서 문제가 생기기 쉬워서 일부러 뺐음.
#
#   aws eks update-kubeconfig --region ap-northeast-2 --name queuing-eks
#
#   # 온프레미스에서 실제로 쓰는 이름을 그대로 만든다 (유추하지 않는다)
#   kubectl create namespace queuing-a    # A 찬규
#   kubectl create namespace queuing-b    # B 건아 (확인 완료)
#   kubectl create namespace realtime     # C 지예 (queuing-c 가 아니다 — 변경 안 하기로 결정)
#   # queuing-c 는 만들지 않는다 (2026-09-09 결정). 권한만 미리 부여돼 있다
#   kubectl create namespace queuing-d    # D 예지 (카운터)
#   kubectl create namespace monitoring   # D 예지 (Prometheus)
#   kubectl create namespace redis        # D 예지 (redis-counter)
#   kubectl create namespace argocd       # 공용 (배포 파이프라인)
#
# ⚠️ 네임스페이스를 kubectl 로 먼저 만들면 helm 설치가 실패한다 (2026-09-09 실제로 겪음)
#
# 일부 차트(A파트 redis-api-chart 등)는 templates/namespace.yaml 로 네임스페이스를
# 직접 만든다. kubectl create namespace 로 미리 만들어두면 helm 이 이렇게 거부한다.
#
#   Error: unable to continue with install: Namespace "queuing-a" ... exists and
#   cannot be imported into the current release: invalid ownership metadata;
#   label validation error: missing key "app.kubernetes.io/managed-by"
#
# helm 이 인수하도록 라벨과 어노테이션을 붙여주면 된다.
#
#   kubectl label namespace queuing-a app.kubernetes.io/managed-by=Helm --overwrite
#   kubectl annotate namespace queuing-a #     meta.helm.sh/release-name=api meta.helm.sh/release-namespace=queuing-a --overwrite
#
# 그다음 helm upgrade --install 을 다시 실행한다.
#
# ■ 권한이 실제로 붙었는지 각자 확인 (AWS 는 철자를 검증하지 않는다)
#   kubectl auth can-i create deployment -n <자기 네임스페이스>   # yes 여야 함
#   kubectl auth can-i create deployment -n <남의 네임스페이스>   # no 여야 함
#   kubectl auth can-i get secrets -A                            # no 여야 함
#
# ■ 시크릿 권한 정리 (AWS 공식 정책 표 기준)
#   AmazonEKSViewPolicy (클러스터 전체) → secrets 가 목록에 없다. 못 읽는다.
#   AmazonEKSEditPolicy (자기 네임스페이스) → secrets 읽기·쓰기 모두 포함한다.
#   즉 남의 파트 시크릿은 못 보고, 자기 네임스페이스 것만 본다.
#   온프레미스에서 예지님 ClusterRole 에서 secrets 를 뺀 것과 같은 수준이다
#   (shared-infra/yeji-rbac.yaml).
#   https://docs.aws.amazon.com/eks/latest/userguide/access-policy-permissions.html
# ──────────────────────────────────────────────

locals {
  # 테라폼이 만든 사용자가 있으면 그 ARN 을, 없으면 계정 ID + 사용자 이름으로
  # ARN 을 조립한다. 콘솔에서 직접 만든 사용자를 가리키기 위한 것이다.
  #
  # ⚠️ 삼항 연산자로 aws_iam_user.team[...] 을 쓰지 않는다.
  # Terraform 은 양쪽 branch 를 모두 평가하므로, 사용자를 만들지 않는 경우
  # 빈 map 을 인덱싱해 plan 이 실패한다. lookup 의 기본값으로 처리한다.
  created_team_arns = { for k, u in aws_iam_user.team : k => u.arn }

  # terraform apply 를 실행하는 사람은 제외한다.
  # bootstrap_cluster_creator_admin_permissions = true 라서 EKS 가 그 사람에게
  # 이미 클러스터 관리자 Access Entry 를 붙여준다. Access Entry 는
  # (클러스터, principal ARN) 으로 유일하므로 같은 사람에게 또 만들면 충돌한다.
  access_entry_members = [
    for m in var.team_members : m
    if m.username != var.terraform_operator_username
  ]

  team_user_arns = {
    for m in var.team_members : m.username => lookup(
      local.created_team_arns,
      m.username,
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:user/${m.username}"
    )
  }
}

resource "aws_eks_access_entry" "team" {
  for_each      = { for m in local.access_entry_members : m.username => m }
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = local.team_user_arns[each.key]
  type          = "STANDARD"
}

# 자기 파트 네임스페이스 안에서는 뭐든 할 수 있는 권한 (Edit 정책 = 리소스
# 생성/수정/삭제 가능, RBAC 자체를 바꾸는 것만 제외)
resource "aws_eks_access_policy_association" "team_namespace_edit" {
  for_each      = { for m in local.access_entry_members : m.username => m }
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = local.team_user_arns[each.key]
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSEditPolicy"

  access_scope {
    type = "namespace"

    # ⚠️ "queuing-${each.value.part}" 로 유추하던 것을 고쳤다.
    # C파트는 realtime, D파트는 monitoring/redis/queuing-d 를 쓰고 있어서
    # 유추한 이름이 실제와 달랐다. 하나의 연결에 여러 네임스페이스를 넣을 수 있다.
    namespaces = each.value.namespaces
  }

  depends_on = [aws_eks_access_entry.team]
}

# 다른 파트가 뭘 하고 있는지는 전체 클러스터에서 보기(읽기)만 가능하게
# (본인 네임스페이스 밖은 조회만, 수정 불가)
resource "aws_eks_access_policy_association" "team_cluster_view" {
  for_each      = { for m in local.access_entry_members : m.username => m }
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = local.team_user_arns[each.key]
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSViewPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_access_entry.team]
}
