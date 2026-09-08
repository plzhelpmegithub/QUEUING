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
#   kubectl create namespace queuing-a
#   kubectl create namespace queuing-b
#   kubectl create namespace queuing-c
#   kubectl create namespace queuing-d
# ──────────────────────────────────────────────

resource "aws_eks_access_entry" "team" {
  for_each      = { for m in var.team_members : m.username => m }
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = aws_iam_user.team[each.key].arn
  type          = "STANDARD"
}

# 자기 파트 네임스페이스 안에서는 뭐든 할 수 있는 권한 (Edit 정책 = 리소스
# 생성/수정/삭제 가능, RBAC 자체를 바꾸는 것만 제외)
resource "aws_eks_access_policy_association" "team_namespace_edit" {
  for_each      = { for m in var.team_members : m.username => m }
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = aws_iam_user.team[each.key].arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSEditPolicy"

  access_scope {
    type       = "namespace"
    namespaces = ["queuing-${each.value.part}"]
  }

  depends_on = [aws_eks_access_entry.team]
}

# 다른 파트가 뭘 하고 있는지는 전체 클러스터에서 보기(읽기)만 가능하게
# (본인 네임스페이스 밖은 조회만, 수정 불가)
resource "aws_eks_access_policy_association" "team_cluster_view" {
  for_each      = { for m in var.team_members : m.username => m }
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = aws_iam_user.team[each.key].arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSViewPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_access_entry.team]
}
