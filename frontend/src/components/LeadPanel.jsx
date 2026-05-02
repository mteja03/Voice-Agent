import { useMemo, useRef, useState } from 'react';

const EXPECTED_HEADERS = ['name', 'phone', 'location', 'budget', 'source', 'notes'];
const OUTCOMES = ['new', 'interested', 'follow_up', 'not_interested', 'closed'];
const FILTERS = ['all', ...OUTCOMES];

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const headerMap = {};
  headers.forEach((h, i) => {
    headerMap[h] = i;
  });

  return lines.slice(1).map((line, idx) => {
    const cols = line.split(',').map((c) => c.trim());
    const lead = {};
    EXPECTED_HEADERS.forEach((key) => {
      const colIndex = headerMap[key];
      lead[key] = colIndex !== undefined ? cols[colIndex] || '' : '';
    });
    lead.id = `${lead.phone || 'lead'}-${idx}`;
    lead.status = 'new';
    lead.lastOutcome = 'new';
    lead.nextAction = '';
    lead.followupDate = '';
    lead.lastUpdatedAt = new Date().toISOString();
    return lead;
  });
}

function outcomePillClass(outcome) {
  if (outcome === 'interested') return 'bg-slate-700/50 text-slate-200 border-slate-500/50';
  if (outcome === 'follow_up') return 'bg-slate-700/50 text-slate-200 border-slate-500/50';
  if (outcome === 'not_interested') return 'bg-slate-700/50 text-slate-200 border-slate-500/50';
  if (outcome === 'closed') return 'bg-slate-700/50 text-slate-200 border-slate-500/50';
  return 'bg-gray-800 text-gray-300 border-gray-700';
}

export default function LeadPanel({ leads, activeLead, onLeadsChange, onActiveLeadChange }) {
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [pendingImport, setPendingImport] = useState(null);
  const fileInputRef = useRef(null);

  const hasLeads = leads.length > 0;
  const summary = useMemo(() => {
    if (!activeLead) return 'No lead selected';
    return `${activeLead.name || 'Unknown'} • ${activeLead.phone || 'No phone'}`;
  }, [activeLead]);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    const text = await file.text();
    const parsed = parseCsv(text);
    if (!parsed.length) {
      setError('CSV is empty or invalid. Use headers: name, phone, location, budget, source, notes');
      return;
    }
    const usedExistingIds = new Set();
    const merged = parsed.map((lead, idx) => {
      const existing = leads.find((item) => {
        if (!item?.id || usedExistingIds.has(item.id)) return false;
        const samePhone = item.phone && lead.phone && item.phone === lead.phone;
        const sameName = item.name && lead.name && item.name.toLowerCase() === lead.name.toLowerCase();
        return samePhone && sameName;
      });
      if (existing) {
        usedExistingIds.add(existing.id);
      }
      const mergedLead = existing ? { ...lead, ...existing } : lead;
      return {
        ...mergedLead,
        id: mergedLead.id || `${lead.phone || 'lead'}-${idx}-${Date.now()}`,
      };
    });
    const duplicatePhoneCount = parsed.filter((lead) => lead.phone && leads.some((item) => item.phone === lead.phone)).length;
    const invalidPhoneCount = parsed.filter((lead) => lead.phone && !/^\d{10}$/.test(lead.phone.replace(/\D/g, ''))).length;
    setPendingImport({
      leads: merged,
      stats: {
        totalRows: parsed.length,
        duplicatePhoneCount,
        invalidPhoneCount,
      },
    });
    event.target.value = '';
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    onLeadsChange(pendingImport.leads);
    onActiveLeadChange(pendingImport.leads[0] || null);
    setPendingImport(null);
  };

  const updateActiveLead = (updates) => {
    if (!activeLead) return;
    const nextLeads = leads.map((lead) => (
      lead.id === activeLead.id
        ? { ...lead, ...updates, lastUpdatedAt: new Date().toISOString() }
        : lead
    ));
    onLeadsChange(nextLeads);
    const nextActive = nextLeads.find((lead) => lead.id === activeLead.id) || null;
    onActiveLeadChange(nextActive);
  };

  const moveToNextLead = (markAsSkipped) => {
    if (!activeLead || !leads.length) return;
    if (markAsSkipped) {
      updateActiveLead({ status: 'follow_up', lastOutcome: 'follow_up', nextAction: 'Skipped once, retry later' });
    }
    const currentIndex = leads.findIndex((lead) => lead.id === activeLead.id);
    const nextLead = leads[currentIndex + 1] || null;
    onActiveLeadChange(nextLead);
  };

  const counters = useMemo(() => {
    const total = leads.length;
    const interested = leads.filter((lead) => lead.lastOutcome === 'interested').length;
    const followUp = leads.filter((lead) => lead.lastOutcome === 'follow_up').length;
    const notInterested = leads.filter((lead) => lead.lastOutcome === 'not_interested').length;
    const contacted = leads.filter((lead) => (lead.lastOutcome || 'new') !== 'new').length;
    return { total, interested, followUp, notInterested, contacted };
  }, [leads]);

  const filteredLeads = useMemo(() => {
    if (activeFilter === 'all') return leads;
    return leads.filter((lead) => (lead.lastOutcome || 'new') === activeFilter);
  }, [leads, activeFilter]);

  const completionText = useMemo(() => {
    if (!activeLead) return 'No lead selected';
    const currentIndex = leads.findIndex((lead) => lead.id === activeLead.id);
    if (currentIndex < 0) return 'No lead selected';
    return `Lead ${currentIndex + 1} of ${leads.length}`;
  }, [activeLead, leads]);

  const activeOutcome = activeLead?.lastOutcome || 'new';

  const setOutcome = (outcome) => {
    if (!activeLead) return;
    const status = outcome === 'interested' ? 'qualified' : outcome;
    updateActiveLead({ lastOutcome: outcome, status });
  };

  const markCompleteAndNext = () => {
    if (!activeLead) return;
    const status = activeOutcome === 'new' ? 'follow_up' : activeOutcome;
    updateActiveLead({ status });
    const currentIndex = leads.findIndex((lead) => lead.id === activeLead.id);
    const nextLead = leads[currentIndex + 1] || null;
    onActiveLeadChange(nextLead);
  };

  const clearAllLeads = () => {
    onLeadsChange([]);
    onActiveLeadChange(null);
  };

  const activeTagClass = outcomePillClass(activeOutcome);

  const formatOutcomeLabel = (value) => value.replace('_', ' ');

  const activeFollowupDate = activeLead?.followupDate || '';

  const updateFollowupDate = (value) => {
    updateActiveLead({ followupDate: value, lastOutcome: 'follow_up', status: 'follow_up' });
  };

  const updateNextAction = (value) => {
    updateActiveLead({ nextAction: value });
  };

  const isNextDisabled = !activeLead || leads.findIndex((lead) => lead.id === activeLead.id) >= leads.length - 1;

  const selectedLeadDetails = activeLead ? `${activeLead.phone || 'No phone'}${activeLead.location ? ` • ${activeLead.location}` : ''}` : '';

  return (
    <div className="rounded-2xl ui-surface p-4 sm:p-5 mt-4 sm:mt-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-start justify-between gap-3 sm:gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Lead Calling</p>
          <p className="text-sm text-gray-200 mt-1.5">{summary}</p>
          <p className="text-xs text-gray-500 mt-1">{completionText}</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs px-3 py-2 sm:py-1.5 min-h-10 sm:min-h-0 rounded-lg ui-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            Upload CSV
          </button>
          {hasLeads && (
            <button
              onClick={clearAllLeads}
              className="text-xs px-3 py-2 sm:py-1.5 min-h-10 sm:min-h-0 rounded-lg ui-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleUpload}
        className="hidden"
      />

      {error && (
        <p className="text-xs text-red-400 mt-2">{error}</p>
      )}

      {hasLeads ? (
        <>
          <div className="mt-4">
            <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full bg-brand-500 transition-all"
                style={{ width: `${counters.total ? (counters.contacted / counters.total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              Queue progress: {counters.contacted}/{counters.total} contacted
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
            <StatChip label="Total" value={counters.total} />
            <StatChip label="Interested" value={counters.interested} />
            <StatChip label="Follow up" value={counters.followUp} />
            <StatChip label="Not interested" value={counters.notInterested} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {FILTERS.map((filter) => {
              const isActive = activeFilter === filter;
              return (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                className={`text-[11px] px-2.5 py-1 rounded-md border capitalize transition-colors ${
                    isActive
                    ? 'bg-slate-700/50 border-slate-500 text-slate-100'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  {filter.replace('_', ' ')}
                </button>
              );
            })}
          </div>

          {activeLead && (
            <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-white font-medium">{activeLead.name || 'Unknown Lead'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{selectedLeadDetails}</p>
                </div>
                <span className={`text-[11px] capitalize px-2 py-1 rounded-full border ${activeTagClass}`}>
                  {formatOutcomeLabel(activeOutcome)}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {OUTCOMES.map((outcome) => {
                  const isSelected = activeOutcome === outcome;
                  return (
                    <button
                      key={outcome}
                      onClick={() => setOutcome(outcome)}
                      className={`text-xs px-2.5 py-2 sm:py-1.5 min-h-10 sm:min-h-0 rounded-lg border transition-all ${
                        isSelected
                          ? 'bg-slate-700/50 border-slate-500 text-slate-100'
                          : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                      }`}
                    >
                      {formatOutcomeLabel(outcome)}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 grid sm:grid-cols-2 gap-2.5">
                <input
                  type="date"
                  value={activeFollowupDate}
                  onChange={(e) => updateFollowupDate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-slate-500/40 focus:border-slate-500"
                />
                <input
                  type="text"
                  placeholder="Next action note"
                  value={activeLead.nextAction || ''}
                  onChange={(e) => updateNextAction(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-slate-500/40 focus:border-slate-500"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => moveToNextLead(true)}
                  disabled={isNextDisabled}
                  className="text-xs px-3 py-2 sm:py-1.5 min-h-10 sm:min-h-0 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-100"
                >
                  Skip
                </button>
                <button
                  onClick={markCompleteAndNext}
                  disabled={isNextDisabled}
                  className="text-xs px-3 py-2 sm:py-1.5 min-h-10 sm:min-h-0 rounded-lg bg-slate-200 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-slate-900"
                >
                  Complete & Next
                </button>
                <button
                  onClick={() => moveToNextLead(false)}
                  disabled={isNextDisabled}
                  className="text-xs px-3 py-2 sm:py-1.5 min-h-10 sm:min-h-0 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-100"
                >
                  Next Lead
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 max-h-44 overflow-y-auto custom-scrollbar flex flex-col gap-2">
            {filteredLeads.map((lead) => {
              const isActive = activeLead?.id === lead.id;
              return (
                <button
                  key={lead.id}
                  onClick={() => onActiveLeadChange(lead)}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition-all ${
                    isActive
                      ? 'bg-slate-700/50 border-slate-500 text-slate-100'
                      : 'bg-gray-800/80 border-gray-700 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{lead.name || 'Unknown Lead'}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize ${outcomePillClass(lead.lastOutcome || 'new')}`}>
                      {formatOutcomeLabel(lead.lastOutcome || 'new')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{lead.phone || 'No phone'}{lead.location ? ` • ${lead.location}` : ''}</p>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-500 mt-3">
          Upload a CSV with headers: name, phone, location, budget, source, notes
        </p>
      )}

      {pendingImport && (
        <div className="mt-3 rounded-xl border border-gray-800 bg-gray-900/70 p-3">
          <p className="text-sm text-white font-medium">Import Preview</p>
          <p className="text-xs text-gray-400 mt-1">Rows: {pendingImport.stats.totalRows}</p>
          <p className="text-xs text-gray-400">Duplicate phones: {pendingImport.stats.duplicatePhoneCount}</p>
          <p className="text-xs text-gray-400">Invalid phone format: {pendingImport.stats.invalidPhoneCount}</p>
          <div className="mt-2 max-h-28 overflow-y-auto custom-scrollbar rounded border border-gray-800">
            {pendingImport.leads.slice(0, 8).map((lead) => (
              <div key={lead.id} className="px-2 py-1 border-b border-gray-800 last:border-b-0 text-xs text-gray-300">
                {lead.name || 'Unknown'} • {lead.phone || 'No phone'} {lead.location ? `• ${lead.location}` : ''}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button onClick={confirmImport} className="text-xs px-3 py-1.5 rounded-lg ui-primary">
              Confirm Import
            </button>
            <button onClick={() => setPendingImport(null)} className="text-xs px-3 py-1.5 rounded-lg ui-muted">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/70 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-sm text-gray-200 font-semibold mt-0.5">{value}</p>
    </div>
  );
}
