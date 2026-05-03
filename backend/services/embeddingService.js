const OpenAI = require('openai');

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !String(key).trim()) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  return new OpenAI({ apiKey: key.trim() });
}

async function getEmbedding(text) {
  const input = String(text || '').trim();
  if (!input) return [];
  const openai = getOpenAI();
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input,
  });
  return response?.data?.[0]?.embedding || [];
}

function buildProjectText(project = {}) {
  const toText = (value) => String(value || '').trim();
  const amenities = Array.isArray(project.amenities)
    ? project.amenities.map((v) => toText(v)).filter(Boolean).join(', ')
    : '';
  const keywords = Array.isArray(project.keywords)
    ? project.keywords.map((v) => toText(v)).filter(Boolean).join(', ')
    : '';

  return [
    toText(project.name),
    toText(project.nameTeluguHint),
    toText(project.type),
    toText(project.location),
    toText(project.locationTeluguHint),
    toText(project.description),
    toText(project.highlights),
    toText(project.offer),
    amenities,
    keywords,
  ]
    .filter(Boolean)
    .join('\n');
}

async function embedProject(project) {
  const text = buildProjectText(project);
  return getEmbedding(text);
}

module.exports = {
  getEmbedding,
  buildProjectText,
  embedProject,
};
