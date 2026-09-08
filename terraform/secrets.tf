# =============================================================================
# Secrets Manager — 민감 정보 중앙 관리
# =============================================================================
#
# [역할]
# 온프레미스 K8s Secret(mariadb-credentials, gmail-smtp-credentials 등)을 대체.
# DB 비밀번호, SMTP 인증정보, reCAPTCHA 키를 하나의 JSON 시크릿으로 통합 관리.
#
# [K8s Secret과의 차이]
#   K8s Secret    : kubectl create secret → Base64 인코딩 (암호화 아님!)
#   AWS Secrets   : AES-256 자동 암호화, 버전 관리, 감사 로그(CloudTrail),
#                   자동 교체(rotation) 기능 내장.
#
# [ECS에서 참조하는 방식]
#   Task Definition의 "secrets" 블록에서 ARN으로 참조:
#     valueFrom = "<Secret ARN>:DB_PASSWORD::"
#   → ECS Agent가 태스크 시작 시 Secrets Manager에서 값을 가져와 환경변수로 주입.
#   → 이미지나 Task Definition에 평문 비밀번호가 기록되지 않음.
# =============================================================================


# -----------------------------------------------------------------------------
# [Secret 리소스] 시크릿의 "컨테이너" (메타데이터).
# 실제 값은 아래의 aws_secretsmanager_secret_version에 저장.
#
#   name                    : AWS 콘솔에서 표시되는 시크릿 경로명.
#                             "/" 구분으로 폴더처럼 관리 가능.
#   recovery_window_in_days : 삭제 후 복구 가능 기간. 7일 내에 실수 복구 가능.
#                             0으로 설정하면 즉시 삭제 (주의 필요).
# -----------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "api" {
  name                    = "${local.name_prefix}/api-secrets"
  description             = "QUEUING API 환경변수 시크릿 (DB, SMTP, reCAPTCHA)"
  recovery_window_in_days = 7

  tags = { Name = "${local.name_prefix}-api-secrets" }
}

# -----------------------------------------------------------------------------
# [Secret Version] 시크릿의 실제 값. JSON 문자열로 여러 키를 하나에 통합.
#
# 저장되는 JSON 구조:
#   {
#     "DB_PASSWORD": "...",          ← RDS MariaDB 마스터 비밀번호
#     "SMTP_USER": "...",            ← Gmail SMTP 로그인 이메일
#     "SMTP_PASS": "...",            ← Gmail App Password
#     "RECAPTCHA_SECRET_KEY": "..."  ← Google reCAPTCHA v3 서버 키
#   }
#
# terraform.tfvars의 sensitive 변수에서 값을 가져와 JSON으로 직렬화.
# plan/apply 출력에서 실제 값은 "(sensitive value)"로 마스킹됨.
#
# [값 변경 시]
# terraform.tfvars에서 변수 값을 수정하고 terraform apply하면
# 새 Secret Version이 자동 생성된다. ECS 태스크 재시작 시 새 값 반영.
# -----------------------------------------------------------------------------
resource "aws_secretsmanager_secret_version" "api" {
  secret_id = aws_secretsmanager_secret.api.id

  secret_string = jsonencode({
    DB_PASSWORD          = var.db_password
    SMTP_USER            = var.smtp_user
    SMTP_PASS            = var.smtp_pass
    RECAPTCHA_SECRET_KEY = var.recaptcha_secret_key
  })
}
