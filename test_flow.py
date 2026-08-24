import urllib.request
import json
import pymysql

print("1. DB 초기화 및 user_kim 대기열 등록 중...")
conn = pymysql.connect(host="localhost", user="root", password="1", database="queuing_db", charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor)
with conn.cursor() as cursor:
    cursor.execute("DELETE FROM resale_queues")
    cursor.execute("INSERT INTO resale_queues (user_id, queue_position, status) VALUES ('user_kim', 1, 'WAITING')")
    conn.commit()
conn.close()
print("✅ 완료!")

print("2. 다음 순번 활성화 API 호출 중...")
req = urllib.request.Request("http://localhost:8000/api/v1/resale/activate-next", method="POST")
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        print("🚀 활성화 응답 데이터 수신 완료!")
        token = data["private_link"].split("token=")[1]
except Exception as e:
    print("❌ 활성화 실패:", e)
    exit(1)

print("3. 발급된 토큰 검증 API 호출 중...")
verify_url = "http://localhost:8000/api/v1/resale/verify-link"
payload = json.dumps({"token": token}).encode('utf-8')
req2 = urllib.request.Request(verify_url, data=payload, headers={'Content-Type': 'application/json'}, method="POST")
try:
    with urllib.request.urlopen(req2) as response:
        result = json.loads(response.read().decode())
        print("\n========================================")
        print("🎉 최종 테스트 결과:", result)
        print("========================================\n")
except Exception as e:
    print("❌ 토큰 검증 실패:", e)
