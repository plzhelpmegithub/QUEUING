# ──────────────────────────────────────────────
# D-Cloud 연결 — 더존비즈온 온프레미스 MariaDB/FTP
#
# ■ 연결 방식 (2026-09-08 NAT 경유로 변경)
#   EKS Pod (10.0.10.x)
#     → 프라이빗 라우팅 (0.0.0.0/0 → NAT Instance)
#       → NAT 의 고정 EIP 로 출발지 변환
#         → 인터넷 → D-Cloud MariaDB (211.46.52.164:13306)
#
#   앱의 DB 호스트는 D-Cloud 실제 주소를 그대로 쓴다.
#   VPN 을 쓰던 때는 터널 IP(10.100.0.2)를 넣어야 했지만 이제 필요 없다.
#   온프레미스에서 쓰던 접속 정보와 값이 같아져서 혼동이 줄어든다.
#
# ⚠️ D-Cloud 화이트리스트 등록이 선행되어야 한다
#   D-Cloud 는 출발지 IP 로 접속을 허용한다. 사무실에서 붙을 때 계정이
#   'team2'@'118.131.22.85' 형태로 잡히는 것에서 확인된 방식이다.
#   NAT 의 EIP 를 등록하지 않으면 EKS 에서 Access denied 로 막힌다.
#
#     terraform output nat_eip     ← 이 주소를 D-Cloud 관리자에게 전달
#
# ⚠️ 트래픽이 평문이다
#   VPN 터널이 사라지면서 MySQL 프로토콜이 인터넷 구간을 암호화 없이 지난다.
#   MariaDB 는 기본이 평문이고, D-Cloud 인증서가 자체 서명이라 현재 클라이언트는
#   --skip-ssl 로 검증을 끄고 접속한다. 완화하려면 D-Cloud 측 인증서를 신뢰할 수
#   있게 배포하고 앱에서 TLS 를 켜야 한다.
# ──────────────────────────────────────────────

resource "aws_secretsmanager_secret" "dcloud_db" {
  name                    = "${var.project}/dcloud-db"
  recovery_window_in_days = 0

  tags = { Name = "${var.project}-dcloud-db-secret" }
}

resource "aws_secretsmanager_secret_version" "dcloud_db" {
  secret_id = aws_secretsmanager_secret.dcloud_db.id

  secret_string = jsonencode({
    # VPN 을 걷어내면서 터널 IP 대신 D-Cloud 실제 주소를 넣는다.
    host      = var.dcloud_host
    port      = var.dcloud_db_port
    username  = var.dcloud_db_user
    password  = var.dcloud_db_password
    sftp_host = var.dcloud_host
    sftp_port = var.dcloud_sftp_port
  })
}

resource "aws_iam_role_policy" "eks_node_secrets_read" {
  name = "${var.project}-eks-node-secrets-read"
  role = aws_iam_role.eks_node.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [aws_secretsmanager_secret.dcloud_db.arn]
    }]
  })
}
