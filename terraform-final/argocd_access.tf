# ──────────────────────────────────────────────
# ArgoCD 웹 화면을 팀원에게 연다 (2026-09-18)
#
# ■ 주소   https://api.queuing.kr/argocd
#   새 도메인(argocd.queuing.kr)을 쓰면 ACM 인증서를 새로 받아야 한다.
#   기존 인증서가 api.queuing.kr 만 덮으므로 경로로 붙여 인증서·ALB 를 그대로 쓴다.
#   www.queuing.kr/argocd 는 CloudFront 가 프론트엔드(S3)로 보내므로 열리지 않는다.
#
# ■ 학원 IP 에서만 열린다
#   ArgoCD 는 클러스터에 배포하는 권한을 쥔 도구라 인터넷에 열면 안 된다.
#   api 로그를 보면 봇이 /admin/.env 같은 경로를 계속 찔러본다.
#   Jenkins 와 같은 방식으로 출발지 IP 를 제한하고, 그 밖에서 오면 403 을 준다.
#
# ■ 클러스터 쪽 짝 (shared-infra/argocd/)
#   argocd-server-nodeport.yaml   NodePort 30085
#   argocd-cmd-params-cm.yaml     server.rootpath=/argocd
#   argocd-cm.yaml / argocd-rbac-cm.yaml   팀원 계정과 권한
# ──────────────────────────────────────────────

variable "argocd_allowed_cidrs" {
  description = "ArgoCD 웹 화면을 열 수 있는 출발지 IP. 학원 공인 IP 만 둔다."
  type        = list(string)
  default     = ["118.131.22.85/32"]
}

# ALB → 노드 구간도 HTTPS 로 보낸다. argocd-server 는 자체 서명 인증서로 TLS 를
# 켜고 있고, ALB 는 대상의 인증서를 검증하지 않으므로 그대로 붙는다.
# HTTP 로 보내려면 ArgoCD 쪽 TLS 를 꺼야(server.insecure) 하는데, 그러면
# 노드 구간이 평문이 된다. 끌 이유가 없어 켠 채로 둔다.
resource "aws_lb_target_group" "argocd" {
  name        = "${var.project}-tg-argocd"
  port        = 30085
  protocol    = "HTTPS"
  vpc_id      = aws_vpc.main.id
  target_type = "instance"

  # /healthz 는 server.rootpath 와 무관하게 루트에 있다(파드 readinessProbe 와 같은 경로).
  health_check {
    path                = "/healthz"
    protocol            = "HTTPS"
    port                = "traffic-port"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }

  tags = { Name = "${var.project}-tg-argocd" }
}

# 노드그룹 ASG 에 붙인다. Cluster Autoscaler 가 늘린 노드도 자동으로 대상이 된다.
# 노드 보안그룹은 ALB 에서 30000-32767 을 이미 받으므로 건드리지 않는다.
resource "aws_autoscaling_attachment" "argocd_nodes" {
  autoscaling_group_name = tolist(aws_eks_node_group.main.resources[0].autoscaling_groups)[0].name
  lb_target_group_arn    = aws_lb_target_group.argocd.arn
}

# 학원 IP 에서 온 /argocd 요청만 ArgoCD 로 보낸다.
resource "aws_lb_listener_rule" "argocd" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 12

  condition {
    path_pattern {
      values = ["/argocd", "/argocd/*"]
    }
  }

  condition {
    source_ip {
      values = var.argocd_allowed_cidrs
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.argocd.arn
  }
}

# 그 밖에서 온 /argocd 는 여기서 끊는다. 이 규칙이 없으면 기본 규칙(A파트 api)으로
# 흘러가 404 가 나는데, 그러면 "막힌 것"인지 "고장난 것"인지 구분이 안 된다.
resource "aws_lb_listener_rule" "argocd_deny" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 13

  condition {
    path_pattern {
      values = ["/argocd", "/argocd/*"]
    }
  }

  action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "ArgoCD is only reachable from the academy network."
      status_code  = "403"
    }
  }
}
