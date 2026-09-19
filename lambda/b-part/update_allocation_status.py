"""
UpdateAllocationStatus (신규 Lambda)

Step Functions ASL의 MarkCompleted/MarkExpired 두 상태에서 공용으로 쓰는
작은 유틸 Lambda. status 값만 다르게 넘겨서 재사용한다.

- MarkCompleted에서 호출: status="COMPLETED" — 사용자가 /verify-link로 링크를
  클릭해서 SendTaskSuccess가 호출된 뒤, 워크플로우가 정상 종료되기 전에 최종
  상태를 기록
- MarkExpired에서 호출: status="EXPIRED" — hold_duration_seconds 안에 아무도
  클릭하지 않아 Step Functions가 States.Timeout을 던진 뒤, 다음 순번으로
  넘어가기 전에 이 사용자의 시도를 만료 처리

cancel_allocations.status와 cancellation_link.status를 함께 갱신한다.
(cancel_allocations는 이미 status 컬럼이 있었음 — LINK_SENT/SEND_FAILED 등
기존 값들과 같은 컬럼에 COMPLETED/EXPIRED를 추가하는 것)

입력:
  {
    "event_id": "evt-9", "user_id": "chlwldp0224@gmail.com", "token": "<JWT>",
    "status": "COMPLETED" 또는 "EXPIRED"   (ASL Parameters에서 리터럴로 지정)
  }

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


# cancellation_link.status는 기존에 'unused'/'used' 같은 소문자 값을 썼으므로
# (스키마 초기 설계 기준) cancel_allocations 쪽 대문자 상태값과 별도로 맞춰준다.
_LINK_STATUS_MAP = {
    "COMPLETED": "used",
    "EXPIRED": "expired",
}


def handler(event, context=None):
    event_id = event["event_id"]
    user_id = event["user_id"]
    status = event["status"]
    token = event.get("token")

    conn = _get_mysql_conn()
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE cancel_allocations SET status = %s WHERE event_id = %s AND user_id = %s",
            (status, event_id, user_id),
        )
        if token and status in _LINK_STATUS_MAP:
            cur.execute(
                "UPDATE cancellation_link SET status = %s WHERE token = %s",
                (_LINK_STATUS_MAP[status], token),
            )

    return {"event_id": event_id, "user_id": user_id, "status": status}


if __name__ == "__main__":
    # 로컬 테스트: python update_allocation_status.py evt-9 chlwldp0224@gmail.com EXPIRED
    result = handler({
        "event_id": sys.argv[1],
        "user_id": sys.argv[2],
        "status": sys.argv[3],
    })
    print(json.dumps(result, ensure_ascii=False))
