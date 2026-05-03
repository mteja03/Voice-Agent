const express = require('express');
const multer = require('multer');
const { transcribeAudio } = require('../services/sttService');
const { generateResponse, clearSession } = require('../services/chatService');
const { synthesizeSpeech } = require('../services/ttsService');
const { safeClientMessage } = require('../utils/sanitize');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/response');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

const FALLBACK_MESSAGE = 'క్షమించండి, ఒక చిన్న సమస్య వచ్చింది. మళ్ళీ ప్రయత్నించగలరా?';
const STT_FALLBACK_MESSAGE = 'క్షమించండి, మళ్లీ చెబుతారా?';

/**
 * POST /api/conversation
 * Full pipeline: audio → STT → LLM → TTS → response
 */
router.post(
  '/conversation',
  upload.single('audio'),
  asyncHandler(async (req, res) => {
    const requestStartMs = Date.now();
    const sessionId = req.body.sessionId;

    if (!req.file) {
      return sendError(res, 400, 'No audio file received');
    }
    if (!sessionId) {
      return sendError(res, 400, 'sessionId is required');
    }

    const sttModel = req.body.sttModel || 'saaras:v3';
    const ttsProvider = req.body.ttsProvider || 'sarvam';
    const ttsModel = req.body.ttsModel || 'bulbul:v3';
    const ttsVoice = req.body.ttsVoice || 'shubh';

    console.log(
      `[Conversation] sessionId=${sessionId} | audio=${req.file.size}b | stt=${sttModel} | tts=${ttsProvider}/${ttsModel}/${ttsVoice}`
    );

    let transcript = '';
    let aiText = '';
    let audioBase64 = '';
    let stage = 'stt';

    try {
      const sttStartMs = Date.now();
      transcript = await transcribeAudio(req.file.buffer, req.file.mimetype, sttModel);
      if (!transcript) {
        return sendSuccess(res, {
          transcript: '',
          aiText: STT_FALLBACK_MESSAGE,
          audioBase64: '',
        });
      }
      const sttMs = Date.now() - sttStartMs;
      console.log(`[STT] Transcript: "${transcript}"`);

      stage = 'llm';
      const llmStartMs = Date.now();
      aiText = await generateResponse(transcript, sessionId, req.companyId);
      const llmMs = Date.now() - llmStartMs;
      console.log(`[LLM] Response: "${aiText}"`);

      stage = 'tts';
      const ttsStartMs = Date.now();
      audioBase64 = await synthesizeSpeech(aiText, ttsVoice, ttsModel);
      const ttsMs = Date.now() - ttsStartMs;
      console.log(`[TTS] Audio generated, base64 length=${audioBase64.length}`);
      console.log(
        `[Latency][REST] session=${sessionId} stt_ms=${sttMs} llm_ms=${llmMs} tts_ms=${ttsMs} total_ms=${Date.now() - requestStartMs}`
      );

      return sendSuccess(res, { transcript, aiText, audioBase64 });
    } catch (err) {
      console.error(`[Conversation Error at ${stage}]`, err.message);
      const statusCode = err.response?.status === 401 ? 401 : 500;
      return sendError(res, statusCode, safeClientMessage(err));
    }
  })
);

router.post(
  '/session/clear',
  express.json(),
  asyncHandler(async (req, res) => {
    const { sessionId } = req.body || {};
    if (!sessionId) {
      return sendError(res, 400, 'sessionId required');
    }
    await clearSession(req.companyId, sessionId);
    return sendSuccess(res, { cleared: true });
  })
);

module.exports = router;
