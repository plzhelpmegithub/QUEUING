const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'queuing_db',
  connectionLimit: 10,
  allowPublicKeyRetrieval: true,
  timezone: 'Etc/UTC',
});

pool.getConnection()
  .then((conn) => {
    console.log(`[MariaDB] Connected — ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME || 'queuing_db'}`);
    conn.release();
  })
  .catch((err) => console.error('[MariaDB] Connection error:', err.message));

module.exports = pool;
