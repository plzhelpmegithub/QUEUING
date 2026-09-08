# =============================================================================
# RDS — AWS 관리형 MariaDB
# =============================================================================
#
# [역할]
# 온프레미스 외부 MariaDB(211.46.52.164:13306)를 대체.
# 회원 정보(users), 예매 내역(reservations), 좌석(seats),
# 대기열(waiting_queue), 결제(payments) 등 영속 데이터 저장.
#
# [관리형 RDS의 장점]
#   - 자동 백업 (매일 스냅샷 + 트랜잭션 로그)
#   - 특정 시점 복원 (Point-in-Time Recovery)
#   - Multi-AZ 자동 장애 복구 (prod 환경)
#   - OS/DB 패치 자동 적용 (유지보수 윈도우)
#   - 스토리지 자동 확장 (max_allocated_storage까지)
#   - CloudWatch 모니터링 (CPU, 메모리, IOPS, 커넥션 수 등)
#
# [네트워크 보안]
#   Private Subnet에 배치 → 인터넷에서 접근 불가 (publicly_accessible = false)
#   ECS Security Group에서만 3306 포트 접근 허용.
# =============================================================================


# -----------------------------------------------------------------------------
# [DB Subnet Group] RDS 인스턴스가 배치될 서브넷 그룹.
#
# Multi-AZ 활성화 시 Primary는 AZ-a, Standby는 AZ-c에 자동 배치.
# 장애 발생 시 Standby로 자동 페일오버 (60~120초).
# -----------------------------------------------------------------------------
resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-db-subnet"
  subnet_ids = aws_subnet.private[*].id   # Private Subnet 2개

  tags = { Name = "${local.name_prefix}-db-subnet-group" }
}

# -----------------------------------------------------------------------------
# [RDS Instance] MariaDB 데이터베이스 인스턴스.
#
#   identifier    : RDS 인스턴스 식별자 (AWS 콘솔, CLI에서 참조)
#
# --- 엔진 설정 ---
#   engine         : "mariadb" (MySQL 호환. 현재 코드가 MariaDB 사용)
#   engine_version : 10.11 (LTS 버전. 2028년까지 지원)
#   instance_class : 인스턴스 크기. db.t3.micro = 2 vCPU, 1 GiB RAM.
#
# --- 스토리지 ---
#   allocated_storage     : 초기 디스크 크기 (20 GiB)
#   max_allocated_storage : 자동 확장 상한 (40 GiB). 디스크 사용률이 높아지면 자동 증가.
#   storage_type          : "gp3" = 범용 SSD. 기본 3,000 IOPS 포함, 비용 효율적.
#   storage_encrypted     : true = AES-256 서버사이드 암호화. 디스크, 스냅샷, 로그 전부 암호화.
#
# --- 인증 ---
#   db_name  : 인스턴스 생성 시 자동으로 만들 DB 이름 (API의 DB_NAME)
#   username : 마스터 유저 (API의 DB_USER)
#   password : 마스터 비밀번호 (terraform.tfvars에서 주입, Secrets Manager에도 저장)
#   port     : 3306 (MariaDB 기본 포트)
#
# --- 네트워크 ---
#   db_subnet_group_name   : Private Subnet 그룹에 배치
#   vpc_security_group_ids : ECS에서만 접근 허용하는 SG
#   publicly_accessible    : false = 인터넷에서 접근 불가 (Private Subnet + 이 옵션)
#
# --- 고가용성 ---
#   multi_az : prod이면 true (2 AZ에 Primary + Standby 배치, 자동 페일오버)
#              dev이면 false (단일 AZ, 비용 절감)
#
# --- 백업 ---
#   backup_retention_period : 자동 백업 보관 기간. 7일 = 7일 전까지 복원 가능.
#   backup_window           : 백업 실행 시간 (UTC). 03:00~04:00 = 한국시간 12:00~13:00.
#   maintenance_window      : OS/DB 패치 적용 시간. Mon 04:00~05:00 UTC.
#
# --- 삭제 보호 ---
#   skip_final_snapshot       : dev이면 true (삭제 시 스냅샷 생략), prod이면 false.
#   final_snapshot_identifier : prod 삭제 시 최종 스냅샷 이름. 데이터 복구 가능.
#   deletion_protection       : prod이면 true. AWS 콘솔/CLI에서 실수로 삭제 방지.
#                                terraform destroy 전에 false로 변경 필요.
# -----------------------------------------------------------------------------
resource "aws_db_instance" "mariadb" {
  identifier = "${local.name_prefix}-mariadb"

  engine               = "mariadb"
  engine_version       = "10.11"
  instance_class       = var.db_instance_class
  allocated_storage    = var.db_allocated_storage
  max_allocated_storage = var.db_allocated_storage * 2
  storage_type         = "gp3"
  storage_encrypted    = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password
  port     = 3306

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  multi_az            = var.environment == "prod" ? true : false
  publicly_accessible = false

  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  skip_final_snapshot       = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "${local.name_prefix}-mariadb-final" : null
  deletion_protection       = var.environment == "prod"

  parameter_group_name = "default.mariadb10.11"

  tags = { Name = "${local.name_prefix}-mariadb" }
}
