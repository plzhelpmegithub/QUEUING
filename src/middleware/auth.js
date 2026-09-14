const { verifyAccessToken, isEnabled } = require('../services/authTokenService');
const { verifyCancelLinkToken } = require('../services/cancelLinkTokenService');

function sendAuthNotConfigured(reply) {
  reply.status(503).send({
    success: false,
    code: 'auth_not_configured',
    message: '서버 인증 설정이 완료되지 않았습니다.',
  });
}

function authenticate(request, reply, done) {
  if (!isEnabled()) {
    sendAuthNotConfigured(reply);
    return;
  }

  const header = request.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const result = verifyAccessToken(token);

  if (!result.valid) {
    reply.status(401).send({
      success: false,
      code: result.reason === 'not_configured' ? 'auth_not_configured' : 'auth_required',
      message: result.reason === 'not_configured'
        ? '서버 인증 설정이 완료되지 않았습니다.'
        : result.reason === 'expired'
        ? '세션이 만료되었습니다. 다시 로그인해주세요.'
        : '로그인이 필요합니다.',
    });
    return;
  }

  request.authUser = { userId: result.userId, role: result.role };

  if (result.scope === 'cancel_queue') {
    request.authUser.scope = 'cancel_queue';
    request.authUser.eventId = result.eventId;
    request.authUser.allocationId = result.allocationId;
    const urlPath = request.url.split('?')[0];
    const allowed = urlPath.startsWith('/cancel-queue')
      || urlPath.startsWith('/verify-link')
      || urlPath.startsWith('/seats');
    if (!allowed) {
      reply.status(403).send({
        success: false,
        code: 'scope_restricted',
        message: '취소표 링크 세션으로는 해당 기능에 접근할 수 없습니다.',
      });
      return;
    }
  }

  done();
}

function requireRole(...roles) {
  return function roleGuard(request, reply, done) {
    if (!isEnabled()) {
      sendAuthNotConfigured(reply);
      return;
    }

    const user = request.authUser;
    if (!user || !roles.includes(user.role)) {
      reply.status(403).send({
        success: false,
        code: 'forbidden',
        message: '접근 권한이 없습니다.',
      });
      return;
    }
    done();
  };
}

function requireSelf(request, reply, done) {
  const requestedUserId = getRequestedUserId(request);

  // The route handler remains responsible for returning its normal 400 when
  // userId is missing. This guard only rejects a supplied ID that is not the
  // authenticated user's ID.
  if (!requestedUserId) {
    done();
    return;
  }

  if (!request.authUser || String(request.authUser.userId) !== String(requestedUserId)) {
    reply.status(403).send({
      success: false,
      code: 'user_mismatch',
      message: '본인 계정의 요청만 처리할 수 있습니다.',
    });
    return;
  }
  done();
}

function getRequestValue(request, key) {
  const body = request.body && typeof request.body === 'object' ? request.body : {};
  const params = request.params && typeof request.params === 'object' ? request.params : {};
  const query = request.query && typeof request.query === 'object' ? request.query : {};
  return body[key] || query[key] || params[key];
}

function getRequestedUserId(request) {
  return getRequestValue(request, 'userId');
}

function getPresentedCancelLinkToken(request) {
  return getRequestValue(request, 'linkToken');
}

function allowUserOrCancelLink(request, reply, done) {
  const header = request.headers.authorization || '';
  if (header) {
    authenticate(request, reply, done);
    return;
  }

  const result = verifyCancelLinkToken(getPresentedCancelLinkToken(request));
  if (!result.valid) {
    reply.status(result.reason === 'not_configured' ? 503 : 401).send({
      success: false,
      code: result.reason === 'not_configured' ? 'auth_not_configured' : 'cancel_link_invalid',
      message: result.reason === 'expired'
        ? '취소표 링크가 만료되었습니다.'
        : '유효한 로그인 또는 취소표 링크가 필요합니다.',
    });
    return;
  }

  request.cancelLink = result;
  done();
}

function requireSelfOrLink(request, reply, done) {
  const requestedUserId = getRequestedUserId(request);
  if (!requestedUserId) {
    done();
    return;
  }

  if (request.cancelLink) {
    const requestedEventId = getRequestValue(request, 'eventId');
    const requestedSeatId = getRequestValue(request, 'seatId');
    const requestedAllocationId = getRequestValue(request, 'allocationId');
    const linkMatches = String(request.cancelLink.userId) === String(requestedUserId)
      && (!requestedEventId || !request.cancelLink.eventId || String(request.cancelLink.eventId) === String(requestedEventId))
      && (!requestedSeatId || String(request.cancelLink.seatId) === String(requestedSeatId))
      && (!requestedAllocationId || String(request.cancelLink.allocationId) === String(requestedAllocationId));

    if (linkMatches) {
      done();
      return;
    }
  } else if (request.authUser && String(request.authUser.userId) === String(requestedUserId)) {
    done();
    return;
  }

  reply.status(403).send({
    success: false,
    code: 'user_mismatch',
    message: '본인 계정 또는 본인에게 발급된 취소표 링크만 사용할 수 있습니다.',
  });
}

function optionalAuth(request, reply, done) {
  if (!isEnabled()) {
    done();
    return;
  }

  const header = request.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token) {
    const result = verifyAccessToken(token);
    if (result.valid) {
      request.authUser = { userId: result.userId, role: result.role };
    }
  }
  done();
}

module.exports = {
  authenticate,
  requireRole,
  requireSelf,
  allowUserOrCancelLink,
  requireSelfOrLink,
  optionalAuth,
};
