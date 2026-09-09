# =============================================================================
# WAF (Web Application Firewall) — 웹 공격 방어
# =============================================================================
#
# [역할]
# CloudFront 앞단에서 악성 요청을 차단한다.
# SQL Injection, XSS, 봇, DDoS 등 OWASP Top 10 공격을 방어.
#
# ⚠️ CloudFront용 WAF는 반드시 us-east-1에 생성해야 한다.
#    (CloudFront 자체가 글로벌 서비스이지만 WAF 연동은 us-east-1 필수)
#
# [비용]
#   Web ACL: 월 $5
#   Rule: 월 $1/개
#   요청: 100만 건당 $0.60
#   → 기본 구성 기준 약 월 $10~15
#
# [구성]
#   1. AWS 관리형 규칙 — 공통 위협 차단 (SQL, XSS, 악성 입력)
#   2. Rate Limiting — IP당 요청 수 제한 (DDoS/봇 방어)
# =============================================================================


resource "aws_wafv2_web_acl" "cloudfront" {
  count    = var.waf_enabled ? 1 : 0
  provider = aws.us_east_1

  name        = "${local.name_prefix}-cloudfront-waf"
  description = "CloudFront WAF - 웹 공격 방어"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # ---------------------------------------------------------------------------
  # [규칙 1] AWS 관리형 — Common Rule Set
  #
  # OWASP Top 10 공통 위협을 차단하는 기본 규칙 세트.
  # XSS, 경로 탐색(path traversal), 파일 포함(file inclusion) 등을 탐지.
  # ---------------------------------------------------------------------------
  rule {
    name     = "AWS-AWSManagedRulesCommonRuleSet"
    priority = 1

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
      metric_name                = "${local.name_prefix}-common-rules"
    }
  }

  # ---------------------------------------------------------------------------
  # [규칙 2] AWS 관리형 — SQL Injection 방어
  #
  # SQL Injection 패턴을 탐지하여 차단.
  # 예: ' OR 1=1 --, UNION SELECT 등
  # ---------------------------------------------------------------------------
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
      metric_name                = "${local.name_prefix}-sqli-rules"
    }
  }

  # ---------------------------------------------------------------------------
  # [규칙 3] AWS 관리형 — 알려진 악성 입력 차단
  #
  # Log4j, Spring4Shell 등 알려진 취약점 공격 패턴 차단.
  # Java deserialization, SSRF 등도 포함.
  # ---------------------------------------------------------------------------
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
      metric_name                = "${local.name_prefix}-bad-inputs"
    }
  }

  # ---------------------------------------------------------------------------
  # [규칙 4] Rate Limiting — IP당 요청 수 제한
  #
  # 5분간 동일 IP에서 2,000건 이상 요청하면 차단.
  # 티켓 오픈 시 매크로/봇의 과도한 요청을 방어.
  #
  # limit : 5분(300초) 동안의 최대 요청 수.
  #         2000 = 약 6.7 req/sec. 정상 사용자에게는 충분.
  # aggregate_key_type : "IP" = 소스 IP 기준으로 카운트.
  # ---------------------------------------------------------------------------
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
      metric_name                = "${local.name_prefix}-rate-limit"
    }
  }

  visibility_config {
    sampled_requests_enabled   = true
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-waf"
  }

  tags = { Name = "${local.name_prefix}-cloudfront-waf" }
}
