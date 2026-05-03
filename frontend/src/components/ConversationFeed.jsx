import { useEffect, useRef } from 'react';

function MessageBubble({ turn }) {
  if (turn.isIntro) {
    return (
      <div className="flex justify-start animate-slide-up">
        <div className="max-w-[82%]">
          <p className="text-xs text-gray-500 mb-1">Voice Agent</p>
          <div className="bg-gray-800/85 border border-gray-700/50 rounded-2xl rounded-tl-sm px-4 py-3 shadow-lg shadow-black/20">
            <p className="text-sm text-gray-100 leading-relaxed">{turn.aiText}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 animate-slide-up">
      {/* User turn */}
      <div className="flex justify-end">
        <div className="max-w-[82%]">
          <p className="text-xs text-gray-500 text-right mb-1">మీరు (You)</p>
          <div className="bg-brand-800/55 border border-brand-700/40 rounded-2xl rounded-tr-sm px-4 py-3 shadow-lg shadow-brand-950/20">
            <p className="text-sm text-gray-100 leading-relaxed">{turn.transcript}</p>
          </div>
        </div>
      </div>

      {/* AI turn */}
      <div className="flex justify-start">
        <div className="max-w-[82%]">
          <p className="text-xs text-gray-500 mb-1">Voice Agent</p>
          <div className="bg-gray-800/85 border border-gray-700/50 rounded-2xl rounded-tl-sm px-4 py-3 shadow-lg shadow-black/20">
            <p className="text-sm text-gray-100 leading-relaxed">{turn.aiText}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start animate-fade-in">
      <div className="bg-gray-800/80 border border-gray-700/50 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

export default function ConversationFeed({ turns, isProcessing }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, isProcessing]);

  if (turns.length === 0 && !isProcessing) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 text-center py-12 px-3">
        <div className="w-16 h-16 rounded-full bg-gray-800/80 border border-gray-700/60 flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <div>
          <p className="text-gray-300 text-sm font-medium">మీ conversation ఇక్కడ కనిపిస్తుంది</p>
          <p className="text-gray-500 text-xs mt-1">Tap the mic and speak naturally in Telugu</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      {turns.length > 0 && (
        <div className="flex-shrink-0 px-3 pt-3 pb-2 text-[11px] text-gray-500 border-b border-gray-800/50">
          Live conversation
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto py-4 px-1 flex flex-col gap-6 custom-scrollbar">
        {turns.map((turn, i) => (
          <MessageBubble key={i} turn={turn} />
        ))}
        {isProcessing && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
