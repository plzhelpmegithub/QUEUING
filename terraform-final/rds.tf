# ──────────────────────────────────────────────
# RDS MariaDB — 애플리케이션 데이터베이스
#
# ■ 출처: 찬규(A) 안. 백업·암호화·환경별 분기까지 잘 되어 있어 거의 그대로 가져왔다.
#
# ■ 왜 D-Cloud 대신 RDS 인가
# 온프레미스에서는 D-Cloud(211.46.52.164:13306)를 쓰고 있다. AWS 에서 그걸 계속
# 쓰려면 NAT 를 거쳐 공인망으로 나가야 하는데, MySQL 프로토콜은 기본이 평문이라
# DB 계정과 조회 데이터가 인터넷 구간을 암호화 없이 지난다. D-Cloud 인증서가
# 자체 서명이라 클라이언트도 --skip-ssl 로 검증을 끄고 붙는 상황이다.
#
# RDS 는 VPC 안에 있어 그 구간이 아예 사라진다. 저장 암호화·자동 백업도 딸려온다.
#
# ■ D-Cloud 를 계속 쓰려면
# use_rds = false 로 두면 RDS 를 만들지 않는다. 그 경우 NAT 의 EIP 를 D-Cloud
# 화이트리스트에 등록해야 한다(vpc.tf 주석 참고). 데이터 이전 일정 때문에
# 당분간 D-Cloud 를 써야 한다면 그렇게 시작하고 나중에 옮겨도 된다.
#
# ■ 이전 시 확인할 것
#   - 온프레미스 엔진 버전과 맞는지 (현재 D-Cloud 는 MariaDB 계열)
#   - A파트 앱이 시작할 때 테이블 9개를 자동 생성하므로 빈 DB 로 시작해도 된다
#   - 기존 데이터가 필요하면 mysqldump 로 옮긴다
# ──────────────────────────────────────────────

resource "aws_db_subnet_group" "main" {
  count = var.use_rds ? 1 : 0

  name       = "${var.project}-db-subnet"
  subnet_ids = aws_subnet.private[*].id

  tags = { Name = "${var.project}-db-subnet-group" }
}

resource "aws_db_instance" "mariadb" {
  count = var.use_rds ? 1 : 0

  identifier = "${var.project}-mariadb"

  engine         = "mariadb"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  allocated_storage = var.db_allocated_storage
  # 용량이 차면 자동으로 늘린다. 부하 테스트 중 디스크가 차서 멈추는 것을 막는다.
  max_allocated_storage = var.db_allocated_storage * 2
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password
  port     = 3306

  db_subnet_group_name   = aws_db_subnet_group.main[0].name
  vpc_security_group_ids = [aws_security_group.rds.id]

  # 프라이빗 서브넷 안에서만 접근된다. 인터넷에서 직접 붙을 수 없다.
  publicly_accessible = false

  # prod 에서만 다중 AZ. 대기 인스턴스가 하나 더 떠서 비용이 두 배가 된다.
  multi_az = var.environment == "prod"

  backup_retention_period = 7
  backup_window           = "03:00-04:00" # UTC — 한국 시간 정오 무렵
  maintenance_window      = "Mon:04:00-Mon:05:00"

  # 학습 환경에서는 destroy 가 막히면 곤란하므로 prod 가 아닐 때만 완화한다.
  skip_final_snapshot       = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "${var.project}-mariadb-final" : null
  deletion_protection       = var.environment == "prod"

  tags = { Name = "${var.project}-mariadb" }
}
