# ──────────────────────────────────────────────
# ElastiCache Redis
# 기존 구조: C파트 자체 Redis + A파트 Redis(192.168.0.190) → 하나로 통합됨
# AWS: 하나의 ElastiCache를 공유 (같은 VPC 안이라 분리 불필요)
#
# ■ 커스텀 파라미터 그룹이 필요한 이유
# A파트(찬규님)의 "10분 결제 타이머 만료 → 좌석 자동 해제" 기능은 Redis
# keyspace notification(notify-keyspace-events=Ex)에 의존함. self-hosted
# Redis에서는 앱이 시작할 때 CONFIG SET으로 직접 설정하지만, ElastiCache는
# 보안상 클라이언트의 CONFIG SET을 막아둠 — 반드시 Parameter Group으로
# 미리 설정해둬야 함. default.redis7(AWS 기본 그룹)은 읽기 전용이라 수정 불가.
# ──────────────────────────────────────────────

resource "aws_elasticache_parameter_group" "redis" {
  name   = "${var.project}-redis7-params"
  family = "redis7"

  parameter {
    name  = "notify-keyspace-events"
    value = "Ex"
  }

  tags = { Name = "${var.project}-redis-params" }
}

resource "aws_elasticache_subnet_group" "redis" {
  name = "${var.project}-redis-subnet"
  subnet_ids = [
    aws_subnet.private_a.id,
    aws_subnet.private_c.id,
  ]

  tags = { Name = "${var.project}-redis-subnet" }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${var.project}-redis"
  description          = "Queuing platform shared Redis"
  node_type            = var.redis_node_type
  num_cache_clusters   = 2
  engine               = "redis"
  engine_version       = "7.1"
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.redis.name

  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [aws_security_group.redis.id]

  automatic_failover_enabled = true
  multi_az_enabled           = true

  at_rest_encryption_enabled = true
  transit_encryption_enabled = false

  tags = { Name = "${var.project}-redis" }
}
