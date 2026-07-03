const { getSupabase } = require('./supabaseClient');
const { logger } = require('../utils/logger');
const { throwFromSupabaseError } = require('../utils/supabaseErrors');

// ── In-memory TTL caches ──────────────────────────────────────────────────────
// Avoids a Supabase round-trip on every turn for data that rarely changes mid-call.
const CACHE_TTL_MS = 60_000; // 60 seconds
const _companyInfoCache = new Map(); // companyId → { data, expiresAt }
const _agentConfigCache = new Map(); // companyId → { data, expiresAt }

function _getCached(cache, key) {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function _setCached(cache, key, data) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── In-memory session message buffer ─────────────────────────────────────────
// Accumulates messages in-process so getRecentMessages never hits Supabase after
// the initial seed (the first DB read per session). Saves ~150-200 ms per turn.
// Keyed by `${companyId}:${sessionId}`. Evicted when clearSessionDb is called.
const _sessionMsgBuffer = new Map();

function _sessionKey(companyId, sessionId) {
  return `${companyId}:${sessionId}`;
}

async function embedProjectInBackground(projectId, project) {
  const { embedProject } = require('./embeddingService');
  const { getSupabase } = require('./supabaseClient');
  const embedding = await embedProject(project);
  const supabase = getSupabase();
  const { error } = await supabase
    .from('projects')
    .update({ embedding })
    .eq('id', projectId);
  if (error) throw error;
  console.log(`[Embed] Project embedded: ${project.name}`);
}

function assertCompanyId(companyId) {
  if (!companyId) throw new Error('companyId is required');
}

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeDbErrorText(error) {
  return [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' | ')
    .toLowerCase();
}

/** Postgres undefined_column */
const PG_UNDEFINED_COLUMN = '42703';

function isMissingCallsColumnError(error, columnName) {
  const text = normalizeDbErrorText(error);
  const col = String(columnName || '').toLowerCase();
  if (!col || !text.includes(col)) return false;
  if (String(error?.code || '') === PG_UNDEFINED_COLUMN) return true;
  return (
    text.includes('does not exist') ||
    text.includes('schema cache') ||
    (text.includes('could not find') && text.includes('column'))
  );
}

/** Any PostgREST / Postgres signal that a selected column is absent on `calls`. */
function isCallsTableSchemaMismatchError(error) {
  const text = normalizeDbErrorText(error);
  const mentionsCallsTable =
    text.includes('calls.') ||
    text.includes('relation "calls"') ||
    text.includes('of relation "calls"') ||
    text.includes("column of 'calls'") ||
    (text.includes('schema cache') && text.includes('calls'));
  if (String(error?.code || '') === PG_UNDEFINED_COLUMN) {
    return mentionsCallsTable || /\brelation\s+["`]?calls["`]?\b/.test(text);
  }
  if (!mentionsCallsTable) return false;
  return (
    text.includes('does not exist') ||
    text.includes('schema cache') ||
    (text.includes('could not find') && text.includes('column'))
  );
}

function shouldRetryLogCallWithoutLeadMeta(error) {
  return (
    isMissingCallsColumnError(error, 'lead_phone') ||
    isMissingCallsColumnError(error, 'lead_name') ||
    (normalizeDbErrorText(error).includes('schema cache') && normalizeDbErrorText(error).includes('calls'))
  );
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

  // Keep in-process buffer in sync so getRecentMessages skips DB on next turn.
  const key = _sessionKey(companyId, sessionId);
  if (_sessionMsgBuffer.has(key)) {
    const buf = _sessionMsgBuffer.get(key);
    buf.push({ role, content });
    // Cap at 60 entries (30 full turns) — prevents unbounded growth on very long calls.
    if (buf.length > 60) buf.splice(0, buf.length - 60);
  }

  return data?.id;
}

async function getRecentMessages(companyId, sessionId, limit = 10) {
  assertCompanyId(companyId);
  const key = _sessionKey(companyId, sessionId);

  // Buffer hit — return last `limit` messages without touching DB (~0 ms vs ~150-200 ms).
  if (_sessionMsgBuffer.has(key)) {
    const buf = _sessionMsgBuffer.get(key);
    return buf.slice(-limit);
  }

  // Buffer miss — seed from DB (happens once per session on the first turn).
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('messages')
    .select('role,content,created_at')
    .eq('company_id', companyId)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const messages = (data || []).reverse().map((m) => ({ role: m.role, content: m.content }));

  // Seed the buffer so subsequent turns skip the DB entirely.
  _sessionMsgBuffer.set(key, [...messages]);
  return messages;
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
  // Evict in-process message buffer for this session.
  _sessionMsgBuffer.delete(_sessionKey(companyId, sessionId));
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
  let resolvedId = isUuid(lead.id) ? lead.id : undefined;

  // Most frontend lead IDs are phone-based strings (not UUID). Resolve by phone first.
  if (!resolvedId && lead.phone) {
    const { data: existingByPhone, error: lookupError } = await supabase
      .from('leads')
      .select('id')
      .eq('company_id', companyId)
      .eq('phone', lead.phone)
      .maybeSingle();
    if (lookupError) {
      logger.warn('lead_lookup_failed', { companyId, phone: lead.phone, error: lookupError.message });
    } else if (existingByPhone?.id) {
      resolvedId = existingByPhone.id;
    }
  }

  const payload = {
    id: resolvedId,
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
    lead_phone: lead?.phone || null,
    lead_name: lead?.name || null,
    session_id: sessionId,
    duration: durationSeconds || 0,
    outcome: outcome || 'unknown',
    transcript,
    summary,
  };
  let { data, error } = await supabase.from('calls').insert(payload).select('id').single();
  if (error && shouldRetryLogCallWithoutLeadMeta(error)) {
    // Backward compatibility when lead_phone / lead_name (or stale schema cache) are not available.
    const fallbackPayload = { ...payload };
    delete fallbackPayload.lead_phone;
    delete fallbackPayload.lead_name;
    ({ data, error } = await supabase.from('calls').insert(fallbackPayload).select('id').single());
  }
  if (error) throw error;
  return data?.id;
}

async function updateCallRecordingPaths(companyId, callId, { recordingUserPath, recordingAgentPath }) {
  assertCompanyId(companyId);
  if (!callId) return;
  const patch = {};
  if (recordingUserPath) patch.recording_user_path = recordingUserPath;
  if (recordingAgentPath) patch.recording_agent_path = recordingAgentPath;
  if (!Object.keys(patch).length) return;
  const supabase = getSupabase();
  const { error } = await supabase.from('calls').update(patch).eq('id', callId).eq('company_id', companyId);
  if (
    error &&
    (isMissingCallsColumnError(error, 'recording_user_path') ||
      isMissingCallsColumnError(error, 'recording_agent_path'))
  ) {
    logger.warn('update_call_recording_paths_skipped', {
      companyId,
      callId,
      message: error.message,
    });
    return;
  }
  if (error) throw error;
}

async function listRecentCalls(companyId, limit = 25) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  const cap = Math.min(100, Math.max(1, Number(limit) || 25));
  const fullSelect =
    'id,created_at,duration,outcome,summary,lead_id,lead_phone,lead_name,recording_user_path,recording_agent_path';
  let { data, error } = await supabase
    .from('calls')
    .select(fullSelect)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(cap);
  if (error && (isMissingCallsColumnError(error, 'lead_phone') || isMissingCallsColumnError(error, 'lead_name'))) {
    ({ data, error } = await supabase
      .from('calls')
      .select('id,created_at,duration,outcome,summary,lead_id,recording_user_path,recording_agent_path')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(cap));
    if (!error) {
      data = (data || []).map((row) => ({ ...row, lead_phone: null, lead_name: null }));
    }
  }
  if (error && isCallsTableSchemaMismatchError(error)) {
    ({ data, error } = await supabase
      .from('calls')
      .select('id,created_at,duration,outcome,summary,lead_id')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(cap));
    if (!error) {
      data = (data || []).map((row) => ({
        ...row,
        lead_phone: null,
        lead_name: null,
        recording_user_path: null,
        recording_agent_path: null,
      }));
    }
  }
  if (error) throw error;
  return data || [];
}

async function listCallsForLead(companyId, { leadId, leadPhone }, limit = 20) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  const cap = Math.min(100, Math.max(1, Number(limit) || 20));

  const hasUuidLeadId = Boolean(leadId && isUuid(leadId));

  const runQuery = (withLeadPhoneColumns) => {
    const selectCols = withLeadPhoneColumns
      ? 'id,created_at,duration,outcome,summary,transcript,lead_id,lead_phone,lead_name,recording_user_path,recording_agent_path'
      : 'id,created_at,duration,outcome,summary,transcript,lead_id,recording_user_path,recording_agent_path';
    let query = supabase
      .from('calls')
      .select(selectCols)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(cap);
    if (hasUuidLeadId) {
      query = query.eq('lead_id', leadId);
    } else if (withLeadPhoneColumns && leadPhone) {
      query = query.eq('lead_phone', leadPhone);
    }
    return query;
  };

  let query = runQuery(true);
  if (!hasUuidLeadId && !leadPhone) {
    return [];
  }

  let { data, error } = await query;
  if (error && (isMissingCallsColumnError(error, 'lead_phone') || isMissingCallsColumnError(error, 'lead_name'))) {
    if (!hasUuidLeadId) {
      // Before migration, non-UUID frontend lead IDs cannot be resolved safely by phone.
      return [];
    }
    ({ data, error } = await runQuery(false));
    if (!error) {
      data = (data || []).map((row) => ({ ...row, lead_phone: null, lead_name: null }));
    }
  }
  if (error && isCallsTableSchemaMismatchError(error)) {
    if (!hasUuidLeadId) {
      return [];
    }
    ({ data, error } = await supabase
      .from('calls')
      .select('id,created_at,duration,outcome,summary,transcript,lead_id')
      .eq('company_id', companyId)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(cap));
    if (!error) {
      data = (data || []).map((row) => ({
        ...row,
        lead_phone: null,
        lead_name: null,
        recording_user_path: null,
        recording_agent_path: null,
      }));
    }
  }
  if (error) throw error;
  return data || [];
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

  // Embed in background — don't block the response
  embedProjectInBackground(data.id, data).catch((err) =>
    console.warn('[Embed] Failed to embed new project:', err.message)
  );

  return data;
}

async function updateProject(companyId, id, payload) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('projects')
    .update({ ...payload, metadata: payload })
    .eq('company_id', companyId)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Project not found');

  // Re-embed in background after update
  embedProjectInBackground(data.id, data).catch((err) =>
    console.warn('[Embed] Failed to re-embed updated project:', err.message)
  );

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
  // Check in-memory cache first (saves ~100-200 ms/turn on cache hits).
  const cached = _getCached(_companyInfoCache, companyId);
  if (cached) return cached;
  const supabase = getSupabase();
  await ensureCompany(companyId);
  const { data, error } = await supabase
    .from('companies')
    .select('id,name,profile')
    .eq('id', companyId)
    .single();
  if (error) throw error;
  const result = { ...(data.profile || {}), name: data.name };
  _setCached(_companyInfoCache, companyId, result);
  return result;
}

async function updateCompanyInfo(companyId, payload) {
  assertCompanyId(companyId);
  // Invalidate cache so the next read reflects the new data.
  _companyInfoCache.delete(companyId);
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

const SETTINGS_CORE_KEYS = new Set([
  'ttsVoice',
  'ttsModel',
  'sttModel',
  'ttsProvider',
  'autoEndCall',
  'languageMode',
  'agentName',
  'introTemplate',
  'language',
  'tone',
]);

async function getAgentConfigRow(companyId) {
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

async function getAgentConfig(companyId) {
  // Check in-memory cache first (saves ~100-200 ms/turn on cache hits).
  const cached = _getCached(_agentConfigCache, companyId);
  if (cached) return cached;
  const row = await getAgentConfigRow(companyId);
  const result = normalizeAgentConfig(row);
  if (result) _setCached(_agentConfigCache, companyId, result);
  return result;
}

function normalizeAgentConfig(row) {
  if (!row) return null;
  const s = row.settings && typeof row.settings === 'object' ? row.settings : {};
  const settingsExtras = Object.fromEntries(
    Object.entries(s).filter(([k]) => !SETTINGS_CORE_KEYS.has(k))
  );
  return {
    ...settingsExtras,
    agentName: row.agent_name || s.agentName || 'Voice Agent',
    ttsVoice: s.ttsVoice || 'shubh',
    ttsModel: s.ttsModel || 'bulbul:v3',
    sttModel: s.sttModel || 'saarika:v2.5',
    ttsProvider: s.ttsProvider || 'sarvam',
    autoEndCall: s.autoEndCall !== undefined ? s.autoEndCall : true,
    languageMode: row.language || s.languageMode || 'telugu',
    introTemplate: row.intro_template || s.introTemplate || null,
    tone: row.tone || s.tone || null,
  };
}

async function upsertAgentConfig(companyId, payload) {
  assertCompanyId(companyId);
  // Invalidate cache so the next read reflects the saved settings.
  _agentConfigCache.delete(companyId);
  const supabase = getSupabase();
  const row = {
    company_id: companyId,
    agent_name: payload.agentName || 'Voice Agent',
    tone: payload.tone || null,
    language: payload.languageMode || 'telugu',
    intro_template: payload.introTemplate || null,
  };

  const { data: existing } = await supabase
    .from('agent_configs')
    .select('id,settings')
    .eq('company_id', companyId)
    .maybeSingle();

  let prevSettings = {};
  if (existing?.settings && typeof existing.settings === 'object') {
    prevSettings = existing.settings;
  }

  const settings = {
    ...prevSettings,
    ttsVoice: payload.ttsVoice || prevSettings.ttsVoice || 'shubh',
    ttsModel: payload.ttsModel || prevSettings.ttsModel || 'bulbul:v3',
    sttModel: payload.sttModel || prevSettings.sttModel || 'saarika:v2.5',
    ttsProvider: payload.ttsProvider || prevSettings.ttsProvider || 'sarvam',
    autoEndCall:
      payload.autoEndCall !== undefined
        ? Boolean(payload.autoEndCall)
        : prevSettings.autoEndCall !== undefined
          ? Boolean(prevSettings.autoEndCall)
          : true,
    languageMode: payload.languageMode || prevSettings.languageMode || 'telugu',
    agentName: payload.agentName || prevSettings.agentName || 'Voice Agent',
    introTemplate:
      payload.introTemplate !== undefined ? payload.introTemplate : prevSettings.introTemplate,
  };

  const EXTRA_SETTING_KEYS = [
    'voicemailTemplate',
    'consentTemplate',
    'requireConsent',
    'operatingDays',
    'operatingStart',
    'operatingEnd',
  ];
  for (const k of EXTRA_SETTING_KEYS) {
    if (payload[k] !== undefined) settings[k] = payload[k];
  }

  row.settings = settings;

  let data, error;
  if (existing) {
    ({ data, error } = await supabase
      .from('agent_configs')
      .update(row)
      .eq('id', existing.id)
      .select('*')
      .single());
  } else {
    ({ data, error } = await supabase.from('agent_configs').insert(row).select('*').single());
  }
  if (error) throw error;
  return data;
}

function mapQuestionRow(r) {
  return {
    id: r.id,
    sortOrder: r.sort_order,
    type: r.question_type,
    prompt: r.prompt,
    options: Array.isArray(r.options) ? r.options : [],
    required: r.is_required,
  };
}

function mapQuestionnaireDetail(row, questions) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    questions: (questions || []).map(mapQuestionRow),
  };
}

async function listQuestionnaires(companyId) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  const { data: questionnaires, error: qErr } = await supabase
    .from('questionnaires')
    .select('id, name, description, updated_at')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false });
  if (qErr) throwFromSupabaseError(qErr, 'listQuestionnaires');
  const list = questionnaires || [];
  if (list.length === 0) return [];

  const ids = list.map((q) => q.id);
  const { data: counts, error: cErr } = await supabase
    .from('questionnaire_questions')
    .select('questionnaire_id')
    .in('questionnaire_id', ids);
  if (cErr) throwFromSupabaseError(cErr, 'listQuestionnaires_counts');
  const byQ = new Map();
  for (const row of counts || []) {
    const id = row.questionnaire_id;
    byQ.set(id, (byQ.get(id) || 0) + 1);
  }

  return list.map((q) => ({
    id: q.id,
    name: q.name,
    description: q.description || '',
    updatedAt: q.updated_at,
    questionCount: byQ.get(q.id) || 0,
  }));
}

async function getQuestionnaire(companyId, questionnaireId) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  const { data: row, error: qErr } = await supabase
    .from('questionnaires')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', questionnaireId)
    .maybeSingle();
  if (qErr) throwFromSupabaseError(qErr, 'getQuestionnaire');
  if (!row) return null;

  const { data: qs, error: qsErr } = await supabase
    .from('questionnaire_questions')
    .select('*')
    .eq('questionnaire_id', questionnaireId)
    .order('sort_order', { ascending: true });
  if (qsErr) throwFromSupabaseError(qsErr, 'getQuestionnaire_questions');
  return mapQuestionnaireDetail(row, qs || []);
}

async function createQuestionnaire(companyId, { name, description, questions }) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  const { data: row, error: insErr } = await supabase
    .from('questionnaires')
    .insert({
      company_id: companyId,
      name,
      description: description || '',
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (insErr) throwFromSupabaseError(insErr, 'createQuestionnaire_insert');

  const qid = row.id;
  if (questions.length > 0) {
    const payload = questions.map((q, i) => ({
      questionnaire_id: qid,
      sort_order: q.sortOrder ?? i,
      question_type: q.type,
      prompt: q.prompt,
      options: q.options || [],
      is_required: q.required !== false,
    }));
    const { error: qErr } = await supabase.from('questionnaire_questions').insert(payload);
    if (qErr) throwFromSupabaseError(qErr, 'createQuestionnaire_questions');
  }

  return getQuestionnaire(companyId, qid);
}

async function updateQuestionnaire(companyId, questionnaireId, { name, description, questions }) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  const { data: existing, error: findErr } = await supabase
    .from('questionnaires')
    .select('id')
    .eq('company_id', companyId)
    .eq('id', questionnaireId)
    .maybeSingle();
  if (findErr) throwFromSupabaseError(findErr, 'updateQuestionnaire_find');
  if (!existing) return null;

  const { error: delErr } = await supabase
    .from('questionnaire_questions')
    .delete()
    .eq('questionnaire_id', questionnaireId);
  if (delErr) throwFromSupabaseError(delErr, 'updateQuestionnaire_delete_questions');

  const { error: upErr } = await supabase
    .from('questionnaires')
    .update({
      name,
      description: description || '',
      updated_at: new Date().toISOString(),
    })
    .eq('id', questionnaireId)
    .eq('company_id', companyId);
  if (upErr) throwFromSupabaseError(upErr, 'updateQuestionnaire_row');

  if (questions.length > 0) {
    const payload = questions.map((q, i) => ({
      questionnaire_id: questionnaireId,
      sort_order: q.sortOrder ?? i,
      question_type: q.type,
      prompt: q.prompt,
      options: q.options || [],
      is_required: q.required !== false,
    }));
    const { error: insErr } = await supabase.from('questionnaire_questions').insert(payload);
    if (insErr) throwFromSupabaseError(insErr, 'updateQuestionnaire_insert_questions');
  }

  return getQuestionnaire(companyId, questionnaireId);
}

async function deleteQuestionnaire(companyId, questionnaireId) {
  assertCompanyId(companyId);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('questionnaires')
    .delete()
    .eq('company_id', companyId)
    .eq('id', questionnaireId)
    .select('id');
  if (error) throwFromSupabaseError(error, 'deleteQuestionnaire');
  return Array.isArray(data) && data.length > 0;
}

/**
 * Update a lead's status after a call outcome is determined.
 * Called fire-and-forget from the end_call handler.
 * @param {string} companyId
 * @param {string} leadId
 * @param {string} status - 'hot' | 'not_interested' | 'closed' | 'contacted'
 */
async function updateLeadStatus(companyId, leadId, status) {
  assertCompanyId(companyId);
  if (!leadId || !status) return;
  const supabase = getSupabase();

  // Try with updated_at first, fall back without it if column doesn't exist
  let error;
  ({ error } = await supabase
    .from('leads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('company_id', companyId));

  if (error && (error.message?.includes('updated_at') || error.code === '42703')) {
    ({ error } = await supabase
      .from('leads')
      .update({ status })
      .eq('id', leadId)
      .eq('company_id', companyId));
  }

  if (error) {
    logger.warn('lead_status_update_error', { companyId, leadId, status, error: error.message });
    throw new Error(error.message);
  }
  logger.info('lead_status_updated', { companyId, leadId, status });
}

/**
 * Evict the in-process message buffer for a specific session.
 * Call this at end_call and disconnect so stale buffers don't linger.
 */
function evictSessionBuffer(companyId, sessionId) {
  _sessionMsgBuffer.delete(_sessionKey(companyId, sessionId));
}

module.exports = {
  saveMessage,
  getRecentMessages,
  getSessionMessages,
  clearSessionDb,
  evictSessionBuffer,
  logCall,
  updateCallRecordingPaths,
  listRecentCalls,
  listCallsForLead,
  getAnalytics,
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getCompanyInfo,
  updateCompanyInfo,
  getAgentConfig,
  getAgentConfigRow,
  upsertAgentConfig,
  upsertLead,
  updateLeadStatus,
  listQuestionnaires,
  getQuestionnaire,
  createQuestionnaire,
  updateQuestionnaire,
  deleteQuestionnaire,
};
