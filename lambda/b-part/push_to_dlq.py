"""
PushToDLQ (MySQL 버전)

SendEmailViaSES가 ASL Retry 정책만큼 재시도했는데도 실패하면 Step Functions Catch가
여기로 분기한다. SQS DLQ 적재 로직은 DynamoDB와 무관하므로 그대로 두고,
cancel_allocations 상태 갱신 부분만 UpdateItem -> UPDATE 문으로 바꾼다.

기존 GenerateSignedLink가 이미 써둔 hold_duration/created_at/expires_at은 건드리지
않고 status/failed_at만 갱신한다 (schema_fixes.sql에서 failed_at 컬럼 추가함).

환경변수: MYSQL_HOST/PORT/USER/PASSWORD/DB, DLQ_QUEUE_URL, SQS_ENDPOINT(로컬 테스트용, 실AWS면 비워둠)
"""
import os
import sys
import json
import datetime

import boto3
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


def handler(event, context=None):
    event_id = event["event_id"]
    user_id = event["user_id"]

    sqs_kwargs = {}
    endpoint = os.environ.get("SQS_ENDPOINT", "").strip()
    if endpoint:
        sqs_kwargs["endpoint_url"] = endpoint
    sqs = boto3.client("sqs", **sqs_kwargs)
    sqs.send_message(
        QueueUrl=os.environ["DLQ_QUEUE_URL"],
        MessageBody=json.dumps(event, ensure_ascii=False),
    )

    conn = _get_mysql_conn()
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE cancel_allocations
            SET status = 'SEND_FAILED', failed_at = %s
            WHERE event_id = %s AND user_id = %s
            """,
            (datetime.datetime.now(datetime.timezone.utc), event_id, user_id),
        )

    return {"event_id": event_id, "skipped_user_id": user_id}


if __name__ == "__main__":
    # 로컬 테스트 예시
    result = handler({
        "event_id": "evt-9",
        "user_id": "chlwldp0224@gmail.com",
        "queue_index": 1,
        "token": "dummy-token-for-local-test",
    })
    print(json.dumps(result, ensure_ascii=False))
