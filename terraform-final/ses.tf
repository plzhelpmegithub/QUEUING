# ──────────────────────────────────────────────
# SES — 메일 발송 (B파트 알림 · Grafana 알림)
#
# ■ 출처: 예지(D) 안. SMTP 자격증명 생성 방식이 특히 잘 되어 있어 그대로 가져왔다.
#
# ■ 온프레미스에서 바뀌는 것
#   지금은 LocalStack 의 가짜 SES 와 Gmail SMTP 를 섞어 쓰고 있다.
#   Gmail 은 앱 비밀번호가 필요하고 하루 발송량 제한도 있어 실서비스엔 맞지 않는다.
#   AWS 로 옮기면 SES 하나로 통일된다.
#
# ⚠️ 샌드박스 해제를 미리 신청할 것
# SES 는 기본이 샌드박스 모드다. 이 상태에서는 아래에서 인증한 주소로만 메일이
# 나간다 — 실제 사용자에게는 못 보낸다. 프로덕션 액세스는 콘솔에서 신청하며
# 승인에 보통 1~2일 걸린다. 발표 일정이 있다면 지금 신청해두는 편이 안전하다.
#
#   AWS 콘솔 → SES → Account dashboard → Request production access
#
# ■ 도메인 인증이 더 낫다 (선택)
# 주소 하나만 인증하면 그 주소로만 보낼 수 있다. queuing.kr 도메인을 인증하면
# noreply@queuing.kr, alert@queuing.kr 처럼 자유롭게 쓸 수 있고 수신측 신뢰도도
# 올라간다. Route 53 을 쓰고 있으니 DKIM 레코드 자동 등록도 가능하다.
# 지금은 예지 안의 주소 인증 방식을 유지한다.
# ──────────────────────────────────────────────

resource "aws_ses_email_identity" "sender" {
  email = var.ses_sender_email
}

# ── SMTP 자격증명 ──
#
# SES 를 SMTP 로 쓰려면 전용 사용자와 비밀번호가 필요하다. 그런데 IAM 시크릿
# 액세스 키를 그대로 쓰면 안 되고, SES 전용 알고리즘으로 변환한 값을 써야 한다.
# 테라폼의 ses_smtp_password_v4 속성이 그 변환을 해준다. 예지 안에서 이 부분을
# 정확히 짚어놓아 그대로 가져왔다.
resource "aws_iam_user" "ses_smtp" {
  # create_ses_smtp_user = false (기본) 이면 만들지 않는다.
  # 파드에서 SES API 로 보내는 경로는 아래 IRSA 역할이 담당하고, 그쪽은
  # 액세스 키가 필요 없다. SMTP 자격증명은 Grafana 처럼 SMTP 만 지원하는
  # 프로그램을 SES 에 붙일 때만 필요하다.
  count = var.create_ses_smtp_user ? 1 : 0

  name = "${var.project}-ses-smtp"

  tags = { Name = "${var.project}-ses-smtp" }
}

resource "aws_iam_user_policy" "ses_smtp" {
  count = var.create_ses_smtp_user ? 1 : 0

  name = "${var.project}-ses-send"
  user = aws_iam_user.ses_smtp[0].name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ses:SendRawEmail", "ses:SendEmail"]
      Resource = "*"
    }]
  })
}

resource "aws_iam_access_key" "ses_smtp" {
  count = var.create_ses_smtp_user ? 1 : 0

  user = aws_iam_user.ses_smtp[0].name
}

# ── 파드에서 IRSA 로 직접 보내는 경로 (SMTP 대신) ──
#
# 애플리케이션이 AWS SDK 로 SES 를 호출한다면 SMTP 자격증명이 필요 없다.
# A파트 notificationService.js 가 @aws-sdk/client-ses 를 쓰고 있어 이 방식이 맞다.
data "aws_iam_policy_document" "ses_send_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.eks.arn]
    }

    condition {
      test     = "StringLike"
      variable = "${local.oidc_host}:sub"
      # A파트와 B파트 양쪽에서 쓸 수 있게 열어둔다.
      values = [
        "system:serviceaccount:queuing-a:*",
        "system:serviceaccount:queuing-b:*",
      ]
    }
  }
}

resource "aws_iam_role" "ses_send" {
  name               = "${var.project}-ses-send-role"
  assume_role_policy = data.aws_iam_policy_document.ses_send_assume.json
}

resource "aws_iam_role_policy" "ses_send" {
  name = "${var.project}-ses-send"
  role = aws_iam_role.ses_send.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      # ⚠️ SNS 를 추가했다 (2026-09-09).
      #
      # A파트 src/services/notificationService.js 가 SES 뿐 아니라 SNS 도 쓴다.
      #   const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
      #   await snsClient.send(new PublishCommand({ ... }))
      #
      # 원래 이 역할에는 ses:* 만 있어서, 알림을 보내는 순간 AccessDenied 가
      # 났을 것이다. 배포 전에는 드러나지 않는 종류라 코드를 읽어보고서야 찾았다.
      #
      # ⚠️ 토픽은 테라폼이 만들지 않는다. 앱이 어떤 TopicArn 을 쓰는지 아직
      #    확인되지 않았다(환경변수에도 없다). 토픽 이름이 정해지면
      #    aws_sns_topic 을 추가하고 Resource 를 그 ARN 으로 좁힐 것.
      #    지금은 계정 안의 토픽 전체가 대상이다.
      Action = [
        "ses:SendEmail",
        "ses:SendRawEmail",
        "sns:Publish",
        "sns:GetTopicAttributes",
        "sns:ListTopics",
      ]
      Resource = "*"
    }]
  })
}
