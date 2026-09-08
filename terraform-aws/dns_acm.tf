# ──────────────────────────────────────────────
# 도메인 · TLS 인증서 (queuing.kr)
#
# ■ 왜 필요한가
# 프론트엔드는 CloudFront라 https:// 로 서비스된다. 그런데 브라우저는
# https:// 페이지에서 ws:// 연결을 여는 것을 Mixed Content로 차단한다.
# 즉 ALB에 TLS가 없으면 C파트 WebSocket(채팅·좌석 실시간 갱신)이
# 통째로 동작하지 않는다. 그래서 wss:// 를 쓰려면 ALB에 443이 필요하다.
#
# ■ 인증서가 두 장인 이유
#   - CloudFront용 : 반드시 us-east-1 (AWS 제약, 우회 불가)
#   - ALB용        : 리소스와 같은 리전(ap-northeast-2)
# 같은 도메인이라도 리전이 다르면 인증서를 공유할 수 없다.
#
# ■ 도메인 구조
#   queuing.kr        → CloudFront → S3 (프론트엔드)
#   www.queuing.kr    → 위와 동일
#   api.queuing.kr    → ALB → EKS NodePort (A파트 API + C파트 WebSocket)
#
# ■ .kr 도메인 주의
# Route 53은 .kr 등록을 지원하지 않는다. 국내 등록기관(가비아 등)에서 산 뒤
# 아래 호스팅 영역의 네임서버 4개를 등록기관 관리 화면에 넣어야 한다.
# 반영에 보통 몇 분 ~ 최대 48시간이 걸리고, 그 전까지 ACM 검증이 끝나지 않아
# terraform apply 가 인증서 대기에서 멈춘다. 이건 정상이다.
# ──────────────────────────────────────────────

locals {
  frontend_domain = var.frontend_domain != "" ? var.frontend_domain : var.domain_name
  api_domain      = "${var.api_subdomain}.${var.domain_name}"
  www_domain      = "www.${var.domain_name}"
  zone_id         = var.create_route53_zone ? aws_route53_zone.main[0].zone_id : data.aws_route53_zone.existing[0].zone_id
}

# ── 호스팅 영역 ──

resource "aws_route53_zone" "main" {
  count = var.create_route53_zone ? 1 : 0
  name  = var.domain_name

  tags = { Name = "${var.project}-zone" }
}

data "aws_route53_zone" "existing" {
  count        = var.create_route53_zone ? 0 : 1
  name         = var.domain_name
  private_zone = false
}

# ──────────────────────────────────────────────
# ACM ① ALB용 — 서울 리전
# api.queuing.kr 하나만 있으면 된다.
# ──────────────────────────────────────────────

resource "aws_acm_certificate" "alb" {
  domain_name       = local.api_domain
  validation_method = "DNS"

  tags = { Name = "${var.project}-cert-alb" }

  lifecycle { create_before_destroy = true }
}

resource "aws_route53_record" "alb_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.alb.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id         = local.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "alb" {
  certificate_arn         = aws_acm_certificate.alb.arn
  validation_record_fqdns = [for r in aws_route53_record.alb_cert_validation : r.fqdn]
}

# ──────────────────────────────────────────────
# ACM ② CloudFront용 — us-east-1
# 루트 도메인과 www 를 함께 담는다.
# ──────────────────────────────────────────────

resource "aws_acm_certificate" "cloudfront" {
  provider = aws.us_east_1

  domain_name               = local.frontend_domain
  subject_alternative_names = [local.www_domain]
  validation_method         = "DNS"

  tags = { Name = "${var.project}-cert-cloudfront" }

  lifecycle { create_before_destroy = true }
}

resource "aws_route53_record" "cloudfront_cert_validation" {
  # 루트와 www 의 검증 레코드가 같은 이름으로 겹칠 수 있어 for_each 키로 중복을 제거한다.
  for_each = {
    for dvo in aws_acm_certificate.cloudfront.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id         = local.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "cloudfront" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.cloudfront.arn
  validation_record_fqdns = [for r in aws_route53_record.cloudfront_cert_validation : r.fqdn]
}

# ──────────────────────────────────────────────
# DNS 레코드
# ALB와 CloudFront는 IP가 고정이 아니라서 A 레코드 대신 별칭(alias)을 쓴다.
# 별칭은 Route 53 안에서만 해석되고 조회 요금도 들지 않는다.
# ──────────────────────────────────────────────

resource "aws_route53_record" "api" {
  zone_id = local.zone_id
  name    = local.api_domain
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "frontend" {
  zone_id = local.zone_id
  name    = local.frontend_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "frontend_www" {
  zone_id = local.zone_id
  name    = local.www_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}
