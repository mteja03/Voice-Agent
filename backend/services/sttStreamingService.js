const { SarvamAIClient } = require('sarvamai');
const { logger } = require('../utils/logger');

// ─── Sarvam streaming STT (WebSocket) ─────────────────────────────────────────
//
// The batch STT path (sttService.transcribeAudio) only starts its ~1.6 s clock
// AFTER the user stops speaking, because the whole utterance is uploaded at
// speech-end. Streaming STT keeps a WebSocket open and forwards raw PCM frames
// WHILE the user speaks, so by the time they stop, the transcript is already
// (nearly) finalized — saving ~0.8-1.2 s per turn.
//
// This wraps the official `sarvamai` SDK's speechToTextStreaming client. It is
// only used when the client opts in via the `streamingStt` feature flag; the
// batch path remains the default and untouched.
//
// Audio contract: caller pushes base64-encoded 16-bit little-endian mono PCM at
// `sampleRate` (16 kHz to match the frontend VAD). No WAV headers per frame —
// the codec is declared once at connect time as pcm_s16le.

/**
 * Open a streaming STT session.
 *
 * @param {object}  opts
 * @param {string}  opts.languageCode  BCP-47 (e.g. 'te-IN') or 'unknown' for auto-detect
 * @param {string}  opts.model         Sarvam STT model (default 'saarika:v2.5')
 * @param {number}  opts.sampleRate    PCM sample rate (default 16000)
 * @returns {{ ready: Promise<void>, push: (b64:string)=>void, finalize: ()=>Promise<string>, close: ()=>void, getTranscript: ()=>string }}
 */
function createSttStream({ languageCode = 'unknown', model = 'saarika:v2.5', sampleRate = 16000 } = {}) {
  const apiKey = process.env.SARVAM_API_KEY;
  const client = new SarvamAIClient({ apiSubscriptionKey: apiKey });

  let socket = null;
  let closed = false;
  // Sarvam emits transcript segments on `type: 'data'` messages as it finalizes
  // chunks of the incoming stream. We concatenate them into the running result.
  let transcript = '';

  function appendSegment(seg) {
    const s = String(seg || '').trim();
    if (s) transcript = transcript ? `${transcript} ${s}` : s;
  }

  const ready = (async () => {
    socket = await client.speechToTextStreaming.connect({
      'language-code': languageCode,
      model,
      input_audio_codec: 'pcm_s16le',
      sample_rate: String(sampleRate),
      'Api-Subscription-Key': apiKey,
    });

    socket.on('message', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'data' && msg.data?.transcript) {
        appendSegment(msg.data.transcript);
      } else if (msg.type === 'error') {
        logger.warn('stt_stream_server_error', { err: msg.data?.message || 'unknown' });
      }
    });
    socket.on('error', (err) => logger.warn('stt_stream_socket_error', { err: err?.message }));

    // Ensure the connection is fully open before the caller starts pushing frames.
    if (typeof socket.waitForOpen === 'function') {
      await socket.waitForOpen();
    }
  })();

  return {
    ready,

    /** Forward one base64 PCM16 frame to Sarvam. No-op if not yet open / closed. */
    push(base64Pcm) {
      if (closed || !socket || !base64Pcm) return;
      try {
        socket.transcribe({ audio: base64Pcm, sample_rate: sampleRate });
      } catch (err) {
        logger.warn('stt_stream_push_failed', { err: err.message });
      }
    },

    /**
     * Flush the buffer to force finalization of any partial segment, wait briefly
     * for the trailing `data` message, and return the full accumulated transcript.
     */
    async finalize() {
      if (closed || !socket) return transcript.trim();
      try {
        if (typeof socket.flush === 'function') socket.flush();
      } catch (err) {
        logger.warn('stt_stream_flush_failed', { err: err.message });
      }
      // Give Sarvam a moment to emit the final post-flush transcript segment(s).
      await new Promise((r) => setTimeout(r, 350));
      return transcript.trim();
    },

    /** Close the underlying WebSocket. Safe to call multiple times. */
    close() {
      closed = true;
      try { socket?.close(); } catch { /* already closed */ }
    },

    getTranscript() { return transcript.trim(); },
  };
}

module.exports = { createSttStream };
