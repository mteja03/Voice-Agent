const { getSupabase } = require('./supabaseClient');
const { logger } = require('../utils/logger');

function assertCompanyId(companyId) {
  if (!companyId) throw new Error('companyId is required');
}

async function ensureCompany(companyId, name = 'Voice Agent Company') {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  const { data: existing, error: selectError } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing;
  const { data, error } = await supabase
    .from('companies')
    .insert({ id: companyId, name })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

async function saveMessage(companyId, sessionId, role, content, leadId = null) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  const payload = {
    company_id: companyId,
    lead_id: leadId,
    session_id: sessionId,
    role,
    content,
  };
  const { data, error } = await supabase
    .from('messages')
    .insert(payload)
    .select('id')
    .single();
  if (error) throw error;
  return data?.id;
}

async function getRecentMessages(companyId, sessionId, limit = 10) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('messages')
    .select('role,content,created_at')
    .eq('company_id', companyId)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).reverse().map((m) => ({ role: m.role, content: m.content }));
}

async function getSessionMessages(companyId, sessionId) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('messages')
    .select('role,content')
    .eq('company_id', companyId)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((m) => ({ role: m.role, content: m.content }));
}

async function clearSessionDb(companyId, sessionId) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  await Promise.all([
    supabase.from('messages').delete().eq('company_id', companyId).eq('session_id', sessionId),
    supabase.from('calls').delete().eq('company_id', companyId).eq('session_id', sessionId),
  ]);
  return true;
}

async function upsertLead(companyId, lead = {}) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  if (!lead.phone && !lead.id) return null;
  const payload = {
    id: lead.id || undefined,
    company_id: companyId,
    name: lead.name || 'Unknown',
    phone: lead.phone || null,
    source: lead.source || 'dialer',
    status: lead.status || 'new',
  };
  const { data, error } = await supabase
    .from('leads')
    .upsert(payload, { onConflict: 'id' })
    .select('id')
    .single();
  if (error) {
    logger.warn('lead_upsert_failed', { companyId, error: error.message });
    return null;
  }
  return data?.id || null;
}

async function logCall(companyId, sessionId, lead, durationSeconds, outcome, transcript = [], summary = '') {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  const leadId = await upsertLead(companyId, lead);
  const payload = {
    company_id: companyId,
    lead_id: leadId,
    session_id: sessionId,
    duration: durationSeconds || 0,
    outcome: outcome || 'unknown',
    transcript,
    summary,
  };
  const { data, error } = await supabase.from('calls').insert(payload).select('id').single();
  if (error) throw error;
  return data?.id;
}

async function getAnalytics(companyId) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  const { data: calls, error } = await supabase
    .from('calls')
    .select('outcome,duration,created_at')
    .eq('company_id', companyId);
  if (error) throw error;
  const rows = calls || [];
  const totalCalls = rows.length;
  const interestedCalls = rows.filter((c) => c.outcome === 'interested').length;
  const avgDurationSeconds = totalCalls
    ? Math.round(rows.reduce((sum, c) => sum + Number(c.duration || 0), 0) / totalCalls)
    : 0;

  const since = new Date();
  since.setDate(since.getDate() - 7);
  const byDate = new Map();
  const outcomeMap = new Map();
  for (const c of rows) {
    const ts = new Date(c.created_at);
    if (!Number.isNaN(ts.getTime()) && ts >= since) {
      const key = ts.toISOString().slice(0, 10);
      byDate.set(key, (byDate.get(key) || 0) + 1);
    }
    const outcomeKey = String(c.outcome || 'unknown').replace('_', ' ');
    outcomeMap.set(outcomeKey, (outcomeMap.get(outcomeKey) || 0) + 1);
  }

  return {
    totalCalls,
    interestedCalls,
    avgDurationSeconds,
    conversionRate: totalCalls ? Number(((interestedCalls / totalCalls) * 100).toFixed(1)) : 0,
    callsByDate: [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count })),
    outcomes: [...outcomeMap.entries()].map(([name, value]) => ({ name, value })),
  };
}

async function listProjects(companyId) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getProjectById(companyId, id) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function createProject(companyId, payload) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  await ensureCompany(companyId);
  const row = {
    company_id: companyId,
    name: payload.name,
    type: payload.type || '',
    location: payload.location || '',
    description: payload.description || '',
    offer: payload.offer || '',
    url: payload.url || '',
    keywords: payload.keywords || [],
    amenities: payload.amenities || [],
    metadata: payload,
  };
  const { data, error } = await supabase.from('projects').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

async function updateProject(companyId, id, payload) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('projects')
    .update({
      ...payload,
      metadata: payload,
    })
    .eq('company_id', companyId)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Project not found');
  return data;
}

async function deleteProject(companyId, id) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('projects')
    .delete()
    .eq('company_id', companyId)
    .eq('id', id)
    .select('id');
  if (error) throw error;
  return Boolean(data?.length);
}

async function getCompanyInfo(companyId) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  await ensureCompany(companyId);
  const { data, error } = await supabase
    .from('companies')
    .select('id,name,profile')
    .eq('id', companyId)
    .single();
  if (error) throw error;
  return { ...(data.profile || {}), name: data.name };
}

async function updateCompanyInfo(companyId, payload) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  await ensureCompany(companyId, payload?.name || 'Voice Agent Company');
  const update = {
    name: payload?.name || 'Voice Agent Company',
    profile: payload || {},
  };
  const { data, error } = await supabase
    .from('companies')
    .update(update)
    .eq('id', companyId)
    .select('id,name,profile')
    .single();
  if (error) throw error;
  return { ...(data.profile || {}), name: data.name };
}

async function getAgentConfig(companyId) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('agent_configs')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

module.exports = {
  saveMessage,
  getRecentMessages,
  getSessionMessages,
  clearSessionDb,
  logCall,
  getAnalytics,
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getCompanyInfo,
  updateCompanyInfo,
  getAgentConfig,
  upsertLead,
};
