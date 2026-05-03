const { getSupabase } = require('../services/supabaseClient');
const { sendError } = require('../utils/response');
const { logger } = require('../utils/logger');

/**
 * Resolve JWT claims against the database (user exists, company exists, no token/DB drift).
 * Used by REST (after JWT verify) and Socket.IO.
 */
async function loadVerifiedUserContext(payload) {
  const supabase = getSupabase();
  const { data: user, error } = await supabase
    .from('users')
    .select('id, company_id, role, platform_role')
    .eq('id', payload.userId)
    .maybeSingle();
  if (error || !user) {
    return { ok: false, code: 'user_missing' };
  }

  const isMasterAdmin = user.platform_role === 'master_admin' || Boolean(payload.isMasterAdmin);
  const requestedCompanyId = payload.activeCompanyId || payload.companyId;
  const resolvedCompanyId = isMasterAdmin ? requestedCompanyId : user.company_id;
  if (!resolvedCompanyId) {
    return { ok: false, code: 'tenant_missing' };
  }

  if (!isMasterAdmin && user.company_id !== payload.companyId) {
    return { ok: false, code: 'token_mismatch' };
  }

  const { data: company, error: companyErr } = await supabase
    .from('companies')
    .select('id')
    .eq('id', resolvedCompanyId)
    .maybeSingle();
  if (companyErr || !company) {
    return { ok: false, code: 'company_missing' };
  }
  return {
    ok: true,
    user: {
      userId: user.id,
      companyId: resolvedCompanyId,
      role: isMasterAdmin ? 'master_admin' : (user.role === 'admin' ? 'tenant_admin' : 'agent'),
      dbRole: user.role,
      isMasterAdmin,
      platformRole: user.platform_role || null,
      activeCompanyId: resolvedCompanyId,
    },
  };
}

async function verifyUserContext(req, res, next) {
  try {
    const result = await loadVerifiedUserContext(req.user);
    if (!result.ok) {
      const log = logger.forReq(req);
      log.warn('auth_context_failed', { code: result.code });
      if (result.code === 'company_missing') {
        return sendError(res, 403, 'Organization is no longer available');
      }
      return sendError(res, 401, 'Session is no longer valid');
    }
    req.user = result.user;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  loadVerifiedUserContext,
  verifyUserContext,
};
