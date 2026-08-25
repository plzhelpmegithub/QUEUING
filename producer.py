import os
import json
import boto3
import pymysql
from dotenv import load_dotenv

load_dotenv()

# AWS 및 LocalStack 설정 (SQS 전송용)
ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://127.0.0.1:4566")
REGION = os.getenv("AWS_DEFAULT_REGION", "ap-northeast-2")

sqs = boto3.client(
    'sqs', 
    endpoint_url=ENDPOINT, 
    region_name=REGION, 
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", "test"), 
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", "test")
)

QUEUE_NAME = 'resale-queue' # KEDA, Terraform과 통일된 큐 이름

def get_db_connection():
    """MySQL 데이터베이스 연결 생성"""
    return pymysql.connect(
        host=os.getenv("MYSQL_HOST", "localhost"),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD", "password"),
        database=os.getenv("MYSQL_DB", "queuing_db"),
        cursorclass=pymysql.cursors.DictCursor
    )

def check_membership(connection, user_id):
    """MySQL memberships 테이블을 조회하여 사용자의 유효한 멤버십 가입 여부 확인"""
    try:
        with connection.cursor() as cursor:
            # memberships 테이블과 users 테이블 스키마에 맞춘 쿼리
            # expires_at이 현재 시간보다 미래인 유효한 멤버십이 존재하는지 확인
            sql = """
                SELECT m.membership_id 
                FROM memberships m 
                WHERE m.user_id = %s AND m.expires_at > NOW()
            """
            cursor.execute(sql, (user_id,))
            result = cursor.fetchone()
            
            if result:
                return True
        return False
    except Exception as e:
        print(f"⚠️ MySQL 멤버십 조회 중 오류 발생 (기본 비회원 처리): {e}")
        return False

def process_next_queue(target_queue_id):
    """MySQL waiting_queue 대기열 순번 조회 -> memberships 테이블 검증 -> SQS 전송"""
    connection = None
    try:
        connection = get_db_connection()
        
        with connection.cursor() as cursor:
            # 1. waiting_queue 테이블과 users 테이블을 조인하여 사용자 정보 조회
            sql = """
                subquery (SELECT w.queue_id, w.user_id, w.event_id, w.queue_status, u.email 
                FROM waiting_queue w 
                JOIN users u ON w.user_id = u.user_id 
                WHERE w.queue_id = %s)
            """
            # 조인 문법 수정 반영 쿼리
            cursor.execute("""
                SELECT w.queue_id, w.user_id, w.event_id, w.queue_status, u.email 
                FROM waiting_queue w 
                JOIN users u ON w.user_id = u.user_id 
                WHERE w.queue_id = %s
            """, (target_queue_id,))
            
            item = cursor.fetchone()

        if not item:
            print(f"❌ {target_queue_id}번 대기열(waiting_queue)에 사용자가 없습니다.")
            return

        user_id = item['user_id']
        email = item['email']
        queue_status = item['queue_status']

        if queue_status == 'SENT':
            print(f"⚠️ 이미 처리된 사용자입니다: {user_id} (대기열 ID: {target_queue_id})")
            return

        # 2. 🔥 [핵심 비즈니스 로직] MySQL memberships 테이블을 통해 멤버십 회원인지 검증
        print(f"🔍 [멤버십 검증 중] 사용자 ID: {user_id} 확인 중...")
        is_member = check_membership(connection, user_id)

        with connection.cursor() as cursor:
            if not is_member:
                print(f"🚫 [멤버십 검증 탈락] {user_id}님은 일반 대기자입니다. (예매 링크 발급 대상 아님)")
                # 일반 대기자이므로 waiting_queue의 상태를 'SKIPPED'로 업데이트
                update_sql = "UPDATE waiting_queue SET queue_status = 'SKIPPED' WHERE queue_id = %s"
                cursor.execute(update_sql, (target_queue_id,))
                connection.commit()
                return

        # 3. SQS 큐 URL 가져오기 (없으면 생성)
        try:
            url = sqs.get_queue_url(QueueName=QUEUE_NAME)['QueueUrl']
        except sqs.exceptions.ClientError:
            created = sqs.create_queue(QueueName=QUEUE_NAME)
            url = created['QueueUrl']

        # 4. SQS로 보낼 메시지 구성 (멤버십 통과한 회원만 전송)
        message_body = {
            'allocation_id': f'alloc-{user_id}-{target_queue_id}',
            'user_id': user_id,
            'email': email,
            'event_id': item['event_id']
        }

        sqs.send_message(
            QueueUrl=url,
            MessageBody=json.dumps(message_body)
        )

        # 5. waiting_queue 테이블의 상태를 'SENT'로 업데이트
        with connection.cursor() as cursor:
            update_sql = "UPDATE waiting_queue SET queue_status = 'SENT' WHERE queue_id = %s"
            cursor.execute(update_sql, (target_queue_id,))
            connection.commit()

        print(f"🎉 [멤버십 인증 성공!] 대기열 ID {target_queue_id} 사용자 '{user_id}' ({email}) ➔ SQS 큐 전송 완료!")

    except Exception as e:
        print(f"❌ 프로세스 실행 중 에러 발생: {e}")
    finally:
        if connection and connection.open:
            connection.close()

if __name__ == "__main__":
    target = input("처리할 대기열 순번(queue_id)을 입력하세요 (기본 1): ") or "1"
    process_next_queue(int(target))
