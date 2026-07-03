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
const usersRouter = require('./routes/users');
const callsRouter = require('./routes/calls');
const questionnairesRouter = require('./routes/questionnaires');
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
const { createSttStream } = require('./services/sttStreamingService');
const { generateResponseStream, generateCallSummary, clearSession } = require('./services/chatService');
const { synthesizeSpeech, prewarmTtsCache, getTtsCacheStats } = require('./services/ttsService');
const { saveMessage, logCall, getSessionMessages, updateCallRecordingPaths, getAgentConfig, evictSessionBuffer, updateLeadStatus } = require('./services/db');
const callRecording = require('./services/callRecording');
const { safeClientMessage } = require('./utils/sanitize');
const { logger } = require('./utils/logger');

function sanitizeLeadForPrompt(lead) {
  if (!lead || typeof lead !== 'object') return lead;
  const safe = { ...lead };
  if (safe.name)  safe.name  = String(safe.name).replace(/[\r\n]/g, ' ').slice(0, 100);
  if (safe.notes) safe.notes = String(safe.notes).replace(/[\r\n]/g, ' ').slice(0, 500);
  if (safe.phone) safe.phone = String(safe.phone).replace(/[^\d+\-() ]/g, '').slice(0, 20);
  return safe;
}

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
app.use('/api/users', authMiddleware, verifyUserContext, requireCompanyId, usersRouter);
app.use('/api/calls', authMiddleware, verifyUserContext, requireCompanyId, callsRouter);
app.use('/api/questionnaires', authMiddleware, verifyUserContext, requireCompanyId, questionnairesRouter);

app.get('/', (req, res) => {
  res.send('Server is running');
});

app.get('/health', (req, res) => {
  sendSuccess(res, {
    status: 'ok',
    service: 'Voice Agent',
    activeSockets: activeSessions.size,
    // Live p50/p95/p99 turn latency from the in-memory ring buffer.
    // null when no turns have been completed since last restart.
    latencyMs: getLatencyStats(),
    // LRU TTS audio cache stats — repeated phrases served in ~0 ms vs 3-4 s Sarvam call.
    ttsCache: getTtsCacheStats(),
    // Horizontal-scale readiness: true when the Socket.IO Redis adapter is active.
    redisAdapter: Boolean(process.env.REDIS_URL),
  });
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

// ── Optional Redis adapter for horizontal scaling ────────────────────────────
// When REDIS_URL is set, Socket.IO uses the Redis adapter so multiple replicas
// share broadcast/room state and reconnections routed to a different replica
// still work. Per-socket state (AbortControllers for barge-in, recording
// buffers) still lives in-process, so a sticky-session / socket-affinity load
// balancer is REQUIRED alongside this for correct multi-replica behaviour.
//
// Without REDIS_URL the default in-memory adapter is used — identical to the
// previous single-replica behaviour. Wiring is fully self-healing: if Redis is
// unreachable the server keeps running on the in-memory adapter.
if (process.env.REDIS_URL) {
  (async () => {
    try {
      const { createAdapter } = require('@socket.io/redis-adapter');
      const { createClient } = require('redis');
      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();
      pubClient.on('error', (e) => logger.error('redis_pub_error', { err: e.message }));
      subClient.on('error', (e) => logger.error('redis_sub_error', { err: e.message }));
      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      logger.info('socketio_redis_adapter_enabled', {});
    } catch (err) {
      logger.error('socketio_redis_adapter_failed', { err: err.message });
      // Fall back to the default in-memory adapter — single-replica still works.
    }
  })();
}

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
const socketLastProcessAt = new Map(); // socketId → timestamp of last process_audio
// Keep this strict to avoid accidental auto-hangups during normal polite replies.
const CLOSING_SIGNAL_REGEX = /(మళ్ళీ మాట్లాడుదాం|వీడ్కోలు|మంచి రోజు గడపండి|ధన్యవాదాలు మాట్లాడినందుకు|goodbye|\bbye\b|have a great day|talk later|call you later|not interested|हम फिर बात करेंगे|अलविदा|धन्यवाद|फिर बात करते)/i;
const STT_TIMEOUT_MS = 15000;
const TTS_TIMEOUT_MS = 20000;
// Audio payloads below this threshold are almost certainly silence or mic-open
// noise — skip the Sarvam round-trip entirely and emit no_speech immediately.
const STT_MIN_AUDIO_BYTES = 1500;
// After this many consecutive empty/low-signal turns, emit a gentle "can you hear me?" nudge.
const STT_NOISE_NUDGE_THRESHOLD = 2;
const STT_NOISE_NUDGE_TEXT = 'మీరు వినపడుతున్నారా? మీరు మాట్లాడవచ్చు.';

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

// ─── Turn-latency ring buffer ─────────────────────────────────────────────────
// Keeps the last RING_SIZE total-turn latencies in memory so the /health endpoint
// can report live p50/p95/p99 without any external metrics store.
const LATENCY_RING_SIZE = 200;
const _latencyRing = [];

function recordTurnLatency(totalMs) {
  _latencyRing.push(Math.round(totalMs));
  if (_latencyRing.length > LATENCY_RING_SIZE) _latencyRing.shift();
}

function getLatencyStats() {
  if (!_latencyRing.length) return null;
  const sorted = [..._latencyRing].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    n,
    avg: Math.round(sorted.reduce((s, v) => s + v, 0) / n),
    p50: sorted[Math.floor(n * 0.50)] ?? null,
    p75: sorted[Math.floor(n * 0.75)] ?? null,
    p95: sorted[Math.floor(n * 0.95)] ?? null,
    p99: sorted[Math.floor(n * 0.99)] ?? null,
  };
}

function emitTtsAudioChunk(socket, companyId, sessionId, payload) {
  if (payload?.audioBuffer && Buffer.isBuffer(payload.audioBuffer) && payload.audioBuffer.length) {
    callRecording.appendAgent(companyId, sessionId, payload.audioBuffer);
  }
  socket.emit('tts_audio_chunk', payload);
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
  socket.data = socket.data || {};

  async function emitSingleTtsClip({ text, signal, socket, ttsModel, ttsVoice, languageMode, sessionId }) {
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
        emitTtsAudioChunk(socket, companyId, sessionId, {
          audioBuffer: Buffer.from(audioBase64, 'base64'),
          text: normalizedText,
        });
        return { emitted: true, ttsMs };
      }
      return { emitted: false, ttsMs };
    } catch (ttsErr) {
      const ttsMs = nowMs() - ttsStart;
      if (String(ttsErr?.message || '').includes('timeout')) {
        logger.warn('tts_timeout', { socketId: socket.id });
        if (!signal.aborted) {
          emitTtsAudioChunk(socket, companyId, sessionId, { audioBuffer: null, text: normalizedText });
        }
        return { emitted: false, ttsMs };
      }
      throw ttsErr;
    }
  }

  /**
   * streamAssistantResponse — parallel TTS pipeline
   *
   * Previous design: the LLM `for await` loop called `await synthesizeSpeech()`
   * inline, blocking the stream reader for ~2 s per chunk. With 3 sentences the
   * loop was frozen for 6 s total while the Sarvam TTS API processed each one.
   *
   * New design — two-phase pipeline:
   *   Phase 1 (LLM drain): read every token, split sentences as they arrive, and
   *     immediately fire each TTS call as a Promise without awaiting it. The LLM
   *     stream is never blocked by TTS network I/O.
   *   Phase 2 (emit in order): iterate the promise array and emit each audio chunk
   *     to the client as it resolves. Because all TTS calls started almost
   *     simultaneously, the longest individual call determines total wait time
   *     instead of their sum.
   *
   * Expected improvement: 3 × 2000 ms sequential → ~2000 ms parallel (+overlap).
   * TTF audio (time to first audio heard) also drops because chunk-1 TTS starts
   * the moment the first sentence boundary is seen in the LLM stream rather than
   * waiting for later chunks to finish.
   */
  async function streamAssistantResponse({ stream, signal, socket, companyId, sessionId, ttsModel, ttsVoice, languageMode, timingMeta }) {
    let sentenceBuffer = '';
    let fullAssistantMessage = '';
    let ttsChunks = 0;
    let ttsTotalMs = 0;
    let firstAudioAtMs = null;

    /**
     * Wrap a TTS call in a promise that always resolves (never rejects) so the
     * emit loop can handle errors gracefully without short-circuiting the queue.
     */
    function queueTts(sentence, isFlush = false) {
      const label = isFlush ? 'tts_flush_queued' : 'tts_chunk_queued';
      logger.info(label, { sentence });
      const ttsStart = nowMs();
      const voice   = ttsVoice  || 'shubh';
      const model   = ttsModel  || 'bulbul:v3';
      const langCode = resolveLanguageCode(languageMode);
      return synthesizeSpeech(sentence, voice, model, langCode)
        .then((audio64) => ({ ok: true, audio64, sentence, ttsMs: nowMs() - ttsStart }))
        .catch((err)    => ({ ok: false, err, sentence, ttsMs: nowMs() - ttsStart }));
    }

    // ── Phase 1: drain the LLM stream, fire TTS calls immediately ────────────
    const ttsPipeline = []; // ordered array of TTS promises

    for await (const chunk of stream) {
      if (signal.aborted) {
        logger.info('barge_in_stream_cancelled', { socketId: socket.id });
        break;
      }

      const token = chunk.choices[0]?.delta?.content || '';
      sentenceBuffer += token;
      fullAssistantMessage += token;

      const split = splitForTts(sentenceBuffer, ttsPipeline.length === 0);
      if (split) {
        const sentence = normalizeTtsText(split.chunk);
        sentenceBuffer = split.rest;
        if (!sentence || sentence.length < 3 || signal.aborted) continue;
        // Fire TTS immediately — do NOT await; store the promise for phase 2.
        ttsPipeline.push(queueTts(sentence));
      }
    }

    // Handle any remaining buffered text after the stream closes.
    if (!signal.aborted && sentenceBuffer.trim().length > 3) {
      let sentence = stripTtsFlushArtifacts(normalizeTtsText(sentenceBuffer));
      sentence = trimLikelyClippedTeluguTail(sentence);
      if (shouldFlushTtsRemainder(sentence)) {
        ttsPipeline.push(queueTts(sentence, true));
      } else if (sentence) {
        logger.info('tts_flush_tail_dropped', { chars: sentence.length, sentence });
      }
    }

    // ── Phase 2: emit chunks in order as each promise resolves ───────────────
    for (const ttsPromise of ttsPipeline) {
      if (signal.aborted) break;
      const result = await ttsPromise; // resolves immediately if already done
      ttsTotalMs += result.ttsMs;
      ttsChunks += 1;
      if (!firstAudioAtMs) firstAudioAtMs = nowMs();
      if (signal.aborted) break;

      if (result.ok) {
        emitTtsAudioChunk(socket, companyId, sessionId, {
          audioBuffer: Buffer.from(result.audio64, 'base64'),
          text: result.sentence,
        });
      } else {
        logger.error('tts_chunk_error', { err: result.err?.message });
        // Emit text-only so the client transcript still updates.
        emitTtsAudioChunk(socket, companyId, sessionId, { audioBuffer: null, text: result.sentence });
      }
    }

    if (!signal.aborted) {
      const cleanedAssistantMessage = normalizeTtsText(fullAssistantMessage);
      const shouldEndCall =
        fullAssistantMessage.includes(END_CALL_MARKER) || CLOSING_SIGNAL_REGEX.test(cleanedAssistantMessage);
      await saveMessage(companyId, sessionId, 'assistant', cleanedAssistantMessage);

      const doneAt = nowMs();
      const toFirstAudioMs = firstAudioAtMs ? firstAudioAtMs - timingMeta.requestStartMs : null;

      const latency = timingMeta ? {
        total: Math.round(doneAt - timingMeta.requestStartMs),
        stt:   timingMeta.sttMs           != null ? Math.round(timingMeta.sttMs)           : null,
        llm:   timingMeta.llmFirstTokenMs != null ? Math.round(timingMeta.llmFirstTokenMs) : null,
        tts:   Math.round(ttsTotalMs),
        ttf:   toFirstAudioMs != null ? Math.round(toFirstAudioMs) : null,
      } : null;

      socket.emit('response_complete', { aiText: cleanedAssistantMessage, shouldEndCall, latency });

      if (timingMeta) {
        const totalMs = doneAt - timingMeta.requestStartMs;
        recordTurnLatency(totalMs);
        logger.info('turn_latency', {
          sessionId,
          stt_ms: timingMeta.sttMs ?? null,
          llm_first_token_ms: timingMeta.llmFirstTokenMs ?? null,
          tts_chunks: ttsChunks,
          tts_total_ms: Math.round(ttsTotalMs),
          ttf_audio_ms: toFirstAudioMs != null ? Math.round(toFirstAudioMs) : null,
          total_ms: Math.round(totalMs),
        });
      }
    }
  }

  // ── Feature 2: Barge-in — cancel active processing ───────────────────────
  socket.on('barge_in', () => {
    if (!socket.user?.companyId) return;
    const ctrl = activeSessions.get(socket.id);
    if (ctrl) {
      logger.info('barge_in', { socketId: socket.id });
      ctrl.abort();
      activeSessions.delete(socket.id);
    }
  });

  socket.on('start_assistant', async (data = {}) => {
    if (!socket.user?.companyId) return;
    const { sessionId, ttsModel, ttsVoice, lead, introTemplate, languageMode, agentName } = data;
    if (!sessionId || !companyId) return;
    socket.data.recordingSessionId = sessionId;

    const safeLeadForPrompt = sanitizeLeadForPrompt(lead);

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

      // Fire-and-forget: pre-generate audio for common phrases so the first
      // acknowledgement / closing hits the cache instead of Sarvam (~3-4 s saved).
      prewarmTtsCache(
        ttsVoice || 'shubh',
        resolveLanguageCode(languageMode || 'telugu'),
        ttsModel  || 'bulbul:v3',
      ).catch(() => {});

      const requestStartMs = nowMs();
      const fullAssistantMessage = await renderIntroMessage(companyId, safeLeadForPrompt, introTemplate, agentName);

      if (signal.aborted) return;

      const ttsResult = await emitSingleTtsClip({
        text: fullAssistantMessage,
        signal,
        socket,
        ttsModel,
        ttsVoice,
        languageMode,
        sessionId,
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
        logger.info('turn_latency', {
          sessionId,
          stt_ms: 0,
          llm_first_token_ms: null,
          tts_chunks: ttsResult.emitted ? 1 : 0,
          tts_total_ms: Math.round(ttsResult.ttsMs),
          ttf_audio_ms: toFirstAudioMs != null ? Math.round(toFirstAudioMs) : null,
          total_ms: Math.round(doneAt - requestStartMs),
        });
      }
    } catch (err) {
      if (err.name === 'AbortError' || signal.aborted) {
        logger.info('start_assistant_aborted', { socketId: socket.id });
        return;
      }
      logger.error('start_assistant_error', { err: err.message });
      emitSocketError(socket, 'SYSTEM', safeClientMessage(err));
    } finally {
      if (activeSessions.get(socket.id) === abortCtrl) {
        activeSessions.delete(socket.id);
      }
    }
  });

  /**
   * Shared post-transcript pipeline: validate the transcript (with noise nudge),
   * emit it, run the LLM stream, and synthesize TTS. Used by BOTH the batch STT
   * path (process_audio) and the streaming STT path (stt_stream_end) so the two
   * never drift apart. Emits directly to the socket; returns nothing.
   */
  async function runAssistantTurn({ transcript, sessionId, ttsModel, ttsVoice, safeLeadForPrompt, languageMode, agentName, signal, timingMeta, companyInfoPromise, agentConfigPromise }) {
    if (signal.aborted) return;

    async function noiseNudge(reason) {
      const noiseCount = (socketNoiseCounts.get(socket.id) || 0) + 1;
      socketNoiseCounts.set(socket.id, noiseCount);
      if (noiseCount >= STT_NOISE_NUDGE_THRESHOLD) {
        socketNoiseCounts.set(socket.id, 0);
        logger.info('stt_noise_nudge', { socketId: socket.id, noiseCount, reason });
        try {
          const nudgeAudio = await synthesizeSpeech(
            STT_NOISE_NUDGE_TEXT, ttsVoice || 'shubh', ttsModel || 'bulbul:v3', 'te-IN'
          );
          if (!signal.aborted) {
            emitTtsAudioChunk(socket, companyId, sessionId, {
              audioBuffer: Buffer.from(nudgeAudio, 'base64'),
              text: STT_NOISE_NUDGE_TEXT,
            });
            socket.emit('response_complete', { aiText: STT_NOISE_NUDGE_TEXT, shouldEndCall: false });
          }
        } catch { socket.emit('no_speech'); }
      } else {
        socket.emit('no_speech');
      }
    }

    if (!transcript || !transcript.trim()) {
      logger.warn('stt_no_speech', { companyId, sessionId });
      await noiseNudge('empty_transcript');
      return;
    }
    transcript = transcript.trim();
    if (isLowSignalTranscript(transcript)) {
      logger.info('stt_low_signal', { companyId, sessionId, transcript });
      await noiseNudge('low_signal');
      return;
    }
    // Valid transcript — reset noise counter
    socketNoiseCounts.set(socket.id, 0);
    socket.emit('transcript', { transcript });

    // ── LLM Streaming ──────────────────────────────────────────────────────
    const llmStartMs = nowMs();
    const stream = await generateResponseStream(transcript, sessionId, companyId, safeLeadForPrompt, languageMode, agentName, { companyInfoPromise, agentConfigPromise });
    let firstTokenSeen = false;
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
  }

  socket.on('process_audio', async (data) => {
    if (!socket.user?.companyId) return;
    const { audioBuffer, sessionId, sttModel, ttsModel, ttsVoice, lead, languageMode, agentName, mimeType } = data;
    if (!companyId || !sessionId) return;
    socket.data.recordingSessionId = sessionId;

    // ── Per-socket rate limiting ───────────────────────────────────────────────
    const lastProcessAt = socketLastProcessAt.get(socket.id);
    if (lastProcessAt != null && Date.now() - lastProcessAt < 800) {
      socket.emit('no_speech');
      return;
    }
    socketLastProcessAt.set(socket.id, Date.now());

    const safeLeadForPrompt = sanitizeLeadForPrompt(lead);

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

      // ── Prefetch DB reads that don't depend on the transcript ──────────────
      // Fire these the moment audio arrives so they run in parallel with the
      // STT network call (~1600 ms). On cache hits (turn 2+) they resolve
      // instantly from memory. On the first turn they save ~200-400 ms because
      // the Supabase round-trips complete while STT is still in flight.
      const companyInfoPromise = getCompanyInfo(companyId).catch(() => null);
      const agentConfigPromise = getAgentConfig(companyId).catch(() => null);

      const sttStartMs = nowMs();

      const normalizedUserAudio = callRecording.normalizeSocketAudioBuffer(audioBuffer);
      if (normalizedUserAudio?.length) {
        callRecording.appendUser(companyId, sessionId, normalizedUserAudio, audioMimeType);
      }
      const sttInput = normalizedUserAudio?.length ? normalizedUserAudio : audioBuffer;

      // ── Fast silence gate ──────────────────────────────────────────────────
      // Payloads below 1500 bytes contain less than ~90 ms of audio at 16-kHz
      // mono PCM — too short to carry a real utterance.  Skip the Sarvam API
      // call (~1600 ms round-trip) and immediately emit no_speech.
      if (sttInput?.length < STT_MIN_AUDIO_BYTES) {
        logger.info('stt_skipped_tiny_audio', { companyId, sessionId, bytes: sttInput?.length });
        const noiseCount = (socketNoiseCounts.get(socket.id) || 0) + 1;
        socketNoiseCounts.set(socket.id, noiseCount);
        socket.emit('no_speech');
        return;
      }

      // ── STT with language fallback / parallel retry ────────────────────────
      // For 'auto' mode: fire te-IN and unknown simultaneously; take longest.
      // For specific language modes: try primary first, fallback to unknown only
      // if empty (saves a round-trip when speech is clearly in the target language).
      let transcript = '';
      if (languageMode === 'auto') {
        // Parallel retry — both requests fire at the same time
        const [teResult, unknownResult] = await Promise.allSettled([
          Promise.race([
            transcribeAudio(sttInput, audioMimeType, sttModel || 'saarika:v2.5', 'te-IN'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('STT timeout after 15s')), STT_TIMEOUT_MS)),
          ]),
          Promise.race([
            transcribeAudio(sttInput, audioMimeType, sttModel || 'saarika:v2.5', 'unknown'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('STT timeout after 15s')), STT_TIMEOUT_MS)),
          ]),
        ]);

        const teTranscript   = teResult.status      === 'fulfilled' ? (teResult.value      || '') : '';
        const unknownTranscript = unknownResult.status === 'fulfilled' ? (unknownResult.value || '') : '';

        // Check for timeout on both paths
        const teTimeout      = teResult.status      === 'rejected' && String(teResult.reason?.message      || '').includes('timeout');
        const unknownTimeout = unknownResult.status === 'rejected' && String(unknownResult.reason?.message || '').includes('timeout');
        if (teTimeout && unknownTimeout) {
          logger.warn('stt_timeout', { companyId, sessionId, mode: 'auto' });
          emitSocketError(socket, 'SYSTEM', 'క్షమించండి, మళ్లీ చెబుతారా?');
          return;
        }

        // Take whichever non-empty result is longer
        if (unknownTranscript.length > teTranscript.length) {
          transcript = unknownTranscript;
        } else {
          transcript = teTranscript;
        }
        logger.info('stt_parallel_result', { companyId, sessionId, teLen: teTranscript.length, unknownLen: unknownTranscript.length });
      } else {
        // Sequential fallback for specific language modes
        try {
          const sttPromise = transcribeAudio(
            sttInput,
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
            logger.warn('stt_timeout', { companyId, sessionId, mode: languageMode });
            emitSocketError(socket, 'SYSTEM', 'క్షమించండి, మళ్లీ చెబుతారా?');
            return;
          }
          if (isEmptySttError(sttErr)) {
            logger.info('stt_empty_primary', { companyId, sessionId });
            transcript = '';
          } else {
            throw sttErr;
          }
        }

        // Retry with unknown only when primary transcript is empty.
        // Non-empty primary transcripts (including English words like "Kakinada")
        // are good enough and skipping fallback saves one network round-trip.
        if (transcript.length === 0) {
          logger.info('stt_fallback_unknown', { companyId, sessionId });
          try {
            const sttPromise = transcribeAudio(sttInput, audioMimeType, sttModel || 'saarika:v2.5', 'unknown');
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('STT timeout after 15s')), STT_TIMEOUT_MS)
            );
            const fallbackTranscript = await Promise.race([sttPromise, timeoutPromise]);
            if (fallbackTranscript.length >= transcript.length) {
              transcript = fallbackTranscript;
            }
          } catch (fallbackErr) {
            if (String(fallbackErr?.message || '').includes('timeout')) {
              logger.warn('stt_timeout_fallback', { companyId, sessionId });
              emitSocketError(socket, 'SYSTEM', 'క్షమించండి, మళ్లీ చెబుతారా?');
              return;
            }
            if (!isEmptySttError(fallbackErr)) {
              logger.warn('stt_fallback_failed', { companyId, sessionId, err: fallbackErr.message });
            }
          }
        }
      }

      if (signal.aborted) return;
      const sttMs = nowMs() - sttStartMs;

      // Hand off to the shared transcript → LLM → TTS pipeline.
      await runAssistantTurn({
        transcript,
        sessionId,
        ttsModel,
        ttsVoice,
        safeLeadForPrompt,
        languageMode,
        agentName,
        signal,
        timingMeta: { requestStartMs, sttMs, llmFirstTokenMs: null },
        companyInfoPromise,
        agentConfigPromise,
      });

    } catch (err) {
      if (err.name === 'AbortError' || signal.aborted) {
        logger.info('process_audio_aborted', { socketId: socket.id });
        return;
      }
      logger.error('process_audio_error', { err: err.message });
      emitSocketError(socket, 'SYSTEM', safeClientMessage(err));
    } finally {
      // Clean up only if this is still the active controller
      if (activeSessions.get(socket.id) === abortCtrl) {
        activeSessions.delete(socket.id);
      }
    }
  });

  // ── Streaming STT (experimental, gated by client `streamingStt` flag) ────────
  // Latency win: the Sarvam WS receives PCM frames WHILE the user speaks, so the
  // transcript is (nearly) ready at speech-end instead of starting a ~1.6 s batch
  // upload then. Falls back to process_audio if the WS can't open.
  //
  // Known limitation (v1): user-side call recording is skipped in streaming mode
  // (agent audio still records). Batch mode records both sides as before.

  socket.on('stt_stream_start', async (data = {}) => {
    if (!socket.user?.companyId) return;
    const { sessionId, sttModel, languageMode } = data;
    if (!sessionId) return;
    socket.data.recordingSessionId = sessionId;

    // Tear down any previous stream on this socket.
    if (socket.data.sttStream) {
      try { socket.data.sttStream.close(); } catch { /* noop */ }
      socket.data.sttStream = null;
    }

    try {
      const stream = createSttStream({
        languageCode: resolveSttLanguageCode(languageMode),
        model: sttModel || 'saarika:v2.5',
        sampleRate: 16000,
      });
      socket.data.sttStream = stream;
      await stream.ready;
      logger.info('stt_stream_started', { companyId, sessionId, languageMode });
    } catch (err) {
      logger.error('stt_stream_start_failed', { err: err.message });
      socket.data.sttStream = null;
      // Tell the client to use the batch path for this turn.
      socket.emit('stt_stream_unavailable');
    }
  });

  socket.on('stt_stream_frame', (data = {}) => {
    if (!socket.user?.companyId) return;
    const stream = socket.data.sttStream;
    if (!stream || !data?.audio) return;
    stream.push(data.audio); // base64-encoded PCM16 mono @ 16 kHz
  });

  // Client aborted a speech segment (too short / assistant busy) — close the WS
  // without running a turn so we don't spend an LLM/TTS round-trip on noise.
  socket.on('stt_stream_cancel', () => {
    if (socket.data.sttStream) {
      try { socket.data.sttStream.close(); } catch { /* noop */ }
      socket.data.sttStream = null;
    }
  });

  socket.on('stt_stream_end', async (data = {}) => {
    if (!socket.user?.companyId) return;
    const { sessionId, ttsModel, ttsVoice, lead, languageMode, agentName } = data;
    if (!companyId || !sessionId) return;

    const stream = socket.data.sttStream;
    if (!stream) { socket.emit('no_speech'); return; }

    // Per-socket rate limiting (shared with batch path).
    const lastProcessAt = socketLastProcessAt.get(socket.id);
    if (lastProcessAt != null && Date.now() - lastProcessAt < 800) {
      try { stream.close(); } catch { /* noop */ }
      socket.data.sttStream = null;
      socket.emit('no_speech');
      return;
    }
    socketLastProcessAt.set(socket.id, Date.now());

    const safeLeadForPrompt = sanitizeLeadForPrompt(lead);

    const existingCtrl = activeSessions.get(socket.id);
    if (existingCtrl) existingCtrl.abort();
    const abortCtrl = new AbortController();
    activeSessions.set(socket.id, abortCtrl);
    const { signal } = abortCtrl;

    // Measure latency from speech-END (comparable to the batch path) so the
    // streaming win shows up as a much smaller stt_ms (just the flush drain).
    const requestStartMs = nowMs();
    const companyInfoPromise = getCompanyInfo(companyId).catch(() => null);
    const agentConfigPromise = getAgentConfig(companyId).catch(() => null);

    try {
      const finalizeStart = nowMs();
      const transcript = await stream.finalize();
      const sttMs = nowMs() - finalizeStart;
      try { stream.close(); } catch { /* noop */ }
      socket.data.sttStream = null;

      if (signal.aborted) return;
      logger.info('stt_stream_end', { companyId, sessionId, chars: transcript.length, stt_ms: Math.round(sttMs) });

      await runAssistantTurn({
        transcript,
        sessionId,
        ttsModel,
        ttsVoice,
        safeLeadForPrompt,
        languageMode,
        agentName,
        signal,
        timingMeta: { requestStartMs, sttMs, llmFirstTokenMs: null },
        companyInfoPromise,
        agentConfigPromise,
      });
    } catch (err) {
      if (err.name === 'AbortError' || signal.aborted) {
        logger.info('stt_stream_end_aborted', { socketId: socket.id });
        return;
      }
      logger.error('stt_stream_end_error', { err: err.message });
      emitSocketError(socket, 'SYSTEM', safeClientMessage(err));
    } finally {
      if (activeSessions.get(socket.id) === abortCtrl) {
        activeSessions.delete(socket.id);
      }
      try { socket.data.sttStream?.close(); } catch { /* noop */ }
      socket.data.sttStream = null;
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

    socket.data.endingCall = true;
    const callEndMs = nowMs();

    const ctrl = activeSessions.get(socket.id);
    if (ctrl) {
      ctrl.abort();
      activeSessions.delete(socket.id);
    }

    // Emit pending immediately so client can show "Generating summary…"
    socket.emit('call_summary_pending');

    const durationMs = sessionStartTimes.has(sessionId) ? callEndMs - sessionStartTimes.get(sessionId) : 0;
    const durationSeconds = Math.round(durationMs / 1000);
    sessionStartTimes.delete(sessionId);
    // Evict the in-process message buffer — call is done, no more turns expected.
    evictSessionBuffer(companyId, sessionId);

    // Run the heavy work asynchronously so the client doesn't wait at hang-up.
    setImmediate(async () => {
      try {
        const summary = await generateCallSummary(companyId, sessionId, lead);

        const transcript = await getSessionMessages(companyId, sessionId);
        const callId = await logCall(companyId, sessionId, lead, durationSeconds, summary.outcome, transcript, summary.summaryNote);
        if (callId) {
          const rec = await callRecording.finalizeUpload(companyId, sessionId, callId);
          if (rec && (rec.recordingUserPath || rec.recordingAgentPath)) {
            await updateCallRecordingPaths(companyId, callId, rec);
          }

          // Update lead status based on call outcome
          if (lead?.id && summary?.outcome) {
            const newStatus =
              summary.outcome === 'interested'     ? 'hot' :
              summary.outcome === 'not_interested' ? 'not_interested' :
              summary.outcome === 'closed'         ? 'closed' : null;
            if (newStatus) {
              updateLeadStatus(companyId, lead.id, newStatus).catch((err) =>
                logger.warn('lead_status_update_failed', { leadId: lead.id, err: err.message })
              );
            }
          }
        }
        logger.info('call_ended', { companyId, sessionId, durationSeconds, outcome: summary.outcome, leadPhone: lead?.phone || null });
        // Client may have disconnected during summary generation — the summary
        // is already persisted via logCall above, so a missed emit is harmless.
        if (socket.connected) socket.emit('call_summary', { summary });
      } catch (err) {
        logger.error('end_call_summary_error', { err: err.message });
        // Emit a fallback summary so the client doesn't hang (only if still connected)
        if (socket.connected) {
          socket.emit('call_summary', {
            summary: { outcome: 'unknown', summaryNote: 'Summary generation failed.' },
          });
        }
      } finally {
        socket.data.endingCall = false;
      }
    });
  });

  socket.on('disconnect', (reason) => {
    // Clean up any active stream on disconnect
    const ctrl = activeSessions.get(socket.id);
    if (ctrl) ctrl.abort();
    activeSessions.delete(socket.id);
    socketNoiseCounts.delete(socket.id);
    socketLastProcessAt.delete(socket.id);
    // Close any open streaming-STT WebSocket so it doesn't leak.
    if (socket.data?.sttStream) {
      try { socket.data.sttStream.close(); } catch { /* noop */ }
      socket.data.sttStream = null;
    }
    const recSid = socket.data?.recordingSessionId;
    if (recSid && companyId) {
      // Evict stale session data for abandoned calls (user closed tab without end_call).
      if (!socket.data?.endingCall) {
        callRecording.discard(companyId, recSid);
        evictSessionBuffer(companyId, recSid);
      }
      // Always free sessionStartTimes — it's keyed by sessionId and leaks
      // if the client disconnects without calling end_call.
      sessionStartTimes.delete(recSid);
    }
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
