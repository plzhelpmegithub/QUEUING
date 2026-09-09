# =============================================================================
# Route 53 — DNS 관리
# =============================================================================
#
# [역할]
# 도메인(예: queuing.kr)의 DNS를 AWS에서 관리한다.
# 서브도메인별로 CloudFront(프론트엔드), ALB(API)로 트래픽을 라우팅.
#
# [DNS 레코드 구성]
#   www.queuing.kr    → CloudFront (프론트엔드)
#   queuing.kr        → CloudFront (루트 도메인도 프론트엔드)
#   api.queuing.kr    → ALB (API 백엔드)
#   _xxx.queuing.kr   → ACM 인증서 DNS 검증용 CNAME (자동 생성)
#
# [사전 작업]
#   도메인 구매처(hosting.kr 등)에서 네임서버를 Route 53의 NS 4개로 변경해야 함.
#   NS 레코드는 Hosted Zone 생성 시 자동 생성됨.
#
# [비용]
#   Hosted Zone: 월 $0.50 고정 (프리티어 아님)
#   쿼리: 100만 쿼리당 $0.40 (일반적으로 $1 미만)
#
# count 조건: domain_name이 설정된 경우에만 모든 Route 53 리소스 생성.
# =============================================================================


# -----------------------------------------------------------------------------
# [Hosted Zone] 도메인의 DNS 레코드를 관리하는 영역.
#
# 생성 후 자동으로 NS(네임서버) 레코드 4개와 SOA 레코드가 만들어진다.
# 이 NS 4개를 도메인 구매처의 네임서버 설정에 입력해야 한다.
#
# ⚠️ 기존에 MX(이메일), TXT(SPF/DKIM) 등의 레코드를 쓰고 있었다면
#     Route 53에도 동일하게 추가해야 이메일이 정상 작동한다.
# -----------------------------------------------------------------------------
resource "aws_route53_zone" "main" {
  count = var.domain_name != "" ? 1 : 0

  name    = var.domain_name
  comment = "${local.name_prefix} DNS 관리"

  tags = { Name = "${local.name_prefix}-dns-zone" }
}


# =============================================================================
# ACM 인증서 DNS 검증 레코드
# =============================================================================
#
# ACM 인증서 발급 시 DNS 검증용 CNAME 레코드를 Route 53에 자동 등록한다.
# 이 레코드가 있으면 ACM이 도메인 소유권을 확인하고 인증서를 발급.
# 인증서 갱신 시에도 이 레코드가 유지되면 자동 갱신됨.
# =============================================================================
resource "aws_route53_record" "acm_frontend_validation" {
  for_each = var.domain_name != "" ? {
    for dvo in aws_acm_certificate.frontend[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  zone_id         = aws_route53_zone.main[0].zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
  allow_overwrite = true
}


# =============================================================================
# ALB ACM 인증서 DNS 검증 레코드
# =============================================================================
#
# ALB용 ACM 인증서(api.queuing.kr) 발급 시 DNS 검증용 CNAME 등록.
# CloudFront용(us-east-1)과 별도로, ALB용(ap-northeast-2) 인증서도 자동 발급.
# =============================================================================
resource "aws_route53_record" "acm_alb_validation" {
  for_each = var.domain_name != "" ? {
    for dvo in aws_acm_certificate.alb[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  zone_id         = aws_route53_zone.main[0].zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
  allow_overwrite = true
}


# =============================================================================
# 프론트엔드 DNS 레코드 — CloudFront 연결
# =============================================================================

# -----------------------------------------------------------------------------
# [A 레코드 — www 서브도메인] www.queuing.kr → CloudFront
#
# Alias 레코드: CNAME과 달리 Zone Apex(루트 도메인)에서도 사용 가능.
# DNS 쿼리 비용도 없음 (Route 53 → CloudFront 간 Alias는 무료).
#
# evaluate_target_health : false = CloudFront는 자체 헬스체크가 있으므로
#                          Route 53의 헬스체크는 불필요.
# -----------------------------------------------------------------------------
resource "aws_route53_record" "frontend_a" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = aws_route53_zone.main[0].zone_id
  name    = "${var.frontend_subdomain}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

# --- AAAA 레코드 (IPv6) — www.queuing.kr → CloudFront ---
# CloudFront는 IPv6를 지원하므로 AAAA 레코드도 등록.
resource "aws_route53_record" "frontend_aaaa" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = aws_route53_zone.main[0].zone_id
  name    = "${var.frontend_subdomain}.${var.domain_name}"
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

# -----------------------------------------------------------------------------
# [A 레코드 — 루트 도메인] queuing.kr → CloudFront
#
# www 없이 접속해도 CloudFront로 연결.
# CloudFront의 aliases에 루트 도메인이 포함되어 있어야 함.
# -----------------------------------------------------------------------------
resource "aws_route53_record" "frontend_root_a" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = aws_route53_zone.main[0].zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

# --- AAAA 레코드 (IPv6) — 루트 도메인 → CloudFront ---
resource "aws_route53_record" "frontend_root_aaaa" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = aws_route53_zone.main[0].zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}


# =============================================================================
# API DNS 레코드 — ALB 연결
# =============================================================================

# -----------------------------------------------------------------------------
# [A 레코드 — api 서브도메인] api.queuing.kr → ALB
#
# 프론트엔드 코드에서 API base URL로 사용.
# 예: fetch("https://api.queuing.kr/seats/available")
#
# ALB도 Alias 레코드로 연결 (CNAME보다 효율적, Zone Apex 지원).
# -----------------------------------------------------------------------------
resource "aws_route53_record" "api_a" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = aws_route53_zone.main[0].zone_id
  name    = "${var.api_subdomain}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = true
  }
}

# --- AAAA 레코드 (IPv6) — API 서브도메인 → ALB ---
resource "aws_route53_record" "api_aaaa" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = aws_route53_zone.main[0].zone_id
  name    = "${var.api_subdomain}.${var.domain_name}"
  type    = "AAAA"

  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = true
  }
}
