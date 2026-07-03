import React, { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { Users, ChevronRight, Loader2, WifiOff, ClipboardList, PhoneOff, RefreshCw, Phone } from 'lucide-react';
import StatusBadge from './StatusBadge';
import ActiveLeadCard from './ActiveLeadCard';
import ConversationFeed from './ConversationFeed';
import RecordButton from './RecordButton';
import CallLifecycleStrip from './CallLifecycleStrip';

function formatElapsed(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function Dialer({
  status,
  processingStage = null,
  socketReady = true,
  reconnecting = false,
  reconnectAttempt = 0,
  turns = [],
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
  leads = [],
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
  const [nextLeadConfirmOpen, setNextLeadConfirmOpen] = useState(false);
  const endCancelBtnRef = useRef(null);
  const nextLeadCancelBtnRef = useRef(null);
  const pttHeldRef = useRef(false);

  // ── Call timer ─────────────────────────────────────────────────────────────
  const [callStart, setCallStart] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const active = status !== 'idle' || isVadListening;
    if (active && !callStart) setCallStart(Date.now());
    if (!active && turns.length === 0 && callStart) { setCallStart(null); setElapsed(0); }
  }, [status, isVadListening]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!callStart) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - callStart) / 1000)), 1000);
    return () => clearInterval(t);
  }, [callStart]);

  const hasLead = Boolean(activeLead);

  // ── Space-bar shortcut ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasLead) return;
    const onKeyDown = (e) => {
      if (e.code !== 'Space') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      e.preventDefault();
      if (isPushToTalkMode) {
        if (!pttHeldRef.current) { pttHeldRef.current = true; startPushToTalk?.(); }
      } else {
        if (!isVadListening) startVad?.();
      }
    };
    const onKeyUp = (e) => {
      if (e.code !== 'Space') return;
      if (isPushToTalkMode && pttHeldRef.current) {
        pttHeldRef.current = false;
        stopPushToTalk?.();
      } else if (!isPushToTalkMode && isVadListening) {
        pauseVad?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, [hasLead, isPushToTalkMode, isVadListening, startVad, pauseVad, startPushToTalk, stopPushToTalk]);

  const displayError = errorMsg || (!isPushToTalkMode && vadError
    ? 'VAD Error: ' + ((vadError instanceof Error ? vadError.message : null) || 'Microphone access denied or model failed to load.')
    : null);
  const showConnectionRetry = Boolean(errorMsg) && /connect|backend|Disconnected|Unable to connect|Reconnecting/i.test(errorMsg);
  const activeLeadIndex = activeLead ? (leads?.findIndex(l => l.id === activeLead.id) ?? -1) : -1;

  useEffect(() => { if (endConfirmOpen) endCancelBtnRef.current?.focus(); }, [endConfirmOpen]);
  useEffect(() => { if (nextLeadConfirmOpen) nextLeadCancelBtnRef.current?.focus(); }, [nextLeadConfirmOpen]);
  useEffect(() => {
    if (!endConfirmOpen && !nextLeadConfirmOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') { setEndConfirmOpen(false); setNextLeadConfirmOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [endConfirmOpen, nextLeadConfirmOpen]);

  const requestEndCall = () => {
    if (status === 'idle') return;
    if (turns.length > 0) setEndConfirmOpen(true);
    else endCall();
  };
  const confirmEndCall = () => { setEndConfirmOpen(false); endCall(); };

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!hasLead) {
    const stepsData = [
      { num: 1, title: 'Create a Campaign', done: true },
      { num: 2, title: 'Import your leads', done: leads.length > 0 },
      { num: 3, title: 'Tap "Call Next Lead" in the campaign', done: false },
    ];
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-transparent">
        <header className="motion-safe:animate-slide-up flex-shrink-0 border-b border-white/10 px-6 py-6 dark:border-white/5" style={{ animationDelay: '300ms' }}>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Active Call</h1>
          <p className="text-sm text-slate-600 dark:text-gray-400 mt-1">Select a lead from your campaign to start the voice agent.</p>
        </header>
        <div className="mx-auto flex max-w-sm flex-1 flex-col items-center justify-center px-6 py-12 gap-8 text-center">
          {/* Icon */}
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 border border-brand-200/40 dark:border-brand-700/30 flex items-center justify-center">
            <Phone className="w-9 h-9 text-brand-500 dark:text-brand-400" aria-hidden />
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Ready to call</h2>
            <p className="text-sm text-slate-600 dark:text-gray-400 leading-relaxed">
              {leads.length === 0
                ? 'Import a CSV on the Campaigns tab, pick a lead, and the voice agent will start here.'
                : 'Open Campaigns and tap "Call Next Lead" to route a lead here.'}
            </p>
          </div>

          {/* 3 steps */}
          <div className="w-full space-y-2.5">
            {stepsData.map(({ num, title, done }) => (
              <div
                key={num}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left ${
                  done
                    ? 'border-emerald-200/70 bg-emerald-50/80 dark:border-emerald-800/40 dark:bg-emerald-950/20'
                    : 'border-slate-200/90 bg-white/70 dark:border-gray-800/60 dark:bg-gray-900/40'
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-200 text-slate-500 dark:bg-gray-700 dark:text-gray-400'
                }`}>
                  {done ? '✓' : num}
                </div>
                <span className={`text-sm font-medium ${done ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-600 dark:text-gray-400'}`}>
                  {title}
                </span>
              </div>
            ))}
          </div>

          {typeof onOpenCampaigns === 'function' && (
            <button
              type="button"
              onClick={onOpenCampaigns}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 transition-colors shadow-lg shadow-brand-500/20"
            >
              Go to Campaigns
              <ChevronRight className="w-4 h-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Active call view ───────────────────────────────────────────────────────
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-transparent">

      {/* End-call confirmation modal */}
      {endConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-label="Dismiss" onClick={() => setEndConfirmOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="end-call-title" className="surface-card relative z-10 w-full max-w-md p-6 shadow-2xl rounded-2xl">
            <h2 id="end-call-title" className="text-lg font-semibold text-slate-900 dark:text-white">End this call?</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-gray-400">
              You have {turns.length} {turns.length === 1 ? 'exchange' : 'exchanges'}. Ending will save and close the current call.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button ref={endCancelBtnRef} type="button" onClick={() => setEndConfirmOpen(false)}
                className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 transition-colors dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
                Cancel
              </button>
              <button type="button" onClick={confirmEndCall}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 transition-colors">
                End &amp; save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Next-lead confirmation modal */}
      {nextLeadConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-label="Dismiss" onClick={() => setNextLeadConfirmOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="next-lead-title" className="surface-card relative z-10 w-full max-w-md p-6 shadow-2xl rounded-2xl">
            <h2 id="next-lead-title" className="text-lg font-semibold text-slate-900 dark:text-white">Move to next lead?</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-gray-400">
              You have {turns.length} {turns.length === 1 ? 'exchange' : 'exchanges'}. Moving skips the summary for this call.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button ref={nextLeadCancelBtnRef} type="button" onClick={() => setNextLeadConfirmOpen(false)}
                className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 transition-colors dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
                Cancel
              </button>
              <button type="button" onClick={() => { setNextLeadConfirmOpen(false); handleNextLeadQuick?.(); }}
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 transition-colors">
                Next lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="motion-safe:animate-slide-up flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-6 py-5 dark:border-white/5 sm:px-8" style={{ animationDelay: '300ms' }}>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Active Call</h1>
          <p className="text-sm text-slate-600 dark:text-gray-400 mt-0.5">
            {activeLead.name || 'Lead'} · {activeLeadIndex + 1} of {leads.length}
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {callStart && elapsed > 0 && (
            <span className="text-sm font-mono font-semibold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 px-3 py-1.5 rounded-full border border-brand-200/60 dark:border-brand-700/40 tabular-nums">
              {formatElapsed(elapsed)}
            </span>
          )}
          <StatusBadge status={status} socketReady={socketReady} processingStage={processingStage} />
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-4 py-4 min-h-0 sm:px-8 sm:py-5">

        {/* Script badge */}
        {activeLead?.questionnaireName && (
          <div className="flex items-center gap-2 rounded-xl border border-brand-500/25 bg-brand-500/10 px-3 py-2 text-xs text-brand-800 dark:text-brand-300">
            <ClipboardList className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="font-semibold">Script:</span>
            <span className="truncate">{activeLead.questionnaireName}</span>
          </div>
        )}

        {/* Lifecycle strip */}
        <CallLifecycleStrip socketReady={socketReady} vadLoading={vadLoading} status={status} hasLead={hasLead} hasTurns={turns.length > 0} />

        {/* Inline status chips — subtle row */}
        <div className="flex flex-wrap items-center gap-1.5 px-0.5">
          <MiniChip label={`${settings.languageMode || 'telugu'}`} />
          <MiniChip label={`${turns.length} turn${turns.length !== 1 ? 's' : ''}`} />
          {settings.autoEndCall && <MiniChip label="auto-end on" />}
          {closeDetected && <MiniChip label="close detected" accent />}
          {!isPushToTalkMode && (
            <span className="text-[11px] text-slate-500 dark:text-gray-600 ml-1 hidden sm:inline">
              Barge-in enabled
            </span>
          )}
        </div>

        {/* Lead card */}
        <div className="flex-shrink-0">
          <ActiveLeadCard lead={activeLead} leadIndex={Math.max(activeLeadIndex, 0)} totalLeads={leads.length} />
        </div>

        {/* Conversation */}
        <div
          className="surface-card motion-safe:animate-slide-up flex min-h-[200px] flex-1 flex-col overflow-hidden shadow-xl"
          style={{ animationDelay: '500ms' }}
        >
          {turns.length > 0 && (
            <div className="flex justify-end px-4 pt-3 pb-0">
              <button
                type="button"
                onClick={() => {
                  const text = turns
                    .map(t => [t.transcript && `Lead: ${t.transcript}`, t.aiText && `Agent: ${t.aiText}`]
                      .filter(Boolean).join('\n'))
                    .join('\n\n');
                  navigator.clipboard.writeText(text)
                    .then(() => toast.success('Transcript copied'))
                    .catch(() => toast.error('Could not copy transcript'));
                }}
                className="text-xs text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-300 transition-colors px-2 py-1"
                title="Copy transcript"
              >
                Copy transcript
              </button>
            </div>
          )}
          <ConversationFeed
            turns={turns}
            isProcessing={status === 'processing'}
            processingStage={processingStage}
            isSpeaking={status === 'speaking'}
            languageMode={settings?.languageMode}
          />
        </div>

        {/* VAD loading */}
        {vadLoading && !isPushToTalkMode && (
          <div className="flex-shrink-0 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-800 dark:text-blue-400 text-sm animate-fade-in text-center">
            Initializing AI voice detection…
          </div>
        )}

        {/* Reconnecting banner */}
        {reconnecting && (
          <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-sm animate-fade-in">
            <WifiOff className="w-4 h-4 shrink-0 opacity-80" aria-hidden />
            <p className="flex-1 min-w-0">
              Connection dropped — reconnecting{reconnectAttempt > 1 ? ` (attempt ${reconnectAttempt})` : '…'}
            </p>
            <Loader2 className="w-4 h-4 shrink-0 animate-spin opacity-70" aria-hidden />
          </div>
        )}

        {/* Error */}
        {displayError && (
          <div className="flex-shrink-0 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-800 dark:text-red-400 text-sm animate-fade-in flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="flex-1 min-w-0">{displayError}</p>
            {showConnectionRetry && onRetryConnection && (
              <button type="button" onClick={onRetryConnection}
                className="shrink-0 px-3 py-2 rounded-lg text-xs font-medium bg-red-500/20 border border-red-500/40 text-red-900 hover:bg-red-500/30 dark:text-red-200 min-h-[44px]">
                Retry connection
              </button>
            )}
          </div>
        )}

        {/* Last call summary */}
        {lastCallSummary && (
          <div className="flex-shrink-0 rounded-xl border border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-800/50 dark:bg-emerald-950/30 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400/90 mb-2">Last call summary</p>
            <div className="space-y-1.5 text-xs">
              {lastCallSummary.outcome && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 dark:text-gray-500 w-16 shrink-0">Outcome</span>
                  <span className="text-slate-900 dark:text-white font-medium capitalize">{String(lastCallSummary.outcome).replace(/_/g, ' ')}</span>
                  {lastCallSummary.interestLevel && lastCallSummary.interestLevel !== 'unknown' && (
                    <span className="text-slate-500 dark:text-gray-500">· {lastCallSummary.interestLevel} interest</span>
                  )}
                </div>
              )}
              {lastCallSummary.nextAction && (
                <div className="flex items-start gap-2">
                  <span className="text-slate-500 dark:text-gray-500 w-16 shrink-0">Next step</span>
                  <span className="text-slate-700 dark:text-gray-300">{lastCallSummary.nextAction}</span>
                </div>
              )}
              {lastCallSummary.summaryNote && (
                <p className="text-slate-600 dark:text-gray-400 leading-relaxed pt-1 border-t border-emerald-200/60 dark:border-emerald-800/40">
                  {lastCallSummary.summaryNote}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Summary note */}
        {summaryNote && (
          <div className="flex-shrink-0 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-400 text-sm animate-fade-in">
            {summaryNote}
          </div>
        )}

        {/* ── Controls ──────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 border-t border-slate-200/80 dark:border-gray-800/60 pt-4 pb-2">
          {/* Big record button */}
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

          {/* Primary action buttons */}
          <div className="flex items-center justify-center gap-3 mt-4 max-w-xs mx-auto w-full">
            <button
              type="button"
              onClick={requestEndCall}
              disabled={status === 'idle'}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              <PhoneOff className="w-4 h-4" />
              End Call
            </button>
            <button
              type="button"
              onClick={() => turns.length > 0 ? setNextLeadConfirmOpen(true) : handleNextLeadQuick?.()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-slate-300 dark:border-gray-700 text-slate-700 dark:text-gray-300 hover:border-brand-400 dark:hover:border-brand-600 hover:text-brand-600 dark:hover:text-brand-400 text-sm font-medium transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
              Next Lead
            </button>
          </div>

          {/* Tertiary: replay intro */}
          <div className="flex justify-center mt-2.5">
            <button
              type="button"
              onClick={retryIntro}
              disabled={status !== 'idle'}
              title={status !== 'idle' ? 'Wait for the agent to finish' : 'Replay opening introduction'}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-gray-500 hover:text-brand-600 dark:hover:text-brand-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-2 py-1"
            >
              <RefreshCw className="w-3 h-3" />
              Replay intro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniChip({ label, accent = false }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize ${
      accent
        ? 'bg-brand-500/10 border-brand-500/30 text-brand-700 dark:text-brand-400'
        : 'bg-slate-100 border-slate-200/80 text-slate-500 dark:bg-gray-800/80 dark:border-gray-700/60 dark:text-gray-500'
    }`}>
      {label}
    </span>
  );
}
