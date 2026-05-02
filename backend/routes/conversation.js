const express = require('express');
const multer = require('multer');
const { transcribeAudio } = require('../services/sttService');
const { generateResponse, clearSession } = require('../services/chatService');
const { synthesizeSpeech } = require('../services/ttsService');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

// Fallback Telugu message when something goes wrong
const FALLBACK_MESSAGE = 'క్షమించండి, ఒక చిన్న సమస్య వచ్చింది. మళ్ళీ ప్రయత్నించగలరా?';

/**
 * POST /api/conversation
 * Full pipeline: audio → STT → LLM → TTS → response
 * Body: multipart/form-data with `audio` file and `sessionId` field
 */
router.post('/conversation', upload.single('audio'), async (req, res) => {
  const requestStartMs = Date.now();
  const sessionId = req.body.sessionId;

  if (!req.file) {
    return res.status(400).json({ error: 'No audio file received' });
  }
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  const sttModel   = req.body.sttModel    || 'saaras:v3';
  const ttsProvider = req.body.ttsProvider || 'sarvam';
  const ttsModel   = req.body.ttsModel    || 'bulbul:v3';
  const ttsVoice   = req.body.ttsVoice    || 'shubh';

  console.log(`[Conversation] sessionId=${sessionId} | audio=${req.file.size}b | stt=${sttModel} | tts=${ttsProvider}/${ttsModel}/${ttsVoice}`);

  let transcript = '';
  let aiText = '';
  let audioBase64 = '';
  let stage = 'stt';

  try {
    // Stage 1: Speech to text
    const sttStartMs = Date.now();
    transcript = await transcribeAudio(req.file.buffer, req.file.mimetype, sttModel);
    const sttMs = Date.now() - sttStartMs;
    console.log(`[STT] Transcript: "${transcript}"`);

    // Stage 2: Generate AI response
    stage = 'llm';
    const llmStartMs = Date.now();
    aiText = await generateResponse(transcript, sessionId);
    const llmMs = Date.now() - llmStartMs;
    console.log(`[LLM] Response: "${aiText}"`);

    // Stage 3: Text to speech
    stage = 'tts';
    const ttsStartMs = Date.now();
    audioBase64 = await synthesizeSpeech(aiText, ttsVoice, ttsModel);
    const ttsMs = Date.now() - ttsStartMs;
    console.log(`[TTS] Audio generated, base64 length=${audioBase64.length}`);
    console.log(
      `[Latency][REST] session=${sessionId} stt_ms=${sttMs} llm_ms=${llmMs} tts_ms=${ttsMs} total_ms=${Date.now() - requestStartMs}`
    );

    res.json({ transcript, aiText, audioBase64 });
  } catch (err) {
    console.error(`[Conversation Error at ${stage}]`, err.message);

    // Return partial data with fallback so the frontend can still show transcript
    const statusCode = err.response?.status === 401 ? 401 : 500;
    res.status(statusCode).json({
      error: err.message,
      stage,
      transcript: transcript || '',
      aiText: aiText || FALLBACK_MESSAGE,
      audioBase64: '',
    });
  }
});

/**
 * POST /api/session/clear
 * Clears conversation history for a session
 */
router.post('/session/clear', express.json(), (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  clearSession(sessionId);
  res.json({ success: true });
});

module.exports = router;
