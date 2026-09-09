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

variable "dcloud_db_password" {
  description = "D-Cloud DB 비밀번호 — use_rds = false 로 D-Cloud 를 계속 쓸 때만 필요하다"
  type        = string
  sensitive   = true
  default     = ""
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
  default = 4
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
  description = "AWS IAM 계정을 만들 팀원 목록"
  type = list(object({
    username = string
    part     = string
  }))
  default = [
    { username = "jiye-c",    part = "c" },  # 최지예 — C파트 (실시간 WebSocket)
    { username = "chankyu-a", part = "a" },  # 정찬규 — A파트 (예매 대기열)
    { username = "geona-b",   part = "b" },  # 김건아 — B파트 (재판매/멤버십)
    { username = "yeji-d",    part = "d" },  # 최예지 — D파트 (관측성/카운터)
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
  default     = true
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
  description = "RDS 마스터 비밀번호 — terraform.tfvars 또는 TF_VAR_db_password 로 전달. 커밋 금지"
  type        = string
  sensitive   = true
}

# ── SES (예지 안에서 가져옴) ──

variable "ses_sender_email" {
  description = <<-DESC
    발신용 이메일 주소. SES 가 인증 메일을 보내며, 그 링크를 눌러야 발송이 가능해진다.
    샌드박스 상태에서는 인증된 주소로만 보낼 수 있으므로 프로덕션 액세스를 미리 신청할 것.
  DESC
  default     = "chlwldp02naver@gmail.com"
}

# ── EKS 노드 디스크 ──

variable "eks_node_volume_size" {
  description = "노드 루트 볼륨(GiB). 컨테이너 이미지가 쌓이므로 넉넉히 잡는다"
  type        = number
  default     = 30
}
