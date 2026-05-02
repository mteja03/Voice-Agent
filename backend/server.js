require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const conversationRouter = require('./routes/conversation');
const knowledgeBaseRouter = require('./routes/knowledgeBase');
const analyticsRouter = require('./routes/analytics');
const { getCompanyInfo } = require('./services/knowledgeBase');
const { transcribeAudio } = require('./services/sttService');
const { generateResponseStream, generateCallSummary, clearSession } = require('./services/chatService');
const { synthesizeSpeech } = require('./services/ttsService');
const { saveMessage, logCall } = require('./services/db');

const app = express();
const PORT = process.env.PORT || 3001;
const LOCAL_ORIGIN_REGEX = /^http:\/\/localhost:\d+$/;
const TTS_FIRST_CHUNK_MIN_CHARS = Number(process.env.TTS_FIRST_CHUNK_MIN_CHARS || 8);
const TTS_NEXT_CHUNK_MIN_CHARS = Number(process.env.TTS_NEXT_CHUNK_MIN_CHARS || 24);
const TTS_CHUNK_MAX_CHARS = Number(process.env.TTS_CHUNK_MAX_CHARS || 90);
const END_CALL_MARKER = '[END_CALL]';

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || LOCAL_ORIGIN_REGEX.test(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
}));
app.use(express.json());
app.use('/api', conversationRouter);
app.use('/api/kb', knowledgeBaseRouter);
app.use('/api/analytics', analyticsRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Voice Agent' });
});

app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || LOCAL_ORIGIN_REGEX.test(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
  }
});

// ─── Per-socket cancellation tracking ────────────────────────────────────────
// Each socket gets an AbortController so we can cancel in-flight processing
// when the user barges in.
const activeSessions = new Map(); // socketId → AbortController
const sessionStartTimes = new Map(); // sessionId → startTime in ms
// Keep this strict to avoid accidental auto-hangups during normal polite replies.
const CLOSING_SIGNAL_REGEX = /(మళ్ళీ మాట్లాడుదాం|వీడ్కోలు|goodbye|bye|have a great day|हम फिर बात करेंगे)/i;

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function splitForTts(buffer, isFirstChunk) {
  const minChars = isFirstChunk ? TTS_FIRST_CHUNK_MIN_CHARS : TTS_NEXT_CHUNK_MIN_CHARS;
  const maxChars = TTS_CHUNK_MAX_CHARS;
  const text = (buffer || '').trimStart();
  if (!text) return null;

  const window = text.slice(0, Math.min(text.length, maxChars));
  const punctuationMatches = [...window.matchAll(/[.!?।\n]/g)];
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

async function renderIntroMessage(lead, introTemplate, agentName) {
  const leadName = lead?.name ? `${lead.name}` : 'కస్టమర్';
  const safeAgentName = agentName || 'Voice Agent';
  const companyInfo = await getCompanyInfo();
  const safeCompanyName = companyInfo?.name || safeAgentName;
  const template = (introTemplate || '').trim();
  return template
    ? template
      .replaceAll('{leadName}', leadName)
      .replaceAll('{agentName}', safeAgentName)
      .replaceAll('{companyName}', safeCompanyName)
    : `హలో ${leadName} గారు, నేను ${safeAgentName} నుండి మాట్లాడుతున్నాను. మీకు ఇది మాట్లాడటానికి సరైన సమయమా?`;
}

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  async function emitSingleTtsClip({ text, signal, socket, ttsModel, ttsVoice, languageMode }) {
    const normalizedText = normalizeTtsText(text);
    if (!normalizedText || normalizedText.length < 3 || signal.aborted) return { emitted: false, ttsMs: 0 };
    const ttsStart = nowMs();
    const audioBase64 = await synthesizeSpeech(
      normalizedText,
      ttsVoice || 'shubh',
      ttsModel || 'bulbul:v3',
      resolveLanguageCode(languageMode)
    );
    const ttsMs = nowMs() - ttsStart;
    if (!signal.aborted) {
      socket.emit('tts_audio_chunk', {
        audioBuffer: Buffer.from(audioBase64, 'base64'),
        text: normalizedText,
      });
      return { emitted: true, ttsMs };
    }
    return { emitted: false, ttsMs };
  }

  async function streamAssistantResponse({ stream, signal, socket, sessionId, ttsModel, ttsVoice, languageMode, timingMeta }) {
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
        }
      }
    }

    if (!signal.aborted && sentenceBuffer.trim().length > 3) {
      try {
        const sentence = normalizeTtsText(sentenceBuffer);
        const endsCleanly = /[.!?।]$/.test(sentence);
        // Avoid speaking clipped tail fragments like "ప్లాట్, అప" when stream ends mid-thought.
        if (sentence && sentence.length >= 3 && endsCleanly) {
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
          console.log(`[TTS Flush] Dropping incomplete tail: "${sentence}"`);
        }
      } catch (ttsErr) {
        console.error('[TTS Flush Error]', ttsErr.message);
      }
    }

    if (!signal.aborted) {
      const cleanedAssistantMessage = normalizeTtsText(fullAssistantMessage);
      const shouldEndCall =
        fullAssistantMessage.includes(END_CALL_MARKER) || CLOSING_SIGNAL_REGEX.test(cleanedAssistantMessage);
      await saveMessage(sessionId, 'assistant', cleanedAssistantMessage);
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
    const ctrl = activeSessions.get(socket.id);
    if (ctrl) {
      console.log(`[Barge-in] Cancelling active stream for ${socket.id}`);
      ctrl.abort();
      activeSessions.delete(socket.id);
    }
  });

  socket.on('start_assistant', async (data = {}) => {
    const { sessionId, ttsModel, ttsVoice, lead, introTemplate, languageMode, agentName } = data;
    if (!sessionId) return;

    if (!sessionStartTimes.has(sessionId)) {
      sessionStartTimes.set(sessionId, nowMs());
    }

    const existingCtrl = activeSessions.get(socket.id);
    if (existingCtrl) existingCtrl.abort();

    const abortCtrl = new AbortController();
    activeSessions.set(socket.id, abortCtrl);
    const { signal } = abortCtrl;

    try {
      console.log(`[Socket] start_assistant session=${sessionId}`);
      const requestStartMs = nowMs();
      const fullAssistantMessage = await renderIntroMessage(lead, introTemplate, agentName);
      const llmFirstTokenMs = 0;

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
        await saveMessage(sessionId, 'assistant', cleanedAssistantMessage);
        socket.emit('response_complete', {
          aiText: cleanedAssistantMessage,
          shouldEndCall,
        });
        const doneAt = nowMs();
        const toFirstAudioMs = ttsResult.emitted ? doneAt - ttsResult.ttsMs - requestStartMs : null;
        console.log(
          `[Latency] session=${sessionId} stt_ms=0 llm_first_token_ms=${llmFirstTokenMs ?? 'na'} tts_chunks=${ttsResult.emitted ? 1 : 0} tts_total_ms=${ttsResult.ttsMs.toFixed(1)} ttf_audio_ms=${toFirstAudioMs != null ? toFirstAudioMs.toFixed(1) : 'na'} total_ms=${(doneAt - requestStartMs).toFixed(1)}`
        );
      }
    } catch (err) {
      if (err.name === 'AbortError' || signal.aborted) {
        console.log(`[Socket] Intro processing aborted for ${socket.id}`);
        return;
      }
      console.error('[Socket] Start Assistant Error:', err.message);
      socket.emit('error', { message: err.message });
    } finally {
      if (activeSessions.get(socket.id) === abortCtrl) {
        activeSessions.delete(socket.id);
      }
    }
  });

  socket.on('process_audio', async (data) => {
    const { audioBuffer, sessionId, sttModel, ttsModel, ttsVoice, lead, languageMode, agentName } = data;

    // Cancel any previous in-flight request for this socket (barge-in safety net)
    const existingCtrl = activeSessions.get(socket.id);
    if (existingCtrl) existingCtrl.abort();

    const abortCtrl = new AbortController();
    activeSessions.set(socket.id, abortCtrl);
    const { signal } = abortCtrl;

    try {
      console.log(`[Socket] process_audio session=${sessionId}`);
      const requestStartMs = nowMs();
      const sttStartMs = nowMs();

      // ── Feature 6: STT with language fallback ──────────────────────────────
      // Try te-IN first. If transcript is empty or looks like garbled output,
      // retry with language auto-detection (no language_code).
      let transcript = '';
      try {
        transcript = await transcribeAudio(
          audioBuffer, 'audio/wav', sttModel || 'saaras:v3', resolveSttLanguageCode(languageMode)
        );
      } catch (sttErr) {
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
      const hasTeluguChars = /[\u0C00-\u0C7F]/.test(transcript);
      if (transcript.length === 0) {
        console.log('[STT Fallback] Retrying with unknown lang (empty transcript)');
        try {
          const fallbackTranscript = await transcribeAudio(
            audioBuffer, 'audio/wav', sttModel || 'saaras:v3', 'unknown'
          );
          if (fallbackTranscript.length >= transcript.length) {
            transcript = fallbackTranscript;
          }
        } catch (fallbackErr) {
          if (!isEmptySttError(fallbackErr)) {
            console.warn('[STT Fallback] Failed, using original transcript:', fallbackErr.message);
          }
        }
      }

      if (signal.aborted) return;
      if (!transcript || !transcript.trim()) {
        console.log('[STT] No usable speech detected, skipping turn');
        socket.emit('no_speech');
        return;
      }
      transcript = transcript.trim();
      if (isLowSignalTranscript(transcript)) {
        console.log(`[STT] Low-signal transcript ignored: "${transcript}"`);
        socket.emit('no_speech');
        return;
      }
      const sttMs = nowMs() - sttStartMs;
      socket.emit('transcript', { transcript });

      // ── LLM Streaming ──────────────────────────────────────────────────────
      const llmStartMs = nowMs();
      const stream = await generateResponseStream(transcript, sessionId, lead, languageMode, agentName);
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
      socket.emit('error', { message: err.message });
    } finally {
      // Clean up only if this is still the active controller
      if (activeSessions.get(socket.id) === abortCtrl) {
        activeSessions.delete(socket.id);
      }
    }
  });

  socket.on('clear_session', async ({ sessionId }) => {
    await clearSession(sessionId);
    sessionStartTimes.delete(sessionId);
    socket.emit('session_cleared');
  });

  socket.on('end_call', async (data = {}) => {
    const { sessionId, lead } = data;
    if (!sessionId) return;

    const callEndMs = nowMs();

    const ctrl = activeSessions.get(socket.id);
    if (ctrl) {
      ctrl.abort();
      activeSessions.delete(socket.id);
    }

    try {
      const summary = await generateCallSummary(sessionId, lead);
      
      const durationMs = sessionStartTimes.has(sessionId) ? callEndMs - sessionStartTimes.get(sessionId) : 0;
      const durationSeconds = Math.round(durationMs / 1000);
      
      await logCall(sessionId, lead?.name, lead?.phone, durationSeconds, summary.outcome);
      sessionStartTimes.delete(sessionId);
      
      socket.emit('call_summary', { summary });
    } catch (err) {
      console.error('[Socket] End Call Summary Error:', err.message);
      socket.emit('error', { message: 'Failed to generate call summary' });
    }
  });

  socket.on('disconnect', () => {
    // Clean up any active stream on disconnect
    const ctrl = activeSessions.get(socket.id);
    if (ctrl) ctrl.abort();
    activeSessions.delete(socket.id);
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Voice Agent backend running on http://localhost:${PORT}`);
});
