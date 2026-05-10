require('dotenv').config();

const isProdLike =
  process.env.NODE_ENV === 'production' ||
  Boolean(process.env.RAILWAY_ENVIRONMENT);
const requiredEnvVars = [
  'OPENAI_API_KEY',
  'SARVAM_API_KEY',
  'SUPABASE_URL',
  'JWT_SECRET',
  ...(isProdLike ? ['SUPABASE_SERVICE_ROLE_KEY'] : []),
];
const missingEnvVars = requiredEnvVars.filter((name) => !String(process.env[name] || '').trim());

if (missingEnvVars.length > 0) {
  for (const name of missingEnvVars) {
    console.error(`[Startup] Missing required environment variable: ${name}`);
  }
  process.exit(1);
}

console.info(`[Startup] env_validated vars_checked=${requiredEnvVars.length}`);
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');

const authRouter = require('./routes/auth');
const conversationRouter = require('./routes/conversation');
const knowledgeBaseRouter = require('./routes/knowledgeBase');
const analyticsRouter = require('./routes/analytics');
const agentConfigRouter = require('./routes/agentConfig');
const tenantsRouter = require('./routes/tenants');
const { authMiddleware } = require('./middleware/auth');
const { requireCompanyId } = require('./middleware/tenant');
const { requestIdMiddleware } = require('./middleware/requestContext');
const { verifyAccessToken } = require('./utils/authUtils');
const { sendSuccess, sendError } = require('./utils/response');
const asyncHandler = require('./utils/asyncHandler');
const { errorHandler: expressErrorHandler, notFoundHandler } = require('./utils/errorHandler');
const { emitSocketError } = require('./utils/socketEmit');
const { verifyUserContext, loadVerifiedUserContext } = require('./middleware/verifyUserContext');
const { getCompanyInfo } = require('./services/knowledgeBase');
const { renderConversationTemplate, DEFAULT_LEAD_NAME } = require('./services/templatePlaceholders');
const { transcribeAudio } = require('./services/sttService');
const { generateResponseStream, generateCallSummary, clearSession } = require('./services/chatService');
const { synthesizeSpeech } = require('./services/ttsService');
const { saveMessage, logCall, getSessionMessages } = require('./services/db');
const { safeClientMessage } = require('./utils/sanitize');
const { logger } = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3001;
const { OPENAI_API_KEY, SARVAM_API_KEY } = process.env;
// Defaults match .env.example so local (with example) and Railway (no overrides) behave the same.
const TTS_FIRST_CHUNK_MIN_CHARS = Number(process.env.TTS_FIRST_CHUNK_MIN_CHARS || 20);
const TTS_NEXT_CHUNK_MIN_CHARS = Number(process.env.TTS_NEXT_CHUNK_MIN_CHARS || 30);
const TTS_CHUNK_MAX_CHARS = Number(process.env.TTS_CHUNK_MAX_CHARS || 100);
const TTS_FLUSH_SUBSTANTIAL_MIN_CHARS = Number(process.env.TTS_FLUSH_SUBSTANTIAL_MIN_CHARS || 20);
const END_CALL_MARKER = '[END_CALL]';
const ALLOWED_ORIGINS = String(
  process.env.ALLOWED_ORIGINS ||
  'https://voice-agent-three-ecru.vercel.app,http://localhost:5173'
)
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

function resolveTrustProxy(value) {
  const isProd = process.env.NODE_ENV === 'production';
  const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
  if (value == null || value === '') return isProd || isRailway ? 1 : false;
  if (value === 'true') return true;
  if (value === 'false') return isProd || isRailway ? 1 : false;
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : value;
}

app.set('trust proxy', resolveTrustProxy(process.env.TRUST_PROXY));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    sendError(res, 429, 'Too many authentication attempts, please try again later'),
});

app.use(helmet());
app.use(cors({
  origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : true,
  credentials: true,
}));
app.use(express.json());
app.use(requestIdMiddleware);
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/tenants', authMiddleware, verifyUserContext, tenantsRouter);
app.use('/api', authMiddleware, verifyUserContext, requireCompanyId, conversationRouter);
app.use('/api/kb', authMiddleware, verifyUserContext, requireCompanyId, knowledgeBaseRouter);
app.use('/api/analytics', authMiddleware, verifyUserContext, requireCompanyId, analyticsRouter);
app.use('/api/agent-config', authMiddleware, verifyUserContext, requireCompanyId, agentConfigRouter);

app.get('/', (req, res) => {
  res.send('Server is running');
});

app.get('/health', (req, res) => {
  sendSuccess(res, { status: 'ok', service: 'Voice Agent' });
});

app.get(
  '/api/ready',
  asyncHandler(async (req, res) => {
    const { checkOpenAIKey } = require('./services/chatService');
    const probe = String(req.query.probe || '') === '1';
    const env = {
      hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
      hasSarvamKey: Boolean(process.env.SARVAM_API_KEY),
      hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
      hasSupabaseServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasJwtSecret: Boolean(process.env.JWT_SECRET),
      allowedOrigins: ALLOWED_ORIGINS,
      port: Number(process.env.PORT || PORT),
    };
    if (!probe) {
      return sendSuccess(res, { ok: true, service: 'Voice Agent', env });
    }
    try {
      const openai = await checkOpenAIKey();
      const probeOk = openai?.ok !== false;
      const data = {
        ok: probeOk,
        service: 'Voice Agent',
        env,
        openai,
      };
      return sendSuccess(res, data, {}, probeOk ? 200 : 503);
    } catch (e) {
      return sendSuccess(
        res,
        {
          ok: false,
          service: 'Voice Agent',
          env,
          openai: { ok: false, error: safeClientMessage(e) },
        },
        {},
        503
      );
    }
  })
);

app.use(notFoundHandler);
app.use(expressErrorHandler);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : true,
    methods: ['GET', 'POST'],
  },
  // Longer heartbeats help behind Railway / reverse proxies and mobile radios.
  pingInterval: 25000,
  pingTimeout: 60000,
  connectTimeout: 45000,
});

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  const result = verifyAccessToken(process.env.JWT_SECRET, token);
  if (!result.ok) {
    logger.warn('socket_auth_rejected', {
      code: result.code,
      socketId: socket.id,
    });
    const msg = result.code === 'token_expired' ? 'Token expired' : 'Unauthorized';
    return next(new Error(msg));
  }
  try {
    const ctx = await loadVerifiedUserContext(result.payload);
    if (!ctx.ok) {
      logger.warn('socket_auth_rejected', { code: ctx.code, socketId: socket.id });
      const msg =
        ctx.code === 'company_missing'
          ? 'Organization is no longer available'
          : 'Unauthorized';
      return next(new Error(msg));
    }
    socket.user = ctx.user;
    return next();
  } catch {
    logger.warn('socket_auth_rejected', { code: 'verify_failed', socketId: socket.id });
    return next(new Error('Unauthorized'));
  }
});

// ─── Per-socket cancellation tracking ────────────────────────────────────────
// Each socket gets an AbortController so we can cancel in-flight processing
// when the user barges in.
const activeSessions = new Map(); // socketId → AbortController
const sessionStartTimes = new Map(); // sessionId → startTime in ms
const socketNoiseCounts = new Map(); // socketId → consecutive no-speech count
// Keep this strict to avoid accidental auto-hangups during normal polite replies.
const CLOSING_SIGNAL_REGEX = /(మళ్ళీ మాట్లాడుదాం|వీడ్కోలు|goodbye|bye|have a great day|हम फिर बात करेंगे)/i;
const STT_TIMEOUT_MS = 15000;
const TTS_TIMEOUT_MS = 20000;
// After this many consecutive empty/low-signal turns, emit a gentle "can you hear me?" nudge.
const STT_NOISE_NUDGE_THRESHOLD = 2;
const STT_NOISE_NUDGE_TEXT = 'మీరు వినపడుతున్నారా? మీరు మాట్లాడవచ్చు.';

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function splitForTts(buffer, isFirstChunk) {
  const minChars = isFirstChunk ? TTS_FIRST_CHUNK_MIN_CHARS : TTS_NEXT_CHUNK_MIN_CHARS;
  const maxChars = TTS_CHUNK_MAX_CHARS;
  const text = (buffer || '').trimStart();
  if (!text) return null;

  const window = text.slice(0, Math.min(text.length, maxChars));
  // Include Telugu danda (।), full-stop variants, comma for clause splitting
  const punctuationMatches = [...window.matchAll(/[.!?।।॥\n]/g)];
  const firstPunctuationIdx = punctuationMatches.length ? punctuationMatches[0].index : -1;
  const lastPunctuationIdx = punctuationMatches.length
    ? punctuationMatches[punctuationMatches.length - 1].index
    : -1;
  const punctuationWithinMax = isFirstChunk ? firstPunctuationIdx : lastPunctuationIdx;

  if (punctuationWithinMax >= 0) {
    const endIdx = punctuationWithinMax + 1;
    if (endIdx >= minChars || text.length >= maxChars) {
      const chunk = text.slice(0, endIdx).trim();
      const rest = text.slice(endIdx).trimStart();
      return chunk.length > 3 ? { chunk, rest } : null;
    }
    return null;
  }

  if (text.length >= maxChars) {
    const lastSpace = window.lastIndexOf(' ');
    const endIdx = lastSpace > 20 ? lastSpace : maxChars;
    const chunk = text.slice(0, endIdx).trim();
    const rest = text.slice(endIdx).trimStart();
    return chunk.length > 3 ? { chunk, rest } : null;
  }

  return null;
}

function resolveLanguageCode(languageMode) {
  if (languageMode === 'english') return 'en-IN';
  if (languageMode === 'hindi') return 'hi-IN';
  if (languageMode === 'auto') return 'te-IN';
  return 'te-IN';
}

function resolveSttLanguageCode(languageMode) {
  if (languageMode === 'english') return 'en-IN';
  if (languageMode === 'hindi') return 'hi-IN';
  if (languageMode === 'auto') return 'unknown';
  return 'te-IN';
}

function isEmptySttError(err) {
  return String(err?.message || '').toLowerCase().includes('empty transcript');
}

function normalizeTtsText(text = '') {
  // Strip accidental wrapping quotes from generated content before TTS.
  return String(text)
    .replaceAll(END_CALL_MARKER, '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim();
}

/** Remove streaming/encoding artifacts so we do not feed TTS broken UTF-8 tails. */
function stripTtsFlushArtifacts(text = '') {
  let s = String(text).replace(/\uFFFD+/g, '').trimEnd();
  if (!s) return s;
  const lastCode = s.charCodeAt(s.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    s = s.slice(0, -1).trimEnd();
  }
  return s;
}

/**
 * If the model stopped mid-word, the last token is often a 1–3 char Telugu fragment; drop it so we do not speak gibberish.
 */
function trimLikelyClippedTeluguTail(s) {
  const t = String(s).trimEnd();
  if (t.length < 6) return t;
  const re = /([\s\u200c\u200d]+)([^\s\u200c\u200d]+)$/u;
  const m = t.match(re);
  if (!m) return t;
  const lastWord = m[2];
  const teluguOnly = /^[\u0C00-\u0C7F]+$/u.test(lastWord);
  if (teluguOnly && lastWord.length <= 3 && !/[.!?।,;:…\u0964\u0965]$/u.test(lastWord)) {
    return t.slice(0, t.length - lastWord.length).trimEnd();
  }
  return t;
}

function shouldFlushTtsRemainder(sentence) {
  if (!sentence || sentence.length < 3) return false;
  // Clause/sentence end (Telugu often uses ASCII . ? ! or danda; commas are common before flush).
  if (/[.!?।,;:…\u0964\u0965]$/u.test(sentence)) return true;
  // Stream ended without punctuation but we already have enough to speak (better than dropping the whole tail).
  if (sentence.length >= TTS_FLUSH_SUBSTANTIAL_MIN_CHARS) return true;
  return false;
}

function isLowSignalTranscript(text = '') {
  const cleaned = String(text).trim();
  if (!cleaned) return true;
  // Ignore micro-utterances/noise like "ఆ.", "ం." that create false turns.
  if (cleaned.length < 3) return true;
  const hasTeluguChars = /[\u0C00-\u0C7F]/.test(cleaned);
  const isAsciiWordish = /^[a-zA-Z\s.,!?'-]+$/.test(cleaned);
  // Accept meaningful short English words like "Plot", "Villa", "Kakinada".
  if (!hasTeluguChars && isAsciiWordish && cleaned.length >= 4) return false;
  // Ignore very short non-Telugu snippets often produced by noise/echo.
  if (!hasTeluguChars && cleaned.length <= 6) return true;
  return false;
}

async function renderIntroMessage(companyId, lead, introTemplate, agentName) {
  const companyInfo = await getCompanyInfo(companyId);
  const template = (introTemplate || '').trim();
  const leadName = lead?.name ? `${lead.name}` : DEFAULT_LEAD_NAME;
  const safeAgentName = agentName || 'Voice Agent';
  if (!template) {
    return `హలో ${leadName} గారు, నేను ${safeAgentName} నుండి మాట్లాడుతున్నాను. మీకు ఇది మాట్లాడటానికి సరైన సమయమా?`;
  }
  return renderConversationTemplate(template, { lead, companyInfo, agentName: safeAgentName });
}

io.on('connection', (socket) => {
  if (!socket.user?.companyId || !socket.user?.userId) {
    logger.warn('socket_connection_rejected', { socketId: socket.id, reason: 'missing_user_context' });
    socket.disconnect(true);
    return;
  }
  const companyId = socket.user.companyId;
  logger.info('socket_connected', {
    socketId: socket.id,
    companyId,
    userId: socket.user.userId,
  });

  async function emitSingleTtsClip({ text, signal, socket, ttsModel, ttsVoice, languageMode }) {
    const normalizedText = normalizeTtsText(text);
    if (!normalizedText || normalizedText.length < 3 || signal.aborted) return { emitted: false, ttsMs: 0 };
    const ttsStart = nowMs();
    try {
      const ttsPromise = synthesizeSpeech(
        normalizedText,
        ttsVoice || 'shubh',
        ttsModel || 'bulbul:v3',
        resolveLanguageCode(languageMode)
      );
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TTS timeout after 20s')), TTS_TIMEOUT_MS)
      );
      const audioBase64 = await Promise.race([ttsPromise, timeoutPromise]);
      const ttsMs = nowMs() - ttsStart;
      if (!signal.aborted) {
        socket.emit('tts_audio_chunk', {
          audioBuffer: Buffer.from(audioBase64, 'base64'),
          text: normalizedText,
        });
        return { emitted: true, ttsMs };
      }
      return { emitted: false, ttsMs };
    } catch (ttsErr) {
      const ttsMs = nowMs() - ttsStart;
      if (String(ttsErr?.message || '').includes('timeout')) {
        console.warn('[TTS] Timeout — emitting text only');
        if (!signal.aborted) {
          socket.emit('tts_audio_chunk', { audioBuffer: null, text: normalizedText });
        }
        return { emitted: false, ttsMs };
      }
      throw ttsErr;
    }
  }

  async function streamAssistantResponse({ stream, signal, socket, companyId, sessionId, ttsModel, ttsVoice, languageMode, timingMeta }) {
    let sentenceBuffer = '';
    let fullAssistantMessage = '';
    let ttsChunks = 0;
    let ttsTotalMs = 0;
    let firstAudioAtMs = null;

    for await (const chunk of stream) {
      if (signal.aborted) {
        console.log(`[Barge-in] Stream cancelled mid-generation for ${socket.id}`);
        break;
      }

      const token = chunk.choices[0]?.delta?.content || '';
      sentenceBuffer += token;
      fullAssistantMessage += token;

      const split = splitForTts(sentenceBuffer, ttsChunks === 0);
      if (split) {
        const sentence = normalizeTtsText(split.chunk);
        sentenceBuffer = split.rest;
        if (signal.aborted || !sentence || sentence.length < 3) break;
        try {
          console.log(`[TTS Chunk] Synthesising: "${sentence}"`);
          const ttsStart = nowMs();
          const audioBase64 = await synthesizeSpeech(
            sentence, ttsVoice || 'shubh', ttsModel || 'bulbul:v3', resolveLanguageCode(languageMode)
          );
          const ttsMs = nowMs() - ttsStart;
          ttsTotalMs += ttsMs;
          ttsChunks += 1;
          if (!firstAudioAtMs) firstAudioAtMs = nowMs();
          if (!signal.aborted) {
            socket.emit('tts_audio_chunk', {
              audioBuffer: Buffer.from(audioBase64, 'base64'),
              text: sentence,
            });
          }
        } catch (ttsErr) {
          console.error('[TTS Chunk Error]', ttsErr.message);
          socket.emit('tts_audio_chunk', { audioBuffer: null, text: sentence });
        }
      }
    }

    if (!signal.aborted && sentenceBuffer.trim().length > 3) {
      try {
        let sentence = stripTtsFlushArtifacts(normalizeTtsText(sentenceBuffer));
        sentence = trimLikelyClippedTeluguTail(sentence);
        if (shouldFlushTtsRemainder(sentence)) {
          console.log(`[TTS Flush] Synthesising remainder: "${sentence}"`);
          const ttsStart = nowMs();
          const audioBase64 = await synthesizeSpeech(
            sentence, ttsVoice || 'shubh', ttsModel || 'bulbul:v3', resolveLanguageCode(languageMode)
          );
          const ttsMs = nowMs() - ttsStart;
          ttsTotalMs += ttsMs;
          ttsChunks += 1;
          if (!firstAudioAtMs) firstAudioAtMs = nowMs();
          if (!signal.aborted) {
            socket.emit('tts_audio_chunk', {
              audioBuffer: Buffer.from(audioBase64, 'base64'),
              text: sentence,
            });
          }
        } else if (sentence) {
          console.log(`[TTS Flush] Dropping short incomplete tail (${sentence.length} chars): "${sentence}"`);
        }
      } catch (ttsErr) {
        console.error('[TTS Flush Error]', ttsErr.message);
        socket.emit('tts_audio_chunk', {
          audioBuffer: null,
          text: trimLikelyClippedTeluguTail(stripTtsFlushArtifacts(normalizeTtsText(sentenceBuffer))),
        });
      }
    }

    if (!signal.aborted) {
      const cleanedAssistantMessage = normalizeTtsText(fullAssistantMessage);
      const shouldEndCall =
        fullAssistantMessage.includes(END_CALL_MARKER) || CLOSING_SIGNAL_REGEX.test(cleanedAssistantMessage);
      await saveMessage(companyId, sessionId, 'assistant', cleanedAssistantMessage);
      socket.emit('response_complete', {
        aiText: cleanedAssistantMessage,
        shouldEndCall,
      });

      if (timingMeta) {
        const doneAt = nowMs();
        const toFirstAudioMs = firstAudioAtMs ? firstAudioAtMs - timingMeta.requestStartMs : null;
        console.log(
          `[Latency] session=${sessionId} stt_ms=${timingMeta.sttMs ?? 'na'} llm_first_token_ms=${timingMeta.llmFirstTokenMs ?? 'na'} tts_chunks=${ttsChunks} tts_total_ms=${ttsTotalMs.toFixed(1)} ttf_audio_ms=${toFirstAudioMs != null ? toFirstAudioMs.toFixed(1) : 'na'} total_ms=${(doneAt - timingMeta.requestStartMs).toFixed(1)}`
        );
      }
    }
  }

  // ── Feature 2: Barge-in — cancel active processing ───────────────────────
  socket.on('barge_in', () => {
    if (!socket.user?.companyId) return;
    const ctrl = activeSessions.get(socket.id);
    if (ctrl) {
      console.log(`[Barge-in] Cancelling active stream for ${socket.id}`);
      ctrl.abort();
      activeSessions.delete(socket.id);
    }
  });

  socket.on('start_assistant', async (data = {}) => {
    if (!socket.user?.companyId) return;
    const { sessionId, ttsModel, ttsVoice, lead, introTemplate, languageMode, agentName } = data;
    if (!sessionId || !companyId) return;

    if (!sessionStartTimes.has(sessionId)) {
      sessionStartTimes.set(sessionId, nowMs());
    }

    const existingCtrl = activeSessions.get(socket.id);
    if (existingCtrl) existingCtrl.abort();

    const abortCtrl = new AbortController();
    activeSessions.set(socket.id, abortCtrl);
    const { signal } = abortCtrl;

    try {
      logger.info('call_started', { companyId, sessionId, leadPhone: lead?.phone || null });
      const requestStartMs = nowMs();
      const fullAssistantMessage = await renderIntroMessage(companyId, lead, introTemplate, agentName);

      if (signal.aborted) return;

      const ttsResult = await emitSingleTtsClip({
        text: fullAssistantMessage,
        signal,
        socket,
        ttsModel,
        ttsVoice,
        languageMode,
      });

      if (!signal.aborted) {
        const cleanedAssistantMessage = normalizeTtsText(fullAssistantMessage);
        const shouldEndCall =
          fullAssistantMessage.includes(END_CALL_MARKER) || CLOSING_SIGNAL_REGEX.test(cleanedAssistantMessage);
        await saveMessage(companyId, sessionId, 'assistant', cleanedAssistantMessage);
        socket.emit('response_complete', {
          aiText: cleanedAssistantMessage,
          shouldEndCall,
        });
        const doneAt = nowMs();
        const toFirstAudioMs = ttsResult.emitted ? doneAt - ttsResult.ttsMs - requestStartMs : null;
        console.log(
          `[Latency] session=${sessionId} stt_ms=0 llm_first_token_ms=na tts_chunks=${ttsResult.emitted ? 1 : 0} tts_total_ms=${ttsResult.ttsMs.toFixed(1)} ttf_audio_ms=${toFirstAudioMs != null ? toFirstAudioMs.toFixed(1) : 'na'} total_ms=${(doneAt - requestStartMs).toFixed(1)}`
        );
      }
    } catch (err) {
      if (err.name === 'AbortError' || signal.aborted) {
        console.log(`[Socket] Intro processing aborted for ${socket.id}`);
        return;
      }
      console.error('[Socket] Start Assistant Error:', err.message);
      emitSocketError(socket, 'SYSTEM', safeClientMessage(err));
    } finally {
      if (activeSessions.get(socket.id) === abortCtrl) {
        activeSessions.delete(socket.id);
      }
    }
  });

  socket.on('process_audio', async (data) => {
    if (!socket.user?.companyId) return;
    const { audioBuffer, sessionId, sttModel, ttsModel, ttsVoice, lead, languageMode, agentName, mimeType } = data;
    if (!companyId || !sessionId) return;
    // Resolve MIME type: client sends it for push-to-talk (mp4/webm); default to WAV for VAD path
    const audioMimeType = (typeof mimeType === 'string' && mimeType.trim()) ? mimeType.trim() : 'audio/wav';

    // Cancel any previous in-flight request for this socket (barge-in safety net)
    const existingCtrl = activeSessions.get(socket.id);
    if (existingCtrl) existingCtrl.abort();

    const abortCtrl = new AbortController();
    activeSessions.set(socket.id, abortCtrl);
    const { signal } = abortCtrl;

    try {
      logger.info('process_audio', { companyId, sessionId, bytes: audioBuffer?.size || audioBuffer?.length || 0 });
      const requestStartMs = nowMs();
      const sttStartMs = nowMs();

      // ── Feature 6: STT with language fallback ──────────────────────────────
      // Try te-IN first. If transcript is empty or looks like garbled output,
      // retry with language auto-detection (no language_code).
      let transcript = '';
      try {
        const sttPromise = transcribeAudio(
          audioBuffer,
          audioMimeType,
          sttModel || 'saarika:v2.5',
          resolveSttLanguageCode(languageMode)
        );
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('STT timeout after 15s')), STT_TIMEOUT_MS)
        );
        transcript = await Promise.race([sttPromise, timeoutPromise]);
      } catch (sttErr) {
        if (String(sttErr?.message || '').includes('timeout')) {
          console.warn('[STT] Timeout — skipping turn');
          emitSocketError(socket, 'SYSTEM', 'క్షమించండి, మళ్లీ చెబుతారా?');
          return;
        }
        if (isEmptySttError(sttErr)) {
          console.log('[STT] Empty transcript on primary attempt');
          transcript = '';
        } else {
          throw sttErr;
        }
      }

      // Retry with unknown only when primary transcript is empty.
      // Non-empty primary transcripts (including English words like "Kakinada")
      // are good enough and skipping fallback saves one network round-trip.
      if (transcript.length === 0) {
        console.log('[STT Fallback] Retrying with unknown lang (empty transcript)');
        try {
          const sttPromise = transcribeAudio(audioBuffer, audioMimeType, sttModel || 'saarika:v2.5', 'unknown');
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('STT timeout after 15s')), STT_TIMEOUT_MS)
          );
          const fallbackTranscript = await Promise.race([sttPromise, timeoutPromise]);
          if (fallbackTranscript.length >= transcript.length) {
            transcript = fallbackTranscript;
          }
        } catch (fallbackErr) {
          if (String(fallbackErr?.message || '').includes('timeout')) {
            console.warn('[STT] Timeout — skipping turn (fallback)');
            emitSocketError(socket, 'SYSTEM', 'క్షమించండి, మళ్లీ చెబుతారా?');
            return;
          }
          if (!isEmptySttError(fallbackErr)) {
            console.warn('[STT Fallback] Failed, using original transcript:', fallbackErr.message);
          }
        }
      }

      if (signal.aborted) return;
      if (!transcript || !transcript.trim()) {
        logger.warn('stt_no_speech', { companyId, sessionId });
        const noiseCount = (socketNoiseCounts.get(socket.id) || 0) + 1;
        socketNoiseCounts.set(socket.id, noiseCount);
        if (noiseCount >= STT_NOISE_NUDGE_THRESHOLD) {
          socketNoiseCounts.set(socket.id, 0);
          console.log(`[STT Noise] ${noiseCount} consecutive empty turns — emitting nudge`);
          try {
            const nudgeAudio = await synthesizeSpeech(
              STT_NOISE_NUDGE_TEXT, ttsVoice || 'shubh', ttsModel || 'bulbul:v3', 'te-IN'
            );
            if (!signal.aborted) {
              socket.emit('tts_audio_chunk', { audioBuffer: Buffer.from(nudgeAudio, 'base64'), text: STT_NOISE_NUDGE_TEXT });
              socket.emit('response_complete', { aiText: STT_NOISE_NUDGE_TEXT, shouldEndCall: false });
            }
          } catch { socket.emit('no_speech'); }
        } else {
          socket.emit('no_speech');
        }
        return;
      }
      transcript = transcript.trim();
      if (isLowSignalTranscript(transcript)) {
        console.log(`[STT] Low-signal transcript ignored: "${transcript}"`);
        const noiseCount = (socketNoiseCounts.get(socket.id) || 0) + 1;
        socketNoiseCounts.set(socket.id, noiseCount);
        if (noiseCount >= STT_NOISE_NUDGE_THRESHOLD) {
          socketNoiseCounts.set(socket.id, 0);
          console.log(`[STT Noise] ${noiseCount} low-signal turns — emitting nudge`);
          try {
            const nudgeAudio = await synthesizeSpeech(
              STT_NOISE_NUDGE_TEXT, ttsVoice || 'shubh', ttsModel || 'bulbul:v3', 'te-IN'
            );
            if (!signal.aborted) {
              socket.emit('tts_audio_chunk', { audioBuffer: Buffer.from(nudgeAudio, 'base64'), text: STT_NOISE_NUDGE_TEXT });
              socket.emit('response_complete', { aiText: STT_NOISE_NUDGE_TEXT, shouldEndCall: false });
            }
          } catch { socket.emit('no_speech'); }
        } else {
          socket.emit('no_speech');
        }
        return;
      }
      // Valid transcript — reset noise counter
      socketNoiseCounts.set(socket.id, 0);
      const sttMs = nowMs() - sttStartMs;
      socket.emit('transcript', { transcript });

      // ── LLM Streaming ──────────────────────────────────────────────────────
      const llmStartMs = nowMs();
      const stream = await generateResponseStream(transcript, sessionId, companyId, lead, languageMode, agentName);
      let firstTokenSeen = false;
      const timingMeta = { requestStartMs, sttMs, llmFirstTokenMs: null };
      const instrumentedStream = (async function* wrapStream() {
        for await (const llmChunk of stream) {
          if (!firstTokenSeen && (llmChunk?.choices?.[0]?.delta?.content || '').length > 0) {
            firstTokenSeen = true;
            timingMeta.llmFirstTokenMs = nowMs() - llmStartMs;
          }
          yield llmChunk;
        }
      })();

      await streamAssistantResponse({
        stream: instrumentedStream,
        signal,
        socket,
        companyId,
        sessionId,
        ttsModel,
        ttsVoice,
        languageMode,
        timingMeta,
      });

    } catch (err) {
      if (err.name === 'AbortError' || signal.aborted) {
        console.log(`[Socket] Processing aborted for ${socket.id}`);
        return;
      }
      console.error('[Socket] Process Audio Error:', err.message);
      emitSocketError(socket, 'SYSTEM', safeClientMessage(err));
    } finally {
      // Clean up only if this is still the active controller
      if (activeSessions.get(socket.id) === abortCtrl) {
        activeSessions.delete(socket.id);
      }
    }
  });

  socket.on('clear_session', async ({ sessionId }) => {
    if (!socket.user?.companyId) return;
    if (!companyId || !sessionId) return;
    await clearSession(companyId, sessionId);
    sessionStartTimes.delete(sessionId);
    socket.emit('session_cleared');
  });

  socket.on('end_call', async (data = {}) => {
    if (!socket.user?.companyId) return;
    const { sessionId, lead } = data;
    if (!sessionId || !companyId) return;

    const callEndMs = nowMs();

    const ctrl = activeSessions.get(socket.id);
    if (ctrl) {
      ctrl.abort();
      activeSessions.delete(socket.id);
    }

    try {
      const summary = await generateCallSummary(companyId, sessionId, lead);
      
      const durationMs = sessionStartTimes.has(sessionId) ? callEndMs - sessionStartTimes.get(sessionId) : 0;
      const durationSeconds = Math.round(durationMs / 1000);
      
      const transcript = await getSessionMessages(companyId, sessionId);
      await logCall(companyId, sessionId, lead, durationSeconds, summary.outcome, transcript, summary.summaryNote);
      sessionStartTimes.delete(sessionId);
      logger.info('call_ended', { companyId, sessionId, durationSeconds, outcome: summary.outcome, leadPhone: lead?.phone || null });
      
      socket.emit('call_summary', { summary });
    } catch (err) {
      console.error('[Socket] End Call Summary Error:', err.message);
      emitSocketError(socket, 'SYSTEM', 'Failed to generate call summary');
    }
  });

  socket.on('disconnect', (reason) => {
    // Clean up any active stream on disconnect
    const ctrl = activeSessions.get(socket.id);
    if (ctrl) ctrl.abort();
    activeSessions.delete(socket.id);
    socketNoiseCounts.delete(socket.id);
    logger.info('socket_disconnected', {
      socketId: socket.id,
      reason,
      userId: socket.user?.userId,
      companyId: socket.user?.companyId,
    });
  });
});

server.listen(PORT, () => {
  console.log(`[Server] Voice Agent backend listening on port ${PORT}`);
  if (!OPENAI_API_KEY) {
    console.warn('[Server] Missing OPENAI_API_KEY');
  }
  if (!SARVAM_API_KEY) {
    console.warn('[Server] Missing SARVAM_API_KEY');
  }
});
