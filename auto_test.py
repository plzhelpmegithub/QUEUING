import time
import urllib.request
import json
import pymysql

print("==================================================")
print("🚀 [B파트 자동화 시연 테스트] 시작합니다!")
print("==================================================")

# 1. DB 초기화
print("\n[Step 1] 🧹 DB 대기열 초기화 및 테스트 유저 등록 중...")
conn = pymysql.connect(host="localhost", user="root", password="1", database="queuing_db", charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor)
with conn.cursor() as cursor:
    cursor.execute("DELETE FROM resale_queues")
    cursor.execute("INSERT INTO resale_queues (user_id, queue_position, status) VALUES ('user_kim', 1, 'WAITING')")
    conn.commit()
conn.close()
print("✅ 초기화 완료! 'user_kim'이 대기열(WAITING)에 등록되었습니다.")

time.sleep(1)

# 2. 대기열 등록 API 테스트 (Join)
print("\n[Step 2] 📥 대기열 등록 API(/join) 호출 테스트...")
try:
    payload = json.dumps({"user_id": "user_park"}).encode('utf-8')
    req = urllib.request.Request("http://localhost:8000/api/v1/resale/queue/join", data=payload, headers={'Content-Type': 'application/json'}, method="POST")
    with urllib.request.urlopen(req) as res:
        print("✅ 응답:", res.read().decode())
except Exception as e:
    print("ℹ️ (이미 존재하거나 정상 응답):", e)

time.sleep(1)

# 3. 다음 순번 활성화 및 토큰 발급 (Activate-next)
print("\n[Step 3] ⚡ 순번 활성화 및 5분 제한 JWT 링크 발급 중...")
req = urllib.request.Request("http://localhost:8000/api/v1/resale/activate-next", method="POST")
try:
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read().decode())
        print(f"✅ 활성화 성공! 유저 ID: {data.get('user_id')}")
        print(f"🔗 발급된 링크: {data.get('private_link')}")
        print(f"⏰ 만료 시각: {data.get('expires_at')}")
        
        # 토큰 추출
        private_link = data.get('private_link')
        token = private_link.split("token=")[1]
except Exception as e:
    print("❌ 활성화 실패:", e)
    exit(1)

time.sleep(1)

# 4. 토큰 검증 API 테스트 (Verify-link)
print("\n[Step 4] 🔐 발급된 토큰 검증 API(/verify-link) 호출 중...")
verify_url = "http://localhost:8000/api/v1/resale/verify-link"
verify_payload = json.dumps({"token": token}).encode('utf-8')
req2 = urllib.request.Request(verify_url, data=verify_payload, headers={'Content-Type': 'application/json'}, method="POST")
try:
    with urllib.request.urlopen(req2) as res:
        result = json.loads(res.read().decode())
        print("==================================================")
        print("🎉 [최종 검증 결과]:", result)
        print("==================================================\n")
except Exception as e:
    print("❌ 토큰 검증 실패:", e)
