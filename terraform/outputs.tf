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

# Private Subnet IDs: EC2, RDS, Redis가 배치된 서브넷.
output "private_subnet_ids" {
  description = "Private Subnet IDs (EC2, RDS, Redis)"
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
# 컨테이너 이미지 — 현재 배포된 이미지 확인
# =============================================================================

# 현재 EC2에서 실행 중인 Docker 이미지. 배포 확인 시 참조.
output "api_image" {
  description = "현재 EC2에서 실행하는 Docker 이미지"
  value       = "${var.api_image_repo}:${var.api_image_tag}"
}


# =============================================================================
# EC2 Auto Scaling — ASG, Launch Template 정보
# =============================================================================

# ASG 이름: CLI에서 인스턴스 목록 조회, 스케일링 조작 시 사용.
# 예: aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names <asg_name>
output "asg_name" {
  description = "Auto Scaling Group 이름"
  value       = aws_autoscaling_group.api.name
}

# Launch Template ID: 인스턴스 템플릿 수정/버전 관리 시 참조.
# 예: aws ec2 describe-launch-template-versions --launch-template-id <lt_id>
output "launch_template_id" {
  description = "Launch Template ID"
  value       = aws_launch_template.api.id
}

# AMI ID: 현재 사용 중인 AMI 확인.
output "ec2_ami_id" {
  description = "EC2 인스턴스 AMI ID"
  value       = var.ec2_ami_id
}


# =============================================================================
# RDS — 데이터베이스 엔드포인트
# =============================================================================

# RDS 엔드포인트: "호스트:포트" 형식.
# Bastion 또는 SSM을 통해서만 접속 가능 (Private Subnet 배치).
output "rds_endpoint" {
  description = "RDS MariaDB 엔드포인트"
  value       = aws_db_instance.mariadb.endpoint
}


# =============================================================================
# ElastiCache — Redis 엔드포인트
# =============================================================================

# Redis 엔드포인트: "호스트:포트" 형식.
# EC2 User Data에서 자동 주입되므로 수동 설정 불필요.
output "redis_endpoint" {
  description = "ElastiCache Redis 엔드포인트"
  value       = "${aws_elasticache_cluster.redis.cache_nodes[0].address}:${aws_elasticache_cluster.redis.cache_nodes[0].port}"
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
