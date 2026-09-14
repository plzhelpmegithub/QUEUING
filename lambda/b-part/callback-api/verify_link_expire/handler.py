"""
POST /verify-link/expire  (A파트가 브라우저의 카운트다운 만료 감지 시 호출)

입력: token 하나

[2026-09-14 재설계] Step Functions ASL 확인 결과 MarkExpired 상태에서
UpdateAllocationStatus Lambda가 cancel_allocations.status/cancellation_link.status
갱신을 전담하고 있음. 이 핸들러는 DB를 전혀 직접 쓰지 않는다 — 링크가 아직
유효한 상태인지 읽기 확인만 하고, SendTaskFailure만 호출한다. 나머지는
SFN의 Catch → MarkExpired → UpdateAllocationStatus(status="EXPIRED")가 처리.

주의: ASL의 Catch가 States.Timeout만 MarkExpired로 보내고 States.ALL은
PushToDLQ로 보내게 되어 있어서, 이 핸들러가 보내는 커스텀 에러
error="UserExpired"가 그대로면 DLQ로 새어나간다. ASL에
{ "ErrorEquals": ["UserExpired"], "Next": "MarkExpired" }를
States.ALL보다 먼저 추가해야 이 핸들러가 의도대로 동작한다
(ASL_수정가이드.md 참고 — 별도로 팀장/찬규님과 반영 필요).

이 API 자체는 "조기 반납" 보조 채널이다. 진짜 만료 판정의 주인은
SendEmailAndWait의 TimeoutSecondsPath(hold_duration_seconds) 자체 타임아웃이며,
브라우저 탭이 그냥 닫혀 이 API가 호출되지 않아도 SFN이 알아서 States.Timeout으로
처리한다. 그래서 이 핸들러가 실패해도 치명적이지 않다.
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
    if not token:
        return _response(400, {"success": False, "reason": "token_required"})

    try:
        claims = pyjwt.decode(
            token, os.environ["JWT_SECRET"], algorithms=["HS256"],
            options={"verify_exp": False},
        )
    except pyjwt.InvalidTokenError:
        return _response(401, {"success": False, "reason": "invalid_token"})

    event_id = claims.get("event_id")
    user_id = claims.get("user_id")

    with db_transaction() as cur:
        cur.execute(FIND_LINK_SQL, (token,))
        link = cur.fetchone()

    if link is None:
        return _response(404, {"success": False, "reason": "link_not_found"})

    if link["status"] in ("completed", "expired"):
        # 이미 완료됐거나 이미 만료 처리 중 — 중복 호출은 성공으로 취급(멱등)
        return _response(200, {"success": True, "reason": "already_finalized"})

    task_token = link["task_token"]
    if not task_token:
        return _response(500, {"success": False, "reason": "task_token_missing"})

    sfn_client.send_task_failure(
        taskToken=task_token,
        error="UserExpired",
        cause=json.dumps({"event_id": event_id, "user_id": user_id}),
    )

    return _response(200, {"success": True, "eventId": event_id, "userId": user_id})
