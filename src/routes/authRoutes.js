const { register, login, listUsers } = require('../services/authService');

async function authRoutes(fastify) {

  // ===== 회원가입 =====
  fastify.post('/auth/register', async (request, reply) => {
    const { userId, password, email, role, name, phone, birthDate } = request.body || {};
    if (!userId || !password) {
      return reply.status(400).send({ error: 'userId와 password는 필수입니다.' });
    }
    if (userId.length < 3) {
      return reply.status(400).send({ error: '아이디는 3자 이상이어야 합니다.' });
    }
    if (password.length < 4) {
      return reply.status(400).send({ error: '비밀번호는 4자 이상이어야 합니다.' });
    }
    // 일반 사용자는 admin 역할로 등록 불가
    const userRole = role === 'admin' ? 'user' : (role || 'user');
    const result = await register(userId, password, email, userRole, { name, phone, birthDate });
    const statusCode = result.success ? 201 : 409;
    return reply.status(statusCode).send(result);
  });

  // ===== 로그인 =====
  fastify.post('/auth/login', async (request, reply) => {
    const { userId, password } = request.body || {};
    if (!userId || !password) {
      return reply.status(400).send({ error: 'userId와 password는 필수입니다.' });
    }
    const result = await login(userId, password);
    const statusCode = result.success ? 200 : 401;
    return reply.status(statusCode).send(result);
  });

  // ===== 사용자 목록 (관리자용) =====
  fastify.get('/auth/users', async (request, reply) => {
    const result = await listUsers();
    return reply.send(result);
  });
}

module.exports = authRoutes;
