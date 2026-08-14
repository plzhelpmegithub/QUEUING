import jwt
from fastapi import FastAPI, Query
from fastapi.responses import HTMLResponse

app = FastAPI()

# 워커와 동일한 비밀 키 (링크 위변조 방지)
JWT_SECRET = "super-secret-resale-key"

@app.get("/pay", response_class=HTMLResponse)
def verify_and_show_checkout(token: str = Query(..., description="1회용 보안 JWT 토큰")):
    try:
        # 1. JWT 토큰 디코딩 및 서명 검증 (만료 시간 자동으로 체크됨)
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        
        # 개인정보(실명/계정)는 화면에 절대 노출하지 않고, 시스템 내부 배정 ID만 추출
        allocation_id = payload.get("allocation_id")
        
        # 2. 검증 성공 시 보여줄 예매 페이지 (개인정보 마스킹 처리 완료)
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

    except jwt.ExpiredSignatureError:
        return HTMLResponse(content="<h3>❌ 유효 시간이 만료된 링크입니다. (10분 초과)</h3><p>다음 대기자에게 순번이 안전하게 양도되었습니다.</p>", status_code=400)
    except jwt.InvalidTokenError:
        return HTMLResponse(content="<h3>❌ 위조되었거나 잘못된 접근입니다.</h3>", status_code=400)

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
