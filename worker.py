import datetime
import time
import jwt
import pymysql
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from apscheduler.schedulers.blocking import BlockingScheduler

SECRET_KEY = "your-secure-jwt-secret-key"
ALGORITHM = "HS256"
LINK_EXPIRE_MINUTES = 5

# 이메일(SMTP) 설정 (실제 사용하는 계정이나 테스트 계정으로 수정 가능)
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SENDER_EMAIL = "your-email@gmail.com"
SENDER_PASSWORD = "your-email-app-password"

def get_db_connection():
    return pymysql.connect(
        host="localhost",
        user="root",
        password="1",
        database="queuing_db",
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor
    )

def time_to_timestamp(dt):
    return int(time.mktime(dt.timetuple()))

def send_resale_email(receiver_email: str, private_link: str):
    """
    활성화된 사용자에게 5분 제한 티켓팅 링크를 이메일로 발송하는 함수
    """
    if "your-email" in SENDER_EMAIL:
        print(f"📧 [메일 발송 스킵] 이메일 설정이 완료되지 않아 콘솔로 대체합니다. -> 수신자: {receiver_email}, 링크: {private_link}")
        return

    try:
        msg = MIMEMultipart()
        msg['From'] = SENDER_EMAIL
        msg['To'] = receiver_email
        msg['Subject'] = "[QUEUING] 취소표 구매 대기 순번이 도래했습니다! (5분 제한)"

        body = f"""
        안녕하세요, QUEUING 입니다.
        기다리시던 취소표 구매 기회가 주어졌습니다!
        
        아래 링크를 클릭하시면 5분 동안만 좌석 선택 페이지로 입장하실 수 있습니다.
        (5분이 지나면 링크가 자동 파기됩니다.)
        
        👉 입장 링크: {private_link}
        
        감사합니다.
        """
        msg.attach(MIMEText(body, 'plain'))

        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.sendmail(SENDER_EMAIL, receiver_email, msg.as_string())
            
        print(f"📧 [메일 발송 성공] {receiver_email} 님에게 안내 메일이 발송되었습니다.")
    except Exception as e:
        print(f"❌ 이메일 발송 실패: {e}")

def process_resale_queue_job():
    connection = get_db_connection()
    connection.begin()
    try:
        with connection.cursor() as cursor:
            now = datetime.datetime.now()
            
            # 1. 만료된 링크 일괄 처리
            cursor.execute(
                """
                UPDATE resale_queues 
                SET status = 'EXPIRED' 
                WHERE status = 'ACTIVE' AND expires_at < %s
                """,
                (now,)
            )
            expired_count = cursor.rowcount
            if expired_count > 0:
                print(f"[{now}] ⏰ 만료된 링크 {expired_count}건을 EXPIRED 처리했습니다.")
            
            # 2. 현재 ACTIVE 유저 확인
            cursor.execute("SELECT id FROM resale_queues WHERE status = 'ACTIVE' LIMIT 1")
            active_user = cursor.fetchone()
            
            # 3. 활성 유저가 없다면 다음 WAITING 유저 선점 (비관적 락 적용)
            if not active_user:
                cursor.execute(
                    """
                    SELECT id, user_id, queue_position 
                    FROM resale_queues 
                    WHERE status = 'WAITING' 
                    ORDER BY queue_position ASC 
                    LIMIT 1 
                    FOR UPDATE
                    """
                )
                next_target = cursor.fetchone()
                
                if next_target:
                    user_id = next_target['user_id']
                    target_id = next_target['id']
                    
                    # 유저의 실제 이메일 조회 (users 테이블에 email 컬럼이 있다고 가정, 없으면 user_id 활용)
                    cursor.execute("SELECT email FROM users WHERE user_id = %s", (user_id,))
                    user_info = cursor.fetchone()
                    receiver_email = user_info.get('email', f"{user_id}@test.com") if user_info else f"{user_id}@test.com"
                    
                    # 5분 제한 토큰 생성
                    expire_time = now + datetime.timedelta(minutes=LINK_EXPIRE_MINUTES)
                    payload = {
                        "user_id": user_id,
                        "type": "resale_private_link",
                        "exp": time_to_timestamp(expire_time)
                    }
                    private_token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
                    
                    # 상태 ACTIVE 전환
                    cursor.execute(
                        """
                        UPDATE resale_queues 
                        SET status = 'ACTIVE', private_token = %s, expires_at = %s 
                        WHERE id = %s
                        """,
                        (private_token, expire_time, target_id)
                    )
                    
                    private_link = f"http://www.queuing.kr/resale/ticket?token={private_token}"
                    print(f"[{now}] 🔒 [동시성 락] 다음 순번 [{user_id}] 활성화 완료!")
                    
                    # 이메일 발송 함수 호출
                    send_resale_email(receiver_email, private_link)
            
            connection.commit()
    except Exception as e:
        connection.rollback()
        print(f"❌ 워커 실행 중 에러 발생 (롤백됨): {e}")
    finally:
        connection.close()

if __name__ == "__main__":
    scheduler = BlockingScheduler()
    scheduler.add_job(process_resale_queue_job, 'interval', seconds=10)
    
    print("🔄 QUEUING Resale Background Worker (Email & Concurrency Safe)가 시작되었습니다.")
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        print("🛑 워커를 종료합니다.")
