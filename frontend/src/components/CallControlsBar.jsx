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
  const canPause = isVadListening;
  const Button = ({ onClick, disabled, className, children, title: tip }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tip}
      aria-disabled={disabled}
      className={`text-xs px-2.5 sm:px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 rounded-lg transition-all duration-200 ease-out disabled:opacity-50 disabled:cursor-not-allowed basis-[calc(50%-0.3125rem)] sm:basis-auto ${className}`}
    >
      {children}
    </button>
  );

  return (
    <div className="mt-3 rounded-xl border border-gray-800/80 bg-gray-900/90 backdrop-blur px-2.5 sm:px-3 py-2.5 shadow-lg shadow-black/20">
      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          onClick={onStart}
          disabled={!hasLead}
          className="ui-primary"
          tip={!hasLead ? 'Choose a lead in Campaigns first' : 'Begin intro and open the microphone'}
        >
          Start
        </Button>
        <Button
          onClick={onPause}
          disabled={!canPause}
          className="ui-muted"
          tip={canPause ? 'Pause listening (same as large mic)' : 'Only available while the assistant is listening'}
        >
          Pause
        </Button>
        <Button
          onClick={onRetryIntro}
          disabled={!hasLead}
          className="ui-muted"
          tip="Replay the opening line for this lead"
        >
          Retry Intro
        </Button>
        <Button
          onClick={onEndCall}
          disabled={!canEnd}
          className="ui-muted"
          tip={!canEnd ? 'Start a call first' : 'Hang up, save summary, and log the call'}
        >
          End & Save
        </Button>
        <Button
          onClick={onNextLead}
          disabled={!hasLead}
          className="ui-muted"
          tip="Switch to the next lead in your list"
        >
          Next Lead
        </Button>
        <span className="w-full sm:w-auto sm:ml-auto text-[11px] text-gray-400 px-2 py-1.5 min-h-[44px] sm:min-h-0 flex items-center rounded bg-gray-800/80 border border-gray-700/70">
          {hasLead ? `${activeLead.name || 'Lead selected'}` : 'Select a lead to begin'}
        </span>
      </div>
    </div>
  );
}
