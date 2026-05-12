const axios = require('axios');
const { logger } = require('../utils/logger');

const SARVAM_TTS_STREAM_URL = 'https://api.sarvam.ai/text-to-speech/stream';

/**
 * Converts text to speech using Sarvam AI HTTP streaming TTS endpoint.
 * @param {string} text - Telugu text to synthesize
 * @returns {Promise<string>} Base64-encoded MP3 audio
 */
async function synthesizeSpeech(text, speaker = 'shubh', model = 'bulbul:v3', languageCode = 'te-IN') {
  const payload = {
    text,
    target_language_code: languageCode || 'te-IN',
    speaker,
    model,
    pace: 1.0,
    speech_sample_rate: 16000,
    // Preprocessing adds ~200-300 ms per call. The LLM already outputs clean
    // Telugu script so normalization is not needed here.
    enable_preprocessing: false,
    output_audio_codec: 'mp3',
  };

  logger.info('tts_request', { model, speaker, languageCode, chars: text.length });

  try {
    const response = await axios.post(SARVAM_TTS_STREAM_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': process.env.SARVAM_API_KEY,
      },
      timeout: 30000,
      responseType: 'arraybuffer',
    });

    if (!response.data || response.data.byteLength === 0) {
      throw new Error('Sarvam TTS returned no audio data');
    }
    logger.info('tts_success', { bytes: response.data.byteLength, model, speaker });
    return Buffer.from(response.data).toString('base64');

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
    throw new Error(
      `Sarvam TTS stream failed with status ${err.response?.status || 'unknown'}`
    );
  }
}

module.exports = { synthesizeSpeech };
