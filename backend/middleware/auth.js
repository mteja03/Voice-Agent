const { verifyAccessToken } = require('../utils/authUtils');
const { sendError } = require('../utils/response');
const { logger } = require('../utils/logger');

function authMiddleware(req, res, next) {
  const log = logger.forReq(req);
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    log.warn('auth_token_missing', {});
    return sendError(res, 401, 'Authentication required');
  }
  const result = verifyAccessToken(process.env.JWT_SECRET, token);
  if (!result.ok) {
    log.warn('auth_token_rejected', { code: result.code });
    const status = result.code === 'missing_secret' ? 500 : 401;
    return sendError(res, status, result.message);
  }
  req.user = {
    userId: result.payload.userId,
    companyId: result.payload.companyId,
    role: result.payload.role,
  };
  return next();
}

module.exports = { authMiddleware };
