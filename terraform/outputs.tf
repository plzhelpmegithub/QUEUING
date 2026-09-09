# =============================================================================
# Outputs — terraform apply 완료 후 표시되는 핵심 정보
# =============================================================================
#
# [역할]
# terraform apply 실행 후 터미널에 출력되는 값들.
# 이후 작업(CloudFront Origin 설정, DNS 설정, DB 마이그레이션 등)에 필요한
# 엔드포인트와 식별자를 한눈에 확인할 수 있다.
#
# [사용 방법]
#   터미널에서:  terraform output alb_dns_name
#   스크립트에서: $(terraform output -raw alb_dns_name)
#   JSON으로:    terraform output -json
# =============================================================================


# =============================================================================
# 네트워크 — VPC, Subnet ID
# =============================================================================

# VPC ID: 다른 리소스(Lambda, Bastion 등)를 같은 VPC에 배치할 때 사용.
output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

# Private Subnet IDs: EKS Worker Node, Redis가 배치된 서브넷.
output "private_subnet_ids" {
  description = "Private Subnet IDs (EKS, Redis)"
  value       = aws_subnet.private[*].id
}

# Public Subnet IDs: ALB가 배치된 서브넷.
output "public_subnet_ids" {
  description = "Public Subnet IDs (ALB)"
  value       = aws_subnet.public[*].id
}


# =============================================================================
# ALB — 로드밸런서 DNS 정보
# =============================================================================

# ALB DNS Name: API 접속 주소.
# [사용처]
#   1. CloudFront Origin 설정 시 이 DNS를 Origin Domain으로 지정
#   2. 테스트 시 직접 접속: curl http://<alb_dns_name>/health
#   3. Route53 CNAME 또는 Alias 레코드의 대상
output "alb_dns_name" {
  description = "ALB DNS Name — CloudFront Origin 또는 직접 접속용"
  value       = aws_lb.api.dns_name
}

# ALB Hosted Zone ID: Route53에서 ALB를 Alias 레코드로 등록할 때 필요.
output "alb_zone_id" {
  description = "ALB Hosted Zone ID — Route53 Alias 레코드 생성 시 필요"
  value       = aws_lb.api.zone_id
}


# =============================================================================
# EKS — 클러스터 정보
# =============================================================================

# EKS 클러스터 이름: Helm, kubectl 명령에서 사용.
output "eks_cluster_name" {
  description = "EKS 클러스터 이름"
  value       = aws_eks_cluster.main.name
}

# EKS API 엔드포인트: kubectl이 연결하는 주소.
output "eks_cluster_endpoint" {
  description = "EKS API Server 엔드포인트"
  value       = aws_eks_cluster.main.endpoint
}

# kubeconfig 설정 명령어: 이 명령을 실행하면 kubectl이 EKS에 연결됨.
# 예: aws eks update-kubeconfig --name queuing-prod-cluster --region ap-northeast-2
output "eks_kubeconfig_command" {
  description = "kubeconfig 설정 명령어 (복사해서 실행)"
  value       = "aws eks update-kubeconfig --name ${aws_eks_cluster.main.name} --region ${var.aws_region}"
}

# Node Group 이름: 노드 상태 확인 시 사용.
# 예: aws eks describe-nodegroup --cluster-name <cluster> --nodegroup-name <name>
output "eks_node_group_name" {
  description = "EKS Managed Node Group 이름"
  value       = aws_eks_node_group.main.node_group_name
}

# OIDC Provider URL: IRSA(IAM Roles for Service Accounts) 설정 시 참조.
output "eks_oidc_provider_url" {
  description = "EKS OIDC Provider URL (IRSA 설정용)"
  value       = aws_eks_cluster.main.identity[0].oidc[0].issuer
}


# =============================================================================
# ElastiCache — Redis Multi-AZ 엔드포인트
# =============================================================================

# Redis Primary 엔드포인트: "호스트" 형식.
# Multi-AZ 구성에서 Primary 장애 시 자동으로 새 Primary를 가리킴.
# K8s ConfigMap의 REDIS_HOST에 이 값을 설정.
output "redis_primary_endpoint" {
  description = "ElastiCache Redis Primary 엔드포인트 (쓰기용)"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

# Redis Reader 엔드포인트: 읽기 전용 트래픽을 Replica로 분산.
# 읽기가 많은 워크로드(가격 스냅샷 조회 등)에서 사용하면 Primary 부하 감소.
output "redis_reader_endpoint" {
  description = "ElastiCache Redis Reader 엔드포인트 (읽기 분산용)"
  value       = aws_elasticache_replication_group.redis.reader_endpoint_address
}


# =============================================================================
# CloudWatch — 로그 그룹
# =============================================================================

# 로그 그룹 이름: AWS 콘솔에서 로그 검색, CLI에서 로그 조회 시 사용.
# 예: aws logs tail <log_group> --follow
output "cloudwatch_log_group" {
  description = "API 로그 그룹"
  value       = aws_cloudwatch_log_group.api.name
}


# =============================================================================
# 프론트엔드 — S3 + CloudFront
# =============================================================================

# S3 버킷 이름: 프론트엔드 빌드 결과물 업로드 대상.
# 사용법: aws s3 sync dist/ s3://<bucket_name>/ --delete
output "frontend_bucket_name" {
  description = "프론트엔드 S3 버킷 이름"
  value       = aws_s3_bucket.frontend.bucket
}

# CloudFront 배포 도메인: 커스텀 도메인 없을 때 직접 접속용.
# 예: https://d1234567890.cloudfront.net
output "cloudfront_domain_name" {
  description = "CloudFront 배포 도메인 (기본 URL)"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

# CloudFront 배포 ID: 캐시 무효화(Invalidation) 시 필요.
# 사용법: aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
output "cloudfront_distribution_id" {
  description = "CloudFront 배포 ID (캐시 무효화용)"
  value       = aws_cloudfront_distribution.frontend.id
}


# =============================================================================
# Route 53 — DNS (domain_name 설정 시에만 출력)
# =============================================================================

# Hosted Zone NS 레코드: 도메인 구매처에 등록해야 할 네임서버 4개.
# ⚠️ 이 NS를 도메인 구매처(hosting.kr 등)의 네임서버 설정에 입력해야 한다.
output "route53_nameservers" {
  description = "Route 53 네임서버 (도메인 구매처에 등록)"
  value       = var.domain_name != "" ? aws_route53_zone.main[0].name_servers : []
}

# 프론트엔드 URL: 브라우저에서 접속할 주소.
output "frontend_url" {
  description = "프론트엔드 접속 URL"
  value       = var.domain_name != "" ? "https://${var.frontend_subdomain}.${var.domain_name}" : "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

# API URL: 프론트엔드 코드에서 API base URL로 사용.
output "api_url" {
  description = "API 접속 URL"
  value       = var.domain_name != "" ? "https://${var.api_subdomain}.${var.domain_name}" : "http://${aws_lb.api.dns_name}"
}


# =============================================================================
# WAF — Web Application Firewall
# =============================================================================

# WAF Web ACL ARN: CloudFront에 연결된 WAF 식별자.
output "waf_web_acl_arn" {
  description = "WAF Web ACL ARN (CloudFront 연동)"
  value       = var.waf_enabled ? aws_wafv2_web_acl.cloudfront[0].arn : "WAF 비활성화"
}
