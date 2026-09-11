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

  # 헤더 형식이 잘못된 요청을 ALB 단에서 버린다.
  #
  # 기본값이 false 다. 켜지 않으면 규격을 어긴 헤더가 그대로 뒤로 전달되어,
  # ALB 와 뒤쪽 서버가 같은 요청을 다르게 해석하는 상황(HTTP request smuggling)
  # 이 가능해진다. AWS Foundational Security Best Practices 의 ELB.4 항목이다.
  # 비용이 없고 정상 트래픽에는 영향이 없다.
  #
  # 어느 안에도 없었다 — 통합하면서 추가한다.
  drop_invalid_header_fields = true

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
    path                = var.health_check_path_ws
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

  # ⚠️ "/events" 로 되어 있던 것을 고쳤다 (근거 없이 고른 값이었다)
  #
  # /events 는 DB 와 Redis 를 모두 타는 실제 업무 엔드포인트다. 온프레미스
  # 부하 테스트에서 A파트 조회 계열이 11초까지 늘어졌는데, 아래 timeout 은 5초다.
  # 그러면 부하가 몰리는 순간 헬스체크가 먼저 타임아웃하고, ALB 가 노드를
  # 타겟그룹에서 빼버린다. 트래픽이 가장 많을 때 받을 노드가 사라지는 셈이다.
  # 티켓 오픈 직후에 정확히 이 형태로 무너진다.
  #
  # 헬스체크의 역할은 "이 노드로 요청을 보내도 되는가"까지다. "시스템 전체가
  # 정상인가"는 Prometheus 알림이 맡는다. 그래서 가볍고 빠른 경로를 쓴다.
  #
  # ⚠️ 다만 A파트 /health 는 Redis 연결을 확인하지 않는다. 9/5 Redis 장애 때
  #    /health 는 200 인데 /events 는 500 이었다. 찬규님께 /health 가 Redis
  #    ping 을 포함하도록 요청해둔 상태다. 그게 반영되면 이 헬스체크가
  #    "가볍지만 의미 있는" 상태가 된다.
  health_check {
    path                = var.health_check_path_api
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

  # /publish/* 와 /metrics 는 아래 block_internal 규칙이 먼저 막는다.
  condition {
    path_pattern {
      values = ["/rooms", "/rooms/*", "/healthz"]
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.ws.arn
  }
}

# 인터넷에 열려 있으면 안 되는 경로를 ALB 에서 403 으로 막는다. (2026-09-11)
#
# /publish/*  C파트 테스트용 쓰기 API. 인증이 없어서 누구나 가짜 좌석 상태를
#             전체 접속자 화면에 뿌릴 수 있었다. A파트는 이 API 를 쓰지 않고
#             Redis 에 직접 publish 하고, 프론트엔드도 호출하지 않는다.
# /metrics    A·C 파트 둘 다 이 경로로 내부 지표를 내보낸다. Prometheus 는
#             ServiceMonitor 로 파드에 직접 수집하므로 ALB 를 거칠 필요가 없다.
#
# ws_rest 에서 빼기만 하면 기본 규칙(A파트 api)으로 넘어가서 A파트 /metrics 가
# 대신 노출된다. 그래서 규칙에서 빼는 것으로 끝내지 않고 명시적으로 403 을 돌려준다.
#
# POST /rooms 는 막지 않는다. 프론트엔드가 채팅을 열 때 브라우저에서 직접 호출한다.
resource "aws_lb_listener_rule" "block_internal" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 5

  condition {
    path_pattern {
      values = ["/publish/*", "/metrics"]
    }
  }

  action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }
}
