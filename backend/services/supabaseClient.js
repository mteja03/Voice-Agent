const { createClient } = require('@supabase/supabase-js');
const { logger } = require('../utils/logger');
 
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
 
const IS_HOSTED =
  process.env.NODE_ENV === 'production' ||
  Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
 
let supabase = null;
 
function getSupabase() {
  if (supabase) return supabase;
 
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be configured');
  }
 
  if (IS_HOSTED && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY must be set in Railway — the anon key will not bypass RLS'
    );
  }
 
  logger.info('supabase_init', {
    url: SUPABASE_URL,
    usingServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
 
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });
 
  return supabase;
}
 
module.exports = { getSupabase };
