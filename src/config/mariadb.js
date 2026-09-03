const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'queuing_db',
  connectionLimit: 10,
  // VM3가 MySQL 8 기본 인증(caching_sha2_password)을 쓰는 경우, 비-SSL 연결에서는
  // 서버의 RSA 공개키를 클라이언트가 직접 요청해서 받아와야 함 — 이게 없으면
  // "RSA public key is not available client side" 에러로 커넥션 풀이 채워지지 않음
  allowPublicKeyRetrieval: true,
});

pool.getConnection()
  .then((conn) => {
    console.log(`[MariaDB] Connected — ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME || 'queuing_db'}`);
    conn.release();
  })
  .catch((err) => console.error('[MariaDB] Connection error:', err.message));

module.exports = pool;
