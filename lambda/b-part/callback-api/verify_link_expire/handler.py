"""
POST /b-callback/verify-link/expire  (ALB 타겟그룹 — A파트가 조기 만료 감지 시 호출)

[2026-09-14 ALB 형식 대응] common.alb 사용.

입력: token 하나. DB 쓰기 없음 — SendTaskFailure만 호출하고 나머지는
SFN의 Catch(UserExpired) → MarkExpired → UpdateAllocationStatus가 처리.
"""

import json
import os

import boto3
import jwt as pyjwt

from common.auth import verify_callback_secret, UnauthorizedError
from common.alb import parse_json_body, alb_response
from common.db import db_transaction

sfn_client = boto3.client("stepfunctions")

FIND_LINK_SQL = """
    SELECT token, status, task_token
    FROM cancellation_link
    WHERE token = %s
"""


def handler(event, context):
    headers = event.get("headers") or {}
    try:
        verify_callback_secret(headers)
    except UnauthorizedError:
        return alb_response(401, {"success": False, "reason": "unauthorized"})

    body = parse_json_body(event)
    token = body.get("token")
    if not token:
        return alb_response(400, {"success": False, "reason": "token_required"})

    try:
        claims = pyjwt.decode(
            token, os.environ["JWT_SECRET"], algorithms=["HS256"],
            options={"verify_exp": False},
        )
    except pyjwt.InvalidTokenError:
        return alb_response(401, {"success": False, "reason": "invalid_token"})

    event_id = claims.get("event_id")
    user_id = claims.get("user_id")

    with db_transaction() as cur:
        cur.execute(FIND_LINK_SQL, (token,))
        link = cur.fetchone()

    if link is None:
        return alb_response(404, {"success": False, "reason": "link_not_found"})

    if link["status"] in ("completed", "expired"):
        return alb_response(200, {"success": True, "reason": "already_finalized"})

    task_token = link["task_token"]
    if not task_token:
        return alb_response(500, {"success": False, "reason": "task_token_missing"})

    sfn_client.send_task_failure(
        taskToken=task_token,
        error="UserExpired",
        cause=json.dumps({"event_id": event_id, "user_id": user_id}),
    )

    return alb_response(200, {"success": True, "eventId": event_id, "userId": user_id})
