import boto3
import json

# AWS 및 LocalStack 설정
ENDPOINT = "http://127.0.0.1:4566"
REGION = "ap-northeast-2"

dynamodb = boto3.client('dynamodb', endpoint_url=ENDPOINT, region_name=REGION, aws_access_key_id='test', aws_secret_access_key='test')
sqs = boto3.client('sqs', endpoint_url=ENDPOINT, region_name=REGION, aws_access_key_id='test', aws_secret_access_key='test')

QUEUE_NAME = 'resale-email'
WAITING_TABLE = 'waiting-queue'

# 1. SQS 큐 가져오기 (없으면 생성)
try:
    url = sqs.get_queue_url(QueueName=QUEUE_NAME)['QueueUrl']
except sqs.exceptions.QueueDoesNotExist:
    created = sqs.create_queue(QueueName=QUEUE_NAME)
    url = created['QueueUrl']

def process_next_queue(target_index):
    """대기열 테이블에서 특정 순번의 사용자를 찾아 SQS로 자동 전송"""
    try:
        # 대기열에서 해당 순번 사용자 조회
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

        # SQS로 보낼 메시지 구성
        message_body = {
            'allocation_id': f'alloc-{user_id}-{target_index}',
            'user_id': user_id,
            'email': email
        }

        # SQS 큐에 메시지 전송
        sqs.send_message(
            QueueUrl=url,
            MessageBody=json.dumps(message_body)
        )

        # 대기열 상태를 'SENT'로 업데이트 (중복 발송 방지)
        dynamodb.update_item(
            TableName=WAITING_TABLE,
            Key={'queue_index': {'N': str(target_index)}},
            UpdateExpression="SET #st = :sent",
            ExpressionAttributeNames={"#st": "status"},
            ExpressionAttributeValues={":sent": {"S": "SENT"}}
        )

        print(f"🎉 [대기열 자동 연동] {target_index}번 사용자 '{user_id}' ({email}) ➔ SQS 큐로 자동 전송 완료!")

    except Exception as e:
        print(f"❌ 에러 발생: {e}")

if __name__ == "__main__":
    # 기본값으로 1001번(주인공) 자동 처리
    target = input("처리할 대기열 순번을 입력하세요 (기본 1001): ") or "1001"
    process_next_queue(int(target))
