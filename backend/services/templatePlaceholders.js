/**
 * Resolves {tokens} in intro / voicemail / consent templates.
 * Time tokens use CONVERSATION_TEMPLATE_TZ (default Asia/Kolkata).
 */

const DEFAULT_LEAD_NAME = 'కస్టమర్';
const DEFAULT_TIMEZONE = process.env.CONVERSATION_TEMPLATE_TZ || 'Asia/Kolkata';

function trimStr(v) {
  if (v == null) return '';
  return String(v).trim();
}

function joinList(val) {
  if (Array.isArray(val)) {
    return val.map((x) => trimStr(x)).filter(Boolean).join(', ');
  }
  return trimStr(val);
}

function formatInTz(date, tz, parts) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: tz, ...parts }).format(date);
}

/**
 * @param {object} opts
 * @param {object} [opts.lead]
 * @param {object} [opts.companyInfo]
 * @param {string} [opts.agentName]
 * @param {Date} [opts.referenceDate]
 * @returns {Record<string, string>}
 */
function buildPlaceholderValues(opts = {}) {
  const lead = opts.lead || {};
  const companyInfo = opts.companyInfo || {};
  const agentName = trimStr(opts.agentName) || 'Voice Agent';
  const tz = trimStr(opts.timezone) || DEFAULT_TIMEZONE;
  const d = opts.referenceDate instanceof Date ? opts.referenceDate : new Date(opts.referenceDate || Date.now());

  const leadNameRaw = trimStr(lead.name);
  const leadName = leadNameRaw || DEFAULT_LEAD_NAME;
  const leadFirstName = leadNameRaw ? leadNameRaw.split(/\s+/)[0] : '';

  const companyName = trimStr(companyInfo.name) || agentName;

  return {
    leadName,
    leadFirstName,
    leadPhone: trimStr(lead.phone),
    leadLocation: trimStr(lead.location),
    leadBudget: trimStr(lead.budget),
    leadSource: trimStr(lead.source),
    leadNotes: trimStr(lead.notes),
    leadOutcome: trimStr(lead.lastOutcome || lead.status),
    leadNextAction: trimStr(lead.nextAction),
    leadFollowupDate: trimStr(lead.followupDate),
    leadId: trimStr(lead.id),
    agentName,
    companyName,
    companyTagline: trimStr(companyInfo.tagline),
    companyPhone: trimStr(companyInfo.phone),
    companyEmail: trimStr(companyInfo.email),
    companyWebsite: trimStr(companyInfo.website),
    companyHeadOffice: trimStr(companyInfo.headOffice),
    companyAreas: joinList(companyInfo.areas),
    companyProjectTypes: joinList(companyInfo.projectTypes),
    companySocialFacebook: trimStr(companyInfo.socialFacebook),
    dateToday: formatInTz(d, tz, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    dateShort: new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d),
    timeNow: formatInTz(d, tz, { hour: '2-digit', minute: '2-digit' }),
    weekday: formatInTz(d, tz, { weekday: 'long' }),
    year: formatInTz(d, tz, { year: 'numeric' }),
    monthName: formatInTz(d, tz, { month: 'long' }),
    dayNumber: formatInTz(d, tz, { day: 'numeric' }),
    timezone: tz,
  };
}

/**
 * @param {string} template
 * @param {object} context — same fields as buildPlaceholderValues
 * @returns {string}
 */
function renderConversationTemplate(template, context = {}) {
  if (template == null) return '';
  const values = buildPlaceholderValues(context);
  let out = String(template);
  const keys = Object.keys(values).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const token = `{${key}}`;
    const val = values[key] == null ? '' : String(values[key]);
    out = out.split(token).join(val);
  }
  return out;
}

module.exports = {
  renderConversationTemplate,
  buildPlaceholderValues,
  DEFAULT_LEAD_NAME,
  DEFAULT_TIMEZONE,
};
