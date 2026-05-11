import { useMemo, useRef, useState, useEffect } from 'react';
import {
  Upload,
  Trash2,
  CheckCircle2,
  Play,
  Search,
  AlertCircle,
  Users,
  Plus,
  Pencil,
  Download,
  Eye,
  X,
  Loader2,
  Copy,
  RefreshCw,
} from 'lucide-react';
import { listQuestionnaires } from '../services/questionnairesApi';
import { listLeadCallHistory } from '../services/callsApi';
import CallRecordingPair from './CallRecordingPair';

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
    default: return 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
  }
}

function formatCallDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

function callMatchesHistoryFilter(call, filter) {
  if (filter === 'all') return true;
  if (filter === 'has_recording') return Boolean(call.recordingUserUrl || call.recordingAgentUrl);
  if (filter === 'has_transcript') return Array.isArray(call.transcript) && call.transcript.length > 0;
  return String(call.outcome || 'unknown') === filter;
}

async function copyToClipboard(text) {
  if (!text) return false;
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const temp = document.createElement('textarea');
  temp.value = text;
  temp.style.position = 'fixed';
  temp.style.opacity = '0';
  document.body.appendChild(temp);
  temp.focus();
  temp.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  } finally {
    document.body.removeChild(temp);
  }
  return ok;
}

export default function Campaigns({
  campaigns,
  activeCampaignId,
  onActiveCampaignChange,
  onCreateCampaign,
  onRenameCampaign,
  onDeleteCampaign,
  onSetCampaignQuestionnaire,
  leads,
  activeLead,
  onLeadsChange,
  onActiveLeadChange,
  onNavigateToDialer,
}) {
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingImport, setPendingImport] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkOutcome, setBulkOutcome] = useState('follow_up');
  const [newCampaignOpen, setNewCampaignOpen] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [csvDragActive, setCsvDragActive] = useState(false);
  const [questionnaires, setQuestionnaires] = useState([]);
  const [historyLead, setHistoryLead] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyCalls, setHistoryCalls] = useState([]);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historyFocusIndex, setHistoryFocusIndex] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState('');
  const fileInputRef = useRef(null);

  const hasLeads = leads.length > 0;
  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId);
  const canDeleteCampaign = campaigns.length > 1;

  useEffect(() => {
    setActiveFilter('all');
    setSearchQuery('');
    setSelectedIds(new Set());
    setPendingImport(null);
    setNewCampaignOpen(false);
    setNewCampaignName('');
  }, [activeCampaignId]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeFilter, searchQuery]);

  useEffect(() => {
    let cancelled = false;
    listQuestionnaires()
      .then((rows) => {
        if (!cancelled) setQuestionnaires(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setQuestionnaires([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCampaignId]);

  const processCsvText = (text) => {
    setError('');
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
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    processCsvText(text);
    event.target.value = '';
  };

  const handleCsvDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCsvDragActive(true);
  };

  const handleCsvDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCsvDragActive(false);
  };

  const handleCsvDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCsvDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const nameOk = file.name?.toLowerCase().endsWith('.csv');
    const typeOk = file.type === 'text/csv' || file.type === 'application/vnd.ms-excel' || file.type === '';
    if (!nameOk && !typeOk) {
      setError('Please drop a .csv file.');
      return;
    }
    const text = await file.text();
    processCsvText(text);
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
    if (confirm('Are you sure you want to clear all leads in this campaign only?')) {
      onLeadsChange([]);
      onActiveLeadChange(null);
    }
  };

  const submitNewCampaign = (e) => {
    e.preventDefault();
    const name = newCampaignName.trim();
    onCreateCampaign(name || undefined);
    setNewCampaignName('');
    setNewCampaignOpen(false);
  };

  const renameActiveCampaign = () => {
    if (!activeCampaign) return;
    const next = window.prompt('Campaign name', activeCampaign.name);
    if (next === null) return;
    onRenameCampaign(activeCampaignId, next);
  };

  const handleStartCall = (lead) => {
    onActiveLeadChange(lead);
    onNavigateToDialer();
  };

  const openHistory = async (lead) => {
    setHistoryLead(lead);
    setHistoryLoading(true);
    setHistoryError('');
    setHistoryFilter('all');
    setHistorySearch('');
    setHistoryFocusIndex(0);
    try {
      const calls = await listLeadCallHistory({ leadId: lead?.dbId, phone: lead?.phone, limit: 30 });
      setHistoryCalls(Array.isArray(calls) ? calls : []);
    } catch (err) {
      setHistoryError(err.message || 'Failed to load call history');
      setHistoryCalls([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const reloadHistory = async () => {
    if (!historyLead) return;
    await openHistory(historyLead);
  };

  const filteredHistoryCalls = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return historyCalls.filter((call) => {
      if (!callMatchesHistoryFilter(call, historyFilter)) return false;
      if (!q) return true;
      const summary = String(call.summary || '').toLowerCase();
      const transcriptText = (Array.isArray(call.transcript) ? call.transcript : [])
        .map((m) => `${m.role || ''} ${m.content || ''}`)
        .join(' ')
        .toLowerCase();
      const outcome = String(call.outcome || '').toLowerCase();
      return summary.includes(q) || transcriptText.includes(q) || outcome.includes(q);
    });
  }, [historyCalls, historyFilter, historySearch]);

  useEffect(() => {
    if (!historyLead) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setHistoryLead(null);
        return;
      }
      if (!filteredHistoryCalls.length) return;
      if (event.key.toLowerCase() === 'j') {
        setHistoryFocusIndex((prev) => Math.min(filteredHistoryCalls.length - 1, prev + 1));
      } else if (event.key.toLowerCase() === 'k') {
        setHistoryFocusIndex((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [historyLead, filteredHistoryCalls.length]);

  useEffect(() => {
    setHistoryFocusIndex((prev) => {
      if (!filteredHistoryCalls.length) return 0;
      return Math.min(prev, filteredHistoryCalls.length - 1);
    });
  }, [filteredHistoryCalls]);

  useEffect(() => {
    if (!copyFeedback) return undefined;
    const timer = setTimeout(() => setCopyFeedback(''), 1400);
    return () => clearTimeout(timer);
  }, [copyFeedback]);

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent text-slate-800 dark:text-gray-200">
      <header className="px-8 py-6 border-b border-white/10 dark:border-white/5 flex items-center justify-between animate-slide-up" style={{ animationDelay: '300ms' }}>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Campaigns</h1>
          <p className="text-sm text-slate-600 dark:text-gray-400 mt-1">Manage and call your imported lead lists.</p>
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
          <a
            href="/sample-leads.csv"
            download
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 motion-safe:transition-colors dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 min-h-[44px] sm:min-h-0"
          >
            <Download className="w-4 h-4 shrink-0" aria-hidden />
            Sample CSV
          </a>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 motion-safe:transition-colors shadow-lg shadow-brand-500/20 flex items-center gap-2 min-h-[44px] sm:min-h-0"
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
        <section className="mb-8 surface-card p-6 animate-slide-up" style={{ animationDelay: '400ms' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-500 mb-3">
            Campaigns (independent lists)
          </p>
          <div className="flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="flex-1 min-w-0">
              <label htmlFor="campaign-select" className="text-xs text-slate-600 dark:text-gray-500 block mb-1.5">
                Active campaign
              </label>
              <select
                id="campaign-select"
                value={activeCampaignId}
                onChange={(e) => onActiveCampaignChange(e.target.value)}
                className="w-full max-w-md bg-white border border-slate-300 dark:bg-gray-950 dark:border-gray-800 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 min-h-[44px]"
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.leads.length} leads)
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-600 dark:text-gray-500 mt-2 leading-relaxed max-w-xl">
                Imports, filters, and calls apply only to this campaign. Create another to run a separate list in parallel.
              </p>
              <div className="mt-3 max-w-md">
                <label htmlFor="campaign-script-select" className="text-xs text-slate-600 dark:text-gray-500 block mb-1.5">
                  Script for this campaign
                </label>
                <select
                  id="campaign-script-select"
                  value={activeCampaign?.questionnaireId || ''}
                  onChange={(e) => {
                    const qid = e.target.value || null;
                    const picked = questionnaires.find((q) => q.id === qid);
                    onSetCampaignQuestionnaire(
                      activeCampaignId,
                      qid,
                      picked?.name || ''
                    );
                  }}
                  className="w-full bg-white border border-slate-300 dark:bg-gray-950 dark:border-gray-800 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 min-h-[44px]"
                >
                  <option value="">No script (default)</option>
                  {questionnaires.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-600 dark:text-gray-500 mt-1.5">
                  The dialer uses this questionnaire as call guidance for every lead in this campaign.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {!newCampaignOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setNewCampaignOpen(true);
                    setNewCampaignName(`Campaign ${campaigns.length + 1}`);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 transition-colors min-h-[44px]"
                >
                  <Plus className="w-4 h-4" aria-hidden />
                  New campaign
                </button>
              ) : (
                <form
                  onSubmit={submitNewCampaign}
                  className="flex flex-wrap items-center gap-2 p-2 rounded-xl border border-slate-200/90 dark:border-gray-800 bg-slate-50/90 dark:bg-gray-950/80"
                >
                  <input
                    value={newCampaignName}
                    onChange={(e) => setNewCampaignName(e.target.value)}
                    placeholder="Campaign name"
                    className="flex-1 min-w-[140px] bg-white border border-slate-300 dark:bg-gray-900 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 min-h-[40px]"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 rounded-lg text-xs font-medium bg-brand-600 text-white hover:bg-brand-500 min-h-[40px]"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewCampaignOpen(false);
                      setNewCampaignName('');
                    }}
                    className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 min-h-[40px]"
                  >
                    Cancel
                  </button>
                </form>
              )}
              <button
                type="button"
                onClick={renameActiveCampaign}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-800 bg-slate-200 border border-slate-300 hover:bg-slate-300 dark:text-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 min-h-[44px]"
              >
                <Pencil className="w-4 h-4" aria-hidden />
                Rename
              </button>
              <button
                type="button"
                disabled={!canDeleteCampaign}
                onClick={() => onDeleteCampaign(activeCampaignId)}
                title={!canDeleteCampaign ? 'Keep at least one campaign' : 'Delete this campaign'}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-red-300 bg-red-500/10 border border-red-500/25 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
              >
                <Trash2 className="w-4 h-4" aria-hidden />
                Delete
              </button>
            </div>
          </div>
        </section>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {pendingImport && (
          <div className="mb-8 p-6 rounded-2xl bg-white/95 border border-brand-500/30 shadow-2xl shadow-brand-500/5 dark:bg-gray-900 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-500 to-blue-500"></div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-brand-400" />
              Import Preview
            </h3>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div className="bg-slate-100/90 rounded-xl p-4 border border-slate-200/90 dark:bg-gray-800/50 dark:border-gray-700/50">
                <p className="text-xs text-slate-600 dark:text-gray-500 uppercase tracking-wider font-semibold">Total Rows</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{pendingImport.stats.totalRows}</p>
              </div>
              <div className="bg-slate-100/90 rounded-xl p-4 border border-slate-200/90 dark:bg-gray-800/50 dark:border-gray-700/50">
                <p className="text-xs text-slate-600 dark:text-gray-500 uppercase tracking-wider font-semibold">Duplicates</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{pendingImport.stats.duplicatePhoneCount}</p>
              </div>
              <div className="bg-slate-100/90 rounded-xl p-4 border border-slate-200/90 dark:bg-gray-800/50 dark:border-gray-700/50">
                <p className="text-xs text-slate-600 dark:text-gray-500 uppercase tracking-wider font-semibold">Invalid Phones</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{pendingImport.stats.invalidPhoneCount}</p>
              </div>
            </div>
            {pendingImport.duplicateRows?.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
                <p className="text-xs font-semibold text-amber-400 mb-2">Possible duplicate phones (already in list)</p>
                <ul className="text-xs text-slate-700 dark:text-gray-400 space-y-1 max-h-32 overflow-y-auto custom-scrollbar font-mono">
                  {pendingImport.duplicateRows.slice(0, 15).map((r) => (
                    <li key={`d-${r.row}`}>
                      Row {r.row}: {r.name || '—'} · {r.phone}
                    </li>
                  ))}
                </ul>
                {pendingImport.duplicateRows.length > 15 && (
                  <p className="text-[11px] text-slate-600 dark:text-gray-500 mt-2">
                    + {pendingImport.duplicateRows.length - 15} more
                  </p>
                )}
              </div>
            )}
            {pendingImport.invalidRows?.length > 0 && (
              <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/5 p-4">
                <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">Invalid phone (need 10 digits)</p>
                <ul className="text-xs text-slate-700 dark:text-gray-400 space-y-1 max-h-32 overflow-y-auto custom-scrollbar font-mono">
                  {pendingImport.invalidRows.slice(0, 15).map((r) => (
                    <li key={`i-${r.row}`}>
                      Row {r.row}: {r.name || '—'} · {r.phone}
                    </li>
                  ))}
                </ul>
                {pendingImport.invalidRows.length > 15 && (
                  <p className="text-[11px] text-slate-600 dark:text-gray-500 mt-2">
                    + {pendingImport.invalidRows.length - 15} more
                  </p>
                )}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setPendingImport(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-700 hover:text-slate-900 bg-slate-200 hover:bg-slate-300 dark:text-gray-300 dark:hover:text-white dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors min-h-[44px]"
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
          <div
            role="region"
            aria-label="Import leads from CSV"
            onDragEnter={handleCsvDragOver}
            onDragOver={handleCsvDragOver}
            onDragLeave={handleCsvDragLeave}
            onDrop={handleCsvDrop}
            className={`min-h-[280px] flex flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-10 text-center motion-safe:transition-colors ${
              csvDragActive
                ? 'border-brand-500 bg-brand-500/10 dark:border-brand-400 dark:bg-brand-500/10'
                : 'border-slate-300 bg-slate-50/80 dark:border-gray-800 dark:bg-gray-900/20'
            }`}
          >
            <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-gray-800 flex items-center justify-center mb-4 text-slate-500 dark:text-gray-500">
              <Users className="w-8 h-8" aria-hidden />
            </div>
            <p className="text-slate-800 dark:text-gray-300 font-medium">No leads imported yet</p>
            <p className="text-sm text-slate-600 dark:text-gray-500 mt-1 max-w-sm">
              Drag and drop a .csv here, or choose a file. Required columns: name, phone, location, budget, source, notes.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 motion-safe:transition-colors shadow-lg shadow-brand-500/20 min-h-[44px]"
              >
                <Upload className="w-4 h-4" aria-hidden />
                Import CSV
              </button>
              <a
                href="/sample-leads.csv"
                download
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 motion-safe:transition-colors dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 min-h-[44px]"
              >
                <Download className="w-4 h-4 shrink-0" aria-hidden />
                Download sample
              </a>
            </div>
          </div>
        ) : hasLeads && (
          <div className="flex flex-col gap-6">
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-white/95 border border-brand-500/25 dark:bg-gray-900/90">
                <span className="text-sm text-slate-800 dark:text-gray-200 font-medium">{selectedIds.size} selected</span>
                <label className="text-xs text-slate-600 dark:text-gray-500 sr-only" htmlFor="bulk-outcome">
                  Set outcome
                </label>
                <select
                  id="bulk-outcome"
                  value={bulkOutcome}
                  onChange={(e) => setBulkOutcome(e.target.value)}
                  className="text-xs px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 dark:bg-gray-950 dark:border-gray-700 dark:text-white min-h-[44px]"
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
                  className="text-xs px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 min-h-[44px]"
                >
                  Clear selection
                </button>
              </div>
            )}
            {/* Filters & Search */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between">
              <div className="flex items-center gap-2 bg-slate-100/90 p-1.5 rounded-xl border border-slate-200/90 dark:bg-gray-900 dark:border-gray-800/60 overflow-x-auto">
                <button
                  onClick={() => setActiveFilter('all')}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    activeFilter === 'all' ? 'bg-white text-slate-900 shadow-sm dark:bg-gray-800 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  All
                </button>
                {OUTCOMES.map((outcome) => (
                  <button
                    key={outcome}
                    onClick={() => setActiveFilter(outcome)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap capitalize ${
                      activeFilter === outcome ? 'bg-white text-slate-900 shadow-sm dark:bg-gray-800 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    {outcome.replace('_', ' ')}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-gray-500" />
                <input
                  type="text"
                  placeholder="Search leads..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-64 pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 dark:bg-gray-900 dark:border-gray-800 dark:text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                />
              </div>
            </div>

            {/* Table */}
            <div className="surface-card overflow-hidden animate-slide-up" style={{ animationDelay: '500ms' }}>
              <table className="w-full text-left text-sm text-slate-600 dark:text-gray-400">
                <thead className="bg-white/50 text-slate-700 dark:bg-white/5 dark:text-gray-300 text-xs uppercase tracking-wider font-semibold border-b border-slate-200/50 dark:border-white/10">
                  <tr>
                    <th className="pl-4 pr-2 py-4 w-10">
                      <input
                        type="checkbox"
                        className="rounded border-slate-400 dark:border-gray-600 w-4 h-4 accent-brand-500"
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
                <tbody className="divide-y divide-slate-200/80 dark:divide-gray-800/60">
                  {filteredLeads.map((lead) => {
                    const isNextInLine = lead.status === 'new' && lead.id === activeLead?.id;
                    return (
                      <tr key={lead.id} className={`hover:bg-slate-50 dark:hover:bg-gray-800/30 transition-colors group ${isNextInLine ? 'bg-brand-500/5' : ''}`}>
                        <td className="pl-4 pr-2 py-4 align-middle">
                          <input
                            type="checkbox"
                            className="rounded border-slate-400 dark:border-gray-600 w-4 h-4 accent-brand-500"
                            checked={selectedIds.has(lead.id)}
                            onChange={() => toggleSelectOne(lead.id)}
                            aria-label={`Select ${lead.name || 'lead'}`}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-900 dark:text-gray-200">{lead.name || 'Unknown'}</div>
                          {lead.budget && <div className="text-xs text-slate-600 dark:text-gray-500 mt-0.5">Budget: {lead.budget}</div>}
                        </td>
                        <td className="px-6 py-4">{lead.phone || '—'}</td>
                        <td className="px-6 py-4">{lead.location || '—'}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border capitalize tracking-wide ${outcomeBadgeClass(lead.lastOutcome)}`}>
                            {(lead.lastOutcome || 'new').replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openHistory(lead)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors dark:text-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              History
                            </button>
                            <button
                              onClick={() => handleStartCall(lead)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-400 bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/20 transition-colors"
                            >
                              <Play className="w-3.5 h-3.5" />
                              Call
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredLeads.length === 0 && (
                    <tr>
                      <td colSpan="6" className="px-6 py-10 text-center">
                        <p className="text-slate-600 dark:text-gray-400 text-sm mb-4">No leads match this filter or search.</p>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          {searchQuery ? (
                            <button
                              type="button"
                              onClick={() => setSearchQuery('')}
                              className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-200 border border-slate-300 text-slate-800 hover:bg-slate-300 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700 min-h-[44px]"
                            >
                              Clear search
                            </button>
                          ) : null}
                          {activeFilter !== 'all' ? (
                            <button
                              type="button"
                              onClick={() => setActiveFilter('all')}
                              className="px-4 py-2 rounded-lg text-xs font-medium bg-brand-600 text-white hover:bg-brand-500 min-h-[44px]"
                            >
                              Show all leads
                            </button>
                          ) : null}
                          {!searchQuery && activeFilter === 'all' ? (
                            <span className="text-xs text-slate-600 dark:text-gray-500">Try a different search or filter.</span>
                          ) : null}
                        </div>
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
      {historyLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            aria-label="Close history"
            onClick={() => setHistoryLead(null)}
          />
          <div className="surface-card relative z-10 max-h-[96vh] w-full max-w-5xl overflow-hidden p-0">
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur sm:px-5 sm:py-4 dark:border-gray-800 dark:bg-gray-900/85">
              <div>
                <h3 className="text-base font-semibold text-slate-900 sm:text-lg dark:text-white">
                  Call history: {historyLead.name || 'Lead'}
                </h3>
                <p className="mt-0.5 text-xs text-slate-600 sm:text-sm dark:text-gray-400">{historyLead.phone || 'No phone'}</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryLead(null)}
                className="rounded-xl p-2 text-slate-600 transition-colors hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="custom-scrollbar max-h-[calc(96vh-64px)] overflow-y-auto bg-slate-50/70 p-3 sm:p-5 dark:bg-gray-950/30">
              {historyLoading ? (
                <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-600 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading call history...
                </div>
              ) : historyError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                  {historyError}
                </p>
              ) : historyCalls.length === 0 ? (
                <p className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-600 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400">
                  No completed calls found for this lead yet.
                </p>
              ) : (
                <div className="space-y-4 sm:space-y-5">
                  <div className="rounded-xl border border-slate-200/90 bg-white/90 p-3 dark:border-gray-800 dark:bg-gray-900/60">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        {[
                          { id: 'all', label: 'All' },
                          { id: 'interested', label: 'Interested' },
                          { id: 'follow_up', label: 'Follow up' },
                          { id: 'not_interested', label: 'Not interested' },
                          { id: 'has_recording', label: 'Has recording' },
                          { id: 'has_transcript', label: 'Has transcript' },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setHistoryFilter(opt.id)}
                            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                              historyFilter === opt.id
                                ? 'border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                                : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
                          <input
                            value={historySearch}
                            onChange={(e) => setHistorySearch(e.target.value)}
                            placeholder="Search summary/transcript"
                            className="w-56 rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-xs text-slate-700 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={reloadHistory}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                          title="Refresh history"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Refresh
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-gray-400">
                      <span>
                        Showing {filteredHistoryCalls.length} of {historyCalls.length} calls
                      </span>
                      <span>Shortcuts: J/K navigate, Esc close</span>
                    </div>
                  </div>
                  {filteredHistoryCalls.map((call, idx) => (
                    <article
                      key={call.id}
                      className={`rounded-2xl border bg-white p-4 shadow-sm dark:bg-gray-900/50 ${
                        idx === historyFocusIndex
                          ? 'border-brand-500/40 ring-2 ring-brand-500/15 dark:border-brand-500/40'
                          : 'border-slate-200/80 dark:border-gray-800'
                      }`}
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs sm:gap-2">
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-300">
                          {new Date(call.createdAt).toLocaleString()}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-300">
                          {formatCallDuration(call.duration)}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 capitalize ${outcomeBadgeClass(
                            call.outcome
                          )}`}
                        >
                          {String(call.outcome || 'unknown').replace(/_/g, ' ')}
                        </span>
                      </div>
                      {call.summary ? (
                        <div className="mb-3 rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 py-2 dark:border-gray-800 dark:bg-gray-950/60 sm:py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-500">
                              Summary
                            </p>
                            <button
                              type="button"
                              onClick={async () => {
                                const ok = await copyToClipboard(String(call.summary || ''));
                                if (ok) setCopyFeedback(`summary-${call.id}`);
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                            >
                              <Copy className="h-3 w-3" />
                              {copyFeedback === `summary-${call.id}` ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-gray-300 sm:text-[15px]">
                            {call.summary}
                          </p>
                        </div>
                      ) : null}
                      <div className="mb-3">
                        <CallRecordingPair sticky userUrl={call.recordingUserUrl} agentUrl={call.recordingAgentUrl} />
                      </div>
                      <details className="group" open={idx === 0}>
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-600 marker:text-slate-500 dark:text-gray-400">
                          Conversation transcript
                        </summary>
                        <div className="mt-3 max-h-[52vh] space-y-2 overflow-y-auto rounded-xl border border-slate-200/90 bg-slate-50/80 p-2.5 text-sm dark:border-gray-800 dark:bg-gray-950/60 sm:max-h-64 sm:p-3">
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={async () => {
                                const transcriptText = (Array.isArray(call.transcript) ? call.transcript : [])
                                  .map((m) => `${m.role || 'message'}: ${m.content || ''}`)
                                  .join('\n');
                                const ok = await copyToClipboard(transcriptText);
                                if (ok) setCopyFeedback(`transcript-${call.id}`);
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                            >
                              <Copy className="h-3 w-3" />
                              {copyFeedback === `transcript-${call.id}` ? 'Copied transcript' : 'Copy transcript'}
                            </button>
                          </div>
                          {(Array.isArray(call.transcript) ? call.transcript : []).map((m, idx) => (
                            <div
                              key={`${call.id}-${idx}`}
                              className={`rounded-lg px-2 py-1.5 sm:px-2.5 sm:py-2 ${
                                m.role === 'assistant'
                                  ? 'border border-brand-500/15 bg-brand-500/5 text-slate-700 dark:text-gray-200'
                                  : 'border border-slate-200/80 bg-white text-slate-700 dark:border-gray-800 dark:bg-gray-900/80 dark:text-gray-300'
                              }`}
                            >
                              <span className="mr-1 font-semibold capitalize">{m.role || 'message'}:</span>
                              {m.content || ''}
                            </div>
                          ))}
                          {(!Array.isArray(call.transcript) || call.transcript.length === 0) && (
                            <p className="text-slate-500 dark:text-gray-500">No transcript saved for this call.</p>
                          )}
                        </div>
                      </details>
                    </article>
                  ))}
                  {filteredHistoryCalls.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-400">
                      No calls match your current filter/search.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
