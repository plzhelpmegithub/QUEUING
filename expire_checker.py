import os
import json
import boto3
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

# AWS 및 LocalStack 설정
ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://127.0.0.1:4566")
REGION = os.getenv("AWS_DEFAULT_REGION", "ap-northeast-2")

dynamodb = boto3.client(
    'dynamodb', 
    endpoint_url=ENDPOINT, 
    region_name=REGION, 
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", "test"), 
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", "test")
)

# 테이블 이름 정의 (Terraform main.tf와 통일된 이름)
TABLE_NAME = 'allocation-state'

def check_and_expire_links():
    """
    링크가 발급된 후(LINK_SENT 상태) 10분이 지날 동안 
    사용자의 응답(접속/예매 완료 등)이 없으면 자동으로 만료(EXPIRED) 처리
    """
    try:
        print("⏰ [만료 체크 배치 실행] 10분 초과 미응답 링크 검사 중...")
        
        # DynamoDB에서 전체 상태 스캔 (또는 GSI 활용 가능)
        response = dynamodb.scan(TableName=TABLE_NAME)
        items = response.get('Items', [])
        
        current_time = datetime.utcnow()

        for item in items:
            allocation_id = item['allocation_id']['S']
            status = item['status']['S']
            
            # LINK_SENT 상태인 항목만 대상
            if status == 'LINK_SENT':
                created_at_str = item.get('created_at', {}).get('S')
                
                if not created_at_str:
                    continue
                
                created_at = datetime.fromisoformat(created_at_str)
                
                # 🔥 [핵심 기획 반영] 발급 시점부터 정확히 10분이 경과했는지 계산
                expiration_time = created_at + timedelta(minutes=10)
                
                if current_time > expiration_time:
                    print(f"⌛ [만료 감지] 할당 ID '{allocation_id}' ➔ 10분 초과로 만료 처리 진행")
                    
                    # 상태를 EXPIRED로 업데이트
                    dynamodb.update_item(
                        TableName=TABLE_NAME,
                        Key={'allocation_id': {'S': allocation_id}},
                        UpdateExpression="SET #st = :expired",
                        ExpressionAttributeNames={"#st": "status"},
                        ExpressionAttributeValues={":expired": {"S": "EXPIRED"}}
                    )
                    print(f"🚫 [만료 완료] '{allocation_id}' 상태가 'EXPIRED'로 변경되었습니다. (다음 대기자 기회 부여 가능)")

    except Exception as e:
        print(f"❌ 만료 체크 배치 실행 중 에러 발생: {e}")

if __name__ == "__main__":
    # 단발성 실행 또는 주기적 데몬으로 활용 가능
    check_and_expire_links()
