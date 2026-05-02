export default function CallControlsBar({
  status,
  activeLead,
  isVadListening,
  onStart,
  onPause,
  onEndCall,
  onRetryIntro,
  onNextLead,
}) {
  const hasLead = Boolean(activeLead);
  const canEnd = hasLead && status !== 'idle';
  const Button = ({ onClick, disabled, className, children }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-xs px-2.5 sm:px-3 py-2 sm:py-1.5 min-h-10 sm:min-h-0 rounded-lg transition-all duration-200 ease-out disabled:opacity-50 disabled:cursor-not-allowed basis-[calc(50%-0.3125rem)] sm:basis-auto ${className}`}
    >
      {children}
    </button>
  );

  return (
    <div className="sticky top-[58px] sm:top-[60px] z-10 mt-3 rounded-xl border border-gray-800/80 bg-gray-900/90 backdrop-blur px-2.5 sm:px-3 py-2.5 shadow-lg shadow-black/20">
      <div className="flex flex-wrap items-center gap-2.5">
        <Button onClick={onStart} disabled={!hasLead} className="ui-primary">
          Start
        </Button>
        <Button onClick={onPause} disabled={!isVadListening} className="ui-muted">
          Pause
        </Button>
        <Button onClick={onRetryIntro} disabled={!hasLead} className="ui-muted">
          Retry Intro
        </Button>
        <Button onClick={onEndCall} disabled={!canEnd} className="ui-muted">
          End & Save
        </Button>
        <Button onClick={onNextLead} disabled={!hasLead} className="ui-muted">
          Next Lead
        </Button>
        <span className="w-full sm:w-auto sm:ml-auto text-[11px] text-gray-400 px-2 py-1 rounded bg-gray-800/80 border border-gray-700/70">
          {hasLead ? `${activeLead.name || 'Lead selected'}` : 'Select a lead to begin'}
        </span>
      </div>
    </div>
  );
}
