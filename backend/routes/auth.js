const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const validator = require('validator');
const { getSupabase } = require('../services/supabaseClient');
const { verifyAccessToken } = require('../utils/authUtils');
const { logger } = require('../utils/logger');
const { sendError, sendSuccess } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
const BCRYPT_ROUNDS = 10;
const JWT_EXPIRES = '7d';

function resolveAccessRole(user = {}) {
  if (user.platform_role === 'master_admin') return 'master_admin';
  return user.role === 'admin' ? 'tenant_admin' : 'agent';
}

function toAuthUser(user = {}, activeCompanyId) {
  const isMasterAdmin = user.platform_role === 'master_admin';
  return {
    id: user.id,
    email: user.email,
    companyId: activeCompanyId || user.company_id,
    role: resolveAccessRole(user),
    dbRole: user.role,
    platformRole: user.platform_role || null,
    isMasterAdmin,
    activeCompanyId: activeCompanyId || user.company_id,
    createdAt: user.created_at,
  };
}

function signToken(payload) {
  if (!process.env.JWT_SECRET) {
    const err = new Error('Server configuration error');
    err.status = 500;
    err.publicMessage = 'Server configuration error';
    throw err;
  }
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

async function assertCompanyExists(supabase, companyId) {
  const { data, error } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const log = logger.forReq(req);
    const body = req.body;
    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      return sendError(res, 400, 'Request body is required');
    }

    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const role = body.role === 'agent' ? 'agent' : 'admin';
    const companyName = String(body.companyName || 'Voice Agent Company').trim();

    if (!validator.isEmail(email)) {
      return sendError(res, 400, 'Invalid email format');
    }
    if (password.length < 6) {
      return sendError(res, 400, 'Password must be at least 6 characters');
    }
    if (!companyName) {
      return sendError(res, 400, 'Company name is required');
    }

    log.info('auth_register_attempt', { email });

    const supabase = getSupabase();
    const { data: existing, error: existingError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      log.warn('auth_register_duplicate', { email });
      return sendError(res, 400, 'Email already registered');
    }

    const companyId = randomUUID();
    const { error: companyError } = await supabase
      .from('companies')
      .insert({ id: companyId, name: companyName });
    if (companyError) throw companyError;

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: passwordHash,
        company_id: companyId,
        role,
        platform_role: null,
      })
      .select('id,email,company_id,role,platform_role,created_at')
      .single();
    if (userError) throw userError;

    const authUser = toAuthUser(user, user.company_id);
    const token = signToken({
      userId: authUser.id,
      companyId: authUser.companyId,
      role: authUser.role,
      activeCompanyId: authUser.activeCompanyId,
      isMasterAdmin: authUser.isMasterAdmin,
    });

    log.info('auth_register_success', { email, userId: user.id, companyId: user.company_id });

    return sendSuccess(
      res,
      {
        token,
        user: authUser,
      },
      {},
      201
    );
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const log = logger.forReq(req);
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return sendError(res, 400, 'Request body is required');
    }

    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!validator.isEmail(email)) {
      return sendError(res, 400, 'Invalid email format');
    }
    if (!password) {
      return sendError(res, 400, 'Password is required');
    }

    log.info('auth_login_attempt', { email });

    const supabase = getSupabase();
    const { data: user, error } = await supabase
      .from('users')
      .select('id,email,password_hash,company_id,role,platform_role,created_at')
      .eq('email', email)
      .maybeSingle();
    if (error) throw error;

    if (!user) {
      log.warn('auth_login_failed', { email, reason: 'unknown_user' });
      return sendError(res, 401, 'Invalid credentials');
    }

    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('id')
      .eq('id', user.company_id)
      .maybeSingle();
    if (companyErr) throw companyErr;
    if (!company) {
      log.warn('auth_login_failed', { email, userId: user.id, reason: 'missing_company' });
      return sendError(res, 403, 'Organization is no longer available');
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      log.warn('auth_login_failed', { email, reason: 'bad_password' });
      return sendError(res, 401, 'Invalid credentials');
    }

    const requestedActiveCompanyId = String(body.activeCompanyId || '').trim();
    let activeCompanyId = user.company_id;
    const isMasterAdmin = user.platform_role === 'master_admin';
    if (isMasterAdmin && requestedActiveCompanyId) {
      const exists = await assertCompanyExists(supabase, requestedActiveCompanyId);
      if (!exists) {
        return sendError(res, 404, 'Selected organization not found');
      }
      activeCompanyId = requestedActiveCompanyId;
    }

    const authUser = toAuthUser(user, activeCompanyId);
    const token = signToken({
      userId: authUser.id,
      companyId: authUser.companyId,
      role: authUser.role,
      activeCompanyId: authUser.activeCompanyId,
      isMasterAdmin: authUser.isMasterAdmin,
    });

    log.info('auth_login_success', { email, userId: user.id, companyId: authUser.companyId });

    return sendSuccess(res, {
      token,
      user: authUser,
    });
  })
);

router.post(
  '/switch-tenant',
  asyncHandler(async (req, res) => {
    const log = logger.forReq(req);
    const token = String(req.headers.authorization || '').startsWith('Bearer ')
      ? String(req.headers.authorization || '').slice(7).trim()
      : '';
    const verified = verifyAccessToken(process.env.JWT_SECRET, token);
    if (!verified.ok) return sendError(res, 401, 'Authentication required');

    const activeCompanyId = String(req.body?.activeCompanyId || '').trim();
    if (!activeCompanyId) return sendError(res, 400, 'activeCompanyId is required');

    const supabase = getSupabase();
    const { data: user, error } = await supabase
      .from('users')
      .select('id,email,company_id,role,platform_role,created_at')
      .eq('id', verified.payload.userId)
      .maybeSingle();
    if (error) throw error;
    if (!user) return sendError(res, 401, 'Session is no longer valid');
    if (user.platform_role !== 'master_admin') return sendError(res, 403, 'Only master admin can switch organization');

    const exists = await assertCompanyExists(supabase, activeCompanyId);
    if (!exists) return sendError(res, 404, 'Selected organization not found');

    const authUser = toAuthUser(user, activeCompanyId);
    const nextToken = signToken({
      userId: authUser.id,
      companyId: authUser.companyId,
      role: authUser.role,
      activeCompanyId: authUser.activeCompanyId,
      isMasterAdmin: authUser.isMasterAdmin,
    });
    log.info('auth_switch_tenant_success', {
      userId: authUser.id,
      email: authUser.email,
      activeCompanyId: authUser.activeCompanyId,
    });
    return sendSuccess(res, { token: nextToken, user: authUser });
  })
);

module.exports = router;
