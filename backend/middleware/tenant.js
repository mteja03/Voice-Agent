function getTenantContext(req) {
  const companyId = req.user?.activeCompanyId || req.user?.companyId;
  if (!companyId) return null;
  return {
    userId: req.user.userId,
    companyId,
    role: req.user.role,
    isMasterAdmin: Boolean(req.user.isMasterAdmin),
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
