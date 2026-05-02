import { useMemo, useRef, useState } from 'react';
import { Upload, Trash2, Phone, Filter, ChevronRight, CheckCircle2, Play, Search, AlertCircle, Users } from 'lucide-react';

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
  const fileInputRef = useRef(null);

  const hasLeads = leads.length > 0;

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

      <div className="flex-1 overflow-auto p-8 custom-scrollbar">
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
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setPendingImport(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmImport}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 transition-colors shadow-lg shadow-brand-500/20"
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
                      <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
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
  );
}
