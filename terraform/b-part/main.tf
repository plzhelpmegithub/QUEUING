# --- Network & EKS: NOT deployed here ---
# Team runs a single shared VPC + EKS cluster. B-part work happens in the
# "queuing-b" namespace on that shared cluster (kubectl/helm directly,
# not via this terraform). Module code is kept on disk in case a truly
# isolated environment is needed later - just uncomment and re-apply.
#
# module "network" {
#   source = "./modules/network"
#   project_name = "queuing-b"
#   vpc_cidr     = var.vpc_cidr
#   az_count     = var.az_count
# }
#
# module "eks" {
#   source = "./modules/eks"
#   project_name       = var.project_name
#   aws_account_id     = var.aws_account_id
#   private_subnet_ids = module.network.private_subnet_ids
#   public_subnet_ids  = module.network.public_subnet_ids
# }

module "sqs" {
  source = "./modules/sqs"

  project_name = var.project_name
}

module "db" {
  source = "./modules/db"

  project_name = var.project_name
}

# ElastiCache: using team-shared queuing-redis, no module needed here.
