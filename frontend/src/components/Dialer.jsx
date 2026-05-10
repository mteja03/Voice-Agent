import React, { useEffect, useState } from 'react';
import { Users, ChevronRight, Loader2, WifiOff } from 'lucide-react';
import StatusBadge from './StatusBadge';
import ActiveLeadCard from './ActiveLeadCard';
import ConversationFeed from './ConversationFeed';
import RecordButton from './RecordButton';
import CallLifecycleStrip from './CallLifecycleStrip';

export default function Dialer({
  status,
  socketReady = true,
  reconnecting = false,
  reconnectAttempt = 0,
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
  summaryNote,
  lastCallSummary,
  onRetryConnection,
  onOpenCampaigns,
  isPushToTalkMode = false,
  startPushToTalk,
  stopPushToTalk,
}) {
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  // Only show VAD errors when NOT in PTT mode (PTT is the graceful fallback for VAD failure)
  const displayError = errorMsg || (!isPushToTalkMode && vadError
    ? 'VAD Error: ' + ((vadError instanceof Error ? vadError.message : null) || 'Microphone access denied or model failed to load.')
    : null);
  const showConnectionRetry =
    Boolean(errorMsg) &&
    /connect|backend|Disconnected|Unable to connect|Reconnecting/i.test(errorMsg);
  const activeLeadIndex = activeLead ? leads.findIndex((lead) => lead.id === activeLead.id) : -1;
  const hasLead = Boolean(activeLead);

  useEffect(() => {
    if (!endConfirmOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setEndConfirmOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [endConfirmOpen]);

  const requestEndCall = () => {
    if (status === 'idle') return;
    if (turns.length > 0) setEndConfirmOpen(true);
    else endCall();
  };

  const confirmEndCall = () => {
    setEndConfirmOpen(false);
    endCall();
  };

  if (!hasLead) {
    return (
      <div className="flex-1 flex flex-col h-full min-h-0 bg-transparent">
        <header className="flex-shrink-0 px-6 sm:px-8 py-6 border-b border-white/10 dark:border-white/5 animate-slide-up" style={{ animationDelay: '300ms' }}>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Active Call</h1>
          <p className="text-sm text-slate-600 dark:text-gray-400 mt-1">Choose someone to call from your campaign list.</p>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-md mx-auto text-center">
          <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-gray-800 flex items-center justify-center mb-5 text-slate-500 dark:text-gray-500">
            <Users className="w-8 h-8" aria-hidden />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No lead selected</h2>
          <p className="text-sm text-slate-600 dark:text-gray-400 mb-6 leading-relaxed">
            {leads.length === 0
              ? 'Import a CSV on the Campaigns tab, then pick a lead and return here to start the voice agent.'
              : 'Open Campaigns and tap Call on a row, or select an active lead there first.'}
          </p>
          {typeof onOpenCampaigns === 'function' && (
            <button
              type="button"
              onClick={onOpenCampaigns}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-black bg-brand-500 hover:bg-brand-400 motion-safe:transition-colors min-h-[44px]"
            >
              Go to Campaigns
              <ChevronRight className="w-4 h-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-transparent">
      {endConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm motion-safe:transition-opacity"
            aria-label="Dismiss"
            onClick={() => setEndConfirmOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-call-title"
            className="surface-card relative z-10 w-full max-w-md p-6 shadow-2xl"
          >
            <h2 id="end-call-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              End this call?
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-gray-400">
              You have {turns.length} {turns.length === 1 ? 'exchange' : 'exchanges'} in this session. Ending will save
              and close the current call.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setEndConfirmOpen(false)}
                className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 motion-safe:transition-colors dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 min-h-[44px] sm:min-h-0"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmEndCall}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 motion-safe:transition-colors min-h-[44px] sm:min-h-0"
              >
                End &amp; save
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="flex-shrink-0 px-6 sm:px-8 py-6 border-b border-white/10 dark:border-white/5 flex items-center justify-between gap-4 animate-slide-up" style={{ animationDelay: '300ms' }}>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Active Call</h1>
          <p className="text-sm text-slate-600 dark:text-gray-400 mt-1">
            Speaking with {activeLead.name || 'this lead'}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge status={status} socketReady={socketReady} />
        </div>
      </header>

      <div className="flex-1 flex flex-col min-h-0 max-w-3xl mx-auto w-full px-4 sm:px-8 py-4 sm:py-6 gap-3">
        <CallLifecycleStrip
          socketReady={socketReady}
          vadLoading={vadLoading}
          status={status}
          hasLead={hasLead}
        />
        <p className="text-[11px] text-slate-600 dark:text-gray-500 leading-snug px-0.5">
          <span className="text-slate-700 dark:text-gray-400 font-medium">Barge-in:</span> while the assistant is speaking, you can interrupt—your
          mic is prioritized after a brief guard window, or use Pause to stop listening.
        </p>

        <div className="flex-shrink-0">
          <ActiveLeadCard lead={activeLead} leadIndex={Math.max(activeLeadIndex, 0)} totalLeads={leads.length} />
        </div>

        <div className="flex-1 min-h-[200px] flex flex-col surface-card overflow-hidden shadow-xl animate-slide-up" style={{ animationDelay: '500ms' }}>
          <ConversationFeed turns={turns} isProcessing={status === 'processing'} />
        </div>

        {vadLoading && !isPushToTalkMode && (
          <div className="flex-shrink-0 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-800 dark:text-blue-400 text-sm animate-fade-in text-center">
            Initializing AI voice detection...
          </div>
        )}

        {/* Reconnecting banner — shown while socket is actively trying to reconnect */}
        {reconnecting && (
          <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-sm animate-fade-in">
            <WifiOff className="w-4 h-4 shrink-0 opacity-80" aria-hidden />
            <p className="flex-1 min-w-0">
              Connection dropped — reconnecting
              {reconnectAttempt > 1 ? ` (attempt ${reconnectAttempt})` : '…'}
            </p>
            <Loader2 className="w-4 h-4 shrink-0 animate-spin opacity-70" aria-hidden />
          </div>
        )}

        {displayError && (
          <div className="flex-shrink-0 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-800 dark:text-red-400 text-sm animate-fade-in flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="flex-1 min-w-0">{displayError}</p>
            {showConnectionRetry && onRetryConnection && (
              <button
                type="button"
                onClick={onRetryConnection}
                className="shrink-0 px-3 py-2 rounded-lg text-xs font-medium bg-red-500/20 border border-red-500/40 text-red-900 hover:bg-red-500/30 dark:text-red-200 min-h-[44px]"
              >
                Retry connection
              </button>
            )}
          </div>
        )}

        {lastCallSummary && (
          <div className="flex-shrink-0 rounded-xl border border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-800/50 dark:bg-emerald-950/30 px-4 py-3 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400/90">Last call summary</p>
            <div className="mt-2 grid gap-1.5 text-slate-700 dark:text-gray-300 text-xs">
              {lastCallSummary.outcome && (
                <p>
                  <span className="text-slate-500 dark:text-gray-500">Outcome:</span>{' '}
                  <span className="text-slate-900 dark:text-white capitalize">{String(lastCallSummary.outcome).replace(/_/g, ' ')}</span>
                  {lastCallSummary.interestLevel && lastCallSummary.interestLevel !== 'unknown' && (
                    <span className="text-slate-500 dark:text-gray-500"> · Interest: {lastCallSummary.interestLevel}</span>
                  )}
                </p>
              )}
              {lastCallSummary.nextAction && (
                <p>
                  <span className="text-slate-500 dark:text-gray-500">Next step:</span> {lastCallSummary.nextAction}
                </p>
              )}
              {lastCallSummary.summaryNote && (
                <p className="text-slate-600 dark:text-gray-400 leading-relaxed">{lastCallSummary.summaryNote}</p>
              )}
            </div>
          </div>
        )}

        {summaryNote && (
          <div className="flex-shrink-0 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-400 text-sm animate-fade-in">
            {summaryNote}
          </div>
        )}

        <div className="flex-shrink-0 flex flex-wrap items-center justify-center gap-2">
          <StatusChip label={`Language: ${settings.languageMode || 'telugu'}`} />
          <StatusChip label={`Auto-End: ${settings.autoEndCall ? 'On' : 'Off'}`} />
          <StatusChip label={`Turns: ${turns.length}`} />
          {closeDetected && <StatusChip label="Close Detected" accent={true} />}
        </div>

        <div className="flex-shrink-0 pt-2 flex flex-col items-center gap-3 border-t border-slate-200/80 dark:border-gray-800/60 pb-2">
          <RecordButton
            status={status}
            isVadListening={isVadListening}
            socketReady={socketReady}
            startVad={startVad}
            pauseVad={pauseVad}
            isPushToTalkMode={isPushToTalkMode}
            startPushToTalk={startPushToTalk}
            stopPushToTalk={stopPushToTalk}
          />
          <p className="text-xs text-slate-600 dark:text-gray-500 text-center">
            {turns.length === 0
              ? 'Click Start to begin conversation.'
              : `${turns.length} ${turns.length === 1 ? 'exchange' : 'exchanges'}`}
            <br />
            Tip: Speak naturally, pause for faster responses.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[11px] text-slate-600 dark:text-gray-500">
            <button
              type="button"
              onClick={requestEndCall}
              disabled={status === 'idle'}
              className="text-slate-600 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white underline-offset-2 hover:underline disabled:opacity-40 disabled:no-underline min-h-[44px] sm:min-h-0 px-1"
            >
              End &amp; save
            </button>
            <span className="text-slate-300 dark:text-gray-700 hidden sm:inline" aria-hidden>
              ·
            </span>
            <button
              type="button"
              onClick={retryIntro}
              className="text-slate-600 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white underline-offset-2 hover:underline min-h-[44px] sm:min-h-0 px-1"
            >
              Replay intro
            </button>
            <span className="text-slate-300 dark:text-gray-700 hidden sm:inline" aria-hidden>
              ·
            </span>
            <button
              type="button"
              onClick={handleNextLeadQuick}
              className="text-slate-600 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white underline-offset-2 hover:underline min-h-[44px] sm:min-h-0 px-1"
            >
              Next lead
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusChip({ label, accent = false }) {
  return (
    <span className={`text-[11px] px-3 py-1.5 rounded-full border font-medium ${
      accent
        ? 'bg-brand-500/10 border-brand-500/30 text-brand-600 dark:text-brand-400'
        : 'bg-slate-200/90 border-slate-300 text-slate-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'
    }`}>
      {label}
    </span>
  );
}
