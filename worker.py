import datetime
import os
import time
import jwt
import pymysql
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from apscheduler.schedulers.blocking import BlockingScheduler

# 1. 시크릿 및 토큰 설정
SECRET_KEY = "your-secure-jwt-secret-key"
ALGORITHM = "HS256"
LINK_EXPIRE_MINUTES = 5

# 2. 데이터베이스(D-Cloud) 연결 설정
DB_HOST = "211.46.52.164"
DB_PORT = 13306
DB_USER = "team2"
DB_PASSWORD = "Gkrtod1@"
DB_NAME = "queuing_db"

# 3. Mailpit (SMTP) 설정
SMTP_SERVER = "localhost"
SMTP_PORT = 1025
SENDER_EMAIL = "admin@queuing.kr"

def get_db_connection():
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor
    )

def time_to_timestamp(dt):
    return int(time.mktime(dt.timetuple()))

def send_resale_email(receiver_email: str, name: str, private_link: str):
    """
    Mailpit(SMTP)을 통해 5분 제한 티켓팅 링크를 이메일로 발송하는 함수
    """
    try:
        msg = MIMEMultipart()
        msg['From'] = SENDER_EMAIL
        msg['To'] = receiver_email
        msg['Subject'] = "[QUEUING] (멤버십 전용) 취소표 구매 대기 순번이 도래했습니다! (5분 제한)"

        body = f"""안녕하세요 {name}님, QUEUING 입니다.
기다리시던 취소표 구매 기회가 주어졌습니다! (멤버십 우선 혜택)

아래 링크를 클릭하시면 5분 동안만 좌석 선택 페이지로 입장하실 수 있습니다.
(5분이 지나면 링크가 자동 파기됩니다.)

👉 입장 링크: {private_link}

감사합니다."""
        
        msg.attach(MIMEText(body, 'plain', 'utf-8'))

        # Mailpit으로 직접 SMTP 전송 (인증 불필요)
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.sendmail(SENDER_EMAIL, receiver_email, msg.as_string())
            
        print(f"📧 [Mailpit 메일 발송 성공] {receiver_email} 님에게 전송됨.")
    except Exception as e:
        print(f"❌ 이메일 발송 실패: {e}")

def process_resale_queue_job():
    connection = get_db_connection()
    connection.begin()
    try:
        with connection.cursor() as cursor:
            now = datetime.datetime.now()
            
            # 1. 만료된 링크 일괄 처리 (cancel_allocations 스키마 반영)
            cursor.execute(
                """
                UPDATE cancel_allocations 
                SET status = 'EXPIRED' 
                WHERE status = 'ACTIVE' AND expires_at < %s
                """,
                (now,)
            )
            expired_count = cursor.rowcount
            if expired_count > 0:
                print(f"[{now}] ⏰ 만료된 링크 {expired_count}건을 EXPIRED 처리했습니다.")
            
            # 2. 현재 ACTIVE 유저 확인
            cursor.execute("SELECT id FROM cancel_allocations WHERE status = 'ACTIVE' LIMIT 1")
            active_user = cursor.fetchone()
            
            # 3. 활성 유저가 없다면 멤버십 가입된 PENDING 유저 선점 (비관적 락 FOR UPDATE 및 memberships 조인 적용)
            if not active_user:
                cursor.execute(
                    """
                    SELECT c.id, c.user_id, u.email, u.name 
                    FROM cancel_allocations c
                    INNER JOIN memberships m ON c.user_id = m.user_id
                    INNER JOIN users u ON c.user_id = u.user_id
                    WHERE c.status = 'PENDING' 
                    ORDER BY c.id ASC 
                    LIMIT 1 
                    FOR UPDATE
                    """
                )
                next_target = cursor.fetchone()
                
                if next_target:
                    user_id = next_target['user_id']
                    target_id = next_target['id']
                    receiver_email = next_target['email']
                    name = next_target['name']
                    
                    # 5분 제한 토큰 생성
                    expire_time = now + datetime.timedelta(minutes=LINK_EXPIRE_MINUTES)
                    payload = {
                        "user_id": user_id,
                        "type": "resale_private_link",
                        "exp": time_to_timestamp(expire_time)
                    }
                    private_token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
                    
                    # 상태를 ACTIVE로 전환하고 만료 시간 기록
                    cursor.execute(
                        """
                        UPDATE cancel_allocations 
                        SET status = 'ACTIVE', expires_at = %s 
                        WHERE id = %s
                        """,
                        (expire_time, target_id)
                    )
                    
                    private_link = f"http://www.queuing.kr/resale/ticket?token={private_token}"
                    print(f"[{now}] 🔒 [동시성 락] 멤버십 대상 다음 순번 [{name}({user_id})] 활성화 완료!")
                    
                    # Mailpit 이메일 발송 함수 호출
                    send_resale_email(receiver_email, name, private_link)
                else:
                    print(f"[{now}] ⏳ 대기 중인 멤버십 대상자가 없습니다.")
            
            connection.commit()
    except Exception as e:
        connection.rollback()
        print(f"❌ 워커 실행 중 에러 발생 (롤백됨): {e}")
    finally:
        connection.close()

if __name__ == "__main__":
    scheduler = BlockingScheduler()
    scheduler.add_job(process_resale_queue_job, 'interval', seconds=5)
    
    print("🔄 QUEUING Membership Resale Background Worker (Mailpit & Concurrency Safe)가 시작되었습니다.")
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        print("🛑 워커를 종료합니다.")
