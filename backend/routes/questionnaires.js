const express = require('express');
const {
  listQuestionnaires,
  getQuestionnaire,
  createQuestionnaire,
  updateQuestionnaire,
  deleteQuestionnaire,
} = require('../services/db');
const { sendSuccess, sendError } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

const ALLOWED_TYPES = new Set(['text', 'single_choice', 'multi_choice']);

function normalizeQuestions(bodyQuestions) {
  if (!Array.isArray(bodyQuestions)) return [];
  return bodyQuestions.map((q, idx) => {
    const type = ALLOWED_TYPES.has(q?.type) ? q.type : 'text';
    const prompt = String(q?.prompt || '').trim();
    let options = [];
    if (Array.isArray(q?.options)) {
      options = q.options.map((o) => String(o || '').trim()).filter(Boolean);
    }
    if ((type === 'single_choice' || type === 'multi_choice') && options.length === 0) {
      options = ['Yes', 'No'];
    }
    return {
      sortOrder: Number.isFinite(Number(q?.sortOrder)) ? Number(q.sortOrder) : idx,
      type,
      prompt: prompt || `Question ${idx + 1}`,
      options: type === 'text' ? [] : options,
      required: q?.required !== false,
    };
  });
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await listQuestionnaires(req.companyId);
    return sendSuccess(res, { questionnaires: rows });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await getQuestionnaire(req.companyId, req.params.id);
    if (!row) return sendError(res, 404, 'Questionnaire not found');
    return sendSuccess(res, { questionnaire: row });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) return sendError(res, 400, 'Name is required');
    const description = String(body.description || '').trim();
    const questions = normalizeQuestions(body.questions);
    const created = await createQuestionnaire(req.companyId, { name, description, questions });
    return sendSuccess(res, { questionnaire: created }, {}, 201);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) return sendError(res, 400, 'Name is required');
    const description = String(body.description || '').trim();
    const questions = normalizeQuestions(body.questions);
    const updated = await updateQuestionnaire(req.companyId, req.params.id, { name, description, questions });
    if (!updated) return sendError(res, 404, 'Questionnaire not found');
    return sendSuccess(res, { questionnaire: updated });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const ok = await deleteQuestionnaire(req.companyId, req.params.id);
    if (!ok) return sendError(res, 404, 'Questionnaire not found');
    return sendSuccess(res, { deleted: true });
  })
);

module.exports = router;
