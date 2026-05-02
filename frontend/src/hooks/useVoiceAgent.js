import { useState, useEffect, useRef, useCallback } from 'react';
import { useMicVAD } from '@ricky0123/vad-react';
import { socket } from '../services/socket';

export function useVoiceAgent(sessionId, settings, activeLead, onCallSummary) {
  const [status, setStatus] = useState('idle'); // idle, listening, processing, speaking
  const [turns, setTurns] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const [closeDetected, setCloseDetected] = useState(false);
  const [callNotice, setCallNotice] = useState('');
  
  const socketRef = useRef(null);
  const audioQueueRef = useRef([]);
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
  const disconnectWarnTimerRef = useRef(null);

  const stopAudioPlayback = useCallback(() => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setStatus('idle');
  }, []);

  useEffect(() => {
    latestSettingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    latestLeadRef.current = activeLead;
  }, [activeLead]);

  useEffect(() => {
    onCallSummaryRef.current = onCallSummary;
  }, [onCallSummary]);

  // Initialize Socket.IO
  useEffect(() => {
    socketRef.current = socket;

    const handleConnect = () => {
      if (disconnectWarnTimerRef.current) {
        clearTimeout(disconnectWarnTimerRef.current);
        disconnectWarnTimerRef.current = null;
      }
      console.log('Connected to Voice Agent Backend');
      setErrorMsg(null);
    };

    const handleDisconnect = (reason) => {
      pendingTurnRef.current = false;
      assistantBusyRef.current = false;
      introPendingRef.current = false;
      setStatus('idle');
      if (reason === 'io client disconnect') {
        return;
      }
      // transport close / ping timeout often recover in <1s; avoid flashing a scary banner every time.
      if (disconnectWarnTimerRef.current) {
        clearTimeout(disconnectWarnTimerRef.current);
      }
      const delay = reason === 'io server disconnect' ? 0 : 2800;
      disconnectWarnTimerRef.current = setTimeout(() => {
        disconnectWarnTimerRef.current = null;
        if (!socketRef.current?.connected) {
          setErrorMsg(
            reason === 'io server disconnect'
              ? 'Disconnected from server. Reconnecting…'
              : 'Connection dropped. Reconnecting… If this persists, check VITE_BACKEND_URL and Railway logs.'
          );
        }
      }, delay);
    };

    const handleConnectError = (err) => {
      pendingTurnRef.current = false;
      assistantBusyRef.current = false;
      introPendingRef.current = false;
      setErrorMsg(`Unable to connect to backend: ${err.message}`);
      setStatus('idle');
    };

    const handleTranscript = ({ transcript }) => {
      setTurns(prev => [...prev, { transcript, aiText: '' }]);
      setStatus('processing');
    };

    const handleTtsAudioChunk = async ({ audioBuffer, text }) => {
      assistantBusyRef.current = true;
      introPendingRef.current = false;
      vadRef.current?.pause();
      // Append text to the latest turn; if there is no user turn yet,
      // create an assistant-led intro turn so opening greeting is visible.
      setTurns(prev => {
        const newTurns = [...prev];
        const lastTurn = newTurns[newTurns.length - 1];
        if (lastTurn) {
          lastTurn.aiText = (lastTurn.aiText + ' ' + text).trim();
        } else {
          newTurns.push({ transcript: '', aiText: text, isIntro: true });
        }
        return newTurns;
      });

      // Add to audio queue
      if (audioBuffer) {
        audioQueueRef.current.push(audioBuffer);
      }
      playNextAudio();
    };

    const handleResponseComplete = ({ shouldEndCall }) => {
      pendingTurnRef.current = false;
      assistantBusyRef.current = false;
      introPendingRef.current = false;
      setCloseDetected(Boolean(shouldEndCall));
      if (latestSettingsRef.current?.autoEndCall && shouldEndCall) {
        // Let the final closing message finish without accidental user interruption.
        closingPlaybackUntilRef.current = Date.now() + 2200;
        suppressBargeInUntilRef.current = Math.max(suppressBargeInUntilRef.current, closingPlaybackUntilRef.current);
        pendingAutoEndRef.current = true;
      }
    };

    const handleNoSpeech = () => {
      pendingTurnRef.current = false;
      assistantBusyRef.current = false;
      introPendingRef.current = false;
      setStatus('idle');
    };

    const handleSocketError = ({ message }) => {
      pendingTurnRef.current = false;
      assistantBusyRef.current = false;
      introPendingRef.current = false;
      setErrorMsg(message);
      setStatus('idle');
    };

    const handleSessionCleared = () => {
      setTurns([]);
      stopAudioPlayback();
      setStatus('idle');
    };

    const handleCallSummary = ({ summary }) => {
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
    };
  }, [stopAudioPlayback]);

  // Audio Playback Logic using Web Audio API for gapless playback
  const playNextAudio = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    isPlayingRef.current = true;
    setStatus('speaking');

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }

    const nextAudio = audioQueueRef.current.shift();
    
    try {
      let encodedBuffer;
      if (nextAudio instanceof ArrayBuffer) {
        encodedBuffer = nextAudio;
      } else if (ArrayBuffer.isView(nextAudio)) {
        encodedBuffer = nextAudio.buffer.slice(nextAudio.byteOffset, nextAudio.byteOffset + nextAudio.byteLength);
      } else if (nextAudio && nextAudio.type === 'Buffer' && Array.isArray(nextAudio.data)) {
        // Socket.IO may deliver Node Buffers as `{ type: 'Buffer', data: number[] }`.
        encodedBuffer = Uint8Array.from(nextAudio.data).buffer;
      } else {
        throw new Error('Unsupported audio chunk format');
      }

      const audioBuffer = await audioContextRef.current.decodeAudioData(encodedBuffer.slice(0));
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      
      sourceNodeRef.current = source;
      
      source.onended = () => {
        isPlayingRef.current = false;
        sourceNodeRef.current = null;
        if (audioQueueRef.current.length > 0) {
          playNextAudio();
        } else {
          if (!pendingTurnRef.current) assistantBusyRef.current = false;
          setStatus('idle');
          if (autoListenEnabledRef.current) {
            vad.start();
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
      
      source.start();
    } catch (err) {
      console.error('Error playing audio chunk', err);
      isPlayingRef.current = false;
      setStatus('idle');
    }
  };

  // Initialize VAD
  const vad = useMicVAD({
    startOnLoad: false,
    workletURL: '/vad/vad.worklet.bundle.min.js',
    modelURL: '/vad/silero_vad.onnx',
    minSpeechMs: 250,
    redemptionMs: 500,
    preSpeechPadMs: 120,
    ortConfig: (ort) => {
      ort.env.wasm.wasmPaths = '/vad/';
      ort.env.wasm.numThreads = 1;
    },
    onSpeechStart: () => {
      setStatus('listening');
    },
    onSpeechEnd: (audioData) => {
      if (assistantBusyRef.current || isPlayingRef.current || audioQueueRef.current.length > 0) {
        return;
      }
      const speechDurationMs = (audioData.length / 16000) * 1000;
      if (speechDurationMs < 550) {
        setStatus('idle');
        return;
      }
      if (pendingTurnRef.current) return;
      const now = Date.now();
      if (now - lastProcessEmitAtRef.current < 900) return;

      setStatus('processing');
      // Convert Float32Array to 16-bit PCM Blob
      const pcm16 = new Int16Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        const s = Math.max(-1, Math.min(1, audioData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      // We can send this as a WAV blob to the backend
      const wavBlob = createWavBlob(pcm16, 16000); // VAD samples at 16000Hz
      
      if (socketRef.current) {
        pendingTurnRef.current = true;
        assistantBusyRef.current = true;
        lastProcessEmitAtRef.current = now;
        socketRef.current.emit('process_audio', {
          audioBuffer: wavBlob,
          sessionId,
          sttModel: settings.sttModel,
          ttsModel: settings.ttsModel,
          ttsVoice: settings.ttsVoice,
          languageMode: settings.languageMode,
          agentName: settings.agentName,
          lead: activeLead || null,
        });
      }
    },
  });

  useEffect(() => {
    vadRef.current = vad;
  }, [vad]);

  const clearSession = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('clear_session', { sessionId });
    }
    hasSentIntroRef.current = false;
    autoListenEnabledRef.current = false;
    setCloseDetected(false);
  }, [sessionId]);

  const startVoiceAssistant = useCallback(async () => {
    autoListenEnabledRef.current = true;
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
    await vad.start();
    // Prevent first-click UI from looking stuck while intro TTS is synthesizing.
    setTimeout(() => {
      if (introPendingRef.current && !isPlayingRef.current) {
        setStatus('listening');
      }
    }, 1800);
  }, [sessionId, settings.ttsModel, settings.ttsVoice, settings.introTemplate, settings.languageMode, turns.length, vad, activeLead]);

  const endCall = useCallback(async () => {
    autoListenEnabledRef.current = false;
    await vad.pause();
    stopAudioPlayback();
    if (socketRef.current?.connected) {
      socketRef.current.emit('end_call', {
        sessionId,
        lead: activeLead || null,
      });
    }
    setStatus('idle');
  }, [vad, stopAudioPlayback, sessionId, activeLead]);

  const retryIntro = useCallback(async () => {
    if (!socketRef.current?.connected) return;
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
    await vad.start();
    setTimeout(() => {
      if (introPendingRef.current && !isPlayingRef.current) {
        setStatus('listening');
      }
    }, 1800);
  }, [sessionId, settings.ttsModel, settings.ttsVoice, settings.introTemplate, settings.languageMode, activeLead, vad]);

  return {
    status,
    turns,
    errorMsg,
    closeDetected,
    callNotice,
    clearSession,
    vadLoading: vad.loading,
    vadError: vad.errored,
    isVadListening: vad.listening,
    startVad: startVoiceAssistant,
    pauseVad: vad.pause,
    endCall,
    retryIntro,
  };
}

// Helper to create valid WAV file from PCM data
function createWavBlob(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');

  // FMT sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); // 1 channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data sub-chunk
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
