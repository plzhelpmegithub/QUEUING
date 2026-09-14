# ── 도메인 ──

output "route53_nameservers" {
  description = "도메인 등록기관(가비아 등) 관리 화면의 네임서버란에 이 4개를 넣어야 한다"
  # 위와 같은 이유로 스플랫 + flatten. 빈 목록이면 [] 가 된다.
  value = var.create_route53_zone ? flatten(aws_route53_zone.main[*].name_servers) : []
}

output "service_urls" {
  description = "실제 서비스 주소"
  value = {
    프론트엔드     = "https://${local.frontend_domain}"
    API       = "https://${local.api_domain}"
    WebSocket = "wss://${local.api_domain}/ws?token=<JWT>"
    헬스체크_C    = "https://${local.api_domain}/healthz"
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

output "ecr_repositories" {
  description = "파트별 ECR 주소. 각 Helm values.yaml 의 image.repository 에 넣는다."
  value       = { for k, r in aws_ecr_repository.part : k => r.repository_url }
}

output "ecr_login_command" {
  description = "도커 로그인 (젠킨스와 로컬 모두 동일)"
  value       = "aws ecr get-login-password --region ${var.region} | docker login --username AWS --password-stdin ${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.region}.amazonaws.com"
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
  description = <<-DESC
    클러스터 생성 후 최초 1회만 실행 (네임스페이스 생성).

    ⚠️ team_members 의 namespaces 에서 실제 이름을 뽑아 만든다.
    예전에는 part 문자로 "queuing-" + 파트문자 를 조립했는데, C파트는 realtime,
    D파트는 monitoring/redis 를 쓰고 있어서 실제와 달랐다.
    AWS 는 Access Entry 의 네임스페이스 존재를 검증하지 않으므로, 여기서
    엉뚱한 이름을 만들면 권한이 조용히 안 붙는다.
  DESC

  value = join("\n", concat(
    [
      for ns in distinct(flatten([for t in var.team_members : t.namespaces])) :
      "kubectl create namespace ${ns}"
    ],
    ["", "# 확인: kubectl get ns"],
  ))
}

# ── 팀원 계정 ──

output "team_credentials" {
  description = <<-DESC
    팀원별 콘솔 비밀번호 + CLI 액세스 키.
    create_team_iam_users = false (기본)이면 빈 객체다 — 테라폼이 계정을
    만들지 않기 때문이다. 콘솔에서 만든 계정의 자격증명은 여기 나오지 않는다.
  DESC
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
  # ⚠️ aws_eip.nat 이 아니라 NAT 게이트웨이에서 읽는다.
  # nat_eip_allocation_id 를 쓰면 aws_eip.nat 이 0개가 되어 참조가 깨진다.
  # NAT 게이트웨이의 public_ip 는 어느 경우든 실제 나가는 주소를 준다.
  value = aws_nat_gateway.main.public_ip
}

output "dcloud_connection" {
  description = "EKS 에서 D-Cloud 에 붙을 때 쓰는 접속 정보 (NAT 경유)"
  value = {
    db_host   = var.dcloud_host
    db_port   = var.dcloud_db_port
    sftp_host = var.dcloud_host
    sftp_port = var.dcloud_sftp_port
    user      = var.dcloud_db_user
    비고        = "온프레미스에서 쓰던 값과 동일하다. NAT 게이트웨이를 거쳐 공인망으로 나간다."
  }
}

output "dcloud_db_access" {
  description = "D-Cloud DB 접근 상태와 확인 방법"
  value       = <<-GUIDE
  ⚠️ 정정 (2026-09-09 실측)
  이 출력은 원래 'NAT EIP 를 D-Cloud 화이트리스트에 등록해야 한다' 였다.
  틀린 내용이었다. EKS 파드에서 실제로 붙여보니 계정이 이렇게 나온다.

    CURRENT_USER() = team2@%
    GRANT ALL PRIVILEGES ON *.* TO `team2`@`%`

  team2 계정의 호스트가 % 라서 어느 IP 에서든 접속된다. 등록 절차가 필요 없다.
  이전 세션에서 'team2'@'118.131.22.85' 형태를 봤다는 기록을 근거로 IP 에
  묶여 있다고 단정했는데, 검증하지 않은 추론이었다.

  ■ 접속 확인 (EKS 안에서)
    kubectl run dbtest --rm -it --restart=Never --image=mariadb:11 --       mariadb -h ${var.dcloud_host} -P ${var.dcloud_db_port}       -u ${var.dcloud_db_user} -p --skip-ssl -e "SELECT 1;"

  ■ 🔴 대신 진짜 문제가 하나 드러났다
  team2@% 에 ON *.* 전권이 붙어 있다. 즉 ${var.dcloud_host}:${var.dcloud_db_port} 에
  네트워크로 닿을 수 있는 사람이라면 누구나, 비밀번호만 알면 모든 DB 에
  전권으로 들어온다. 화이트리스트가 '없는' 게 아니라 애초에 열려 있었다.

  게다가 MySQL 프로토콜은 기본이 평문이고 D-Cloud 인증서가 자체 서명이라
  클라이언트가 --skip-ssl 로 검증을 끄고 붙는다. 인터넷 구간을 계정 정보와
  조회 결과가 암호화 없이 지난다.

  ■ 완화 방법 (팀 논의 필요)
    1. use_rds = true 로 RDS 로 이전 — 이 문제가 통째로 사라진다 (월 약 $15)
    2. team2@% 를 필요한 출발지로 좁히기 — D-Cloud 관리자 권한 필요
    3. 최소한 비밀번호를 강한 것으로 교체
  GUIDE
}

# ── 비용 요약 ──

output "monthly_cost_estimate" {
  description = <<-DESC
    주요 항목 예상 월 비용 (켜놓기만 했을 때, 데이터 전송료 제외).

    ⚠️ 2026-09-09 전면 수정. 이전 값은 NAT "인스턴스"(월 $8.50) 기준이었는데
    실제 구성은 NAT "게이트웨이"(월 $33)다. terraform-aws 시절 값이 남아 있었다.
    WAF·Flow Logs·CloudWatch·Jenkins 도 빠져 있었다.

    실제 청구는 데이터 전송량에 따라 달라진다. 특히 NAT 처리 요금($0.045/GB)은
    use_rds = false 라 D-Cloud DB 트래픽이 전부 여기를 지난다.
  DESC

  value = {
    "EKS 컨트롤플레인"    = "~$73   (1.34 표준지원 $0.10/h — 1.33 이하면 $438)"
    "EKS 워커노드"      = "~$61   (${var.eks_node_instance_type} × ${var.eks_node_desired_size}, 최대 ${var.eks_node_max_size}대까지 증가)"
    "NAT 게이트웨이"     = "~$33   + 데이터 처리 $0.045/GB"
    "ElastiCache"   = "~$25   (${var.redis_node_type} × ${var.redis_num_replicas + 1})"
    "ALB"           = "~$20   + LCU"
    "Jenkins EC2"   = var.jenkins_enabled ? "~$22   (${var.jenkins_instance_type} + EBS ${var.jenkins_volume_size}GB)" : "$0   (jenkins_enabled = false)"
    "WAF"           = var.waf_enabled ? "~$10   (Web ACL $5 + 규칙 4개 $4)" : "$0   (waf_enabled = false)"
    "VPC Flow Logs" = var.flow_logs_enabled ? "~$3    (수집 $0.50/GB, 보관 ${var.flow_logs_retention_days}일, 대상 ${var.flow_logs_traffic_type})" : "$0   (flow_logs_enabled = false)"
    "CloudWatch 로그" = "~$3    (EKS 컨트롤플레인 audit 이 대부분)"
    "RDS"           = var.use_rds ? "~$15   (${var.db_instance_class})" : "$0   (use_rds = false — 외부 D-Cloud 사용)"
    "Route 53"      = "~$0.50 (ACM 인증서는 무료)"
    "기타"            = "~$6    (ECR, S3, SQS, DynamoDB, SES, Secrets Manager)"
    "합계"            = "약 $256/월  (기본 설정 기준, 데이터 전송료 별도)"

    "비용을_줄이려면" = join(" / ", [
      "waf_enabled = false (-$10)",
      "flow_logs_enabled = false (-$3)",
      "jenkins_enabled = false (-$22)",
      "redis_num_replicas = 0 (-$12, 페일오버 없어짐)",
    ])

    "⚠️ 가장_큰_함정" = "eks_cluster_version 을 1.33 이하로 되돌리면 확장 지원 요금($0.60/h)이 적용되어 컨트롤플레인만 월 $438 이 된다 (+$365)"
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
  # 스플랫 + join — create_ses_smtp_user = false 면 빈 문자열이 된다.
  value = join("", aws_iam_access_key.ses_smtp[*].id)
}

output "ses_smtp_password" {
  description = "SES SMTP 비밀번호 — terraform output -raw ses_smtp_password 로 확인"
  value       = join("", aws_iam_access_key.ses_smtp[*].ses_smtp_password_v4)
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
  description = "apply 후 해야 하는 일 — 2026-09-09 실제 배포에서 겪은 순서"
  value       = <<-DESC
  ■ 1. kubeconfig 와 네임스페이스
     aws eks update-kubeconfig --region ${var.region} --name ${aws_eks_cluster.main.name}
     kubectl config current-context      # 온프레미스와 헷갈리기 쉽다. 매번 확인할 것
     terraform output -raw eks_namespace_setup_commands

  ■ 2. metrics-server — EKS 는 기본 제공하지 않는다
     없으면 모든 HPA 가 <unknown> 이고 오토스케일링이 전혀 동작하지 않는다.
     kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

  ■ 3. KEDA — B파트 ScaledObject 에 필요하다
     helm repo add kedacore https://kedacore.github.io/charts
     helm -n keda upgrade --install keda kedacore/keda --create-namespace

  ■ 4. IRSA 연결 — terraform output irsa_setup_commands

  ■ 5. 각 파트 차트를 AWS 용으로 고쳐야 한다 (⚠️ 실제로 여기서 막혔다)
     온프레미스 전용 설정이 코드와 차트에 박혀 있어 --set 으로 못 넘긴다.
     파트 담당자가 직접 고쳐야 한다.

       A파트  src/services/timerService.js:44
              redis.config('SET','notify-keyspace-events','Ex') 를 try/catch 로 감쌀 것.
              ElastiCache 는 CONFIG 명령을 차단한다. app.js:81 에서 start() 의
              첫 줄이라 그대로 프로세스가 죽는다(Exit 1). DB 접속까지 가지도 못한다.
              그 값은 elasticache.tf 의 파라미터 그룹에 이미 설정되어 있다.

       B파트  templates/scaled-object.yaml, deployment.yaml, trigger-auth.yaml
              LocalStack 주소와 더미 키(test/test)가 템플릿에 하드코딩되어 있다.
              queueURL 을 실제 SQS 로, awsEndpoint/키/authenticationRef 는 제거,
              IRSA 로 대체해야 한다.
                terraform output -raw sqs_queue_url
                terraform output -raw keda_role_arn
                terraform output -raw worker_b_role_arn

       C파트  --set env.redisHost=<ElastiCache> 로 넘어간다. 코드 수정 불필요.
              (키 이름이 config.redisHost 가 아니라 env.redisHost 다)

       D파트  차트가 자체 Redis 를 포함한다. nodePort 30083 은 ALB 타겟그룹이
              없으니 외부 노출이 필요하면 alb.tf 에 추가해야 한다.

  ■ 6. DB 비밀번호 Secret — 키 이름이 차트마다 다르다
     A파트는 mariadb-credentials 의 MARIADB_ROOT_PASSWORD 를 참조한다.
     password 로 만들면 조용히 빈 값이 들어간다. 반드시 확인할 것.
       kubectl -n queuing-a get deploy api -o jsonpath='{.spec.template.spec.containers[0].env}'
       kubectl -n queuing-a describe secret mariadb-credentials

  ■ 7. SES 프로덕션 액세스 신청 — 승인에 1~2일
     샌드박스에서는 인증된 주소로만 메일이 나간다.

  ■ 8. 확인
     curl -i https://${local.api_domain}/healthz     # C파트
     curl -i https://${local.api_domain}/health      # A파트
     curl -I https://${local.frontend_domain}        # 프론트엔드
  DESC
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

output "jenkins_url" {
  description = "Jenkins 접속 주소. 최초 비밀번호는 아래 명령으로 확인한다."
  value = var.jenkins_enabled ? format(
    "http://%s:8080   (최초 비밀번호: aws ssm start-session --target %s 로 접속 후 sudo cat /var/lib/jenkins/secrets/initialAdminPassword)",
    join("", aws_eip.jenkins[*].public_ip),
    join("", aws_instance.jenkins[*].id)
  ) : "Jenkins 꺼짐 (jenkins_enabled = false)"
}

output "argocd_image_updater_role_arn" {
  description = "ArgoCD Image Updater ServiceAccount 에 붙일 역할 ARN"
  value       = aws_iam_role.argocd_image_updater.arn
}


output "frontend_deploy_guide" {
  description = "프론트엔드 빌드 결과를 S3 에 올리는 방법 (찬규님 전달용)"
  value       = <<-GUIDE
  ■ 테라폼은 파일을 올리지 않는다
    버킷과 CloudFront 만 만든다. 빌드 산출물은 젠킨스가 올린다.
    terraform destroy 가 웹사이트를 지우지 않게 하려는 것이기도 하다.

  ■ 대상
    버킷        : ${aws_s3_bucket.frontend.id}
    배포 ID     : ${aws_cloudfront_distribution.frontend.id}
    주소        : https://${local.frontend_domain}

  ■ 배포 (젠킨스 EC2 에서 실행 — 인스턴스 프로파일이 자동으로 인증한다)

    # 1) 해시가 붙은 정적 자산은 1년 캐시. 파일명이 바뀌므로 무효화가 필요 없다.
    aws s3 sync ./dist s3://${aws_s3_bucket.frontend.id} --delete --exclude "index.html" --cache-control "public,max-age=31536000,immutable"

    # 2) index.html 만 캐시하지 않는다. 이 파일이 새 자산을 가리킨다.
    aws s3 cp ./dist/index.html s3://${aws_s3_bucket.frontend.id}/index.html --cache-control "no-cache,no-store,must-revalidate" --content-type "text/html"

    # 3) index.html 만 무효화. 전체(/*)를 무효화하면 월 1,000건 무료를
    #    금방 넘기고 건당 $0.005 가 붙는다.
    aws cloudfront create-invalidation --distribution-id ${aws_cloudfront_distribution.frontend.id} --paths "/index.html"

  ■ 왜 이렇게 나누나
    CloudFront default_ttl 이 3600 초다. 캐시 헤더를 주지 않고 올리면 새 파일을
    올려도 최대 1시간 동안 옛 화면이 보인다. 위처럼 나누면
      - 해시 붙은 JS/CSS : 파일명이 매번 달라지므로 캐시해도 안전
      - index.html       : 캐시하지 않으므로 배포 즉시 반영
    무효화 대상이 1건뿐이라 요금도 거의 들지 않는다.

  ■ 빌드 산출물 경로
    ./dist 는 Vite 기준이다. CRA 면 ./build 로 바꾼다.
    프론트엔드에서 API 주소도 바꿔야 한다:
      API : https://${local.api_domain}
      WS  : wss://${local.api_domain}/ws

  ■ 젠킨스 잡 구성
    Pipeline 하나를 새로 만들고 위 3단계를 Build 스텝에 넣는다.
    깃 저장소는 feature/frontend 브랜치.
    젠킨스 EC2 에는 이 권한이 이미 붙어 있다 (jenkins.tf).
  GUIDE
}
