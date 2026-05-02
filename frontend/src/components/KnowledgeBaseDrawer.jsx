import { useEffect, useMemo, useRef, useState } from 'react';
import KnowledgeBaseProjectForm from './KnowledgeBaseProjectForm';
import {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  getCompanyInfo,
  updateCompanyInfo,
} from '../services/kbApi';

export default function KnowledgeBaseDrawer({ isOpen, onClose }) {
  const [projects, setProjects] = useState([]);
  const [companyInfo, setCompanyInfo] = useState({});
  const [companyDraft, setCompanyDraft] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [activePane, setActivePane] = useState('projects');
  const [denseList, setDenseList] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [toasts, setToasts] = useState([]);
  const importRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const toastIdRef = useRef(1);

  const selectedProject = useMemo(() => projects.find((p) => p.id === selectedId) || null, [projects, selectedId]);
  const rowHeight = denseList ? 54 : 78;
  const visibleCount = 12;
  const overscan = 6;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(projects.length, startIndex + visibleCount + overscan * 2);
  const visibleProjects = projects.slice(startIndex, endIndex);
  const typeOptions = useMemo(() => {
    const fromProjects = projects.map((p) => p.type).filter(Boolean);
    const fromCompany = Array.isArray(companyInfo.projectTypes) ? companyInfo.projectTypes : [];
    return [...new Set([...fromCompany, ...fromProjects])];
  }, [projects, companyInfo]);
  const locationOptions = useMemo(() => {
    const fromProjects = projects.map((p) => p.location).filter(Boolean);
    const fromCompany = Array.isArray(companyInfo.areas) ? companyInfo.areas : [];
    return [...new Set([...fromCompany, ...fromProjects])];
  }, [projects, companyInfo]);

  const load = async (query = '') => {
    setLoading(true);
    setError('');
    try {
      const [{ projects: items }, { companyInfo: info }] = await Promise.all([listProjects(query), getCompanyInfo()]);
      setProjects(items || []);
      setCompanyInfo(info || {});
      setCompanyDraft(JSON.stringify(info || {}, null, 2));
      if (!selectedId && items?.[0]?.id) setSelectedId(items[0].id);
    } catch (err) {
      setError(err.message);
      pushToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      const targetTag = event.target?.tagName?.toLowerCase();
      const isTyping = targetTag === 'input' || targetTag === 'textarea';
      if (event.key === '/' && !isTyping) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (activePane === 'company') {
          saveCompany();
          return;
        }
        const form = document.getElementById('kb-project-form');
        form?.requestSubmit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, activePane, companyDraft, selectedProject, creating]);

  if (!isOpen) return null;

  const saveCompany = async () => {
    try {
      setError('');
      const parsed = JSON.parse(companyDraft || '{}');
      const { companyInfo: next } = await updateCompanyInfo(parsed);
      setCompanyInfo(next || {});
      pushToast('Company info saved', 'success');
    } catch (err) {
      setError(err.message);
      pushToast(err.message, 'error');
    }
  };

  const submitProject = async (project) => {
    try {
      setError('');
      if (creating) {
        const { project: created } = await createProject(project);
        setProjects((prev) => [...prev, created]);
        setSelectedId(created.id);
        setCreating(false);
        pushToast('Project created', 'success');
      } else if (selectedProject) {
        const { project: updated } = await updateProject(selectedProject.id, project);
        setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        pushToast('Project saved', 'success');
      }
    } catch (err) {
      setError(err.message);
      pushToast(err.message, 'error');
    }
  };

  const removeProject = async () => {
    if (!selectedProject) return;
    try {
      setError('');
      await deleteProject(selectedProject.id);
      const next = projects.filter((p) => p.id !== selectedProject.id);
      setProjects(next);
      setSelectedId(next[0]?.id || null);
      setCreating(false);
      pushToast('Project deleted', 'success');
    } catch (err) {
      setError(err.message);
      pushToast(err.message, 'error');
    }
  };

  const exportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      companyInfo,
      projects,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voice-agent-knowledge-base.json';
    a.click();
    URL.revokeObjectURL(url);
    pushToast('Knowledge base exported', 'success');
  };

  const importJson = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setError('');
      const text = await file.text();
      const parsed = JSON.parse(text);
      const importedProjects = Array.isArray(parsed.projects) ? parsed.projects : [];
      const importedCompanyInfo = parsed.companyInfo && typeof parsed.companyInfo === 'object' ? parsed.companyInfo : null;
      const existingIds = new Set(projects.map((p) => p.id));
      const validProjects = importedProjects.filter((p) => p && p.id);
      const newCount = validProjects.filter((p) => !existingIds.has(p.id)).length;
      const updateCount = validProjects.filter((p) => existingIds.has(p.id)).length;
      const skippedCount = importedProjects.length - validProjects.length;
      const projectDetails = validProjects.map((p) => ({
        id: p.id,
        name: p.name || p.id,
        action: existingIds.has(p.id) ? 'update' : 'new',
      }));
      setImportPreview({
        importedProjects: validProjects,
        importedCompanyInfo,
        fileName: file.name,
        newCount,
        updateCount,
        skippedCount,
        projectDetails,
      });
    } catch (err) {
      setError(`Import failed: ${err.message}`);
      pushToast(`Import failed: ${err.message}`, 'error');
    } finally {
      event.target.value = '';
    }
  };

  const applyImport = async () => {
    if (!importPreview) return;
    try {
      setError('');
      const { importedProjects, importedCompanyInfo } = importPreview;
      for (const project of importedProjects) {
        const exists = projects.some((p) => p.id === project.id);
        if (exists) {
          await updateProject(project.id, project);
        } else {
          await createProject(project);
        }
      }
      if (importedCompanyInfo) {
        await updateCompanyInfo(importedCompanyInfo);
      }
      setImportPreview(null);
      await load(search);
      pushToast('Import applied successfully', 'success');
    } catch (err) {
      setError(`Import apply failed: ${err.message}`);
      pushToast(`Import apply failed: ${err.message}`, 'error');
    }
  };

  const pushToast = (message, tone = 'info') => {
    const id = toastIdRef.current++;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full h-full bg-gray-900 border-l border-gray-700/50 shadow-2xl overflow-hidden flex flex-col lg:flex-row">
        <aside className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-gray-800 overflow-y-auto max-h-[42vh] lg:max-h-none">
          <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-800 p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white text-sm font-semibold">Knowledge Base</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-white text-base min-h-10 min-w-10">x</button>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
              <span>{projects.length} projects</span>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={denseList} onChange={(e) => setDenseList(e.target.checked)} />
                Dense
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={exportJson} className="text-[11px] px-2 py-1.5 min-h-9 rounded ui-muted">Export JSON</button>
              <button onClick={() => importRef.current?.click()} className="text-[11px] px-2 py-1.5 min-h-9 rounded ui-muted">Import JSON</button>
              <input ref={importRef} type="file" accept="application/json" className="hidden" onChange={importJson} />
            </div>
            <div className="mt-4 space-y-2">
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects by name, type, location..."
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
              />
              <div className="flex gap-2">
                <button onClick={() => load(search)} className="text-xs px-2 py-1.5 min-h-9 rounded ui-muted">Search</button>
                <button onClick={() => { setSearch(''); load(''); }} className="text-xs px-2 py-1.5 min-h-9 rounded ui-muted">Reset</button>
                <button onClick={() => { setCreating(true); setSelectedId(null); setActivePane('projects'); }} className="text-xs px-2 py-1.5 min-h-9 rounded ui-primary">+ New project</button>
              </div>
            </div>
          </div>
          <div
            ref={listRef}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            className="p-3 sm:p-4 overflow-y-auto h-56 sm:h-64 lg:h-auto"
          >
            <div style={{ height: startIndex * rowHeight }} />
            <div className="space-y-2">
            {visibleProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => { setSelectedId(p.id); setCreating(false); setActivePane('projects'); }}
                className={`w-full text-left rounded text-xs border transition ${
                  denseList ? 'px-2 py-1.5' : 'px-2.5 py-2.5'
                } ${selectedId === p.id && !creating ? 'bg-slate-700/50 border-slate-500 text-slate-100' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium truncate">{p.name}</div>
                  {p.type && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">
                      {p.type}
                    </span>
                  )}
                </div>
                {!denseList && <div className="text-gray-500 mt-0.5">{p.location}</div>}
              </button>
            ))}
            </div>
            <div style={{ height: Math.max(0, (projects.length - endIndex) * rowHeight) }} />
          </div>
        </aside>

        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
          {error && <div className="mb-3 text-xs text-red-300 bg-red-950/40 border border-red-800 rounded px-3 py-2">{error}</div>}
          {loading && <div className="mb-3 text-xs text-blue-300">Loading knowledge base...</div>}

          <div className="flex items-center gap-2 mb-4 sm:mb-5">
            <button
              onClick={() => setActivePane('projects')}
              className={`text-xs px-3 py-2 sm:py-1.5 min-h-10 sm:min-h-0 rounded border ${activePane === 'projects' ? 'bg-slate-700/50 border-slate-500 text-slate-100' : 'bg-gray-800 border-gray-700 text-gray-300'}`}
            >
              Projects
            </button>
            <button
              onClick={() => setActivePane('company')}
              className={`text-xs px-3 py-2 sm:py-1.5 min-h-10 sm:min-h-0 rounded border ${activePane === 'company' ? 'bg-slate-700/50 border-slate-500 text-slate-100' : 'bg-gray-800 border-gray-700 text-gray-300'}`}
            >
              Company Info
            </button>
          </div>

          {activePane === 'company' && (
            <section className="border border-gray-800 rounded-xl p-5 mb-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm text-white font-semibold">Company Info</h3>
                <button onClick={saveCompany} className="text-xs px-2 py-1 rounded ui-primary">Save company info</button>
              </div>
              <textarea
                value={companyDraft}
                onChange={(e) => setCompanyDraft(e.target.value)}
                rows={16}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white font-mono"
              />
            </section>
          )}

          {activePane === 'projects' && (
          <section className="border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-white font-semibold">{creating ? 'Create Project' : 'Edit Project'}</h3>
              {!creating && selectedProject && (
                <button onClick={removeProject} className="text-xs px-2 py-1 rounded ui-muted">Delete</button>
              )}
            </div>
            {creating || selectedProject ? (
              <KnowledgeBaseProjectForm
                initialProject={creating ? null : selectedProject}
                submitLabel={creating ? 'Create project' : 'Save project'}
                onCancel={() => setCreating(false)}
                onSubmit={submitProject}
                typeOptions={typeOptions}
                locationOptions={locationOptions}
                formId="kb-project-form"
              />
            ) : (
              <p className="text-xs text-gray-500">Select a project from the list or create a new one.</p>
            )}
          </section>
          )}
        </main>
      </div>
      {importPreview && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white">Import Preview</h3>
            <p className="text-xs text-gray-400 mt-1">{importPreview.fileName}</p>
            <div className="mt-3 space-y-1 text-xs text-gray-300">
              <p>New projects: {importPreview.newCount}</p>
              <p>Updated projects: {importPreview.updateCount}</p>
              <p>Skipped entries (missing id): {importPreview.skippedCount}</p>
              <p>Company info update: {importPreview.importedCompanyInfo ? 'Yes' : 'No'}</p>
            </div>
            {importPreview.projectDetails?.length > 0 && (
              <div className="mt-3 border border-gray-700 rounded-md max-h-44 overflow-auto">
                <div className="px-2 py-1 text-[11px] text-gray-400 border-b border-gray-700">
                  Dry-run project actions
                </div>
                <div className="divide-y divide-gray-800">
                  {importPreview.projectDetails.map((item) => (
                    <div key={item.id} className="px-2 py-1.5 flex items-center justify-between text-[11px]">
                      <span className="text-gray-300 truncate pr-2">{item.name}</span>
                      <span className={`px-1.5 py-0.5 rounded ${
                        item.action === 'new'
                          ? 'bg-slate-700/50 text-slate-200'
                          : 'bg-slate-700/50 text-slate-300'
                      }`}>
                        {item.action}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setImportPreview(null)}
                className="px-3 py-1.5 text-xs rounded ui-muted"
              >
                Cancel
              </button>
              <button
                onClick={applyImport}
                className="px-3 py-1.5 text-xs rounded ui-primary"
              >
                Apply Import
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="absolute top-4 right-4 z-[60] space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`text-xs px-3 py-2 rounded border shadow ${
              toast.tone === 'success'
                ? 'bg-emerald-950/90 text-emerald-200 border-emerald-700'
                : toast.tone === 'error'
                ? 'bg-red-950/90 text-red-200 border-red-700'
                : 'bg-gray-900/90 text-gray-200 border-gray-700'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
