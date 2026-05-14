import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
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
  Check,
  Phone,
  User,
  BarChart2,
  Zap,
  Pause,
  ChevronRight,
  MoreHorizontal,
  Info,
  Clock,
  Target,
} from 'lucide-react';
import { listQuestionnaires } from '../services/questionnairesApi';
import { listLeadCallHistory } from '../services/callsApi';
import CallRecordingPair from './CallRecordingPair';

// ─── helpers ──────────────────────────────────────────────────────────────────

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
    case 'new':
      return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/40';
    case 'interested':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/40';
    case 'follow_up':
      return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/40';
    case 'not_interested':
      return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800/40';
    case 'closed':
      return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800/40';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
  }
}

function statusConfig(status) {
  switch (status) {
    case 'active':
      return {
        label: 'Active',
        dot: 'bg-brand-500 animate-pulse',
        badge: 'bg-brand-500/10 text-brand-600 border-brand-500/30 dark:text-brand-300 dark:border-brand-500/30',
      };
    case 'paused':
      return {
        label: 'Paused',
        dot: 'bg-amber-500',
        badge: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300',
      };
    case 'completed':
      return {
        label: 'Completed',
        dot: 'bg-emerald-500',
        badge: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
      };
    default:
      return {
        label: 'Draft',
        dot: 'bg-slate-400',
        badge: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
      };
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

function relativeTime(isoString) {
  if (!isoString) return '—';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function Campaigns({
  campaigns,
  activeCampaignId,
  onActiveCampaignChange,
  onCreateCampaign,
  onRenameCampaign,
  onDeleteCampaign,
  onSetCampaignQuestionnaire,
  onUpdateCampaign,
  leads,
  activeLead,
  onLeadsChange,
  onActiveLeadChange,
  onNavigateToDialer,
}) {
  // core ui state
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingImport, setPendingImport] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkOutcome, setBulkOutcome] = useState('follow_up');
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [csvDragActive, setCsvDragActive] = useState(false);
  const [questionnaires, setQuestionnaires] = useState([]);
  const [questionnairesLoading, setQuestionnairesLoading] = useState(true);
  // campaign tab context menu
  const [tabMenuOpen, setTabMenuOpen] = useState(null); // campaignId or null
  // new campaign modal
  const [newCampaignOpen, setNewCampaignOpen] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignDesc, setNewCampaignDesc] = useState('');
  const [newCampaignQId, setNewCampaignQId] = useState('');
  // inline editing
  const [editingName, setEditingName] = useState(false);
  const [inlineNameDraft, setInlineNameDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [inlineDescDraft, setInlineDescDraft] = useState('');
  // history drawer
  const [historyLead, setHistoryLead] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyCalls, setHistoryCalls] = useState([]);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historyFocusIndex, setHistoryFocusIndex] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState('');
  const [editingSummaryId, setEditingSummaryId] = useState(null);
  const [summaryDraft, setSummaryDraft] = useState('');

  const fileInputRef = useRef(null);
  const tabsRef = useRef(null);
  const inlineNameRef = useRef(null);
  const inlineDescRef = useRef(null);

  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId);
  const hasLeads = leads.length > 0;
  const canDeleteCampaign = campaigns.length > 1;

  // ── derived stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = leads.length;
    const called = leads.filter((l) => l.lastOutcome && l.lastOutcome !== 'new').length;
    const pending = total - called;
    const interested = leads.filter((l) => l.lastOutcome === 'interested').length;
    const followUp = leads.filter((l) => l.lastOutcome === 'follow_up').length;
    const notInterested = leads.filter((l) => l.lastOutcome === 'not_interested').length;
    const closed = leads.filter((l) => l.lastOutcome === 'closed').length;
    const progressPct = total > 0 ? Math.round((called / total) * 100) : 0;
    return { total, called, pending, interested, followUp, notInterested, closed, progressPct };
  }, [leads]);

  const nextLead = useMemo(
    () => leads.find((l) => !l.lastOutcome || l.lastOutcome === 'new'),
    [leads]
  );

  const derivedStatus = useMemo(() => {
    if (!leads.length) return 'draft';
    if (stats.pending === 0) return 'completed';
    return activeCampaign?.status || 'draft';
  }, [leads, stats.pending, activeCampaign?.status]);

  // ── side effects ───────────────────────────────────────────────────────────
  useEffect(() => {
    setActiveFilter('all');
    setSearchQuery('');
    setSelectedIds(new Set());
    setPendingImport(null);
    setEditingName(false);
    setEditingDesc(false);
    setTabMenuOpen(null);
  }, [activeCampaignId]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeFilter, searchQuery]);

  useEffect(() => {
    let cancelled = false;
    setQuestionnairesLoading(true);
    listQuestionnaires()
      .then((rows) => {
        if (!cancelled) setQuestionnaires(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setQuestionnaires([]);
      })
      .finally(() => {
        if (!cancelled) setQuestionnairesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCampaignId]);

  useEffect(() => {
    if (editingName && inlineNameRef.current) {
      inlineNameRef.current.focus();
      inlineNameRef.current.select();
    }
  }, [editingName]);

  useEffect(() => {
    if (editingDesc && inlineDescRef.current) {
      inlineDescRef.current.focus();
    }
  }, [editingDesc]);

  useEffect(() => {
    if (!copyFeedback) return undefined;
    const timer = setTimeout(() => setCopyFeedback(''), 1400);
    return () => clearTimeout(timer);
  }, [copyFeedback]);

  // close tab menu on outside click
  useEffect(() => {
    if (!tabMenuOpen) return undefined;
    const handler = (e) => {
      if (!e.target.closest('[data-tab-menu]')) setTabMenuOpen(null);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [tabMenuOpen]);

  // ── CSV logic ──────────────────────────────────────────────────────────────
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
        const sameName =
          item.name && lead.name && item.name.toLowerCase() === lead.name.toLowerCase();
        return samePhone && sameName;
      });
      if (existing) usedExistingIds.add(existing.id);
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
        leads.some(
          (item) => item.phone && normalizePhoneDigits(item.phone) === d && d.length === 10
        );
      if (dup) duplicateRows.push({ row: rowNum, name: lead.name || '', phone: lead.phone || '' });
      if (lead.phone && d.length !== 10)
        invalidRows.push({ row: rowNum, name: lead.name || '', phone: lead.phone || '' });
    });
    setPendingImport({
      leads: merged,
      stats: {
        totalRows: parsed.length,
        duplicatePhoneCount: duplicateRows.length,
        invalidPhoneCount: invalidRows.length,
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
    const typeOk =
      file.type === 'text/csv' || file.type === 'application/vnd.ms-excel' || file.type === '';
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

  // ── lead table helpers ─────────────────────────────────────────────────────
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesFilter =
        activeFilter === 'all' || (lead.lastOutcome || 'new') === activeFilter;
      const matchesSearch =
        !searchQuery ||
        lead.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.phone?.includes(searchQuery);
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
    setBulkConfirmOpen(true);
  };

  const applyBulkOutcomeConfirmed = () => {
    const ts = new Date().toISOString();
    onLeadsChange(
      leads.map((l) =>
        selectedIds.has(l.id) ? { ...l, lastOutcome: bulkOutcome, lastUpdatedAt: ts } : l
      )
    );
    setSelectedIds(new Set());
    setBulkConfirmOpen(false);
  };

  const clearAllLeads = () => {
    onLeadsChange([]);
    onActiveLeadChange(null);
    setClearConfirmOpen(false);
  };

  const handleStartCall = (lead) => {
    onActiveLeadChange(lead);
    onNavigateToDialer();
  };

  const handleCallNext = () => {
    if (!nextLead) return;
    onActiveLeadChange(nextLead);
    if (onUpdateCampaign) onUpdateCampaign(activeCampaignId, { status: 'active' });
    onNavigateToDialer();
  };

  // ── inline editing ─────────────────────────────────────────────────────────
  const submitInlineName = () => {
    const name = inlineNameDraft.trim();
    if (name && name !== activeCampaign?.name) onRenameCampaign(activeCampaignId, name);
    setEditingName(false);
  };

  const submitInlineDesc = () => {
    const desc = inlineDescDraft.trim();
    if (onUpdateCampaign) onUpdateCampaign(activeCampaignId, { description: desc });
    setEditingDesc(false);
  };

  // ── rename modal ───────────────────────────────────────────────────────────
  const openRename = () => {
    if (!activeCampaign) return;
    setRenameDraft(activeCampaign.name);
    setRenameOpen(true);
  };

  const submitRename = (e) => {
    e?.preventDefault();
    const name = renameDraft.trim();
    if (name) onRenameCampaign(activeCampaignId, name);
    setRenameOpen(false);
  };

  // ── create campaign modal ──────────────────────────────────────────────────
  const openCreateModal = () => {
    setNewCampaignName(`Campaign ${campaigns.length + 1}`);
    setNewCampaignDesc('');
    setNewCampaignQId('');
    setNewCampaignOpen(true);
  };

  const submitNewCampaign = (e) => {
    e.preventDefault();
    const name = newCampaignName.trim();
    if (!name) return;
    const picked = questionnaires.find((q) => q.id === newCampaignQId);
    onCreateCampaign({
      name,
      description: newCampaignDesc.trim(),
      questionnaireId: newCampaignQId || null,
      questionnaireName: picked?.name || '',
    });
    setNewCampaignOpen(false);
  };

  // ── history drawer ─────────────────────────────────────────────────────────
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
    setEditingSummaryId(null);
    await openHistory(historyLead);
  };

  const startEditSummary = (call) => {
    setEditingSummaryId(call.id);
    setSummaryDraft(call.summary || '');
  };

  const saveLocalSummary = (callId) => {
    setHistoryCalls((prev) =>
      prev.map((c) => (c.id === callId ? { ...c, summary: summaryDraft } : c))
    );
    setEditingSummaryId(null);
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

  // ── questionnaire change ───────────────────────────────────────────────────
  const handleQuestionnaireChange = (qid) => {
    const picked = questionnaires.find((q) => q.id === qid);
    onSetCampaignQuestionnaire(activeCampaignId, qid || null, picked?.name || '');
  };

  // ── render helpers ─────────────────────────────────────────────────────────
  const sc = statusConfig(derivedStatus);

  const outcomeChips = [
    {
      label: 'Interested',
      count: stats.interested,
      cls: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/40',
    },
    {
      label: 'Follow-up',
      count: stats.followUp,
      cls: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/40',
    },
    {
      label: 'Not interested',
      count: stats.notInterested,
      cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800/40',
    },
    {
      label: 'Closed',
      count: stats.closed,
      cls: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800/40',
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent text-slate-800 dark:text-gray-200">

      {/* ── CAMPAIGN TABS BAR ──────────────────────────────────────────────── */}
      <div
        ref={tabsRef}
        className="flex items-center gap-1 px-4 sm:px-6 pt-4 pb-0 overflow-x-auto custom-scrollbar border-b border-slate-200/60 dark:border-white/5 animate-slide-up"
        style={{ animationDelay: '100ms' }}
      >
        {campaigns.map((campaign) => {
          const isActive = campaign.id === activeCampaignId;
          const cfg = statusConfig(campaign.status || 'draft');
          return (
            <div key={campaign.id} className="relative shrink-0 group/tab" data-tab-menu>
              <button
                type="button"
                onClick={() => onActiveCampaignChange(campaign.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-t-xl text-sm font-medium transition-all whitespace-nowrap border-b-2 ${
                  isActive
                    ? 'border-brand-500 text-brand-600 dark:text-brand-300 bg-brand-500/5 dark:bg-brand-500/10'
                    : 'border-transparent text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200 hover:bg-slate-100/70 dark:hover:bg-white/5'
                }`}
              >
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`}
                  aria-hidden
                />
                <span className="max-w-[120px] truncate">{campaign.name}</span>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none border ${
                    isActive
                      ? 'bg-brand-500/10 text-brand-600 border-brand-500/20 dark:text-brand-300'
                      : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700'
                  }`}
                >
                  {campaign.leads?.length ?? 0}
                </span>
              </button>

              {/* ⋯ menu button — appears on hover */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setTabMenuOpen(tabMenuOpen === campaign.id ? null : campaign.id);
                }}
                className="absolute right-0 top-1 p-0.5 rounded opacity-0 group-hover/tab:opacity-100 transition-opacity text-slate-400 hover:text-slate-700 dark:text-gray-500 dark:hover:text-gray-200"
                aria-label="Campaign options"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>

              {/* Dropdown */}
              {tabMenuOpen === campaign.id && (
                <div
                  className="absolute top-full left-0 mt-1 z-30 w-40 rounded-xl shadow-xl border border-slate-200/80 bg-white dark:bg-gray-900 dark:border-gray-800 py-1"
                  data-tab-menu
                >
                  <button
                    type="button"
                    onClick={() => {
                      setTabMenuOpen(null);
                      onActiveCampaignChange(campaign.id);
                      setTimeout(() => {
                        setRenameDraft(campaign.name);
                        setRenameOpen(true);
                      }, 0);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Rename
                  </button>
                  <button
                    type="button"
                    disabled={!canDeleteCampaign}
                    onClick={() => {
                      setTabMenuOpen(null);
                      onActiveCampaignChange(campaign.id);
                      setTimeout(() => setDeleteConfirmOpen(true), 0);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* + button */}
        <button
          type="button"
          onClick={openCreateModal}
          className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-t-xl text-sm font-medium text-slate-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-300 hover:bg-brand-500/5 transition-colors border-b-2 border-transparent"
          aria-label="New campaign"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New</span>
        </button>
      </div>

      {/* ── MAIN SCROLLABLE BODY ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5">

          {/* ── CAMPAIGN OVERVIEW CARD ───────────────────────────────────── */}
          <section
            className="surface-card p-5 sm:p-6 animate-slide-up"
            style={{ animationDelay: '200ms' }}
          >
            {/* Row 1: name / status / questionnaire */}
            <div className="flex flex-col lg:flex-row lg:items-start gap-4 justify-between">
              {/* Left: name + status + description */}
              <div className="flex-1 min-w-0">
                {/* Name row */}
                <div className="flex items-center gap-2 flex-wrap">
                  {editingName ? (
                    <form
                      onSubmit={(e) => { e.preventDefault(); submitInlineName(); }}
                      className="flex items-center gap-2"
                    >
                      <input
                        ref={inlineNameRef}
                        value={inlineNameDraft}
                        onChange={(e) => setInlineNameDraft(e.target.value)}
                        onBlur={submitInlineName}
                        onKeyDown={(e) => { if (e.key === 'Escape') setEditingName(false); }}
                        className="text-xl font-bold bg-white dark:bg-gray-900 border border-brand-400/60 rounded-lg px-2 py-0.5 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand-400 min-w-[180px]"
                      />
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setInlineNameDraft(activeCampaign?.name || '');
                        setEditingName(true);
                      }}
                      className="group/name flex items-center gap-1.5 text-xl font-bold text-slate-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-300 transition-colors"
                    >
                      {activeCampaign?.name || 'Untitled'}
                      <Pencil className="w-3.5 h-3.5 opacity-0 group-hover/name:opacity-60 transition-opacity shrink-0" />
                    </button>
                  )}

                  {/* Status badge */}
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${sc.badge}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} aria-hidden />
                    {sc.label}
                  </span>
                </div>

                {/* Description */}
                <div className="mt-1.5">
                  {editingDesc ? (
                    <div className="flex items-start gap-2">
                      <textarea
                        ref={inlineDescRef}
                        value={inlineDescDraft}
                        onChange={(e) => setInlineDescDraft(e.target.value)}
                        onBlur={submitInlineDesc}
                        onKeyDown={(e) => { if (e.key === 'Escape') setEditingDesc(false); }}
                        rows={2}
                        placeholder="Add a description…"
                        className="flex-1 text-sm bg-white dark:bg-gray-900 border border-brand-400/60 rounded-lg px-2 py-1 text-slate-600 dark:text-gray-400 focus:outline-none focus:ring-1 focus:ring-brand-400 resize-none"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setInlineDescDraft(activeCampaign?.description || '');
                        setEditingDesc(true);
                      }}
                      className="group/desc flex items-center gap-1 text-sm text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-300 transition-colors text-left"
                    >
                      {activeCampaign?.description || (
                        <span className="italic">Add a description…</span>
                      )}
                      <Pencil className="w-3 h-3 opacity-0 group-hover/desc:opacity-50 transition-opacity shrink-0" />
                    </button>
                  )}
                </div>
              </div>

              {/* Right: Questionnaire selector */}
              <div className="shrink-0 min-w-[220px]">
                <label className="text-xs font-semibold text-slate-500 dark:text-gray-500 uppercase tracking-wider block mb-1.5">
                  Script / Questionnaire
                </label>
                {questionnairesLoading ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Loading scripts…
                  </div>
                ) : (
                  <>
                    <select
                      value={activeCampaign?.questionnaireId || ''}
                      onChange={(e) => handleQuestionnaireChange(e.target.value || null)}
                      className="w-full bg-white border border-slate-300 dark:bg-gray-950 dark:border-gray-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 min-h-[40px]"
                    >
                      <option value="">No script (default)</option>
                      {questionnaires.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.name}
                        </option>
                      ))}
                    </select>
                    {activeCampaign?.questionnaireId && (
                      <span className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/40">
                        <Check className="w-3 h-3" />
                        {activeCampaign.questionnaireName || 'Assigned'}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Row 2: Progress + outcome chips */}
            {hasLeads && (
              <div className="mt-5 pt-4 border-t border-slate-200/60 dark:border-white/5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Progress bar */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-slate-500 dark:text-gray-500">
                        <span className="font-semibold text-slate-900 dark:text-white">{stats.called}</span>
                        {' / '}
                        <span className="font-semibold text-slate-900 dark:text-white">{stats.total}</span>
                        {' called '}
                        <span className="text-slate-400 dark:text-gray-600">({stats.progressPct}%)</span>
                      </span>
                      <span className="text-xs text-slate-400 dark:text-gray-600">
                        {stats.pending} remaining
                      </span>
                    </div>
                    <div className="h-2 bg-slate-200 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-full transition-all duration-500"
                        style={{ width: `${stats.progressPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Outcome chips */}
                  <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                    {outcomeChips.map((chip) => (
                      <span
                        key={chip.label}
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${chip.cls}`}
                      >
                        {chip.label} {chip.count}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Row 3: CTAs */}
            <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-white/5 flex flex-wrap items-center gap-2">
              {/* Call Next Lead */}
              <button
                type="button"
                onClick={handleCallNext}
                disabled={!nextLead}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-brand-500/20 min-h-[40px]"
              >
                <Zap className="w-4 h-4" />
                Call Next Lead
                {nextLead && (
                  <span className="text-brand-200 font-normal text-xs truncate max-w-[100px]">
                    — {nextLead.name || nextLead.phone}
                  </span>
                )}
              </button>

              {/* Pause / Resume */}
              {onUpdateCampaign && hasLeads && (
                derivedStatus === 'active' ? (
                  <button
                    type="button"
                    onClick={() => onUpdateCampaign(activeCampaignId, { status: 'paused' })}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800/40 transition-colors min-h-[40px]"
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </button>
                ) : derivedStatus === 'paused' ? (
                  <button
                    type="button"
                    onClick={() => onUpdateCampaign(activeCampaignId, { status: 'active' })}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-brand-700 dark:text-brand-300 bg-brand-100 dark:bg-brand-900/30 hover:bg-brand-200 dark:hover:bg-brand-900/50 border border-brand-200 dark:border-brand-800/40 transition-colors min-h-[40px]"
                  >
                    <Play className="w-4 h-4" />
                    Resume
                  </button>
                ) : null
              )}

              {/* Import CSV */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors min-h-[40px]"
              >
                <Upload className="w-4 h-4" />
                Import CSV
              </button>

              {/* Sample CSV */}
              <a
                href="/sample-leads.csv"
                download
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors min-h-[40px]"
              >
                <Download className="w-4 h-4" />
                Sample
              </a>

              {/* Clear leads */}
              {hasLeads && (
                <button
                  type="button"
                  onClick={() => setClearConfirmOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors min-h-[40px] ml-auto"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear list
                </button>
              )}
            </div>
          </section>

          {/* hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleUpload}
            className="hidden"
          />

          {/* ── ERROR BANNER ──────────────────────────────────────────────── */}
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-500 animate-slide-up">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
              <button
                type="button"
                onClick={() => setError('')}
                className="ml-auto shrink-0 text-red-400 hover:text-red-600"
                aria-label="Dismiss error"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ── IMPORT PREVIEW ────────────────────────────────────────────── */}
          {pendingImport && (
            <div className="p-6 rounded-2xl bg-white/95 border border-brand-500/30 shadow-2xl shadow-brand-500/5 dark:bg-gray-900 relative overflow-hidden animate-slide-up">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-500 to-blue-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-brand-400" />
                Import Preview
              </h3>
              <div className="mt-4 grid grid-cols-3 gap-4">
                {[
                  { label: 'Total Rows', value: pendingImport.stats.totalRows, cls: 'text-slate-900 dark:text-white' },
                  { label: 'Duplicates', value: pendingImport.stats.duplicatePhoneCount, cls: 'text-amber-600 dark:text-amber-400' },
                  { label: 'Invalid Phones', value: pendingImport.stats.invalidPhoneCount, cls: 'text-red-600 dark:text-red-400' },
                ].map(({ label, value, cls }) => (
                  <div key={label} className="bg-slate-100/90 rounded-xl p-4 border border-slate-200/90 dark:bg-gray-800/50 dark:border-gray-700/50">
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">{label}</p>
                    <p className={`text-2xl font-bold mt-1 ${cls}`}>{value}</p>
                  </div>
                ))}
              </div>
              {pendingImport.duplicateRows?.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
                  <p className="text-xs font-semibold text-amber-500 mb-2">Possible duplicate phones</p>
                  <ul className="text-xs text-slate-700 dark:text-gray-400 space-y-1 max-h-32 overflow-y-auto custom-scrollbar font-mono">
                    {pendingImport.duplicateRows.slice(0, 15).map((r) => (
                      <li key={`d-${r.row}`}>Row {r.row}: {r.name || '—'} · {r.phone}</li>
                    ))}
                  </ul>
                  {pendingImport.duplicateRows.length > 15 && (
                    <p className="text-[11px] text-slate-500 mt-2">+ {pendingImport.duplicateRows.length - 15} more</p>
                  )}
                </div>
              )}
              {pendingImport.invalidRows?.length > 0 && (
                <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/5 p-4">
                  <p className="text-xs font-semibold text-red-500 mb-2">Invalid phones (need 10 digits)</p>
                  <ul className="text-xs text-slate-700 dark:text-gray-400 space-y-1 max-h-32 overflow-y-auto custom-scrollbar font-mono">
                    {pendingImport.invalidRows.slice(0, 15).map((r) => (
                      <li key={`i-${r.row}`}>Row {r.row}: {r.name || '—'} · {r.phone}</li>
                    ))}
                  </ul>
                  {pendingImport.invalidRows.length > 15 && (
                    <p className="text-[11px] text-slate-500 mt-2">+ {pendingImport.invalidRows.length - 15} more</p>
                  )}
                </div>
              )}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setPendingImport(null)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-700 bg-slate-200 hover:bg-slate-300 dark:text-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors min-h-[44px]"
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

          {/* ── EMPTY STATE ───────────────────────────────────────────────── */}
          {!hasLeads && !pendingImport && (
            <div className="surface-card p-6 animate-slide-up" style={{ animationDelay: '300ms' }}>
              {/* 3-step checklist */}
              <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-300 mb-4">
                Get started in 3 steps
              </h3>
              <div className="space-y-3 mb-6">
                {/* Step 1 — always done */}
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white line-through opacity-60">Campaign created</p>
                    <p className="text-xs text-slate-500 dark:text-gray-500">You've got a named campaign to track your leads.</p>
                  </div>
                </div>
                {/* Step 2 — import leads */}
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 border border-slate-300 dark:bg-gray-800 dark:border-gray-700 flex items-center justify-center">
                    <span className="text-xs font-bold text-slate-500 dark:text-gray-400">2</span>
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Import your leads</p>
                    <p className="text-xs text-slate-500 dark:text-gray-500">Upload a .csv with name, phone, location, budget, source, notes columns.</p>
                  </div>
                </div>
                {/* Step 3 — questionnaire */}
                <div className="flex items-start gap-3">
                  <span
                    className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center border ${
                      activeCampaign?.questionnaireId
                        ? 'bg-emerald-500/15 border-emerald-500/30'
                        : 'bg-slate-100 dark:bg-gray-800 border-slate-300 dark:border-gray-700'
                    }`}
                  >
                    {activeCampaign?.questionnaireId ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <span className="text-xs font-bold text-slate-500 dark:text-gray-400">3</span>
                    )}
                  </span>
                  <div>
                    <p className={`text-sm font-medium ${activeCampaign?.questionnaireId ? 'text-slate-900 dark:text-white line-through opacity-60' : 'text-slate-900 dark:text-white'}`}>
                      Assign a questionnaire
                    </p>
                    <p className="text-xs text-slate-500 dark:text-gray-500">Use the selector above to choose a call script.</p>
                  </div>
                </div>
              </div>

              {/* Drag-drop zone */}
              <div
                role="region"
                aria-label="Import leads from CSV"
                onDragEnter={handleCsvDragOver}
                onDragOver={handleCsvDragOver}
                onDragLeave={handleCsvDragLeave}
                onDrop={handleCsvDrop}
                className={`min-h-[200px] flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
                  csvDragActive
                    ? 'border-brand-500 bg-brand-500/10 dark:border-brand-400 dark:bg-brand-500/10'
                    : 'border-slate-300 bg-slate-50/80 dark:border-gray-800 dark:bg-gray-900/20'
                }`}
              >
                <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-gray-800 flex items-center justify-center mb-3 text-slate-400 dark:text-gray-500">
                  <Users className="w-7 h-7" aria-hidden />
                </div>
                <p className="text-slate-700 dark:text-gray-300 font-medium text-sm">
                  {csvDragActive ? 'Drop to import' : 'Drag & drop your CSV here'}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-500 mt-1 max-w-xs">
                  or click Import CSV above. Required columns: name, phone, location, budget, source, notes.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 transition-colors shadow-lg shadow-brand-500/20 min-h-[44px]"
                  >
                    <Upload className="w-4 h-4" />
                    Import CSV
                  </button>
                  <a
                    href="/sample-leads.csv"
                    download
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors min-h-[44px]"
                  >
                    <Download className="w-4 h-4" />
                    Download sample
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* ── LEADS TABLE ───────────────────────────────────────────────── */}
          {hasLeads && (
            <div className="flex flex-col gap-4 animate-slide-up" style={{ animationDelay: '350ms' }}>

              {/* Bulk action bar */}
              {selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-white/95 border border-brand-500/25 dark:bg-gray-900/90">
                  <span className="text-sm text-slate-800 dark:text-gray-200 font-medium">{selectedIds.size} selected</span>
                  <select
                    value={bulkOutcome}
                    onChange={(e) => setBulkOutcome(e.target.value)}
                    className="text-xs px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 dark:bg-gray-950 dark:border-gray-700 dark:text-white min-h-[40px]"
                  >
                    {OUTCOMES.map((o) => (
                      <option key={o} value={o}>{o.replace('_', ' ')}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={applyBulkOutcome}
                    className="text-xs px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-500 min-h-[40px]"
                  >
                    Apply outcome
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="text-xs px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 min-h-[40px]"
                  >
                    Clear selection
                  </button>
                </div>
              )}

              {/* Filters & search */}
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl border border-slate-200/90 dark:bg-gray-900 dark:border-gray-800/60 overflow-x-auto max-w-full">
                  <button
                    onClick={() => setActiveFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      activeFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-gray-800 dark:text-white'
                        : 'text-slate-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    All
                    <span className="ml-1 text-xs text-slate-400 dark:text-gray-500">{leads.length}</span>
                  </button>
                  {OUTCOMES.map((outcome) => {
                    const count = leads.filter((l) => (l.lastOutcome || 'new') === outcome).length;
                    return (
                      <button
                        key={outcome}
                        onClick={() => setActiveFilter(outcome)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap capitalize ${
                          activeFilter === outcome
                            ? 'bg-white text-slate-900 shadow-sm dark:bg-gray-800 dark:text-white'
                            : 'text-slate-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-gray-200'
                        }`}
                      >
                        {outcome.replace('_', ' ')}
                        <span className="ml-1 text-xs text-slate-400 dark:text-gray-500">{count}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="relative shrink-0 w-full sm:w-auto">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search leads…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full sm:w-56 pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 dark:bg-gray-900 dark:border-gray-800 dark:text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="surface-card overflow-hidden">
                <table className="w-full text-left text-sm text-slate-600 dark:text-gray-400">
                  <thead className="bg-white/50 text-slate-600 dark:bg-white/5 dark:text-gray-400 text-xs uppercase tracking-wider font-semibold border-b border-slate-200/50 dark:border-white/10">
                    <tr>
                      <th className="pl-4 pr-2 py-3.5 w-8">
                        <input
                          type="checkbox"
                          className="rounded border-slate-400 dark:border-gray-600 w-4 h-4 accent-brand-500"
                          checked={allFilteredSelected}
                          onChange={toggleSelectAllFiltered}
                          aria-label="Select all visible leads"
                        />
                      </th>
                      <th className="px-3 py-3.5 w-10 text-center">#</th>
                      <th className="px-4 py-3.5">Name / Budget</th>
                      <th className="px-4 py-3.5 hidden sm:table-cell">Phone</th>
                      <th className="px-4 py-3.5 hidden md:table-cell">Location</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5 hidden lg:table-cell">Last Updated</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-gray-800/60">
                    {filteredLeads.map((lead) => {
                      const isNext = nextLead?.id === lead.id;
                      const globalIdx = leads.indexOf(lead);
                      return (
                        <tr
                          key={lead.id}
                          className={`hover:bg-slate-50/80 dark:hover:bg-gray-800/20 transition-colors group ${
                            isNext
                              ? 'border-l-2 border-l-brand-500 bg-brand-500/3 dark:bg-brand-500/5'
                              : 'border-l-2 border-l-transparent'
                          } ${selectedIds.has(lead.id) ? 'bg-brand-500/5 dark:bg-brand-500/8' : ''}`}
                        >
                          <td className="pl-4 pr-2 py-3 align-middle">
                            <input
                              type="checkbox"
                              className="rounded border-slate-400 dark:border-gray-600 w-4 h-4 accent-brand-500"
                              checked={selectedIds.has(lead.id)}
                              onChange={() => toggleSelectOne(lead.id)}
                              aria-label={`Select ${lead.name || 'lead'}`}
                            />
                          </td>
                          <td className="px-3 py-3 text-center text-xs text-slate-400 dark:text-gray-600 font-mono">
                            {globalIdx + 1}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div>
                                <div className="font-medium text-slate-900 dark:text-gray-200 flex items-center gap-1.5">
                                  {lead.name || 'Unknown'}
                                  {isNext && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-brand-500/10 text-brand-600 dark:text-brand-300 border border-brand-500/20">
                                      Next
                                    </span>
                                  )}
                                </div>
                                {lead.budget && (
                                  <div className="text-xs text-slate-500 dark:text-gray-500 mt-0.5">
                                    Budget: {lead.budget}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell font-mono text-xs">
                            {lead.phone || '—'}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell text-xs">
                            {lead.location || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize tracking-wide ${outcomeBadgeClass(lead.lastOutcome)}`}
                            >
                              {(lead.lastOutcome || 'new').replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell text-xs text-slate-400 dark:text-gray-600">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {relativeTime(lead.lastUpdatedAt)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openHistory(lead)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors dark:text-gray-300 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 min-h-[36px]"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">History</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStartCall(lead)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors min-h-[36px] ${
                                  isNext
                                    ? 'text-white bg-brand-600 hover:bg-brand-500 border-brand-600 shadow-sm shadow-brand-500/20'
                                    : 'text-brand-600 dark:text-brand-300 bg-brand-500/10 hover:bg-brand-500/20 border-brand-500/20'
                                }`}
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
                        <td colSpan="8" className="px-6 py-12 text-center">
                          <p className="text-slate-500 dark:text-gray-400 text-sm mb-4">
                            No leads match this filter or search.
                          </p>
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            {searchQuery && (
                              <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-200 border border-slate-300 text-slate-800 hover:bg-slate-300 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700 min-h-[40px]"
                              >
                                Clear search
                              </button>
                            )}
                            {activeFilter !== 'all' && (
                              <button
                                type="button"
                                onClick={() => setActiveFilter('all')}
                                className="px-4 py-2 rounded-lg text-xs font-medium bg-brand-600 text-white hover:bg-brand-500 min-h-[40px]"
                              >
                                Show all leads
                              </button>
                            )}
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

      {/* ── HISTORY DRAWER ────────────────────────────────────────────────── */}
      {historyLead && (() => {
        const selectedCall = filteredHistoryCalls[historyFocusIndex] || null;
        return (
          <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Call history">
            <button
              type="button"
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              aria-label="Close history"
              onClick={() => setHistoryLead(null)}
            />
            <div className="relative z-10 flex h-full w-full max-w-5xl flex-col bg-white shadow-2xl dark:bg-gray-900">
              {/* Header */}
              <header className="flex shrink-0 flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:px-5 sm:py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-500">Call history</p>
                    <h3 className="mt-0.5 flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white sm:text-lg">
                      <User className="h-4 w-4 shrink-0 text-slate-400 dark:text-gray-500" aria-hidden />
                      {historyLead.name || 'Unknown lead'}
                    </h3>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-gray-400">
                      <Phone className="h-3 w-3 shrink-0" aria-hidden />
                      {historyLead.phone || 'No phone number'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHistoryLead(null)}
                    className="shrink-0 rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {!historyLoading && !historyError && historyCalls.length > 0 && (
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
                        onClick={() => { setHistoryFilter(opt.id); setHistoryFocusIndex(0); }}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                          historyFilter === opt.id
                            ? 'border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                    <div className="relative ml-auto">
                      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
                      <input
                        value={historySearch}
                        onChange={(e) => { setHistorySearch(e.target.value); setHistoryFocusIndex(0); }}
                        placeholder="Search summary/transcript"
                        className="w-52 rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-xs text-slate-700 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={reloadHistory}
                      title="Refresh history"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Refresh
                    </button>
                  </div>
                )}
              </header>

              {/* Body */}
              {historyLoading ? (
                <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-600 dark:text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading call history…
                </div>
              ) : historyError ? (
                <div className="flex flex-1 items-center justify-center p-8">
                  <p className="max-w-sm rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                    {historyError}
                  </p>
                </div>
              ) : historyCalls.length === 0 ? (
                <div className="flex flex-1 items-center justify-center p-8">
                  <p className="text-sm text-slate-500 dark:text-gray-400">No completed calls found for this lead yet.</p>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1">
                  {/* Left call list */}
                  <div className="custom-scrollbar flex w-60 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-slate-50 dark:border-gray-800 dark:bg-gray-950 sm:w-72">
                    <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-500">
                      {filteredHistoryCalls.length} of {historyCalls.length} calls
                    </div>
                    {filteredHistoryCalls.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-slate-500 dark:text-gray-400">No calls match this filter.</p>
                    ) : (
                      filteredHistoryCalls.map((call, idx) => (
                        <button
                          key={call.id}
                          type="button"
                          onClick={() => { setHistoryFocusIndex(idx); setEditingSummaryId(null); }}
                          className={`w-full border-b px-3 py-3 text-left transition-colors dark:border-gray-800 ${
                            idx === historyFocusIndex
                              ? 'border-l-2 border-l-brand-500 bg-brand-500/8 dark:bg-brand-500/10'
                              : 'border-l-2 border-l-transparent hover:bg-white dark:hover:bg-gray-900'
                          }`}
                        >
                          <p className="text-xs font-medium text-slate-800 dark:text-gray-200">
                            {new Date(call.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-gray-500">
                            {new Date(call.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                            {' · '}{formatCallDuration(call.duration)}
                          </p>
                          <span className={`mt-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${outcomeBadgeClass(call.outcome)}`}>
                            {String(call.outcome || 'unknown').replace(/_/g, ' ')}
                          </span>
                          {call.summary && (
                            <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-slate-500 dark:text-gray-500">
                              {call.summary}
                            </p>
                          )}
                        </button>
                      ))
                    )}
                    <p className="px-3 py-2 text-[10px] text-slate-400 dark:text-gray-600">J/K to navigate · Esc to close</p>
                  </div>

                  {/* Right call detail */}
                  <div className="custom-scrollbar flex-1 overflow-y-auto bg-white p-4 dark:bg-gray-900 sm:p-6">
                    {!selectedCall ? (
                      <div className="flex h-full items-center justify-center">
                        <p className="text-sm text-slate-400 dark:text-gray-500">Select a call on the left to view details.</p>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-300">
                            {new Date(selectedCall.createdAt).toLocaleString()}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-300">
                            {formatCallDuration(selectedCall.duration)}
                          </span>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 capitalize font-medium ${outcomeBadgeClass(selectedCall.outcome)}`}>
                            {String(selectedCall.outcome || 'unknown').replace(/_/g, ' ')}
                          </span>
                        </div>

                        {/* Summary */}
                        <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 dark:border-gray-800 dark:bg-gray-950/60">
                          <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 px-3 py-2 dark:border-gray-800">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-500">Summary</p>
                            <div className="flex items-center gap-1">
                              {editingSummaryId === selectedCall.id ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => saveLocalSummary(selectedCall.id)}
                                    className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                  >
                                    <Check className="h-3 w-3" />
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingSummaryId(null)}
                                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                                  >
                                    <X className="h-3 w-3" />
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => startEditSummary(selectedCall)}
                                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                                  >
                                    <Pencil className="h-3 w-3" />
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const ok = await copyToClipboard(String(selectedCall.summary || ''));
                                      if (ok) setCopyFeedback(`summary-${selectedCall.id}`);
                                    }}
                                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                                  >
                                    <Copy className="h-3 w-3" />
                                    {copyFeedback === `summary-${selectedCall.id}` ? 'Copied' : 'Copy'}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="px-3 py-2.5">
                            {editingSummaryId === selectedCall.id ? (
                              <textarea
                                autoFocus
                                value={summaryDraft}
                                onChange={(e) => setSummaryDraft(e.target.value)}
                                rows={4}
                                className="w-full resize-none rounded-lg border border-brand-400/60 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-1 focus:ring-brand-400 dark:border-brand-600/50 dark:bg-gray-900 dark:text-gray-200"
                              />
                            ) : selectedCall.summary ? (
                              <p className="text-sm leading-relaxed text-slate-700 dark:text-gray-300">{selectedCall.summary}</p>
                            ) : (
                              <p className="text-sm italic text-slate-400 dark:text-gray-500">No summary — click Edit to add one.</p>
                            )}
                          </div>
                        </div>

                        {/* Recording */}
                        <CallRecordingPair userUrl={selectedCall.recordingUserUrl} agentUrl={selectedCall.recordingAgentUrl} />

                        {/* Transcript */}
                        <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 dark:border-gray-800 dark:bg-gray-950/60">
                          <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 px-3 py-2 dark:border-gray-800">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-500">Conversation transcript</p>
                            <button
                              type="button"
                              onClick={async () => {
                                const text = (Array.isArray(selectedCall.transcript) ? selectedCall.transcript : [])
                                  .map((m) => `${m.role || 'message'}: ${m.content || ''}`)
                                  .join('\n');
                                const ok = await copyToClipboard(text);
                                if (ok) setCopyFeedback(`transcript-${selectedCall.id}`);
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                            >
                              <Copy className="h-3 w-3" />
                              {copyFeedback === `transcript-${selectedCall.id}` ? 'Copied' : 'Copy transcript'}
                            </button>
                          </div>
                          <div className="space-y-2 p-3">
                            {(Array.isArray(selectedCall.transcript) ? selectedCall.transcript : []).length === 0 ? (
                              <p className="text-sm text-slate-400 dark:text-gray-500">No transcript saved for this call.</p>
                            ) : (
                              (Array.isArray(selectedCall.transcript) ? selectedCall.transcript : []).map((m, mi) => (
                                <div
                                  key={`${selectedCall.id}-${mi}`}
                                  className={`rounded-lg px-2.5 py-2 text-sm ${
                                    m.role === 'assistant'
                                      ? 'border border-brand-500/15 bg-brand-500/5 text-slate-700 dark:text-gray-200'
                                      : 'border border-slate-200/80 bg-white text-slate-700 dark:border-gray-800 dark:bg-gray-900/80 dark:text-gray-300'
                                  }`}
                                >
                                  <span className="mr-1.5 font-semibold capitalize text-slate-900 dark:text-white">
                                    {m.role === 'assistant' ? 'Assistant' : 'User'}:
                                  </span>
                                  {m.content || ''}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── CREATE CAMPAIGN MODAL ─────────────────────────────────────────── */}
      {newCampaignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            aria-label="Dismiss"
            onClick={() => setNewCampaignOpen(false)}
          />
          <div role="dialog" aria-modal="true" aria-labelledby="new-campaign-title" className="surface-card relative z-10 w-full max-w-md p-6 shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h2 id="new-campaign-title" className="text-lg font-semibold text-slate-900 dark:text-white">
                New campaign
              </h2>
              <button
                type="button"
                onClick={() => setNewCampaignOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submitNewCampaign} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1.5">
                  Campaign name <span className="text-red-500">*</span>
                </label>
                <input
                  autoFocus
                  type="text"
                  value={newCampaignName}
                  onChange={(e) => setNewCampaignName(e.target.value)}
                  placeholder="e.g. Q3 Outreach"
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1.5">
                  Description <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={newCampaignDesc}
                  onChange={(e) => setNewCampaignDesc(e.target.value)}
                  placeholder="What is this campaign for?"
                  rows={2}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1.5">
                  Questionnaire <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <select
                  value={newCampaignQId}
                  onChange={(e) => setNewCampaignQId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white min-h-[44px]"
                >
                  <option value="">No script (default)</option>
                  {questionnaires.map((q) => (
                    <option key={q.id} value={q.id}>{q.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewCampaignOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium border border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newCampaignName.trim()}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-brand-500/20 min-h-[44px]"
                >
                  Create Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── RENAME MODAL ──────────────────────────────────────────────────── */}
      {renameOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-label="Dismiss" onClick={() => setRenameOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="rename-title" className="surface-card relative z-10 w-full max-w-md p-6 shadow-2xl">
            <h2 id="rename-title" className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Rename campaign</h2>
            <form onSubmit={submitRename}>
              <input
                autoFocus
                type="text"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white min-h-[44px]"
                placeholder="Campaign name"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setRenameOpen(false)} className="px-4 py-2 rounded-xl border border-slate-300 bg-slate-50 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 min-h-[44px]">Cancel</button>
                <button type="submit" disabled={!renameDraft.trim()} className="px-4 py-2 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-40 min-h-[44px]">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DELETE CAMPAIGN MODAL ─────────────────────────────────────────── */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-label="Dismiss" onClick={() => setDeleteConfirmOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="delete-campaign-title" className="surface-card relative z-10 w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h2 id="delete-campaign-title" className="text-lg font-semibold text-slate-900 dark:text-white">
                  Delete "{activeCampaign?.name}"?
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-gray-400">
                  This will permanently delete the campaign and all its leads. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setDeleteConfirmOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-slate-50 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteCampaign(activeCampaignId);
                  setDeleteConfirmOpen(false);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-500 transition-colors min-h-[44px]"
              >
                Delete campaign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CLEAR LIST MODAL ──────────────────────────────────────────────── */}
      {clearConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-label="Dismiss" onClick={() => setClearConfirmOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="clear-title" className="surface-card relative z-10 w-full max-w-md p-6 shadow-2xl">
            <h2 id="clear-title" className="text-lg font-semibold text-slate-900 dark:text-white">Clear all leads?</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-gray-400">
              This will permanently remove all {leads.length} leads from this campaign. This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" autoFocus onClick={() => setClearConfirmOpen(false)} className="px-4 py-2 rounded-xl border border-slate-300 bg-slate-50 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 min-h-[44px]">Cancel</button>
              <button type="button" onClick={clearAllLeads} className="px-4 py-2 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-500 min-h-[44px]">Clear all leads</button>
            </div>
          </div>
        </div>
      )}

      {/* ── BULK OUTCOME MODAL ────────────────────────────────────────────── */}
      {bulkConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-label="Dismiss" onClick={() => setBulkConfirmOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="bulk-title" className="surface-card relative z-10 w-full max-w-md p-6 shadow-2xl">
            <h2 id="bulk-title" className="text-lg font-semibold text-slate-900 dark:text-white">Apply bulk outcome?</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-gray-400">
              Set{' '}
              <span className="font-medium text-slate-900 dark:text-white capitalize">{bulkOutcome.replace('_', ' ')}</span>
              {' '}on{' '}
              <span className="font-medium text-slate-900 dark:text-white">{selectedIds.size} leads</span>?{' '}
              This will overwrite their current outcomes.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" autoFocus onClick={() => setBulkConfirmOpen(false)} className="px-4 py-2 rounded-xl border border-slate-300 bg-slate-50 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 min-h-[44px]">Cancel</button>
              <button type="button" onClick={applyBulkOutcomeConfirmed} className="px-4 py-2 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-500 min-h-[44px]">Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
