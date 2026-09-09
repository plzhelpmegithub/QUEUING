# ──────────────────────────────────────────────
# ALB — WebSocket(C파트) + API(A파트) 통합 로드밸런서
# EKS 노드의 NodePort로 직접 라우팅 (target_type = "instance")
# ──────────────────────────────────────────────

resource "aws_lb" "main" {
  name               = "${var.project}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets = aws_subnet.public[*].id

  idle_timeout = 3600

  tags = { Name = "${var.project}-alb" }
}

# ── 타겟 그룹 ──

resource "aws_lb_target_group" "ws" {
  name        = "${var.project}-tg-ws"
  port        = var.nodeport_ws
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "instance"

  health_check {
    path                = "/healthz"
    port                = var.nodeport_ws
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }

  stickiness {
    type            = "lb_cookie"
    cookie_duration = 3600
    enabled         = true
  }

  tags = { Name = "${var.project}-tg-ws" }
}

resource "aws_lb_target_group" "api" {
  name        = "${var.project}-tg-api"
  port        = var.nodeport_api
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "instance"

  health_check {
    path                = "/events"
    port                = var.nodeport_api
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }

  tags = { Name = "${var.project}-tg-api" }
}

resource "aws_autoscaling_attachment" "ws_nodes" {
  autoscaling_group_name = tolist(aws_eks_node_group.main.resources[0].autoscaling_groups)[0].name
  lb_target_group_arn    = aws_lb_target_group.ws.arn
}

resource "aws_autoscaling_attachment" "api_nodes" {
  autoscaling_group_name = tolist(aws_eks_node_group.main.resources[0].autoscaling_groups)[0].name
  lb_target_group_arn    = aws_lb_target_group.api.arn
}

# ── 리스너 ──
#
# 80은 443으로 넘기기만 하고, 실제 라우팅은 전부 443에서 한다.
# 프론트가 CloudFront(https)라 브라우저가 https 페이지에서 ws:// 를 막기 때문에,
# C파트 WebSocket은 wss:// 여야 하고 그러려면 ALB에 TLS가 있어야 한다.

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.alb.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# C파트 WebSocket 업그레이드 경로.
# 프론트는 wss://api.queuing.kr/ws?token=... 로 붙는다. 쿼리스트링을 뺀 경로가
# 정확히 "/ws" 이므로 "/ws/*" 만 두면 매칭되지 않는다 — 둘 다 넣어야 한다.
resource "aws_lb_listener_rule" "ws" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  condition {
    path_pattern {
      values = ["/ws", "/ws/*"]
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.ws.arn
  }
}

resource "aws_lb_listener_rule" "ws_rest" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 20

  condition {
    path_pattern {
      values = ["/rooms", "/rooms/*", "/publish/*", "/healthz", "/metrics"]
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.ws.arn
  }
}
