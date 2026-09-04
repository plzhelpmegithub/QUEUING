#!/usr/bin/env python3
"""
더미 유저 생성/삭제 도구 — QUEUING 팀 로컬 테스트용

users 테이블에 직접 INSERT 하며, 비밀번호는 백엔드(bcryptjs)와 호환되는
bcrypt 해시로 저장한다. 아이디를 한 도메인으로 통일하기 때문에
삭제는 조건절 한 줄로 끝난다.

■ 준비
    cd 파일이있는폴더경로
    
    pip install pymysql bcrypt

■ 사용
    python dummy_users.py create 원하는 수   # 3500명 생성 (상위 3명 멤버십 자동 부여)
    python dummy_users.py count         # 현재 더미 수 확인
    python dummy_users.py delete        # 더미 전원 삭제 (연관 테이블 포함)

■ 접속 정보는 환경변수로 덮어쓸 수 있다
    DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME
"""

import os
import sys
import argparse
from datetime import datetime, timedelta

try:
    import pymysql
    import bcrypt
except ImportError:
    sys.exit("필요한 패키지가 없습니다.  pip install pymysql bcrypt")


# ─────────────────────────────────────────────
# 설정
# ─────────────────────────────────────────────
DOMAIN = "sim.local"        # 더미 아이디 도메인 — 삭제 조건절의 기준
PASSWORD = "sim1234"        # 더미 공통 비밀번호
PAD = 4                     # dummy0001 형태의 자릿수
BATCH = 500                 # 한 번에 INSERT 할 행 수
MEMBERSHIP_COUNT = 3        # 멤버십을 부여할 인원수
# 멤버십을 대기열의 어디에 심을지 결정한다. 취소표 대기열 시나리오를 돌리려면
# "멤버십은 있는데 표를 못 구한 사람"이 필요하므로 뒤쪽(last)이 기본값이다.
#   first  … dummy0001 부터. 앞 순번이라 좌석을 잡고 성공한다
#   last   … 마지막 번호부터. 뒤 순번이라 매진되고 취소표 대기열로 간다
#   spread … 처음·중간·끝에 고르게. 성공과 실패가 섞인다
MEMBERSHIP_WHERE = "last"

# '%' 가 앞에 오지 않아야 user_id 인덱스를 탄다
LIKE = f"dummy%@{DOMAIN}"

# 더미가 흔적을 남길 수 있는 테이블. users 는 마지막에 지운다(참조 순서).
RELATED = ["cancel_allocations", "memberships", "reservations", "wishlists", "waiting_queue"]

# 설정
DB = {
    "host": os.getenv("DB_HOST", "211.46.52.164"),
    "port": int(os.getenv("DB_PORT", "13306")),
    "user": os.getenv("DB_USER", "team2"),
    "password": os.getenv("DB_PASSWORD", "Gkrtod1@"),
    "database": os.getenv("DB_NAME", "queuing_db"),
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
    "ssl": None,            # D-Cloud 는 자체 서명 인증서라 SSL 을 끈다
}


def connect():
    if not DB["password"]:
        DB["password"] = input("DB 비밀번호: ").strip()
    return pymysql.connect(**DB)


def uid(n: int) -> str:
    return f"dummy{n:0{PAD}d}@{DOMAIN}"


def chunks(seq):
    for i in range(0, len(seq), BATCH):
        yield seq[i : i + BATCH]


def dummy_count(cur) -> int:
    cur.execute("SELECT COUNT(*) AS c FROM users WHERE user_id LIKE %s", (LIKE,))
    return cur.fetchone()["c"]


# ─────────────────────────────────────────────
# 생성
# ─────────────────────────────────────────────
def create(count: int) -> None:    #여기서 count는 python dummy_users.py create 의 뒤에 적은 숫자에 해당한다. 
    # bcrypt 는 의도적으로 느리다. 모두 같은 비밀번호이므로 해시는 한 번만 계산한다.
    print("비밀번호 해시 생성 중…")
    pw = bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt(rounds=10)).decode()

    conn = connect()
    try:
        with conn.cursor() as cur:
            before = dummy_count(cur)

            users = [
                (uid(n), pw, "user", uid(n), f"더미{n}", "010-0000-0000", "2000-01-01")
                for n in range(1, count + 1)
            ]
            sql = (
                "INSERT IGNORE INTO users "
                "(user_id, password, role, email, name, phone, birth_date) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)"
            )
            done = 0
            for chunk in chunks(users):
                cur.executemany(sql, chunk)
                conn.commit()
                done += len(chunk)
                print(f"\r  {done:,} / {count:,}", end="", flush=True)
            print()

            # 상위 몇 명에게 멤버십 부여.
            # memberships.user_id 에는 UNIQUE 제약이 없어 INSERT IGNORE 로는 중복을 못 막는다.
            # 여러 번 실행해도 1인 1건이 되도록 먼저 지우고 넣는다.
            target = min(MEMBERSHIP_COUNT, count)
            if target:
                if MEMBERSHIP_WHERE == "first":
                    nums = list(range(1, target + 1))
                elif MEMBERSHIP_WHERE == "spread":
                    step = max(1, (count - 1) // max(1, target - 1)) if target > 1 else 1
                    nums = [min(count, 1 + i * step) for i in range(target)]
                else:  # last
                    nums = list(range(count - target + 1, count + 1))
                ids = [uid(n) for n in nums]
                ph = ",".join(["%s"] * len(ids))
                cur.execute(f"DELETE FROM memberships WHERE user_id IN ({ph})", ids)
                expires = datetime.now() + timedelta(days=30)
                cur.executemany(
                    "INSERT INTO memberships "
                    "(user_id, tier_name, expires_at, is_membership, plan, priority_level) "
                    "VALUES (%s, 'PREMIUM', %s, 1, 'monthly', 1)",
                    [(i, expires) for i in ids],
                )
                conn.commit()
                print(f"  멤버십 {target}명 ({MEMBERSHIP_WHERE}) — {', '.join(ids)}"
                      f" · 만료 {expires:%Y-%m-%d}")

            after = dummy_count(cur)

        print(f"\n완료 — 신규 {after - before:,}명 (전체 더미 {after:,}명)")
        print(f"로그인:  {uid(1)} / {PASSWORD}")
    finally:
        conn.close()


# ─────────────────────────────────────────────
# 삭제
# ─────────────────────────────────────────────
def delete(yes: bool) -> None:
    conn = connect()
    try:
        with conn.cursor() as cur:
            n = dummy_count(cur)
            if n == 0:
                print(f"@{DOMAIN} 더미 유저가 없습니다.")
                return

            if not yes:
                print(f"삭제 대상: @{DOMAIN} 더미 {n:,}명 (연관 데이터 포함)")
                if input("정말 삭제할까요? (yes 입력): ").strip().lower() != "yes":
                    print("취소했습니다.")
                    return

            for t in RELATED + ["users"]:
                try:
                    cur.execute(f"DELETE FROM {t} WHERE user_id LIKE %s", (LIKE,))
                    if cur.rowcount:
                        print(f"  {t:<20} {cur.rowcount:,}행")
                except pymysql.err.ProgrammingError:
                    pass  # user_id 컬럼이 없는 테이블은 건너뛴다
            conn.commit()

            print(f"\n완료 — 남은 더미 {dummy_count(cur):,}명")
    finally:
        conn.close()


# ─────────────────────────────────────────────
# 현황
# ─────────────────────────────────────────────
def count() -> None:
    conn = connect()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  (SELECT COUNT(*) FROM users       WHERE user_id LIKE %s)     AS dummy,
                  (SELECT COUNT(*) FROM users       WHERE user_id NOT LIKE %s) AS real_user,
                  (SELECT COUNT(*) FROM memberships WHERE user_id LIKE %s)     AS memb,
                  @@hostname AS host, @@port AS port
                """,
                (LIKE, LIKE, LIKE),
            )
            r = cur.fetchone()
        print(f"더미 유저     {r['dummy']:,}명")
        print(f"실제 유저     {r['real_user']:,}명")
        print(f"더미 멤버십   {r['memb']:,}건")
        print(f"\n접속한 서버   {r['host']}:{r['port']}")
    finally:
        conn.close()


def main() -> None:
    p = argparse.ArgumentParser(description="더미 유저 생성/삭제 도구")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("create", help="더미 유저 생성")
    c.add_argument("count", type=int, nargs="?", default=3500)

    d = sub.add_parser("delete", help="더미 유저 전원 삭제")
    d.add_argument("-y", "--yes", action="store_true", help="확인 없이 삭제")

    sub.add_parser("count", help="현재 더미 수 확인")

    a = p.parse_args()
    if a.cmd == "create":
        create(a.count)
    elif a.cmd == "delete":
        delete(a.yes)
    else:
        count()


if __name__ == "__main__":
    main()
