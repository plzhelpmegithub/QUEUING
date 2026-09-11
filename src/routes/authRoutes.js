const { register, login, listUsers, updateProfile, deleteAccount } = require('../services/authService');
const { guardRecaptcha } = require('../services/recaptchaService');
const {
  issueTokenPair,
  isEnabled: isAuthEnabled,
  verifyRefreshToken,
} = require('../services/authTokenService');
const { authenticate, requireRole, requireSelf } = require('../middleware/auth');

async function authRoutes(fastify) {

  fastify.post('/auth/register', async (request, reply) => {
    if (!await guardRecaptcha(request, reply, 'register')) return;
    const { userId, password, email, name, phone, birthDate } = request.body || {};
    if (!userId || !password) {
      return reply.status(400).send({ error: 'userId와 password는 필수입니다.' });
    }
    if (userId.length < 3) {
      return reply.status(400).send({ error: '아이디는 3자 이상이어야 합니다.' });
    }
    if (password.length < 4) {
      return reply.status(400).send({ error: '비밀번호는 4자 이상이어야 합니다.' });
    }
    // 공개 회원가입으로 관리자·삭제된 모니터링 역할을 지정할 수 없게 한다.
    const userRole = 'user';
    const result = await register(userId, password, email, userRole, { name, phone, birthDate });
    const statusCode = result.success ? 201 : 409;
    return reply.status(statusCode).send(result);
  });

  fastify.post('/auth/login', async (request, reply) => {
    if (!await guardRecaptcha(request, reply, 'login')) return;
    const { userId, password } = request.body || {};
    if (!userId || !password) {
      return reply.status(400).send({ error: 'userId와 password는 필수입니다.' });
    }
    const result = await login(userId, password);
    if (!result.success) {
      return reply.status(401).send(result);
    }
    if (!isAuthEnabled()) {
      return reply.status(503).send({
        success: false,
        code: 'auth_not_configured',
        message: '서버 인증 설정이 완료되지 않았습니다.',
      });
    }
    const tokens = issueTokenPair(result.userId, result.role);
    return reply.status(200).send({
      ...result,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  });

  fastify.post('/auth/refresh', async (request, reply) => {
    if (!isAuthEnabled()) {
      return reply.status(503).send({
        success: false,
        code: 'auth_not_configured',
        message: '서버 인증 설정이 완료되지 않았습니다.',
      });
    }

    const { refreshToken } = request.body || {};
    const result = verifyRefreshToken(refreshToken);
    if (!result.valid) {
      return reply.status(401).send({
        success: false,
        code: 'refresh_token_invalid',
        message: result.reason === 'expired'
          ? '갱신 토큰이 만료되었습니다. 다시 로그인해주세요.'
          : '갱신 토큰이 유효하지 않습니다. 다시 로그인해주세요.',
      });
    }

    const tokens = issueTokenPair(result.userId, result.role);
    return reply.send({
      success: true,
      userId: result.userId,
      role: result.role,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  });

  fastify.patch('/auth/profile', { preHandler: [authenticate, requireSelf] }, async (request, reply) => {
    const { userId, name, phone, password, marketingOptIn } = request.body || {};
    if (!userId) {
      return reply.status(400).send({ error: 'userId는 필수입니다.' });
    }
    if (name !== undefined && (!String(name).trim() || String(name).trim().length > 50)) {
      return reply.status(400).send({ error: '이름은 1~50자로 입력해주세요.' });
    }
    if (phone !== undefined && phone && !/^01[016789]-\d{3,4}-\d{4}$/.test(String(phone).trim())) {
      return reply.status(400).send({ error: '휴대폰 번호 형식을 확인해주세요.' });
    }
    if (password !== undefined && password !== '' && String(password).length < 4) {
      return reply.status(400).send({ error: '새 비밀번호는 4자 이상이어야 합니다.' });
    }
    if (marketingOptIn !== undefined && typeof marketingOptIn !== 'boolean') {
      return reply.status(400).send({ error: '마케팅 수신 동의 값이 올바르지 않습니다.' });
    }

    const result = await updateProfile(userId, {
      name: name === undefined ? undefined : String(name).trim(),
      phone: phone === undefined ? undefined : String(phone).trim(),
      password,
      marketingOptIn,
    });
    return reply.status(result.success ? 200 : 404).send(result);
  });

  fastify.delete('/auth/account', { preHandler: [authenticate, requireSelf] }, async (request, reply) => {
    const { userId, password } = request.body || {};
    if (!userId || !password) {
      return reply.status(400).send({ error: 'userId와 password는 필수입니다.' });
    }
    const result = await deleteAccount(userId, password);
    return reply.status(result.success ? 200 : 400).send(result);
  });

  fastify.get('/auth/users', { preHandler: [authenticate, requireRole('admin')] }, async (request, reply) => {
    const result = await listUsers();
    return reply.send(result);
  });
}

module.exports = authRoutes;
