function outcomeMeta(outcome) {
  switch (outcome) {
    case 'interested':    return { label: 'Interested',     cls: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700/40' };
    case 'follow_up':     return { label: 'Follow-up',      cls: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/40' };
    case 'not_interested':return { label: 'Not Interested', cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700/40' };
    case 'closed':        return { label: 'Closed',         cls: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/40' };
    default:              return { label: 'New',            cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700' };
  }
}

export default function ActiveLeadCard({ lead, leadIndex, totalLeads }) {
  if (!lead) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300/90 bg-slate-50/90 dark:border-gray-700/60 dark:bg-gray-900/30 px-4 py-3">
        <p className="text-sm text-slate-600 dark:text-gray-400">No active lead selected.</p>
      </div>
    );
  }

  const { label: outcomeLabel, cls: outcomeCls } = outcomeMeta(lead.lastOutcome || 'new');

  const infoLine = [
    lead.phone || 'No phone',
    lead.location,
    lead.source,
  ].filter(Boolean).join(' · ');

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white/90 dark:border-gray-800/70 dark:bg-gray-900/55 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-500">
          Active Lead
        </span>
        <span className="text-[11px] text-slate-500 dark:text-gray-500">
          {leadIndex + 1} <span className="text-slate-300 dark:text-gray-700">/</span> {totalLeads}
        </span>
      </div>

      {/* Main row */}
      <div className="flex items-start justify-between gap-3 px-4 pb-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-slate-900 dark:text-white leading-tight">
            {lead.name || 'Unknown Lead'}
          </p>
          <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5 truncate">{infoLine}</p>
        </div>
        <span className={`shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full border ${outcomeCls}`}>
          {outcomeLabel}
        </span>
      </div>

      {/* Details row */}
      {(lead.budget || lead.notes || lead.nextAction || lead.campaignName || lead.questionnaireName) && (
        <div className="border-t border-slate-100 dark:border-gray-800/60 px-4 py-2.5 space-y-1.5">
          {(lead.budget || lead.nextAction) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {lead.budget && (
                <span className="text-xs text-slate-600 dark:text-gray-400">
                  <span className="text-slate-400 dark:text-gray-600">Budget</span> {lead.budget}
                </span>
              )}
              {lead.nextAction && (
                <span className="text-xs text-slate-600 dark:text-gray-400">
                  <span className="text-slate-400 dark:text-gray-600">Next</span> {lead.nextAction}
                </span>
              )}
            </div>
          )}
          {lead.notes && (
            <p className="text-xs text-slate-500 dark:text-gray-500 leading-snug line-clamp-2 italic">
              "{lead.notes}"
            </p>
          )}
          {(lead.campaignName || lead.questionnaireName) && (
            <div className="flex flex-wrap gap-2">
              {lead.campaignName && (
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-gray-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-400 inline-block" />
                  {lead.campaignName}
                </span>
              )}
              {lead.questionnaireName && (
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-gray-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block" />
                  {lead.questionnaireName}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
