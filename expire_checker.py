import os
import pymysql
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

def get_db_connection():
    """MySQL 데이터베이스 연결 생성"""
    return pymysql.connect(
        host=os.getenv("MYSQL_HOST", "localhost"),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD", "1"),
        database=os.getenv("MYSQL_DB", "queuing_db"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor
    )

def check_and_expire_links():
    """
    취소표 Secret Link가 발급된 후(ACTIVE 상태) 지정된 제한 시간(예: 5~10분) 동안 
    사용자의 응답이 없으면 자동으로 만료(EXPIRED) 처리하고 좌석 및 대기열 정리
    """
    connection = None
    try:
        print("⏰ [만료 체크 배치 실행] 제한 시간 초과 미응답 링크 검사 중...")
        connection = get_db_connection()
        
        with connection.cursor() as cursor:
            # 1. cancel_allocations 테이블에서 상태가 'ACTIVE'인 항목 조회
            # (app.py에서 링크 발급 시 status = 'ACTIVE'로 설정함)
            sql = """
                SELECT allocation_id, user_id, seat_id, created_at, hold_duration 
                FROM cancel_allocations 
                WHERE status = 'ACTIVE'
            """
            cursor.execute(sql)
            items = cursor.fetchall()
            
            current_time = datetime.now()
            expired_count = 0

            for item in items:
                allocation_id = item['allocation_id']
                user_id = item['user_id']
                seat_id = item['seat_id']
                created_at = item['created_at'] # DATETIME 타입
                
                # hold_duration이 있다면 그 값을 쓰고, 없으면 기본 5분(또는 10분) 설정
                duration_minutes = item.get('hold_duration') or 5
                expiration_time = created_at + timedelta(minutes=duration_minutes)
                
                if current_time > expiration_time:
                    print(f"⌛ [만료 감지] 할당 ID '{allocation_id}' (유저: {user_id}) ➔ 제한 시간 초과로 만료 처리 진행")
                    
                    # 2. cancel_allocations 상태를 'EXPIRED'로 업데이트
                    update_alloc_sql = """
                        UPDATE cancel_allocations 
                        SET status = 'EXPIRED' 
                        WHERE allocation_id = %s
                    """
                    cursor.execute(update_alloc_sql, (allocation_id,))
                    
                    # 3. [선택 연동] seats 테이블의 점유 상태도 초기화 (다시 AVAILABLE로 원복하여 다음 대기자에게 기회 제공)
                    update_seat_sql = """
                        UPDATE seats 
                        SET status = 'AVAILABLE', held_by = '', held_at = NULL 
                        WHERE seat_id = %s AND status = 'LOCKED'
                    """
                    cursor.execute(update_seat_sql, (seat_id,))
                    
                    expired_count += 1

            connection.commit()
            print(f"🚫 [만료 체크 완료] 총 {expired_count개의} 미응답 건이 'EXPIRED' 처리되었습니다. (다음 대기자 기회 부여 가능)")

    except Exception as e:
        if connection:
            connection.rollback()
        print(f"❌ 만료 체크 배치 실행 중 에러 발생: {e}")
    finally:
        if connection and connection.open:
            connection.close()

if __name__ == "__main__":
    # 단발성 실행 또는 주기적 배치(Cron / APScheduler)로 호출 가능
    check_and_expire_links()
