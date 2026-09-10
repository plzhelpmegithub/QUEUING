# This account blocks iam:GetRole/ListAttachedUserPolicies for students,
# so we cannot look roles up via data source. An admin pre-provisioned
# the roles this project needs (confirmed via `aws iam list-roles`,
# which IS allowed) - build their ARNs directly instead of reading them.
locals {
  cluster_role_arn = "arn:aws:iam::${var.aws_account_id}:role/queuing-eks-cluster-role"
  node_role_arn     = "arn:aws:iam::${var.aws_account_id}:role/queuing-eks-node-role"
}
