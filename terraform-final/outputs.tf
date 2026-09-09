# ── 도메인 ──

output "route53_nameservers" {
  description = "도메인 등록기관(가비아 등) 관리 화면의 네임서버란에 이 4개를 넣어야 한다"
  # 위와 같은 이유로 스플랫 + flatten. 빈 목록이면 [] 가 된다.
  value = var.create_route53_zone ? flatten(aws_route53_zone.main[*].name_servers) : []
}

output "service_urls" {
  description = "실제 서비스 주소"
  value = {
    프론트엔드   = "https://${local.frontend_domain}"
    API         = "https://${local.api_domain}"
    WebSocket   = "wss://${local.api_domain}/ws?token=<JWT>"
    헬스체크_C   = "https://${local.api_domain}/healthz"
  }
}

output "domain_setup_guide" {
  description = "도메인 연결 절차"
  value       = <<-GUIDE
  1. 위 route53_nameservers 값 4개를 복사

  2. queuing.kr 을 구입한 등록기관 관리 화면 → 네임서버 변경에 붙여넣기
     (.kr 은 Route 53에서 등록이 안 되므로 이 단계가 반드시 필요하다)

  3. 반영 확인 — 4개가 그대로 나오면 성공:
     dig NS ${var.domain_name} +short

  4. 네임서버가 반영되기 전에는 ACM 검증이 끝나지 않아
     terraform apply 가 인증서 대기 상태로 멈춰 있다. 정상이다.
     보통 몇 분, 늦으면 최대 48시간 걸린다.

  5. 인증서 발급 확인:
     aws acm list-certificates --region ${var.region}
     aws acm list-certificates --region us-east-1

  6. 최종 확인:
     curl -I https://${local.frontend_domain}
     curl -I https://${local.api_domain}/healthz
  GUIDE
}

# ── 인프라 주소 ──

output "alb_dns" {
  description = "ALB 원본 주소 (도메인 연결 전 테스트용)"
  value       = aws_lb.main.dns_name
}

output "cloudfront_url" {
  description = "CloudFront 원본 주소 (도메인 연결 전 테스트용)"
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "ecr_ws_url" {
  description = "C파트 WebSocket 서버 ECR 주소"
  value       = aws_ecr_repository.ws_server.repository_url
}

output "ecr_api_url" {
  description = "A파트 API 서버 ECR 주소"
  value       = aws_ecr_repository.api_server.repository_url
}

output "redis_endpoint" {
  description = "ElastiCache Redis 엔드포인트"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "s3_bucket" {
  description = "프론트엔드 S3 버킷 이름"
  value       = aws_s3_bucket.frontend.id
}

# ── EKS ──

output "eks_cluster_name" {
  description = "EKS 클러스터 이름"
  value       = aws_eks_cluster.main.name
}

output "eks_kubeconfig_command" {
  description = "각자 이 명령어로 kubectl 연결 설정"
  value       = "aws eks update-kubeconfig --region ${var.region} --name ${aws_eks_cluster.main.name}"
}

output "eks_namespace_setup_commands" {
  description = "클러스터 생성 후 최초 1회만 실행 (네임스페이스 생성)"
  value = join("\n", [
    for m in distinct([for t in var.team_members : t.part]) :
    "kubectl create namespace queuing-${m}"
  ])
}

# ── 팀원 계정 ──

output "team_credentials" {
  description = "팀원별 콘솔 비밀번호 + CLI 액세스 키"
  sensitive   = true
  value = {
    for k, u in aws_iam_user.team : k => {
      console_password  = aws_iam_user_login_profile.team[k].password
      access_key_id     = aws_iam_access_key.team[k].id
      secret_access_key = aws_iam_access_key.team[k].secret
      part              = u.tags.Part
    }
  }
}

output "aws_console_signin_url" {
  description = "IAM User 콘솔 로그인 주소"
  value       = "https://${data.aws_caller_identity.current.account_id}.signin.aws.amazon.com/console"
}

# ── NAT · D-Cloud ──

output "nat_eip" {
  description = "NAT Gateway 공인 IP — 프라이빗 서브넷의 모든 아웃바운드가 이 주소로 나간다"
  value       = aws_eip.nat.public_ip
}

output "dcloud_connection" {
  description = "EKS 에서 D-Cloud 에 붙을 때 쓰는 접속 정보 (NAT 경유)"
  value = {
    db_host   = var.dcloud_host
    db_port   = var.dcloud_db_port
    sftp_host = var.dcloud_host
    sftp_port = var.dcloud_sftp_port
    user      = var.dcloud_db_user
    비고      = "온프레미스에서 쓰던 값과 동일하다. VPN 을 걷어내서 터널 IP 를 쓰지 않는다."
  }
}

output "dcloud_whitelist_guide" {
  description = "⚠️ D-Cloud 접속 전에 반드시 해야 하는 일"
  value       = <<-GUIDE
  D-Cloud 는 출발지 IP 로 접속을 허용한다. EKS 파드는 NAT Instance 의 EIP 로
  나가므로, 그 주소를 D-Cloud 화이트리스트에 등록해야 한다.
  등록 전에는 EKS 에서 접속하면 Access denied 가 난다.

  1. NAT 의 공인 IP 확인:
     terraform output -raw nat_eip

  2. 이 주소를 D-Cloud 관리자에게 전달해 team2 계정의 허용 IP 에 추가 요청

  3. 등록 후 EKS 안에서 확인:
     kubectl run dbtest --rm -it --restart=Never --image=mariadb:11 -- \
       mariadb -h ${var.dcloud_host} -P ${var.dcloud_db_port} \
       -u ${var.dcloud_db_user} -p --skip-ssl -e "SELECT 1;"

     'team2'@'<NAT EIP>' 형태로 접속이 잡히면 성공이다.

  ※ 사무실에서 붙을 때와 출발지가 달라지므로, 기존 사무실 IP 등록은
     그대로 두어야 로컬 작업이 계속 된다.
  GUIDE
}

# ── 비용 요약 ──

output "monthly_cost_estimate" {
  description = "주요 항목 예상 월 비용 (켜놓기만 했을 때)"
  value = {
    "EKS 컨트롤플레인"            = "~$73 (표준 지원 $0.10/h — 1.34 기준)"
    "EKS 워커노드 (t3.medium×2)" = "~$60"
    "NAT Instance (t3.micro)"    = "~$8.50"
    "ALB"                        = "~$20"
    "ElastiCache (t3.micro×2)"   = "~$24"
    "Route 53 호스팅 영역"        = "~$0.50 (ACM 인증서는 무료)"
    "합계"                       = "~$186/월  (Wireguard EC2 제거로 $8.50 절감)"
    "크레딧_잔여_개월"            = "~3.6개월"
    "⚠️ 주의"                     = "eks_cluster_version 을 1.33 이하로 되돌리면 확장 지원 요금($0.60/h)이 적용되어 컨트롤플레인만 월 $438이 된다"
  }
}

# ── 통합하며 추가된 출력 ──

output "rds_endpoint" {
  description = "RDS MariaDB 주소 — 앱의 DB_HOST 에 이 값을 넣는다"
  # use_rds = false(지금 기본값)에서 [0] 이면 터진다. 스플랫 + join 으로 바꿨다.
  value = var.use_rds ? join("", aws_db_instance.mariadb[*].address) : "(use_rds=false — D-Cloud ${var.dcloud_host} 사용)"
}

output "sqs_queue_url" {
  description = "B파트 재판매 큐 — KEDA ScaledObject 의 queueURL 에 넣는다"
  value       = aws_sqs_queue.resale.url
}

output "keda_role_arn" {
  description = "KEDA 오퍼레이터용 IAM 역할 — 아래 어노테이션으로 연결한다"
  value       = aws_iam_role.keda.arn
}

output "worker_b_role_arn" {
  description = "B파트 워커용 IAM 역할 (SQS 소비 + DynamoDB)"
  value       = aws_iam_role.worker_b.arn
}

output "ses_send_role_arn" {
  description = "SES 발송용 IAM 역할 — A/B파트 ServiceAccount 에 연결"
  value       = aws_iam_role.ses_send.arn
}

output "ses_smtp_username" {
  description = "SES SMTP 사용자 이름 (SDK 대신 SMTP 로 붙을 때만 필요)"
  value       = aws_iam_access_key.ses_smtp.id
}

output "ses_smtp_password" {
  description = "SES SMTP 비밀번호 — terraform output -raw ses_smtp_password 로 확인"
  value       = aws_iam_access_key.ses_smtp.ses_smtp_password_v4
  sensitive   = true
}

output "irsa_setup_commands" {
  description = "클러스터 생성 후 ServiceAccount 에 IAM 역할을 연결하는 명령"
  value       = <<-GUIDE
  # KEDA — SQS 큐 길이 조회 (온프레미스의 TriggerAuthentication + Secret 을 대체한다)
  kubectl -n keda annotate sa keda-operator \
    eks.amazonaws.com/role-arn=${aws_iam_role.keda.arn} --overwrite
  kubectl -n keda rollout restart deploy keda-operator

  # B파트 워커 — SQS 소비 + DynamoDB
  kubectl -n queuing-b create sa email-worker --dry-run=client -o yaml | kubectl apply -f -
  kubectl -n queuing-b annotate sa email-worker \
    eks.amazonaws.com/role-arn=${aws_iam_role.worker_b.arn} --overwrite

  # A파트 — SES 발송
  kubectl -n queuing-a annotate sa default \
    eks.amazonaws.com/role-arn=${aws_iam_role.ses_send.arn} --overwrite
  GUIDE
}

output "post_apply_checklist" {
  description = "배포 후 반드시 확인할 것"
  value       = <<-GUIDE
  1. metrics-server 설치 — EKS 는 기본 제공하지 않는다.
     없으면 모든 HPA 가 <unknown> 으로 뜨고 오토스케일링이 전혀 동작하지 않는다.
     kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

  2. SES 프로덕션 액세스 신청 — 승인에 1~2일 걸린다. 샌드박스에서는
     인증된 주소로만 메일이 나간다. 콘솔 → SES → Request production access

  3. IRSA 연결 — 위 irsa_setup_commands 참고

  4. use_rds = false 인 경우 D-Cloud 화이트리스트에 NAT EIP 등록
     terraform output -raw nat_eip

  5. 각 파트 차트의 접속 정보 갱신
     DB_HOST        → terraform output -raw rds_endpoint
     REDIS_HOST     → terraform output -raw redis_endpoint
     KEDA queueURL  → terraform output -raw sqs_queue_url
  GUIDE
}

# ──────────────────────────────────────────────
# 2026-09-09 통합 2차 (찬규님 EKS 전환 반영) 추가 출력
# ──────────────────────────────────────────────

output "secrets_manager_arn" {
  description = "애플리케이션 시크릿 ARN. ESO/CSI Driver 설정에 넣는다."
  value       = aws_secretsmanager_secret.api.arn
}

output "secrets_read_policy_arn" {
  description = <<-DESC
    이 시크릿만 읽는 IAM 정책 ARN.
    External Secrets Operator 또는 Secrets Store CSI Driver 의
    ServiceAccount 역할에 붙여야 파드가 값을 읽을 수 있다.
    아직 어디에도 붙어 있지 않다 — 설치할 쪽에서 연결한다.
  DESC
  value       = aws_iam_policy.secrets_read.arn
}

output "waf_status" {
  description = "WAF 적용 상태. 부하 테스트 전에 확인할 것."
  value = var.waf_enabled ? format(
    "켜짐 — CloudFront 만 보호. Rate Limit %d건/5분(IP당). ⚠️ 부하 테스트 시 waf_enabled=false 로 두거나 한도를 올릴 것.",
    var.waf_rate_limit
  ) : "꺼짐 — 웹 공격 필터 없음"
}

output "cloudwatch_log_groups" {
  description = "로그를 볼 위치. aws logs tail <이름> --follow"
  value = {
    eks_control_plane = aws_cloudwatch_log_group.eks_cluster.name
    application       = aws_cloudwatch_log_group.app.name
  }
}

output "node_ssm_access" {
  description = "노드 안에 들어가는 방법 (SSH 키·베스천 불필요)"
  value       = <<-DESC
    # 1) 노드 인스턴스 ID 확인
    aws ec2 describe-instances \
      --filters "Name=tag:eks:cluster-name,Values=${aws_eks_cluster.main.name}" \
                "Name=instance-state-name,Values=running" \
      --query 'Reservations[].Instances[].[InstanceId,PrivateIpAddress]' --output table

    # 2) 접속 (Session Manager 플러그인 필요)
    aws ssm start-session --target <i-xxxxxxxx>

    # 디스크·메모리 확인 — 온프레미스에서 83% 까지 찼던 그 점검
    #   df -h /var/lib/containerd ; free -h ; sudo crictl images
  DESC
}

output "flow_logs_query" {
  description = "VPC Flow Logs 조회 방법"

  # ⚠️ flow_logs[0] 처럼 인덱스로 쓰지 않는다.
  # 삼항 연산자는 선택되지 않은 쪽도 평가하기 때문에, flow_logs_enabled = false
  # 로 두면 빈 목록에 [0] 을 걸어 "Invalid index" 로 plan 이 실패한다.
  # join 은 목록이 비면 빈 문자열을 돌려주므로 어느 경우에도 안전하다.
  value = var.flow_logs_enabled ? format(<<-DESC
    로그 그룹: %s  (보관 %d일, 수집 대상 %s)

    # 막힌 통신만 보기 — 보안그룹/화이트리스트 문제 추적
    aws logs start-query --log-group-name %s       --start-time $(date -d '1 hour ago' +%%s) --end-time $(date +%%s)       --query-string 'fields @timestamp, srcAddr, dstAddr, dstPort, action
                      | filter action = "REJECT" | sort @timestamp desc | limit 50'

    # 외부 D-Cloud DB 로 나가는 통신이 실제로 가는지 (use_rds = false 일 때)
    aws logs start-query --log-group-name %s       --start-time $(date -d '1 hour ago' +%%s) --end-time $(date +%%s)       --query-string 'fields @timestamp, srcAddr, dstAddr, action
                      | filter dstAddr = "%s" | limit 50'
  DESC
    , join("", aws_cloudwatch_log_group.flow_logs[*].name)
    , var.flow_logs_retention_days
    , var.flow_logs_traffic_type
    , join("", aws_cloudwatch_log_group.flow_logs[*].name)
    , join("", aws_cloudwatch_log_group.flow_logs[*].name)
    , var.dcloud_host
  ) : "Flow Logs 꺼짐 (flow_logs_enabled = false)"
}
