import { useMemo, useRef, useState, useEffect } from 'react';
import { Upload, Trash2, Phone, Filter, ChevronRight, CheckCircle2, Play, Search, AlertCircle, Users } from 'lucide-react';

function normalizePhoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

const EXPECTED_HEADERS = ['name', 'phone', 'location', 'budget', 'source', 'notes'];
const OUTCOMES = ['new', 'interested', 'follow_up', 'not_interested', 'closed'];

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

function outcomeBadgeClass(outcome) {
  switch (outcome) {
    case 'new': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'interested': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'follow_up': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'not_interested': return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'closed': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    default: return 'bg-gray-800 text-gray-400 border-gray-700';
  }
}

export default function Campaigns({ leads, activeLead, onLeadsChange, onActiveLeadChange, onNavigateToDialer }) {
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingImport, setPendingImport] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkOutcome, setBulkOutcome] = useState('follow_up');
  const fileInputRef = useRef(null);

  const hasLeads = leads.length > 0;

  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeFilter, searchQuery]);

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
    const duplicateRows = [];
    const invalidRows = [];
    parsed.forEach((lead, idx) => {
      const rowNum = idx + 2;
      const d = normalizePhoneDigits(lead.phone);
      const dup =
        Boolean(lead.phone) &&
        leads.some((item) => item.phone && normalizePhoneDigits(item.phone) === d && d.length === 10);
      if (dup) duplicateRows.push({ row: rowNum, name: lead.name || '', phone: lead.phone || '' });
      if (lead.phone && d.length !== 10) {
        invalidRows.push({ row: rowNum, name: lead.name || '', phone: lead.phone || '' });
      }
    });
    const duplicatePhoneCount = duplicateRows.length;
    const invalidPhoneCount = invalidRows.length;
    setPendingImport({
      leads: merged,
      stats: {
        totalRows: parsed.length,
        duplicatePhoneCount,
        invalidPhoneCount,
      },
      duplicateRows,
      invalidRows,
    });
    event.target.value = '';
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    onLeadsChange(pendingImport.leads);
    if (!activeLead) onActiveLeadChange(pendingImport.leads[0] || null);
    setPendingImport(null);
  };

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesFilter = activeFilter === 'all' || (lead.lastOutcome || 'new') === activeFilter;
      const matchesSearch = !searchQuery || 
        (lead.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
         lead.phone?.includes(searchQuery));
      return matchesFilter && matchesSearch;
    });
  }, [leads, activeFilter, searchQuery]);

  const allFilteredSelected =
    filteredLeads.length > 0 && filteredLeads.every((l) => selectedIds.has(l.id));

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredLeads.map((l) => l.id)));
    }
  };

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyBulkOutcome = () => {
    if (selectedIds.size === 0) return;
    const ts = new Date().toISOString();
    onLeadsChange(
      leads.map((l) =>
        selectedIds.has(l.id) ? { ...l, lastOutcome: bulkOutcome, lastUpdatedAt: ts } : l
      )
    );
    setSelectedIds(new Set());
  };

  const clearAllLeads = () => {
    if (confirm('Are you sure you want to clear all leads in this campaign?')) {
      onLeadsChange([]);
      onActiveLeadChange(null);
    }
  };

  const handleStartCall = (lead) => {
    onActiveLeadChange(lead);
    onNavigateToDialer();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-950 text-gray-200">
      <header className="px-8 py-6 border-b border-gray-800/60 bg-gray-900/30 backdrop-blur flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Campaigns</h1>
          <p className="text-sm text-gray-400 mt-1">Manage and call your imported lead lists.</p>
        </div>
        <div className="flex items-center gap-3">
          {hasLeads && (
            <button
              onClick={clearAllLeads}
              className="px-4 py-2 rounded-xl text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Clear List
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 transition-colors shadow-lg shadow-brand-500/20 flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleUpload}
            className="hidden"
          />
        </div>
      </header>

      <div className="flex-1 overflow-auto custom-scrollbar">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {pendingImport && (
          <div className="mb-8 p-6 rounded-2xl bg-gray-900 border border-brand-500/30 shadow-2xl shadow-brand-500/5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-500 to-blue-500"></div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-brand-400" />
              Import Preview
            </h3>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Total Rows</p>
                <p className="text-2xl font-bold text-white mt-1">{pendingImport.stats.totalRows}</p>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Duplicates</p>
                <p className="text-2xl font-bold text-amber-400 mt-1">{pendingImport.stats.duplicatePhoneCount}</p>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Invalid Phones</p>
                <p className="text-2xl font-bold text-red-400 mt-1">{pendingImport.stats.invalidPhoneCount}</p>
              </div>
            </div>
            {pendingImport.duplicateRows?.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
                <p className="text-xs font-semibold text-amber-400 mb-2">Possible duplicate phones (already in list)</p>
                <ul className="text-xs text-gray-400 space-y-1 max-h-32 overflow-y-auto custom-scrollbar font-mono">
                  {pendingImport.duplicateRows.slice(0, 15).map((r) => (
                    <li key={`d-${r.row}`}>
                      Row {r.row}: {r.name || '—'} · {r.phone}
                    </li>
                  ))}
                </ul>
                {pendingImport.duplicateRows.length > 15 && (
                  <p className="text-[11px] text-gray-500 mt-2">
                    + {pendingImport.duplicateRows.length - 15} more
                  </p>
                )}
              </div>
            )}
            {pendingImport.invalidRows?.length > 0 && (
              <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/5 p-4">
                <p className="text-xs font-semibold text-red-400 mb-2">Invalid phone (need 10 digits)</p>
                <ul className="text-xs text-gray-400 space-y-1 max-h-32 overflow-y-auto custom-scrollbar font-mono">
                  {pendingImport.invalidRows.slice(0, 15).map((r) => (
                    <li key={`i-${r.row}`}>
                      Row {r.row}: {r.name || '—'} · {r.phone}
                    </li>
                  ))}
                </ul>
                {pendingImport.invalidRows.length > 15 && (
                  <p className="text-[11px] text-gray-500 mt-2">
                    + {pendingImport.invalidRows.length - 15} more
                  </p>
                )}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setPendingImport(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={confirmImport}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 transition-colors shadow-lg shadow-brand-500/20 min-h-[44px]"
              >
                Confirm Import
              </button>
            </div>
          </div>
        )}

        {!hasLeads && !pendingImport ? (
          <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-gray-800 rounded-3xl bg-gray-900/20">
            <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mb-4 text-gray-500">
              <Users className="w-8 h-8" />
            </div>
            <p className="text-gray-400 font-medium">No leads imported yet.</p>
            <p className="text-sm text-gray-500 mt-1">Upload a CSV file to start a new campaign.</p>
          </div>
        ) : hasLeads && (
          <div className="flex flex-col gap-6">
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-gray-900/90 border border-brand-500/25">
                <span className="text-sm text-gray-200 font-medium">{selectedIds.size} selected</span>
                <label className="text-xs text-gray-500 sr-only" htmlFor="bulk-outcome">
                  Set outcome
                </label>
                <select
                  id="bulk-outcome"
                  value={bulkOutcome}
                  onChange={(e) => setBulkOutcome(e.target.value)}
                  className="text-xs px-3 py-2 rounded-lg bg-gray-950 border border-gray-700 text-white min-h-[44px]"
                >
                  {OUTCOMES.map((o) => (
                    <option key={o} value={o}>
                      {o.replace('_', ' ')}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={applyBulkOutcome}
                  className="text-xs px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-500 min-h-[44px]"
                >
                  Apply outcome
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs px-3 py-2 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 min-h-[44px]"
                >
                  Clear selection
                </button>
              </div>
            )}
            {/* Filters & Search */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between">
              <div className="flex items-center gap-2 bg-gray-900 p-1.5 rounded-xl border border-gray-800/60 overflow-x-auto">
                <button
                  onClick={() => setActiveFilter('all')}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    activeFilter === 'all' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  All
                </button>
                {OUTCOMES.map((outcome) => (
                  <button
                    key={outcome}
                    onClick={() => setActiveFilter(outcome)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap capitalize ${
                      activeFilter === outcome ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {outcome.replace('_', ' ')}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search leads..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-64 pl-9 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-sm text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                />
              </div>
            </div>

            {/* Table */}
            <div className="bg-gray-900/50 border border-gray-800/60 rounded-2xl overflow-hidden backdrop-blur-sm">
              <table className="w-full text-left text-sm text-gray-400">
                <thead className="bg-gray-900/80 text-gray-300 text-xs uppercase tracking-wider font-semibold border-b border-gray-800/60">
                  <tr>
                    <th className="pl-4 pr-2 py-4 w-10">
                      <input
                        type="checkbox"
                        className="rounded border-gray-600 w-4 h-4 accent-brand-500"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllFiltered}
                        aria-label="Select all visible leads"
                      />
                    </th>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Phone</th>
                    <th className="px-6 py-4">Location</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {filteredLeads.map((lead) => {
                    const isNextInLine = lead.status === 'new' && lead.id === activeLead?.id;
                    return (
                      <tr key={lead.id} className={`hover:bg-gray-800/30 transition-colors group ${isNextInLine ? 'bg-brand-500/5' : ''}`}>
                        <td className="pl-4 pr-2 py-4 align-middle">
                          <input
                            type="checkbox"
                            className="rounded border-gray-600 w-4 h-4 accent-brand-500"
                            checked={selectedIds.has(lead.id)}
                            onChange={() => toggleSelectOne(lead.id)}
                            aria-label={`Select ${lead.name || 'lead'}`}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-200">{lead.name || 'Unknown'}</div>
                          {lead.budget && <div className="text-xs text-gray-500 mt-0.5">Budget: {lead.budget}</div>}
                        </td>
                        <td className="px-6 py-4">{lead.phone || '—'}</td>
                        <td className="px-6 py-4">{lead.location || '—'}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border capitalize tracking-wide ${outcomeBadgeClass(lead.lastOutcome)}`}>
                            {(lead.lastOutcome || 'new').replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleStartCall(lead)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-400 bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/20 transition-colors"
                          >
                            <Play className="w-3.5 h-3.5" />
                            Call
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredLeads.length === 0 && (
                    <tr>
                      <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                        No leads found matching your criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
