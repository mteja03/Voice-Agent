import React, { useState, useCallback } from 'react';

/**
 * RecordButton
 *
 * Two modes:
 *  - VAD mode (default, desktop/Chrome):  tap once to start, tap again to pause.
 *  - PTT mode (iOS Safari / VAD unavailable): hold to speak, release to send.
 */
export default function RecordButton({
  status,
  isVadListening,
  socketReady = true,
  startVad,
  pauseVad,
  isPushToTalkMode = false,
  startPushToTalk,
  stopPushToTalk,
}) {
  const isListening = status === 'listening';
  const isProcessing = status === 'processing';
  const isSpeaking = status === 'speaking';
  const blockedStart = !socketReady && !isVadListening && !isPushToTalkMode;

  // PTT: track press state locally for visual feedback while holding
  const [pttHeld, setPttHeld] = useState(false);

  // ── PTT handlers ────────────────────────────────────────────────────────
  const handlePttDown = useCallback(
    (e) => {
      e.preventDefault(); // prevent ghost mouse events on touch devices
      if (!socketReady || isProcessing || isSpeaking) return;
      setPttHeld(true);
      startPushToTalk?.();
    },
    [socketReady, isProcessing, isSpeaking, startPushToTalk]
  );

  const handlePttUp = useCallback(
    (e) => {
      e.preventDefault();
      if (!pttHeld) return;
      setPttHeld(false);
      stopPushToTalk?.();
    },
    [pttHeld, stopPushToTalk]
  );

  // ── VAD handlers ────────────────────────────────────────────────────────
  const handleVadClick = () => {
    if (!isVadListening) {
      if (!socketReady) return;
      startVad();
    } else {
      pauseVad();
    }
  };

  // ── Labels ───────────────────────────────────────────────────────────────
  const pttLabel = isProcessing
    ? 'Processing…'
    : isSpeaking
    ? 'Speaking…'
    : pttHeld || isListening
    ? 'Release to send'
    : !socketReady
    ? 'Waiting for server…'
    : 'Hold to speak';

  const vadLabel = blockedStart
    ? 'Waiting for server…'
    : !isVadListening
    ? 'Start voice assistant'
    : isSpeaking
    ? 'Speaking...'
    : isProcessing
    ? 'Processing...'
    : isListening
    ? 'Listening...'
    : 'Assistant is active';

  const showOrb = isVadListening || (isPushToTalkMode && (pttHeld || isListening || isProcessing || isSpeaking));

  // ── Shared orb + button shell ────────────────────────────────────────────
  const orbContent = (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div
        className={`absolute w-full h-full rounded-full transition-all duration-1000 ${
          isSpeaking
            ? 'bg-gradient-to-r from-brand-400 to-indigo-500 scale-[1.3] blur-xl opacity-70 animate-pulse'
            : isProcessing
            ? 'bg-gradient-to-r from-indigo-500 to-brand-500 scale-110 blur-xl opacity-50 animate-spin-slow'
            : pttHeld || isListening
            ? 'bg-gradient-to-r from-red-500 to-rose-400 scale-110 blur-lg opacity-60 animate-pulse-ring'
            : 'bg-gradient-to-r from-brand-500 to-purple-500 scale-110 blur-lg opacity-40 animate-pulse-ring'
        }`}
      />
      {isSpeaking && (
        <>
          <div className="absolute w-24 h-24 bg-brand-400 rounded-full mix-blend-screen filter blur-md animate-blob opacity-80" />
          <div className="absolute w-24 h-24 bg-indigo-400 rounded-full mix-blend-screen filter blur-md animate-blob opacity-80" style={{ animationDelay: '2s' }} />
          <div className="absolute w-24 h-24 bg-purple-400 rounded-full mix-blend-screen filter blur-md animate-blob opacity-80" style={{ animationDelay: '4s' }} />
        </>
      )}
    </div>
  );

  const buttonIcon = isPushToTalkMode ? (
    // PTT icon: mic when idle/held, spinner when processing
    isProcessing ? (
      <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    ) : isSpeaking ? (
      <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
      </svg>
    ) : (
      <svg className={`w-10 h-10 ${pttHeld || isListening ? 'text-white' : 'text-white'}`} fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
        <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 10z" />
      </svg>
    )
  ) : !isVadListening ? (
    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ) : isProcessing ? (
    <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  ) : isSpeaking ? (
    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
    </svg>
  ) : (
    <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
      <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 10z" />
    </svg>
  );

  return (
    <div className="flex flex-col items-center gap-6 sm:gap-8 mt-4 mb-4">
      <div className="relative flex items-center justify-center w-40 h-40">
        {showOrb && orbContent}

        {isPushToTalkMode ? (
          /* PTT button — pointer events for hold gesture */
          <button
            onPointerDown={handlePttDown}
            onPointerUp={handlePttUp}
            onPointerCancel={handlePttUp}
            onPointerLeave={handlePttUp}
            disabled={blockedStart || isProcessing || isSpeaking}
            aria-label={pttHeld || isListening ? 'Release to send voice' : isSpeaking ? 'Agent is speaking' : 'Hold to speak'}
            aria-pressed={pttHeld || isListening}
            style={{ touchAction: 'none', userSelect: 'none' }}
            className={`
              relative z-10 w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center
              transition-all duration-200 ease-out select-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400/50
              ${blockedStart || isProcessing || isSpeaking ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              ${pttHeld || isListening
                ? 'bg-red-500 shadow-2xl border border-red-300/40 scale-110'
                : isSpeaking
                ? 'bg-white/20 backdrop-blur-md shadow-2xl border border-white/30'
                : 'bg-slate-800 hover:bg-slate-700 shadow-xl hover:scale-105 border border-white/10 dark:bg-white/10 dark:hover:bg-white/20'
              }
            `}
          >
            {buttonIcon}
            {/* Red pulse ring while recording */}
            {(pttHeld || isListening) && (
              <span className="absolute inset-0 rounded-full border-2 border-red-400 animate-ping opacity-60" />
            )}
          </button>
        ) : (
          /* VAD button — single click toggle */
          <button
            onClick={handleVadClick}
            disabled={blockedStart}
            aria-label={isVadListening ? 'Stop voice assistant' : 'Start voice assistant'}
            aria-pressed={isVadListening}
            className={`
              relative z-10 w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center
              transition-all duration-300 ease-out select-none touch-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400/50
              ${blockedStart ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              ${!isVadListening && !blockedStart
                ? 'bg-slate-800 hover:bg-slate-700 shadow-xl hover:scale-105 border border-white/10 dark:bg-white/10 dark:hover:bg-white/20'
                : 'bg-white/20 backdrop-blur-md shadow-2xl border border-white/30 hover:bg-white/30 hover:scale-105 text-white'
              }
            `}
          >
            {buttonIcon}
          </button>
        )}
      </div>

      <div className="flex flex-col items-center gap-1 z-10">
        <p className="text-sm font-medium text-slate-800 dark:text-gray-200 text-center bg-white/70 dark:bg-gray-900/70 backdrop-blur-md px-4 py-1.5 rounded-full border border-slate-200/50 dark:border-gray-800/50 shadow-sm">
          {isPushToTalkMode ? pttLabel : vadLabel}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-gray-400 max-w-xs text-center leading-relaxed mt-2">
          {isPushToTalkMode
            ? 'Hold button (or Space bar) while speaking, release to send.'
            : 'Tap once to start; tap again to pause. Space bar also toggles.'}
        </p>
        {isPushToTalkMode && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 text-center">
            Push-to-talk mode — auto voice detection not available on this browser
          </p>
        )}
      </div>
    </div>
  );
}
