import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  Mic,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  listQuestionnaires,
  getQuestionnaire,
  createQuestionnaire,
  updateQuestionnaire,
  deleteQuestionnaire,
} from '../services/questionnairesApi';

// ─── constants ────────────────────────────────────────────────────────────────

const QUESTION_TYPES = [
  { value: 'text',          label: 'Open text',       icon: '💬' },
  { value: 'single_choice', label: 'Single choice',   icon: '⊙' },
  { value: 'multi_choice',  label: 'Multi choice',    icon: '☑' },
];

const STARTER_TEMPLATES = [
  {
    id: 'real-estate',
    icon: '🏠',
    name: 'Real Estate Pre-qualification',
    description: 'Qualify buyers on location, type, and budget',
    questions: [
      { type: 'single_choice', prompt: 'Are you looking to buy for personal use or as an investment?', options: ['Personal use', 'Investment', 'Both'], required: true },
      { type: 'text',          prompt: 'Which area or city are you looking to buy in?',               options: [], required: true },
      { type: 'single_choice', prompt: 'What type of property are you interested in?',               options: ['Plot', 'Villa', 'Apartment / Flat', 'Any'], required: true },
      { type: 'single_choice', prompt: 'What is your approximate budget?',                           options: ['Under ₹30L', '₹30L–₹60L', '₹60L–₹1Cr', 'Above ₹1Cr'], required: true },
      { type: 'single_choice', prompt: 'Are you ready to purchase within the next 3 months?',        options: ['Yes', 'Within 6 months', 'Just exploring'], required: false },
    ],
  },
  {
    id: 'interest-timeline',
    icon: '📅',
    name: 'Interest & Timeline',
    description: 'Gauge urgency and interest before pitching a project',
    questions: [
      { type: 'single_choice', prompt: 'How interested are you in exploring a new property right now?', options: ['Very interested', 'Somewhat interested', 'Just looking'], required: true },
      { type: 'single_choice', prompt: 'What is your expected timeline to make a decision?',            options: ['This month', '1–3 months', '3–6 months', 'Not decided'], required: true },
      { type: 'text',          prompt: 'What is the most important factor for you when choosing a property?', options: [], required: false },
    ],
  },
  {
    id: 'site-visit',
    icon: '📍',
    name: 'Site Visit Request',
    description: 'Confirm availability and schedule a visit',
    questions: [
      { type: 'single_choice', prompt: 'Would you be open to visiting the site this weekend?', options: ['Yes, Saturday', 'Yes, Sunday', 'Weekday is better', 'Not right now'], required: true },
      { type: 'text',          prompt: 'What time works best for you?',                        options: [], required: false },
      { type: 'single_choice', prompt: 'Will you be bringing anyone else for the visit?',      options: ['Just me', 'Partner / spouse', 'Family', 'Business partner'], required: false },
    ],
  },
  {
    id: 'callback',
    icon: '📞',
    name: 'Callback Qualification',
    description: 'Quick 2-question lead triage for callbacks',
    questions: [
      { type: 'single_choice', prompt: 'Is this still a good time to talk about property options?', options: ['Yes, go ahead', 'Call me later today', 'Call me tomorrow', 'Not interested'], required: true },
      { type: 'text',          prompt: 'Any specific requirement you would like us to know before we proceed?', options: [], required: false },
    ],
  },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

let _keyCounter = 0;
function nextClientKey() {
  _keyCounter += 1;
  return `ck-${Date.now()}-${_keyCounter}`;
}

function emptyQuestion() {
  return {
    clientKey: nextClientKey(),
    type: 'text',
    prompt: '',
    options: [],
    optionInput: '',
    required: true,
  };
}

function templateToQuestions(templateQuestions) {
  return templateQuestions.map((q) => ({
    clientKey: nextClientKey(),
    type: q.type,
    prompt: q.prompt,
    options: Array.isArray(q.options) ? [...q.options] : [],
    optionInput: '',
    required: q.required !== false,
  }));
}

function questionsEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((qa, i) => {
    const qb = b[i];
    return (
      qa.type === qb.type &&
      qa.prompt === qb.prompt &&
      qa.required === qb.required &&
      JSON.stringify(qa.options) === JSON.stringify(qb.options)
    );
  });
}

function relativeTime(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── sub-components ───────────────────────────────────────────────────────────

function TypeChip({ value, selected, onClick }) {
  const t = QUESTION_TYPES.find((x) => x.value === value);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
        selected
          ? 'border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
      }`}
    >
      <span>{t?.icon}</span>
      {t?.label}
    </button>
  );
}

function OptionChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
      {label}
      <button type="button" onClick={onRemove} className="ml-0.5 text-slate-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function QuestionnaireBuilder({ activeCompanyId }) {
  // list state
  const [summaries, setSummaries]       = useState([]);
  const [listLoading, setListLoading]   = useState(true);
  const [sidebarSearch, setSidebarSearch] = useState('');

  // editor identity
  const [selectedId, setSelectedId]     = useState(null);
  const [isNew, setIsNew]               = useState(true);

  // form state
  const [name, setName]                 = useState('');
  const [description, setDescription]   = useState('');
  const [questions, setQuestions]       = useState([emptyQuestion()]);

  // baseline for dirty detection
  const baselineRef = useRef({ name: '', description: '', questions: [] });
  const [isDirty, setIsDirty]           = useState(false);

  // UI state
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');
  const [saveOk, setSaveOk]             = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen]   = useState(false);

  // drag state
  const [dragIndex, setDragIndex]       = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  // autosave timer
  const autosaveRef = useRef(null);

  // ── helpers ────────────────────────────────────────────────────────────────

  const markDirty = useCallback(() => setIsDirty(true), []);

  const checkDirty = useCallback((nextName, nextDesc, nextQuestions) => {
    const b = baselineRef.current;
    const dirty =
      nextName !== b.name ||
      nextDesc !== b.description ||
      !questionsEqual(nextQuestions, b.questions);
    setIsDirty(dirty);
  }, []);

  const setBaseline = useCallback((n, d, qs) => {
    baselineRef.current = {
      name: n,
      description: d,
      questions: qs.map((q) => ({ type: q.type, prompt: q.prompt, options: [...q.options], required: q.required })),
    };
    setIsDirty(false);
  }, []);

  // ── list load ──────────────────────────────────────────────────────────────

  const loadList = useCallback(async () => {
    setListLoading(true);
    setError('');
    try {
      const rows = await listQuestionnaires();
      setSummaries(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e.message || 'Failed to load questionnaires');
      setSummaries([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList, activeCompanyId]);

  // ── reset to new draft ─────────────────────────────────────────────────────

  const resetNewDraft = useCallback((templateId = null) => {
    clearTimeout(autosaveRef.current);
    setSelectedId(null);
    setIsNew(true);
    setSaveOk(false);
    setError('');
    setPreviewOpen(false);

    const template = STARTER_TEMPLATES.find((t) => t.id === templateId);
    const initName = template ? template.name : 'Untitled questionnaire';
    const initDesc = template ? template.description : '';
    const initQs   = template ? templateToQuestions(template.questions) : [emptyQuestion()];

    setName(initName);
    setDescription(initDesc);
    setQuestions(initQs);
    setBaseline(initName, initDesc, initQs);
  }, [setBaseline]);

  useEffect(() => {
    resetNewDraft();
  }, [activeCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── load detail ────────────────────────────────────────────────────────────

  const loadDetail = useCallback(async (id) => {
    clearTimeout(autosaveRef.current);
    setDetailLoading(true);
    setError('');
    setSaveOk(false);
    setPreviewOpen(false);
    try {
      const q = await getQuestionnaire(id);
      setSelectedId(id);
      setIsNew(false);
      const n  = q.name || '';
      const d  = q.description || '';
      const qs = (Array.isArray(q.questions) ? q.questions : []).map((row, i) => ({
        clientKey: row.id || `q-${i}`,
        type: row.type || 'text',
        prompt: row.prompt || '',
        options: Array.isArray(row.options) ? row.options : [],
        optionInput: '',
        required: row.required !== false,
      }));
      const finalQs = qs.length ? qs : [emptyQuestion()];
      setName(n);
      setDescription(d);
      setQuestions(finalQs);
      setBaseline(n, d, finalQs);
    } catch (e) {
      setError(e.message || 'Failed to open questionnaire');
    } finally {
      setDetailLoading(false);
    }
  }, [setBaseline]);

  // ── save ───────────────────────────────────────────────────────────────────

  const buildPayload = useCallback(() => ({
    name: name.trim() || 'Untitled questionnaire',
    description: description.trim(),
    questions: questions.map((q, i) => ({
      sortOrder: i,
      type: q.type,
      prompt: q.prompt.trim() || `Question ${i + 1}`,
      options: q.type === 'text' ? [] : q.options,
      required: q.required,
    })),
  }), [name, description, questions]);

  const handleSave = useCallback(async () => {
    clearTimeout(autosaveRef.current);
    setSaving(true);
    setError('');
    setSaveOk(false);
    try {
      const payload = buildPayload();
      if (isNew || !selectedId) {
        const created = await createQuestionnaire(payload);
        setIsNew(false);
        setSelectedId(created.id);
        await loadList();
      } else {
        await updateQuestionnaire(selectedId, payload);
        await loadList();
      }
      setBaseline(name, description, questions);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [buildPayload, isNew, selectedId, loadList, setBaseline, name, description, questions]);

  // ── autosave (existing questionnaires only, 2s debounce) ──────────────────

  useEffect(() => {
    if (isNew || !selectedId || !isDirty || saving) return;
    clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      handleSave();
    }, 2000);
    return () => clearTimeout(autosaveRef.current);
  }, [isNew, selectedId, isDirty, saving, handleSave]);

  // ── delete ─────────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async () => {
    if (!selectedId || isNew) return;
    setSaving(true);
    setError('');
    setDeleteConfirmOpen(false);
    try {
      await deleteQuestionnaire(selectedId);
      await loadList();
      resetNewDraft();
    } catch (e) {
      setError(e.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  }, [selectedId, isNew, loadList, resetNewDraft]);

  // ── duplicate ──────────────────────────────────────────────────────────────

  const handleDuplicate = useCallback(async (id) => {
    try {
      const q = await getQuestionnaire(id);
      const payload = {
        name: `${q.name} (copy)`,
        description: q.description || '',
        questions: (q.questions || []).map((row, i) => ({
          sortOrder: i,
          type: row.type,
          prompt: row.prompt,
          options: row.options || [],
          required: row.required !== false,
        })),
      };
      const created = await createQuestionnaire(payload);
      await loadList();
      loadDetail(created.id);
    } catch (e) {
      setError(e.message || 'Duplicate failed');
    }
  }, [loadList, loadDetail]);

  // ── question mutations ─────────────────────────────────────────────────────

  const addQuestion = useCallback(() => {
    setQuestions((prev) => [...prev, emptyQuestion()]);
    markDirty();
  }, [markDirty]);

  const removeQuestion = useCallback((idx) => {
    setQuestions((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx));
    markDirty();
  }, [markDirty]);

  const moveQuestion = useCallback((idx, dir) => {
    setQuestions((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    markDirty();
  }, [markDirty]);

  const patchQuestion = useCallback((idx, patch) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
    markDirty();
  }, [markDirty]);

  // option chip helpers
  const addOption = useCallback((idx) => {
    setQuestions((prev) => prev.map((q, i) => {
      if (i !== idx) return q;
      const val = (q.optionInput || '').trim();
      if (!val || q.options.includes(val)) return { ...q, optionInput: '' };
      return { ...q, options: [...q.options, val], optionInput: '' };
    }));
    markDirty();
  }, [markDirty]);

  const removeOption = useCallback((qIdx, optIdx) => {
    setQuestions((prev) => prev.map((q, i) => {
      if (i !== qIdx) return q;
      return { ...q, options: q.options.filter((_, oi) => oi !== optIdx) };
    }));
    markDirty();
  }, [markDirty]);

  // ── drag-and-drop ──────────────────────────────────────────────────────────

  const handleDragStart = useCallback((idx) => {
    setDragIndex(idx);
  }, []);

  const handleDragOver = useCallback((e, idx) => {
    e.preventDefault();
    setDragOverIndex(idx);
  }, []);

  const handleDrop = useCallback((idx) => {
    setQuestions((prev) => {
      if (dragIndex === null || dragIndex === idx) return prev;
      const next = [...prev];
      const [removed] = next.splice(dragIndex, 1);
      next.splice(idx, 0, removed);
      return next;
    });
    setDragIndex(null);
    setDragOverIndex(null);
    markDirty();
  }, [dragIndex, markDirty]);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  // ── name/desc change with dirty tracking ───────────────────────────────────

  const handleNameChange = (v) => {
    setName(v);
    checkDirty(v, description, questions);
  };
  const handleDescChange = (v) => {
    setDescription(v);
    checkDirty(name, v, questions);
  };

  // ── sidebar filter ─────────────────────────────────────────────────────────

  const filteredSummaries = sidebarSearch.trim()
    ? summaries.filter((s) => s.name.toLowerCase().includes(sidebarSearch.toLowerCase()))
    : summaries;

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">

      {/* ── Left sidebar ──────────────────────────────────────────────────── */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200/80 bg-slate-50/80 dark:border-gray-800 dark:bg-gray-950/50 xl:w-72">
        {/* Sidebar header */}
        <div className="border-b border-slate-200/70 px-4 py-4 dark:border-gray-800">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <span className="text-sm font-semibold text-slate-900 dark:text-white">Questionnaires</span>
            {!listLoading && (
              <span className="ml-auto rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-gray-800 dark:text-gray-400">
                {summaries.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => resetNewDraft()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New questionnaire
          </button>
          {summaries.length >= 4 && (
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
              <input
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder="Search…"
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-xs text-slate-700 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              />
            </div>
          )}
        </div>

        {/* Sidebar list */}
        <div className="custom-scrollbar flex-1 overflow-y-auto p-2">
          {listLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : filteredSummaries.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <ClipboardList className="h-8 w-8 text-slate-300 dark:text-gray-700" />
              <p className="text-xs text-slate-500 dark:text-gray-500">
                {sidebarSearch ? 'No match' : 'No questionnaires yet.\nCreate one to get started.'}
              </p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {filteredSummaries.map((s) => {
                const active = s.id === selectedId && !isNew;
                return (
                  <li key={s.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => loadDetail(s.id)}
                      className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${
                        active
                          ? 'bg-brand-500/12 font-semibold text-brand-800 dark:bg-brand-500/15 dark:text-brand-200'
                          : 'text-slate-700 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-800/60'
                      }`}
                    >
                      <span className="line-clamp-2 text-sm leading-snug">{s.name}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-normal text-slate-500 dark:text-gray-500">
                        <span>{s.questionCount ?? 0} questions</span>
                        {s.updatedAt && (
                          <>
                            <span>·</span>
                            <span>{relativeTime(s.updatedAt)}</span>
                          </>
                        )}
                      </span>
                    </button>
                    {/* Duplicate button on hover */}
                    <button
                      type="button"
                      title="Duplicate"
                      onClick={(e) => { e.stopPropagation(); handleDuplicate(s.id); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* ── Main editor area ───────────────────────────────────────────────── */}
      <div className="custom-scrollbar flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-white p-6 dark:bg-gray-900 lg:p-8">

        {/* Editor header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-2 py-1 text-xl font-bold text-slate-900 outline-none hover:border-slate-200 focus:border-brand-400 focus:bg-slate-50/80 dark:text-white dark:hover:border-gray-700 dark:focus:bg-gray-800/40"
                placeholder="Questionnaire name"
              />
              {isDirty && !saving && (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  Unsaved
                </span>
              )}
              {saving && (
                <span className="flex shrink-0 items-center gap-1 text-xs text-slate-500 dark:text-gray-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </span>
              )}
              {saveOk && !isDirty && !saving && (
                <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Saved
                </span>
              )}
            </div>
            <input
              value={description}
              onChange={(e) => handleDescChange(e.target.value)}
              className="mt-1 w-full rounded-xl border border-transparent bg-transparent px-2 py-1 text-sm text-slate-500 outline-none hover:border-slate-200 focus:border-brand-400 focus:bg-slate-50/80 dark:text-gray-400 dark:hover:border-gray-700 dark:focus:bg-gray-800/40"
              placeholder="Description (optional) — when to use this script…"
            />
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPreviewOpen((p) => !p)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {previewOpen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {previewOpen ? 'Hide preview' : 'Preview'}
            </button>
            {!isNew && selectedId && (
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-gray-900 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || detailLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </button>
          </div>
        </div>

        {/* Error / success banners */}
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            <span className="shrink-0 font-semibold">Error:</span> {error}
          </div>
        )}

        {/* Loading */}
        {detailLoading ? (
          <div className="flex flex-1 items-center justify-center gap-2 py-16 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading questionnaire…
          </div>
        ) : (
          <>
            {/* Preview panel */}
            {previewOpen && (
              <div className="mb-6 rounded-2xl border border-brand-200/60 bg-brand-50/50 p-4 dark:border-brand-800/40 dark:bg-brand-950/20">
                <div className="mb-3 flex items-center gap-2">
                  <Mic className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">
                    Voice call preview — how the agent will use these prompts
                  </p>
                </div>
                {questions.filter((q) => q.prompt.trim()).length === 0 ? (
                  <p className="text-xs italic text-slate-500 dark:text-gray-500">Add questions below to see the preview.</p>
                ) : (
                  <ol className="space-y-2">
                    {questions.map((q, i) =>
                      q.prompt.trim() ? (
                        <li key={q.clientKey} className="flex gap-3">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-[10px] font-bold text-brand-700 dark:text-brand-300">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 dark:text-gray-200 leading-snug">{q.prompt}</p>
                            {q.options.length > 0 && (
                              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-gray-500">
                                Options: {q.options.join(' · ')}
                              </p>
                            )}
                            <span className="text-[10px] text-slate-400 dark:text-gray-600 capitalize">
                              {QUESTION_TYPES.find((t) => t.value === q.type)?.label}
                              {!q.required && ' · optional'}
                            </span>
                          </div>
                        </li>
                      ) : null
                    )}
                  </ol>
                )}
              </div>
            )}

            {/* Starter templates — shown only for new blank questionnaire */}
            {isNew && questions.length === 1 && !questions[0].prompt && (
              <div className="mb-8 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-5 dark:border-gray-800 dark:bg-gray-900/40">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-gray-400">
                    Start from a template
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {STARTER_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => resetNewDraft(t.id)}
                      className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-brand-400/60 hover:shadow-sm transition-all dark:border-gray-700 dark:bg-gray-900 dark:hover:border-brand-600/50"
                    >
                      <span className="text-xl">{t.icon}</span>
                      <p className="mt-1.5 text-xs font-semibold text-slate-800 dark:text-gray-200 leading-snug">{t.name}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-gray-500 leading-snug">{t.description}</p>
                      <p className="mt-1.5 text-[10px] text-brand-600 dark:text-brand-400 font-medium">
                        {t.questions.length} questions →
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Questions */}
            <div>
              <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Questions
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-normal text-slate-600 dark:bg-gray-800 dark:text-gray-400">
                    {questions.length}
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={addQuestion}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add question
                </button>
              </div>

              <ul className="space-y-3">
                {questions.map((q, idx) => {
                  const isBeingDragged = dragIndex === idx;
                  const isDropTarget   = dragOverIndex === idx && dragIndex !== idx;
                  return (
                    <li
                      key={q.clientKey}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDrop={() => handleDrop(idx)}
                      onDragEnd={handleDragEnd}
                      className={`rounded-2xl border p-4 transition-all ${
                        isBeingDragged
                          ? 'opacity-40 border-brand-400 bg-brand-50/50 dark:bg-brand-950/20'
                          : isDropTarget
                          ? 'border-brand-400 bg-brand-50/30 shadow-md dark:border-brand-500 dark:bg-brand-950/10'
                          : 'border-slate-200/90 bg-slate-50/80 dark:border-gray-700/80 dark:bg-gray-900/40'
                      }`}
                    >
                      {/* Question header row */}
                      <div className="mb-3 flex items-center gap-2">
                        {/* Drag handle */}
                        <button
                          type="button"
                          aria-label="Drag to reorder"
                          className="cursor-grab touch-none rounded p-0.5 text-slate-400 hover:text-slate-600 active:cursor-grabbing dark:text-gray-600 dark:hover:text-gray-400"
                        >
                          <GripVertical className="h-4 w-4" />
                        </button>

                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 dark:bg-gray-700 dark:text-gray-300">
                          {idx + 1}
                        </span>

                        {/* Up / Down fallback for keyboard */}
                        <div className="flex items-center gap-0.5">
                          <button type="button" aria-label="Move up" onClick={() => moveQuestion(idx, -1)} disabled={idx === 0}
                            className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-25 dark:text-gray-600 dark:hover:text-gray-300">
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" aria-label="Move down" onClick={() => moveQuestion(idx, 1)} disabled={idx === questions.length - 1}
                            className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-25 dark:text-gray-600 dark:hover:text-gray-300">
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="ml-auto flex items-center gap-1">
                          {/* Required toggle */}
                          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-500 dark:text-gray-500 select-none">
                            <input
                              type="checkbox"
                              checked={q.required}
                              onChange={(e) => patchQuestion(idx, { required: e.target.checked })}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 accent-brand-600"
                            />
                            Required
                          </label>
                          <button type="button" aria-label="Remove" onClick={() => removeQuestion(idx)} disabled={questions.length <= 1}
                            className="ml-1 rounded-lg p-1.5 text-red-400 hover:bg-red-50 disabled:opacity-25 dark:hover:bg-red-950/40">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Prompt */}
                      <textarea
                        value={q.prompt}
                        onChange={(e) => patchQuestion(idx, { prompt: e.target.value })}
                        rows={2}
                        placeholder="What should the agent ask? (e.g. 'Are you looking to buy or invest?')"
                        className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-400 focus:ring-1 focus:ring-brand-400/25 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:placeholder:text-gray-600"
                      />

                      {/* Type selector chips */}
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-slate-500 dark:text-gray-500">Type:</span>
                        {QUESTION_TYPES.map((t) => (
                          <TypeChip
                            key={t.value}
                            value={t.value}
                            selected={q.type === t.value}
                            onClick={() => patchQuestion(idx, { type: t.value, options: t.value === 'text' ? [] : q.options })}
                          />
                        ))}
                      </div>

                      {/* Options (choice questions) */}
                      {(q.type === 'single_choice' || q.type === 'multi_choice') && (
                        <div className="mt-3">
                          <p className="mb-2 text-[11px] font-medium text-slate-500 dark:text-gray-500">
                            Answer choices
                          </p>
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {q.options.map((opt, oi) => (
                              <OptionChip
                                key={oi}
                                label={opt}
                                onRemove={() => removeOption(idx, oi)}
                              />
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <input
                              value={q.optionInput || ''}
                              onChange={(e) => patchQuestion(idx, { optionInput: e.target.value })}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(idx); } }}
                              placeholder="Type an option, press Enter"
                              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200"
                            />
                            <button
                              type="button"
                              onClick={() => addOption(idx)}
                              disabled={!(q.optionInput || '').trim()}
                              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-40 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                            >
                              Add
                            </button>
                          </div>
                          {q.options.length === 0 && (
                            <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                              Add at least one choice option
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* Add question CTA at bottom */}
              <button
                type="button"
                onClick={addQuestion}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 py-3 text-xs font-medium text-slate-500 hover:border-brand-400 hover:text-brand-600 dark:border-gray-700 dark:text-gray-500 dark:hover:border-brand-600 dark:hover:text-brand-400 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add another question
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Delete confirm modal ───────────────────────────────────────────── */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteConfirmOpen(false)} />
          <div role="dialog" aria-modal="true" className="surface-card relative z-10 w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Delete questionnaire?</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-gray-400">
              <span className="font-medium text-slate-900 dark:text-white">"{name}"</span> will be permanently deleted.
              Campaigns using this script will revert to the default conversation flow.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" autoFocus onClick={() => setDeleteConfirmOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-slate-50 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                Cancel
              </button>
              <button type="button" onClick={handleDelete} disabled={saving}
                className="px-4 py-2 rounded-xl bg-red-600 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50">
                {saving ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
