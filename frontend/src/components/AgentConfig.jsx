import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Settings,
  BookOpen,
  MessageSquare,
  Save,
  CheckCircle2,
  AlertCircle,
  Plus,
  Building,
  FileText,
  Loader2,
  Copy,
  Check,
  Trash2,
} from 'lucide-react';
import { listProjects, createProject, updateProject, deleteProject, getCompanyInfo, updateCompanyInfo } from '../services/kbApi';
import KnowledgeBaseProjectForm from './KnowledgeBaseProjectForm';
import { CONVERSATION_PLACEHOLDER_GROUPS } from '../constants/conversationPlaceholders';

const VOICES = ['aditya', 'ritu', 'ashutosh', 'priya', 'neha', 'rahul', 'pooja', 'rohan', 'simran', 'kavya', 'amit', 'dev', 'ishita', 'shreya', 'ratan', 'varun', 'manan', 'sumit', 'roopa', 'kabir', 'aayan', 'shubh', 'advait', 'anand', 'tanya', 'tarun', 'sunny', 'mani', 'gokul', 'vijay', 'shruti', 'suhani', 'mohit', 'kavitha', 'rehan', 'soham', 'rupali', 'niharika'];

const EMPTY_COMPANY_FORM = {
  name: '',
  tagline: '',
  phone: '',
  email: '',
  website: '',
  headOffice: '',
  areas: '',
  projectTypes: '',
  socialFacebook: '',
};

const inputClass =
  'w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand-500 dark:bg-gray-950 dark:border-gray-800 dark:text-white dark:placeholder:text-gray-500';

export default function AgentConfig({
  settings,
  onSettingsChange,
  settingsSaveUi = { status: 'idle', errorMessage: '' },
  agentConfigLoadError = '',
}) {
  const [activeTab, setActiveTab] = useState('general');
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(1);
  const prevSaveStatusRef = useRef('idle');

  // --- Knowledge Base State ---
  const [projects, setProjects] = useState([]);
  const [companyInfo, setCompanyInfo] = useState({});
  const [companyForm, setCompanyForm] = useState(EMPTY_COMPANY_FORM);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbError, setKbError] = useState('');
  const [kbPane, setKbPane] = useState('company'); // 'company' or 'projects'
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const selectedProject = useMemo(() => projects.find((p) => p.id === selectedId) || null, [projects, selectedId]);

  const loadKb = useCallback(async () => {
    setKbLoading(true);
    try {
      const [{ projects: items }, { companyInfo: info }] = await Promise.all([listProjects(), getCompanyInfo()]);
      setProjects(items || []);
      setCompanyInfo(info || {});
    } catch (err) {
      setKbError(err.message);
    } finally {
      setKbLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'knowledge-base' && projects.length === 0) {
      loadKb();
    }
  }, [activeTab, loadKb]);

  const companyProfileDirty = useMemo(() => {
    const i = companyInfo || {};
    const saved = {
      name: i.name != null ? String(i.name) : '',
      tagline: i.tagline != null ? String(i.tagline) : '',
      phone: i.phone != null ? String(i.phone) : '',
      email: i.email != null ? String(i.email) : '',
      website: i.website != null ? String(i.website) : '',
      headOffice: i.headOffice != null ? String(i.headOffice) : '',
      areas: Array.isArray(i.areas) ? i.areas.map((a) => String(a).trim()).filter(Boolean).join(', ') : '',
      projectTypes: Array.isArray(i.projectTypes)
        ? i.projectTypes.map((t) => String(t).trim()).filter(Boolean).join(', ')
        : '',
      socialFacebook: i.socialFacebook != null ? String(i.socialFacebook) : '',
    };
    return JSON.stringify(companyForm) !== JSON.stringify(saved);
  }, [companyForm, companyInfo]);

  useEffect(() => {
    const info = companyInfo || {};
    setCompanyForm({
      name: info.name != null ? String(info.name) : '',
      tagline: info.tagline != null ? String(info.tagline) : '',
      phone: info.phone != null ? String(info.phone) : '',
      email: info.email != null ? String(info.email) : '',
      website: info.website != null ? String(info.website) : '',
      headOffice: info.headOffice != null ? String(info.headOffice) : '',
      areas: Array.isArray(info.areas) ? info.areas.map((a) => String(a).trim()).filter(Boolean).join(', ') : '',
      projectTypes: Array.isArray(info.projectTypes)
        ? info.projectTypes.map((t) => String(t).trim()).filter(Boolean).join(', ')
        : '',
      socialFacebook: info.socialFacebook != null ? String(info.socialFacebook) : '',
    });
  }, [companyInfo]);

  const pushToast = (message, tone = 'success') => {
    const id = toastIdRef.current++;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  };

  useEffect(() => {
    const st = settingsSaveUi?.status || 'idle';
    if (st === 'error' && prevSaveStatusRef.current !== 'error' && settingsSaveUi?.errorMessage) {
      pushToast(settingsSaveUi.errorMessage, 'error');
    }
    prevSaveStatusRef.current = st;
  }, [settingsSaveUi?.status, settingsSaveUi?.errorMessage]);

  // --- Settings Handlers ---
  const handleUpdateSetting = (key, value) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  // --- Knowledge Base Handlers ---
  const saveCompany = async () => {
    try {
      setKbError('');
      const areas = companyForm.areas
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const projectTypes = companyForm.projectTypes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        ...companyInfo,
        name: companyForm.name.trim(),
        tagline: companyForm.tagline.trim(),
        phone: companyForm.phone.trim(),
        email: companyForm.email.trim(),
        website: companyForm.website.trim(),
        headOffice: companyForm.headOffice.trim(),
        areas,
        projectTypes,
        socialFacebook: companyForm.socialFacebook.trim(),
      };
      const { companyInfo: next } = await updateCompanyInfo(payload);
      setCompanyInfo(next || {});
      pushToast('Company info saved successfully');
    } catch (err) {
      setKbError(err.message || 'Failed to save company profile');
      pushToast('Failed to save company info', 'error');
    }
  };

  const submitProject = async (project) => {
    try {
      setKbError('');
      if (creating) {
        const { project: created } = await createProject(project);
        setProjects((prev) => [...prev, created]);
        setSelectedId(created.id);
        setCreating(false);
        pushToast('Project created');
      } else if (selectedProject) {
        const { project: updated } = await updateProject(selectedProject.id, project);
        setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        pushToast('Project saved');
      }
    } catch (err) {
      setKbError(err.message);
      pushToast(err.message, 'error');
    }
  };

  const handleDeleteProject = async (projectId, projectName) => {
    if (!window.confirm(`Delete project "${projectName}"? This cannot be undone.`)) return;
    try {
      setDeletingId(projectId);
      await deleteProject(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      if (selectedId === projectId) {
        setSelectedId(null);
        setCreating(false);
      }
      pushToast('Project deleted');
    } catch (err) {
      setKbError(err.message);
      pushToast('Failed to delete project', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent text-slate-800 dark:text-gray-200 relative">
      <header className="px-8 py-6 border-b border-white/10 dark:border-white/5 animate-slide-up" style={{ animationDelay: '300ms' }}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Agent Configuration</h1>
            <p className="text-sm text-slate-600 dark:text-gray-400 mt-1">
              Configure your AI agent&apos;s personality, knowledge, and conversation scripts.
            </p>
          </div>
          <WorkspaceSaveStatus settingsSaveUi={settingsSaveUi} />
        </div>
        {agentConfigLoadError ? (
          <div
            className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-50/95 text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100 px-3 py-2.5 text-xs"
            role="alert"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" aria-hidden />
            <span>Could not load saved settings from the server: {agentConfigLoadError}. Showing local defaults until the next successful load.</span>
          </div>
        ) : null}

        <div role="tablist" aria-label="Agent configuration sections" className="flex gap-6 mt-6 border-b border-slate-200 dark:border-gray-800">
          <TabButton id="general" label="General" icon={Settings} active={activeTab === 'general'} onClick={setActiveTab} />
          <TabButton id="knowledge-base" label="Knowledge Base" icon={BookOpen} active={activeTab === 'knowledge-base'} onClick={setActiveTab} />
          <TabButton id="conversation" label="Conversation" icon={MessageSquare} active={activeTab === 'conversation'} onClick={setActiveTab} />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        {activeTab === 'general' && (
          <div className="max-w-3xl space-y-8">
            <p className="text-xs text-slate-600 dark:text-gray-500 -mt-1 animate-slide-up" style={{ animationDelay: '350ms' }}>
              Voice, language, and schedule changes save automatically. Watch the sync status in the page header — if sync
              fails, your edits are still kept in this browser until the server accepts them.
            </p>
            <section className="surface-card rounded-2xl p-6 animate-slide-up" style={{ animationDelay: '400ms' }}>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Agent Personalization</h2>
              
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-gray-400 mb-2">Agent Name</label>
                  <input 
                    type="text" 
                    value={settings.agentName || 'Voice Agent'} 
                    onChange={(e) => handleUpdateSetting('agentName', e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-500 dark:bg-gray-950 dark:border-gray-800 dark:text-white"
                  />
                  <p className="text-xs text-slate-600 dark:text-gray-500 mt-1.5">This name will be used by the agent during introductions.</p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-gray-400 mb-2">Default Language</label>
                    <select 
                      value={settings.languageMode} 
                      onChange={(e) => handleUpdateSetting('languageMode', e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-500 dark:bg-gray-950 dark:border-gray-800 dark:text-white"
                    >
                      <option value="telugu">Telugu</option>
                      <option value="english">English</option>
                      <option value="hindi">Hindi</option>
                      <option value="auto">Auto-detect</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-gray-400 mb-2">Agent Voice</label>
                    <select 
                      value={settings.ttsVoice} 
                      onChange={(e) => handleUpdateSetting('ttsVoice', e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-500 dark:bg-gray-950 dark:border-gray-800 dark:text-white capitalize"
                    >
                      {VOICES.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </section>

            <section className="surface-card rounded-2xl p-6 animate-slide-up" style={{ animationDelay: '500ms' }}>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Operating Schedule</h2>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-gray-400 mb-2">Operating Days</label>
                  <select 
                    value={settings.operatingDays || 'every_day'} 
                    onChange={(e) => handleUpdateSetting('operatingDays', e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-500 dark:bg-gray-950 dark:border-gray-800 dark:text-white"
                  >
                    <option value="every_day">Every day</option>
                    <option value="weekdays">Weekdays Only</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-gray-400 mb-2">Calling Hours</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="time" 
                      value={settings.operatingStart || '09:00'} 
                      onChange={(e) => handleUpdateSetting('operatingStart', e.target.value)}
                      className="flex-1 bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-500 dark:bg-gray-950 dark:border-gray-800 dark:text-white"
                    />
                    <span className="text-slate-500 dark:text-gray-500">to</span>
                    <input
                      type="time"
                      value={settings.operatingEnd || '19:00'}
                      onChange={(e) => handleUpdateSetting('operatingEnd', e.target.value)}
                      className={`flex-1 bg-white border rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none dark:bg-gray-950 dark:text-white ${
                        settings.operatingStart && settings.operatingEnd && settings.operatingEnd <= settings.operatingStart
                          ? 'border-red-400 focus:border-red-500 dark:border-red-600'
                          : 'border-slate-300 focus:border-brand-500 dark:border-gray-800'
                      }`}
                    />
                  </div>
                  {settings.operatingStart && settings.operatingEnd && settings.operatingEnd <= settings.operatingStart ? (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.948 3.374H4.645c-1.73 0-2.813-1.874-1.948-3.374L10.051 3.378c.866-1.5 3.032-1.5 3.898 0L21.303 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                      End time must be after start time.
                    </p>
                  ) : (
                    <p className="text-xs text-slate-600 dark:text-gray-500 mt-1.5">Auto-dialer will only operate within this window.</p>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'knowledge-base' && (
          <div className="max-w-5xl flex flex-col gap-3 h-[600px] animate-slide-up" style={{ animationDelay: '400ms' }}>
            <p className="text-xs text-slate-600 dark:text-gray-500 shrink-0">
              Company profile uses <span className="text-slate-800 dark:text-gray-400">Save Profile</span>. Projects are saved when you create or update them. Without projects, the agent has no inventory to discuss.
            </p>
            <div className="flex gap-6 flex-1 min-h-0">
            {/* KB Sidebar */}
            <div className="w-64 surface-card flex flex-col overflow-hidden shrink-0">
              <button
                onClick={() => setKbPane('company')}
                className={`w-full text-left px-4 py-4 border-b border-slate-200/90 dark:border-gray-800/60 flex items-center gap-3 transition-colors ${kbPane === 'company' ? 'bg-slate-200 text-slate-900 dark:bg-gray-800 dark:text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-gray-800/50'}`}
              >
                <FileText className="w-4 h-4" />
                <span className="font-medium text-sm">Company Profile</span>
              </button>
              
              <div className="flex-1 flex flex-col p-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-800 dark:text-gray-300 flex items-center gap-2">
                    <Building className="w-4 h-4" />
                    Projects
                  </span>
                  <button onClick={() => { setKbPane('projects'); setCreating(true); setSelectedId(null); }} className="p-1 rounded-md text-brand-400 hover:bg-brand-500/10">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
                  {projects.length === 0 && !kbLoading && (
                    <div className="px-2 py-4 text-center space-y-2">
                      <p className="text-[11px] text-slate-600 dark:text-gray-500 leading-relaxed">No projects in the knowledge base yet.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setKbPane('projects');
                          setCreating(true);
                          setSelectedId(null);
                        }}
                        className="text-xs px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-500 w-full min-h-[44px]"
                      >
                        Add first project
                      </button>
                    </div>
                  )}
                  {projects.map(p => (
                    <div
                      key={p.id}
                      className={`group flex items-center gap-1 rounded-lg transition-colors ${kbPane === 'projects' && selectedId === p.id && !creating ? 'bg-brand-500/10' : 'hover:bg-slate-100 dark:hover:bg-gray-800'}`}
                    >
                      <button
                        onClick={() => { setKbPane('projects'); setSelectedId(p.id); setCreating(false); }}
                        className={`flex-1 text-left px-3 py-2 text-sm transition-colors truncate ${kbPane === 'projects' && selectedId === p.id && !creating ? 'text-brand-600 dark:text-brand-400' : 'text-slate-600 dark:text-gray-400'}`}
                      >
                        {p.name}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete project ${p.name}`}
                        onClick={(e) => { e.stopPropagation(); handleDeleteProject(p.id, p.name); }}
                        disabled={deletingId === p.id}
                        className="shrink-0 p-1.5 mr-1 rounded opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-all disabled:opacity-50"
                      >
                        {deletingId === p.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                          : <Trash2 className="w-3.5 h-3.5" aria-hidden />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* KB Content */}
            <div className="flex-1 min-w-0 surface-card overflow-hidden shadow-xl flex flex-col">
              {kbPane === 'company' ? (
                <>
                  <div className="p-4 border-b border-slate-200/90 dark:border-gray-800/60 flex flex-wrap items-center justify-between gap-2 bg-slate-50/90 dark:bg-gray-900/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <h2 className="text-md font-semibold text-slate-900 dark:text-white">Company Profile</h2>
                      {companyProfileDirty && (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-amber-400/90 shrink-0">
                          Unsaved changes
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={saveCompany}
                      className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-brand-600 hover:bg-brand-500 min-h-[44px] sm:min-h-0"
                    >
                      Save Profile
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <div className="space-y-5 max-w-3xl">
                      <div>
                        <label className="block text-sm font-medium text-slate-600 dark:text-gray-400 mb-2">Company Name</label>
                        <input
                          type="text"
                          value={companyForm.name}
                          onChange={(e) => setCompanyForm((prev) => ({ ...prev, name: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-600 dark:text-gray-400 mb-2">Tagline</label>
                        <input
                          type="text"
                          value={companyForm.tagline}
                          onChange={(e) => setCompanyForm((prev) => ({ ...prev, tagline: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                          <label className="block text-sm font-medium text-slate-600 dark:text-gray-400 mb-2">Phone</label>
                          <input
                            type="text"
                            value={companyForm.phone}
                            onChange={(e) => setCompanyForm((prev) => ({ ...prev, phone: e.target.value }))}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-600 dark:text-gray-400 mb-2">Email</label>
                          <input
                            type="text"
                            value={companyForm.email}
                            onChange={(e) => setCompanyForm((prev) => ({ ...prev, email: e.target.value }))}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                          <label className="block text-sm font-medium text-slate-600 dark:text-gray-400 mb-2">Website</label>
                          <input
                            type="text"
                            value={companyForm.website}
                            onChange={(e) => setCompanyForm((prev) => ({ ...prev, website: e.target.value }))}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-600 dark:text-gray-400 mb-2">Facebook URL</label>
                          <input
                            type="text"
                            value={companyForm.socialFacebook}
                            onChange={(e) => setCompanyForm((prev) => ({ ...prev, socialFacebook: e.target.value }))}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-600 dark:text-gray-400 mb-2">Head Office Address</label>
                        <textarea
                          rows={2}
                          value={companyForm.headOffice}
                          onChange={(e) => setCompanyForm((prev) => ({ ...prev, headOffice: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-600 dark:text-gray-400 mb-2">Operating Areas</label>
                        <input
                          type="text"
                          placeholder="e.g. Hyderabad, Vizag, Vijayawada"
                          value={companyForm.areas}
                          onChange={(e) => setCompanyForm((prev) => ({ ...prev, areas: e.target.value }))}
                          className={inputClass}
                        />
                        <p className="text-xs text-slate-600 dark:text-gray-500 mt-1.5">Comma-separated list.</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-600 dark:text-gray-400 mb-2">Project Types</label>
                        <input
                          type="text"
                          placeholder="e.g. Plots, Villas, Apartments"
                          value={companyForm.projectTypes}
                          onChange={(e) => setCompanyForm((prev) => ({ ...prev, projectTypes: e.target.value }))}
                          className={inputClass}
                        />
                        <p className="text-xs text-slate-600 dark:text-gray-500 mt-1.5">Comma-separated list.</p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-4 border-b border-slate-200/90 dark:border-gray-800/60 bg-slate-50/90 dark:bg-gray-900/50">
                    <h2 className="text-md font-semibold text-slate-900 dark:text-white">
                      {creating ? 'Create Project' : selectedProject ? `Edit: ${selectedProject.name}` : 'Select a Project'}
                    </h2>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {(creating || selectedProject) ? (
                      <KnowledgeBaseProjectForm
                        initialProject={creating ? null : selectedProject}
                        submitLabel={creating ? 'Create' : 'Save'}
                        onCancel={() => setCreating(false)}
                        onSubmit={submitProject}
                        typeOptions={[]}
                        locationOptions={[]}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-600 dark:text-gray-500 text-sm">
                        Select a project from the left or create a new one.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            </div>
          </div>
        )}

        {activeTab === 'conversation' && (
          <div className="max-w-3xl space-y-8">
            <p className="text-xs text-slate-600 dark:text-gray-500 -mt-1">
              Intro and consent text save automatically to your workspace when you edit them.
            </p>
            <ConversationPlaceholderReference />
            <section className="surface-card rounded-2xl p-6 animate-slide-up" style={{ animationDelay: '400ms' }}>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Introduction Messaging</h2>
              <p className="text-xs text-slate-600 dark:text-gray-400 mb-6">
                First spoken line when the call connects. Type any of the tokens from the reference above; they are
                filled from the active lead, company profile, agent name, and clock (server timezone, default Asia/Kolkata).
              </p>

              <textarea
                value={settings.introTemplate}
                onChange={(e) => handleUpdateSetting('introTemplate', e.target.value)}
                rows={4}
                maxLength={600}
                className="w-full bg-white border border-slate-300 rounded-xl p-4 text-sm text-slate-800 focus:outline-none focus:border-brand-500 custom-scrollbar dark:bg-gray-950 dark:border-gray-800 dark:text-gray-300"
              />
              <div className="flex justify-end mt-1">
                <span className={`text-xs ${(settings.introTemplate?.length || 0) > 500 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-slate-400 dark:text-gray-600'}`}>
                  {settings.introTemplate?.length || 0} / 600 chars
                  {(settings.introTemplate?.length || 0) > 500 && ' — keep intro short for faster response'}
                </span>
              </div>
            </section>

            <section className="surface-card rounded-2xl p-6 animate-slide-up" style={{ animationDelay: '500ms' }}>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Voicemail Drop</h2>
              <p className="text-xs text-slate-600 dark:text-gray-400 mb-6">
                Saved with your workspace. Use the same placeholders as the intro so copy stays consistent when this flow
                is wired to audio.
              </p>
              
              <textarea
                value={settings.voicemailTemplate || 'Hello {leadName}, this is {agentName}. Please call us back at your earliest convenience.'}
                onChange={(e) => handleUpdateSetting('voicemailTemplate', e.target.value)}
                rows={3}
                className="w-full bg-white border border-slate-300 rounded-xl p-4 text-sm text-slate-800 focus:outline-none focus:border-brand-500 custom-scrollbar dark:bg-gray-950 dark:border-gray-800 dark:text-gray-300"
              />
            </section>

            <section className="surface-card rounded-2xl p-6 animate-slide-up" style={{ animationDelay: '600ms' }}>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Privacy Consent Messaging</h2>
              <p className="text-xs text-slate-600 dark:text-gray-400 mb-6">
                Enable a recording notice where required. You can personalize it with the same placeholders (e.g. company
                phone or lead name).
              </p>
              
              <div className="flex items-start gap-3">
                <input 
                  type="checkbox" 
                  checked={settings.requireConsent || false}
                  onChange={(e) => handleUpdateSetting('requireConsent', e.target.checked)}
                  className="mt-1 rounded border border-slate-300 bg-white text-brand-500 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900"
                />
                <div className="flex-1">
                  <textarea
                    value={settings.consentTemplate || 'Before we proceed, please note that this call is recorded for quality purposes.'}
                    onChange={(e) => handleUpdateSetting('consentTemplate', e.target.value)}
                    disabled={!settings.requireConsent}
                    rows={2}
                    className={`w-full bg-white border border-slate-300 rounded-xl p-4 text-sm focus:outline-none focus:border-brand-500 transition-colors dark:bg-gray-950 dark:border-gray-800 ${!settings.requireConsent ? 'text-slate-400 opacity-50 dark:text-gray-600' : 'text-slate-800 dark:text-gray-300'}`}
                  />
                </div>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Toasts */}
      <div className="absolute bottom-6 right-6 z-[60] space-y-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            className={`px-4 py-3 rounded-xl border shadow-xl flex items-center gap-3 animate-slide-up max-w-sm ${
              toast.tone === 'error'
                ? 'bg-red-50 text-red-900 border-red-200 dark:bg-red-950/90 dark:text-red-200 dark:border-red-800/60'
                : 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/90 dark:text-emerald-200 dark:border-emerald-800/60'
            }`}
          >
            {toast.tone === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
            <span className="text-sm font-medium flex-1">{toast.message}</span>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="shrink-0 ml-1 p-1 rounded-md opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-opacity"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkspaceSaveStatus({ settingsSaveUi }) {
  const st = settingsSaveUi?.status || 'idle';
  if (st === 'idle') return null;
  if (st === 'syncing') {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-amber-300/70 bg-amber-50/95 text-amber-950 dark:border-amber-500/25 dark:bg-amber-950/30 dark:text-amber-100 px-3 py-2 text-xs shrink-0">
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden />
        <span>Syncing…</span>
      </div>
    );
  }
  if (st === 'saved') {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/70 bg-emerald-50/95 text-emerald-950 dark:border-emerald-500/25 dark:bg-emerald-950/30 dark:text-emerald-100 px-3 py-2 text-xs shrink-0">
        <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" aria-hidden />
        <span>Saved to workspace</span>
      </div>
    );
  }
  if (st === 'error') {
    return (
      <div className="inline-flex items-start gap-2 rounded-lg border border-red-300/70 bg-red-50/95 text-red-900 dark:border-red-500/30 dark:bg-red-950/35 dark:text-red-100 max-w-full sm:max-w-sm shrink-0 px-3 py-2 text-xs">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400" aria-hidden />
        <span className="min-w-0 break-words">{settingsSaveUi?.errorMessage || 'Sync failed'}</span>
      </div>
    );
  }
  return null;
}

function CopyTokenButton({ token }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(token).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      className="shrink-0 p-1 rounded-md text-slate-500 hover:text-brand-600 hover:bg-slate-100 border border-transparent hover:border-slate-300 transition-colors dark:text-gray-500 dark:hover:text-brand-300 dark:hover:bg-gray-800/80 dark:hover:border-gray-700"
      title="Copy token"
      aria-label={`Copy ${token} to clipboard`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden /> : <Copy className="w-3.5 h-3.5" aria-hidden />}
    </button>
  );
}

function ConversationPlaceholderReference() {
  return (
    <details className="surface-card rounded-2xl overflow-hidden group [&_summary::-webkit-details-marker]:hidden animate-slide-up" style={{ animationDelay: '350ms' }}>
      <summary className="cursor-pointer list-none px-5 py-3.5 text-sm font-medium text-brand-700 hover:bg-white/10 dark:text-brand-300 dark:hover:bg-white/5 flex items-center justify-between gap-2">
        <span>Placeholder reference — click to expand</span>
        <span className="text-slate-500 dark:text-gray-500 text-xs font-normal group-open:hidden">▼</span>
        <span className="text-slate-500 dark:text-gray-500 text-xs font-normal hidden group-open:inline">▲</span>
      </summary>
      <div className="px-5 pb-4 max-h-[min(420px,55vh)] overflow-y-auto custom-scrollbar border-t border-slate-200/90 dark:border-gray-800/50 space-y-5 pt-4">
        {CONVERSATION_PLACEHOLDER_GROUPS.map((group) => (
          <div key={group.title}>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-gray-500 mb-2">{group.title}</h3>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {group.items.map(({ token, hint }) => (
                <li
                  key={token}
                  className="flex items-start gap-1 text-xs bg-slate-50 rounded-lg px-2 py-1.5 border border-slate-200/90 dark:bg-gray-950/80 dark:border-gray-800/40"
                >
                  <code className="text-brand-700 dark:text-brand-200 shrink-0 font-mono text-[11px] pt-0.5">{token}</code>
                  <CopyTokenButton token={token} />
                  {hint ? <span className="text-slate-600 dark:text-gray-500 flex-1 min-w-0 pt-0.5 leading-snug">{hint}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

function TabButton({ id, label, icon: Icon, active, onClick }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      aria-controls={`tabpanel-${id}`}
      onClick={() => onClick(id)}
      className={`flex items-center gap-2 pb-4 text-sm font-medium transition-colors border-b-2 ${
        active ? 'text-brand-600 border-brand-600 dark:text-brand-400 dark:border-brand-400' : 'text-slate-500 border-transparent hover:text-slate-800 dark:text-gray-500 dark:hover:text-gray-300'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
