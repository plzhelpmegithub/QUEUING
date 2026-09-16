"""
POST /b-callback/verify-link/expire  (ALB 타겟그룹 — A파트가 조기 만료 감지 시 호출)

[2026-09-16 patch] 요청 필드를 token 기반에서 A파트 최종 확정 스펙
(user_id/event_id/seat_id/allocation_id, token 없음) 기준으로 변경.
allocation_id는 cancellation_link에 유니크 제약이 없어 최신 행만 골라야
하므로 ORDER BY issued_at DESC LIMIT 1 적용 (verify_link_complete와 동일 이유).

DB 쓰기 없음 — SendTaskFailure만 호출하고 나머지는 SFN의
Catch(UserExpired) → MarkExpired → UpdateAllocationStatus가 처리.
"""

import json

import boto3

from common.auth import verify_callback_secret, UnauthorizedError
from common.alb import parse_json_body, alb_response
from common.db import db_transaction

sfn_client = boto3.client("stepfunctions")

FIND_LINK_SQL = """
    SELECT cl.token, cl.status AS link_status, cl.task_token,
           ca.event_id, ca.user_id
    FROM cancellation_link cl
    JOIN cancel_allocations ca ON ca.allocation_id = cl.allocation_id
    WHERE cl.allocation_id = %s
    ORDER BY cl.issued_at DESC
    LIMIT 1
"""


def handler(event, context):
    headers = event.get("headers") or {}
    try:
        verify_callback_secret(headers)
    except UnauthorizedError:
        return alb_response(401, {"success": False, "reason": "unauthorized"})

    body = parse_json_body(event)
    allocation_id = body.get("allocation_id")
    if not allocation_id:
        return alb_response(400, {"success": False, "reason": "missing_fields"})

    with db_transaction() as cur:
        cur.execute(FIND_LINK_SQL, (allocation_id,))
        link = cur.fetchone()

    if link is None:
        return alb_response(404, {"success": False, "reason": "allocation_not_found"})

    # ENUM 값 'completed'/'expired' 기준 (update_allocation_status.py 매핑 수정 후 유효)
    if link["link_status"] in ("completed", "expired"):
        return alb_response(200, {"success": True, "reason": "already_finalized"})

    task_token = link["task_token"]
    if not task_token:
        return alb_response(500, {"success": False, "reason": "task_token_missing"})

    event_id = link["event_id"]
    user_id = link["user_id"]

    try:
        sfn_client.send_task_failure(
            taskToken=task_token,
            error="UserExpired",
            cause=json.dumps({"event_id": event_id, "user_id": user_id}),
        )
    except sfn_client.exceptions.TaskDoesNotExist:
        return alb_response(200, {"success": True, "reason": "already_finalized"})
    except sfn_client.exceptions.InvalidToken:
        return alb_response(200, {"success": True, "reason": "already_finalized"})

    return alb_response(200, {"success": True, "eventId": event_id, "userId": user_id})
