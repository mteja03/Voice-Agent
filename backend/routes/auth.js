const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const validator = require('validator');
const { getSupabase } = require('../services/supabaseClient');
const { logger } = require('../utils/logger');
const { sendError, sendSuccess } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
const BCRYPT_ROUNDS = 10;
const JWT_EXPIRES = '7d';

function signToken(payload) {
  if (!process.env.JWT_SECRET) {
    const err = new Error('Server configuration error');
    err.status = 500;
    err.publicMessage = 'Server configuration error';
    throw err;
  }
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES });
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
      })
      .select('id,email,company_id,role,created_at')
      .single();
    if (userError) throw userError;

    const token = signToken({
      userId: user.id,
      companyId: user.company_id,
      role: user.role,
    });

    log.info('auth_register_success', { email, userId: user.id, companyId: user.company_id });

    return sendSuccess(
      res,
      {
        token,
        user: {
          id: user.id,
          email: user.email,
          companyId: user.company_id,
          role: user.role,
          createdAt: user.created_at,
        },
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
      .select('id,email,password_hash,company_id,role,created_at')
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

    const token = signToken({
      userId: user.id,
      companyId: user.company_id,
      role: user.role,
    });

    log.info('auth_login_success', { email, userId: user.id, companyId: user.company_id });

    return sendSuccess(res, {
      token,
      user: {
        id: user.id,
        email: user.email,
        companyId: user.company_id,
        role: user.role,
        createdAt: user.created_at,
      },
    });
  })
);

module.exports = router;
