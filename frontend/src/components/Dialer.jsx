import React from 'react';
import StatusBadge from './StatusBadge';
import ActiveLeadCard from './ActiveLeadCard';
import CallControlsBar from './CallControlsBar';
import ConversationFeed from './ConversationFeed';
import RecordButton from './RecordButton';

export default function Dialer({
  status,
  turns,
  errorMsg,
  closeDetected,
  vadLoading,
  vadError,
  isVadListening,
  startVad,
  pauseVad,
  endCall,
  retryIntro,
  activeLead,
  leads,
  handleNextLeadQuick,
  settings,
  summaryNote
}) {
  const displayError = errorMsg || (vadError ? 'VAD Error: ' + (vadError.message || 'Microphone access denied or model failed to load.') : null);
  const activeLeadIndex = activeLead ? leads.findIndex((lead) => lead.id === activeLead.id) : -1;

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-950">
      <header className="px-8 py-6 border-b border-gray-800/60 bg-gray-900/30 backdrop-blur flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Active Call</h1>
          <p className="text-sm text-gray-400 mt-1">
            {activeLead ? `Speaking with ${activeLead.name}` : 'Ready for the next call.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 sm:p-8 flex flex-col max-w-3xl mx-auto w-full">
        <ActiveLeadCard lead={activeLead} leadIndex={Math.max(activeLeadIndex, 0)} totalLeads={leads.length} />
        <CallControlsBar
          status={status}
          activeLead={activeLead}
          isVadListening={isVadListening}
          onStart={startVad}
          onPause={pauseVad}
          onEndCall={endCall}
          onRetryIntro={retryIntro}
          onNextLead={handleNextLeadQuick}
        />

        <div className="mt-4 sm:mt-5 rounded-2xl bg-gray-900/50 border border-gray-800/60 flex-1 flex flex-col overflow-hidden backdrop-blur-sm shadow-xl min-h-[300px]">
          <ConversationFeed turns={turns} isProcessing={status === 'processing'} />
        </div>

        {vadLoading && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm animate-fade-in text-center">
            Initializing AI voice detection...
          </div>
        )}

        {displayError && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-fade-in">
            {displayError}
          </div>
        )}

        {summaryNote && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm animate-fade-in">
            {summaryNote}
          </div>
        )}

        <div className="my-4 flex flex-wrap items-center justify-center gap-2">
          <StatusChip label={`Language: ${settings.languageMode || 'telugu'}`} />
          <StatusChip label={`Auto-End: ${settings.autoEndCall ? 'On' : 'Off'}`} />
          <StatusChip label={`Turns: ${turns.length}`} />
          {closeDetected && <StatusChip label="Close Detected" accent={true} />}
        </div>

        <div className="pt-4 flex flex-col items-center gap-3 border-t border-gray-800/60">
          <RecordButton 
            status={status} 
            isVadListening={isVadListening} 
            startVad={startVad} 
            pauseVad={pauseVad} 
          />
          <p className="text-xs text-gray-500 text-center">
            {turns.length === 0
              ? 'Click Start to begin conversation.'
              : `${turns.length} ${turns.length === 1 ? 'exchange' : 'exchanges'}`}
            <br />
            Tip: Speak naturally, pause for faster responses.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusChip({ label, accent = false }) {
  return (
    <span className={`text-[11px] px-3 py-1.5 rounded-full border font-medium ${
      accent
        ? 'bg-brand-500/10 border-brand-500/30 text-brand-400'
        : 'bg-gray-800 border-gray-700 text-gray-400'
    }`}>
      {label}
    </span>
  );
}
