# Network/EKS outputs removed along with the modules (see main.tf).
# Uncomment if those modules are re-enabled later.
#
# output "vpc_id" {
#   value = module.network.vpc_id
# }
# output "public_subnet_ids" {
#   value = module.network.public_subnet_ids
# }
# output "private_subnet_ids" {
#   value = module.network.private_subnet_ids
# }
# output "eks_cluster_name" {
#   value = module.eks.cluster_name
# }
# output "eks_cluster_endpoint" {
#   value = module.eks.cluster_endpoint
# }
# output "eks_oidc_provider_arn" {
#   value = module.eks.oidc_provider_arn
# }

output "sqs_queue_url" {
  value = module.sqs.queue_url
}

output "sqs_queue_arn" {
  value = module.sqs.queue_arn
}

output "sqs_dlq_url" {
  value = module.sqs.dlq_url
}

output "waiting_queue_table_name" {
  value = module.db.waiting_queue_table_name
}

output "cancel_allocations_table_name" {
  value = module.db.cancel_allocations_table_name
}

output "cancellation_link_table_name" {
  value = module.db.cancellation_link_table_name
}
