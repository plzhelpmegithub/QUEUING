import os
import json
import boto3
import pymysql
from dotenv import load_dotenv

load_dotenv()

# AWS 및 LocalStack 설정
ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://127.0.0.1:4566")
REGION = os.getenv("AWS_DEFAULT_REGION", "ap-northeast-2")

dynamodb = boto3.client('dynamodb', endpoint_url=ENDPOINT, region_name=REGION, aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", "test"), aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", "test"))
sqs = boto3.client('sqs', endpoint_url=ENDPOINT, region_name=REGION, aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", "test"), aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", "test"))

QUEUE_NAME = 'resale-queue' # KEDA, Terraform과 통일된 큐 이름
WAITING_TABLE = 'waiting-queue'

def check_membership(user_id):
    """MySQL에서 사용자의 멤버십 가입 여부 확인"""
    try:
        connection = pymysql.connect(
            host=os.getenv("MYSQL_HOST", "localhost"),
            user=os.getenv("MYSQL_USER", "root"),
            password=os.getenv("MYSQL_PASSWORD", "password"),
            database=os.getenv("MYSQL_DB", "queuing_db"),
            cursorclass=pymysql.cursors.DictCursor
        )
        with connection.cursor() as cursor:
            # users 또는 membership 테이블 구조에 맞춰 쿼리문 확인 필요
            sql = "SELECT is_membership FROM users WHERE user_id = %s"
            cursor.execute(sql, (user_id,))
            result = cursor.fetchone()
            
            if result and (result.get('is_membership') == 1 or result.get('is_membership') == True):
                return True
        return False
    except Exception as e:
        print(f"⚠️ MySQL 멤버십 조회 중 오류 발생 (기본 비회원 처리): {e}")
        return False
    finally:
        if 'connection' in locals() and connection.open:
            connection.close()

def process_next_queue(target_index):
    """대기열 순번 사용자 조회 -> MySQL 멤버십 검증 -> SQS 전송"""
    try:
        # 1. DynamoDB 대기열에서 해당 순번 사용자 조회
        response = dynamodb.get_item(
            TableName=WAITING_TABLE,
            Key={'queue_index': {'N': str(target_index)}}
        )
        
        if 'Item' not in response:
            print(f"❌ {target_index}번 대기열에 사용자가 없습니다.")
            return

        item = response['Item']
        user_id = item['user_id']['S']
        email = item['email']['S']
        status = item['status']['S']

        if status == 'SENT':
            print(f"⚠️ 이미 처리된 사용자입니다: {user_id} ({target_index}번)")
            return

        # 2. 🔥 [핵심 비즈니스 로직] MySQL을 통해 멤버십 회원인지 필터링
        print(f"🔍 [멤버십 검증 중] 사용자 ID: {user_id} 확인 중...")
        is_member = check_membership(user_id)
        
        if not is_member:
            print(f"🚫 [멤버십 검증 탈락] {user_id}님은 일반 대기자입니다. (예매 링크 발급 대상 아님)")
            # 선택사항: 일반 대기자이므로 상태를 'SKIPPED' 등으로 남겨둘 수 있음
            dynamodb.update_item(
                TableName=WAITING_TABLE,
                Key={'queue_index': {'N': str(target_index)}} ,
                UpdateExpression="SET #st = :skipped",
                ExpressionAttributeNames={"#st": "status"},
                ExpressionAttributeValues={":skipped": {"S": "SKIPPED"}}
            )
            return

        # 3. SQS 큐 URL 가져오기 (없으면 생성)
        try:
            url = sqs.get_queue_url(QueueName=QUEUE_NAME)['QueueUrl']
        except sqs.exceptions.ClientError:
            created = sqs.create_queue(QueueName=QUEUE_NAME)
            url = created['QueueUrl']

        # 4. SQS로 보낼 메시지 구성 (멤버십 통과한 회원만 전송)
        message_body = {
            'allocation_id': f'alloc-{user_id}-{target_index}',
            'user_id': user_id,
            'email': email
        }

        sqs.send_message(
            QueueUrl=url,
            MessageBody=json.dumps(message_body)
        )

        # 5. 대기열 상태를 'SENT'로 업데이트
        dynamodb.update_item(
            TableName=WAITING_TABLE,
            Key={'queue_index': {'N': str(target_index)}},
            UpdateExpression="SET #st = :sent",
            ExpressionAttributeNames={"#st": "status"},
            ExpressionAttributeValues={":sent": {"S": "SENT"}}
        )

        print(f"🎉 [멤버십 인증 성공!] {target_index}번 사용자 '{user_id}' ({email}) ➔ SQS 큐 전송 완료!")

    except Exception as e:
        print(f"❌ 프로세스 실행 중 에러 발생: {e}")

if __name__ == "__main__":
    target = input("처리할 대기열 순번을 입력하세요 (기본 1001): ") or "1001"
    process_next_queue(int(target))
