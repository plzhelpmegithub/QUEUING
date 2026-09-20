"""
UpdateAllocationStatus (트리거 Lambda)

Step Functions ASL의 MarkCompleted/MarkExpired 두 상태에서 공용으로 쓰는
작은 유틸 Lambda. status 값만 다르게 넘겨받아 사용한다.

- MarkCompleted에서 호출: status="COMPLETED" — 사용자가 /verify-link로 링크를
  클릭해서 SendTaskSuccess가 호출됐음 → 워크플로우가 정상 종료되기 전에 최종
  상태를 기록
- MarkExpired에서 호출: status="EXPIRED" — hold_duration_seconds 안에 아무도
  클릭하지 않아 Step Functions가 States.Timeout을 던진 경우 → 다음 순번으로
  넘어가기 전에 이 사용자의 시도를 만료 처리

cancel_allocations.status와 cancellation_link.status를 함께 갱신한다.
(cancel_allocations에는 이미 status 컬럼이 있었으니 LINK_SENT/SEND_FAILED 등
기존 값들과 같은 컬럼에 COMPLETED/EXPIRED를 추가하는 것)

[2026-09-18 patch] 이 event_id에 아직 재판매 가능한(cancel_pool_seats.status
='AVAILABLE') 좌석이 남아있는지 확인해서 has_more_seats로 같이 리턴한다.
ASL이 이 값을 보고 다음 후보를 이어서 처리할지, 여기서 끝낼지 분기한다
(MarkCompleted가 지금까지 End: true라 첫 사용자만 처리하고 워크플로우가
끝나버리던 문제 해결용).

입력:
  {
    "event_id": "evt-9", "user_id": "chlwldp0224@gmail.com", "token": "<JWT>",
    "status": "COMPLETED" 또는 "EXPIRED"   (ASL Parameters에서 리터럴로 지정)
  }

출력:
  {
    "event_id": "evt-9", "user_id": "...", "status": "COMPLETED",
    "has_more_seats": true 또는 false,
    "session_date": "2026-11-14", "session_time": "18:00"
  }

[2026-09-19 patch] session_date/session_time도 같이 리턴하도록 추가 — ASL의
HasMoreSeats?가 GetNextUser로 순환할 때 회차 정보가 끊기지 않게 하기 위함
(GetNextUser Task가 최상위 $.session_date/$.session_time을 필요로 함).

환경변수: MYSQL_HOST/PORT/USER/PASSWORD/DB
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


# cancellation_link.status는 기존에 'unused'/'used' 같은 소문자 값을 쓰므로
# (스키마 초기 설계 기준) cancel_allocations 쪽의 대문자 상태값과 별도로 맞춰준다
_LINK_STATUS_MAP = {
    "COMPLETED": "completed",
    "EXPIRED": "expired",
}

CHECK_REMAINING_SEATS_SQL = """
    SELECT seat_id FROM cancel_pool_seats
    WHERE event_id = %s AND status = 'AVAILABLE'
    LIMIT 1
"""

# HasMoreSeats?에서 GetNextUser로 다시 순환할 때, GetNextUser Task는 최상위
# $.session_date/$.session_time을 참조하므로 여기서도 반드시 같이 실어 보내야
# 한다 (방금 UPDATE한 이 행 자체에 이미 회차가 저장돼 있으므로 그대로 재사용).
SELECT_ALLOCATION_SESSION_SQL = """
    SELECT session_date, session_time FROM cancel_allocations
    WHERE event_id = %s AND user_id = %s
"""

# has_more_seats=false(=이 회차의 좌석이 다 팔림)면 워크플로우가 AllSeatsSold로
# 끝나므로, 다음 취소 웨이브가 다시 시작될 수 있도록 락을 해제한다.
RELEASE_LOCK_SQL = """
    DELETE FROM cancel_active_lock WHERE lock_key = %s
"""


def handler(event, context=None):
    event_id = event["event_id"]
    user_id = event["user_id"]
    status = event["status"]
    token = event.get("token")

    conn = _get_mysql_conn()
    with conn.cursor() as cur:
        if status == "EXPIRED":
            # [2026-09-20 patch] A파트 confirmSeat()이 markRespondedById()로
            # RESPONDED 처리한 직후, B파트 SFN의 5분 타임아웃(MarkExpired)이
            # 뒤늦게 도착해서 이미 결제 완료된 allocation을 EXPIRED로
            # 덮어써버리는 사고가 있었다 (실제 발생: RESPONDED 06:18:43 →
            # EXPIRED로 덮어써짐 06:22:51). 결제/완료가 이미 반영된 상태는
            # 타임아웃이 뒤늦게 와도 절대 덮어쓰지 않도록 WHERE 절에 가드 추가.
            cur.execute(
                "UPDATE cancel_allocations SET status = %s "
                "WHERE event_id = %s AND user_id = %s "
                "AND status NOT IN ('RESPONDED', 'COMPLETED')",
                (status, event_id, user_id),
            )
        else:
            cur.execute(
                "UPDATE cancel_allocations SET status = %s WHERE event_id = %s AND user_id = %s",
                (status, event_id, user_id),
            )
        allocation_updated = cur.rowcount > 0

        # allocation이 가드에 막혀 실제로 안 바뀐 경우(이미 RESPONDED/COMPLETED
        # 였던 경우) cancellation_link만 따로 'expired'로 바뀌면 두 테이블이
        # 서로 모순된 상태가 되므로, allocation이 실제로 바뀐 경우에만 같이 갱신.
        if token and status in _LINK_STATUS_MAP and allocation_updated:
            cur.execute(
                "UPDATE cancellation_link SET status = %s WHERE token = %s",
                (_LINK_STATUS_MAP[status], token),
            )

        cur.execute(SELECT_ALLOCATION_SESSION_SQL, (event_id, user_id))
        session_row = cur.fetchone()
        session_date = session_row["session_date"] if session_row else None
        session_time = session_row["session_time"] if session_row else None

        cur.execute(CHECK_REMAINING_SEATS_SQL, (event_id,))
        has_more_seats = cur.fetchone() is not None

        if not has_more_seats:
            lock_key = f"{event_id}|{session_date}|{session_time}"
            cur.execute(RELEASE_LOCK_SQL, (lock_key,))

    return {
        "event_id": event_id,
        "user_id": user_id,
        "status": status,
        "has_more_seats": has_more_seats,
        "session_date": str(session_date) if session_date else None,
        "session_time": str(session_time) if session_time else None,
    }


if __name__ == "__main__":
    # 로컬 테스트: python update_allocation_status.py evt-9 chlwldp0224@gmail.com EXPIRED
    result = handler({
        "event_id": sys.argv[1],
        "user_id": sys.argv[2],
        "status": sys.argv[3],
    })
    print(json.dumps(result, ensure_ascii=False))
