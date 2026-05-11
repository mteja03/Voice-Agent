import { useCallback, useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import {
  listQuestionnaires,
  getQuestionnaire,
  createQuestionnaire,
  updateQuestionnaire,
  deleteQuestionnaire,
} from '../services/questionnairesApi';

const QUESTION_TYPES = [
  { value: 'text', label: 'Open text' },
  { value: 'single_choice', label: 'Single choice' },
  { value: 'multi_choice', label: 'Multiple choice' },
];

function optionsToText(options) {
  if (!Array.isArray(options) || !options.length) return '';
  return options.join('\n');
}

function textToOptions(text) {
  return String(text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function emptyQuestion(sortIndex) {
  return {
    clientKey: `new-${sortIndex}-${Date.now()}`,
    type: 'text',
    prompt: '',
    optionsText: '',
    required: true,
  };
}

export default function QuestionnaireBuilder({ activeCompanyId }) {
  const [summaries, setSummaries] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [isNew, setIsNew] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState([emptyQuestion(0)]);

  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveOk, setSaveOk] = useState(false);

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

  useEffect(() => {
    loadList();
  }, [loadList, activeCompanyId]);

  useEffect(() => {
    setSelectedId(null);
    setIsNew(true);
    setName('Untitled questionnaire');
    setDescription('');
    setQuestions([emptyQuestion(0)]);
    setError('');
    setSaveOk(false);
  }, [activeCompanyId]);

  const resetNewDraft = () => {
    setSelectedId(null);
    setIsNew(true);
    setName('Untitled questionnaire');
    setDescription('');
    setQuestions([emptyQuestion(0)]);
    setSaveOk(false);
  };

  const loadDetail = async (id) => {
    setDetailLoading(true);
    setError('');
    setSaveOk(false);
    try {
      const q = await getQuestionnaire(id);
      setSelectedId(id);
      setIsNew(false);
      setName(q.name || '');
      setDescription(q.description || '');
      const qs = Array.isArray(q.questions) ? q.questions : [];
      setQuestions(
        qs.length
          ? qs.map((row, i) => ({
              clientKey: row.id || `q-${i}`,
              type: row.type || 'text',
              prompt: row.prompt || '',
              optionsText: optionsToText(row.options),
              required: row.required !== false,
            }))
          : [emptyQuestion(0)]
      );
    } catch (e) {
      setError(e.message || 'Failed to open questionnaire');
    } finally {
      setDetailLoading(false);
    }
  };

  const addQuestion = () => {
    setQuestions((prev) => [...prev, emptyQuestion(prev.length)]);
  };

  const removeQuestion = (idx) => {
    setQuestions((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const moveQuestion = (idx, dir) => {
    setQuestions((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const patchQuestion = (idx, patch) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const buildPayload = () => {
    const trimmedName = name.trim();
    const qs = questions.map((q, i) => ({
      sortOrder: i,
      type: q.type,
      prompt: q.prompt.trim() || `Question ${i + 1}`,
      options: q.type === 'text' ? [] : textToOptions(q.optionsText),
      required: q.required,
    }));
    return {
      name: trimmedName || 'Untitled questionnaire',
      description: description.trim(),
      questions: qs,
    };
  };

  const handleSave = async () => {
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
        setSaveOk(true);
      } else {
        await updateQuestionnaire(selectedId, payload);
        await loadList();
        setSaveOk(true);
      }
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || isNew) return;
    if (!window.confirm('Delete this questionnaire? This cannot be undone.')) return;
    setSaving(true);
    setError('');
    try {
      await deleteQuestionnaire(selectedId);
      resetNewDraft();
      await loadList();
    } catch (e) {
      setError(e.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-6 lg:flex-row lg:gap-6 lg:p-8">
      <aside className="surface-card flex w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 dark:border-gray-700/80 lg:w-72">
        <div className="border-b border-slate-200/70 px-4 py-3 dark:border-gray-700/80">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white">
            <ClipboardList className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden />
            <span className="text-sm font-semibold">Questionnaires</span>
          </div>
          <button
            type="button"
            onClick={resetNewDraft}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-500"
          >
            <Plus className="h-4 w-4" />
            New
          </button>
        </div>
        <div className="custom-scrollbar max-h-48 overflow-y-auto lg:max-h-none lg:flex-1">
          {listLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : summaries.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-500 dark:text-gray-500">
              No questionnaires yet. Create one for discovery calls or surveys.
            </p>
          ) : (
            <ul className="p-2">
              {summaries.map((s) => {
                const active = s.id === selectedId && !isNew;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => loadDetail(s.id)}
                      className={`mb-1 w-full rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                        active
                          ? 'bg-brand-500/15 font-semibold text-brand-800 dark:bg-brand-500/20 dark:text-brand-200'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      <span className="line-clamp-2">{s.name}</span>
                      <span className="mt-0.5 block text-[11px] font-normal text-slate-500 dark:text-gray-500">
                        {s.questionCount ?? 0} questions
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
        <div className="surface-card rounded-2xl border border-slate-200/80 p-6 shadow-sm dark:border-gray-700/80">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {isNew ? 'New questionnaire' : 'Edit questionnaire'}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-gray-400">
                Build scripts for your team: open-ended prompts or choice questions. You can attach these to campaigns or
                the dialer in a later step.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!isNew && selectedId && (
                <button
                  type="button"
                  onClick={handleDelete}
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
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}
          {saveOk && !error && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
              Saved.
            </div>
          )}

          {detailLoading ? (
            <div className="flex items-center gap-2 py-12 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-slate-700 dark:text-gray-300">Name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-950"
                    placeholder="e.g. Pre-qualification"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                  <span className="font-medium text-slate-700 dark:text-gray-300">Description (optional)</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-950"
                    placeholder="When to use this script…"
                  />
                </label>
              </div>

              <div className="mt-8 border-t border-slate-200/80 pt-6 dark:border-gray-700/80">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Questions</h3>
                  <button
                    type="button"
                    onClick={addQuestion}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add question
                  </button>
                </div>

                <ul className="space-y-4">
                  {questions.map((q, idx) => (
                    <li
                      key={q.clientKey}
                      className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 dark:border-gray-700/80 dark:bg-gray-900/40"
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-500">
                          Q{idx + 1}
                        </span>
                        <div className="ml-auto flex items-center gap-1">
                          <button
                            type="button"
                            aria-label="Move up"
                            onClick={() => moveQuestion(idx, -1)}
                            disabled={idx === 0}
                            className="rounded-lg p-1.5 text-slate-600 hover:bg-white disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Move down"
                            onClick={() => moveQuestion(idx, 1)}
                            disabled={idx === questions.length - 1}
                            className="rounded-lg p-1.5 text-slate-600 hover:bg-white disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Remove question"
                            onClick={() => removeQuestion(idx)}
                            disabled={questions.length <= 1}
                            className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-30 dark:text-red-400 dark:hover:bg-red-950/40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                          <span className="text-slate-600 dark:text-gray-400">Prompt</span>
                          <textarea
                            value={q.prompt}
                            onChange={(e) => patchQuestion(idx, { prompt: e.target.value })}
                            rows={2}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-950"
                            placeholder="What should the agent ask?"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5 text-sm">
                          <span className="text-slate-600 dark:text-gray-400">Type</span>
                          <select
                            value={q.type}
                            onChange={(e) => patchQuestion(idx, { type: e.target.value })}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-950"
                          >
                            {QUESTION_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex items-center gap-2 text-sm sm:col-span-2">
                          <input
                            type="checkbox"
                            checked={q.required}
                            onChange={(e) => patchQuestion(idx, { required: e.target.checked })}
                            className="rounded border-slate-300 text-brand-600"
                          />
                          <span className="text-slate-700 dark:text-gray-300">Required</span>
                        </label>
                        {(q.type === 'single_choice' || q.type === 'multi_choice') && (
                          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                            <span className="text-slate-600 dark:text-gray-400">
                              Choices (one per line)
                            </span>
                            <textarea
                              value={q.optionsText}
                              onChange={(e) => patchQuestion(idx, { optionsText: e.target.value })}
                              rows={4}
                              className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-gray-600 dark:bg-gray-950"
                              placeholder={'Yes\nNo\nMaybe later'}
                            />
                          </label>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
