"""
POST /verify-link/complete  (A파트가 사용자의 좌석 선택 완료 시 호출)

입력: token, seatId

[2026-09-14 재설계] Step Functions ASL을 확인한 결과, MarkCompleted 상태에서
UpdateAllocationStatus Lambda가 cancel_allocations.status/cancellation_link.status
갱신을 이미 전담하고 있음이 확인됨. 이 핸들러가 같은 컬럼을 또 직접 갱신하면
두 곳이 서로 다른 타이밍/어휘로 같은 상태를 써서 충돌한다
(예: 여기서 status='RESPONDED', UpdateAllocationStatus가 status='COMPLETED' —
두 번째 쓰기가 첫 번째를 덮어쓰거나 그 반대가 됨).

→ 이 핸들러의 책임은 다음 둘로 한정한다:
  1. seat_id 확정 (SFN 쪽은 사용자가 어떤 좌석을 골랐는지 전혀 모름 — 이 정보는
     오직 여기, 사용자가 좌석을 클릭한 시점에만 존재)
  2. SendTaskSuccess 호출 → SFN의 SendEmailAndWait을 깨움
     → SFN이 이어서 MarkCompleted → UpdateAllocationStatus(status="COMPLETED")를
       자동 실행해서 상태 갱신을 전담한다. 여기서는 status를 건드리지 않는다.

seat_id UPDATE에 "AND status = 'LINK_SENT'" 가드를 유지하는 이유: 이 시점엔
아직 UpdateAllocationStatus가 실행되기 전이라 status는 항상 LINK_SENT여야
정상이다. 조건에 안 걸리면(0 rows) 동시 호출/레이스로 간주해 409 반환.
"""

import json
import os

import boto3
import jwt as pyjwt

from common.auth import verify_callback_secret, UnauthorizedError
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

# status는 여기서 건드리지 않는다 — UpdateAllocationStatus(SFN MarkCompleted)가 전담
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


def _response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=str, ensure_ascii=False),
    }


def handler(event, context):
    headers = event.get("headers") or {}
    try:
        verify_callback_secret(headers)
    except UnauthorizedError:
        return _response(401, {"success": False, "reason": "unauthorized"})

    body = json.loads(event.get("body") or "{}")
    token = body.get("token")
    seat_id = body.get("seatId")

    if not token or not seat_id:
        return _response(400, {"success": False, "reason": "missing_fields"})

    try:
        claims = pyjwt.decode(
            token, os.environ["JWT_SECRET"], algorithms=["HS256"],
            options={"verify_exp": False},
        )
    except pyjwt.InvalidTokenError:
        return _response(401, {"success": False, "reason": "invalid_token"})

    event_id = claims.get("event_id")
    user_id = claims.get("user_id")
    if not event_id or not user_id:
        return _response(401, {"success": False, "reason": "token_missing_claims"})

    with db_transaction() as cur:
        cur.execute(FIND_LINK_SQL, (token,))
        link = cur.fetchone()

        if link is None:
            return _response(404, {"success": False, "reason": "link_not_found"})
        if link["status"] == "completed":
            return _response(200, {"success": True, "reason": "already_completed"})
        if link["status"] not in ("unused", "in_progress"):
            return _response(410, {"success": False, "reason": "link_invalid_state"})

        cur.execute(RESEAT_CHECK_SQL, (event_id, seat_id))
        if cur.fetchone() is None:
            return _response(409, {"success": False, "reason": "seat_no_longer_available"})

        cur.execute(UPDATE_ALLOCATION_SEAT_SQL, (seat_id, event_id, user_id))
        if cur.rowcount == 0:
            return _response(409, {"success": False, "reason": "allocation_state_conflict"})

        cur.execute(UPDATE_LINK_SEAT_SQL, (seat_id, token))

        task_token = link["task_token"]

    if not task_token:
        # 이 상태로는 SFN을 절대 깨울 수 없다 — 즉시 500으로 알려서
        # 좌석만 확정되고 워크플로우는 영원히 대기하는 상황을 방지
        return _response(500, {"success": False, "reason": "task_token_missing"})

    sfn_client.send_task_success(
        taskToken=task_token,
        output=json.dumps({"event_id": event_id, "user_id": user_id, "seat_id": seat_id}),
    )

    return _response(200, {"success": True, "eventId": event_id, "userId": user_id, "seatId": seat_id})
