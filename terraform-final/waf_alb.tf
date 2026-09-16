# ──────────────────────────────────────────────
# WAF — ALB(api.queuing.kr) 앞단 웹 공격 차단
#
# ■ 왜 따로 만드나 (2026-09-15, 예지님 제보)
#   waf.tf 는 CloudFront(queuing.kr)에만 붙는다. api.queuing.kr 은 ALB 로 바로 들어와
#   WAF 를 거치지 않았고, /.env · /.git/config · *.php 같은 취약점 탐색 요청이
#   A파트까지 내려가 메트릭에 잡혔다 (6시간 41건, 전부 404).
#
# ■ CloudFront 뒤로 넣지 않은 이유
#   CloudFront 가 이미 api.queuing.kr 을 원본으로 쓰고 있어 새 원본 도메인·인증서가 필요하고,
#   WebSocket(wss://api.queuing.kr/ws)도 경로를 바꿔야 한다. 발표 주간에는 범위가 크다.
#
# ■ CloudFront WAF(waf.tf)와 다른 점
#   - Rate Limit 없음: 부하 테스트가 IP 하나에서 오면 테스트 자체가 막힌다.
#   - AnonymousIpList 안 씀: 그 안의 HostingProviderIPList 가 클라우드 IP 를 막는다.
#     A 파드가 NAT(AWS IP)를 거쳐 api.queuing.kr/b-callback 을 부르게 되면 그것도 막힌다.
#   - 탐색 경로 차단 규칙 추가: 관리형 규칙은 /.env, *.php 같은 경로 자체를 막지 않는다.
#
# ■ 처음에는 기록만 한다 (waf_alb_count_only = true)
#   CommonRuleSet 은 8KB 넘는 요청 본문 같은 것도 막아서, 정상 요청이 걸리는지 먼저 본다.
#   콘솔 WAF & Shield → Web ACLs(서울) → queuing-alb-waf → Sampled requests 에서 확인한 뒤
#   false 로 바꿔 apply 하면 실제로 차단한다.
#
# ■ WebSocket 은 연결 시작(HTTP Upgrade) 요청만 검사한다. 연결 후 메시지는 보지 않는다.
# ■ ALB 대상 헬스체크는 WAF 를 거치지 않는다.
# ■ 비용: Web ACL $5 + 규칙 5개 $5 + 요청 100만건당 $0.60 ≈ 월 $10
# ──────────────────────────────────────────────

variable "waf_alb_enabled" {
  description = "true = ALB(api.queuing.kr)에 WAF 를 붙인다 (waf_alb.tf)."
  type        = bool
  default     = true
}

variable "waf_alb_count_only" {
  description = "true = 차단하지 않고 기록만 한다. 오탐이 없는 걸 확인한 뒤 false 로 바꾼다."
  type        = bool
  default     = true
}

locals {
  # 이 순서대로 우선순위 1, 2, 3, 4 가 된다. 이름은 AWS 관리형 규칙 그룹 이름 그대로다.
  waf_alb_managed_rules = [
    "AWSManagedRulesAmazonIpReputationList", # 봇넷·스캐너로 알려진 IP
    "AWSManagedRulesCommonRuleSet",          # OWASP 공통 위협 (XSS, 경로 탐색 등)
    "AWSManagedRulesKnownBadInputsRuleSet",  # Log4Shell 같은 알려진 공격 입력
    "AWSManagedRulesSQLiRuleSet",            # SQL Injection
  ]
}

resource "aws_wafv2_web_acl" "alb" {
  count = var.waf_alb_enabled ? 1 : 0

  name        = "${var.project}-alb-waf"
  description = "QUEUING api.queuing.kr ALB WAF"
  scope       = "REGIONAL"

  # 규칙에 걸리지 않은 요청은 통과시킨다.
  default_action {
    allow {}
  }

  # ── 규칙 0: 취약점 탐색 경로 ──
  # 우리 API(A Node · D Spring · C realtime-ws)에는 확장자가 붙은 경로가 없다
  # (A파트 라우트 91개 확인, 2026-09-15). 경로에만 적용하고 쿼리스트링은 보지 않는다.
  rule {
    name     = "BlockScannerPaths"
    priority = 0

    action {
      dynamic "block" {
        for_each = var.waf_alb_count_only ? [] : [1]
        content {}
      }
      dynamic "count" {
        for_each = var.waf_alb_count_only ? [1] : []
        content {}
      }
    }

    statement {
      regex_match_statement {
        regex_string = "\\.(php[0-9]?|env|git|svn|asp|aspx|jsp|cgi|sql|bak|ini|htaccess)(/|$)|/(wp-admin|wp-login|wp-content|wp-includes|xmlrpc|phpmyadmin|cgi-bin)"

        field_to_match {
          uri_path {}
        }

        # %2E 같은 인코딩과 대소문자를 풀어서 비교한다.
        text_transformation {
          priority = 0
          type     = "URL_DECODE"
        }
        text_transformation {
          priority = 1
          type     = "LOWERCASE"
        }
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project}-alb-scanner-paths"
    }
  }

  # ── 규칙 1~4: AWS 관리형 규칙 ──
  # override_action none = 규칙 그룹이 정한 동작(대부분 block) 그대로, count = 기록만.
  dynamic "rule" {
    for_each = local.waf_alb_managed_rules
    content {
      name     = rule.value
      priority = rule.key + 1

      override_action {
        dynamic "none" {
          for_each = var.waf_alb_count_only ? [] : [1]
          content {}
        }
        dynamic "count" {
          for_each = var.waf_alb_count_only ? [1] : []
          content {}
        }
      }

      statement {
        managed_rule_group_statement {
          vendor_name = "AWS"
          name        = rule.value
        }
      }

      visibility_config {
        sampled_requests_enabled   = true
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.project}-alb-${rule.value}"
      }
    }
  }

  visibility_config {
    sampled_requests_enabled   = true
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project}-alb-waf"
  }

  tags = { Name = "${var.project}-alb-waf" }
}

resource "aws_wafv2_web_acl_association" "alb" {
  count = var.waf_alb_enabled ? 1 : 0

  resource_arn = aws_lb.main.arn
  web_acl_arn  = aws_wafv2_web_acl.alb[0].arn
}
