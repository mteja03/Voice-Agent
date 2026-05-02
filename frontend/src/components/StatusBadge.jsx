const STATUS_CONFIG = {
  idle: {
    dot: 'bg-slate-300',
    text: 'text-slate-200',
    border: 'border-slate-600/40',
    bg: 'bg-slate-900/40',
    label: 'Ready',
  },
  listening: {
    dot: 'bg-slate-300 animate-pulse',
    text: 'text-slate-200',
    border: 'border-slate-600/40',
    bg: 'bg-slate-900/40',
    label: 'Listening',
  },
  processing: {
    dot: 'bg-slate-300 animate-pulse',
    text: 'text-slate-200',
    border: 'border-slate-600/40',
    bg: 'bg-slate-900/40',
    label: 'Thinking',
  },
  speaking: {
    dot: 'bg-slate-300 animate-pulse',
    text: 'text-slate-200',
    border: 'border-slate-600/40',
    bg: 'bg-slate-900/40',
    label: 'Speaking',
  },
};

export default function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.idle;
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 ${cfg.border} ${cfg.bg}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      <span className={`text-[11px] font-semibold uppercase tracking-wider ${cfg.text}`}>
        {cfg.label}
      </span>
    </div>
  );
}
