const fs = require('fs/promises');
const path = require('path');

const PROJECTS_FILE = path.resolve(__dirname, '../data/projects.json');
const COMPANY_FILE = path.resolve(__dirname, '../data/companyInfo.json');

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
let writeQueue = Promise.resolve();

function queueWrite(task) {
  writeQueue = writeQueue.then(task, task);
  return writeQueue;
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallbackValue;
    throw err;
  }
}

async function writeJsonAtomic(filePath, payload) {
  const tempPath = `${filePath}.tmp`;
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  await fs.writeFile(tempPath, body, 'utf8');
  await fs.rename(tempPath, filePath);
}

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

async function listProjects() {
  return readJson(PROJECTS_FILE, []);
}

async function getProjectById(id) {
  const projects = await listProjects();
  return projects.find((p) => p.id === id) || null;
}

async function createProject(payload) {
  return queueWrite(async () => {
    const projects = await listProjects();
    const project = normalizeProject(payload);
    if (projects.some((p) => p.id === project.id)) {
      throw new Error('Project id already exists');
    }
    const next = [...projects, project];
    await writeJsonAtomic(PROJECTS_FILE, next);
    return project;
  });
}

async function updateProject(id, payload) {
  return queueWrite(async () => {
    const projects = await listProjects();
    const idx = projects.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error('Project not found');

    const merged = normalizeProject({ ...projects[idx], ...payload, id }, projects[idx]);
    const next = [...projects];
    next[idx] = merged;
    await writeJsonAtomic(PROJECTS_FILE, next);
    return merged;
  });
}

async function deleteProject(id) {
  return queueWrite(async () => {
    const projects = await listProjects();
    const next = projects.filter((p) => p.id !== id);
    if (next.length === projects.length) return false;
    await writeJsonAtomic(PROJECTS_FILE, next);
    return true;
  });
}

async function getCompanyInfo() {
  return readJson(COMPANY_FILE, {});
}

async function updateCompanyInfo(payload) {
  return queueWrite(async () => {
    const current = await getCompanyInfo();
    const next = {
      ...current,
      ...payload,
      leadership: Array.isArray(payload.leadership) ? payload.leadership : current.leadership,
      areas: Array.isArray(payload.areas) ? payload.areas : current.areas,
      projectTypes: Array.isArray(payload.projectTypes) ? payload.projectTypes : current.projectTypes,
    };
    await writeJsonAtomic(COMPANY_FILE, next);
    return next;
  });
}

async function getRelevantProjectInfo(transcript) {
  const lower = transcript.toLowerCase();
  const isRelevant = TRIGGER_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
  if (!isRelevant) return '';

  const projects = await listProjects();

  // Match projects by their keywords
  const matched = projects.filter((p) =>
    (p.keywords || []).some((kw) => lower.includes(String(kw).toLowerCase()))
  );

  // Return matched projects, or top 5 most relevant if no keyword match
  const list = matched.length > 0 ? matched : projects.slice(0, 5);

  return list
    .map(
      (p) =>
        `Project: ${p.name} (${p.nameTeluguHint})\n` +
        `Type: ${p.type}\n` +
        `Location: ${p.location}\n` +
        `Description: ${p.description}\n` +
        `Highlights: ${p.highlights}\n` +
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
