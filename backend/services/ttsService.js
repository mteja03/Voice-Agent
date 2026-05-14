const https = require('https');
const axios = require('axios');
const { logger } = require('../utils/logger');

const SARVAM_TTS_STREAM_URL = 'https://api.sarvam.ai/text-to-speech/stream';

// Reuse TCP connections across TTS calls so every chunk doesn't pay the
// TLS handshake cost (~50-150 ms).
const _httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 10, keepAliveMsecs: 30000 });

// ─── LRU TTS Audio Cache ──────────────────────────────────────────────────────
//
// Sarvam TTS adds 2.5–4 s per call regardless of text length. Many phrases
// repeat across calls (acknowledgements, short follow-ups, closings). This
// LRU cache serves those instantly from memory.
//
// Key:   `${speaker}:${languageCode}:${normalised_text}`
// Value: base64-encoded MP3 string
// Eviction: LRU via Map insertion-order trick (delete + re-insert on access)

const TTS_CACHE_MAX    = 400;  // entries
const TTS_CACHE_MAX_LEN = 300; // chars — skip caching very long unique strings

const _ttsCache = new Map();
let _cacheHits   = 0;
let _cacheMisses = 0;

function _cacheKey(text, speaker, languageCode) {
  // Normalise so minor whitespace/punctuation differences still hit
  return `${speaker}:${languageCode}:${text.trim().replace(/\s+/g, ' ')}`;
}

function _cacheGet(key) {
  if (!_ttsCache.has(key)) return undefined;
  const val = _ttsCache.get(key);
  // Move to end of Map to mark as most-recently-used
  _ttsCache.delete(key);
  _ttsCache.set(key, val);
  return val;
}

function _cacheSet(key, val) {
  if (_ttsCache.has(key)) {
    _ttsCache.delete(key);
  } else if (_ttsCache.size >= TTS_CACHE_MAX) {
    // Evict least-recently-used (first entry in Map)
    _ttsCache.delete(_ttsCache.keys().next().value);
  }
  _ttsCache.set(key, val);
}

// ─── Common phrases for pre-warming ──────────────────────────────────────────
//
// Pre-generate audio for high-frequency short phrases so the very first turn
// of a session can serve them from cache. Called once after the session's
// voice/language is known.

const PREWARM_PHRASES = {
  'te-IN': [
    'సరే', 'అర్థమైంది', 'అవును', 'పర్లేదు', 'మంచిది', 'అలాగే',
    'ధన్యవాదాలు', 'నమస్కారం', 'సరే, చెప్పండి', 'ఒక్క నిమిషం',
    'సరే సరే', 'మంచి రోజు గడపండి', 'తప్పకుండా',
  ],
  'hi-IN': [
    'हाँ', 'ठीक है', 'समझ गया', 'धन्यवाद', 'बिल्कुल', 'जरूर',
    'एक मिनट', 'नमस्ते', 'बताइए', 'ठीक है, बताइए',
  ],
  'en-IN': [
    'Sure', 'Okay', 'Got it', 'I understand', 'Absolutely',
    'Thank you', 'Of course', 'One moment', 'Great', 'Alright',
    'That\'s great', 'No problem',
  ],
};

/**
 * Pre-warm the cache with common short phrases for a given voice + language.
 * Runs fire-and-forget in the background — doesn't block session startup.
 * @param {string} speaker   e.g. 'pooja'
 * @param {string} langCode  e.g. 'te-IN'
 */
async function prewarmTtsCache(speaker = 'shubh', langCode = 'te-IN', model = 'bulbul:v3') {
  const phrases = PREWARM_PHRASES[langCode] || PREWARM_PHRASES['te-IN'];
  let warmed = 0;
  for (const text of phrases) {
    const key = _cacheKey(text, speaker, langCode);
    if (_ttsCache.has(key)) continue; // already warm
    try {
      const audio64 = await _callSarvam(text, speaker, model, langCode);
      _cacheSet(key, audio64);
      warmed++;
    } catch {
      // Pre-warm failures are non-fatal
    }
  }
  if (warmed > 0) {
    logger.info('tts_prewarm_done', { speaker, langCode, warmed });
  }
}

// ─── Core Sarvam API call (no cache) ─────────────────────────────────────────
async function _callSarvam(text, speaker, model, languageCode) {
  const payload = {
    text,
    target_language_code: languageCode || 'te-IN',
    speaker,
    model,
    pace: 1.0,
    speech_sample_rate: 16000,
    enable_preprocessing: false,
    output_audio_codec: 'mp3',
  };

  const response = await axios.post(SARVAM_TTS_STREAM_URL, payload, {
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': process.env.SARVAM_API_KEY,
    },
    timeout: 30000,
    responseType: 'arraybuffer',
    httpsAgent: _httpsAgent,
  });

  if (!response.data || response.data.byteLength === 0) {
    throw new Error('Sarvam TTS returned no audio data');
  }
  return Buffer.from(response.data).toString('base64');
}

// ─── Public: synthesizeSpeech ─────────────────────────────────────────────────
/**
 * Converts text to speech. Checks the LRU cache first; only hits Sarvam on a
 * miss. Short texts (≤ MAX_LEN) are cached for reuse across calls.
 *
 * @param {string} text
 * @param {string} speaker
 * @param {string} model
 * @param {string} languageCode
 * @returns {Promise<string>} Base64-encoded MP3 audio
 */
async function synthesizeSpeech(text, speaker = 'shubh', model = 'bulbul:v3', languageCode = 'te-IN') {
  const shouldCache = text.length <= TTS_CACHE_MAX_LEN;
  const key = shouldCache ? _cacheKey(text, speaker, languageCode) : null;

  // ── Cache hit ────────────────────────────────────────────────────────────
  if (key) {
    const cached = _cacheGet(key);
    if (cached) {
      _cacheHits++;
      logger.info('tts_cache_hit', { speaker, languageCode, chars: text.length, hits: _cacheHits });
      return cached;
    }
  }

  // ── Cache miss → call Sarvam ─────────────────────────────────────────────
  _cacheMisses++;
  logger.info('tts_request', { model, speaker, languageCode, chars: text.length, cacheSize: _ttsCache.size });

  try {
    const audio64 = await _callSarvam(text, speaker, model, languageCode);
    logger.info('tts_success', { chars: text.length, model, speaker });

    if (key) _cacheSet(key, audio64);
    return audio64;

  } catch (err) {
    const body = err.response?.data;
    let parsedBody = '';
    if (body && Buffer.isBuffer(body)) {
      parsedBody = body.toString('utf8');
    } else if (body && body instanceof ArrayBuffer) {
      parsedBody = Buffer.from(body).toString('utf8');
    } else {
      parsedBody = JSON.stringify(body);
    }
    logger.error('tts_error', { status: err.response?.status, body: parsedBody });
    throw new Error(`Sarvam TTS stream failed with status ${err.response?.status || 'unknown'}`);
  }
}

// ─── Stats for /health ────────────────────────────────────────────────────────
function getTtsCacheStats() {
  const total = _cacheHits + _cacheMisses;
  return {
    size:     _ttsCache.size,
    maxSize:  TTS_CACHE_MAX,
    hits:     _cacheHits,
    misses:   _cacheMisses,
    hitRate:  total > 0 ? Math.round((_cacheHits / total) * 100) : 0,
  };
}

module.exports = { synthesizeSpeech, prewarmTtsCache, getTtsCacheStats };
