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

# 비밀번호는 Secrets Manager 에서 읽는다 (2026-09-18).
# queuing-persistent/ 는 terraform 밖에서 관리되는 영구 시크릿이라 destroy 해도 남는다.
# TF_VAR_db_password 를 매번 넘기던 것을 대체한다. 환경변수를 주면 그쪽이 우선한다.
data "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = "queuing-persistent/app-secrets"
}

locals {
  # B파트 Lambda 도 같은 시크릿에서 비밀번호를 읽는다(b_part_resale_workflow.tf).
  app_secrets  = jsondecode(data.aws_secretsmanager_secret_version.app_secrets.secret_string)
  rds_password = var.db_password != "" ? var.db_password : try(local.app_secrets["RDS_PASSWORD"], "")
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
  password = local.rds_password

  # 비밀번호가 비어 있으면 여기서 멈춘다. 없으면 AWS 가 InvalidParameterValue 로
  # 거부하는데, 그 메시지만 봐서는 무엇을 안 채웠는지 알기 어렵다.
  lifecycle {
    precondition {
      condition     = local.rds_password != ""
      error_message = "RDS 비밀번호를 찾지 못했다. Secrets Manager 의 queuing-persistent/app-secrets 에 RDS_PASSWORD 키가 있는지 확인하거나, TF_VAR_db_password 로 넘길 것."
    }
  }
  port = 3306

  db_subnet_group_name   = aws_db_subnet_group.main[0].name
  vpc_security_group_ids = [aws_security_group.rds[0].id]

  # 프라이빗 서브넷 안에서만 접근된다. 인터넷에서 직접 붙을 수 없다.
  publicly_accessible = false

  # prod 에서만 다중 AZ. 대기 인스턴스가 하나 더 떠서 비용이 두 배가 된다.
  multi_az = var.environment == "prod"

  backup_retention_period = 7
  backup_window           = "03:00-04:00" # UTC — 한국 시간 정오 무렵
  maintenance_window      = "Mon:04:00-Mon:05:00"

  # ⚠️ 2026-09-18: 매일 destroy 하던 방식을 그만두고 이 DB 에 실제 데이터를 넣었다
  #    (D-Cloud 에서 테이블 12개 이관). 그래서 학습용 설정을 방어 설정으로 바꾼다.
  #
  #    이전에는 environment != "prod" 라서 삭제 방어가 꺼져 있었고 최종 스냅샷도
  #    남기지 않았다. tfvars 의 use_rds 가 false 로 되돌아가기만 해도 데이터와
  #    자동 백업이 한꺼번에 사라지는 상태였다.
  #
  #    정말로 지워야 할 때는 이 두 줄을 먼저 되돌리고 apply 한 다음 destroy 한다.
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.project}-mariadb-final"
  deletion_protection       = true

  tags = { Name = "${var.project}-mariadb" }
}
