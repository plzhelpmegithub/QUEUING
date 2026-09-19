# ──────────────────────────────────────────────
# RDS Proxy — 커넥션을 모아서 나눠 쓴다 (2026-09-19)
#
# ■ 왜
#   2026-09-18 에 DB 성능이 아니라 커넥션 수로 장애가 났다. api 파드 10개 × 풀 10 이
#   max_connections 72 를 넘어 파드 2개가 CrashLoopBackOff 로 죽었다. 150 으로 올렸지만
#   파드·Lambda 가 늘면 다시 닿는다. Proxy 는 앱 쪽 커넥션을 받아 DB 쪽 커넥션을
#   적게 유지하며 돌려 쓴다. 특히 Lambda 처럼 짧게 붙었다 끊는 쪽에서 효과가 크다.
#
#   Multi-AZ 와 같이 쓰면 장애 조치 때도 앱 커넥션을 붙잡아 둔다
#   (DB 주소가 바뀌어도 Proxy 주소는 그대로다).
#
# ■ 확인한 것 (2026-09-19, AWS 문서·가격 API)
#   - 서울 리전 RDS for MariaDB 10.11 지원
#   - 가격 $0.018 / vCPU·시간 → db.t3.small(2 vCPU) 월 약 $26
#   - MariaDB 제약: TLS 1.3 미지원, auth_ed25519 미지원, 압축 모드 미지원,
#                   16KB 넘는 SQL 은 커넥션을 고정(pinning)한다
#
# ■ 연결 전환은 한 곳씩 해도 된다
#   DB 이관 때와 달리 Proxy 뒤는 같은 DB 라 데이터가 갈라지지 않는다.
#     B파트 Lambda   b_lambda_use_proxy = true (이 저장소)
#     A파트 api      Helm values DB_HOST → rds_proxy_endpoint (찬규님)
#     D파트 counter  DB_HOST → rds_proxy_endpoint (예지님)
#   백업 CronJob 은 직접 연결을 유지한다 (덤프는 긴 세션이라 Proxy 이점이 없다).
# ──────────────────────────────────────────────

variable "rds_proxy_enabled" {
  description = "RDS Proxy 를 만든다. 월 약 $26 (서울, db.t3.small 2 vCPU 기준)."
  type        = bool
  default     = true
}

variable "b_lambda_use_proxy" {
  description = <<-DESC
    B파트 Lambda 가 RDS 에 직접 붙지 않고 Proxy 를 거친다.
    Proxy 대상이 AVAILABLE 이 된 것을 확인한 뒤에 켠다. 같은 apply 에서 켜면
    Proxy 가 DB 에 붙기 전에 Lambda 가 먼저 바뀌어 잠깐 접속이 실패할 수 있다.

    2026-09-19 09:58 AVAILABLE 확인, EKS 파드에서 Proxy 경유 쿼리 성공 후 켰다.
    Proxy 를 처음부터 새로 만드는 경우(rds_proxy_enabled 를 껐다 켤 때)에는
    먼저 false 로 두고 apply → AVAILABLE 확인 → true 로 다시 apply 한다.
  DESC
  type        = bool
  default     = true
}

locals {
  rds_proxy_on = var.use_rds && var.rds_proxy_enabled
}

# ── Proxy 가 DB 에 로그인할 자격증명 ──
#
# Proxy 는 {"username":..., "password":...} 형식의 시크릿만 읽는다.
# queuing-persistent/app-secrets 는 키 이름이 RDS_PASSWORD 라 그대로 못 쓴다.
# 값은 거기서 읽은 것(local.rds_password)을 그대로 쓰므로 비밀번호가 둘로 갈라지지 않는다.
resource "aws_secretsmanager_secret" "rds_proxy" {
  count       = local.rds_proxy_on ? 1 : 0
  name_prefix = "${var.project}/rds-proxy-auth-"
  description = "RDS Proxy 가 queuing-mariadb 에 로그인하는 계정. 값은 app-secrets 의 RDS_PASSWORD 와 같다."

  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "rds_proxy" {
  count     = local.rds_proxy_on ? 1 : 0
  secret_id = aws_secretsmanager_secret.rds_proxy[0].id
  secret_string = jsonencode({
    username = var.db_username
    password = local.rds_password
  })
}

# ── Proxy 가 그 시크릿을 읽을 권한 ──
resource "aws_iam_role" "rds_proxy" {
  count = local.rds_proxy_on ? 1 : 0
  name  = "${var.project}-rds-proxy-role"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "rds.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "rds_proxy" {
  count = local.rds_proxy_on ? 1 : 0
  name  = "${var.project}-rds-proxy-read-secret"
  role  = aws_iam_role.rds_proxy[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadProxyAuthSecret"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.rds_proxy[0].arn
      },
      {
        # 시크릿은 AWS 관리형 키(aws/secretsmanager)로 암호화돼 있다.
        # Secrets Manager 를 거칠 때만 풀 수 있게 좁힌다.
        Sid      = "DecryptViaSecretsManager"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = "*"
        Condition = {
          StringEquals = { "kms:ViaService" = "secretsmanager.${var.region}.amazonaws.com" }
        }
      },
    ]
  })
}

# ── Proxy 보안그룹 ──
# EKS 노드(api·counter 파드)와 B파트 Lambda 에서 오는 3306 만 받는다.
# RDS 쪽에서 이 그룹을 허용하는 규칙은 security_groups.tf 의 RDS 보안그룹에 있다.
resource "aws_security_group" "rds_proxy" {
  count       = local.rds_proxy_on ? 1 : 0
  name_prefix = "${var.project}-rds-proxy-"
  vpc_id      = aws_vpc.main.id
  description = "RDS Proxy - inbound from EKS nodes and B-part Lambda"

  ingress {
    description     = "MariaDB from EKS nodes"
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_nodes.id]
  }

  dynamic "ingress" {
    for_each = local.b_wf == 1 ? [1] : []
    content {
      description     = "MariaDB from B-part Lambda"
      from_port       = 3306
      to_port         = 3306
      protocol        = "tcp"
      security_groups = [aws_security_group.b_lambda[0].id]
    }
  }

  egress {
    description = "To RDS 3306"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-sg-rds-proxy" }

  lifecycle { create_before_destroy = true }
}

# ── Proxy 본체 ──
resource "aws_db_proxy" "mariadb" {
  count = local.rds_proxy_on ? 1 : 0

  name = "${var.project}-mariadb-proxy"

  # MariaDB 도 MYSQL 계열로 등록한다 (엔진 계열 값은 MYSQL / POSTGRESQL / SQLSERVER 뿐).
  engine_family = "MYSQL"

  role_arn               = aws_iam_role.rds_proxy[0].arn
  vpc_subnet_ids         = aws_subnet.private[*].id
  vpc_security_group_ids = [aws_security_group.rds_proxy[0].id]

  # 앱들은 지금 VPC 안에서 평문으로 RDS 에 붙는다. TLS 를 강제하면 api·counter·Lambda 의
  # 접속 설정을 전부 바꿔야 해서 끈다. 트래픽은 VPC 밖으로 나가지 않는다.
  require_tls = false

  # 앱이 쥐고만 있는 커넥션을 30분 뒤 정리한다.
  idle_client_timeout = 1800

  auth {
    auth_scheme = "SECRETS"
    iam_auth    = "DISABLED"
    secret_arn  = aws_secretsmanager_secret.rds_proxy[0].arn
    description = "team2 account"

    # MariaDB 는 caching_sha2_password 를 지원하지 않는다.
    client_password_auth_type = "MYSQL_NATIVE_PASSWORD"
  }

  tags = { Name = "${var.project}-mariadb-proxy" }

  depends_on = [aws_iam_role_policy.rds_proxy, aws_secretsmanager_secret_version.rds_proxy]
}

resource "aws_db_proxy_default_target_group" "mariadb" {
  count         = local.rds_proxy_on ? 1 : 0
  db_proxy_name = aws_db_proxy.mariadb[0].name

  connection_pool_config {
    # DB 한도(150)의 90% = 135 까지만 Proxy 가 쓴다. 나머지 15 는 백업 CronJob·
    # 직접 접속(점검용 mysql 파드)·RDS 관리 계정 몫으로 남긴다.
    max_connections_percent      = 90
    max_idle_connections_percent = 50

    # 커넥션이 모자라면 앱 요청을 최대 2분 기다리게 한다. 바로 거절하지 않는다.
    connection_borrow_timeout = 120
  }
}

resource "aws_db_proxy_target" "mariadb" {
  count                  = local.rds_proxy_on ? 1 : 0
  db_instance_identifier = aws_db_instance.mariadb[0].identifier
  db_proxy_name          = aws_db_proxy.mariadb[0].name
  target_group_name      = aws_db_proxy_default_target_group.mariadb[0].name
}

output "rds_proxy_endpoint" {
  description = "앱이 DB_HOST 로 쓸 Proxy 주소 (포트 3306, 계정·비밀번호·DB 이름은 RDS 와 같다)"
  value       = local.rds_proxy_on ? aws_db_proxy.mariadb[0].endpoint : null
}
