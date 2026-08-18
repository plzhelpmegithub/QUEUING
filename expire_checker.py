import os
import json
from datetime import datetime
import boto3
from dotenv import load_dotenv

load_dotenv()

ENDPOINT = "http://127.0.0.1:4566"
REGION = "ap-northeast-2"
TABLE_NAME = "allocation-state"

dynamodb = boto3.client(
    "dynamodb",
    endpoint_url=ENDPOINT,
    region_name=REGION,
    aws_access_key_id="test",
    aws_secret_access_key="test"
)

def check_and_expire_links():
    print("⏰ [만료 체크 배치] 실행 중...")
    now_iso = datetime.utcnow().isoformat()

    try:
        # LINK_SENT 상태인 건들 조회
        response = dynamodb.scan(
            TableName=TABLE_NAME,
            FilterExpression="current_status = :sent",
            ExpressionAttributeValues={":sent": {"S": "LINK_SENT"}}
        )

        items = response.get("Items", [])
        for item in items:
            allocation_id = item.get("allocation_id", {}).get("S")
            expires_at = item.get("expires_at", {}).get("S")

            if expires_at and expires_at < now_iso:
                print(f"⌛ [만료 감지] 작업 ID: {allocation_id} (만료 시각: {expires_at})")

                # 상태를 EXPIRED로 업데이트
                dynamodb.update_item(
                    TableName=TABLE_NAME,
                    Key={"allocation_id": {"S": allocation_id}},
                    UpdateExpression="SET current_status = :expired, updated_at = :now",
                    ExpressionAttributeValues={
                        ":expired": {"S": "EXPIRED"},
                        ":now": {"S": now_iso}
                    }
                )
                print(f"❌ [상태 변경] {allocation_id} -> EXPIRED 처리 완료")

    except Exception as e:
        print(f"❌ 만료 체크 중 오류 발생: {e}")

if __name__ == "__main__":
    import time
    print("==================================================")
    print("🔄 QUEUING 취소표 만료 관리 배치 스크립트 가동")
    print("==================================================")
    while True:
        check_and_expire_links()
        time.sleep(30)
