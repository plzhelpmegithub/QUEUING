import os
import boto3
import json
from dotenv import load_dotenv

load_dotenv()

# AWS 및 LocalStack 설정 (환경변수 지원)
ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://127.0.0.1:4566")
REGION = os.getenv("AWS_DEFAULT_REGION", "ap-northeast-2")

sqs = boto3.client(
    'sqs', 
    endpoint_url=ENDPOINT, 
    region_name=REGION, 
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", "test"), 
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", "test")
)

# KEDA, Terraform, producer.py와 통일된 큐 이름
QUEUE_NAME = 'resale-queue'

# 큐가 없으면 자동으로 생성하고, 있으면 URL을 가져옴
try:
    url = sqs.get_queue_url(QueueName=QUEUE_NAME)['QueueUrl']
except sqs.exceptions.ClientError:
    created = sqs.create_queue(QueueName=QUEUE_NAME)
    url = created['QueueUrl']
    print(f"📦 '{QUEUE_NAME}' 큐가 새로 생성되었습니다.")

# 기존 큐 비우기 (선택 사항)
try:
    sqs.purge_queue(QueueUrl=url)
except Exception:
    pass

# 테스트할 사용자 이름 입력 받기
username = input("생성할 사용자 ID를 입력하세요 (예: minsoo): ") or "test_user"

message_body = {
    'allocation_id': f'alloc-{username}',
    'user_id': username,
    'email': f'{username}@example.com'
}

sqs.send_message(QueueUrl=url, MessageBody=json.dumps(message_body))
print(f"✅ 사용자 '{username}' 테스트 메시지가 '{QUEUE_NAME}' 큐로 전송 완료되었습니다!")
