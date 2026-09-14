"""
공통 DB 커넥션 모듈.

- 커넥션 생성 시 SET time_zone = '+00:00' 을 강제해서
  A파트(mariadb 드라이버, timezone: '+00:00')와 UTC 기준을 통일한다.
  (2026-09-14 확인: DB 기본 세션 tz는 KST라 NOW()/UTC_TIMESTAMP()가 9시간 어긋남 —
   이 커넥션을 거치면 그 문제를 Lambda 쪽에서라도 회피한다.)
- utf8mb4_general_ci collation으로 통일된 테이블(cancel_allocations, cancellation_link,
  waiting_queue, reservations, seats, events, users)을 전제로 한다.
  cancel_allocations.event_id / cancellation_link.seat_id는 2026-09-14에
  varchar 길이·collation을 맞춰뒀으니, 이후 또 다른 컬럼에서 collation 에러가
  나면 information_schema.columns로 먼저 확인할 것.
"""

import os
import pymysql
import pymysql.cursors


def get_connection():
    conn = pymysql.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        database=os.environ["DB_NAME"],
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
        connect_timeout=5,
    )
    with conn.cursor() as cur:
        cur.execute("SET time_zone = '+00:00'")
    return conn


class db_transaction:
    """
    with db_transaction() as cur:
        cur.execute(...)
    정상 종료 시 commit, 예외 발생 시 rollback.
    """

    def __enter__(self):
        self.conn = get_connection()
        self.cur = self.conn.cursor()
        return self.cur

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            if exc_type is None:
                self.conn.commit()
            else:
                self.conn.rollback()
        finally:
            self.cur.close()
            self.conn.close()
        return False
