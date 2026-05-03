const express = require('express');
const { randomUUID } = require('crypto');
const { getSupabase } = require('../services/supabaseClient');
const { sendError, sendSuccess } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

function requireMasterAdmin(req, res, next) {
  if (!req.user?.isMasterAdmin) {
    return sendError(res, 403, 'Only master admin can manage tenants');
  }
  return next();
}

router.use(requireMasterAdmin);

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('companies')
      .select('id,name,created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return sendSuccess(res, { tenants: data || [] });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return sendError(res, 400, 'Company name is required');

    const id = String(req.body?.id || '').trim() || randomUUID();
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('companies')
      .insert({ id, name })
      .select('id,name,created_at')
      .single();
    if (error) throw error;
    return sendSuccess(res, { tenant: data }, {}, 201);
  })
);

module.exports = router;
