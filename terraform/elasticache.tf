# =============================================================================
# ElastiCache — AWS 관리형 Redis
# =============================================================================
#
# [역할]
# 온프레미스 K8s 클러스터 내 Redis(redis-master.realtime.svc.cluster.local:6379)를 대체.
# 대기열, 좌석 상태, 이벤트 캐시, HINCRBY 카운터 등 실시간 데이터를 저장.
#
# [관리형 Redis의 장점]
#   - 패치/업그레이드 자동 적용
#   - 스냅샷 자동 백업 + 복원
#   - 장애 시 자동 복구 (Multi-AZ Replication Group 사용 시)
#   - 모니터링 CloudWatch 메트릭 자동 수집
#
# [네트워크 보안]
#   Private Subnet에 배치 → 인터넷에서 직접 접근 불가.
#   ECS Security Group에서만 6379 포트 접근 허용.
# =============================================================================


# -----------------------------------------------------------------------------
# [Subnet Group] ElastiCache 노드가 배치될 서브넷 그룹.
#
# ElastiCache는 VPC 서브넷을 직접 지정하지 않고 Subnet Group을 참조한다.
# Private Subnet 2개를 묶어서 2 AZ에 걸쳐 배치할 수 있게 한다.
# (현재 단일 노드이므로 1개 AZ에만 실제 배치되지만, 확장 시 2 AZ 활용 가능)
# -----------------------------------------------------------------------------
resource "aws_elasticache_subnet_group" "redis" {
  name       = "${local.name_prefix}-redis-subnet"
  subnet_ids = aws_subnet.private[*].id   # Private Subnet 2개

  tags = { Name = "${local.name_prefix}-redis-subnet-group" }
}

# -----------------------------------------------------------------------------
# [ElastiCache Cluster] Redis 인스턴스.
#
#   cluster_id           : 클러스터 식별자 (AWS 콘솔에서 표시)
#   engine               : "redis" (memcached도 가능하지만 이 프로젝트는 Redis 필수)
#   engine_version       : Redis 7.1 (HGETALL, HINCRBY, ZADD 등 현재 코드가 사용하는 명령 호환)
#   node_type            : 인스턴스 크기. cache.t3.micro = 0.5GiB 메모리.
#                          좌석 6,600개 기준 ~50MB이므로 micro면 충분.
#   num_cache_nodes      : 노드 수. 1 = 단일 노드 (Cluster Mode 비활성화).
#                          고가용성이 필요하면 Replication Group(별도 리소스)으로 전환.
#   port                 : 6379 (Redis 기본 포트. API 코드의 REDIS_PORT와 일치)
#   parameter_group_name : Redis 7.x 기본 파라미터 그룹.
#                          maxmemory-policy 등을 커스텀하려면 별도 파라미터 그룹 생성.
#
#   subnet_group_name    : 위에서 만든 Subnet Group 참조 → Private Subnet에 배치
#   security_group_ids   : ECS에서만 접근 허용하는 SG 적용
#
#   snapshot_retention_limit : 자동 스냅샷 보관 일수. 1 = 매일 백업, 1일치 보관.
#                              0이면 백업 비활성화.
# -----------------------------------------------------------------------------
resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${local.name_prefix}-redis"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  num_cache_nodes      = var.redis_num_cache_nodes
  port                 = 6379
  parameter_group_name = "default.redis7"

  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [aws_security_group.redis.id]

  snapshot_retention_limit = 1    # 매일 자동 스냅샷, 1일 보관

  tags = { Name = "${local.name_prefix}-redis" }
}
