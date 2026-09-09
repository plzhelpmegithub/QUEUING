# =============================================================================
# RDS — 사용하지 않음 (외부 D-Cloud MariaDB 사용)
# =============================================================================
#
# 이 프로젝트는 AWS RDS 대신 외부 D-Cloud MariaDB를 사용한다.
# (User, Event, Membership, Seat, Waitlist, CancelPool, Wishlist, Reservation DB)
#
# API Pod는 NAT Gateway를 통해 외부 D-Cloud MariaDB에 접속한다.
# 연결 정보(DB_HOST, DB_PORT, DB_USER)는 K8s ConfigMap 또는 환경변수로 주입하고,
# DB_PASSWORD는 Secrets Manager(secrets.tf)에서 관리한다.
#
# [트래픽 흐름]
#   EKS Pod(Private Subnet) → NAT Gateway(Public Subnet) → IGW → D-Cloud MariaDB
# =============================================================================
