import os
import json
import uuid
from datetime import datetime, timedelta
import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv
import jwt

# .env 파일 로드 (1단계 보안 조치)
load_dotenv()

ENDPOINT = "http://127.0.0.1:4566"
REGION = "ap-northeast-2"

# 하드코딩 제거하고 환경 변수에서 안전하게 로드
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise ValueError("CRITICAL: JWT_SECRET environment variable is missing!")

QUEUE_URL = "http://127.0.0.1:4566/000000000000/resale-email"
TABLE_NAME = "allocation-state"

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

ses = boto3.client(
    "ses",
    endpoint_url=ENDPOINT,
    region_name=REGION,
    aws_access_key_id="test",
    aws_secret_access_key="test"
)

print("==================================================")
print("🚀 QUEUING 취소표 순차 배정 Worker (보안 + 조건부 업데이트 + JTI 통합)")
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
        recipient_email = body.get("email", "geonah.kim@example.com")

        print(f"\n📩 [배정 진행] 작업 ID: {allocation_id} | 사용자: {user_id} ({recipient_email})")

        # 1. 조건부 업데이트 (Idempotency 확보: 이미 처리 중이거나 완료된 경우 중복 차단)
        try:
            dynamodb.update_item(
                TableName=TABLE_NAME,
                Key={"allocation_id": {"S": allocation_id}},
                UpdateExpression="SET current_status = :status, current_user = :user, updated_at = :now",
                ConditionExpression="attribute_not_exists(current_status) OR current_status = :wait",
                ExpressionAttributeValues={
                    ":status": {"S": "PROCESSING"},
                    ":wait": {"S": "WAITING"},
                    ":user": {"S": user_id},
                    ":now": {"S": datetime.utcnow().isoformat()}
                }
            )
        except ClientError as e:
            if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                print(f"⚠️ [중복 차단] 이미 처리 중이거나 완료된 작업입니다. (Allocation ID: {allocation_id})")
                sqs.delete_message(QueueUrl=QUEUE_URL, ReceiptHandle=receipt_handle)
                continue
            else:
                raise e

        # 2. 고유 JTI 및 10분 TTL 포함 JWT 1회용 링크 생성
        jti = str(uuid.uuid4())
        expire_time = datetime.utcnow() + timedelta(minutes=10)
        
        payload = {
            "allocation_id": allocation_id,
            "user_id": user_id,
            "jti": jti,
            "exp": expire_time
        }
        secure_token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
        secure_link = f"http://127.0.0.1:8000/pay?token={secure_token}"

        print(f"🔒 생성된 보안 예매 링크 (JTI: {jti}): {secure_link}")

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

        # 4. 상태 저장: LINK_SENT (JTI 및 만료 시간 기록)
        dynamodb.update_item(
            TableName=TABLE_NAME,
            Key={"allocation_id": {"S": allocation_id}},
            UpdateExpression="SET current_status = :status, current_user = :user, jti = :jti, expires_at = :expire, updated_at = :now",
            ExpressionAttributeValues={
                ":status": {"S": "LINK_SENT"},
                ":user": {"S": user_id},
                ":jti": {"S": jti},
                ":expire": {"S": expire_time.isoformat()},
                ":now": {"S": datetime.utcnow().isoformat()}
            }
        )

        # 5. SQS 메시지 삭제
        sqs.delete_message(QueueUrl=QUEUE_URL, ReceiptHandle=receipt_handle)
        print("🗑️ SQS 메시지 처리 완료 및 삭제\n")

    except Exception as e:
        print(f"❌ Worker 오류 발생: {e}")
