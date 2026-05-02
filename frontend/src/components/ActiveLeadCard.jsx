function outcomePillClass(outcome) {
  if (outcome === 'interested') return 'bg-slate-700/50 text-slate-200 border-slate-500/50';
  if (outcome === 'follow_up') return 'bg-slate-700/50 text-slate-200 border-slate-500/50';
  if (outcome === 'not_interested') return 'bg-slate-700/50 text-slate-200 border-slate-500/50';
  if (outcome === 'closed') return 'bg-slate-700/50 text-slate-200 border-slate-500/50';
  return 'bg-gray-800 text-gray-300 border-gray-700';
}

function formatOutcomeLabel(value) {
  return (value || 'new').replace('_', ' ');
}

export default function ActiveLeadCard({ lead, leadIndex, totalLeads }) {
  if (!lead) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-gray-700/60 bg-gray-900/30 px-4 py-3">
        <p className="text-sm text-gray-400">No active lead selected. Upload and select a lead to start calling.</p>
      </div>
    );
  }

  const outcome = lead.lastOutcome || 'new';

  return (
    <div className="mt-4 rounded-xl border border-gray-800/70 bg-gray-900/55 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-gray-500">Active Lead</p>
          <p className="text-sm text-white font-medium mt-0.5">{lead.name || 'Unknown Lead'}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {lead.phone || 'No phone'}
            {lead.location ? ` • ${lead.location}` : ''}
            {lead.source ? ` • ${lead.source}` : ''}
          </p>
        </div>
        <div className="text-right">
          <span className={`text-[11px] capitalize px-2 py-1 rounded-full border ${outcomePillClass(outcome)}`}>
            {formatOutcomeLabel(outcome)}
          </span>
          <p className="text-[11px] text-gray-500 mt-1">Lead {leadIndex + 1} / {totalLeads}</p>
        </div>
      </div>
      {(lead.budget || lead.nextAction) && (
        <p className="text-xs text-gray-400 mt-2">
          {lead.budget ? `Budget: ${lead.budget}` : 'Budget: —'}
          {lead.nextAction ? ` • Next: ${lead.nextAction}` : ''}
        </p>
      )}
    </div>
  );
}
