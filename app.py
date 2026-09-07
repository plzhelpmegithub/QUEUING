import datetime
import os
import time
import jwt

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import pymysql
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(title="QUEUING Resale Service (B Part)")


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://192.168.0.189:5173",
        "http://localhost:5173",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# JWT 설정
# ============================================================

SECRET_KEY = os.getenv(
    "JWT_SECRET_KEY",
    "your-secure-jwt-secret-key"
)

ALGORITHM = "HS256"

# 시크릿 링크 유효시간: 5분
LINK_EXPIRE_MINUTES = 5


# ============================================================
# MySQL 연결
# ============================================================

def get_db_connection():
    return pymysql.connect(
        host=os.getenv("MYSQL_HOST", "localhost"),
        port=int(os.getenv("MYSQL_PORT", "3306")),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD", "1"),
        database=os.getenv("MYSQL_DATABASE", "queuing_db"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


# ============================================================
# Request Models
# ============================================================

class TokenVerifyRequest(BaseModel):
    token: str


class MembershipCreateRequest(BaseModel):
    user_id: str
    plan: str
    expires_at: str


class ResaleActivateRequest(BaseModel):
    """
    실제 발생한 취소표 정보를 전달받음.

    event_id:
        취소표가 발생한 공연

    seat_id:
        실제 취소된 좌석
    """

    event_id: str
    seat_id: str


# ============================================================
# 기존 대기열 조회
# ============================================================

def get_next_eligible_member(cursor, event_id: str):
    """
    기존 waiting_queue를 기준으로
    취소표를 받을 다음 대상자를 찾는다.

    중요 정책
    ------------------------------------------------------------
    1. 별도의 취소표 전용 대기열을 만들지 않는다.
    2. 기존 waiting_queue의 queue_index 순서를 그대로 사용한다.
    3. 대기열 진입 당시 멤버십 회원이었던 사용자만 대상이다.
    4. 현재 멤버십 상태는 다시 확인하지 않는다.
    5. 대기열 진입 이후 멤버십을 가입한 사용자는
       이번 취소표 대상에서 제외된다.
    6. queue_index가 동일한 경우 queue_id를 보조 정렬 기준으로 사용한다.
    ------------------------------------------------------------

    membership_at_join
        0 = 대기열 진입 당시 비회원
        1 = 대기열 진입 당시 회원
    """

    sql = """
        SELECT
            wq.queue_id,
            wq.user_id,
            wq.event_id,
            wq.queue_index,
            wq.joined_at,
            wq.membership_at_join
        FROM waiting_queue wq
        WHERE wq.event_id = %s
          AND wq.status IN ('WAITING', 'COMPLETED')
          AND wq.membership_at_join = 1
        ORDER BY
            wq.queue_index ASC,
            wq.queue_id ASC
        LIMIT 1
    """

    cursor.execute(sql, (event_id,))
    return cursor.fetchone()


# ============================================================
# 취소표 대상자 중복 확인
# ============================================================

def already_allocated(
    cursor,
    user_id: str,
    event_id: str,
    seat_id: str
):
    """
    동일 사용자에게 동일 이벤트/좌석의 취소표가
    중복 배정되지 않도록 확인한다.
    """

    sql = """
        SELECT
            allocation_id,
            status
        FROM cancel_allocations
        WHERE user_id = %s
          AND event_id = %s
          AND seat_id = %s
        ORDER BY allocation_id DESC
        LIMIT 1
    """

    cursor.execute(
        sql,
        (
            user_id,
            event_id,
            seat_id,
        )
    )

    return cursor.fetchone()


# ============================================================
# 취소표 발생 → 다음 멤버십 대상자에게 배정
# ============================================================

@app.post("/api/v1/resale/activate-next")
def activate_next_user(req: ResaleActivateRequest):
    """
    실제 취소표 1장을 기존 waiting_queue의 순서에 따라
    다음 대상자에게 배정한다.

    대상자 선정 기준
    ------------------------------------------------------------
    waiting_queue.queue_index
        ↓
    membership_at_join = 1
        ↓
    가장 앞선 대기열 사용자
    ------------------------------------------------------------

    즉,
    "현재 멤버십 회원인가?"
    를 기준으로 판단하지 않는다.

    "대기열에 들어올 당시 멤버십 회원이었는가?"
    를 기준으로 판단한다.

    처리 흐름
    ------------------------------------------------------------

    취소표 발생
        ↓
    기존 waiting_queue 조회
        ↓
    membership_at_join = 1 확인
        ↓
    queue_index 순서 확인
        ↓
    중복 배정 확인
        ↓
    JWT 시크릿 링크 생성
        ↓
    cancel_allocations에 취소표 기록
        ↓
    LINK_SENT
    """

    connection = get_db_connection()

    try:
        with connection.cursor() as cursor:

            # ------------------------------------------------
            # 1. 기존 waiting_queue에서
            #    대기열 진입 당시 회원이었던 다음 대상자 조회
            # ------------------------------------------------

            target = get_next_eligible_member(
                cursor,
                req.event_id
            )

            if not target:
                raise HTTPException(
                    status_code=404,
                    detail=(
                        "해당 공연의 취소표를 받을 수 있는 "
                        "대기열 진입 당시 멤버십 회원이 없습니다."
                    )
                )

            user_id = target["user_id"]

            # ------------------------------------------------
            # 2. membership_at_join 값 최종 확인
            # ------------------------------------------------

            if target["membership_at_join"] != 1:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "대기열 진입 당시 멤버십 회원이 아니므로 "
                        "취소표 대상자가 아닙니다."
                    )
                )

            # ------------------------------------------------
            # 3. 중복 배정 방지
            # ------------------------------------------------

            existing = already_allocated(
                cursor,
                user_id,
                req.event_id,
                req.seat_id
            )

            if existing:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "이미 해당 사용자에게 "
                        "동일 이벤트/좌석의 취소표가 "
                        "배정된 기록이 있습니다."
                    )
                )

            # ------------------------------------------------
            # 4. 시크릿 링크 생성
            # ------------------------------------------------

            now = datetime.datetime.now()

            expire_time = (
                now
                + datetime.timedelta(
                    minutes=LINK_EXPIRE_MINUTES
                )
            )

            payload = {
                "user_id": user_id,
                "event_id": req.event_id,
                "seat_id": req.seat_id,
                "type": "resale_private_link",
                "exp": time_to_timestamp(expire_time),
            }

            private_token = jwt.encode(
                payload,
                SECRET_KEY,
                algorithm=ALGORITHM
            )

            # ------------------------------------------------
            # 5. cancel_allocations에 실제 취소표 기록
            # ------------------------------------------------

            cursor.execute(
                """
                INSERT INTO cancel_allocations
                (
                    user_id,
                    seat_id,
                    event_id,
                    hold_duration,
                    status,
                    created_at,
                    expires_at
                )
                VALUES
                (
                    %s,
                    %s,
                    %s,
                    %s,
                    'LINK_SENT',
                    NOW(),
                    %s
                )
                """,
                (
                    user_id,
                    req.seat_id,
                    req.event_id,
                    LINK_EXPIRE_MINUTES * 60,
                    expire_time,
                )
            )

            allocation_id = cursor.lastrowid

            # ------------------------------------------------
            # 6. DB 반영
            # ------------------------------------------------

            connection.commit()

        # ----------------------------------------------------
        # 7. 응답
        # ----------------------------------------------------

        return {
            "status": "LINK_SENT",

            "allocation_id": allocation_id,

            "user_id": user_id,

            # 기존 waiting_queue 정보
            "queue_id": target["queue_id"],
            "queue_index": target["queue_index"],

            # 대기열 진입 당시 멤버십 여부
            "membership_at_join": target["membership_at_join"],

            "event_id": req.event_id,
            "seat_id": req.seat_id,

            # 5분 유효 시크릿 링크
            "private_link": (
                f"http://www.queuing.kr/"
                f"resale/ticket?token={private_token}"
            ),

            "expires_at": expire_time.strftime(
                "%Y-%m-%d %H:%M:%S"
            ),

            "message": (
                "기존 대기열 순서와 "
                "대기열 진입 당시 멤버십 여부를 기준으로 "
                "취소표 시크릿 링크를 발급했습니다."
            ),
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()

        raise HTTPException(
            status_code=500,
            detail=(
                "취소표 배정 처리 중 오류가 발생했습니다: "
                f"{str(e)}"
            )
        )

    finally:
        connection.close()


# ============================================================
# 시크릿 링크 검증
# ============================================================

@app.post("/api/v1/resale/verify-link")
def verify_and_invalidate_link(req: TokenVerifyRequest):
    """
    취소표 시크릿 링크 검증.

    검증 조건
    ------------------------------------------------------------
    1. JWT 서명 검증
    2. JWT 5분 만료시간 검증
    3. user_id / event_id / seat_id 확인
    4. cancel_allocations 존재 여부 확인
    5. LINK_SENT 또는 ACTIVE 상태인지 확인
    6. DB의 expires_at 확인
    7. LINK_SENT → ACTIVE 변경
    ------------------------------------------------------------
    """

    try:
        # ----------------------------------------------------
        # 1. JWT 검증
        # ----------------------------------------------------

        payload = jwt.decode(
            req.token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        user_id = payload.get("user_id")
        event_id = payload.get("event_id")
        seat_id = payload.get("seat_id")

        if not user_id or not event_id or not seat_id:
            raise HTTPException(
                status_code=400,
                detail="잘못된 링크 정보입니다."
            )

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=400,
            detail="유효 시간이 만료된 링크입니다."
        )

    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=400,
            detail="유효하지 않은 링크입니다."
        )

    connection = get_db_connection()

    try:
        with connection.cursor() as cursor:

            # ------------------------------------------------
            # 2. DB에서 배정 정보 확인
            # ------------------------------------------------

            cursor.execute(
                """
                SELECT
                    allocation_id,
                    status,
                    expires_at
                FROM cancel_allocations
                WHERE user_id = %s
                  AND event_id = %s
                  AND seat_id = %s
                ORDER BY allocation_id DESC
                LIMIT 1
                """,
                (
                    user_id,
                    event_id,
                    seat_id,
                )
            )

            item = cursor.fetchone()

            if not item:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "취소표 배정 정보를 "
                        "찾을 수 없습니다."
                    )
                )

            # ------------------------------------------------
            # 3. 링크 상태 확인
            # ------------------------------------------------

            if item["status"] not in (
                "LINK_SENT",
                "ACTIVE"
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "이미 사용되었거나 "
                        "권한이 없는 링크입니다."
                    )
                )

            # ------------------------------------------------
            # 4. DB 기준 만료 확인
            # ------------------------------------------------

            if (
                item["expires_at"] is not None
                and item["expires_at"]
                <= datetime.datetime.now()
            ):
                raise HTTPException(
                    status_code=400,
                    detail="유효 시간이 만료된 링크입니다."
                )

            # ------------------------------------------------
            # 5. 링크 접근 허용 상태로 변경
            # ------------------------------------------------

            cursor.execute(
                """
                UPDATE cancel_allocations
                SET status = 'ACTIVE'
                WHERE allocation_id = %s
                  AND status = 'LINK_SENT'
                """,
                (item["allocation_id"],)
            )

            connection.commit()

        return {
            "status": "VALID",
            "user_id": user_id,
            "event_id": event_id,
            "seat_id": seat_id,
            "allocation_id": item["allocation_id"],
            "message": (
                "접근이 허용되었습니다. "
                "취소표 좌석 선택 화면으로 이동합니다."
            ),
        }

    except HTTPException:
        connection.rollback()
        raise

    finally:
        connection.close()


# ============================================================
# Membership 등록
# ============================================================

@app.post("/api/v1/membership")
def create_membership(req: MembershipCreateRequest):

    connection = get_db_connection()

    try:
        with connection.cursor() as cursor:

            cursor.execute(
                """
                INSERT INTO memberships
                (
                    user_id,
                    plan,
                    created_at,
                    expires_at
                )
                VALUES
                (
                    %s,
                    %s,
                    NOW(),
                    %s
                )
                """,
                (
                    req.user_id,
                    req.plan,
                    req.expires_at,
                )
            )

            connection.commit()

        return {
            "status": "SUCCESS",
            "message": "멤버십이 성공적으로 등록되었습니다.",
        }

    except Exception as e:
        connection.rollback()

        raise HTTPException(
            status_code=500,
            detail=(
                "멤버십 등록 중 오류가 발생했습니다: "
                f"{str(e)}"
            )
        )

    finally:
        connection.close()


# ============================================================
# Membership 조회
# ============================================================

@app.get("/membership/{user_id}")
def get_membership(user_id: str):

    connection = get_db_connection()

    try:
        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT
                    membership_id,
                    user_id,
                    plan,
                    created_at,
                    expires_at
                FROM memberships
                WHERE user_id = %s
                  AND expires_at > NOW()
                ORDER BY expires_at DESC
                LIMIT 1
                """,
                (user_id,)
            )

            membership = cursor.fetchone()

            if not membership:
                return {
                    "isMembership": False,
                    "plan": None,
                    "createdAt": None,
                    "expiresAt": None,
                }

            return {
                "isMembership": True,
                "plan": membership.get("plan"),
                "createdAt": (
                    str(membership["created_at"])
                    if membership.get("created_at")
                    else None
                ),
                "expiresAt": (
                    str(membership["expires_at"])
                    if membership.get("expires_at")
                    else None
                ),
            }

    finally:
        connection.close()


# ============================================================
# Wishlist 조회
# ============================================================

@app.get("/wishlist/{user_id}")
def get_wishlist(user_id: str):

    connection = get_db_connection()

    try:
        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT *
                FROM wishlists
                WHERE user_id = %s
                """,
                (user_id,)
            )

            wishlist_rows = cursor.fetchall()

            formatted_wishlists = []

            for row in wishlist_rows:

                event_id = (
                    row.get("event_id")
                    or row.get("eventId")
                )

                formatted_wishlists.append(
                    {
                        "eventId": event_id
                    }
                )

            return {
                "wishlists": formatted_wishlists
            }

    finally:
        connection.close()


# ============================================================
# Utility
# ============================================================

def time_to_timestamp(dt):
    return int(time.mktime(dt.timetuple()))
