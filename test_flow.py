import urllib.request
import json
import pymysql

print("1. DB 초기화 및 user_kim 리세일 대기열(LISTED) 등록 중...")
conn = pymysql.connect(
    host="localhost", 
    user="root", 
    password="1", 
    database="queuing_db", 
    charset="utf8mb4", 
    cursorclass=pymysql.cursors.DictCursor
)

with conn.cursor() as cursor:
    # 외래 키 제약조건을 고려하여 resale_queues 데이터 먼저 삭제
    cursor.execute("DELETE FROM resale_queues")
    
    # resale_queues 스키마에 맞추어 reservation_id, seller_user_id, status('LISTED') 입력
    # (주의: 만약 reservations 테이블에 id=1이 없다면 먼저 생성되어 있어야 합니다)
    cursor.execute(
        """
        INSERT INTO resale_queues (reservation_id, seller_user_id, status) 
        VALUES (1, 'user_kim', 'LISTED')
        """
    )
    conn.commit()
conn.close()
print("✅ DB 초기화 완료! 'user_kim'이 리세일 대기열에 등록되었습니다.")

print("\n2. 다음 순번 활성화 API(/activate-next) 호출 중...")
req = urllib.request.Request("http://localhost:8000/api/v1/resale/activate-next", method="POST")
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        print("🚀 활성화 응답 데이터 수신 완료!")
        print(f"   - 유저 ID: {data.get('user_id')}")
        print(f"   - 발급 링크: {data.get('private_link')}")
        print(f"   - 만료 시각: {data.get('expires_at')}")
        
        token = data["private_link"].split("token=")[1]
except Exception as e:
    print("❌ 활성화 실패:", e)
    exit(1)

print("\n3. 발급된 토큰 검증 API(/verify-link) 호출 중...")
verify_url = "http://localhost:8000/api/v1/resale/verify-link"
payload = json.dumps({"token": token}).encode('utf-8')
req2 = urllib.request.Request(
    verify_url, 
    data=payload, 
    headers={'Content-Type': 'application/json'}, 
    method="POST"
)
try:
    with urllib.request.urlopen(req2) as response:
        result = json.loads(response.read().decode())
        print("\n========================================")
        print("🎉 최종 테스트 결과:", result)
        print("========================================\n")
except Exception as e:
    print("❌ 토큰 검증 실패:", e)
