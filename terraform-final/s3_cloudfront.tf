# ──────────────────────────────────────────────
# S3 + CloudFront — 프론트엔드 정적 호스팅
# ──────────────────────────────────────────────

resource "aws_s3_bucket" "frontend" {
  bucket        = "${var.project}-frontend-${data.aws_caller_identity.current.account_id}"
  force_destroy = true

  tags = { Name = "${var.project}-frontend" }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.project}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  default_root_object = "index.html"
  price_class         = "PriceClass_200"

  aliases = [local.frontend_domain, local.www_domain]

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # ALB의 DNS 이름이 아니라 api.queuing.kr 로 붙는다.
  #   - ALB 80 포트는 이제 443으로 리다이렉트하므로 http-only 로 두면
  #     CloudFront가 301만 받아서 리다이렉트 루프가 생긴다 → https-only 필수
  #   - ALB 인증서는 api.queuing.kr 앞으로 발급되므로, 원본 주소도 그 이름이어야
  #     TLS 핸드셰이크에서 이름 불일치가 나지 않는다
  origin {
    domain_name = local.api_domain
    origin_id   = "alb-backend"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "s3-frontend"

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
    compress               = true
  }

  # WebSocket → ALB
  #
  # 프론트는 wss://.../ws?token=... 으로 붙는다. 쿼리스트링을 뺀 경로가 정확히
  # "/ws" 라서 "/ws/*" 만으로는 매칭되지 않는다. 두 패턴을 모두 등록한다.
  #
  # 참고: WebSocket은 CloudFront를 거치지 않고 wss://api.queuing.kr/ws 로 ALB에
  # 직접 붙이는 편이 지연도 적고 구조도 단순하다. 이 동작은 프론트가 CloudFront
  # 도메인 하나만 알면 되도록 남겨둔 경로다. 둘 중 무엇을 쓸지는 프론트 설정에 달렸다.
  dynamic "ordered_cache_behavior" {
    for_each = ["/ws", "/ws/*"]
    content {
      path_pattern     = ordered_cache_behavior.value
      allowed_methods  = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods   = ["GET", "HEAD"]
      target_origin_id = "alb-backend"

      forwarded_values {
        query_string = true
        headers      = ["Host", "Origin", "Upgrade", "Sec-WebSocket-Key", "Sec-WebSocket-Version", "Sec-WebSocket-Protocol"]
        cookies { forward = "all" }
      }

      viewer_protocol_policy = "redirect-to-https"
      min_ttl                = 0
      default_ttl            = 0
      max_ttl                = 0
    }
  }

  # API 경로들 → ALB
  dynamic "ordered_cache_behavior" {
    for_each = ["/events*", "/seats*", "/auth*", "/queue*", "/rooms*", "/publish/*", "/reservations*"]
    content {
      path_pattern     = ordered_cache_behavior.value
      allowed_methods  = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods   = ["GET", "HEAD"]
      target_origin_id = "alb-backend"

      forwarded_values {
        query_string = true
        headers      = ["Host", "Origin", "Authorization"]
        cookies { forward = "all" }
      }

      viewer_protocol_policy = "redirect-to-https"
      min_ttl                = 0
      default_ttl            = 0
      max_ttl                = 0
    }
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cloudfront.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = { Name = "${var.project}-cdn" }

  # 원본을 api.queuing.kr 이라는 "이름"으로 지정했기 때문에, 그 A 레코드가
  # 먼저 있어야 CloudFront가 원본을 찾을 수 있다. 문자열 참조라 Terraform이
  # 순서를 자동으로 알지 못해서 명시한다.
  depends_on = [aws_route53_record.api]
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
        }
      }
    }]
  })
}
