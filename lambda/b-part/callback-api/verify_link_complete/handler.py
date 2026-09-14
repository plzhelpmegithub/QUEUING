"""
POST /b-callback/verify-link/complete  (ALB 타겟그룹 — A파트가 좌석 선택 완료 시 호출)

[2026-09-14 ALB 형식 대응] common.alb 사용.

입력: token, seatId

책임 범위: seat_id 확정 + SendTaskSuccess만. status 갱신은 SFN의
MarkCompleted → UpdateAllocationStatus가 전담 (중복 쓰기 방지, 2026-09-14 확정).
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
    FOR UPDATE
"""

RESEAT_CHECK_SQL = """
    SELECT s.seat_id
    FROM seats s
    JOIN reservations r ON r.seat_id = s.seat_id AND r.event_id = s.event_id
    WHERE s.event_id = %s AND s.seat_id = %s
      AND s.status = 'AVAILABLE' AND r.status = 'CANCELLED'
    FOR UPDATE
"""

UPDATE_ALLOCATION_SEAT_SQL = """
    UPDATE cancel_allocations
    SET seat_id = %s
    WHERE event_id = %s AND user_id = %s AND status = 'LINK_SENT'
"""

UPDATE_LINK_SEAT_SQL = """
    UPDATE cancellation_link
    SET seat_id = %s
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
    seat_id = body.get("seatId")

    if not token or not seat_id:
        return alb_response(400, {"success": False, "reason": "missing_fields"})

    try:
        claims = pyjwt.decode(
            token, os.environ["JWT_SECRET"], algorithms=["HS256"],
            options={"verify_exp": False},
        )
    except pyjwt.InvalidTokenError:
        return alb_response(401, {"success": False, "reason": "invalid_token"})

    event_id = claims.get("event_id")
    user_id = claims.get("user_id")
    if not event_id or not user_id:
        return alb_response(401, {"success": False, "reason": "token_missing_claims"})

    with db_transaction() as cur:
        cur.execute(FIND_LINK_SQL, (token,))
        link = cur.fetchone()

        if link is None:
            return alb_response(404, {"success": False, "reason": "link_not_found"})
        if link["status"] == "completed":
            return alb_response(200, {"success": True, "reason": "already_completed"})
        if link["status"] not in ("unused", "in_progress"):
            return alb_response(410, {"success": False, "reason": "link_invalid_state"})

        cur.execute(RESEAT_CHECK_SQL, (event_id, seat_id))
        if cur.fetchone() is None:
            return alb_response(409, {"success": False, "reason": "seat_no_longer_available"})

        cur.execute(UPDATE_ALLOCATION_SEAT_SQL, (seat_id, event_id, user_id))
        if cur.rowcount == 0:
            return alb_response(409, {"success": False, "reason": "allocation_state_conflict"})

        cur.execute(UPDATE_LINK_SEAT_SQL, (seat_id, token))

        task_token = link["task_token"]

    if not task_token:
        return alb_response(500, {"success": False, "reason": "task_token_missing"})

    sfn_client.send_task_success(
        taskToken=task_token,
        output=json.dumps({"event_id": event_id, "user_id": user_id, "seat_id": seat_id}),
    )

    return alb_response(200, {"success": True, "eventId": event_id, "userId": user_id, "seatId": seat_id})
