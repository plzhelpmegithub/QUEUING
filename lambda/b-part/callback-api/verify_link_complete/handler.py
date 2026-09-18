"""
POST /b-callback/verify-link/complete  (ALB 콜백 라우트 — A파트가 좌석·결제 확정 후 호출)

[2026-09-16 patch] 요청 필드를 token/seatId 기반에서 A파트 최종 확정 스펙
(user_id/event_id/seat_id/allocation_id, token 없음) 기준으로 변경.

함께 고쳐둔 두 가지 (원인 분석 결과):
1. cancellation_link.status ENUM은 ('unused','in_progress','completed','expired')뿐이고
   'used'는 없다. update_allocation_status.py가 완료 시 'completed'로 UPDATE하고
   있으니, 이 핸들러도 'completed'로 체크해야 앞뒤가 맞는다.
2. cancellation_link는 allocation_id에 유니크 제약이 없어 재시도마다 여러 행이
   쌓일 수 있음 → allocation_id로 조회할 때는 반드시 ORDER BY issued_at DESC
   LIMIT 1로 최신 행만 집어야 한다 (FOR UPDATE로 락걸기 위해 서브쿼리 사용).

역할 분리는 기존과 동일하게 유지: 이 핸들러는 seat_id 확정(및 이번에 추가된
reservation_id 저장, cancel_pool_seats 판매 반영)만 책임지고, cancel_allocations/
cancellation_link의 status 갱신은 SFN의 MarkCompleted → UpdateAllocationStatus가
전담한다.

[2026-09-18 patch] 취소표 풀 관리 구조가 A파트 seats/reservations 조인 방식에서
B파트 직접 관리(cancel_pool_seats 테이블)로 전환됨에 따라 좌석 재검증 쿼리 교체.
A파트가 결제 확정 필드로 reservation_id를 항상 함께 보내는 것으로 확정되어
필수 필드 검증 및 저장 로직 추가.
"""

import json
import os

import boto3

from common.auth import verify_callback_secret, UnauthorizedError
from common.alb import parse_json_body, alb_response
from common.db import db_transaction

sfn_client = boto3.client("stepfunctions")

# allocation_id로 최신 cancellation_link 한 개를 잠그고, 매칭되는
# cancel_allocations의 event_id/user_id를 같이 가져온다
FIND_LINK_SQL = """
    SELECT cl.token, cl.status AS link_status, cl.task_token,
           ca.event_id, ca.user_id
    FROM cancellation_link cl
    JOIN cancel_allocations ca ON ca.allocation_id = cl.allocation_id
    WHERE cl.allocation_id = %s
    ORDER BY cl.issued_at DESC
    LIMIT 1
    FOR UPDATE
"""

# B파트가 취소 좌석 풀을 직접 관리 — 재판매 가능 여부의 원본은
# cancel_pool_seats.status='AVAILABLE'이다 (seats/reservations 조인 방식은 폐기)
SEAT_AVAILABLE_SQL = """
    SELECT seat_id
    FROM cancel_pool_seats
    WHERE event_id = %s AND seat_id = %s
      AND status = 'AVAILABLE'
    FOR UPDATE
"""

UPDATE_ALLOCATION_SEAT_SQL = """
    UPDATE cancel_allocations
    SET seat_id = %s, reservation_id = %s
    WHERE allocation_id = %s AND status = 'LINK_SENT'
"""

UPDATE_LINK_SEAT_SQL = """
    UPDATE cancellation_link
    SET seat_id = %s
    WHERE allocation_id = %s
"""

# 판매 완료 반영 — 안 하면 다음 후보자에게 이미 팔린 좌석이 계속
# AVAILABLE로 보이게 된다
UPDATE_POOL_SEAT_SOLD_SQL = """
    UPDATE cancel_pool_seats
    SET status = 'SOLD'
    WHERE event_id = %s AND seat_id = %s
"""


def handler(event, context):
    headers = event.get("headers") or {}
    try:
        verify_callback_secret(headers)
    except UnauthorizedError:
        return alb_response(401, {"success": False, "reason": "unauthorized"})

    body = parse_json_body(event)
    allocation_id = body.get("allocation_id")
    event_id_req = body.get("event_id")
    seat_id = body.get("seat_id")
    reservation_id = body.get("reservation_id")

    if not allocation_id or not event_id_req or not seat_id or not reservation_id:
        return alb_response(400, {"success": False, "reason": "missing_fields"})

    with db_transaction() as cur:
        cur.execute(FIND_LINK_SQL, (allocation_id,))
        link = cur.fetchone()

        if link is None:
            return alb_response(404, {"success": False, "reason": "allocation_not_found"})

        # ENUM 값 'completed' 기준 (update_allocation_status.py 매핑과 일치)
        if link["link_status"] == "completed":
            return alb_response(200, {"success": True, "reason": "already_completed"})
        if link["link_status"] not in ("unused", "in_progress"):
            return alb_response(410, {"success": False, "reason": "link_invalid_state"})

        cur.execute(SEAT_AVAILABLE_SQL, (event_id_req, seat_id))
        if cur.fetchone() is None:
            return alb_response(409, {"success": False, "reason": "seat_no_longer_available"})

        cur.execute(UPDATE_ALLOCATION_SEAT_SQL, (seat_id, reservation_id, allocation_id))
        if cur.rowcount == 0:
            return alb_response(409, {"success": False, "reason": "allocation_state_conflict"})

        cur.execute(UPDATE_LINK_SEAT_SQL, (seat_id, allocation_id))
        cur.execute(UPDATE_POOL_SEAT_SOLD_SQL, (event_id_req, seat_id))

        task_token = link["task_token"]
        token = link["token"]
        event_id = link["event_id"]
        user_id = link["user_id"]

    if not task_token:
        # 좌석은 확정됐는데 SFN을 깨울 방법이 없는 상태 — 즉시 500으로 드러낸다.
        return alb_response(500, {"success": False, "reason": "task_token_missing"})

    # ASL의 MarkCompleted가 $.event_id/$.user_id/$.token을 그대로 참조하므로
    # (SendTaskSuccess output이 다음 상태 입력 전체를 대체함) 반드시 포함시켜야 한다
    try:
        sfn_client.send_task_success(
            taskToken=task_token,
            output=json.dumps({
                "event_id": event_id,
                "user_id": user_id,
                "token": token,
                "seat_id": seat_id,
                "allocation_id": allocation_id,
            }),
        )
    except sfn_client.exceptions.TaskDoesNotExist:
        return alb_response(200, {"success": True, "reason": "already_completed"})
    except sfn_client.exceptions.InvalidToken:
        return alb_response(200, {"success": True, "reason": "already_completed"})

    return alb_response(200, {
        "success": True,
        "eventId": event_id,
        "userId": user_id,
        "seatId": seat_id,
        "allocationId": allocation_id,
        "reservationId": reservation_id,
    })
