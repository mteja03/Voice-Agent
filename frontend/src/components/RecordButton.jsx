import React from 'react';

export default function RecordButton({ status, isVadListening, socketReady = true, startVad, pauseVad }) {
  const isListening = status === 'listening';
  const isProcessing = status === 'processing';
  const isSpeaking = status === 'speaking';
  const blockedStart = !socketReady && !isVadListening;

  const label = blockedStart
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

  const handleClick = () => {
    if (!isVadListening) {
      if (!socketReady) return;
      startVad();
    } else {
      pauseVad();
    }
  };

  const showOrb = isVadListening;

  return (
    <div className="flex flex-col items-center gap-6 sm:gap-8 mt-4 mb-4">
      <div className={`relative flex items-center justify-center w-40 h-40`}>
        {showOrb && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/* The Orb Backgrounds */}
            <div className={`absolute w-full h-full rounded-full transition-all duration-1000 ${
              isSpeaking ? 'bg-gradient-to-r from-brand-400 to-indigo-500 scale-[1.3] blur-xl opacity-70 animate-pulse' :
              isProcessing ? 'bg-gradient-to-r from-indigo-500 to-brand-500 scale-110 blur-xl opacity-50 animate-spin-slow' :
              'bg-gradient-to-r from-brand-500 to-purple-500 scale-110 blur-lg opacity-40 animate-pulse-ring'
            }`} />
            
            {/* Inner dynamic blobs */}
            {isSpeaking && (
               <>
                 <div className="absolute w-24 h-24 bg-brand-400 rounded-full mix-blend-screen filter blur-md animate-blob opacity-80" />
                 <div className="absolute w-24 h-24 bg-indigo-400 rounded-full mix-blend-screen filter blur-md animate-blob opacity-80" style={{ animationDelay: '2s' }} />
                 <div className="absolute w-24 h-24 bg-purple-400 rounded-full mix-blend-screen filter blur-md animate-blob opacity-80" style={{ animationDelay: '4s' }} />
               </>
            )}
          </div>
        )}

        <button
          onClick={handleClick}
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
          {!isVadListening ? (
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
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
            </svg>
          ) : (
            <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
              <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 10z" />
            </svg>
          )}
        </button>
      </div>

      <div className="flex flex-col items-center gap-1 z-10">
        <p className="text-sm font-medium text-slate-800 dark:text-gray-200 text-center bg-white/70 dark:bg-gray-900/70 backdrop-blur-md px-4 py-1.5 rounded-full border border-slate-200/50 dark:border-gray-800/50 shadow-sm">
          {label}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-gray-400 max-w-xs text-center leading-relaxed mt-2">
          Tap once to start listening and play the intro; tap again to pause the microphone.
        </p>
      </div>
    </div>
  );
}
