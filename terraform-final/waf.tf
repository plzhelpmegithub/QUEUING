# ──────────────────────────────────────────────
# WAF — CloudFront 앞단 웹 공격 차단
#
# ■ 출처: 찬규(A) 안. 2026-09-09 푸시에서 새로 추가된 것을 그대로 가져왔다.
#   규칙 구성·우선순위·Rate Limit 수치까지 찬규님이 잡은 값을 유지한다.
#
# ■ 왜 예매 사이트에 필요한가
# 티켓 오픈 순간은 정상 트래픽과 매크로 트래픽이 구분되지 않는 구간이다.
# Rate Limit 규칙이 IP 단위로 먼저 잘라주면, 그만큼 ALB·EKS·Redis 로
# 내려오는 부하가 줄어든다. 부하 테스트에서 /seats/available 이 11초까지
# 늘어진 것을 본 뒤라 더 의미가 있다.
#
# ⚠️ scope = "CLOUDFRONT" 인 Web ACL 은 반드시 us-east-1 에 만들어야 한다.
#    (CloudFront 자체는 글로벌이지만 WAF 연동은 us-east-1 고정)
#    provider = aws.us_east_1 — main.tf 의 별칭 프로바이더를 쓴다.
#
# ⚠️ 이 WAF 는 CloudFront(프론트엔드)에만 붙는다. api.queuing.kr 로 직접 오는
#    요청은 ALB 로 바로 들어오므로 여기를 통과하지 않는다. API 쪽도 막으려면
#    scope = "REGIONAL" 인 Web ACL 을 따로 만들어 ALB 에 연결해야 한다
#    (월 $5 + 규칙당 $1 추가). 지금은 프론트엔드만 적용한다.
#
# ■ 비용: Web ACL $5 + 규칙 4개 $4 + 요청 100만건당 $0.60 ≈ 월 $10~15
#   waf_enabled = false 로 두면 만들지 않는다.
# ──────────────────────────────────────────────

resource "aws_wafv2_web_acl" "cloudfront" {
  count    = var.waf_enabled ? 1 : 0
  provider = aws.us_east_1

  name        = "${var.project}-cloudfront-waf"
  description = "QUEUING frontend WAF"
  scope       = "CLOUDFRONT"

  # 규칙에 걸리지 않은 요청은 통과시킨다 (allow-list 가 아니라 block-list 방식).
  default_action {
    allow {}
  }

  # ── 규칙 1: OWASP 공통 위협 (XSS, 경로 탐색, 파일 포함) ──
  rule {
    name     = "AWS-AWSManagedRulesCommonRuleSet"
    priority = 1

    # override_action none = 규칙 그룹이 정한 동작(대부분 block)을 그대로 적용.
    # count {} 로 바꾸면 차단하지 않고 카운트만 한다 — 오탐을 관찰할 때 쓴다.
    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project}-common-rules"
    }
  }

  # ── 규칙 2: SQL Injection ──
  rule {
    name     = "AWS-AWSManagedRulesSQLiRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesSQLiRuleSet"
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project}-sqli-rules"
    }
  }

  # ── 규칙 3: 알려진 악성 입력 (Log4Shell, Spring4Shell, SSRF 등) ──
  rule {
    name     = "AWS-AWSManagedRulesKnownBadInputsRuleSet"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project}-bad-inputs"
    }
  }

  # ── 규칙 4: Rate Limit — IP 당 5분간 요청 수 제한 ──
  #
  # 기본 2000건/5분 ≈ 6.7 req/s.
  #
  # ⚠️ 부하 테스트 때는 이 규칙이 먼저 걸린다.
  # JMeter 를 한 대에서 돌리면 모든 가상 사용자가 같은 출처 IP 로 보인다.
  # 100명 × 5분 테스트면 순식간에 2,000건을 넘겨 WAF 가 차단하고, 그러면
  # "AWS 가 느리다"가 아니라 "WAF 가 막았다"인데 결과만 보면 구분이 안 된다.
  # 테스트 전에 waf_rate_limit 을 올리거나 waf_enabled = false 로 두고,
  # 끝난 뒤 되돌린다.
  rule {
    name     = "RateLimit"
    priority = 4

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.waf_rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project}-rate-limit"
    }
  }

  visibility_config {
    sampled_requests_enabled   = true
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project}-waf"
  }

  tags = { Name = "${var.project}-cloudfront-waf" }
}
