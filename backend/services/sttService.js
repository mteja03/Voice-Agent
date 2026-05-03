const axios = require('axios');
const FormData = require('form-data');
const { logger } = require('../utils/logger');

const SARVAM_STT_URL = 'https://api.sarvam.ai/speech-to-text';

/**
 * Transcribes audio using Sarvam AI STT.
 *
 * Feature 6 — Fallback STT language detection:
 *   Pass languageCode='te-IN' for the primary attempt (best for Telugu).
 *   The caller can retry with languageCode='unknown' if the first result
 *   looks like it contains no Telugu characters (mixed / English speech).
 *
 * @param {Buffer} audioBuffer  - Raw audio bytes
 * @param {string} mimetype     - MIME type of the audio
 * @param {string} model        - Sarvam STT model (e.g. 'saarika:v2.5')
 * @param {string} languageCode - BCP-47 language code, or 'unknown' for auto
 */
async function transcribeAudio(
  audioBuffer,
  mimetype = 'audio/wav',
  model = 'saaras:v3',
  languageCode = 'te-IN'
) {
  const ext = mimetype.includes('wav') ? 'wav'
    : mimetype.includes('mp4') || mimetype.includes('m4a') ? 'mp4'
    : mimetype.includes('ogg') ? 'ogg'
    : 'webm';

  logger.info('stt_request', { bytes: audioBuffer.length, ext, model, languageCode });

  const form = new FormData();
  form.append('file', audioBuffer, {
    filename: `audio.${ext}`,
    contentType: mimetype,
  });
  form.append('model', model);
  
  // Saaras v3 requires the mode parameter
  if (model.includes('saaras')) {
    form.append('mode', 'transcribe');
  }

  // Only send language_code when it's not 'unknown' — omitting it triggers
  // Sarvam's automatic language detection, which handles mixed Telugu/English.
  if (languageCode && languageCode !== 'unknown') {
    form.append('language_code', languageCode);
  }

  // Enable code-switching so the model handles Telugu+English naturally
  form.append('with_disfluencies', 'false');

  try {
    const response = await axios.post(SARVAM_STT_URL, form, {
      headers: {
        ...form.getHeaders(),
        'api-subscription-key': process.env.SARVAM_API_KEY,
      },
      timeout: 30000,
    });

    const transcript = response.data?.transcript || response.data?.text || '';
    logger.info('stt_result', { languageCode, hasTranscript: Boolean(transcript), detected: response.data?.language_code });

    if (!transcript) return '';
    return transcript.trim();

  } catch (err) {
    const body = err.response?.data;
    logger.error('stt_error', { status: err.response?.status, body });
    throw new Error(
      body?.error?.message ||
      body?.message ||
      err.message ||
      `Sarvam STT failed (${err.response?.status || 'unknown'})`
    );
  }
}

module.exports = { transcribeAudio };
