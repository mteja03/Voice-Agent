function getTenantContext(req) {
  if (!req.user?.companyId) return null;
  return {
    userId: req.user.userId,
    companyId: req.user.companyId,
    role: req.user.role,
  };
}

const { sendError } = require('../utils/response');

function requireCompanyId(req, res, next) {
  const ctx = getTenantContext(req);
  if (!ctx?.companyId) {
    return sendError(res, 401, 'Unauthorized: tenant context missing from token');
  }
  req.companyId = ctx.companyId;
  return next();
}

module.exports = {
  getTenantContext,
  requireCompanyId,
};
