"""
POST /verify-link  (A파트 백엔드가 프록시로 호출, 브라우저가 직접 호출하지 않음)

실제 GenerateSignedLink 코드 확인(2026-09-14) 반영:
- JWT payload에는 jti/event_id/user_id/iat/exp만 있고 allocation_id는 없다.
- cancel_allocations는 (event_id, user_id) 유니크키(uk_event_user)로
  ON DUPLICATE KEY UPDATE 되므로, (event_id, user_id) 조합이 곧 allocation을
  찾는 키다. JWT claims의 event_id/user_id로 바로 조회 가능.
- cancellation_link는 PK가 token뿐이라 cancel_allocations와 SQL JOIN 불가 —
  각각 별도 조회 후 애플리케이션에서 묶는다.

역할:
1. X-Callback-Secret 헤더 검증
2. token 서명 검증 (JWT_SECRET)
3. cancellation_link.status가 'unused'/'in_progress'인지 확인 (1회성 보장)
4. cancel_allocations.status가 LINK_SENT(유효)인지 확인
5. 재판매 가능 좌석 풀 반환 (reservations.status=CANCELLED로 걸러낸 좌석만)
6. status를 'in_progress'로 전이
"""

import json
import os
import datetime

import jwt as pyjwt

from common.auth import verify_callback_secret, UnauthorizedError
from common.db import db_transaction

RESALE_SEAT_POOL_SQL = """
    SELECT s.seat_id, s.section
    FROM seats s
    JOIN reservations r
      ON r.seat_id = s.seat_id AND r.event_id = s.event_id
    WHERE s.event_id = %s
      AND s.status = 'AVAILABLE'
      AND r.status = 'CANCELLED'
"""

FIND_LINK_SQL = """
    SELECT token, status, expires_at
    FROM cancellation_link
    WHERE token = %s
    FOR UPDATE
"""

FIND_ALLOCATION_SQL = """
    SELECT allocation_id, user_id, event_id, status, expires_at, session_date, session_time
    FROM cancel_allocations
    WHERE event_id = %s AND user_id = %s
"""

MARK_IN_PROGRESS_SQL = """
    UPDATE cancellation_link SET status = 'in_progress'
    WHERE token = %s AND status = 'unused'
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
    token = body.get("token") or body.get("linkToken")
    if not token:
        return _response(400, {"success": False, "reason": "token_required"})

    try:
        claims = pyjwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except pyjwt.ExpiredSignatureError:
        claims = None  # 서명은 유효, 만료만 됐을 수 있음 — DB 상태로 최종 판단
    except pyjwt.InvalidTokenError:
        return _response(401, {"success": False, "reason": "invalid_token"})

    with db_transaction() as cur:
        cur.execute(FIND_LINK_SQL, (token,))
        link = cur.fetchone()

        if link is None:
            return _response(404, {"success": False, "reason": "link_not_found"})
        if link["status"] == "expired":
            return _response(410, {"success": False, "reason": "link_expired"})
        if link["status"] == "completed":
            return _response(410, {"success": False, "reason": "link_already_used"})
        if link["status"] not in ("unused", "in_progress"):
            return _response(410, {"success": False, "reason": "link_invalid_state"})

        if claims is None or link["expires_at"] < datetime.datetime.utcnow():
            return _response(410, {"success": False, "reason": "link_expired"})

        event_id = claims.get("event_id")
        user_id = claims.get("user_id")
        if not event_id or not user_id:
            return _response(401, {"success": False, "reason": "token_missing_claims"})

        cur.execute(FIND_ALLOCATION_SQL, (event_id, user_id))
        alloc = cur.fetchone()

        if alloc is None:
            return _response(404, {"success": False, "reason": "allocation_not_found"})
        if alloc["status"] != "LINK_SENT":
            return _response(410, {"success": False, "reason": "allocation_not_active"})

        cur.execute(RESALE_SEAT_POOL_SQL, (event_id,))
        seats = cur.fetchall()

        cur.execute(MARK_IN_PROGRESS_SQL, (token,))

    return _response(200, {
        "success": True,
        "token": token,
        "allocationId": alloc["allocation_id"],
        "userId": user_id,
        "eventId": event_id,
        "expiresAt": alloc["expires_at"],
        "sessionDate": alloc["session_date"] or "",
        "sessionTime": alloc["session_time"] or "",
        "availableSeats": [{"seatId": s["seat_id"], "section": s["section"]} for s in seats],
    })
