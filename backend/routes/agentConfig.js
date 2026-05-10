const express = require('express');
const { getAgentConfigRow, upsertAgentConfig } = require('../services/db');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/response');

const router = express.Router();

const DEFAULT_AGENT_CONFIG = {
  agentName: 'Voice Agent',
  ttsVoice: 'shubh',
  ttsModel: 'bulbul:v3',
  sttModel: 'saarika:v2.5',
  languageMode: 'telugu',
  autoEndCall: true,
  introTemplate:
    'హలో {leadName} గారు, నేను {agentName} నుండి మాట్లాడుతున్నాను. మీకు ఇది మాట్లాడటానికి సరైన సమయమా?',
  ttsProvider: 'sarvam',
};

function agentConfigFromRow(row) {
  const s = row?.settings && typeof row.settings === 'object' ? row.settings : {};
  const strip = new Set([
    'agentName',
    'ttsVoice',
    'ttsModel',
    'sttModel',
    'languageMode',
    'autoEndCall',
    'introTemplate',
    'ttsProvider',
    'language',
    'tone',
  ]);
  const extra = Object.fromEntries(Object.entries(s).filter(([k]) => !strip.has(k)));

  return {
    ...extra,
    agentName: row?.agent_name ?? DEFAULT_AGENT_CONFIG.agentName,
    introTemplate: row?.intro_template ?? DEFAULT_AGENT_CONFIG.introTemplate,
    languageMode: row?.language ?? s.languageMode ?? DEFAULT_AGENT_CONFIG.languageMode,
    ttsVoice: s.ttsVoice ?? DEFAULT_AGENT_CONFIG.ttsVoice,
    ttsModel: s.ttsModel ?? DEFAULT_AGENT_CONFIG.ttsModel,
    sttModel: s.sttModel ?? DEFAULT_AGENT_CONFIG.sttModel,
    autoEndCall:
      s.autoEndCall !== undefined ? Boolean(s.autoEndCall) : DEFAULT_AGENT_CONFIG.autoEndCall,
    ttsProvider: s.ttsProvider ?? DEFAULT_AGENT_CONFIG.ttsProvider,
  };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const row = await getAgentConfigRow(req.companyId);
    if (!row) {
      return sendSuccess(res, { agentConfig: DEFAULT_AGENT_CONFIG });
    }
    return sendSuccess(res, { agentConfig: agentConfigFromRow(row) });
  })
);

router.put(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.body || typeof req.body !== 'object') {
      return sendError(res, 400, 'Request body is required');
    }
    const updated = await upsertAgentConfig(req.companyId, req.body);
    return sendSuccess(res, { agentConfig: agentConfigFromRow(updated) });
  })
);

module.exports = router;
