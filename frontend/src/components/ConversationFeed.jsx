import { useEffect, useRef } from 'react';

function formatMs(ms) {
  if (ms == null) return null;
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function LatencyBadge({ latency }) {
  if (!latency?.total) return null;
  const total = formatMs(latency.total);
  const parts = [
    latency.stt  != null && `STT ${formatMs(latency.stt)}`,
    latency.llm  != null && `LLM ${formatMs(latency.llm)}`,
    latency.tts  != null && `TTS ${formatMs(latency.tts)}`,
  ].filter(Boolean);

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-gray-700/60 text-slate-500 dark:text-gray-400 font-mono border border-slate-300/60 dark:border-gray-600/40">
        ⚡ {total}
      </span>
      {parts.map((p) => (
        <span key={p} className="text-[9px] text-slate-400 dark:text-gray-500 font-mono">
          {p}
        </span>
      ))}
    </div>
  );
}

function MessageBubble({ turn, isStreaming }) {
  if (turn.isIntro) {
    return (
      <div className="flex justify-start animate-slide-up">
        <div className="max-w-[82%]">
          <p className="text-xs text-slate-500 dark:text-gray-500 mb-1">Voice Agent</p>
          <div className="bg-slate-100 border border-slate-200/90 dark:bg-gray-800/85 dark:border-gray-700/50 rounded-2xl rounded-tl-sm px-4 py-3 shadow-lg shadow-slate-900/5 dark:shadow-black/20">
            <p className="text-sm text-slate-800 dark:text-gray-100 leading-relaxed">
              {turn.aiText}
              {isStreaming && (
                <span className="inline-block w-0.5 h-4 bg-slate-400 dark:bg-gray-400 ml-0.5 animate-pulse align-middle" aria-hidden />
              )}
            </p>
          </div>
          <LatencyBadge latency={turn.latency} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 animate-slide-up">
      {/* User turn */}
      <div className="flex justify-end">
        <div className="max-w-[82%]">
          <p className="text-xs text-slate-500 dark:text-gray-500 text-right mb-1">మీరు (You)</p>
          <div className="bg-brand-100/90 border border-brand-300/60 dark:bg-brand-800/55 dark:border-brand-700/40 rounded-2xl rounded-tr-sm px-4 py-3 shadow-lg shadow-brand-900/10 dark:shadow-brand-950/20">
            <p className="text-sm text-slate-900 dark:text-gray-100 leading-relaxed">{turn.transcript}</p>
          </div>
        </div>
      </div>

      {/* AI turn */}
      {(turn.aiText || isStreaming) && (
        <div className="flex justify-start">
          <div className="max-w-[82%]">
            <p className="text-xs text-slate-500 dark:text-gray-500 mb-1">Voice Agent</p>
            <div className="bg-slate-100 border border-slate-200/90 dark:bg-gray-800/85 dark:border-gray-700/50 rounded-2xl rounded-tl-sm px-4 py-3 shadow-lg shadow-slate-900/5 dark:shadow-black/20">
              <p className="text-sm text-slate-800 dark:text-gray-100 leading-relaxed">
                {turn.aiText}
                {isStreaming && (
                  <span className="inline-block w-0.5 h-4 bg-slate-400 dark:bg-gray-400 ml-0.5 animate-pulse align-middle" aria-hidden />
                )}
              </p>
            </div>
            <LatencyBadge latency={turn.latency} />
          </div>
        </div>
      )}
    </div>
  );
}

function TypingIndicator({ stage }) {
  const label = stage === 'transcribing'
    ? 'Transcribing…'
    : stage === 'generating'
    ? 'Generating reply…'
    : 'Thinking…';

  return (
    <div className="flex justify-start animate-fade-in">
      <div className="bg-slate-100 border border-slate-200/90 dark:bg-gray-800/80 dark:border-gray-700/50 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-2 items-center">
          <div className="flex gap-1 items-center h-4">
            <span className="w-1.5 h-1.5 bg-slate-400 dark:bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 bg-slate-400 dark:bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 bg-slate-400 dark:bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
          </div>
          <span className="text-[10px] text-slate-400 dark:text-gray-500">{label}</span>
        </div>
      </div>
    </div>
  );
}

export default function ConversationFeed({ turns, isProcessing, processingStage, isSpeaking }) {
  const bottomRef = useRef(null);
  const safeTurns = Array.isArray(turns) ? turns : [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [safeTurns, isProcessing, isSpeaking]);

  const lastTurnIndex = safeTurns.length - 1;

  if (safeTurns.length === 0 && !isProcessing) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 text-center py-12 px-3">
        <div className="w-16 h-16 rounded-full bg-slate-200/90 border border-slate-300/80 dark:bg-gray-800/80 dark:border-gray-700/60 flex items-center justify-center">
          <svg className="w-8 h-8 text-slate-500 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <div>
          <p className="text-slate-800 dark:text-gray-300 text-sm font-medium">మీ conversation ఇక్కడ కనిపిస్తుంది</p>
          <p className="text-slate-600 dark:text-gray-500 text-xs mt-1">Tap the mic and speak naturally in Telugu</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      {safeTurns.length > 0 && (
        <div className="flex-shrink-0 px-3 pt-3 pb-2 text-[11px] text-slate-600 dark:text-gray-500 border-b border-slate-200/80 dark:border-gray-800/50">
          Live conversation
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto py-4 px-1 flex flex-col gap-6 custom-scrollbar">
        {safeTurns.map((turn, i) => (
          <MessageBubble
            key={i}
            turn={turn}
            // Show cursor while the last turn is still streaming (speaking state with no latency yet)
            isStreaming={i === lastTurnIndex && isSpeaking && !turn.latency}
          />
        ))}
        {isProcessing && <TypingIndicator stage={processingStage} />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
