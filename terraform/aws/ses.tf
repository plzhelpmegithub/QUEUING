# SES 이메일 발신 도메인/주소 등록
# domain 대신 email_identity로 하면 도메인 인증 없이 단일 이메일 주소로도 가능 (간단하지만 발신 주소 하나만 씀)
resource "aws_ses_email_identity" "sender" {
  email = var.ses_sender_email
}

# Grafana가 SES를 통해 메일을 보낼 수 있도록 하는 IAM 사용자
resource "aws_iam_user" "ses_smtp" {
  name = "${var.project_name}-ses-smtp-user"
}

resource "aws_iam_user_policy" "ses_smtp_policy" {
  name = "${var.project_name}-ses-smtp-policy"
  user = aws_iam_user.ses_smtp.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "ses:SendRawEmail"
      Resource = "*"
    }]
  })
}

# SMTP 인증에 쓸 Access Key 발급
resource "aws_iam_access_key" "ses_smtp" {
  user = aws_iam_user.ses_smtp.name
}

output "ses_smtp_username" {
  value = aws_iam_access_key.ses_smtp.id
}

output "ses_smtp_password_secret" {
  value     = aws_iam_access_key.ses_smtp.ses_smtp_password_v4
  sensitive = true
}
