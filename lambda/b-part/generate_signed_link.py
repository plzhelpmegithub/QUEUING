"""
GenerateSignedLink (MySQL 버전)

기존 DynamoDB 버전과 동일한 로직(서명된 1회용 JWT 발급)이되, 이번 구버전 대신
DynamoDB PutItem -> MySQL INSERT로 바뀌었다.

- cancellation_link: token을 PK로 신규 행 INSERT (status='unused').
  seat_id는 아직 모르므로 NULL로 둔다.
- cancel_allocations: {event_id, user_id, status='LINK_SENT', hold_duration, expires_at}
  INSERT. Step Functions가 이 Task를 재시도할 경우 같은 (event_id, user_id)로
  다시 들어올 수 있어서, schema_fixes.sql에서 추가한 uk_event_user 유니크 인덱스
  덕분에 INSERT ... ON DUPLICATE KEY UPDATE로 멱등하게 처리한다.

[2026-09-16 추가] A파트 연동을 위해 complete/expire 콜백이 allocation_id만으로
task_token을 찾을 수 있어야 한다. cancel_allocations를 upsert한 직후, 방금
확정된 allocation_id를 다시 SELECT로 가져와서 cancellation_link.allocation_id에
같이 저장해둔다. (INSERT ... ON DUPLICATE KEY UPDATE는 cursor.lastrowid가
항상 신뢰할 수 있는 값을 주지 않으므로, 별도 SELECT로 확정한다.)

[2026-09-19 patch] ASL의 GenerateSignedLink ResultSelector가 $.Payload.session_date/
$.Payload.session_time을 꺼내는데, 이 Lambda가 session_date/session_time을 받지도
저장하지도 리턴하지도 않아서 Step Functions가 States.Runtime으로 멈추는 문제가
있었다. 세 곳을 고쳤다: (1) 입력에서 session_date/session_time을 받고,
(2) cancel_allocations INSERT에 두 컬럼을 채우고, (3) 리턴값에 포함시켰다.
verify-link가 sessionDate/sessionTime을 응답으로 돌려줘야 프론트가 회차를 알 수
있으므로, 여기서 비워두면 그쪽도 빈 값이 된다.

타임존 버그 재발 방지: 반드시 datetime.now(timezone.utc)를 쓴다.
(datetime.utcnow()는 naive datetime이라 .timestamp()를 호출하면 로컬 타임존
 기준으로 잘못 해석되어 exp가 9시간 앞당겨졌던 사고가 있었다.)

환경변수: MYSQL_HOST/PORT/USER/PASSWORD/DB, JWT_SECRET, HOLD_DURATION_SECONDS(기본 600)
"""
import os
import sys
import json
import uuid
import datetime

import jwt  # PyJWT
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


def _now():
    return datetime.datetime.now(datetime.timezone.utc)


def handler(event, context=None):
    event_id = event["event_id"]
    user_id = event["user_id"]
    queue_index = event["queue_index"]
    session_date = event.get("session_date")
    session_time = event.get("session_time")

    hold_duration_seconds = int(os.environ.get("HOLD_DURATION_SECONDS", 600))
    issued_at = _now()
    expires_at = issued_at + datetime.timedelta(seconds=hold_duration_seconds)

    jti = str(uuid.uuid4())
    payload = {
        "jti": jti,
        "event_id": event_id,
        "user_id": user_id,
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    secret = os.environ["JWT_SECRET"]
    token = jwt.encode(payload, secret, algorithm="HS256")
    if isinstance(token, bytes):  # PyJWT 1.x 호환
        token = token.decode("utf-8")

    conn = _get_mysql_conn()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO cancellation_link
                (token, seat_id, status, issued_at, expires_at)
            VALUES (%s, NULL, 'unused', %s, %s)
            """,
            (token, issued_at, expires_at),
        )
        cur.execute(
            """
            INSERT INTO cancel_allocations
                (event_id, user_id, seat_id, status, hold_duration,
                 created_at, expires_at, session_date, session_time)
            VALUES (%s, %s, NULL, 'LINK_SENT', %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                status = VALUES(status),
                hold_duration = VALUES(hold_duration),
                expires_at = VALUES(expires_at),
                session_date = VALUES(session_date),
                session_time = VALUES(session_time)
            """,
            (event_id, user_id, hold_duration_seconds, issued_at, expires_at,
             session_date, session_time),
        )

        # [2026-09-16 추가] 방금 upsert된 allocation_id를 확정 조회해서
        # cancellation_link에 같이 저장 — complete/expire 콜백이
        # allocation_id만으로 task_token을 찾을 수 있게 하기 위함.
        cur.execute(
            """
            SELECT allocation_id
            FROM cancel_allocations
            WHERE event_id = %s AND user_id = %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (event_id, user_id),
        )
        alloc_row = cur.fetchone()
        allocation_id = alloc_row["allocation_id"] if alloc_row else None

        if allocation_id is not None:
            cur.execute(
                "UPDATE cancellation_link SET allocation_id = %s WHERE token = %s",
                (allocation_id, token),
            )
        else:
            # 방금 upsert한 행을 못 찾는다는 건 로직상 있어서는 안 되는 상황.
            # 여기서 조용히 넘어가면 나중에 complete/expire가 절대 못 찾는
            # 상태가 되므로, 확실히 드러나도록 예외를 던진다.
            raise RuntimeError(
                f"cancel_allocations row not found right after upsert "
                f"(event_id={event_id}, user_id={user_id}) — allocation_id 저장 실패"
            )

    return {
        "event_id": event_id,
        "user_id": user_id,
        "queue_index": queue_index,
        "session_date": session_date,
        "session_time": session_time,
        "token": token,
        "expires_at": expires_at.isoformat(),
        "hold_duration_seconds": hold_duration_seconds,
        "allocation_id": allocation_id,
    }


if __name__ == "__main__":
    # 로컬 테스트: python generate_signed_link.py evt-9 chlwldp0224@gmail.com 1 2026-11-14 18:00
    result = handler({
        "event_id": sys.argv[1],
        "user_id": sys.argv[2],
        "queue_index": int(sys.argv[3]),
        "session_date": sys.argv[4] if len(sys.argv) > 4 else None,
        "session_time": sys.argv[5] if len(sys.argv) > 5 else None,
    })
    print(json.dumps(result, indent=2, ensure_ascii=False))
