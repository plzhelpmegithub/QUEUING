import boto3
import time
import json
import jwt
from datetime import datetime, timedelta

ENDPOINT = "http://127.0.0.1:4566"
REGION = "ap-northeast-2"
JWT_SECRET = "super-secret-resale-key"

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

# AWS SES 클라이언트 추가 (로컬스택/실제 AWS 호환)
ses = boto3.client(
    "ses",
    endpoint_url=ENDPOINT,
    region_name=REGION,
    aws_access_key_id="test",
    aws_secret_access_key="test"
)

QUEUE_URL = "http://127.0.0.1:4566/000000000000/resale-email"
TABLE_NAME = "allocation-state"

print("==================================================")
print("🚀 QUEUING 취소표 순차 배정 Worker (SES 이메일 + FastAPI 링크 연동)")
print("==================================================")

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
        # 실제 수신할 이메일 주소 (메시지에 없으면 기본 테스트 주소 사용)
        recipient_email = body.get("email", "geonah.kim@example.com")

        print(f"\n📩 [배정 진행] 작업 ID: {allocation_id} | 사용자: {user_id} ({recipient_email})")

        # 1. 상태 저장: PROCESSING
        dynamodb.update_item(
            TableName=TABLE_NAME,
            Key={"allocation_id": {"S": allocation_id}},
            UpdateExpression="SET current_status = :status, current_user = :user",
            ExpressionAttributeValues={
                ":status": {"S": "PROCESSING"},
                ":user": {"S": user_id}
            }
        )

        # 2. 10분 TTL 포함 JWT 1회용 링크 생성
        expire_time = datetime.now() + timedelta(minutes=10)
        payload = {
            "allocation_id": allocation_id,
            "user_id": user_id,
            "exp": expire_time
        }
        secure_token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
        
        # 로컬 웹서버(FastAPI)로 연결되는 예매 링크
        secure_link = f"http://127.0.0.1:8000/pay?token={secure_token}"

        print(f"🔒 생성된 보안 예매 링크: {secure_link}")

        # 3. AWS SES를 통한 실제 이메일 발송 API 호출
        print(f"📧 AWS SES를 통해 {recipient_email}로 이메일 전송 중...")
        
        try:
            ses.send_email(
                Source="resale-admin@queuing.com",
                Destination={"ToAddresses": [recipient_email]},
                Message={
                    "Subject": {"Data": "[QUEUING] 단독 취소표 예매 링크가 발급되었습니다."},
                    "Body": {
                        "Text": {
                            "Data": f"안녕하세요 {user_id}님!\n10분 내에 아래 링크를 눌러 예매를 완료하세요.\n\n{secure_link}"
                        }
                    }
                }
            )
            print("✅ AWS SES 이메일 발송 성공!")
        except Exception as ses_err:
            print(f"⚠️ SES 전송 시뮬레이션/처리 중 로그: {ses_err}")

        # 4. 상태 저장: LINK_SENT
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

        # 5. SQS 메시지 삭제
        sqs.delete_message(QueueUrl=QUEUE_URL, ReceiptHandle=receipt_handle)
        print("🗑️ SQS 메시지 처리 완료 및 삭제\n")

    except Exception as e:
        print(f"❌ Worker 오류 발생: {e}")
