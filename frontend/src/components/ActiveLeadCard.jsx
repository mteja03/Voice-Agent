function outcomePillClass(outcome) {
  const base =
    'bg-slate-200/90 text-slate-800 border-slate-300/90 dark:bg-slate-700/50 dark:text-slate-200 dark:border-slate-500/50';
  if (outcome === 'interested') return base;
  if (outcome === 'follow_up') return base;
  if (outcome === 'not_interested') return base;
  if (outcome === 'closed') return base;
  return 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
}

function formatOutcomeLabel(value) {
  return (value || 'new').replace('_', ' ');
}

export default function ActiveLeadCard({ lead, leadIndex, totalLeads }) {
  if (!lead) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-slate-300/90 bg-slate-50/90 dark:border-gray-700/60 dark:bg-gray-900/30 px-4 py-3">
        <p className="text-sm text-slate-600 dark:text-gray-400">No active lead selected. Upload and select a lead to start calling.</p>
      </div>
    );
  }

  const outcome = lead.lastOutcome || 'new';

  return (
    <div className="mt-4 rounded-xl border border-slate-200/90 bg-white/90 dark:border-gray-800/70 dark:bg-gray-900/55 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-gray-500">Active Lead</p>
          <p className="text-sm text-slate-900 dark:text-white font-medium mt-0.5">{lead.name || 'Unknown Lead'}</p>
          <p className="text-xs text-slate-600 dark:text-gray-400 mt-0.5">
            {lead.phone || 'No phone'}
            {lead.location ? ` • ${lead.location}` : ''}
            {lead.source ? ` • ${lead.source}` : ''}
          </p>
        </div>
        <div className="text-right">
          <span className={`text-[11px] capitalize px-2 py-1 rounded-full border ${outcomePillClass(outcome)}`}>
            {formatOutcomeLabel(outcome)}
          </span>
          <p className="text-[11px] text-slate-500 dark:text-gray-500 mt-1">Lead {leadIndex + 1} / {totalLeads}</p>
        </div>
      </div>
      {(lead.budget || lead.nextAction) && (
        <p className="text-xs text-slate-600 dark:text-gray-400 mt-2">
          {lead.budget ? `Budget: ${lead.budget}` : 'Budget: —'}
          {lead.nextAction ? ` • Next: ${lead.nextAction}` : ''}
        </p>
      )}
    </div>
  );
}
