const express = require('express');
const bcrypt = require('bcrypt');
const validator = require('validator');
const { getSupabase } = require('../services/supabaseClient');
const { sendError, sendSuccess } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
const BCRYPT_ROUNDS = 10;

function requireOrgAdmin(req, res, next) {
  if (req.user?.isMasterAdmin) return next();
  if (req.user?.role === 'tenant_admin') return next();
  return sendError(res, 403, 'Only organization administrators can manage team members');
}

router.use(requireOrgAdmin);

function toPublicUser(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
    isPlatformAdmin: row.platform_role === 'master_admin',
  };
}

async function countActiveAdmins(supabase, companyId) {
  const { count, error } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('role', 'admin')
    .eq('is_active', true);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Master admins may scope Team APIs to another workspace via `companyId` (query or POST body).
 * Tenant admins are always locked to the workspace in their session token.
 */
async function resolveManageCompanyId(req, res) {
  const tokenCompanyId = req.companyId;
  if (!req.user?.isMasterAdmin) {
    return tokenCompanyId;
  }

  let explicit = null;
  if (req.method === 'GET' || req.method === 'PATCH') {
    explicit = req.query.companyId;
  } else if (req.method === 'POST') {
    explicit = req.body?.companyId;
  }
  const want = explicit != null && String(explicit).trim() !== '' ? String(explicit).trim() : null;
  if (!want) return tokenCompanyId;

  const supabase = getSupabase();
  const { data, error } = await supabase.from('companies').select('id').eq('id', want).maybeSingle();
  if (error) throw error;
  if (!data) {
    sendError(res, 400, 'Unknown workspace');
    return null;
  }
  return want;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const manageCompanyId = await resolveManageCompanyId(req, res);
    if (manageCompanyId == null) return;

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('users')
      .select('id,email,role,platform_role,is_active,created_at,company_id')
      .eq('company_id', manageCompanyId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const users = (data || []).filter((u) => u.company_id === manageCompanyId).map(toPublicUser);
    return sendSuccess(res, { users });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const manageCompanyId = await resolveManageCompanyId(req, res);
    if (manageCompanyId == null) return;

    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const role = body.role === 'admin' ? 'admin' : 'agent';

    if (!validator.isEmail(email)) {
      return sendError(res, 400, 'Invalid email format');
    }
    if (password.length < 6) {
      return sendError(res, 400, 'Password must be at least 6 characters');
    }

    const supabase = getSupabase();
    const { data: existing } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    if (existing) {
      return sendError(res, 400, 'That email is already registered');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const { data: created, error } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: passwordHash,
        company_id: manageCompanyId,
        role,
        platform_role: null,
        is_active: true,
      })
      .select('id,email,role,platform_role,is_active,created_at')
      .single();
    if (error) throw error;

    return sendSuccess(res, { user: toPublicUser({ ...created, company_id: manageCompanyId }) }, {}, 201);
  })
);

router.patch(
  '/:userId',
  asyncHandler(async (req, res) => {
    const manageCompanyId = await resolveManageCompanyId(req, res);
    if (manageCompanyId == null) return;

    const userId = String(req.params.userId || '').trim();
    if (!userId) return sendError(res, 400, 'User id is required');

    if (userId === req.user.userId) {
      return sendError(res, 400, 'You cannot change your own role or status here');
    }

    const body = req.body || {};
    const nextRole = body.role !== undefined ? (body.role === 'admin' ? 'admin' : 'agent') : undefined;
    const nextActive = body.isActive !== undefined ? Boolean(body.isActive) : undefined;

    if (nextRole === undefined && nextActive === undefined) {
      return sendError(res, 400, 'No changes requested');
    }

    const supabase = getSupabase();
    const { data: target, error: findErr } = await supabase
      .from('users')
      .select('id,email,role,platform_role,is_active,company_id')
      .eq('id', userId)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!target || target.company_id !== manageCompanyId) {
      return sendError(res, 404, 'User not found in this organization');
    }
    if (target.platform_role === 'master_admin') {
      return sendError(res, 403, 'Cannot modify platform administrator accounts');
    }

    const adminCount = await countActiveAdmins(supabase, manageCompanyId);
    const targetIsAdmin = target.role === 'admin' && target.is_active;

    if (nextRole === 'agent' || (nextActive === false && targetIsAdmin)) {
      if (targetIsAdmin && adminCount <= 1) {
        return sendError(res, 400, 'Cannot remove the last organization administrator');
      }
    }

    const patch = {};
    if (nextRole !== undefined) patch.role = nextRole;
    if (nextActive !== undefined) patch.is_active = nextActive;

    const { data: updated, error: upErr } = await supabase
      .from('users')
      .update(patch)
      .eq('id', userId)
      .eq('company_id', manageCompanyId)
      .select('id,email,role,platform_role,is_active,created_at')
      .single();
    if (upErr) throw upErr;

    return sendSuccess(res, { user: toPublicUser(updated) });
  })
);

module.exports = router;
