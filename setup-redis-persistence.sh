#!/bin/bash
# =============================================
# Redis 영속화 설정 — Queue 장애 시 순번 보존
# =============================================
# Redis가 재시작되어도 대기열 순번이 유실되지 않도록
# RDB + AOF 두 가지 방식으로 영속화 설정
#
# RDB: 주기적으로 스냅샷 저장 (빠른 복구, 약간의 데이터 유실 가능)
# AOF: 모든 쓰기 명령을 로그로 저장 (유실 최소화, 파일 크기 큼)
# =============================================

echo "=== Redis 영속화 설정 시작 ==="

# 1. 현재 설정 확인
echo ""
echo "--- 현재 RDB 설정 ---"
redis-cli CONFIG GET save

echo ""
echo "--- 현재 AOF 설정 ---"
redis-cli CONFIG GET appendonly

# 2. RDB 스냅샷 설정 (60초 내 100개 이상 변경 시 저장)
redis-cli CONFIG SET save "60 100"
echo ""
echo "[RDB] save 60 100 설정 완료 (60초 내 100개 변경 시 스냅샷)"

# 3. AOF 활성화 (모든 쓰기 명령 로그)
redis-cli CONFIG SET appendonly yes
redis-cli CONFIG SET appendfsync everysec
echo "[AOF] appendonly yes, appendfsync everysec 설정 완료"

# 4. 설정을 redis.conf에 영구 반영
redis-cli CONFIG REWRITE
echo "[Config] redis.conf에 설정 저장 완료"

# 5. 확인
echo ""
echo "=== 설정 확인 ==="
echo "RDB:"
redis-cli CONFIG GET save
echo ""
echo "AOF:"
redis-cli CONFIG GET appendonly
echo ""
echo "AOF fsync:"
redis-cli CONFIG GET appendfsync

echo ""
echo "=== 영속화 설정 완료 ==="
echo "Redis 재시작 시에도 대기열 데이터가 보존됩니다."
echo ""
echo "백업 파일 위치:"
echo "  RDB: /var/lib/redis/dump.rdb"
echo "  AOF: /var/lib/redis/appendonly.aof"
