import datetime
import os
import time
import uuid
import pymysql
import smtplib

from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from apscheduler.schedulers.blocking import BlockingScheduler


# ============================================================
# 환경 설정
# ============================================================

DB_HOST = os.getenv("DB_HOST", "211.46.52.164")
DB_PORT = int(os.getenv("DB_PORT", "13306"))
DB_USER = os.getenv("DB_USER", "team2")
DB_PASSWORD = os.getenv("DB_PASSWORD", "Gkrtod1@")
DB_NAME = os.getenv("DB_NAME", "queuing_db")

# Mailpit
SMTP_SERVER = os.getenv("SMTP_SERVER", "localhost")
SMTP_PORT = int(os.getenv("SMTP_PORT", "1025"))

SENDER_EMAIL = os.getenv(
    "SENDER_EMAIL",
    "QUEUING <no-reply@queuing.kr>"
)

BASE_URL = os.getenv(
    "BASE_URL",
    "https://www.queuing.kr"
)

LINK_EXPIRE_MINUTES = 5
WORKER_INTERVAL_SECONDS = 5


# ============================================================
# DB 연결
# ============================================================

def get_db_connection():
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False
    )


# ============================================================
# 이메일 발송
# ============================================================

def send_resale_email(
    receiver_email: str,
    name: str,
    private_link: str,
    expires_at: datetime.datetime
):
    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = SENDER_EMAIL
        msg["To"] = receiver_email
        msg["Subject"] = "[QUEUING] 기다리시던 취소표가 나왔어요"

        html_body = f"""
        <!DOCTYPE html>
        <html lang="ko">
        <head>
            <meta charset="UTF-8">
            <title>QUEUING 취소표 안내</title>
        </head>

        <body style="
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
            font-family: 'Apple SD Gothic Neo',
                         'Malgun Gothic',
                         Arial,
                         sans-serif;
        ">

            <div style="
                max-width: 600px;
                margin: 40px auto;
                background: #ffffff;
                border-radius: 12px;
                overflow: hidden;
                border: 1px solid #eeeeee;
            ">

                <!-- Header -->
                <div style="
                    padding: 24px 30px;
                    border-bottom: 1px solid #eeeeee;
                ">
                    <div style="
                        font-size: 22px;
                        font-weight: 700;
                        color: #111111;
                    ">
                        QUEUING
                    </div>
                </div>


                <!-- Content -->
                <div style="
                    padding: 35px 30px;
                    color: #333333;
                    line-height: 1.7;
                ">

                    <p style="
                        margin: 0 0 20px;
                        font-size: 16px;
                    ">
                        안녕하세요, <strong>{name}</strong>님.
                    </p>

                    <p style="
                        margin: 0 0 20px;
                        font-size: 16px;
                    ">
                        기다리시던 취소표 구매 기회가 도착했습니다.
                    </p>

                    <p style="
                        margin: 0 0 28px;
                        font-size: 15px;
                        color: #555555;
                    ">
                        예매 취소로 좌석이 발생하여
                        회원님의 대기 순서에 따라
                        우선 예매할 수 있는 기회를 안내드립니다.
                    </p>


                    <!-- Reservation Info -->
                    <div style="
                        background: #fafafa;
                        border-radius: 8px;
                        padding: 18px 20px;
                        margin-bottom: 28px;
                    ">

                        <div style="
                            margin-bottom: 8px;
                            font-size: 14px;
                            color: #777777;
                        ">
                            예매 가능 시간
                        </div>

                        <div style="
                            font-size: 16px;
                            font-weight: 600;
                            color: #222222;
                        ">
                            발급 후 5분
                        </div>

                        <div style="
                            margin-top: 15px;
                            margin-bottom: 8px;
                            font-size: 14px;
                            color: #777777;
                        ">
                            구매 가능 수량
                        </div>

                        <div style="
                            font-size: 16px;
                            font-weight: 600;
                            color: #222222;
                        ">
                            1인 1매
                        </div>

                    </div>


                    <!-- Button (Red) -->
                    <div style="
                        text-align: center;
                        margin: 35px 0;
                    ">

                        <a
                            href="{private_link}"
                            target="_blank"
                            style="
                                display: inline-block;
                                padding: 15px 42px;
                                background-color: #ff3b30;
                                color: #ffffff;
                                text-decoration: none;
                                border-radius: 7px;
                                font-size: 15px;
                                font-weight: 600;
                            "
                        >
                            취소표 예매하기
                        </a>

                    </div>


                    <!-- Notice -->
                    <div style="
                        border-top: 1px solid #eeeeee;
                        padding-top: 20px;
                        font-size: 13px;
                        color: #777777;
                        line-height: 1.8;
                    ">

                        <div>
                            · 이 링크는 발급 후 5분 동안 이용할 수 있습니다.
                        </div>

                        <div>
                            · 시간 내 예매가 완료되지 않으면
                              다음 대기자에게 구매 기회가 넘어갑니다.
                        </div>

                        <div>
                            · 취소표는 1인 1매만 구매할 수 있습니다.
                        </div>

                    </div>

                </div>


                <!-- Footer -->
                <div style="
                    padding: 22px 30px;
                    background: #fafafa;
                    border-top: 1px solid #eeeeee;
                ">

                    <div style="
                        font-size: 13px;
                        font-weight: 600;
                        color: #555555;
                    ">
                        QUEUING
                    </div>

                    <div style="
                        margin-top: 8px;
                        font-size: 11px;
                        color: #999999;
                        line-height: 1.6;
                    ">
                        본 메일은 QUEUING 멤버십 회원에게
                        취소표 구매 기회가 발생했을 때
                        자동으로 발송됩니다.
                    </div>

                </div>

            </div>

        </body>
        </html>
        """

        text_body = f"""
안녕하세요, {name}님.

기다리시던 취소표 구매 기회가 도착했습니다.

예매 취소로 좌석이 발생하여
회원님의 대기 순서에 따라 우선 예매할 수 있는
구매 기회를 안내드립니다.

취소표 예매하기:
{private_link}

이 링크는 발급 후 5분 동안 이용할 수 있습니다.

시간 내 예매가 완료되지 않으면
다음 대기자에게 구매 기회가 넘어갑니다.

취소표는 1인 1매만 구매할 수 있습니다.

감사합니다.

QUEUING
팝업스토어 통합 예약 서비스

본 메일은 QUEUING 멤버십 회원에게
취소표 구매 기회가 발생했을 때 자동으로 발송됩니다.
"""

        msg.attach(MIMEText(text_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10) as server:
            server.sendmail(SENDER_EMAIL, receiver_email, msg.as_string())

        print(f"📧 [메일 발송 성공] {receiver_email} ({name})")
        return True

    except Exception as e:
        print(f"❌ [메일 발송 실패] {receiver_email}: {e}")
        return False


# ============================================================
# DB Lock
# ============================================================

def acquire_worker_lock(connection):
    with connection.cursor() as cursor:
        cursor.execute("SELECT GET_LOCK('queuing_resale_worker', 0) AS lock_result")
        result = cursor.fetchone()
        return result["lock_result"] == 1


def release_worker_lock(connection):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT RELEASE_LOCK('queuing_resale_worker')")
    except Exception as e:
        print(f"⚠️ Worker Lock 해제 중 오류: {e}")


# ============================================================
# 만료된 취소표 링크 처리 (seat_id 기준)
# ============================================================

def expire_resale_links(cursor, now):
    cursor.execute(
        """
        UPDATE cancellation_link
        SET status = 'expired'
        WHERE status IN ('unused', 'in_progress')
          AND expires_at < %s
        """,
        (now,)
    )

    expired_count = cursor.rowcount
    if expired_count == 0:
        return 0

    print(f"[{now}] ⏰ 만료된 취소표 링크 {expired_count}건 처리")

    cursor.execute(
        """
        UPDATE cancel_allocations c
        INNER JOIN cancellation_link l
            ON c.seat_id COLLATE utf8mb4_general_ci = l.seat_id COLLATE utf8mb4_general_ci
        SET c.status = 'EXPIRED'
        WHERE l.status = 'expired'
          AND c.status = 'ACTIVE'
        """
    )
    return expired_count


# ============================================================
# 이벤트별 다음 취소표 대상자 처리 (seat_id 기준)
# ============================================================

def process_event(cursor, event_id, now):

    # 현재 해당 이벤트에서 활성화된 링크가 있는지 확인
    cursor.execute(
        """
        SELECT l.token, l.seat_id, l.expires_at
        FROM cancellation_link l
        INNER JOIN cancel_allocations c
            ON l.seat_id COLLATE utf8mb4_general_ci = c.seat_id COLLATE utf8mb4_general_ci
        WHERE c.event_id = %s
          AND l.status IN ('unused', 'in_progress')
          AND c.status = 'ACTIVE'
        LIMIT 1
        """,
        (event_id,)
    )

    active_link = cursor.fetchone()
    if active_link:
        return False

    # 다음 순번 대상자 조회
    cursor.execute(
        """
        SELECT
            c.allocation_id,
            c.user_id,
            c.seat_id,
            c.event_id,
            u.email,
            u.name
        FROM cancel_allocations c
        INNER JOIN users u
            ON c.user_id COLLATE utf8mb4_general_ci = u.user_id COLLATE utf8mb4_general_ci
        WHERE c.event_id = %s
          AND c.status = 'PENDING'
          AND EXISTS (
              SELECT 1
              FROM memberships m
              WHERE m.user_id COLLATE utf8mb4_general_ci = c.user_id COLLATE utf8mb4_general_ci
          )
        ORDER BY c.allocation_id ASC
        LIMIT 1
        FOR UPDATE
        """,
        (event_id,)
    )

    next_target = cursor.fetchone()
    if not next_target:
        return False

    allocation_id = next_target["allocation_id"]
    user_id = next_target["user_id"]
    seat_id = next_target["seat_id"]
    receiver_email = next_target["email"]
    name = next_target["name"]

    token = str(uuid.uuid4())
    issued_at = now
    expires_at = now + datetime.timedelta(minutes=LINK_EXPIRE_MINUTES)

    # 취소표 링크 생성
    cursor.execute(
        """
        INSERT INTO cancellation_link
        (token, seat_id, status, issued_at, expires_at)
        VALUES (%s, %s, 'unused', %s, %s)
        """,
        (token, seat_id, issued_at, expires_at)
    )

    # Allocation 활성화
    cursor.execute(
        """
        UPDATE cancel_allocations
        SET status = 'ACTIVE', expires_at = %s
        WHERE allocation_id = %s AND status = 'PENDING'
        """,
        (expires_at, allocation_id)
    )

    if cursor.rowcount != 1:
        raise RuntimeError(f"Allocation 상태 변경 실패: {allocation_id}")

    private_link = f"{BASE_URL}/resale/invite/{token}"

    print(f"[{now}] 🎟️ [공연: {event_id}] 다음 순번 대상자 [{name} ({user_id})] 취소표 링크 발급")

    return {
        "allocation_id": allocation_id,
        "user_id": user_id,
        "email": receiver_email,
        "name": name,
        "private_link": private_link,
        "expires_at": expires_at
    }


# ============================================================
# 메인 Worker Job
# ============================================================

def process_resale_queue_job():
    connection = None
    try:
        connection = get_db_connection()
        if not acquire_worker_lock(connection):
            connection.close()
            return

        try:
            now = datetime.datetime.now()
            connection.begin()

            with connection.cursor() as cursor:
                expire_resale_links(cursor, now)

                cursor.execute(
                    """
                    SELECT DISTINCT event_id
                    FROM cancel_allocations
                    WHERE status IN ('PENDING', 'ACTIVE')
                    """
                )
                events = cursor.fetchall()
                email_jobs = []

                for event in events:
                    result = process_event(cursor, event["event_id"], now)
                    if result:
                        email_jobs.append(result)

            connection.commit()

            for job in email_jobs:
                send_resale_email(
                    receiver_email=job["email"],
                    name=job["name"],
                    private_link=job["private_link"],
                    expires_at=job["expires_at"]
                )

        except Exception as e:
            if connection:
                connection.rollback()
            print(f"❌ Worker 실행 중 오류 (DB Rollback): {e}")

        finally:
            release_worker_lock(connection)

    except Exception as e:
        print(f"❌ DB 연결/Worker 실행 실패: {e}")
    finally:
        if connection:
            connection.close()


# ============================================================
# Scheduler
# ============================================================

if __name__ == "__main__":
    scheduler = BlockingScheduler()
    scheduler.add_job(
        process_resale_queue_job,
        "interval",
        seconds=WORKER_INTERVAL_SECONDS,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=10
    )

    print("🔄 QUEUING Cancellation Link Worker 시작 (Schema-safe)")
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        print("🛑 Worker를 종료합니다.")
