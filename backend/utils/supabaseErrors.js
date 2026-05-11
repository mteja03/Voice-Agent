const { logger } = require('./logger');

const isProdLike =
  process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT);

/**
 * Turn a PostgREST / Supabase client error into an HTTP-friendly Error (status & publicMessage).
 * Avoids opaque 500s for common setup issues (missing tables).
 */
function throwFromSupabaseError(error, context = '') {
  const raw = String(error?.message || 'Database request failed');
  const lower = raw.toLowerCase();
  const pgCode = error?.code;

  const err = new Error(raw);
  err.originalCode = pgCode;

  const missingTable =
    lower.includes('could not find the table') ||
    lower.includes('schema cache') ||
    (lower.includes('relation') && lower.includes('does not exist')) ||
    pgCode === '42P01';

  if (missingTable) {
    err.status = 422;
    err.publicMessage =
      'The questionnaire tables are not in your database yet. In Supabase → SQL Editor, run backend/supabase/scripts/ensure-questionnaires-tables.sql (or the questionnaire section of backend/supabase/schema.sql), then try again.';
    logger.warn('supabase_missing_table', { context, message: raw });
    throw err;
  }

  if (pgCode === '23505') {
    err.status = 409;
    err.publicMessage = 'This record conflicts with an existing value.';
    throw err;
  }

  if (pgCode === '23503') {
    err.status = 400;
    err.publicMessage = 'Invalid reference. Check that your workspace exists.';
    throw err;
  }

  err.status = 422;
  err.publicMessage = isProdLike
    ? 'Could not save questionnaires. Check database configuration and server logs.'
    : raw;
  logger.warn('supabase_request_failed', { context, message: raw, code: pgCode });
  throw err;
}

module.exports = { throwFromSupabaseError };
