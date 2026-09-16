variable "project" {
  default = "queuing"
}

variable "region" {
  default = "ap-northeast-2"
}

variable "environment" {
  description = "배포 환경 — prod 면 RDS 다중 AZ·삭제 보호가 켜진다"
  type        = string
  default     = "dev"
}

variable "vpc_cidr" {
  description = "VPC 전체 대역. 온프레미스 192.168.0.0/24 와 겹치면 안 된다"
  default     = "10.0.0.0/16"
}

# ── D-Cloud (더존비즈온 온프레미스 DB/FTP 서버) ──

variable "dcloud_host" {
  description = "D-Cloud 공인 IP"
  default     = "211.46.52.164"
}

variable "dcloud_db_port" {
  description = "D-Cloud MariaDB 포트"
  type        = number
  default     = 13306
}

variable "dcloud_sftp_port" {
  description = "D-Cloud SFTP 포트"
  type        = number
  default     = 2022
}

variable "dcloud_db_user" {
  description = "D-Cloud DB 계정"
  default     = "team2"
}


# ── NAT ──

# ── EKS ──

variable "eks_cluster_version" {
  description = "EKS 클러스터 K8s 버전"
  # 온프레미스가 1.31이라 맞춰뒀었지만, 2026년 9월 기준 1.31은 표준 지원이
  # 끝나고 확장 지원(extended support) 구간이다. 확장 지원 클러스터는
  # 시간당 $0.60 으로 표준 지원 $0.10 의 6배다.
  #   1.31 → 월 $438 / 1.34 → 월 $73  (월 $365 차이)
  # 우리 Helm 차트와 매니페스트는 1.34에서 그대로 동작하므로 맞출 이유가 없다.
  # https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions-standard.html
  default = "1.34"
}

# ⚠️ 온프레미스보다 메모리가 절반 가까이 줄어든다 — 확인하고 정할 것
#
#   온프레미스   : 2 vCPU / 7.2Gi  x 2대  =  4 vCPU / 14.4Gi
#   t3.medium x2 : 2 vCPU / 4.0Gi  x 2대  =  4 vCPU /  8.0Gi   ← 메모리 -44%
#   t3.large  x2 : 2 vCPU / 8.0Gi  x 2대  =  4 vCPU / 16.0Gi   (온프레미스 수준)
#
# CPU 총량은 같다. 그리고 T3 는 기본이 unlimited 모드라 베이스라인(vCPU당 20%)을
# 넘겨도 스로틀링되지 않는다 — 5분짜리 부하 테스트는 영향이 없다. 24시간 평균이
# 베이스라인을 넘으면 초과 크레딧 요금이 붙는데, 부하를 계속 걸어두지 않으면
# 무시할 수준이다.
#   https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-performance-instances-unlimited-mode.html
#
# 문제는 메모리다. 파드 자체의 requests 는 작다(파트별 128Mi).
# 무거운 쪽은 같이 얹히는 것들이다 — kube-prometheus-stack(Prometheus +
# Alertmanager + node-exporter), ArgoCD, KEDA, metrics-server.
# 온프레미스에서 이것들이 7.2Gi x2 위에서 돌고 있었다.
#
# ■ 선택
#   그대로 t3.medium 으로 가고 max_size 6 까지 열어둔다 (기본, 월 $60~)
#     → 모자라면 Cluster Autoscaler 가 노드를 늘린다. 늘어난 만큼만 낸다.
#   t3.large 로 올린다 (월 $120)
#     → 온프레미스와 같은 여유. 노드 수를 안 늘려도 된다.
#
# 기본은 t3.medium + max 6 으로 둔다. 먼저 띄워보고 Pending 파드가 생기면
#   kubectl get pods -A | grep Pending
#   kubectl describe node | grep -A6 "Allocated resources"
# 를 확인한 뒤 올리는 쪽이 낭비가 없다.

variable "eks_node_instance_type" {
  default = "t3.medium"
}

variable "eks_node_desired_size" {
  default = 2
}

variable "eks_node_min_size" {
  default = 2
}

variable "eks_node_max_size" {
  default = 6
}

variable "nodeport_ws" {
  description = "C파트 WebSocket 서버 NodePort"
  default     = 30081
}

variable "nodeport_api" {
  description = "A파트 API 서버 NodePort"
  # redis-api-chart/values.yaml 의 service.nodePort 와 반드시 같아야 한다.
  # 30080으로 잡혀 있었으나 실제 차트 값은 30084라, 이대로 배포하면
  # ALB 헬스체크가 전부 실패해 A파트 타겟이 통째로 unhealthy가 된다.
  default = 30084
}

# ── Redis ──

variable "redis_node_type" {
  default = "cache.t3.micro"
}

# ── 도메인 ──
# 구입한 도메인: queuing.kr
# .kr 은 Route 53에서 등록이 안 되므로 국내 등록기관에서 산 뒤
# 네임서버만 Route 53 호스팅 영역 것으로 바꿔서 쓴다.
# (apply 후 output "route53_nameservers" 참고)

variable "domain_name" {
  description = "루트 도메인 — 프론트엔드가 서비스될 주소"
  default     = "queuing.kr"
}

variable "api_subdomain" {
  description = "ALB(API + WebSocket)가 붙을 서브도메인"
  default     = "api"
}

variable "create_route53_zone" {
  description = <<-DESC
    true  = Route 53 호스팅 영역을 새로 만든다 (등록기관에서 네임서버 변경 필요)
    false = 콘솔에서 이미 만들어둔 영역을 찾아서 쓴다
  DESC
  type        = bool
  default     = true
}

# ── Frontend ──

variable "frontend_domain" {
  description = "프론트엔드 커스텀 도메인 (비워두면 var.domain_name 을 사용)"
  default     = ""
}

# ── 팀원 IAM ──

variable "team_members" {
  description = <<-DESC
    AWS IAM 계정을 만들 팀원 목록과, 각자 편집 권한을 가질 네임스페이스.

    ⚠️ namespaces 를 part 에서 유추하지 않고 직접 적는다.
    처음에는 "queuing-<파트문자>" 로 유추해서 만들었는데 실제 클러스터와 어긋났다.
    (여기에 달러+중괄호를 그대로 쓰면 Terraform 이 보간하려 들어 plan 이 깨진다)
    온프레미스 매니페스트를 확인한 결과는 이렇다.
      chan   (A 찬규) : queuing-a
      geonah (B 건아) : queuing-b
      choi   (C 지예) : realtime  ← queuing-c 가 아니다
      yeji   (D 예지) : monitoring, redis, queuing-d  ← 세 개

    ⚠️ AWS 는 네임스페이스 이름의 존재와 철자를 검증하지 않는다.
    "Amazon EKS doesn't confirm the spelling or existence of the namespaces
     on your cluster."
     https://docs.aws.amazon.com/eks/latest/userguide/access-policies.html
    즉 이름이 틀려도 apply 는 성공하고, 권한만 조용히 생기지 않는다.
    클러스터를 만든 뒤 각자 kubectl 로 확인해야 한다(README 참고).
  DESC

  type = list(object({
    username   = string
    part       = string
    namespaces = list(string)
  }))

  default = [
    # ⚠️ username 은 실제 IAM 사용자 이름과 정확히 같아야 한다.
    # 2026-09-09 콘솔에서 확인한 실제 이름으로 맞췄다 (chan / choi / geonah / yeji).
    # 처음에는 jiye-c, chankyu-a 처럼 파트를 붙인 이름으로 적어뒀었는데
    # 실제와 달랐다. 이름이 다르면 없는 사용자에게 권한을 주는 셈이 된다.
    #   aws iam list-users --query 'Users[].UserName' --output table

    # 정찬규 — A파트 (예매 대기열)
    { username = "chan", part = "a", namespaces = ["queuing-a"] },

    # 김건아 — B파트 (재판매/멤버십)
    { username = "geonah", part = "b", namespaces = ["queuing-b"] },

    # 최지예 — C파트 (실시간 WebSocket) + 인프라
    #
    # ■ 결정: realtime 을 queuing-c 로 바꾸지 않는다 (2026-09-09)
    #   realtime 에는 C파트 앱만 있는 게 아니라 팀 공용 Redis(redis-master)도 있다.
    #   찬규님 차트가 redis-master.realtime.svc.cluster.local 을 가리키므로 Redis 는
    #   옮길 수 없고, 앱만 옮기면 네임스페이스가 두 개로 갈린다.
    #
    # ⚠️ 이 사람이 terraform apply 를 실행하면 아래 Access Entry 에서 제외된다.
    #    terraform_operator_username 설명 참고.
    { username = "choi", part = "c", namespaces = ["realtime", "argocd"] },

    # 최예지 — D파트 (관측성/카운터)
    # monitoring : Prometheus·Alertmanager·ServiceMonitor
    # redis      : redis-counter StatefulSet 과 PVC
    # queuing-d  : 카운터 앱
    { username = "yeji", part = "d", namespaces = ["monitoring", "redis", "queuing-d"] },
  ]
}

# ── RDS (찬규 안에서 가져옴) ──

variable "use_rds" {
  description = <<-DESC
    true  = RDS MariaDB 를 만들고 앱이 그것을 쓴다 (권장)
    false = RDS 를 만들지 않는다. D-Cloud 를 계속 쓸 경우이며,
            NAT 의 EIP 를 D-Cloud 화이트리스트에 등록해야 한다.
  DESC
  type        = bool

  # ⚠️ 기본값을 false 로 바꿨다 (2026-09-09)
  #
  # 통합 당시에는 찬규 안에 RDS 가 있어서 true 로 뒀다. 그런데 찬규님이
  # 같은 날 14:16 푸시에서 rds.tf 를 주석만 남기고 비우고, "외부 D-Cloud
  # MariaDB 를 계속 쓴다"로 방향을 정했다.
  #
  # DB 는 A파트 소유라 파트 담당의 결정을 따른다. 다만 비용은 남는다 —
  # EKS 파드 → NAT → 인터넷 → D-Cloud(211.46.52.164:13306) 구간이 평문이고,
  # D-Cloud 인증서가 자체 서명이라 클라이언트가 --skip-ssl 로 검증을 끈 상태다.
  # 그 구간을 지나는 것은 DB 계정과 예매 조회 결과 전체다.
  #
  # RDS 로 옮기기로 하면 true 로만 바꾸면 된다. rds.tf 는 지우지 않고 남겼다.
  default = false
}

variable "db_engine_version" {
  description = "MariaDB 엔진 버전"
  default     = "10.11"
}

variable "db_instance_class" {
  description = "개발 db.t3.micro / 부하테스트 db.t3.small 이상"
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "초기 스토리지(GiB). 차면 이 값의 2배까지 자동 확장된다"
  type        = number
  default     = 20
}

variable "db_name" {
  default = "queuing_db"
}

variable "db_username" {
  default = "team2"
}

variable "db_password" {
  description = <<-DESC
    RDS 마스터 비밀번호.

    ⚠️ 기본값이 빈 문자열이다. use_rds = false (현재 기본값)이면 RDS 를 만들지
    않으므로 값이 필요 없는데, secrets.tf 의 삼항 연산자가 양쪽 branch 를 모두
    평가하기 때문에 값 자체는 있어야 한다. 빈 문자열로 두면 plan 이 묻지 않는다.

    use_rds = true 로 바꿀 때는 반드시 채워야 한다. 안 채우면 rds.tf 의
    precondition 이 apply 를 막는다.

    ⚠️ terraform.tfvars 에 적지 말고 환경변수로 넘기는 편이 안전하다.
      export TF_VAR_db_password='...'
    어느 쪽이든 tfstate 에는 평문으로 남는다.
  DESC
  type        = string
  default     = ""
  sensitive   = true
}

# ── EKS 노드 디스크 ──

variable "eks_node_volume_size" {
  description = "노드 루트 볼륨(GiB). 컨테이너 이미지가 쌓이므로 넉넉히 잡는다"
  type        = number
  default     = 30
}


# ──────────────────────────────────────────────
# WAF (찬규 안에서 가져옴)
# ──────────────────────────────────────────────

variable "waf_enabled" {
  description = <<-DESC
    true = CloudFront 앞단에 WAF 를 붙인다 (waf.tf).
    ⚠️ 부하 테스트 전에는 false 로 두거나 waf_rate_limit 을 올릴 것.
       JMeter 를 한 대에서 돌리면 전부 같은 IP 로 보여 Rate Limit 에 걸린다.
  DESC
  type        = bool
  default     = true
}

variable "waf_rate_limit" {
  description = "WAF Rate Limit — 같은 IP 에서 5분간 허용할 최대 요청 수. 2000 = 약 6.7 req/s."
  type        = number
  default     = 2000
}

# ──────────────────────────────────────────────
# Redis 노드 수 (찬규 안에서 가져옴)
# ──────────────────────────────────────────────

variable "redis_num_replicas" {
  description = <<-DESC
    ElastiCache Redis 복제본 수. 전체 노드 = 이 값 + 1(Primary).
    1 = Primary + Replica 1 → 자동 페일오버 + Multi-AZ (권장, 월 약 $24)
    0 = 단일 노드 → 페일오버 없음 (월 약 $12). 비용을 줄일 때만.
  DESC
  type        = number
  default     = 1
}

# ──────────────────────────────────────────────
# Secrets Manager 에 넣을 값 (찬규 안에서 가져옴)
#
# 비워두면 빈 문자열이 들어간다. terraform.tfvars 에 적지 말고 환경변수로
# 넘기는 편이 안전하다:
#   export TF_VAR_smtp_pass='...'
# ──────────────────────────────────────────────




# ──────────────────────────────────────────────
# VPC Flow Logs
# ──────────────────────────────────────────────

variable "flow_logs_enabled" {
  description = "true 면 VPC 전체의 통신 기록을 CloudWatch 로 보낸다 (flow_logs.tf)."
  type        = bool
  default     = true
}

variable "flow_logs_traffic_type" {
  description = <<-DESC
    ALL    = 허용 + 거부 전부 (기본). 통신 흐름 전체를 본다.
    REJECT = 막힌 것만. 양이 훨씬 적다. 보안그룹 문제 추적에는 이걸로 충분.
    ACCEPT = 통과한 것만.
  DESC
  type        = string
  default     = "ALL"

  validation {
    condition     = contains(["ALL", "ACCEPT", "REJECT"], var.flow_logs_traffic_type)
    error_message = "ALL, ACCEPT, REJECT 중 하나여야 합니다."
  }
}

variable "flow_logs_retention_days" {
  description = "Flow Logs 보관 일수. 짧을수록 저렴하다. 장애 추적은 대개 며칠 안에 한다."
  type        = number
  default     = 7
}

# ──────────────────────────────────────────────
# ALB 헬스체크 경로
#
# 가볍고 빠른 경로여야 한다. DB/Redis 를 타는 업무 엔드포인트를 쓰면 부하가
# 몰릴 때 헬스체크가 먼저 타임아웃하고, ALB 가 멀쩡한 노드를 빼버린다.
# ──────────────────────────────────────────────

variable "health_check_path_api" {
  description = "A파트 ALB 헬스체크 경로. 200 을 빠르게 돌려주는 경로여야 한다."
  type        = string
  default     = "/health"
}

variable "health_check_path_ws" {
  description = "C파트 ALB 헬스체크 경로. 온프레미스 livenessProbe 와 같은 경로다."
  type        = string
  default     = "/healthz"
}

# ──────────────────────────────────────────────
# 팀원 IAM 계정을 테라폼으로 만들지 여부
# ──────────────────────────────────────────────

variable "create_team_iam_users" {
  description = <<-DESC
    false (기본) = 팀원 IAM 계정을 만들지 않는다.
      2026-09-09 현재 상태다. 콘솔에서 직접 만들어 전달하고 PowerUserAccess 를
      부여한 상태이므로 테라폼이 또 만들 필요가 없다.
      이 값이 false 여도 eks_access.tf 의 EKS 접근 권한은 정상 동작한다
      (계정 ID + 사용자 이름으로 ARN 을 조립해서 연결한다).

    true = 사용자 · 콘솔 비밀번호 · 액세스 키 · 그룹을 테라폼이 만든다.
      ⚠️ 같은 이름의 사용자가 이미 있으면 apply 가 EntityAlreadyExists 로 실패한다.
      ⚠️ 비밀번호와 액세스 키가 tfstate 에 평문으로 기록된다.
      켜려면 콘솔에서 만든 사용자를 먼저 지우거나 terraform import 할 것.

    ⚠️ 어느 쪽이든 team_members 의 username 은 실제 IAM 사용자 이름과
       정확히 같아야 한다. 확인 방법:
         aws iam list-users --query 'Users[].UserName' --output table
  DESC
  type        = bool
  default     = false
}

variable "create_ses_smtp_user" {
  description = <<-DESC
    false (기본) = SES SMTP 전용 IAM 사용자와 액세스 키를 만들지 않는다.
      파드가 SES API 로 메일을 보내는 경로는 IRSA 역할(ses.tf)이 담당하고,
      그쪽은 액세스 키가 필요 없다.

    true = SMTP 자격증명을 만든다.
      Grafana 처럼 SMTP 만 지원하는 프로그램을 SES 에 붙일 때 필요하다.
      지금 Grafana 알림은 Gmail SMTP 를 쓰고 있어서 필요 없는 상태다.
      A·B파트 앱이 SDK 가 아니라 SMTP 로 메일을 보낸다면 true 로 둘 것.

      terraform output -raw ses_smtp_password
  DESC
  type        = bool
  default     = false
}


variable "terraform_operator_username" {
  description = <<-DESC
    terraform apply 를 실행하는 IAM 사용자 이름. 이 사람은 Access Entry 대상에서
    제외된다.

    ■ 왜 제외하나
    eks.tf 의 bootstrap_cluster_creator_admin_permissions = true 때문에, 클러스터를
    만든 주체에게는 EKS 가 자동으로 클러스터 관리자 Access Entry 를 붙여준다.
    Access Entry 는 (클러스터, principal ARN) 조합으로 유일하므로, 같은 사람에게
    테라폼이 또 만들려 하면 이미 있는 항목과 충돌한다.

    또한 인프라 담당은 네임스페이스 하나로 묶으면 곤란하다 — 클러스터 전체
    관리자여야 애드온·노드그룹·다른 파트 문제를 손볼 수 있다. 자동으로 붙는
    관리자 권한이 그 역할에 맞다.

    ■ 다른 계정으로 apply 한다면
    그 사용자 이름으로 바꾼다. 빈 문자열("")로 두면 아무도 제외하지 않는다.
    현재 값이 실제 실행 주체와 다르면 apply 중에 충돌이 날 수 있다.

    확인:
      aws sts get-caller-identity
  DESC
  type        = string
  default     = "choi"
}

# ──────────────────────────────────────────────
# Jenkins (별도 EC2)
# ──────────────────────────────────────────────

variable "jenkins_enabled" {
  description = "true 면 Jenkins 용 EC2 를 만든다 (jenkins.tf). 월 약 $15~30."
  type        = bool
  default     = true
}

variable "jenkins_instance_type" {
  description = <<-DESC
    Jenkins EC2 크기.
    t3.small  (2 vCPU / 2Gi) — 빌드가 가벼우면 충분. 월 약 $15
    t3.medium (2 vCPU / 4Gi) — 도커 빌드가 무거우면. 월 약 $30
  DESC
  type        = string
  default     = "t3.small"
}

variable "jenkins_volume_size" {
  description = <<-DESC
    Jenkins EBS 크기(GiB). 도커 이미지 레이어가 쌓이는 곳이라 넉넉해야 한다.
    온프레미스에서 워커 노드 디스크가 83% 까지 찼던 적이 있다.
    ⚠️ delete_on_termination = false 라서 인스턴스를 지워도 볼륨은 남는다.
       필요 없어지면 콘솔에서 직접 지울 것.
  DESC
  type        = number
  default     = 30
}

variable "jenkins_allowed_cidr" {
  description = <<-DESC
    Jenkins 웹 UI(8080)에 접속할 수 있는 주소 목록.

    ⚠️ 기본값 0.0.0.0/0 은 인터넷 전체에 열린다. 최초 설정 전까지 젠킨스는
       비밀번호가 없는 상태라 위험하다. 팀 사무실 공인 IP 로 좁히는 것을 권한다.
         jenkins_allowed_cidr = ["118.131.22.85/32"]
       (온프레미스에서 D-Cloud 가 이 주소로 접속을 인식하고 있었다)

    ⚠️ 깃허브 웹훅을 쓰려면 깃허브 IP 대역도 열어야 한다. 대신 젠킨스에서
       주기적으로 폴링하게 하면 인바운드를 열지 않아도 된다.
  DESC
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "nat_eip_allocation_id" {
  description = <<-DESC
    이미 있는 EIP 를 NAT 게이트웨이에 재사용한다. 비우면 새로 만든다.

    ⚠️ 근거 정정 (2026-09-09)
    원래 "D-Cloud 화이트리스트 때문에 필수"라고 적었는데 틀렸다. team2 계정이
    team2@% 라 어느 IP 에서든 붙는다(outputs.tf 의 dcloud_db_access 참고).
    필수는 아니지만, 아웃바운드 주소가 매번 바뀌지 않는 편이 로그 대조나
    나중의 IP 기반 연동에 유리해서 그대로 둔다.

    현재 EIP 를 계속 쓰는 방법은 vpc.tf 의 aws_eip.nat 주석 참고.
    붙어 있지 않은 EIP 는 시간당 $0.005 (월 약 $3.6).
  DESC
  type        = string
  default     = ""
}
