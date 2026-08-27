import datetime
import os
import time
import jwt
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import pymysql
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="QUEUING Resale Service (B Part)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://192.168.0.189:5173", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# JWT 설정
SECRET_KEY = "your-secure-jwt-secret-key"
ALGORITHM = "HS256"
LINK_EXPIRE_MINUTES = 5

# MySQL 연결 설정 (환경변수 반영)
def get_db_connection():
    return pymysql.connect(
        host=os.getenv("MYSQL_HOST", "localhost"),
        user="root",
        password=os.getenv("MYSQL_PASSWORD", "1"),
        database="queuing_db",
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor
    )

class QueueJoinRequest(BaseModel):
    user_id: str

class TokenVerifyRequest(BaseModel):
    token: str

def check_membership_from_db(user_id: str) -> bool:
    """
    중앙 회원 DB(MySQL)의 memberships 테이블을 조회하여 
    유효한 멤버십 기간 내에 있는지 확인
    """
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            # memberships 스키마에 맞춰 user_id와 만료일(expires_at) 검증
            sql = """
                SELECT membership_id 
                FROM memberships 
                WHERE user_id = %s AND expires_at > NOW()
            """
            cursor.execute(sql, (user_id,))
            result = cursor.fetchone()
            
            if result:
                return True
        return False
    finally:
        connection.close()


@app.post("/api/v1/resale/queue/join")
def join_resale_queue(req: QueueJoinRequest):
    """1. 취소표 대기열 등록 API (입구 컷: 유료 회원만 허용)"""
    if not check_membership_from_db(req.user_id):
        raise HTTPException(
            status_code=403, 
            detail="취소표 대기열은 유료 멤버십 회원만 진입할 수 있습니다."
        )
    
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            # 이미 대기열에 등록되어 있는지 확인
            cursor.execute("SELECT resale_id, status FROM resale_queues WHERE seller_user_id = %s", (req.user_id,))
            if cursor.fetchone():
                return {"status": "ALREADY_QUEUED", "message": "이미 취소표 대기열에 등록된 회원입니다."}
            
            # resale_queues 구조에 맞춰 필요시 대기 순번 처리
            cursor.execute("SELECT MAX(resale_id) as max_pos FROM resale_queues")
            row = cursor.fetchone()
            next_pos = (row['max_pos'] or 0) + 1
            
            # 대기열 등록 (WAITING 상태 기록 - 스키마에 맞춰 컬럼 매칭)
            cursor.execute(
                """
                INSERT INTO resale_queues (reservation_id, seller_user_id, status) 
                VALUES (0, %s, 'LISTED')
                """,
                (req.user_id,)
            )
            connection.commit()
            
        return {
            "status": "QUEUED",
            "queue_position": next_pos,
            "message": "취소표 대기열에 성공적으로 등록되었습니다."
        }
    finally:
        connection.close()


@app.post("/api/v1/resale/activate-next")
def activate_next_user():
    """
    3. 순차 배정 워크플로우 API (수동 트리거용)
    - 대기 중인 다음 회원을 활성화하고 실제 도메인 링크 발급
    """
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT resale_id, seller_user_id 
                FROM resale_queues 
                WHERE status = 'LISTED' 
                ORDER BY resale_id ASC 
                LIMIT 1
                """
            )
            target = cursor.fetchone()
            
            if not target:
                raise HTTPException(status_code=404, detail="대기 중인 사용자가 없습니다.")
            
            user_id = target['seller_user_id']
            
            now = datetime.datetime.now()
            expire_time = now + datetime.timedelta(minutes=LINK_EXPIRE_MINUTES)
            
            payload = {
                "user_id": user_id,
                "type": "resale_private_link",
                "exp": time_to_timestamp(expire_time)
            }
            private_token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
            
            # 상태를 ACTIVE 혹은 배정 상태로 변경
            cursor.execute(
                """
                UPDATE resale_queues 
                SET status = 'ACTIVE'
                WHERE resale_id = %s
                """,
                (target['resale_id'],)
            )
            connection.commit()
            
        return {
            "status": "ACTIVATED",
            "user_id": user_id,
            "queue_position": target['resale_id'],
            "private_link": f"http://www.queuing.kr/resale/ticket?token={private_token}",
            "expires_at": expire_time.strftime("%Y-%m-%d %H:%M:%S")
        }
    finally:
        connection.close()


@app.post("/api/v1/resale/verify-link")
def verify_and_invalidate_link(req: TokenVerifyRequest):
    """2. Private Link 검증 및 5분 제한 제어 API"""
    try:
        payload = jwt.decode(req.token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=400, detail="유효 시간이 만료된 링크입니다.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=400, detail="유효하지 않은 링크입니다.")
        
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT status FROM resale_queues WHERE seller_user_id = %s", (user_id,))
            item = cursor.fetchone()
            
            if not item or item['status'] != 'ACTIVE':
                raise HTTPException(status_code=400, detail="이미 사용되었거나 권한이 없는 링크입니다.")
                
        return {"status": "VALID", "message": "접근이 허용되었습니다. 좌석 선택 화면으로 이동합니다."}
    finally:
        connection.close()

def time_to_timestamp(dt):
    return int(time.mktime(dt.timetuple()))
