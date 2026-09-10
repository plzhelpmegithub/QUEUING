# ──────────────────────────────────────────────
# S3 + CloudFront — 프론트엔드 정적 호스팅
# ──────────────────────────────────────────────

resource "aws_s3_bucket" "frontend" {
  bucket        = "${var.project}-frontend-${data.aws_caller_identity.current.account_id}"
  # 찬규 안에서 가져옴 — 내 쪽은 무조건 true 였다.
  # true 면 버킷에 파일이 있어도 terraform destroy 가 통째로 지운다. 개발 중에는
  # 편하지만 prod 에서 실수 한 번이면 프론트엔드가 사라진다.
  force_destroy = var.environment != "prod"

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

  # WAF 연결 (찬규 안에서 가져옴) — waf.tf 참고.
  # waf_enabled = false 면 null 이 들어가고 WAF 없이 동작한다.
  # one() 을 쓴다 — waf_enabled = false 면 빈 목록이 되고, [0] 이면 거기서 터진다.
  # (삼항은 양쪽을 다 평가한다. 부하 테스트 때 false 로 내릴 자리라 실제로 걸린다)
  # one() 은 빈 목록에 null 을 주고, web_acl_id = null 은 "WAF 없음"을 뜻한다.
  web_acl_id = var.waf_enabled ? one(aws_wafv2_web_acl.cloudfront[*].arn) : null

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
        # ⚠️ "Upgrade" 를 넣으면 안 된다 (2026-09-09 apply 실패로 확인).
        #   InvalidArgument: The parameter Header Name with value Upgrade
        #   is not allowed.
        #
        # CloudFront 공식 문서의 헤더 표에서 Upgrade 는
        # "Caching based on header values is supported: No" 다.
        # CloudFront 가 WebSocket 업그레이드를 직접 처리하기 때문에 화이트리스트에
        # 넣을 수 없고, 넣을 필요도 없다.
        #   https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/RequestAndResponseBehaviorCustomOrigin.html
        #
        # 같은 이유로 Connection, Transfer-Encoding, Cache-Control 등도 금지다.
        # Sec-WebSocket-* 는 "Other-defined headers" 라 허용된다.
        headers      = ["Host", "Origin", "Sec-WebSocket-Key", "Sec-WebSocket-Version", "Sec-WebSocket-Protocol"]
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
    # ⚠️ 프론트엔드가 실제로 호출하는 경로를 전수 조사해서 맞춘 목록이다 (2026-09-09).
    #
    # 프론트는 API 를 상대경로로 부른다 (fetch("/membership/subscribe") 처럼).
    # 개발 중에는 Vite 프록시가 백엔드로 넘겨주지만, S3 + CloudFront 로 배포하면
    # 프록시가 없다. 여기에 없는 경로는 기본 동작(S3)으로 떨어지고, 파일이 없으니
    # 403 -> custom_error_response 로 index.html 이 돌아온다.
    # 즉 API 호출이 에러가 아니라 "HTML 을 JSON 으로 파싱 실패"로 나타나서
    # 원인을 찾기 매우 어렵다.
    #
    # 조사 결과 빠져 있던 것: wishlist(4곳) membership(3) admin(2)
    #                        event(단수, 1) api(1) actuator(1) prom-api(1)
    #
    # ■ 왜 api.queuing.kr 절대경로로 바꾸지 않는가
    # 그러면 queuing.kr -> api.queuing.kr 이 교차 출처가 되어 CORS 설정이 필요하다.
    # 찬규님 코드 주석에도 "Vite 프록시로 호출하므로 CORS 불필요"라고 되어 있다.
    # CloudFront 가 같은 출처에서 ALB 로 넘겨주면 그 전제가 그대로 유지된다.
    #
    # ⚠️ "/event/*" 는 슬래시까지 포함한다. "/event*" 로 두면 "/events" 도 함께
    #    걸려서 위의 "/events*" 와 겹친다.
    # ■ 두 출처를 합친 목록이다 (2026-09-09)
    #   찬규님   : vite.config.js 의 proxy 키 (개발 중 프록시가 넘기던 경로)
    #   지예     : src/ 의 fetch/axios 호출 경로 전수
    # 어느 한쪽만 보면 빠지는 게 있었다.
    #   vite.config.js 에만 있던 것 : /sse /cancel-queue /health
    #     (EventSource 로 부르는 것이라 fetch 정규식에 걸리지 않았다)
    #   호출부에만 있던 것          : /api /actuator /prom-api
    #
    # ⚠️ "/queue*" 는 "/cancel-queue" 를 잡지 못한다. 경로 패턴은 앞에서부터
    #    맞춰보기 때문이다. 둘 다 있어야 한다.
    #
    # ⚠️ "/event/*" 는 슬래시를 포함한다. "/event*" 로 두면 "/events" 까지
    #    걸려 위의 "/events*" 와 겹친다. 같은 오리진이라 동작에는 지장이 없지만
    #    중복이라 슬래시 형태로 둔다.
    #
    # ⚠️ CloudFront 의 캐시 동작 수 기본 한도는 25 개다.
    #    지금 17(아래) + 2(/ws) + 1(기본) = 20 개. 더 늘리려면 한도 상향이 필요하다.
    for_each = [
      "/events*", "/event/*", "/seats*", "/auth*",
      "/queue*", "/cancel-queue*",
      "/rooms*", "/publish/*", "/reservations*",
      "/wishlist*", "/membership*", "/admin*",
      "/sse*", "/health*",
      "/api/*", "/actuator/*", "/prom-api/*",
    ]
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

    # 찬규 안에서 가져옴. 지정하지 않으면 기본 300초라, 배포 직후 잘못 캐시된
    # 403/404 가 5분간 유지된다. 시연 중에 이러면 원인을 찾기 어렵다.
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"

    # 찬규 안에서 가져옴. 지정하지 않으면 기본 300초라, 배포 직후 잘못 캐시된
    # 403/404 가 5분간 유지된다. 시연 중에 이러면 원인을 찾기 어렵다.
    error_caching_min_ttl = 10
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


# ──────────────────────────────────────────────
# S3 버저닝 · 저장 암호화
#
# ■ 출처: 찬규(A) 안. 내 쪽에 아예 빠져 있던 것을 가져왔다.
#
# 버저닝 — 프론트엔드 배포는 S3 에 파일을 덮어쓰는 방식이다. 잘못 빌드된
# 번들을 올렸을 때 되돌릴 방법이 버저닝뿐이다. 없으면 이전 파일이 사라진다.
# 찬규님이 프론트엔드를 계속 손보는 중이라 실제로 쓰일 가능성이 높다.
#
# 암호화 — 정적 파일이라 민감 데이터는 없지만 SSE-S3 는 추가 비용이 0 이다.
# 끄는 쪽이 오히려 설명이 필요한 선택이 된다.
# ──────────────────────────────────────────────

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# 오래된 버전을 30일 뒤 정리한다. 버저닝을 켜면 덮어쓴 파일이 계속 쌓이는데,
# 프론트엔드 번들은 배포마다 통째로 바뀌어서 방치하면 용량이 계속 늘어난다.
resource "aws_s3_bucket_lifecycle_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }

  depends_on = [aws_s3_bucket_versioning.frontend]
}
