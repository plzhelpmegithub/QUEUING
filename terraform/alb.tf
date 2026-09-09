# =============================================================================
# ALB (Application Load Balancer) — API 트래픽 진입점
# =============================================================================
#
# [역할]
# 온프레미스 K8s의 NodePort Service(30084)를 대체한다.
# 인터넷(또는 CloudFront)에서 오는 HTTP(S) 요청을 ECS Fargate 태스크로 분배.
#
# [트래픽 흐름]
#   사용자 → (CloudFront) → ALB:80/443 → Target Group → EC2:NodePort(30084) → Pod:3000
#
# [K8s 대비 차이점]
#   K8s NodePort    : 고정 포트(30084)로 노드에 직접 접근. 로드밸런싱 없음.
#   AWS ALB         : DNS 이름으로 접근. 여러 AZ의 태스크에 자동 로드밸런싱.
#                     Health Check 실패한 태스크로는 트래픽 안 보냄.
# =============================================================================


# -----------------------------------------------------------------------------
# [ALB 리소스] 로드밸런서 본체.
#
#   name               : ALB 이름 (AWS 콘솔에서 식별용)
#   internal           : false = 인터넷에 노출 (internet-facing).
#                        true로 바꾸면 VPC 내부에서만 접근 가능.
#   load_balancer_type : "application" = HTTP/HTTPS 레벨(L7) 로드밸런싱.
#                        URL 경로 기반 라우팅, HTTP 헤더 조작 등 가능.
#   security_groups    : ALB에 적용할 방화벽 규칙 (80/443 인바운드 허용).
#   subnets            : ALB가 배치될 서브넷. 최소 2개 AZ 필요. Public에 배치.
# -----------------------------------------------------------------------------
resource "aws_lb" "api" {
  name               = "${local.name_prefix}-api-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  tags = { Name = "${local.name_prefix}-api-alb" }
}

# -----------------------------------------------------------------------------
# [Target Group] ALB가 요청을 보낼 대상(ECS 태스크) 그룹.
#
#   port        : 대상 포트. ECS 컨테이너의 EXPOSE 포트(3000)와 일치.
#   protocol    : HTTP (ALB ↔ ECS 구간은 VPC 내부이므로 HTTP로 충분).
#   target_type : "instance" = EC2 Worker Node를 인스턴스 ID로 등록.
#                 EKS Node Group의 ASG가 자동으로 Target Group에 등록/해제.
#   port        : K8s NodePort (30084). Worker Node의 이 포트로 트래픽 전달.
#                 kube-proxy가 NodePort → Pod:3000으로 라우팅.
#
#   health_check : 태스크가 정상인지 주기적으로 확인.
#     path     : GET /health 요청 (API의 헬스체크 엔드포인트)
#     port     : traffic-port = Target Group의 포트(NodePort)로 헬스체크
#     interval : 15초마다 확인 (K8s livenessProbe periodSeconds: 15와 동일)
#     matcher  : HTTP 200 응답이면 정상으로 판정
#     healthy_threshold   : 3번 연속 성공하면 "정상"으로 복귀
#     unhealthy_threshold : 3번 연속 실패하면 "비정상"으로 판정 → 트래픽 차단
#
#   deregistration_delay : 태스크가 종료될 때 기존 연결을 마무리할 대기 시간(초).
#                          30초면 진행 중인 요청을 처리하고 안전하게 종료.
# -----------------------------------------------------------------------------
resource "aws_lb_target_group" "api" {
  name        = "${local.name_prefix}-api-tg"
  port        = var.k8s_nodeport
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "instance"

  health_check {
    enabled             = true
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    healthy_threshold   = 3
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 15
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = { Name = "${local.name_prefix}-api-tg" }
}

# -----------------------------------------------------------------------------
# [HTTP Listener (포트 80)] ALB가 HTTP 요청을 수신하는 리스너.
#
# 동작 방식 (ACM 인증서 유무에 따라 분기):
#   - ACM 인증서 있음 → HTTP:80 요청을 HTTPS:443으로 301 리다이렉트
#   - ACM 인증서 없음 → HTTP:80 요청을 직접 Target Group으로 포워딩
#
# dynamic 블록: 조건부로 default_action을 생성하는 Terraform 문법.
#   for_each = [1] 이면 블록 생성, [] 이면 생략.
# -----------------------------------------------------------------------------
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  # 도메인이 설정되어 있으면 → HTTPS로 리다이렉트 (보안 강제)
  dynamic "default_action" {
    for_each = var.domain_name != "" ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"    # 영구 리다이렉트
      }
    }
  }

  # 도메인이 없으면 → HTTP 그대로 Target Group으로 전달
  dynamic "default_action" {
    for_each = var.domain_name == "" ? [1] : []
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.api.arn
    }
  }
}

# =============================================================================
# [ALB용 ACM 인증서] — ap-northeast-2에서 자동 발급
# =============================================================================
#
# CloudFront용 ACM은 us-east-1(cloudfront.tf)에서 발급하지만,
# ALB용 ACM은 ALB와 같은 리전(ap-northeast-2)에서 발급해야 한다.
#
# domain_name 설정 시 자동으로:
#   1. api.queuing.kr 인증서 요청
#   2. Route 53 DNS 검증 CNAME 자동 등록 (route53.tf)
#   3. ACM이 도메인 소유권 확인 후 인증서 발급 (보통 몇 분)
#   4. HTTPS 리스너에 자동 적용
#
# ⚠️ 수동 acm_certificate_arn 변수는 제거됨. 도메인 설정만으로 자동 발급·적용.
# =============================================================================
resource "aws_acm_certificate" "alb" {
  count = var.domain_name != "" ? 1 : 0

  domain_name       = "${var.api_subdomain}.${var.domain_name}"
  validation_method = "DNS"

  tags = { Name = "${local.name_prefix}-alb-cert" }

  lifecycle {
    create_before_destroy = true
  }
}

# --- ALB ACM 인증서 DNS 검증 완료 대기 ---
resource "aws_acm_certificate_validation" "alb" {
  count = var.domain_name != "" ? 1 : 0

  certificate_arn         = aws_acm_certificate.alb[0].arn
  validation_record_fqdns = [for record in aws_route53_record.acm_alb_validation : record.fqdn]
}


# -----------------------------------------------------------------------------
# [HTTPS Listener (포트 443)] SSL/TLS 암호화 수신. ACM 인증서 자동 발급.
#
#   count             : domain_name이 설정됐을 때만 생성 (도메인 없으면 HTTP만 사용).
#   ssl_policy        : TLS 1.3 지원하는 최신 보안 정책. 취약한 암호 스위트 차단.
#   certificate_arn   : 위에서 자동 발급한 ACM 인증서. ALB가 TLS 종단(termination) 처리.
#
# TLS 종단이란: ALB가 HTTPS를 복호화하고, EKS Pod로는 평문 HTTP로 전달.
#   → Pod에 인증서를 넣을 필요 없음. 인증서 갱신도 ACM이 자동 처리.
# -----------------------------------------------------------------------------
resource "aws_lb_listener" "https" {
  count             = var.domain_name != "" ? 1 : 0
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.alb[0].certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}
