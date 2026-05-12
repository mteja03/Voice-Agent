const dbService = require('./dbService');

// Telugu + English triggers for property-related queries
const TRIGGER_KEYWORDS = [
  // English
  'plot', 'villa', 'apartment', 'flat', 'price', 'cost', 'budget',
  'location', 'project', 'bhk', 'sqft', 'offer', 'discount', 'visit',
  'book', 'loan', 'emi', 'acres', 'layout', 'gated', 'amenities',
  'egypt', 'city', 'pristine', 'exotica', 'purple', 'airport',
  'rajahmundry', 'kakinada', 'pithapuram', 'rajamahendravaram',
  'serene', 'krishna', 'casa', 'levanta', 'flora', 'lorven',
  'rome', 'spring', 'leaf', 'milano', 'habitat', 'primus',
  // Telugu
  'ప్లాట్', 'విల్లా', 'అపార్ట్మెంట్', 'ధర', 'బడ్జెట్',
  'లొకేషన్', 'ప్రాజెక్ట్', 'ఆఫర్', 'విజిట్', 'బుక్',
  'రాజమండ్రి', 'కాకినాడ', 'ఈజిప్ట్', 'సిటీ', 'విల్లాలు', 'ప్లాట్లు',
  'కొనాలి', 'కొనాలని', 'వెతుకుతున్నా', 'చూస్తున్నా', 'ఇల్లు', 'స్థలం',
  'సెరెన్', 'కృష్ణ', 'కాసా', 'లెవంటా', 'లోర్వెన్', 'రోమ్', 'ప్రైమస్',
];

/**
 * Returns project info string to inject into the GPT prompt
 * when the user's query is property-related.
 */
function normalizeProject(payload, existing = null) {
  const trimmedName = String(payload.name || existing?.name || '').trim();
  if (!trimmedName) throw new Error('Project name is required');

  const keywords = Array.isArray(payload.keywords) ? payload.keywords : existing?.keywords || [];
  const amenities = Array.isArray(payload.amenities) ? payload.amenities : existing?.amenities || [];

  return {
    id: String(payload.id || existing?.id || '').trim() || makeProjectId(trimmedName),
    name: trimmedName,
    nameTeluguHint: String(payload.nameTeluguHint || existing?.nameTeluguHint || '').trim(),
    type: String(payload.type || existing?.type || '').trim(),
    location: String(payload.location || existing?.location || '').trim(),
    locationTeluguHint: String(payload.locationTeluguHint || existing?.locationTeluguHint || '').trim(),
    description: String(payload.description || existing?.description || '').trim(),
    highlights: String(payload.highlights || existing?.highlights || '').trim(),
    offer: String(payload.offer || existing?.offer || '').trim(),
    amenities: amenities.map((v) => String(v).trim()).filter(Boolean),
    siteVisitAvailable: Boolean(
      payload.siteVisitAvailable !== undefined ? payload.siteVisitAvailable : existing?.siteVisitAvailable
    ),
    url: String(payload.url || existing?.url || '').trim(),
    keywords: keywords.map((v) => String(v).trim()).filter(Boolean),
    totalArea: String(payload.totalArea || existing?.totalArea || '').trim(),
    configuration: String(payload.configuration || existing?.configuration || '').trim(),
  };
}

function makeProjectId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `project-${Date.now()}`;
}

async function listProjects(companyId) {
  return dbService.listProjects(companyId);
}

async function getProjectById(companyId, id) {
  return dbService.getProjectById(companyId, id);
}

async function createProject(companyId, payload) {
  const project = normalizeProject(payload);
  return dbService.createProject(companyId, project);
}

async function updateProject(companyId, id, payload) {
  const existing = await getProjectById(companyId, id);
  if (!existing) throw new Error('Project not found');
  const merged = normalizeProject({ ...existing, ...payload, id }, existing);
  return dbService.updateProject(companyId, id, merged);
}

async function deleteProject(companyId, id) {
  return dbService.deleteProject(companyId, id);
}

async function getCompanyInfo(companyId) {
  return dbService.getCompanyInfo(companyId);
}

async function updateCompanyInfo(companyId, payload) {
  const current = await getCompanyInfo(companyId);
  const next = {
    ...current,
    ...payload,
    leadership: Array.isArray(payload.leadership) ? payload.leadership : current.leadership,
    areas: Array.isArray(payload.areas) ? payload.areas : current.areas,
    projectTypes: Array.isArray(payload.projectTypes) ? payload.projectTypes : current.projectTypes,
  };
  return dbService.updateCompanyInfo(companyId, next);
}

async function getRelevantProjectInfo(companyId, transcript) {
  if (!transcript || !transcript.trim()) return '';

  const lower = transcript.toLowerCase().trim();

  // ── Fast keyword gate: skip all RAG when no property terms detected ─────────
  // This avoids the OpenAI Ada-002 embedding call (~300-500 ms) on every
  // conversational turn like greetings, confirmations, and off-topic replies.
  const hasKeyword = TRIGGER_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
  if (!hasKeyword) return '';

  // ── Short transcript with keywords: skip embedding, use keyword match ────────
  // Very short utterances (e.g. "plot?") can't produce a useful embedding vector
  // but the keyword check above already confirmed relevance.
  if (lower.length < 20) {
    console.log(`[RAG] Short transcript (${lower.length} chars) — skipping embedding, using keyword fallback`);
    const fallback = await keywordFallback(companyId, transcript);
    if (fallback) return fallback;
    const allProjects = await listProjects(companyId);
    return formatProjectsForPrompt(allProjects.slice(0, 3));
  }

  async function keywordThenTop3SafetyNet(logVectorEmpty) {
    if (logVectorEmpty) console.log('[RAG] Vector search empty, falling back to keyword matching');
    const fallback = await keywordFallback(companyId, transcript);
    if (fallback) return fallback;
    const allProjects = await listProjects(companyId);
    return formatProjectsForPrompt(allProjects.slice(0, 3));
  }

  try {
    // Try vector search first
    const { getEmbedding } = require('./embeddingService');
    const { getSupabase } = require('./supabaseClient');

    const embedding = await getEmbedding(transcript);
    const supabase = getSupabase();

    const formattedEmbedding = `[${embedding.join(',')}]`;

    const { data: vectorResults, error } = await supabase.rpc('match_projects', {
      query_embedding: formattedEmbedding,
      match_company_id: companyId,
      match_threshold: 0.15,
      match_count: 3,
    });

    if (error) {
      console.warn('[RAG] RPC error:', error.message);
      return keywordThenTop3SafetyNet(false);
    }

    if (vectorResults && vectorResults.length > 0) {
      console.log(`[RAG] Vector search found ${vectorResults.length} projects`);
      return formatProjectsForPrompt(vectorResults);
    }

    // Vector search empty — use keyword fallback then top 3 safety net
    return keywordThenTop3SafetyNet(true);
  } catch (err) {
    // If embedding fails (e.g. OpenAI down), fall back gracefully
    console.warn('[RAG] Vector search failed, using keyword fallback:', err.message);
    return keywordThenTop3SafetyNet(false);
  }
}

async function keywordFallback(companyId, transcript) {
  const lower = transcript.toLowerCase();
  const isRelevant = TRIGGER_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
  if (!isRelevant) return '';

  const projects = await listProjects(companyId);
  const matched = projects.filter((p) =>
    (p.keywords || []).some((kw) => lower.includes(String(kw).toLowerCase()))
  );
  const list = matched.length > 0 ? matched : projects.slice(0, 3);
  return formatProjectsForPrompt(list);
}

function formatProjectsForPrompt(projects) {
  return projects
    .map(
      (p) =>
        `Project: ${p.name}\n` +
        `Type: ${p.type}\n` +
        `Location: ${p.location}\n` +
        `Description: ${p.description}\n` +
        `Highlights: ${p.highlights || ''}\n` +
        `Offer: ${p.offer}\n` +
        `Amenities: ${(p.amenities || []).slice(0, 5).join(', ')}\n` +
        `Site Visit: ${p.siteVisitAvailable ? 'Available' : 'Contact us'}\n` +
        `Website: ${p.url}`
    )
    .join('\n\n---\n\n');
}

module.exports = {
  getRelevantProjectInfo,
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getCompanyInfo,
  updateCompanyInfo,
};
