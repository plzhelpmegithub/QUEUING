"""
POST /b-callback/verify-link  (ALB 콜백 라우트 — A파트 백엔드가 서버 대 서버로 호출)

[2026-09-14 ALB 형식 전환] API Gateway가 아니라 ALB 콜백라우트으로 연결되므로
common.alb의 parse_json_body/alb_response를 사용해 이벤트/응답 형식을 맞췄다.

브라우저에서 A파트의 /verify-link를 그대로 호출하고, A파트 서버가 내부에서
이 엔드포인트(/b-callback/verify-link)로 프록시한다. A가 자체 JWT 검증 로직을
거쳐서 이 호출로만 도착하는 것으로 합의됨 (2026-09-14).

역할:
1. X-Callback-Secret 헤더 검증
2. token 서명 검증 (JWT_SECRET)
3. cancellation_link.status가 'unused'/'in_progress'인지 확인 (1회성 보장)
4. cancel_allocations.status가 LINK_SENT(유효)인지 확인
5. 재판매 가능 좌석 목록 반환 (reservations.status=CANCELLED로 걸러진 좌석만)
6. status를 'in_progress'로 전이

[2026-09-19 patch] expiresAt을 timezone 정보 없는 naive datetime 그대로
내보내서, 프론트가 그 값을 한국시간(KST)으로 오해해 9시간 일찍 만료된
것으로 판단하는 버그가 있었다. DB는 UTC로 저장하고 있으므로(common/db.py의
SET time_zone = '+00:00') +00:00을 명시적으로 붙여서 ISO 8601 형식으로
내보낸다.
"""

import os
import datetime

import jwt as pyjwt

from common.auth import verify_callback_secret, UnauthorizedError
from common.alb import parse_json_body, alb_response
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


def _iso_utc(dt):
    """DB에 UTC naive datetime으로 저장된 값을 +00:00을 명시한 ISO 8601
    문자열로 변환한다. dt가 None이면 None을 그대로 반환."""
    return dt.replace(tzinfo=datetime.timezone.utc).isoformat() if dt else None


def handler(event, context):
    headers = event.get("headers") or {}
    try:
        verify_callback_secret(headers)
    except UnauthorizedError:
        return alb_response(401, {"success": False, "reason": "unauthorized"})

    body = parse_json_body(event)
    token = body.get("token") or body.get("linkToken")
    if not token:
        return alb_response(400, {"success": False, "reason": "token_required"})

    try:
        claims = pyjwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except pyjwt.ExpiredSignatureError:
        claims = None
    except pyjwt.InvalidTokenError:
        return alb_response(401, {"success": False, "reason": "invalid_token"})

    with db_transaction() as cur:
        cur.execute(FIND_LINK_SQL, (token,))
        link = cur.fetchone()

        if link is None:
            return alb_response(404, {"success": False, "reason": "link_not_found"})
        if link["status"] == "expired":
            return alb_response(410, {"success": False, "reason": "link_expired"})
        if link["status"] == "completed":
            return alb_response(410, {"success": False, "reason": "link_already_used"})
        if link["status"] not in ("unused", "in_progress"):
            return alb_response(410, {"success": False, "reason": "link_invalid_state"})

        if claims is None or link["expires_at"] < datetime.datetime.utcnow():
            return alb_response(410, {"success": False, "reason": "link_expired"})

        event_id = claims.get("event_id")
        user_id = claims.get("user_id")
        if not event_id or not user_id:
            return alb_response(401, {"success": False, "reason": "token_missing_claims"})

        cur.execute(FIND_ALLOCATION_SQL, (event_id, user_id))
        alloc = cur.fetchone()

        if alloc is None:
            return alb_response(404, {"success": False, "reason": "allocation_not_found"})
        if alloc["status"] != "LINK_SENT":
            return alb_response(410, {"success": False, "reason": "allocation_not_active"})

        cur.execute(RESALE_SEAT_POOL_SQL, (event_id,))
        seats = cur.fetchall()

        cur.execute(MARK_IN_PROGRESS_SQL, (token,))

    return alb_response(200, {
        "success": True,
        "token": token,
        "allocationId": alloc["allocation_id"],
        "userId": user_id,
        "eventId": event_id,
        "expiresAt": _iso_utc(alloc["expires_at"]),
        "sessionDate": alloc["session_date"] or "",
        "sessionTime": alloc["session_time"] or "",
        "availableSeats": [{"seatId": s["seat_id"], "section": s["section"]} for s in seats],
    })
