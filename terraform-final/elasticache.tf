# ──────────────────────────────────────────────
# ElastiCache Redis
# 기존 구조: C파트 자체 Redis + A파트 Redis(192.168.0.190) → 하나로 통합됨
# AWS: 하나의 ElastiCache를 공유 (같은 VPC 안이라 분리 불필요)
#
# ■ 🔴 실제로 겪은 증상 (2026-09-09) — 이 파라미터 그룹이 없으면
#
# A파트가 EKS 에서 CrashLoopBackOff 로 죽었다. 로그는 이랬다.
#
#   [Redis] Connected
#   ReplyError: ERR unknown command 'config', with args beginning with:
#               'SET' 'notify-keyspace-events' 'Ex'
#
# 앱이 src/services/timerService.js:44 에서 CONFIG SET 을 직접 호출하는데
# ElastiCache 가 CONFIG 명령 자체를 차단한다. src/app.js:81 에서 start() 의
# 첫 줄이라 프로세스가 그대로 종료된다(Exit 1). DB 접속 코드(82줄)까지
# 도달조차 못 한다.
#
# 아래 파라미터 그룹 덕분에 기능(키 만료 알림)은 정상이다. 앱 쪽에서 그 호출을
# try/catch 로 감싸면 된다. 즉 이 파라미터 그룹은 "있으면 좋은 것"이 아니라
# 없으면 A파트가 아예 뜨지 못하는 필수 요소다.
#
# 확인:
#   aws elasticache describe-cache-parameters #     --cache-parameter-group-name ${var.project}-redis7-params #     --query "Parameters[?ParameterName=='notify-keyspace-events']"
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
  name       = "${var.project}-redis-subnet"
  subnet_ids = aws_subnet.private[*].id

  tags = { Name = "${var.project}-redis-subnet" }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${var.project}-redis"
  description          = "Queuing platform shared Redis"
  node_type            = var.redis_node_type
  # 노드 수 = Primary 1 + Replica(redis_num_replicas)
  # 찬규 안의 변수화 방식을 가져왔다. 0 으로 두면 단일 노드가 되고,
  # 그때는 자동 페일오버/Multi-AZ 를 켤 수 없다(AWS 가 거부한다).
  num_cache_clusters = var.redis_num_replicas + 1
  engine             = "redis"
  # ⚠️ 온프레미스는 Redis 8.10.1 인데 여기는 7.1 이다 — 오타가 아니다.
  #
  # ElastiCache 의 engine = "redis" 는 Redis OSS 7.1 이 최대 버전이다. Redis 8 은
  # ElastiCache 에 없고, AWS 는 그 위 버전을 Valkey(8.x, 9.x)로 제공한다.
  #   https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/engine-versions.html
  #
  # ■ 8 → 7.1 로 내려가도 되는지 확인했다
  # 우리 코드가 쓰는 명령어를 전부 뽑아봤다.
  #   C파트 : lrange rpush ltrim expire publish subscribe psubscribe
  #           get set sadd smembers hgetall pipeline/exec
  #   A파트 : eval hgetall hincrby hset scan zadd zrange pipeline
  # 전부 Redis 7.1 이하에서 지원된다. 7.4 이상에서만 되는 것(HEXPIRE,
  # SINTERCARD, Functions/FCALL)이나 8 전용 명령은 쓰지 않는다.
  #
  # ■ Valkey 로 바꿀 수도 있다
  # engine = "valkey", engine_version = "8.x" 로 두면 더 최신이고 AWS 가
  # 노드 단가를 낮게 책정한다. 프로토콜이 호환되므로 ioredis 클라이언트도
  # 그대로 쓴다. 다만 팀이 한 번도 Valkey 로 테스트한 적이 없고, 발표에서
  # "왜 Redis 가 아니라 Valkey 인가"를 설명해야 한다. 지금은 온프레미스와
  # 같은 계열(Redis)을 유지한다 — 바꾸기로 하면 한 줄이다.
  engine_version       = "7.1"
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.redis.name

  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [aws_security_group.redis.id]

  automatic_failover_enabled = var.redis_num_replicas > 0
  multi_az_enabled           = var.redis_num_replicas > 0

  at_rest_encryption_enabled = true
  transit_encryption_enabled = false

  # ── 백업·유지보수 창 (찬규 안에서 가져옴) ──
  #
  # 온프레미스 Redis 에는 이게 없었다. 9/5 에 이미지 태그를 잘못 바꿔
  # redis-master 가 ImagePullBackOff 로 3분간 내려갔을 때, 데이터가 남은 건
  # 파드만 죽고 볼륨이 살아 있었기 때문이다 — 운이 좋았던 것이고 백업은
  # 없었다. 스냅샷이 있으면 그런 상황에서 복구 지점이 생긴다.
  #
  # snapshot_retention_limit : 자동 스냅샷 보관 일수. 1 = 매일 1회, 1일치.
  # snapshot_window    05:00-06:00 UTC = 한국 14:00~15:00
  # maintenance_window mon 06:00-07:00 UTC = 한국 월요일 15:00~16:00
  #
  # ⚠️ 두 창이 겹치지 않아야 한다. 또 시연/부하테스트 시간과 겹치지 않는지
  #    확인할 것 — 유지보수 창에는 페일오버가 일어날 수 있다.
  snapshot_retention_limit = 1
  snapshot_window          = "05:00-06:00"
  maintenance_window       = "mon:06:00-mon:07:00"

  tags = { Name = "${var.project}-redis" }
}
