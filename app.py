import os
from datetime import datetime
import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.responses import HTMLResponse
import jwt

# .env 파일 로드 (1단계 보안 조치)
load_dotenv()

app = FastAPI()

# 하드코딩 제거하고 환경 변수에서 로드
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise ValueError("CRITICAL: JWT_SECRET environment variable is missing!")

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

@app.get("/pay", response_class=HTMLResponse)
def verify_and_show_checkout(token: str = Query(..., description="1회용 보안 JWT 토큰")):
    try:
        # 1. JWT 토큰 디코딩 및 서명 검증 (만료 시간 자동 체크)
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        allocation_id = payload.get("allocation_id")
        token_jti = payload.get("jti")
    except jwt.ExpiredSignatureError:
        return HTMLResponse(content="<h3>❌ 유효 시간이 만료된 링크입니다. (10분 초과)</h3><p>다음 대기자에게 순번이 안전하게 양도되었습니다.</p>", status_code=400)
    except jwt.InvalidTokenError:
        return HTMLResponse(content="<h3>❌ 위조되었거나 잘못된 접근입니다.</h3>", status_code=400)

    # 2. DynamoDB에서 상태 및 JTI 조회
    try:
        response = dynamodb.get_item(
            TableName=TABLE_NAME,
            Key={"allocation_id": {"S": allocation_id}}
        )
        item = response.get("Item")
        if not item:
            return HTMLResponse(content="<h3>❌ 존재하지 않는 배정 정보입니다.</h3>", status_code=404)

        current_status = item.get("current_status", {}).get("S")
        db_jti = item.get("jti", {}).get("S")

        # 3. 상태 검증 (중복 사용, 만료 방어)
        if current_status == "USED":
            return HTMLResponse(content="<h3>❌ 이미 사용된 1회용 링크입니다.</h3><p>재사용이 불가능합니다.</p>", status_code=400)
        if current_status == "EXPIRED":
            return HTMLResponse(content="<h3>❌ 기한이 만료된 배정 건입니다.</h3><p>다음 대기자에게 넘어갔습니다.</p>", status_code=400)
        if current_status != "LINK_SENT":
            return HTMLResponse(content=f"<h3>❌ 처리할 수 없는 상태입니다.</h3><p>현재 상태: {current_status}</p>", status_code=400)

        # 4. JTI 매칭 확인 (탈취/위변조 방어)
        if token_jti and db_jti and token_jti != db_jti:
            return HTMLResponse(content="<h3>❌ 유효하지 않은 JTI(토큰 고유 ID)입니다.</h3><p>재발급된 최신 링크를 사용하세요.</p>", status_code=400)

        # 5. 원자적 상태 업데이트: LINK_SENT -> USED (중복 클릭 원천 차단)
        dynamodb.update_item(
            TableName=TABLE_NAME,
            Key={"allocation_id": {"S": allocation_id}},
            UpdateExpression="SET current_status = :used, updated_at = :now",
            ConditionExpression="current_status = :sent",
            ExpressionAttributeValues={
                ":used": {"S": "USED"},
                ":sent": {"S": "LINK_SENT"},
                ":now": {"S": datetime.utcnow().isoformat()}
            }
        )

    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return HTMLResponse(content="<h3>❌ 이미 처리되었거나 동시 요청으로 인해 실패했습니다.</h3>", status_code=400)
        return HTMLResponse(content=f"<h3>❌ 데이터베이스 오류: {e}</h3>", status_code=500)
    except Exception as e:
        return HTMLResponse(content=f"<h3>❌ 시스템 오류: {e}</h3>", status_code=500)

    # 6. 검증 성공 시 보여줄 예매 페이지 (사용자님이 작성하신 깔끔한 HTML UI 유지)
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>QUEUING 취소표 예매 시스템</title>
        <meta charset="utf-8">
        <style>
            body {{ font-family: Arial, sans-serif; text-align: center; margin-top: 50px; background-color: #f4f4f9; }}
            .container {{ background: white; padding: 40px; border-radius: 10px; display: inline-block; box-shadow: 0px 0px 10px rgba(0,0,0,0.1); }}
            h2 {{ color: #333; }}
            .badge {{ background: #2ed573; color: white; padding: 5px 10px; border-radius: 5px; font-size: 14px; }}
            .btn {{ background: #ff4757; color: white; padding: 12px 25px; border: none; border-radius: 5px; font-size: 18px; cursor: pointer; text-decoration: none; display: inline-block; margin-top: 20px; }}
            .btn:hover {{ background: #ff3838; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h2>🎫 QUEUING 단독 취소표 예매관</h2>
            <p><span class="badge">보안 인증 완료</span> 안전한 세션이 연결되었습니다.</p>
            <p>배정 관리 번호: <strong>{allocation_id}</strong></p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <p>제한 시간 내에 아래 버튼을 눌러 취켓팅을 완료해 주세요.</p>
            <a href="/success?allocation_id={allocation_id}" class="btn">🚀 취소표 즉시 예매 완료하기</a>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content, status_code=200)

@app.get("/success", response_class=HTMLResponse)
def checkout_success(allocation_id: str):
    return f"""
    <html>
    <body style="text-align:center; margin-top:50px; font-family:Arial;">
        <h1 style="color:#2ed573;">🎉 예매가 성공적으로 완료되었습니다!</h1>
        <p>배정 관리 번호: {allocation_id}</p>
        <p>즐거운 관람 되시기 바랍니다.</p>
    </body>
    </html>
    """
