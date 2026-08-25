const bcrypt = require('bcryptjs');
const pool = require('../config/mariadb');

const TABLE_NAME = 'users';

/**
 * users 테이블 초기화
 * - 서버 시작 시 호출 (테이블 자체는 dbService.initTable에서 생성)
 * - 기본 관리자 계정(admin@queuing.kr/admin1234) 자동 생성
 */
async function initUsersTable() {
  try {
    const existing = await pool.query(`SELECT user_id FROM ${TABLE_NAME} WHERE user_id = ?`, ['admin@queuing.kr']);
    if (existing.length === 0) {
      const hashedPw = await bcrypt.hash('admin1234', 10);
      await pool.query(
        `INSERT INTO ${TABLE_NAME} (user_id, password, role, email) VALUES (?, ?, ?, ?)`,
        ['admin@queuing.kr', hashedPw, 'admin', 'admin@queuing.kr'],
      );
      console.log('[Auth] 기본 관리자 계정 생성 (admin@queuing.kr / admin1234)');
    }
  } catch (err) {
    console.error('[Auth] 관리자 계정 생성 실패:', err.message);
  }
}

/**
 * 회원가입
 * @param {string} userId - 사용자 ID
 * @param {string} password - 비밀번호 (평문 → bcrypt 암호화 후 저장)
 * @param {string} email - 이메일
 * @param {string} role - 역할 (user/admin, 기본: user)
 * @param {{name?: string, phone?: string, birthDate?: string}} profile - 부가 정보 (이름/휴대폰/생년월일)
 */
async function register(userId, password, email, role = 'user', profile = {}) {
  // 1) 중복 확인
  try {
    const existing = await pool.query(`SELECT user_id FROM ${TABLE_NAME} WHERE user_id = ?`, [userId]);
    if (existing.length > 0) {
      return { success: false, message: '이미 존재하는 아이디입니다.' };
    }
  } catch (err) {
    console.error('[Auth] 중복 확인 실패:', err.message);
  }

  // 2) 비밀번호 암호화
  const hashedPw = await bcrypt.hash(password, 10);

  // 3) DB 저장
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

/**
 * 로그인
 * @param {string} userId - 사용자 ID
 * @param {string} password - 비밀번호 (평문)
 */
async function login(userId, password) {
  try {
    const rows = await pool.query(`SELECT user_id, password, role, email, name FROM ${TABLE_NAME} WHERE user_id = ?`, [userId]);
    const user = rows[0];

    if (!user) {
      return { success: false, message: '존재하지 않는 아이디입니다.' };
    }

    // 비밀번호 검증
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return { success: false, message: '비밀번호가 올바르지 않습니다.' };
    }

    console.log(`[Auth] 로그인 성공: ${userId} (${user.role})`);
    return {
      success: true,
      userId: user.user_id,
      role: user.role,
      email: user.email,
      name: user.name || '',
      message: '로그인 성공',
    };
  } catch (err) {
    console.error('[Auth] 로그인 실패:', err.message);
    return { success: false, message: '로그인 처리 중 오류가 발생했습니다.' };
  }
}

/**
 * 전체 사용자 목록 (관리자용)
 */
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

module.exports = { initUsersTable, register, login, listUsers };
