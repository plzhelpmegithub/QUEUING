const { hash: argon2Hash, verify: argon2Verify, Algorithm } = require('@node-rs/argon2');
const bcrypt = require('bcryptjs');
const pool = require('../config/mariadb');

const TABLE_NAME = 'users';

const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

function asBoolean(value) {
  return value === true || value === 1 || value === '1';
}

function isBcryptHash(hash) {
  return typeof hash === 'string' && hash.startsWith('$2');
}

async function verifyPassword(password, storedHash) {
  if (isBcryptHash(storedHash)) {
    return bcrypt.compare(password, storedHash);
  }
  return argon2Verify(storedHash, password);
}

async function initUsersTable() {
  try {
    const existing = await pool.query(`SELECT user_id FROM ${TABLE_NAME} WHERE user_id = ?`, ['admin@queuing.kr']);
    if (existing.length === 0) {
      const hashedPw = await argon2Hash('admin1234', ARGON2_OPTIONS);
      await pool.query(
        `INSERT INTO ${TABLE_NAME} (user_id, password, role, email) VALUES (?, ?, ?, ?)`,
        ['admin@queuing.kr', hashedPw, 'admin', 'admin@queuing.kr'],
      );
      console.log('[Auth] 기본 관리자 계정 생성 (admin@queuing.kr / admin1234)');
    }
    const monitorExisting = await pool.query(`SELECT user_id FROM ${TABLE_NAME} WHERE user_id = ?`, ['monitor@queuing.kr']);
    if (monitorExisting.length === 0) {
      const hashedPw = await argon2Hash('monitor1234', ARGON2_OPTIONS);
      await pool.query(
        `INSERT INTO ${TABLE_NAME} (user_id, password, role, email) VALUES (?, ?, ?, ?)`,
        ['monitor@queuing.kr', hashedPw, 'monitor', 'monitor@queuing.kr'],
      );
      console.log('[Auth] 기본 모니터링 계정 생성 (monitor@queuing.kr / monitor1234)');
    }
  } catch (err) {
    console.error('[Auth] 관리자 계정 생성 실패:', err.message);
  }
}

async function register(userId, password, email, role = 'user', profile = {}) {
  try {
    const existing = await pool.query(`SELECT user_id FROM ${TABLE_NAME} WHERE user_id = ?`, [userId]);
    if (existing.length > 0) {
      return { success: false, message: '이미 존재하는 아이디입니다.' };
    }
  } catch (err) {
    console.error('[Auth] 중복 확인 실패:', err.message);
  }

  const hashedPw = await argon2Hash(password, ARGON2_OPTIONS);

  try {
    await pool.query(
      `INSERT INTO ${TABLE_NAME} (user_id, password, role, email, name, phone, birth_date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, hashedPw, role, email || '', profile.name || '', profile.phone || '', profile.birthDate || null],
    );
    console.log(`[Auth] 회원가입 완료: ${userId} (${role})`);
    return { success: true, userId, role, message: '회원가입이 완료되었습니다.' };
  } catch (err) {
    console.error('[Auth] 회원가입 실패:', err.message);
    return { success: false, message: '회원가입 처리 중 오류가 발생했습니다.' };
  }
}

async function login(userId, password) {
  try {
    const rows = await pool.query(
      `SELECT user_id, password, role, email, name, phone, birth_date, marketing_opt_in, created_at
       FROM ${TABLE_NAME} WHERE user_id = ?`,
      [userId],
    );
    const user = rows[0];

    if (!user) {
      return { success: false, message: '존재하지 않는 아이디입니다.' };
    }

    const isMatch = await verifyPassword(password, user.password);
    if (!isMatch) {
      return { success: false, message: '비밀번호가 올바르지 않습니다.' };
    }

    if (isBcryptHash(user.password)) {
      const upgraded = await argon2Hash(password, ARGON2_OPTIONS);
      await pool.query(`UPDATE ${TABLE_NAME} SET password = ? WHERE user_id = ?`, [upgraded, userId]);
      console.log(`[Auth] bcrypt → argon2id 해시 마이그레이션: ${userId}`);
    }

    console.log(`[Auth] 로그인 성공: ${userId} (${user.role})`);
    return {
      success: true,
      userId: user.user_id,
      role: user.role,
      email: user.email,
      name: user.name || '',
      phone: user.phone || '',
      birthDate: user.birth_date instanceof Date ? user.birth_date.toISOString().slice(0, 10) : user.birth_date || '',
      marketingOptIn: asBoolean(user.marketing_opt_in),
      joinedAt: user.created_at instanceof Date ? user.created_at.toISOString() : user.created_at || '',
      message: '로그인 성공',
    };
  } catch (err) {
    console.error('[Auth] 로그인 실패:', err.message);
    return { success: false, message: '로그인 처리 중 오류가 발생했습니다.' };
  }
}

function profileFromRow(row) {
  return {
    userId: row.user_id,
    role: row.role,
    email: row.email || '',
    name: row.name || '',
    phone: row.phone || '',
    birthDate: row.birth_date instanceof Date ? row.birth_date.toISOString().slice(0, 10) : row.birth_date || '',
    marketingOptIn: asBoolean(row.marketing_opt_in),
    joinedAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at || '',
  };
}

async function updateProfile(userId, patch = {}) {
  try {
    const existing = await pool.query(`SELECT user_id FROM ${TABLE_NAME} WHERE user_id = ?`, [userId]);
    if (existing.length === 0) {
      return { success: false, message: '사용자 정보를 찾을 수 없습니다.' };
    }

    const assignments = [];
    const values = [];
    if (patch.name !== undefined) {
      assignments.push('name = ?');
      values.push(patch.name);
    }
    if (patch.phone !== undefined) {
      assignments.push('phone = ?');
      values.push(patch.phone);
    }
    if (patch.marketingOptIn !== undefined) {
      assignments.push('marketing_opt_in = ?');
      values.push(patch.marketingOptIn ? 1 : 0);
    }
    if (patch.password) {
      assignments.push('password = ?');
      values.push(await argon2Hash(patch.password, ARGON2_OPTIONS));
    }

    if (assignments.length > 0) {
      values.push(userId);
      await pool.query(`UPDATE ${TABLE_NAME} SET ${assignments.join(', ')} WHERE user_id = ?`, values);
    }

    const rows = await pool.query(
      `SELECT user_id, role, email, name, phone, birth_date, marketing_opt_in, created_at
       FROM ${TABLE_NAME} WHERE user_id = ?`,
      [userId],
    );
    return { success: true, user: profileFromRow(rows[0]), message: '회원정보가 수정되었습니다.' };
  } catch (err) {
    console.error('[Auth] 회원정보 수정 실패:', err.message);
    return { success: false, message: '회원정보 수정 중 오류가 발생했습니다.' };
  }
}

async function listUsers() {
  try {
    const rows = await pool.query(`SELECT user_id, role, email, name, phone, birth_date, created_at FROM ${TABLE_NAME}`);
    const users = rows.map((r) => ({
      userId: r.user_id,
      role: r.role,
      email: r.email,
      name: r.name || '',
      phone: r.phone || '',
      birthDate: r.birth_date instanceof Date ? r.birth_date.toISOString().slice(0, 10) : r.birth_date,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    }));
    return { users, count: users.length };
  } catch (err) {
    console.error('[Auth] 사용자 목록 조회 실패:', err.message);
    return { users: [], count: 0 };
  }
}

module.exports = { initUsersTable, register, login, listUsers, updateProfile };
