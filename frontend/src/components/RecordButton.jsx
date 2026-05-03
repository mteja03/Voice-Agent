export default function RecordButton({ status, isVadListening, startVad, pauseVad }) {
  const isListening = status === 'listening';
  const isProcessing = status === 'processing';
  const isSpeaking = status === 'speaking';
  
  const label = !isVadListening ? 'Start voice assistant'
    : isSpeaking ? 'Speaking...' 
    : isProcessing ? 'Processing...' 
    : isListening ? 'Listening...' 
    : 'Assistant is active';

  const handleClick = () => {
    if (!isVadListening) {
      startVad();
    } else {
      pauseVad();
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 sm:gap-5">
      <div className={`relative flex items-center justify-center ${isListening ? 'animate-pulse-ring' : ''}`}>
        {isListening && (
          <>
            <span className="absolute w-32 h-32 rounded-full bg-red-500/10 animate-ping" style={{ animationDuration: '1s' }} />
            <span className="absolute w-28 h-28 rounded-full bg-red-500/15 animate-ping" style={{ animationDuration: '1.4s' }} />
          </>
        )}

        <button
          onClick={handleClick}
          aria-label={isVadListening ? 'Stop voice assistant' : 'Start voice assistant'}
          aria-pressed={isVadListening}
          className={`
            relative w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center
            transition-all duration-200 ease-out select-none touch-none cursor-pointer ring-offset-2 ring-offset-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400
            ${!isVadListening
              ? 'bg-slate-700 hover:bg-slate-600 shadow-lg hover:scale-[1.02]'
              : isProcessing
              ? 'bg-gray-800 opacity-80'
              : isListening
              ? 'bg-slate-500 scale-110 shadow-xl shadow-slate-900/60'
              : 'bg-slate-300 shadow-lg shadow-slate-900/50 hover:brightness-110'
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
            <svg className="w-8 h-8 text-slate-950" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
            </svg>
          ) : (
            <svg className="w-10 h-10 text-slate-950" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
              <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 10z" />
            </svg>
          )}
        </button>
      </div>

      <p className="text-sm text-gray-300 text-center">{label}</p>
      <p className="text-[11px] text-gray-500 -mt-3 max-w-xs text-center leading-relaxed">
        Same as <span className="text-gray-400">Start</span> / <span className="text-gray-400">Pause</span> above — use whichever you prefer.
        Tap once to start listening, tap again to pause.
      </p>
    </div>
  );
}
