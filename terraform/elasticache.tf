# =============================================================================
# ElastiCache — AWS 관리형 Redis (Multi-AZ Replication Group)
# =============================================================================
#
# [역할]
# 온프레미스 K8s 클러스터 내 Redis(redis-master.realtime.svc.cluster.local:6379)를 대체.
# 대기열, 좌석 상태, 이벤트 캐시, HINCRBY 카운터, 채팅, 가격 스냅샷,
# 입장 토큰 등 실시간 데이터를 저장.
#
# [Multi-AZ Replication Group]
#   기존 단일 노드(aws_elasticache_cluster) 대신 Replication Group으로 구성.
#   Primary(쓰기) + Replica(읽기)가 서로 다른 AZ에 배치되어 고가용성 확보.
#
#   장애 시 자동 페일오버:
#     Primary(AZ-a) 장애 → Replica(AZ-c)가 자동으로 Primary로 승격.
#     DNS 엔드포인트(primary_endpoint_address)가 새 Primary를 가리킴.
#     → 애플리케이션 코드 변경 없이 자동 복구 (보통 30~60초).
#
# [비용]
#   cache.t3.micro × 2(Primary + Replica) ≈ 월 $25
#   단일 노드 대비 2배이지만, 예매 시스템에서 Redis 장애는 전체 서비스 중단이므로
#   Multi-AZ는 필수 구성.
# =============================================================================


# -----------------------------------------------------------------------------
# [Subnet Group] ElastiCache 노드가 배치될 서브넷 그룹.
#
# ElastiCache는 VPC 서브넷을 직접 지정하지 않고 Subnet Group을 참조한다.
# Private Subnet 2개를 묶어서 2 AZ에 걸쳐 Primary + Replica를 분산 배치.
# -----------------------------------------------------------------------------
resource "aws_elasticache_subnet_group" "redis" {
  name       = "${local.name_prefix}-redis-subnet"
  subnet_ids = aws_subnet.private[*].id

  tags = { Name = "${local.name_prefix}-redis-subnet-group" }
}

# -----------------------------------------------------------------------------
# [Replication Group] Redis Multi-AZ 복제 그룹.
#
#   replication_group_id : 복제 그룹 식별자 (AWS 콘솔에서 표시)
#
#   engine               : "redis"
#   engine_version       : 7.1 (HGETALL, HINCRBY, ZADD 등 현재 코드 호환)
#   node_type            : 인스턴스 크기. Primary/Replica 모두 동일.
#   port                 : 6379 (Redis 기본 포트. API의 REDIS_PORT와 일치)
#   parameter_group_name : Redis 7.x 기본 파라미터. maxmemory-policy 등 커스텀 가능.
#
#   --- Multi-AZ 설정 ---
#   num_cache_clusters       : 전체 노드 수. 2 = Primary 1 + Replica 1.
#                              3으로 설정하면 Primary 1 + Replica 2 (읽기 분산 강화).
#   automatic_failover_enabled : true = Primary 장애 시 Replica가 자동 승격.
#   multi_az_enabled           : true = Primary/Replica를 서로 다른 AZ에 배치.
#                                AZ 전체 장애에도 서비스 유지.
#
#   --- 보안 ---
#   at_rest_encryption_enabled : true = 디스크에 저장된 데이터 AES-256 암호화.
#   transit_encryption_enabled : false = VPC 내부 통신이므로 TLS 불필요.
#                                true로 설정 시 redis:// → rediss:// 로 연결 필요.
#
#   --- 유지보수 ---
#   snapshot_retention_limit   : 자동 스냅샷 보관 일수. 1 = 매일 백업, 1일치 보관.
#   snapshot_window            : 백업 실행 시간 (UTC). 05:00~06:00 = 한국 14:00~15:00.
#   maintenance_window         : 엔진 패치 시간 (UTC). 월요일 06:00~07:00.
#
#   --- 네트워크 ---
#   subnet_group_name  : Private Subnet에 배치
#   security_group_ids : EKS Worker Node에서만 접근 허용하는 SG
# -----------------------------------------------------------------------------
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${local.name_prefix}-redis"
  description          = "${local.name_prefix} Redis Multi-AZ 복제 그룹"

  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  port                 = 6379
  parameter_group_name = "default.redis7"

  # Multi-AZ 고가용성 설정
  num_cache_clusters         = var.redis_num_replicas + 1   # Primary + Replica(s)
  automatic_failover_enabled = var.redis_num_replicas > 0   # Replica 있을 때만 페일오버
  multi_az_enabled           = var.redis_num_replicas > 0   # Replica 있을 때만 Multi-AZ

  # 암호화
  at_rest_encryption_enabled = true
  transit_encryption_enabled = false

  # 유지보수·백업
  snapshot_retention_limit = 1
  snapshot_window          = "05:00-06:00"
  maintenance_window       = "mon:06:00-mon:07:00"

  # 네트워크
  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [aws_security_group.redis.id]

  tags = { Name = "${local.name_prefix}-redis" }
}
