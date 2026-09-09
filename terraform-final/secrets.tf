# ──────────────────────────────────────────────
# Secrets Manager — 민감정보 중앙 관리
#
# ■ 출처: 찬규(A) 안. 2026-09-09 푸시에서 새로 추가된 것을 가져왔다.
#   JSON 하나에 여러 키를 담는 구성을 유지하고, 변수 이름만 통합본에 맞췄다.
#
# ■ 지금 온프레미스 상태와 비교
# 현재는 kubectl create secret 으로 만든 K8s Secret 에 흩어져 있다.
#   mariadb-credentials / grafana-smtp / redis-counter-secret / dockerhub-creds
# K8s Secret 은 암호화가 아니라 base64 인코딩이다. etcd 암호화를 따로 켜지
# 않았으면 etcd 를 읽을 수 있는 사람은 값을 그대로 본다. 실제로 예지님 RBAC
# 에서 secrets 읽기 권한을 뺀 이유가 이것이었다(shared-infra/yeji-rbac.yaml).
#
# Secrets Manager 는 AES-256 저장 암호화 + 버전 관리 + CloudTrail 감사 로그가
# 기본이고, 접근 권한을 IAM 으로 통제한다.
#
# ■ 파드가 이 값을 읽는 방법 (apply 만으로는 연결되지 않는다)
# 둘 중 하나를 클러스터에 설치해야 한다.
#   1) Secrets Store CSI Driver + AWS provider — 파드에 파일로 마운트
#   2) External Secrets Operator — Secrets Manager → K8s Secret 으로 동기화
# 두 방법 모두 IRSA 로 secretsmanager:GetSecretValue 권한이 필요하다.
# 아래 aws_iam_policy.secrets_read 가 그 권한이고, irsa.tf 에서 각 파트
# ServiceAccount 역할에 붙이면 된다.
#
# ⚠️ tfstate 에 평문으로 남는다
# secret_string 은 상태 파일에 그대로 기록된다. .gitignore 로 tfstate 를
# 제외해뒀지만, 팀에서 S3 백엔드를 쓰기로 하면 그 버킷의 암호화와 접근 권한이
# 곧 비밀번호 보호 수준이 된다.
# ──────────────────────────────────────────────

resource "aws_secretsmanager_secret" "api" {
  name        = "${var.project}/api-secrets"
  description = "QUEUING 애플리케이션 시크릿 (DB, SMTP, reCAPTCHA)"

  # 삭제 후 7일 내에는 복구할 수 있다. 0 으로 두면 즉시 삭제된다.
  # ⚠️ 같은 이름으로 다시 만들려면 복구 대기 기간이 끝나야 한다 —
  #    destroy 후 바로 apply 하면 "scheduled for deletion" 오류가 난다.
  recovery_window_in_days = 7

  tags = { Name = "${var.project}-api-secrets" }
}

resource "aws_secretsmanager_secret_version" "api" {
  secret_id = aws_secretsmanager_secret.api.id

  # DB 비밀번호는 use_rds 값에 따라 출처가 달라진다.
  #   use_rds = true  → RDS 에 설정한 db_password
  #   use_rds = false → 외부 D-Cloud MariaDB 의 dcloud_db_password
  # 앱은 어느 쪽이든 DB_PASSWORD 키 하나만 읽으면 된다.
  secret_string = jsonencode({
    DB_PASSWORD          = var.use_rds ? var.db_password : var.dcloud_db_password
    SMTP_USER            = var.smtp_user
    SMTP_PASS            = var.smtp_pass
    RECAPTCHA_SECRET_KEY = var.recaptcha_secret_key
  })
}

# ── 이 시크릿만 읽을 수 있는 정책 ──
#
# Resource 를 "*" 가 아니라 이 시크릿 ARN 으로 좁힌다. 계정에 다른 시크릿이
# 생겼을 때 자동으로 읽히지 않게 하기 위함이다.
resource "aws_iam_policy" "secrets_read" {
  name        = "${var.project}-secrets-read"
  description = "QUEUING api-secrets 읽기 전용"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
      Resource = [aws_secretsmanager_secret.api.arn]
    }]
  })
}
