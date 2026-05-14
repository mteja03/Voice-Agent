import { useState, useEffect, useRef, useCallback } from 'react';
import { useMicVAD } from '@ricky0123/vad-react';
import { socket } from '../services/socket';
import { getAuthToken } from '../services/auth';

// VAD needs SharedArrayBuffer (for ONNX WASM threads) — unavailable on iOS Safari
// without COOP/COEP headers, which Apple blocks in WKWebView / mobile browsers.
const VAD_LIKELY_SUPPORTED = (() => {
  try {
    return (
      typeof SharedArrayBuffer !== 'undefined' &&
      typeof WebAssembly !== 'undefined' &&
      typeof AudioContext !== 'undefined'
    );
  } catch {
    return false;
  }
})();

function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    '',
  ];
  for (const t of candidates) {
    if (!t || MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export function useVoiceAgent(sessionId, settings, activeLead, onCallSummary) {
  const [status, setStatus] = useState('idle'); // idle, listening, processing, speaking
  const [processingStage, setProcessingStage] = useState(null); // 'transcribing' | 'generating' | 'synthesizing' | null
  const [socketReady, setSocketReady] = useState(() => Boolean(socket.connected));
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [turns, setTurns] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const [closeDetected, setCloseDetected] = useState(false);
  const [callNotice, setCallNotice] = useState('');
  const [lastCallSummary, setLastCallSummary] = useState(null);

  const turnIdRef = useRef(0);
  const socketRef = useRef(null);
  const audioQueueRef = useRef([]);        // raw fallback queue (legacy path)
  const decodedQueueRef = useRef([]);      // pre-decoded AudioBuffer[] — main playback queue
  const scheduledEndTimeRef = useRef(0);  // AudioContext timestamp when the last chunk ends
  const isPlayingRef = useRef(false);
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const hasSentIntroRef = useRef(false);
  const suppressBargeInUntilRef = useRef(0);
  const closingPlaybackUntilRef = useRef(0);
  const pendingAutoEndRef = useRef(false);
  const latestSettingsRef = useRef(settings);
  const latestLeadRef = useRef(activeLead);
  const onCallSummaryRef = useRef(onCallSummary);
  const pendingTurnRef = useRef(false);
  const lastProcessEmitAtRef = useRef(0);
  const assistantBusyRef = useRef(false);
  const autoListenEnabledRef = useRef(false);
  const introPendingRef = useRef(false);
  const vadRef = useRef(null);
  const playNextAudioRef = useRef(null);
  const disconnectWarnTimerRef = useRef(null);
  // Reconnect tracking
  const wasListeningBeforeDropRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  // PTT (push-to-talk) — used when VAD is not supported (iOS Safari)
  const mediaRecorderRef = useRef(null);
  const mediaChunksRef = useRef([]);
  const mediaStreamRef = useRef(null);

  // Cleanup audio context on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      // Stop any in-progress PTT recording
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const stopAudioPlayback = useCallback(() => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch {}
      sourceNodeRef.current = null;
    }
    audioQueueRef.current = [];
    decodedQueueRef.current = [];
    scheduledEndTimeRef.current = 0;
    isPlayingRef.current = false;
    setStatus('idle');
  }, []);

  useEffect(() => { latestSettingsRef.current = settings; }, [settings]);
  useEffect(() => { latestLeadRef.current = activeLead; }, [activeLead]);
  useEffect(() => { onCallSummaryRef.current = onCallSummary; }, [onCallSummary]);

  // ── Socket setup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    socketRef.current = socket;

    const handleConnect = () => {
      setSocketReady(true);
      setReconnecting(false);
      setReconnectAttempt(0);
      reconnectAttemptRef.current = 0;
      if (disconnectWarnTimerRef.current) {
        clearTimeout(disconnectWarnTimerRef.current);
        disconnectWarnTimerRef.current = null;
      }
      setErrorMsg(null);
      console.log('Connected to Voice Agent Backend');
      // Auto-resume VAD listening if the connection dropped mid-call
      if (wasListeningBeforeDropRef.current) {
        wasListeningBeforeDropRef.current = false;
        setTimeout(() => {
          if (autoListenEnabledRef.current && vadRef.current && !vadRef.current.listening) {
            vadRef.current.start();
          }
        }, 400);
      }
    };

    const handleDisconnect = (reason) => {
      setSocketReady(false);
      // Remember if we were in an active listening state so we can resume after reconnect
      wasListeningBeforeDropRef.current = autoListenEnabledRef.current;
      pendingTurnRef.current = false;
      assistantBusyRef.current = false;
      introPendingRef.current = false;
      setStatus('idle');
      if (reason === 'io client disconnect') {
        return;
      }
      // Show reconnecting state immediately for server-side drops; delay for
      // transient transport issues that self-heal in < 1s.
      if (disconnectWarnTimerRef.current) clearTimeout(disconnectWarnTimerRef.current);
      const delay = reason === 'io server disconnect' ? 0 : 1200;
      disconnectWarnTimerRef.current = setTimeout(() => {
        disconnectWarnTimerRef.current = null;
        if (!socketRef.current?.connected) {
          setReconnecting(true);
          // Also show a fallback error banner if still disconnected after 10s
          setTimeout(() => {
            if (!socketRef.current?.connected) {
              setErrorMsg('Connection dropped. Reconnecting… If this persists, check your internet connection.');
            }
          }, 10000);
        }
      }, delay);
    };

    const handleConnectError = (err) => {
      setSocketReady(false);
      pendingTurnRef.current = false;
      assistantBusyRef.current = false;
      introPendingRef.current = false;
      if (!reconnectAttemptRef.current) {
        setErrorMsg(`Unable to connect to backend: ${err.message}`);
      }
      setStatus('idle');
    };

    // Socket.IO manager-level events for reconnect attempt tracking
    const handleReconnectAttempt = (attempt) => {
      reconnectAttemptRef.current = attempt;
      setReconnectAttempt(attempt);
      setReconnecting(true);
    };
    const handleReconnectSuccess = () => {
      setReconnecting(false);
      setReconnectAttempt(0);
      reconnectAttemptRef.current = 0;
    };

    const handleTranscript = ({ transcript }) => {
      setTurns(prev => [...prev, { id: turnIdRef.current++, transcript, aiText: '' }]);
      setStatus('processing');
      setProcessingStage('generating'); // STT done → now generating LLM reply
    };

    const handleTtsAudioChunk = ({ audioBuffer, text }) => {
      assistantBusyRef.current = true;
      introPendingRef.current = false;
      setProcessingStage(null);
      vadRef.current?.pause();
      setTurns(prev => {
        const newTurns = [...prev];
        const lastTurn = newTurns[newTurns.length - 1];
        if (lastTurn) {
          lastTurn.aiText = (lastTurn.aiText + ' ' + text).trim();
        } else {
          newTurns.push({ id: turnIdRef.current++, transcript: '', aiText: text, isIntro: true });
        }
        return newTurns;
      });

      if (audioBuffer) {
        // Normalise the various binary formats Socket.IO may deliver
        const raw = normalizeToArrayBuffer(audioBuffer);
        const ac = audioContextRef.current;
        if (raw && ac && ac.state !== 'closed') {
          // Decode immediately on arrival — no decode delay on playback start.
          ac.decodeAudioData(raw.slice(0))
            .then(decoded => {
              decodedQueueRef.current.push(decoded);
              playNextAudioRef.current?.();
            })
            .catch(() => {
              // Fallback: legacy raw-buffer path (decodes at playback time)
              audioQueueRef.current.push(audioBuffer);
              playNextAudioRef.current?.();
            });
        } else {
          // AudioContext not ready yet — queue raw for decode-at-play fallback
          audioQueueRef.current.push(audioBuffer);
          playNextAudioRef.current?.();
        }
      }
    };

    const handleResponseComplete = ({ shouldEndCall, latency }) => {
      pendingTurnRef.current = false;
      assistantBusyRef.current = false;
      introPendingRef.current = false;
      setProcessingStage(null);
      // Attach latency to the most recent turn so each bubble can show its response time.
      if (latency) {
        setTurns(prev => {
          if (!prev.length) return prev;
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], latency };
          return updated;
        });
      }
      setCloseDetected(Boolean(shouldEndCall));
      if (latestSettingsRef.current?.autoEndCall && shouldEndCall) {
        closingPlaybackUntilRef.current = Date.now() + 2200;
        suppressBargeInUntilRef.current = Math.max(suppressBargeInUntilRef.current, closingPlaybackUntilRef.current);
        pendingAutoEndRef.current = true;
      }
    };

    const handleNoSpeech = () => {
      pendingTurnRef.current = false;
      assistantBusyRef.current = false;
      introPendingRef.current = false;
      setProcessingStage(null);
      setStatus('idle');
    };

    const handleSocketError = (payload) => {
      if (payload?.type === 'AUTH') return;
      const message = typeof payload?.message === 'string' ? payload.message : 'Something went wrong';
      pendingTurnRef.current = false;
      assistantBusyRef.current = false;
      introPendingRef.current = false;
      setProcessingStage(null);
      setErrorMsg(message);
      setStatus('idle');
    };

    const handleSessionCleared = () => {
      setTurns([]);
      stopAudioPlayback();
      setStatus('idle');
    };

    const handleCallSummary = ({ summary }) => {
      setLastCallSummary(summary && typeof summary === 'object' ? summary : null);
      setCallNotice('Call ended and summary saved.');
      setTimeout(() => setCallNotice(''), 4000);
      if (typeof onCallSummaryRef.current === 'function') {
        onCallSummaryRef.current(summary);
      }
    };

    socketRef.current.on('connect', handleConnect);
    socketRef.current.on('disconnect', handleDisconnect);
    socketRef.current.on('connect_error', handleConnectError);
    socketRef.current.on('transcript', handleTranscript);
    socketRef.current.on('tts_audio_chunk', handleTtsAudioChunk);
    socketRef.current.on('response_complete', handleResponseComplete);
    socketRef.current.on('no_speech', handleNoSpeech);
    socketRef.current.on('error', handleSocketError);
    socketRef.current.on('session_cleared', handleSessionCleared);
    socketRef.current.on('call_summary', handleCallSummary);
    // Manager-level reconnect events
    socketRef.current.io.on('reconnect_attempt', handleReconnectAttempt);
    socketRef.current.io.on('reconnect', handleReconnectSuccess);

    if (getAuthToken()) {
      socketRef.current.connect();
      setSocketReady(socketRef.current.connected);
    }

    return () => {
      if (disconnectWarnTimerRef.current) {
        clearTimeout(disconnectWarnTimerRef.current);
        disconnectWarnTimerRef.current = null;
      }
      if (!socketRef.current) return;
      socketRef.current.off('connect', handleConnect);
      socketRef.current.off('disconnect', handleDisconnect);
      socketRef.current.off('connect_error', handleConnectError);
      socketRef.current.off('transcript', handleTranscript);
      socketRef.current.off('tts_audio_chunk', handleTtsAudioChunk);
      socketRef.current.off('response_complete', handleResponseComplete);
      socketRef.current.off('no_speech', handleNoSpeech);
      socketRef.current.off('error', handleSocketError);
      socketRef.current.off('session_cleared', handleSessionCleared);
      socketRef.current.off('call_summary', handleCallSummary);
      socketRef.current.io.off('reconnect_attempt', handleReconnectAttempt);
      socketRef.current.io.off('reconnect', handleReconnectSuccess);
    };
  }, [stopAudioPlayback]);

  // ── Audio Playback (Web Audio API, gapless queue) ─────────────────────────
  //
  // Two-tier queue:
  //   decodedQueueRef  — AudioBuffer[] already decoded (fast path, no gap)
  //   audioQueueRef    — raw bytes fallback (decoded here, tiny gap)
  //
  // Gapless: each chunk is scheduled at scheduledEndTimeRef so the Web Audio
  // engine starts it at the exact moment the previous one ends.
  const playNextAudio = async () => {
    const hasDecoded = decodedQueueRef.current.length > 0;
    const hasRaw     = audioQueueRef.current.length > 0;
    if (isPlayingRef.current || (!hasDecoded && !hasRaw)) return;
    isPlayingRef.current = true;
    setStatus('speaking');

    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume().catch(() => {});
    }

    let audioBuffer;
    try {
      if (hasDecoded) {
        // Fast path — already decoded, no async work needed
        audioBuffer = decodedQueueRef.current.shift();
      } else {
        // Fallback: decode raw bytes (original path, adds ~15 ms)
        const raw = normalizeToArrayBuffer(audioQueueRef.current.shift());
        if (!raw) throw new Error('Unsupported audio chunk format');
        audioBuffer = await audioContextRef.current.decodeAudioData(raw.slice(0));
      }
    } catch (err) {
      console.error('Error decoding audio chunk', err);
      isPlayingRef.current = false;
      setStatus('idle');
      return;
    }

    const ac  = audioContextRef.current;
    const source = ac.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ac.destination);
    sourceNodeRef.current = source;

    // Schedule gaplessly: start at the exact moment the previous chunk ended.
    // The 5 ms offset prevents rounding errors when currentTime == scheduledEnd.
    const startAt = Math.max(ac.currentTime + 0.005, scheduledEndTimeRef.current);
    source.start(startAt);
    scheduledEndTimeRef.current = startAt + audioBuffer.duration;

    source.onended = () => {
      isPlayingRef.current = false;
      sourceNodeRef.current = null;
      const hasMore = decodedQueueRef.current.length > 0 || audioQueueRef.current.length > 0;
      if (hasMore) {
        playNextAudioRef.current?.();
      } else {
        scheduledEndTimeRef.current = 0;
        if (!pendingTurnRef.current) assistantBusyRef.current = false;
        setStatus('idle');
        if (autoListenEnabledRef.current) {
          if (VAD_LIKELY_SUPPORTED && vadRef.current && !vadRef.current.errored) {
            vadRef.current?.start();
          }
        }
        if (pendingAutoEndRef.current) {
          pendingAutoEndRef.current = false;
          if (socketRef.current?.connected) {
            setTimeout(() => {
              socketRef.current?.emit('end_call', {
                sessionId,
                lead: latestLeadRef.current || null,
              });
            }, 700);
          }
        }
      }
    };
  };
  playNextAudioRef.current = playNextAudio;

  // ── VAD (auto voice detection — desktop/Chrome/Firefox/Edge) ────────────
  const vad = useMicVAD({
    startOnLoad: false,
    workletURL: '/vad/vad.worklet.bundle.min.js',
    modelURL: '/vad/silero_vad.onnx',
    minSpeechMs: 200,
    // 350ms silence → audio sent (was 500ms — saves ~150ms every single turn)
    redemptionMs: 350,
    preSpeechPadMs: 120,
    ortConfig: (ort) => {
      ort.env.wasm.wasmPaths = '/vad/';
      ort.env.wasm.numThreads = 1;
    },
    onSpeechStart: () => {
      setStatus('listening');
    },
    onSpeechEnd: (audioData) => {
      if (assistantBusyRef.current || isPlayingRef.current || audioQueueRef.current.length > 0 || decodedQueueRef.current.length > 0) return;
      const speechDurationMs = (audioData.length / 16000) * 1000;
      if (speechDurationMs < 550) { setStatus('idle'); return; }
      if (pendingTurnRef.current) return;
      const now = Date.now();
      if (now - lastProcessEmitAtRef.current < 900) return;
      setStatus('processing');
      setProcessingStage('transcribing'); // audio sent → waiting for STT
      const pcm16 = new Int16Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        const s = Math.max(-1, Math.min(1, audioData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      const wavBlob = createWavBlob(pcm16, 16000);
      if (socketRef.current) {
        pendingTurnRef.current = true;
        assistantBusyRef.current = true;
        lastProcessEmitAtRef.current = now;
        socketRef.current.emit('process_audio', {
          audioBuffer: wavBlob,
          sessionId,
          sttModel: latestSettingsRef.current.sttModel,
          ttsModel: latestSettingsRef.current.ttsModel,
          ttsVoice: latestSettingsRef.current.ttsVoice,
          languageMode: latestSettingsRef.current.languageMode,
          agentName: latestSettingsRef.current.agentName,
          lead: latestLeadRef.current || null,
          mimeType: 'audio/wav',
        });
      }
    },
  });

  useEffect(() => { vadRef.current = vad; }, [vad]);

  // ── Push-to-Talk (iOS Safari and other VAD-unsupported environments) ──────
  const startPushToTalk = useCallback(async () => {
    if (!socketRef.current?.connected || pendingTurnRef.current || assistantBusyRef.current) return;
    if (mediaRecorderRef.current) return; // already recording

    try {
      // Unlock/create AudioContext on user gesture (required by iOS Safari)
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: 16000 },
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const mimeType = getSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) mediaChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const effectiveMimeType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(mediaChunksRef.current, { type: effectiveMimeType });
        mediaStreamRef.current?.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;

        if (blob.size < 800) {
          // Too short — likely a tap, not speech
          setStatus('idle');
          return;
        }
        if (!socketRef.current?.connected) { setStatus('idle'); return; }

        pendingTurnRef.current = true;
        assistantBusyRef.current = true;
        lastProcessEmitAtRef.current = Date.now();
        setStatus('processing');
        setProcessingStage('transcribing');

        socketRef.current.emit('process_audio', {
          audioBuffer: blob,
          sessionId,
          sttModel: latestSettingsRef.current.sttModel,
          ttsModel: latestSettingsRef.current.ttsModel,
          ttsVoice: latestSettingsRef.current.ttsVoice,
          languageMode: latestSettingsRef.current.languageMode,
          agentName: latestSettingsRef.current.agentName,
          lead: latestLeadRef.current || null,
          mimeType: effectiveMimeType,
        });
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setStatus('listening');
    } catch (err) {
      console.error('[PTT] Failed to start recording:', err);
      setErrorMsg('Microphone access denied. Please allow microphone in browser settings and try again.');
      setStatus('idle');
    }
  }, [sessionId]);

  const stopPushToTalk = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // ── Call lifecycle ────────────────────────────────────────────────────────
  const clearSession = useCallback(() => {
    if (socketRef.current) socketRef.current.emit('clear_session', { sessionId });
    hasSentIntroRef.current = false;
    autoListenEnabledRef.current = false;
    setCloseDetected(false);
    setLastCallSummary(null);
  }, [sessionId]);

  const retryConnection = useCallback(() => {
    setErrorMsg(null);
    if (getAuthToken() && socketRef.current && !socketRef.current.connected) {
      socketRef.current.connect();
    }
  }, []);

  const isPushToTalkMode = !VAD_LIKELY_SUPPORTED || Boolean(vad.errored);

  const startVoiceAssistant = useCallback(async () => {
    setLastCallSummary(null);
    autoListenEnabledRef.current = true;

    // Pre-warm AudioContext on the user gesture so the first audio chunk
    // plays immediately without the ~50ms creation overhead.
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      try {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume().catch(() => {});
        }
      } catch { /* ignore — will be created on first chunk */ }
    }

    if (!hasSentIntroRef.current && turns.length === 0 && socketRef.current?.connected) {
      hasSentIntroRef.current = true;
      suppressBargeInUntilRef.current = Date.now() + 2500;
      assistantBusyRef.current = true;
      introPendingRef.current = true;
      setStatus('processing');
      socketRef.current.emit('start_assistant', {
        sessionId,
        ttsModel: settings.ttsModel,
        ttsVoice: settings.ttsVoice,
        languageMode: settings.languageMode,
        introTemplate: settings.introTemplate,
        agentName: settings.agentName,
        lead: activeLead || null,
      });
    }

    if (!isPushToTalkMode) {
      await vad.start();
      setTimeout(() => {
        if (introPendingRef.current && !isPlayingRef.current) setStatus('listening');
      }, 1800);
    } else {
      // PTT mode: just show idle — user will hold to speak
      setTimeout(() => {
        if (introPendingRef.current && !isPlayingRef.current) setStatus('idle');
      }, 1800);
    }
  }, [sessionId, settings.ttsModel, settings.ttsVoice, settings.introTemplate, settings.languageMode, settings.agentName, turns.length, vad, activeLead, isPushToTalkMode]);

  const endCall = useCallback(async () => {
    autoListenEnabledRef.current = false;
    wasListeningBeforeDropRef.current = false;
    // Stop any PTT recording in progress
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    if (!isPushToTalkMode) await vad.pause();
    stopAudioPlayback();
    if (socketRef.current?.connected) {
      socketRef.current.emit('end_call', { sessionId, lead: activeLead || null });
    }
    setStatus('idle');
  }, [vad, stopAudioPlayback, sessionId, activeLead, isPushToTalkMode]);

  const retryIntro = useCallback(async () => {
    if (!socketRef.current?.connected) return;
    setLastCallSummary(null);
    autoListenEnabledRef.current = true;
    hasSentIntroRef.current = true;
    suppressBargeInUntilRef.current = Date.now() + 2500;
    assistantBusyRef.current = true;
    introPendingRef.current = true;
    setStatus('processing');
    socketRef.current.emit('start_assistant', {
      sessionId,
      ttsModel: settings.ttsModel,
      ttsVoice: settings.ttsVoice,
      languageMode: settings.languageMode,
      introTemplate: settings.introTemplate,
      agentName: settings.agentName,
      lead: activeLead || null,
    });
    if (!isPushToTalkMode) {
      await vad.start();
      setTimeout(() => {
        if (introPendingRef.current && !isPlayingRef.current) setStatus('listening');
      }, 1800);
    }
  }, [sessionId, settings.ttsModel, settings.ttsVoice, settings.introTemplate, settings.languageMode, settings.agentName, activeLead, vad, isPushToTalkMode]);

  return {
    status,
    processingStage,
    socketReady,
    reconnecting,
    reconnectAttempt,
    turns,
    errorMsg,
    closeDetected,
    callNotice,
    lastCallSummary,
    clearSession,
    retryConnection,
    vadLoading: vad.loading,
    vadError: vad.errored,
    isVadListening: vad.listening,
    isPushToTalkMode,
    startVad: startVoiceAssistant,
    pauseVad: vad.pause,
    endCall,
    retryIntro,
    startPushToTalk,
    stopPushToTalk,
  };
}

// ── Audio buffer normaliser ───────────────────────────────────────────────────
// Socket.IO delivers binary data in several formats depending on the transport
// and client version. Normalise all of them to a plain ArrayBuffer for
// decodeAudioData().
function normalizeToArrayBuffer(raw) {
  if (!raw) return null;
  if (raw instanceof ArrayBuffer) return raw;
  if (ArrayBuffer.isView(raw)) {
    return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  }
  // Socket.IO JSON-serialised Buffer: { type: 'Buffer', data: [0,1,2,...] }
  if (raw.type === 'Buffer' && Array.isArray(raw.data)) {
    return Uint8Array.from(raw.data).buffer;
  }
  return null;
}

// ── WAV encoder (for VAD path) ────────────────────────────────────────────────
function createWavBlob(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    view.setInt16(offset, samples[i], true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
