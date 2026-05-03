const jwt = require('jsonwebtoken');

/**
 * Verify a JWT access token. Never throws — returns a structured result for HTTP/Socket handlers.
 * @param {string} secret
 * @param {string} token
 * @returns {{ ok: true, payload: object } | { ok: false, code: string, message: string }}
 */
function verifyAccessToken(secret, token) {
  if (!secret || !String(secret).trim()) {
    return { ok: false, code: 'missing_secret', message: 'Server configuration error' };
  }
  if (!token || !String(token).trim()) {
    return { ok: false, code: 'missing_token', message: 'Authentication required' };
  }
  try {
    const payload = jwt.verify(String(token).trim(), secret);
    const userId = payload.userId;
    const companyId = payload.activeCompanyId || payload.companyId;
    const role = payload.role;
    const isMasterAdmin = Boolean(payload.isMasterAdmin || role === 'master_admin');
    if (!userId || !companyId) {
      return { ok: false, code: 'malformed_payload', message: 'Invalid token' };
    }
    return {
      ok: true,
      payload: {
        userId,
        companyId,
        role: role || 'agent',
        isMasterAdmin,
        activeCompanyId: companyId,
      },
    };
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return { ok: false, code: 'token_expired', message: 'Token expired' };
    }
    if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
      return { ok: false, code: 'token_invalid', message: 'Invalid token' };
    }
    return { ok: false, code: 'token_error', message: 'Invalid token' };
  }
}

module.exports = { verifyAccessToken };
