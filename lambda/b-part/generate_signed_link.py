"""
GenerateSignedLink (MySQL 버전)

기존 DynamoDB 버전과 동일한 로직(서명된 1회용 JWT 발급)이지만, 두 군데 저장소가
DynamoDB PutItem -> MySQL INSERT로 바뀐다.

- cancellation_link: token을 PK로 신규 행 INSERT (status='unused').
  seat_id는 아직 모르므로 NULL로 넣는다 (schema_fixes.sql 적용 후에만 가능).
- cancel_allocations: {event_id, user_id, status='LINK_SENT', hold_duration, expires_at}
  INSERT. Step Functions가 이 Task를 재시도할 경우 같은 (event_id, user_id)로
  다시 들어올 수 있어서, schema_fixes.sql에서 추가한 uk_event_user 유니크 키를
  이용해 INSERT ... ON DUPLICATE KEY UPDATE로 멱등하게 처리한다.

타임존 버그 재발 방지: 반드시 datetime.now(timezone.utc)를 쓴다.
(datetime.utcnow()의 naive datetime에 .timestamp()를 호출하면 로컬 타임존
 기준으로 잘못 해석되어 exp가 9시간 어긋났던 사고가 있었음)

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
                (event_id, user_id, seat_id, status, hold_duration, created_at, expires_at)
            VALUES (%s, %s, NULL, 'LINK_SENT', %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                status = VALUES(status),
                hold_duration = VALUES(hold_duration),
                expires_at = VALUES(expires_at)
            """,
            (event_id, user_id, hold_duration_seconds, issued_at, expires_at),
        )

    return {
        "event_id": event_id,
        "user_id": user_id,
        "queue_index": queue_index,
        "token": token,
        "expires_at": expires_at.isoformat(),
        "hold_duration_seconds": hold_duration_seconds,
    }


if __name__ == "__main__":
    # 로컬 테스트: python generate_signed_link.py evt-9 chlwldp0224@gmail.com 1
    result = handler({
        "event_id": sys.argv[1],
        "user_id": sys.argv[2],
        "queue_index": int(sys.argv[3]),
    })
    print(json.dumps(result, indent=2, ensure_ascii=False))
