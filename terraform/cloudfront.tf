# =============================================================================
# CloudFront — CDN + HTTPS + 캐싱 (프론트엔드 배포)
# =============================================================================
#
# [역할]
# S3에 저장된 프론트엔드 정적 파일을 전 세계 엣지 로케이션에서 빠르게 서빙.
# HTTPS 종단(TLS Termination), 캐싱, Gzip/Brotli 압축을 자동 처리.
#
# [트래픽 흐름]
#   사용자 → CloudFront 엣지(캐시 히트) → 즉시 응답
#                        (캐시 미스) → S3 Origin → 파일 가져와서 캐싱 후 응답
#
# [구성 요소]
#   1. ACM 인증서 (us-east-1)     : HTTPS용 SSL 인증서 자동 발급·갱신
#   2. Origin Access Control (OAC) : S3 비공개 + CloudFront만 접근 허용
#   3. CloudFront Distribution     : CDN 배포 (캐싱, 압축, SPA 에러 처리)
#
# [비용 (프리티어)]
#   - 1TB 전송 + 1,000만 요청/월 무료 (12개월)
#   - 이후 약 $0.085/GB (아시아 리전)
# =============================================================================


# =============================================================================
# [1] ACM 인증서 — HTTPS용 SSL 인증서 (us-east-1 필수)
# =============================================================================
#
# ⚠️ CloudFront는 us-east-1(N. Virginia) 리전의 ACM 인증서만 인식한다.
# 따라서 별도 provider(aws.us_east_1)를 사용하여 us-east-1에 생성.
#
# [DNS 검증 방식]
#   ACM이 제공하는 CNAME 레코드를 Route 53에 등록하면 자동으로 검증 완료.
#   인증서 갱신도 DNS 레코드가 유지되는 한 자동 갱신.
#
# domain_name               : 프론트엔드 도메인 (예: www.queuing.kr)
# subject_alternative_names : 추가 도메인. 루트 도메인도 포함하면
#                             www 없이 접속해도 HTTPS 가능.
#
# count : domain_name이 설정된 경우에만 생성.
# =============================================================================
resource "aws_acm_certificate" "frontend" {
  count    = var.domain_name != "" ? 1 : 0
  provider = aws.us_east_1

  domain_name               = "${var.frontend_subdomain}.${var.domain_name}"
  subject_alternative_names = [var.domain_name]
  validation_method         = "DNS"

  tags = { Name = "${local.name_prefix}-frontend-cert" }

  lifecycle {
    create_before_destroy = true
  }
}

# --- ACM 인증서 DNS 검증 완료 대기 ---
# Route 53에 검증용 CNAME이 등록된 후, ACM이 검증을 완료할 때까지 대기.
# 보통 몇 분 이내에 완료. 완료 후 인증서 상태가 "Issued"로 변경.
resource "aws_acm_certificate_validation" "frontend" {
  count    = var.domain_name != "" ? 1 : 0
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.frontend[0].arn
  validation_record_fqdns = [for record in aws_route53_record.acm_frontend_validation : record.fqdn]
}


# =============================================================================
# [2] Origin Access Control (OAC) — S3 비공개 접근 제어
# =============================================================================
#
# [OAI(Origin Access Identity)와의 차이]
#   OAI는 레거시 방식. OAC는 2022년부터 권장되는 새 방식:
#     - SSE-KMS 암호화 지원
#     - 모든 리전의 S3 버킷 지원
#     - AWS Signature Version 4 사용 (보안 강화)
#
# signing_behavior : "always" = 모든 요청에 서명 첨부 (S3가 이 서명으로 인증)
# signing_protocol : "sigv4"  = AWS Signature v4 프로토콜
# =============================================================================
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${local.name_prefix}-frontend-oac"
  description                       = "S3 프론트엔드 버킷 OAC"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}


# =============================================================================
# [3] CloudFront Distribution — CDN 배포
# =============================================================================
#
# [주요 설정]
#   origin           : S3 버킷을 Origin으로 지정 + OAC 연결
#   default_cache_behavior : 캐시·압축·뷰어 프로토콜 정책
#   custom_error_response  : SPA 라우팅용 403/404 → index.html 매핑
#   viewer_certificate     : HTTPS 인증서 (ACM 또는 CloudFront 기본)
#   default_root_object    : "/" 접속 시 index.html 반환
#
# [SPA 에러 페이지 설정 이유]
#   React/Vue/Vite 등 SPA는 클라이언트 라우팅을 사용한다.
#   /about, /queue 같은 경로에 직접 접속하면 S3에 해당 파일이 없어 403/404 발생.
#   이때 index.html을 반환하면 SPA 라우터가 올바른 페이지를 렌더링한다.
# =============================================================================
resource "aws_cloudfront_distribution" "frontend" {
  comment             = "${local.name_prefix} 프론트엔드"
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_200"
  # PriceClass_200 = 북미, 유럽, 아시아, 아프리카 엣지 사용 (남미 제외)
  # PriceClass_100 = 북미, 유럽만 (가장 저렴)
  # PriceClass_All = 전 세계 모든 엣지 (가장 비쌈)

  # 커스텀 도메인이 설정된 경우 aliases에 추가
  aliases = var.domain_name != "" ? [
    "${var.frontend_subdomain}.${var.domain_name}",
    var.domain_name
  ] : []

  # ---------------------------------------------------------------------------
  # [Origin] S3 버킷을 소스로 지정.
  #
  # domain_name            : S3 버킷의 리전별 도메인 (REST API 엔드포인트)
  # origin_id              : 이 배포 내에서 Origin을 식별하는 고유 ID
  # origin_access_control_id : OAC 연결 → S3 비공개 버킷 접근 가능
  # ---------------------------------------------------------------------------
  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # ---------------------------------------------------------------------------
  # [Default Cache Behavior] 모든 요청에 적용되는 기본 캐시 동작.
  #
  # allowed_methods  : GET/HEAD만 허용 (정적 파일 서빙이므로 POST 등 불필요)
  # cached_methods   : GET/HEAD 응답을 캐싱
  # compress         : true = Gzip/Brotli 자동 압축 (JS/CSS 크기 60~80% 감소)
  # viewer_protocol_policy : redirect-to-https = HTTP → HTTPS 자동 리다이렉트
  #
  # [TTL 설정]
  #   default_ttl : 86400초 (24시간) = 캐시 기본 유지 시간
  #   min_ttl     : 0초 = Origin의 Cache-Control 헤더를 존중
  #   max_ttl     : 31536000초 (365일) = 최대 캐시 유지 시간
  #
  # [Forwarded Values]
  #   query_string : false = 쿼리 파라미터 무시 (정적 파일이므로 불필요)
  #   cookies forward "none" = 쿠키 전달 안함 (S3에 쿠키가 필요 없음)
  # ---------------------------------------------------------------------------
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-frontend"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    default_ttl = 86400
    min_ttl     = 0
    max_ttl     = 31536000

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  # ---------------------------------------------------------------------------
  # [SPA 에러 페이지] 403/404 → index.html (HTTP 200)
  #
  # S3에 존재하지 않는 경로 요청 시:
  #   /about → S3 403(Access Denied) → CloudFront가 /index.html 반환 (200)
  #   → SPA 라우터가 /about 경로를 클라이언트에서 처리
  #
  # error_caching_min_ttl : 10초 = 에러 응답 캐시 시간 (너무 길면 배포 후 문제)
  # ---------------------------------------------------------------------------
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  # ---------------------------------------------------------------------------
  # [Viewer Certificate] HTTPS 인증서 설정.
  #
  # domain_name이 설정된 경우:
  #   → ACM 인증서 사용 (커스텀 도메인 HTTPS)
  #   → ssl_support_method: "sni-only" = SNI 기반 (추가 비용 없음)
  #   → minimum_protocol_version: TLS 1.2 이상만 허용 (보안)
  #
  # domain_name이 비어있는 경우:
  #   → CloudFront 기본 인증서 사용 (*.cloudfront.net 도메인)
  # ---------------------------------------------------------------------------
  dynamic "viewer_certificate" {
    for_each = var.domain_name != "" ? [1] : []
    content {
      acm_certificate_arn      = aws_acm_certificate_validation.frontend[0].certificate_arn
      ssl_support_method       = "sni-only"
      minimum_protocol_version = "TLSv1.2_2021"
    }
  }

  dynamic "viewer_certificate" {
    for_each = var.domain_name == "" ? [1] : []
    content {
      cloudfront_default_certificate = true
    }
  }

  # ---------------------------------------------------------------------------
  # [Restrictions] 지리적 접근 제한.
  # 현재는 제한 없음 (전 세계 접근 가능). 특정 국가만 허용/차단 가능.
  # ---------------------------------------------------------------------------
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = { Name = "${local.name_prefix}-frontend-cdn" }

  depends_on = [aws_s3_bucket.frontend]
}
