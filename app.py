import datetime
import time
import jwt
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import pymysql

app = FastAPI(title="QUEUING Resale Service (B Part)")

# JWT 설정
SECRET_KEY = "your-secure-jwt-secret-key"
ALGORITHM = "HS256"
LINK_EXPIRE_MINUTES = 5

# MySQL 연결 설정 (비밀번호 '1' 반영)
def get_db_connection():
    return pymysql.connect(
        host="localhost",
        user="root",
        password="1",
        database="queuing_db",
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor
    )

class QueueJoinRequest(BaseModel):
    user_id: str

class TokenVerifyRequest(BaseModel):
    token: str

def check_membership_from_db(user_id: str) -> bool:
    """중앙 회원 DB(MySQL)를 조회하여 유료 멤버십 구독 상태인지 확인"""
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            sql = "SELECT membership_status FROM users WHERE user_id = %s"
            cursor.execute(sql, (user_id,))
            result = cursor.fetchone()
            
            if result and result.get('membership_status') == 'ACTIVE':
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
            cursor.execute("SELECT id, status FROM resale_queues WHERE user_id = %s", (req.user_id,))
            if cursor.fetchone():
                return {"status": "ALREADY_QUEUED", "message": "이미 취소표 대기열에 등록된 회원입니다."}
            
            # 마지막 대기 순번 조회 후 +1
            cursor.execute("SELECT MAX(queue_position) as max_pos FROM resale_queues")
            row = cursor.fetchone()
            next_pos = (row['max_pos'] or 0) + 1
            
            # 대기열 등록 (WAITING)
            cursor.execute(
                "INSERT INTO resale_queues (user_id, queue_position, status) VALUES (%s, %s, 'WAITING')",
                (req.user_id, next_pos)
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
                "SELECT id, user_id, queue_position FROM resale_queues WHERE status = 'WAITING' ORDER BY queue_position ASC LIMIT 1"
            )
            target = cursor.fetchone()
            
            if not target:
                raise HTTPException(status_code=404, detail="대기 중인 사용자가 없습니다.")
            
            user_id = target['user_id']
            
            now = datetime.datetime.now()
            expire_time = now + datetime.timedelta(minutes=LINK_EXPIRE_MINUTES)
            
            payload = {
                "user_id": user_id,
                "type": "resale_private_link",
                "exp": time_to_timestamp(expire_time)
            }
            private_token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
            
            cursor.execute(
                """
                UPDATE resale_queues 
                SET status = 'ACTIVE', private_token = %s, expires_at = %s 
                WHERE user_id = %s
                """,
                (private_token, expire_time, user_id)
            )
            connection.commit()
            
        return {
            "status": "ACTIVATED",
            "user_id": user_id,
            "queue_position": target['queue_position'],
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
            cursor.execute("SELECT status, expires_at FROM resale_queues WHERE user_id = %s", (user_id,))
            item = cursor.fetchone()
            
            if not item or item['status'] != 'ACTIVE':
                raise HTTPException(status_code=400, detail="이미 사용되었거나 권한이 없는 링크입니다.")
            
            if datetime.datetime.now() > item['expires_at']:
                cursor.execute("UPDATE resale_queues SET status = 'EXPIRED' WHERE user_id = %s", (user_id,))
                connection.commit()
                raise HTTPException(status_code=400, detail="5분 유효 시간이 경과했습니다.")
                
        return {"status": "VALID", "message": "접근이 허용되었습니다. 좌석 선택 화면으로 이동합니다."}
    finally:
        connection.close()

def time_to_timestamp(dt):
    return int(time.mktime(dt.timetuple()))
