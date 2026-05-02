const axios = require('axios');

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
    enable_preprocessing: true,
    output_audio_codec: 'mp3',
  };

  console.log('[TTS Stream] Sending payload:', JSON.stringify(payload));

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
    console.log('[TTS Stream] Received bytes:', response.data.byteLength);
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
    console.error('[Sarvam TTS Stream Error] Status:', err.response?.status);
    console.error('[Sarvam TTS Stream Error] Body:', parsedBody);
    throw new Error(
      `Sarvam TTS stream failed with status ${err.response?.status || 'unknown'}`
    );
  }
}

module.exports = { synthesizeSpeech };
