export function ConnectingBadge() {
  return (
    <div className="inline-flex flex-col gap-1 rounded-xl border border-amber-300/70 bg-amber-50/90 dark:border-amber-600/40 dark:bg-amber-950/40 px-3 py-2">
      <div className="inline-flex items-center gap-2">
        <span className="w-2 h-2 rounded-full shrink-0 bg-amber-500 dark:bg-amber-400 animate-pulse" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-900 dark:text-amber-100">Connecting</span>
      </div>
      <p className="text-[10px] text-slate-600 dark:text-gray-500 max-w-[220px] leading-snug pl-4">
        Establishing a live socket to the voice backend…
      </p>
    </div>
  );
}

const STATUS_CONFIG = {
  idle: {
    dot: 'bg-slate-400 dark:bg-slate-300',
    text: 'text-slate-800 dark:text-slate-200',
    border: 'border-slate-300/90 dark:border-slate-600/40',
    bg: 'bg-slate-100/90 dark:bg-slate-900/40',
    label: 'Ready',
    hint: 'Select a lead, then tap Start to begin.',
  },
  listening: {
    dot: 'bg-emerald-500 dark:bg-emerald-400 animate-pulse',
    text: 'text-emerald-900 dark:text-emerald-100',
    border: 'border-emerald-300/80 dark:border-emerald-600/40',
    bg: 'bg-emerald-50/95 dark:bg-emerald-950/50',
    label: 'Listening',
    hint: 'Speak clearly; pause when you finish a thought.',
  },
  processing: {
    dot: 'bg-amber-500 dark:bg-amber-400 animate-pulse',
    text: 'text-amber-900 dark:text-amber-100',
    border: 'border-amber-300/80 dark:border-amber-600/40',
    bg: 'bg-amber-50/95 dark:bg-amber-950/40',
    label: 'Processing',
    hint: 'Transcribing and generating a reply…',
  },
  speaking: {
    dot: 'bg-sky-500 dark:bg-sky-400 animate-pulse',
    text: 'text-sky-900 dark:text-sky-100',
    border: 'border-sky-300/80 dark:border-sky-600/40',
    bg: 'bg-sky-50/95 dark:bg-sky-950/40',
    label: 'Speaking',
    hint: 'Agent is playing — you can interrupt; the mic opens again after a short guard, or tap Pause.',
  },
};

export default function StatusBadge({ status, socketReady = true }) {
  if (!socketReady) {
    return <ConnectingBadge />;
  }
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.idle;
  return (
    <div className={`inline-flex flex-col gap-1 rounded-xl border px-3 py-2 ${cfg.border} ${cfg.bg}`}>
      <div className="inline-flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${cfg.text}`}>
          {cfg.label}
        </span>
      </div>
      <p className="text-[10px] text-slate-600 dark:text-gray-500 max-w-[220px] leading-snug pl-4">{cfg.hint}</p>
    </div>
  );
}
