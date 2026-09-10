resource "aws_eks_cluster" "this" {
  name     = "${var.project_name}-eks"
  role_arn = local.cluster_role_arn
  version  = var.cluster_version

  vpc_config {
    subnet_ids = concat(var.private_subnet_ids, var.public_subnet_ids)
  }

  tags = {
    Name = "${var.project_name}-eks"
  }
}

resource "aws_eks_node_group" "this" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "${var.project_name}-workers"
  node_role_arn   = local.node_role_arn
  subnet_ids      = var.private_subnet_ids

  instance_types = var.node_instance_types

  scaling_config {
    desired_size = var.desired_size
    min_size     = var.min_size
    max_size     = var.max_size
  }

  tags = {
    Name = "${var.project_name}-workers"
  }
}

# OIDC provider - lets Kubernetes service accounts assume IAM roles
# (IRSA). KEDA's SQS scaler will use this later to read queue depth
# without needing broad node-level IAM permissions.
# NOTE: if this also fails with AccessDenied (iam:CreateOpenIDConnectProvider),
# check whether one already exists: aws iam list-open-id-connect-providers
data "tls_certificate" "eks" {
  url = aws_eks_cluster.this.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "eks" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.this.identity[0].oidc[0].issuer
}
