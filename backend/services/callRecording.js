const { getSupabase } = require('./supabaseClient');
const { logger } = require('../utils/logger');

const BUCKET = process.env.CALL_RECORDINGS_BUCKET || 'call-recordings';

/** @type {Map<string, { userSegments: { mime: string, data: Buffer }[], agentMp3: Buffer[] }>} */
const sessions = new Map();

function sessionKey(companyId, sessionId) {
  return `${companyId}:${sessionId}`;
}

function ensureSession(companyId, sessionId) {
  const k = sessionKey(companyId, sessionId);
  if (!sessions.has(k)) {
    sessions.set(k, { userSegments: [], agentMp3: [] });
  }
  return sessions.get(k);
}

/**
 * Normalize binary payloads from Socket.IO (Buffer, ArrayBuffer, typed array, serialized Buffer).
 * @param {unknown} audioBuffer
 * @returns {Buffer|null}
 */
function normalizeSocketAudioBuffer(audioBuffer) {
  if (audioBuffer == null) return null;
  if (Buffer.isBuffer(audioBuffer)) return audioBuffer;
  if (audioBuffer instanceof ArrayBuffer) return Buffer.from(audioBuffer);
  if (ArrayBuffer.isView(audioBuffer)) {
    return Buffer.from(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.byteLength);
  }
  if (typeof audioBuffer === 'object' && audioBuffer.type === 'Buffer' && Array.isArray(audioBuffer.data)) {
    return Buffer.from(audioBuffer.data);
  }
  return null;
}

function appendUser(companyId, sessionId, buffer, mimeType = 'audio/wav') {
  if (!buffer || !buffer.length) return;
  const s = ensureSession(companyId, sessionId);
  s.userSegments.push({ mime: mimeType || 'audio/wav', data: Buffer.from(buffer) });
}

function appendAgent(companyId, sessionId, mp3Buffer) {
  if (!mp3Buffer || !mp3Buffer.length) return;
  const s = ensureSession(companyId, sessionId);
  s.agentMp3.push(Buffer.from(mp3Buffer));
}

function discard(companyId, sessionId) {
  sessions.delete(sessionKey(companyId, sessionId));
}

/**
 * @returns {{ pcm: Buffer, sampleRate: number, channels: number, bitsPerSample: number } | null}
 */
function extractWavPcm(buf) {
  if (!buf || buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') return null;
  let offset = 12;
  let fmt = null;
  let pcm = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > buf.length) break;
    if (id === 'fmt ') fmt = buf.subarray(start, start + size);
    if (id === 'data') pcm = buf.subarray(start, start + size);
    offset = start + size;
  }
  if (!fmt || !pcm || fmt.length < 16) return null;
  const audioFormat = fmt.readUInt16LE(0);
  if (audioFormat !== 1) return null; // only PCM
  const channels = fmt.readUInt16LE(2);
  const sampleRate = fmt.readUInt32LE(4);
  const bitsPerSample = fmt.readUInt16LE(14);
  return { pcm, sampleRate, channels, bitsPerSample };
}

function buildWavFromPcm(pcm, sampleRate, channels, bitsPerSample) {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length;
  const out = Buffer.alloc(44 + dataSize);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + dataSize, 4);
  out.write('WAVE', 8);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(channels, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(byteRate, 28);
  out.writeUInt16LE(blockAlign, 32);
  out.writeUInt16LE(bitsPerSample, 34);
  out.write('data', 36);
  out.writeUInt32LE(dataSize, 40);
  pcm.copy(out, 44);
  return out;
}

function mergeUserAudio(segments) {
  if (!segments.length) return { body: null, ext: null, contentType: null };
  const allWav = segments.every((s) => (s.mime || '').includes('wav'));
  if (allWav) {
    const parsed = segments.map((s) => extractWavPcm(s.data)).filter(Boolean);
    if (parsed.length === segments.length && parsed.length > 0) {
      const { sampleRate, channels, bitsPerSample } = parsed[0];
      const sameFormat = parsed.every(
        (p) => p.sampleRate === sampleRate && p.channels === channels && p.bitsPerSample === bitsPerSample
      );
      if (sameFormat) {
        const pcm = Buffer.concat(parsed.map((p) => p.pcm));
        const wav = buildWavFromPcm(pcm, sampleRate, channels, bitsPerSample);
        return { body: wav, ext: 'wav', contentType: 'audio/wav' };
      }
    }
  }
  const body = Buffer.concat(segments.map((s) => s.data));
  const mime0 = segments[0].mime || 'application/octet-stream';
  if (mime0.includes('webm')) return { body, ext: 'webm', contentType: 'audio/webm' };
  if (mime0.includes('mp4') || mime0.includes('m4a')) return { body, ext: 'm4a', contentType: 'audio/mp4' };
  return { body, ext: 'bin', contentType: 'application/octet-stream' };
}

/**
 * Upload merged recordings and return storage paths (object paths inside bucket).
 * @returns {Promise<{ recordingUserPath: string|null, recordingAgentPath: string|null }|null>}
 */
async function finalizeUpload(companyId, sessionId, callId) {
  const k = sessionKey(companyId, sessionId);
  const state = sessions.get(k);
  if (!state) return null;

  const hasUser = state.userSegments.length > 0;
  const agentBuf = state.agentMp3.length ? Buffer.concat(state.agentMp3) : null;
  const hasAgent = agentBuf && agentBuf.length > 0;

  if (!hasUser && !hasAgent) {
    sessions.delete(k);
    return null;
  }

  const supabase = getSupabase();
  const base = `${companyId}/${callId}`;
  let recordingUserPath = null;
  let recordingAgentPath = null;

  try {
    if (hasUser) {
      const merged = mergeUserAudio(state.userSegments);
      if (merged.body?.length) {
        recordingUserPath = `${base}/user.${merged.ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(recordingUserPath, merged.body, {
          contentType: merged.contentType,
          upsert: true,
        });
        if (error) throw error;
      }
    }
    if (hasAgent) {
      recordingAgentPath = `${base}/agent.mp3`;
      const { error } = await supabase.storage.from(BUCKET).upload(recordingAgentPath, agentBuf, {
        contentType: 'audio/mpeg',
        upsert: true,
      });
      if (error) throw error;
    }
    sessions.delete(k);
  } catch (err) {
    sessions.delete(k);
    logger.warn('call_recording_upload_failed', {
      companyId,
      sessionId,
      callId,
      message: err.message,
      bucket: BUCKET,
    });
    return null;
  }

  if (!recordingUserPath && !recordingAgentPath) return null;
  return { recordingUserPath, recordingAgentPath };
}

module.exports = {
  BUCKET,
  normalizeSocketAudioBuffer,
  appendUser,
  appendAgent,
  discard,
  finalizeUpload,
};
