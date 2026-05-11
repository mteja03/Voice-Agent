const express = require('express');
const { listRecentCalls, listCallsForLead } = require('../services/db');
const { getSupabase } = require('../services/supabaseClient');
const callRecording = require('../services/callRecording');
const { sendSuccess } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
const SIGNED_URL_TTL_SEC = 3600;

async function toClientCall(row, supabase) {
  let recordingUserUrl = null;
  let recordingAgentUrl = null;
  if (row.recording_user_path) {
    const { data } = await supabase.storage
      .from(callRecording.BUCKET)
      .createSignedUrl(row.recording_user_path, SIGNED_URL_TTL_SEC);
    recordingUserUrl = data?.signedUrl || null;
  }
  if (row.recording_agent_path) {
    const { data } = await supabase.storage
      .from(callRecording.BUCKET)
      .createSignedUrl(row.recording_agent_path, SIGNED_URL_TTL_SEC);
    recordingAgentUrl = data?.signedUrl || null;
  }
  return {
    id: row.id,
    createdAt: row.created_at,
    duration: row.duration,
    outcome: row.outcome,
    summary: row.summary,
    leadId: row.lead_id || null,
    leadPhone: row.lead_phone || null,
    leadName: row.lead_name || null,
    transcript: Array.isArray(row.transcript) ? row.transcript : [],
    recordingUserUrl,
    recordingAgentUrl,
  };
}

router.get(
  '/recent',
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit) || 25;
    const rows = await listRecentCalls(req.companyId, limit);
    const supabase = getSupabase();
    const calls = await Promise.all(
      (rows || []).map((row) => toClientCall(row, supabase))
    );
    return sendSuccess(res, { calls });
  })
);

router.get(
  '/lead-history',
  asyncHandler(async (req, res) => {
    const leadId = String(req.query.leadId || '').trim();
    const leadPhone = String(req.query.phone || '').trim();
    const limit = Number(req.query.limit) || 20;
    const rows = await listCallsForLead(req.companyId, { leadId, leadPhone }, limit);
    const supabase = getSupabase();
    const calls = await Promise.all((rows || []).map((row) => toClientCall(row, supabase)));
    return sendSuccess(res, { calls });
  })
);

module.exports = router;
