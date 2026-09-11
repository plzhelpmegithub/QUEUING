"""
GetNextUser (MySQL 버전)

기존 DynamoDB 버전은:
  1) cancel_allocations(DynamoDB)를 Query해서 이번 라운드에 이미 시도한 user_id 집합을 구하고
  2) waiting_queue(DynamoDB)를 queue_index 오름차순 Query
  3) 각 후보를 순회하며 1번 집합에 있으면 skip, MySQL reservations에 status='CONFIRMED'가
     있으면 skip, 둘 다 아니면 반환
  이렇게 DynamoDB 2곳 + MySQL 1곳을 조합했다.

waiting_queue/cancel_allocations가 이제 전부 MySQL에 있으므로, 세 테이블을 하나의
SQL로 묶어서 훨씬 단순하게 처리한다.

비즈니스 규칙(2026-09-11 확정): 재판매 순차배정은 멤버십 회원에게만 적용된다.
비멤버십 회원은 대기열에 있어도 후보에서 아예 제외한다 (우선순위 문제가 아니라
자격 조건). 지금은 waiting_queue.membership_at_join(대기열 진입 시점의 멤버십
여부)으로 판단한다 — 진입 이후 멤버십이 바뀐 사람을 정확히 반영하려면 memberships
테이블을 조인해서 "현재" 상태로 판단해야 하는데, 재판매가 마감 후 1주일 내에
일어나는 짧은 기간이라 우선은 이 값으로 충분하다고 보고 진행. 나중에 문제되면
memberships 테이블 조인으로 교체.

환경변수: MYSQL_HOST, MYSQL_PORT(기본 3306), MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB(기본 queuing_db)
"""
import os
import sys
import json

import pymysql
import pymysql.cursors

_mysql_conn = None


def _get_mysql_conn():
    global _mysql_conn
    if _mysql_conn is None or not _mysql_conn.open:
        _mysql_conn = pymysql.connect(
            host=os.environ["MYSQL_HOST"],
            port=int(os.environ.get("MYSQL_PORT", 3306)),
            user=os.environ["MYSQL_USER"],
            password=os.environ["MYSQL_PASSWORD"],
            database=os.environ.get("MYSQL_DB", "queuing_db"),
            autocommit=True,
            cursorclass=pymysql.cursors.DictCursor,
        )
    return _mysql_conn


_COLLATE = "utf8mb4_general_ci"

# 주의: waiting_queue/cancel_allocations/reservations가 테이블마다 collation이
# 섞여있어서(utf8mb4_general_ci vs utf8mb4_unicode_ci) 그냥 비교하면
# "Illegal mix of collations" 에러가 난다. 비교하는 모든 컬럼 쌍에 COLLATE를
# 명시해서 강제로 맞춘다. (근본적으로는 팀이 언젠가 전체 테이블 collation을
# 통일하는 게 맞지만, 지금은 쿼리 레벨에서 우회)
_QUERY = f"""
    SELECT wq.user_id, wq.queue_index
    FROM waiting_queue wq
    WHERE wq.event_id = %s
      AND wq.membership_at_join = 1
      AND NOT EXISTS (
        SELECT 1 FROM cancel_allocations ca
        WHERE ca.event_id COLLATE {_COLLATE} = wq.event_id COLLATE {_COLLATE}
          AND ca.user_id COLLATE {_COLLATE} = wq.user_id COLLATE {_COLLATE}
      )
      AND NOT EXISTS (
        SELECT 1 FROM reservations r
        WHERE r.event_id COLLATE {_COLLATE} = wq.event_id COLLATE {_COLLATE}
          AND r.user_id COLLATE {_COLLATE} = wq.user_id COLLATE {_COLLATE}
          AND r.status = 'CONFIRMED'
      )
    ORDER BY wq.queue_index ASC
    LIMIT 1
"""


def handler(event, context=None):
    event_id = event["event_id"]
    conn = _get_mysql_conn()
    with conn.cursor() as cur:
        cur.execute(_QUERY, (event_id,))
        row = cur.fetchone()

    if row is None:
        return {"has_candidate": False, "event_id": event_id}

    return {
        "has_candidate": True,
        "event_id": event_id,
        "user_id": row["user_id"],
        "queue_index": row["queue_index"],
    }


if __name__ == "__main__":
    # 로컬 테스트: python get_next_user.py evt-9
    target_event_id = sys.argv[1] if len(sys.argv) > 1 else "evt-9"
    result = handler({"event_id": target_event_id})
    print(result)
