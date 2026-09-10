const jwt = require('jsonwebtoken');

const MIN_SECRET_LENGTH = 32;

function getSecret() {
  return String(process.env.JWT_SECRET || '').trim();
}

function issueCancelLinkToken(allocation, expiresAt) {
  const secret = getSecret();
  if (secret.length < MIN_SECRET_LENGTH || !allocation) return null;

  const remainingSeconds = Math.max(
    1,
    Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000),
  );

  return jwt.sign({
    type: 'cancel_link',
    allocationId: String(allocation.id),
    userId: allocation.userId,
    eventId: allocation.eventId || '',
    seatId: allocation.seatId,
  }, secret, { expiresIn: remainingSeconds });
}

function verifyCancelLinkToken(token) {
  const secret = getSecret();
  if (secret.length < MIN_SECRET_LENGTH) return { valid: false, reason: 'not_configured' };
  if (!token) return { valid: false, reason: 'missing' };

  try {
    const decoded = jwt.verify(token, secret);
    if (decoded.type !== 'cancel_link') return { valid: false, reason: 'wrong_type' };
    return {
      valid: true,
      allocationId: String(decoded.allocationId || ''),
      userId: decoded.userId,
      eventId: decoded.eventId || '',
      seatId: decoded.seatId || '',
    };
  } catch (err) {
    if (err.name === 'TokenExpiredError') return { valid: false, reason: 'expired' };
    return { valid: false, reason: 'invalid' };
  }
}

module.exports = { issueCancelLinkToken, verifyCancelLinkToken };
