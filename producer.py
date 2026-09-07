import os
import json
import boto3
import pymysql
from dotenv import load_dotenv

load_dotenv()


# ============================================================
# AWS / LocalStack 설정
# ============================================================

ENDPOINT = os.getenv(
    "AWS_ENDPOINT_URL",
    "http://127.0.0.1:4566"
)

REGION = os.getenv(
    "AWS_DEFAULT_REGION",
    "ap-northeast-2"
)

sqs = boto3.client(
    "sqs",
    endpoint_url=ENDPOINT,
    region_name=REGION,
    aws_access_key_id=os.getenv(
        "AWS_ACCESS_KEY_ID",
        "test"
    ),
    aws_secret_access_key=os.getenv(
        "AWS_SECRET_ACCESS_KEY",
        "test"
    )
)


# ============================================================
# SQS Queue
# ============================================================

QUEUE_NAME = "resale-queue"


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
        autocommit=False
    )


# ============================================================
# 대기열 사용자 조회
# ============================================================

def get_queue_user(connection, target_queue_id):
    """
    waiting_queue에서 특정 대기열 사용자를 조회한다.

    중요 정책
    ------------------------------------------------------------
    1. 현재 memberships 테이블을 조회하지 않는다.
    2. 대기열 진입 당시의 membership_at_join 값을 사용한다.
    3. membership_at_join = 1인 경우 취소표 대상이다.
    4. membership_at_join = 0인 경우 대상에서 제외한다.
    5. FOR UPDATE를 사용하여 해당 waiting_queue 행을 잠근다.
    """

    with connection.cursor() as cursor:

        cursor.execute(
            """
            SELECT
                w.queue_id,
                w.user_id,
                w.event_id,
                w.status,
                w.membership_at_join,
                u.email
            FROM waiting_queue w
            JOIN users u
              ON w.user_id = u.user_id
            WHERE w.queue_id = %s
            FOR UPDATE
            """,
            (target_queue_id,)
        )

        return cursor.fetchone()


# ============================================================
# SQS Queue URL 조회 / 생성
# ============================================================

def get_queue_url():
    try:

        response = sqs.get_queue_url(
            QueueName=QUEUE_NAME
        )

        return response["QueueUrl"]

    except sqs.exceptions.QueueDoesNotExist:

        response = sqs.create_queue(
            QueueName=QUEUE_NAME
        )

        return response["QueueUrl"]


# ============================================================
# 대기열 → SQS 처리
# ============================================================

def process_next_queue(target_queue_id):

    connection = None

    try:

        # ----------------------------------------------------
        # 1. MySQL 연결
        # ----------------------------------------------------

        connection = get_db_connection()


        # ----------------------------------------------------
        # 2. waiting_queue 사용자 조회
        # ----------------------------------------------------

        item = get_queue_user(
            connection,
            target_queue_id
        )

        if not item:

            print(
                f"❌ {target_queue_id}번 대기열 "
                f"(waiting_queue)에 사용자가 없습니다."
            )

            connection.rollback()
            return


        user_id = item["user_id"]
        email = item["email"]
        event_id = item["event_id"]

        # A파트 실제 컬럼명
        status = item["status"]

        # 대기열 진입 당시 저장된 멤버십 여부
        membership_at_join = item["membership_at_join"]


        print(
            f"🔍 대기열 사용자 확인: "
            f"user_id={user_id}, "
            f"queue_id={target_queue_id}, "
            f"event_id={event_id}"
        )

        print(
            f"🔍 현재 대기열 상태: "
            f"{status}"
        )

        print(
            f"🔍 대기열 진입 당시 멤버십 여부: "
            f"{membership_at_join}"
        )


        # ----------------------------------------------------
        # 3. 이미 처리된 사용자 확인
        # ----------------------------------------------------

        if status == "SENT":

            print(
                f"⚠️ 이미 처리된 사용자입니다: "
                f"{user_id} "
                f"(대기열 ID: {target_queue_id})"
            )

            connection.rollback()
            return


        # ----------------------------------------------------
        # 4. 이미 제외된 사용자 확인
        # ----------------------------------------------------

        if status == "SKIPPED":

            print(
                f"⚠️ 이미 취소표 대상에서 제외된 사용자입니다: "
                f"{user_id} "
                f"(대기열 ID: {target_queue_id})"
            )

            connection.rollback()
            return


        # ----------------------------------------------------
        # 5. 대기열 진입 당시 멤버십 여부 확인
        # ----------------------------------------------------
        #
        # 현재 memberships 테이블을 조회하지 않는다.
        #
        # membership_at_join
        # 1 = 대기열 진입 당시 회원
        # 0 = 대기열 진입 당시 비회원
        #
        # ----------------------------------------------------

        if membership_at_join != 1:

            print(
                f"🚫 [멤버십 대상 제외] "
                f"{user_id}님은 "
                f"대기열 진입 당시 비회원입니다."
            )

            print(
                f"   → membership_at_join = "
                f"{membership_at_join}"
            )


            # ------------------------------------------------
            # 비회원 → 취소표 대상 제외
            # ------------------------------------------------

            with connection.cursor() as cursor:

                cursor.execute(
                    """
                    UPDATE waiting_queue
                    SET status = 'SKIPPED',
                        updated_at = NOW()
                    WHERE queue_id = %s
                      AND status = 'WAITING'
                    """,
                    (target_queue_id,)
                )

                if cursor.rowcount != 1:

                    raise Exception(
                        "waiting_queue 상태 변경에 실패했습니다. "
                        "이미 처리된 대기열일 수 있습니다."
                    )


            connection.commit()


            print(
                f"⏭️ 대기열 ID {target_queue_id} "
                f"→ SKIPPED 처리 완료"
            )

            return


        # ----------------------------------------------------
        # 6. 멤버십 대상자 확인
        # ----------------------------------------------------

        print(
            f"✅ [멤버십 대상 확인] "
            f"{user_id}님은 "
            f"대기열 진입 당시 멤버십 회원입니다."
        )


        # ----------------------------------------------------
        # 7. SQS Queue URL 조회
        # ----------------------------------------------------

        url = get_queue_url()

        print(
            f"📨 SQS Queue URL 확인 완료: "
            f"{url}"
        )


        # ----------------------------------------------------
        # 8. SQS 메시지 생성
        # ----------------------------------------------------

        message_body = {

            "allocation_id":
                f"alloc-{user_id}-{target_queue_id}",

            "user_id":
                user_id,

            "email":
                email,

            "event_id":
                event_id,

            "queue_id":
                target_queue_id,

            "membership_at_join":
                membership_at_join
        }


        # ----------------------------------------------------
        # 9. SQS 메시지 전송
        # ----------------------------------------------------

        response = sqs.send_message(
            QueueUrl=url,
            MessageBody=json.dumps(
                message_body,
                ensure_ascii=False
            )
        )

        print(
            f"📨 SQS 메시지 전송 완료 "
            f"(MessageId: {response['MessageId']})"
        )


        # ----------------------------------------------------
        # 10. waiting_queue 상태 변경
        # ----------------------------------------------------
        #
        # SQS 전송 성공 후
        # WAITING → SENT
        #
        # ----------------------------------------------------

        with connection.cursor() as cursor:

            cursor.execute(
                """
                UPDATE waiting_queue
                SET status = 'SENT',
                    updated_at = NOW()
                WHERE queue_id = %s
                  AND status = 'WAITING'
                """,
                (target_queue_id,)
            )

            if cursor.rowcount != 1:

                raise Exception(
                    "waiting_queue 상태 변경에 실패했습니다. "
                    "이미 처리된 대기열일 수 있습니다."
                )


        # ----------------------------------------------------
        # 11. MySQL 트랜잭션 커밋
        # ----------------------------------------------------

        connection.commit()


        # ----------------------------------------------------
        # 12. 완료 로그
        # ----------------------------------------------------

        print(
            f"🎉 [취소표 대상 확정] "
            f"대기열 ID {target_queue_id}"
        )

        print(
            f"   사용자: {user_id}"
        )

        print(
            f"   이메일: {email}"
        )

        print(
            f"   이벤트: {event_id}"
        )

        print(
            f"   membership_at_join: "
            f"{membership_at_join}"
        )

        print(
            "   ➜ resale-queue 전송 완료!"
        )


    except Exception as e:

        if connection:

            connection.rollback()

        print(
            f"❌ 프로세스 실행 중 에러 발생: {e}"
        )


    finally:

        if connection and connection.open:

            connection.close()


# ============================================================
# 프로그램 실행
# ============================================================

if __name__ == "__main__":

    target = input(
        "처리할 대기열 순번(queue_id)을 입력하세요 "
        "(기본 1): "
    ) or "1"


    try:

        target_queue_id = int(target)

    except ValueError:

        print(
            "❌ queue_id는 숫자로 입력해야 합니다."
        )

        raise SystemExit(1)


    process_next_queue(
        target_queue_id
    )
