import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Download, Loader2, Music2 } from 'lucide-react';

export default function CallRecordingPair({
  userUrl,
  agentUrl,
  density = 'default',
  sticky = false,
  className = '',
}) {
  const [reviewUrl, setReviewUrl] = useState(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildError, setBuildError] = useState('');
  const [playbackError, setPlaybackError] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef(null);

  const hasUser = Boolean(userUrl);
  const hasAgent = Boolean(agentUrl);
  const hasAny = hasUser || hasAgent;

  const pad = density === 'compact' ? 'p-3' : 'p-4';
  const titleClass =
    density === 'compact'
      ? 'text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-500'
      : 'text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-500';
  const clipClass = density === 'compact' ? 'h-8 w-full' : 'h-10 w-full';

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;
    const ctrl = new AbortController();

    async function buildReviewClip() {
      setPlaybackError(false);
      setBuildError('');
      setReviewUrl(null);

      if (!hasAny) return;

      if (hasUser && !hasAgent) {
        setReviewUrl(userUrl);
        return;
      }
      if (!hasUser && hasAgent) {
        setReviewUrl(agentUrl);
        return;
      }

      setIsBuilding(true);
      try {
        const stitchedBlob = await stitchAudioSequentially(userUrl, agentUrl, ctrl.signal);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(stitchedBlob);
        setReviewUrl(objectUrl);
      } catch (error) {
        if (cancelled || ctrl.signal.aborted) return;
        setBuildError(
          'Could not build a single review clip. Link may be expired or blocked. Use download links below or refresh for new signed URLs.'
        );
      } finally {
        if (!cancelled) setIsBuilding(false);
      }
    }

    buildReviewClip();

    return () => {
      cancelled = true;
      ctrl.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userUrl, agentUrl, hasAny, hasUser, hasAgent]);

  const sourceLabel = useMemo(() => {
    if (hasUser && hasAgent && reviewUrl?.startsWith('blob:')) {
      return 'Single review clip (customer + agent)';
    }
    if (hasUser && !hasAgent) return 'Customer recording';
    if (!hasUser && hasAgent) return 'Agent recording';
    if (hasUser && hasAgent) return 'Review clip';
    return '';
  }, [hasUser, hasAgent, reviewUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, reviewUrl]);

  if (!hasAny) {
    return (
      <p
        className={`rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-500 ${className}`}
      >
        No recordings for this call.
      </p>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-slate-200/90 bg-white/80 ${pad} shadow-sm dark:border-gray-800/80 dark:bg-gray-900/50 ${
        sticky ? 'sticky top-0 z-[2]' : ''
      } ${className}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className={titleClass}>Call review recording</p>
        <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600 dark:bg-gray-800 dark:text-gray-400">
          <Music2 className="h-3 w-3" aria-hidden />
          {sourceLabel}
        </div>
      </div>

      {isBuilding ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Preparing single audio clip...
        </div>
      ) : reviewUrl && !playbackError ? (
        <>
          <audio
            ref={audioRef}
            controls
            className={clipClass}
            preload="metadata"
            src={reviewUrl}
            onError={() => setPlaybackError(true)}
          />
          <div className="mt-2 flex items-center gap-2 text-[11px]">
            <span className="text-slate-500 dark:text-gray-400">Speed</span>
            {[1, 1.5, 2].map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => setPlaybackRate(rate)}
                className={`rounded-full border px-2 py-0.5 font-semibold transition-colors ${
                  playbackRate === rate
                    ? 'border-brand-500/60 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </>
      ) : (
        <PlaybackError
          density={density}
          hint={
            buildError ||
            'Playback unavailable. Link may be expired, missing, or blocked by browser/network policy.'
          }
        />
      )}

      {(userUrl || agentUrl) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          {userUrl ? (
            <a
              href={userUrl}
              download
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <Download className="h-3 w-3" aria-hidden />
              Customer track
            </a>
          ) : null}
          {agentUrl ? (
            <a
              href={agentUrl}
              download
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <Download className="h-3 w-3" aria-hidden />
              Agent track
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PlaybackError({ density, hint }) {
  return (
    <div
      className={`rounded-xl border border-amber-200/90 bg-amber-50/80 ${
        density === 'compact' ? 'p-2' : 'p-3'
      } dark:border-amber-900/40 dark:bg-amber-950/25`}
    >
      <div className="flex gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">Playback unavailable</p>
          <p className="mt-0.5 text-[11px] leading-snug text-amber-900/80 dark:text-amber-100/80">{hint}</p>
        </div>
      </div>
    </div>
  );
}

async function stitchAudioSequentially(firstUrl, secondUrl, signal) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('AudioContext is not supported');
  const audioContext = new AudioCtx();

  try {
    const [first, second] = await Promise.all([
      loadDecodedBuffer(audioContext, firstUrl, signal),
      loadDecodedBuffer(audioContext, secondUrl, signal),
    ]);
    const merged = concatAudioBuffers(audioContext, first, second);
    const wavArrayBuffer = encodeWav(merged);
    return new Blob([wavArrayBuffer], { type: 'audio/wav' });
  } finally {
    await audioContext.close();
  }
}

async function loadDecodedBuffer(audioContext, url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return audioContext.decodeAudioData(arrayBuffer.slice(0));
}

function concatAudioBuffers(audioContext, a, b) {
  const sampleRate = a.sampleRate;
  const totalLength = a.length + b.length;
  const channels = Math.max(a.numberOfChannels, b.numberOfChannels);
  const out = audioContext.createBuffer(channels, totalLength, sampleRate);

  for (let channel = 0; channel < channels; channel += 1) {
    const outData = out.getChannelData(channel);
    const aData = a.getChannelData(Math.min(channel, a.numberOfChannels - 1));
    const bData = b.getChannelData(Math.min(channel, b.numberOfChannels - 1));
    outData.set(aData, 0);
    outData.set(bData, a.length);
  }
  return out;
}

function encodeWav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1;
  const bitDepth = 16;

  const samples = interleaveChannels(audioBuffer);
  const blockAlign = (numChannels * bitDepth) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

function interleaveChannels(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length * numChannels;
  const result = new Float32Array(length);
  const channelData = [];
  for (let c = 0; c < numChannels; c += 1) {
    channelData.push(audioBuffer.getChannelData(c));
  }
  let idx = 0;
  for (let i = 0; i < audioBuffer.length; i += 1) {
    for (let c = 0; c < numChannels; c += 1) {
      result[idx] = channelData[c][i];
      idx += 1;
    }
  }
  return result;
}

function writeString(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
