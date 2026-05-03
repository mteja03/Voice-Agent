const STATUS_CONFIG = {
  idle: {
    dot: 'bg-slate-300',
    text: 'text-slate-200',
    border: 'border-slate-600/40',
    bg: 'bg-slate-900/40',
    label: 'Ready',
    hint: 'Select a lead, then tap Start to begin.',
  },
  listening: {
    dot: 'bg-emerald-400 animate-pulse',
    text: 'text-emerald-100',
    border: 'border-emerald-600/40',
    bg: 'bg-emerald-950/50',
    label: 'Listening',
    hint: 'Speak clearly; pause when you finish a thought.',
  },
  processing: {
    dot: 'bg-amber-400 animate-pulse',
    text: 'text-amber-100',
    border: 'border-amber-600/40',
    bg: 'bg-amber-950/40',
    label: 'Processing',
    hint: 'Transcribing and generating a reply…',
  },
  speaking: {
    dot: 'bg-sky-400 animate-pulse',
    text: 'text-sky-100',
    border: 'border-sky-600/40',
    bg: 'bg-sky-950/40',
    label: 'Speaking',
    hint: 'Agent is playing audio — wait to speak or use Pause.',
  },
};

export default function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.idle;
  return (
    <div className={`inline-flex flex-col gap-1 rounded-xl border px-3 py-2 ${cfg.border} ${cfg.bg}`}>
      <div className="inline-flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${cfg.text}`}>
          {cfg.label}
        </span>
      </div>
      <p className="text-[10px] text-gray-500 max-w-[220px] leading-snug pl-4">{cfg.hint}</p>
    </div>
  );
}
