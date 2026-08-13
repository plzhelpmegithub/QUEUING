import boto3
import time
import json
import jwt
from datetime import datetime, timedelta

ENDPOINT = "http://127.0.0.1:4566"
REGION = "ap-northeast-2"
JWT_SECRET = "super-secret-resale-key"  # 링크 위조 방지용 비밀 키

sqs = boto3.client(
    "sqs",
    endpoint_url=ENDPOINT,
    region_name=REGION,
    aws_access_key_id="test",
    aws_secret_access_key="test"
)

dynamodb = boto3.client(
    "dynamodb",
    endpoint_url=ENDPOINT,
    region_name=REGION,
    aws_access_key_id="test",
    aws_secret_access_key="test"
)

QUEUE_URL = "http://127.0.0.1:4566/000000000000/resale-email"
TABLE_NAME = "allocation-state"

print("==========================================")
print("🚀 QUEUING 취소표 순차 배정 Worker (3단계: JWT 보안 서명 적용) 시작")
print("==========================================")

while True:
    try:
        response = sqs.receive_message(
            QueueUrl=QUEUE_URL,
            MaxNumberOfMessages=1,
            WaitTimeSeconds=5
        )

        if "Messages" not in response:
            continue

        msg = response["Messages"][0]
        receipt_handle = msg["ReceiptHandle"]
        body = json.loads(msg["Body"])

        allocation_id = body.get("allocation_id")
        user_id = body.get("user_id")

        print(f"📩 새로운 취소표 배정 작업: {allocation_id} (User: {user_id})")

        # 1. 작업 시작 상태 저장 (PROCESSING)
        dynamodb.update_item(
            TableName=TABLE_NAME,
            Key={"allocation_id": {"S": allocation_id}},
            UpdateExpression="SET current_status = :status, current_user = :user",
            ExpressionAttributeValues={
                ":status": {"S": "PROCESSING"},
                ":user": {"S": user_id}
            }
        )
        print("📝 DynamoDB 상태 저장: PROCESSING")

        # 2. 링크 발송 시뮬레이션
        print("🔗 취소표 예매 링크 발송 작업 시작...")
        time.sleep(3)

        # 3. 10분 뒤 만료 시간 계산 및 JWT 보안 토큰 생성
        expire_time = datetime.now() + timedelta(minutes=10)
        
        payload = {
            "allocation_id": allocation_id,
            "user_id": user_id,
            "exp": expire_time
        }
        
        secure_token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
        secure_link = f"https://resale.ticket.com/pay?token={secure_token}"
        
        print(f"🔒 보안 서명된 1회용 링크 생성 완료: {secure_link[:40]}...")

        # 4. 작업 완료 상태 저장 (LINK_SENT + 만료 기한 + 토큰 정보)
        dynamodb.update_item(
            TableName=TABLE_NAME,
            Key={"allocation_id": {"S": allocation_id}},
            UpdateExpression="SET current_status = :status, current_user = :user, expires_at = :expire",
            ExpressionAttributeValues={
                ":status": {"S": "LINK_SENT"},
                ":user": {"S": user_id},
                ":expire": {"S": expire_time.isoformat()}
            }
        )
        print(f"✅ DynamoDB 상태 업데이트: LINK_SENT (만료 기한: {expire_time.isoformat()})")

        # 5. SQS 메시지 최종 삭제
        sqs.delete_message(QueueUrl=QUEUE_URL, ReceiptHandle=receipt_handle)
        print("🗑️ SQS 메시지 삭제 완료\n")

    except Exception as e:
        print(f"❌ Worker 오류 발생: {e}")
        print("↻ 메시지는 삭제하지 않고 재시도합니다.\n")
