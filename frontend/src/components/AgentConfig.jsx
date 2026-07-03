import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Settings, BookOpen, MessageSquare, CheckCircle2, AlertCircle, Plus, Building,
  FileText, Loader2, Copy, Check, Trash2, Search, Mic, Eye, X, Globe,
} from 'lucide-react';
import { listProjects, createProject, updateProject, deleteProject, getCompanyInfo, updateCompanyInfo } from '../services/kbApi';
import KnowledgeBaseProjectForm from './KnowledgeBaseProjectForm';
import { CONVERSATION_PLACEHOLDER_GROUPS } from '../constants/conversationPlaceholders';

// ─── Constants ────────────────────────────────────────────────────────────────

const VOICE_DATA = [
  { name: 'aditya', gender: 'M' }, { name: 'ritu', gender: 'F' },
  { name: 'ashutosh', gender: 'M' }, { name: 'priya', gender: 'F' },
  { name: 'neha', gender: 'F' }, { name: 'rahul', gender: 'M' },
  { name: 'pooja', gender: 'F' }, { name: 'rohan', gender: 'M' },
  { name: 'simran', gender: 'F' }, { name: 'kavya', gender: 'F' },
  { name: 'amit', gender: 'M' }, { name: 'dev', gender: 'M' },
  { name: 'ishita', gender: 'F' }, { name: 'shreya', gender: 'F' },
  { name: 'ratan', gender: 'M' }, { name: 'varun', gender: 'M' },
  { name: 'manan', gender: 'M' }, { name: 'sumit', gender: 'M' },
  { name: 'roopa', gender: 'F' }, { name: 'kabir', gender: 'M' },
  { name: 'aayan', gender: 'M' }, { name: 'shubh', gender: 'M' },
  { name: 'advait', gender: 'M' }, { name: 'anand', gender: 'M' },
  { name: 'tanya', gender: 'F' }, { name: 'tarun', gender: 'M' },
  { name: 'sunny', gender: 'M' }, { name: 'mani', gender: 'M' },
  { name: 'gokul', gender: 'M' }, { name: 'vijay', gender: 'M' },
  { name: 'shruti', gender: 'F' }, { name: 'suhani', gender: 'F' },
  { name: 'mohit', gender: 'M' }, { name: 'kavitha', gender: 'F' },
  { name: 'rehan', gender: 'M' }, { name: 'soham', gender: 'M' },
  { name: 'rupali', gender: 'F' }, { name: 'niharika', gender: 'F' },
];

const TONE_OPTIONS = [
  { value: 'friendly',     label: 'Friendly',     emoji: '😊', desc: 'Warm, conversational, relatable' },
  { value: 'professional', label: 'Professional', emoji: '💼', desc: 'Formal, confident, business-like' },
  { value: 'assertive',    label: 'Assertive',    emoji: '🎯', desc: 'Direct, persuasive, goal-driven' },
];

const WEEKDAYS = [
  { key: 'mon', label: 'Mo', full: 'Monday' },
  { key: 'tue', label: 'Tu', full: 'Tuesday' },
  { key: 'wed', label: 'We', full: 'Wednesday' },
  { key: 'thu', label: 'Th', full: 'Thursday' },
  { key: 'fri', label: 'Fr', full: 'Friday' },
  { key: 'sat', label: 'Sa', full: 'Saturday' },
  { key: 'sun', label: 'Su', full: 'Sunday' },
];

const TIMEZONES = [
  { value: 'Asia/Kolkata',       label: 'IST — India (Asia/Kolkata)' },
  { value: 'Asia/Dubai',         label: 'GST — Dubai (Asia/Dubai)' },
  { value: 'Asia/Singapore',     label: 'SGT — Singapore (Asia/Singapore)' },
  { value: 'America/New_York',   label: 'EST — New York (America/New_York)' },
  { value: 'America/Los_Angeles',label: 'PST — Los Angeles (America/Los_Angeles)' },
  { value: 'Europe/London',      label: 'GMT — London (Europe/London)' },
  { value: 'UTC',                label: 'UTC' },
];

const EMPTY_COMPANY = { name: '', tagline: '', phone: '', email: '', website: '', headOffice: '', areas: '', projectTypes: '', socialFacebook: '' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseActiveDays(val) {
  if (!val || val === 'every_day') return new Set(['mon','tue','wed','thu','fri','sat','sun']);
  if (val === 'weekdays')  return new Set(['mon','tue','wed','thu','fri']);
  if (val === 'weekends')  return new Set(['sat','sun']);
  if (val.startsWith('custom:')) return new Set(val.slice(7).split(',').filter(Boolean));
  return new Set(['mon','tue','wed','thu','fri','sat','sun']);
}

function serializeActiveDays(days) {
  const all = ['mon','tue','wed','thu','fri','sat','sun'];
  if (all.every(d => days.has(d))) return 'every_day';
  const wd = ['mon','tue','wed','thu','fri'];
  if (wd.every(d => days.has(d)) && !days.has('sat') && !days.has('sun')) return 'weekdays';
  if (days.has('sat') && days.has('sun') && days.size === 2) return 'weekends';
  return 'custom:' + all.filter(d => days.has(d)).join(',');
}

function fillTemplate(template, map) {
  if (!template) return '';
  return template.replace(/\{[a-zA-Z]+\}/g, tok => (map[tok] !== undefined ? map[tok] : tok));
}

const inputCls =
  'w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand-500 dark:bg-gray-950 dark:border-gray-800 dark:text-white dark:placeholder:text-gray-500';

// ─── ChipInput ────────────────────────────────────────────────────────────────
function ChipInput({ value, onChange, placeholder = 'Type and press Enter…' }) {
  const [input, setInput] = useState('');
  const chips = useMemo(() => value.split(',').map(s => s.trim()).filter(Boolean), [value]);

  const addChip = (raw) => {
    const t = raw.trim();
    if (!t || chips.includes(t)) { setInput(''); return; }
    onChange([...chips, t].join(', '));
    setInput('');
  };

  const removeChip = (chip) => onChange(chips.filter(c => c !== chip).join(', '));

  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addChip(input); }
    else if (e.key === 'Backspace' && !input && chips.length) removeChip(chips[chips.length - 1]);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 min-h-[42px] w-full bg-white border border-slate-300 rounded-xl px-3 py-2 focus-within:border-brand-500 dark:bg-gray-950 dark:border-gray-800 dark:focus-within:border-brand-500 transition-colors">
      {chips.map(chip => (
        <span key={chip} className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 text-xs px-2.5 py-1 rounded-full border border-brand-200/60 dark:border-brand-700/40">
          {chip}
          <button type="button" onClick={() => removeChip(chip)} className="hover:text-brand-900 dark:hover:text-brand-100 transition-colors">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => { if (input.trim()) addChip(input); }}
        placeholder={chips.length === 0 ? placeholder : ''}
        className="flex-1 min-w-24 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-gray-500 outline-none"
      />
    </div>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────
function Field({ label, hint, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-600 dark:text-gray-400 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500 dark:text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
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

  // KB state
  const [projects, setProjects] = useState([]);
  const [companyInfo, setCompanyInfo] = useState({});
  const [companyForm, setCompanyForm] = useState(EMPTY_COMPANY);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbError, setKbError] = useState('');
  const [kbPane, setKbPane] = useState('company');
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteProjectModal, setDeleteProjectModal] = useState(null); // { id, name }

  // Voice browser
  const [voiceSearch, setVoiceSearch] = useState('');
  const [voiceGender, setVoiceGender] = useState('all');

  // Intro preview
  const [showPreview, setShowPreview] = useState(false);

  const selectedProject = useMemo(() => projects.find(p => p.id === selectedId) || null, [projects, selectedId]);

  // Load KB (lazy on tab switch)
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

  // Pre-load company info on mount so intro preview works from any tab
  useEffect(() => {
    getCompanyInfo()
      .then(({ companyInfo: info }) => setCompanyInfo(info || {}))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === 'knowledge-base' && projects.length === 0) loadKb();
  }, [activeTab, loadKb]);

  // Sync companyForm ← companyInfo
  const companyProfileDirty = useMemo(() => {
    const i = companyInfo || {};
    const saved = {
      name: i.name != null ? String(i.name) : '',
      tagline: i.tagline != null ? String(i.tagline) : '',
      phone: i.phone != null ? String(i.phone) : '',
      email: i.email != null ? String(i.email) : '',
      website: i.website != null ? String(i.website) : '',
      headOffice: i.headOffice != null ? String(i.headOffice) : '',
      areas: Array.isArray(i.areas) ? i.areas.join(', ') : (i.areas || ''),
      projectTypes: Array.isArray(i.projectTypes) ? i.projectTypes.join(', ') : (i.projectTypes || ''),
      socialFacebook: i.socialFacebook != null ? String(i.socialFacebook) : '',
    };
    return JSON.stringify(companyForm) !== JSON.stringify(saved);
  }, [companyForm, companyInfo]);

  useEffect(() => {
    const i = companyInfo || {};
    setCompanyForm({
      name: i.name != null ? String(i.name) : '',
      tagline: i.tagline != null ? String(i.tagline) : '',
      phone: i.phone != null ? String(i.phone) : '',
      email: i.email != null ? String(i.email) : '',
      website: i.website != null ? String(i.website) : '',
      headOffice: i.headOffice != null ? String(i.headOffice) : '',
      areas: Array.isArray(i.areas) ? i.areas.join(', ') : (i.areas || ''),
      projectTypes: Array.isArray(i.projectTypes) ? i.projectTypes.join(', ') : (i.projectTypes || ''),
      socialFacebook: i.socialFacebook != null ? String(i.socialFacebook) : '',
    });
  }, [companyInfo]);

  // Operating days
  const activeDays = useMemo(() => parseActiveDays(settings.operatingDays), [settings.operatingDays]);
  const toggleDay = (day) => {
    const next = new Set(activeDays);
    if (next.has(day)) {
      if (next.size === 1) return; // keep at least one day
      next.delete(day);
    } else {
      next.add(day);
    }
    handleUpdateSetting('operatingDays', serializeActiveDays(next));
  };

  // Filtered voices
  const filteredVoices = useMemo(() =>
    VOICE_DATA.filter(v => {
      const matchSearch = !voiceSearch || v.name.toLowerCase().includes(voiceSearch.toLowerCase());
      const matchGender = voiceGender === 'all' || v.gender === voiceGender;
      return matchSearch && matchGender;
    }),
  [voiceSearch, voiceGender]);

  // Sample token map for intro preview
  const sampleTokenMap = useMemo(() => ({
    '{leadName}': 'Priya Sharma',
    '{leadFirstName}': 'Priya',
    '{leadPhone}': '+91 98765 43210',
    '{leadLocation}': 'Hyderabad',
    '{leadBudget}': '₹50 Lakhs',
    '{leadSource}': 'Website',
    '{leadNotes}': 'Interested in 2BHK',
    '{leadOutcome}': 'new',
    '{leadNextAction}': 'follow up',
    '{leadFollowupDate}': '2026-05-15',
    '{leadId}': 'LD-12345',
    '{companyName}': companyForm.name || 'Sunshine Homes',
    '{companyTagline}': companyForm.tagline || 'Building Dreams',
    '{companyPhone}': companyForm.phone || '+91 40 1234 5678',
    '{companyEmail}': companyForm.email || 'info@company.com',
    '{companyWebsite}': companyForm.website || 'www.company.com',
    '{companyHeadOffice}': companyForm.headOffice || 'Hyderabad, India',
    '{companyAreas}': companyForm.areas || 'Hyderabad, Vizag',
    '{companyProjectTypes}': companyForm.projectTypes || 'Plots, Villas',
    '{companySocialFacebook}': companyForm.socialFacebook || '',
    '{agentName}': settings.agentName || 'Rahul',
    '{dateToday}': 'Tuesday, 13 May 2026',
    '{dateShort}': '2026-05-13',
    '{timeNow}': '10:30 AM',
    '{weekday}': 'Tuesday',
    '{year}': '2026',
    '{monthName}': 'May',
    '{dayNumber}': '13',
    '{timezone}': settings.timezone || 'Asia/Kolkata',
  }), [companyForm, settings.agentName, settings.timezone]);

  // Toasts
  const pushToast = (message, tone = 'success') => {
    const id = toastIdRef.current++;
    setToasts(prev => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };

  useEffect(() => {
    const st = settingsSaveUi?.status || 'idle';
    if (st === 'error' && prevSaveStatusRef.current !== 'error' && settingsSaveUi?.errorMessage) {
      pushToast(settingsSaveUi.errorMessage, 'error');
    }
    prevSaveStatusRef.current = st;
  }, [settingsSaveUi?.status, settingsSaveUi?.errorMessage]);

  const handleUpdateSetting = (key, value) => onSettingsChange({ ...settings, [key]: value });

  // Company save
  const saveCompany = async () => {
    try {
      setKbError('');
      const split = (str) => str.split(',').map(s => s.trim()).filter(Boolean);
      const payload = {
        ...companyInfo,
        name: companyForm.name.trim(),
        tagline: companyForm.tagline.trim(),
        phone: companyForm.phone.trim(),
        email: companyForm.email.trim(),
        website: companyForm.website.trim(),
        headOffice: companyForm.headOffice.trim(),
        areas: split(companyForm.areas),
        projectTypes: split(companyForm.projectTypes),
        socialFacebook: companyForm.socialFacebook.trim(),
      };
      const { companyInfo: next } = await updateCompanyInfo(payload);
      setCompanyInfo(next || {});
      pushToast('Company profile saved');
    } catch (err) {
      setKbError(err.message || 'Failed to save');
      pushToast('Failed to save company profile', 'error');
    }
  };

  // Project CRUD
  const submitProject = async (project) => {
    try {
      setKbError('');
      if (creating) {
        const { project: created } = await createProject(project);
        setProjects(prev => [...prev, created]);
        setSelectedId(created.id);
        setCreating(false);
        pushToast('Project created');
      } else if (selectedProject) {
        const { project: updated } = await updateProject(selectedProject.id, project);
        setProjects(prev => prev.map(p => (p.id === updated.id ? updated : p)));
        pushToast('Project saved');
      }
    } catch (err) {
      setKbError(err.message);
      pushToast(err.message, 'error');
    }
  };

  const confirmDeleteProject = async () => {
    if (!deleteProjectModal) return;
    const { id } = deleteProjectModal;
    try {
      setDeletingId(id);
      await deleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      if (selectedId === id) { setSelectedId(null); setCreating(false); }
      setDeleteProjectModal(null);
      pushToast('Project deleted');
    } catch (err) {
      setKbError(err.message);
      pushToast('Failed to delete project', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col h-full bg-transparent text-slate-800 dark:text-gray-200 relative">

      {/* Header */}
      <header className="px-8 py-6 border-b border-white/10 dark:border-white/5 animate-slide-up" style={{ animationDelay: '300ms' }}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Agent Configuration</h1>
            <p className="text-sm text-slate-600 dark:text-gray-400 mt-1">Configure your AI agent's personality, knowledge, and conversation scripts.</p>
          </div>
          <WorkspaceSaveStatus settingsSaveUi={settingsSaveUi} />
        </div>
        {agentConfigLoadError && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-50/95 text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100 px-3 py-2.5 text-xs" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" aria-hidden />
            <span>Could not load saved settings: {agentConfigLoadError}</span>
          </div>
        )}
        <div role="tablist" className="flex gap-6 mt-6 border-b border-slate-200 dark:border-gray-800">
          <TabButton id="general" label="General" icon={Settings} active={activeTab === 'general'} onClick={setActiveTab} />
          <TabButton id="knowledge-base" label="Knowledge Base" icon={BookOpen} active={activeTab === 'knowledge-base'} onClick={setActiveTab} />
          <TabButton id="conversation" label="Conversation" icon={MessageSquare} active={activeTab === 'conversation'} onClick={setActiveTab} />
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">

        {/* ── GENERAL TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'general' && (
          <div className="max-w-3xl space-y-8">
            <p className="text-xs text-slate-500 dark:text-gray-500 -mt-1 animate-slide-up" style={{ animationDelay: '350ms' }}>
              All changes save automatically. Watch the sync indicator in the header — local edits are preserved until the server accepts them.
            </p>

            {/* Agent Personalization */}
            <section className="surface-card rounded-2xl p-6 animate-slide-up" style={{ animationDelay: '400ms' }}>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-5">Agent Personalization</h2>
              <div className="space-y-5">

                {/* Name */}
                <Field label="Agent Name" hint={`Used in call introductions: "Hello, I'm ${settings.agentName || 'Rahul'} calling from…"`}>
                  <input
                    type="text"
                    value={settings.agentName || ''}
                    placeholder="e.g. Rahul"
                    onChange={e => handleUpdateSetting('agentName', e.target.value)}
                    className={inputCls}
                  />
                </Field>

                {/* Tone */}
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-gray-400 mb-2">Personality / Tone</label>
                  <div className="grid grid-cols-3 gap-3">
                    {TONE_OPTIONS.map(opt => {
                      const active = (settings.agentTone || 'friendly') === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleUpdateSetting('agentTone', opt.value)}
                          className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-4 transition-all text-center ${
                            active
                              ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-900/20 dark:border-brand-400'
                              : 'border-slate-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-600'
                          }`}
                        >
                          <span className="text-2xl">{opt.emoji}</span>
                          <span className={`text-sm font-semibold ${active ? 'text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-gray-300'}`}>{opt.label}</span>
                          <span className="text-[11px] text-slate-500 dark:text-gray-500 leading-tight">{opt.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Language */}
                <Field label="Default Language" hint="Auto-detect switches language mid-call based on what the lead speaks.">
                  <select value={settings.languageMode} onChange={e => handleUpdateSetting('languageMode', e.target.value)} className={inputCls}>
                    <option value="telugu">Telugu</option>
                    <option value="english">English</option>
                    <option value="hindi">Hindi</option>
                    <option value="auto">Auto-detect</option>
                  </select>
                </Field>
              </div>
            </section>

            {/* Voice Browser */}
            <section className="surface-card rounded-2xl p-6 animate-slide-up" style={{ animationDelay: '450ms' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Agent Voice</h2>
                <span className="text-xs text-slate-500 dark:text-gray-500">
                  Selected: <strong className="text-slate-700 dark:text-gray-300 capitalize">{settings.ttsVoice || 'ritu'}</strong>
                  {' '}·{' '}
                  {VOICE_DATA.find(v => v.name === (settings.ttsVoice || 'ritu'))?.gender === 'F' ? '♀ Female' : '♂ Male'}
                </span>
              </div>

              {/* Filters row */}
              <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    value={voiceSearch}
                    onChange={e => setVoiceSearch(e.target.value)}
                    placeholder="Search voices…"
                    className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-gray-950 border border-slate-300 dark:border-gray-800 rounded-lg focus:outline-none focus:border-brand-500"
                  />
                </div>
                {[
                  { key: 'all', label: 'All' },
                  { key: 'F',   label: '♀ Female' },
                  { key: 'M',   label: '♂ Male' },
                ].map(g => (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setVoiceGender(g.key)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      voiceGender === g.key
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>

              {/* Voice grid */}
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                {filteredVoices.map(v => {
                  const selected = settings.ttsVoice === v.name;
                  return (
                    <button
                      key={v.name}
                      type="button"
                      title={`${v.name} (${v.gender === 'F' ? 'Female' : 'Male'})`}
                      onClick={() => handleUpdateSetting('ttsVoice', v.name)}
                      className={`relative flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border-2 transition-all ${
                        selected
                          ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-900/20 dark:border-brand-400'
                          : 'border-slate-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-gray-600 bg-white dark:bg-gray-900/50'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                        v.gender === 'F'
                          ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                      }`}>
                        {v.name[0].toUpperCase()}
                      </div>
                      <span className={`text-[11px] font-medium capitalize truncate w-full text-center ${selected ? 'text-brand-700 dark:text-brand-300' : 'text-slate-600 dark:text-gray-400'}`}>
                        {v.name}
                      </span>
                      {selected && (
                        <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-brand-500 rounded-full flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </span>
                      )}
                    </button>
                  );
                })}
                {filteredVoices.length === 0 && (
                  <p className="col-span-full text-center text-xs text-slate-500 py-6">No voices match your search.</p>
                )}
              </div>
            </section>

            {/* Call Behavior */}
            <section className="surface-card rounded-2xl p-6 animate-slide-up" style={{ animationDelay: '500ms' }}>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-5">Call Behavior</h2>
              <div className="grid grid-cols-2 gap-6">
                <Field label="Max Calls Per Day" hint="Auto-dialer pauses after this many calls.">
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={settings.maxCallsPerDay ?? 50}
                    onChange={e => handleUpdateSetting('maxCallsPerDay', Number(e.target.value))}
                    className={inputCls}
                  />
                </Field>
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-gray-400 mb-2">Retry Attempts</label>
                  <div className="flex gap-2">
                    {[0, 1, 2, 3].map(n => {
                      const active = (settings.retryAttempts ?? 1) === n;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => handleUpdateSetting('retryAttempts', n)}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-colors ${
                            active
                              ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300 dark:border-brand-400'
                              : 'border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400 hover:border-brand-300 dark:hover:border-gray-600'
                          }`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-gray-500 mt-1.5">Retries after no answer or busy signal.</p>
                </div>
              </div>
            </section>

            {/* Operating Schedule */}
            <section className="surface-card rounded-2xl p-6 animate-slide-up" style={{ animationDelay: '550ms' }}>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-5">Operating Schedule</h2>
              <div className="space-y-5">

                {/* Day picker */}
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-gray-400 mb-2.5">Active Days</label>
                  <div className="flex gap-1.5">
                    {WEEKDAYS.map(({ key, label, full }) => {
                      const on = activeDays.has(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          title={full}
                          onClick={() => toggleDay(key)}
                          className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                            on
                              ? 'border-brand-500 bg-brand-500 text-white dark:border-brand-400 dark:bg-brand-600'
                              : 'border-slate-200 dark:border-gray-700 text-slate-400 dark:text-gray-600 hover:border-brand-300 dark:hover:border-gray-600'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-3 mt-2.5">
                    {[
                      { label: 'All days',   value: 'every_day' },
                      { label: 'Weekdays',   value: 'weekdays' },
                      { label: 'Weekends',   value: 'weekends' },
                    ].map(({ label, value }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleUpdateSetting('operatingDays', value)}
                        className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time range */}
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-gray-400 mb-2">Calling Hours</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="time"
                      value={settings.operatingStart || '09:00'}
                      onChange={e => handleUpdateSetting('operatingStart', e.target.value)}
                      className={`flex-1 ${inputCls}`}
                    />
                    <span className="text-slate-400 dark:text-gray-500 text-sm">to</span>
                    <input
                      type="time"
                      value={settings.operatingEnd || '19:00'}
                      onChange={e => handleUpdateSetting('operatingEnd', e.target.value)}
                      className={`flex-1 ${inputCls}`}
                    />
                  </div>
                  {settings.operatingStart && settings.operatingEnd && settings.operatingEnd <= settings.operatingStart ? (
                    <p className="text-xs text-red-500 dark:text-red-400 mt-1.5">End time must be after start time.</p>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-gray-500 mt-1.5">Auto-dialer only operates within this window.</p>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ── KNOWLEDGE BASE TAB ──────────────────────────────────────────── */}
        {activeTab === 'knowledge-base' && (
          <div className="max-w-5xl flex flex-col gap-3 h-[620px] animate-slide-up" style={{ animationDelay: '400ms' }}>
            <p className="text-xs text-slate-500 dark:text-gray-500 shrink-0">
              Company Profile uses <em>Save Profile</em>. Projects save when you create or update them. The agent uses this data to answer questions during calls.
            </p>
            {kbError && (
              <div className="shrink-0 flex items-center gap-2 rounded-xl border border-red-300/60 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/40 px-3 py-2 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {kbError}
              </div>
            )}
            <div className="flex gap-5 flex-1 min-h-0">

              {/* Sidebar */}
              <div className="w-60 surface-card flex flex-col overflow-hidden shrink-0 rounded-2xl">
                <button
                  onClick={() => setKbPane('company')}
                  className={`w-full text-left px-4 py-3.5 border-b border-slate-200/90 dark:border-gray-800/60 flex items-center gap-3 transition-colors ${
                    kbPane === 'company'
                      ? 'bg-brand-50/80 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300'
                      : 'text-slate-600 hover:bg-slate-50 dark:text-gray-400 dark:hover:bg-gray-800/50'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${kbPane === 'company' ? 'bg-brand-100 dark:bg-brand-800/40' : 'bg-slate-100 dark:bg-gray-800'}`}>
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-medium text-sm">Company Profile</span>
                </button>

                <div className="flex-1 flex flex-col p-3 gap-2 overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-500 flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5" />
                      Projects
                    </span>
                    <button
                      onClick={() => { setKbPane('projects'); setCreating(true); setSelectedId(null); }}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                      title="New project"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-0.5 custom-scrollbar">
                    {kbLoading && (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                      </div>
                    )}
                    {!kbLoading && projects.length === 0 && (
                      <div className="px-2 py-5 text-center space-y-2.5">
                        <p className="text-[11px] text-slate-500 dark:text-gray-500 leading-relaxed">No projects yet. Add your first project to give the agent property knowledge.</p>
                        <button
                          onClick={() => { setKbPane('projects'); setCreating(true); setSelectedId(null); }}
                          className="w-full text-xs px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-500 transition-colors"
                        >
                          Add first project
                        </button>
                      </div>
                    )}
                    {projects.map(p => (
                      <div
                        key={p.id}
                        className={`group flex items-center gap-1 rounded-lg transition-colors ${
                          kbPane === 'projects' && selectedId === p.id && !creating
                            ? 'bg-brand-50 dark:bg-brand-900/20'
                            : 'hover:bg-slate-50 dark:hover:bg-gray-800/50'
                        }`}
                      >
                        <button
                          onClick={() => { setKbPane('projects'); setSelectedId(p.id); setCreating(false); }}
                          className={`flex-1 text-left px-3 py-2 text-sm truncate transition-colors ${
                            kbPane === 'projects' && selectedId === p.id && !creating
                              ? 'text-brand-600 dark:text-brand-400 font-medium'
                              : 'text-slate-600 dark:text-gray-400'
                          }`}
                        >
                          {p.name}
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${p.name}`}
                          onClick={e => { e.stopPropagation(); setDeleteProjectModal({ id: p.id, name: p.name }); }}
                          disabled={deletingId === p.id}
                          className="shrink-0 p-1.5 mr-1 rounded opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-all disabled:opacity-50"
                        >
                          {deletingId === p.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Main panel */}
              <div className="flex-1 min-w-0 surface-card overflow-hidden flex flex-col rounded-2xl">
                {kbPane === 'company' ? (
                  <>
                    <div className="px-5 py-3.5 border-b border-slate-200/90 dark:border-gray-800/60 flex items-center justify-between gap-3 bg-slate-50/90 dark:bg-gray-900/50 shrink-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Company Profile</h2>
                        {companyProfileDirty && (
                          <span className="text-[10px] font-medium uppercase tracking-wide text-amber-500 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-700/40 px-2 py-0.5 rounded-full">
                            Unsaved
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={saveCompany}
                        disabled={!companyProfileDirty}
                        className="px-4 py-1.5 rounded-xl text-xs font-medium text-white bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Save Profile
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
                      <div className="space-y-4 max-w-2xl">
                        <div className="grid grid-cols-2 gap-4">
                          <Field label="Company Name" required>
                            <input value={companyForm.name} onChange={e => setCompanyForm(p => ({ ...p, name: e.target.value }))} className={inputCls} placeholder="e.g. Sunshine Homes" />
                          </Field>
                          <Field label="Tagline">
                            <input value={companyForm.tagline} onChange={e => setCompanyForm(p => ({ ...p, tagline: e.target.value }))} className={inputCls} placeholder="e.g. Building Dreams" />
                          </Field>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <Field label="Phone">
                            <input value={companyForm.phone} onChange={e => setCompanyForm(p => ({ ...p, phone: e.target.value }))} className={inputCls} placeholder="+91 40 1234 5678" />
                          </Field>
                          <Field label="Email">
                            <input type="email" value={companyForm.email} onChange={e => setCompanyForm(p => ({ ...p, email: e.target.value }))} className={inputCls} placeholder="info@company.com" />
                          </Field>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <Field label="Website">
                            <input value={companyForm.website} onChange={e => setCompanyForm(p => ({ ...p, website: e.target.value }))} className={inputCls} placeholder="www.company.com" />
                          </Field>
                          <Field label="Facebook Page URL">
                            <input value={companyForm.socialFacebook} onChange={e => setCompanyForm(p => ({ ...p, socialFacebook: e.target.value }))} className={inputCls} placeholder="fb.com/yourpage" />
                          </Field>
                        </div>
                        <Field label="Head Office Address">
                          <textarea rows={2} value={companyForm.headOffice} onChange={e => setCompanyForm(p => ({ ...p, headOffice: e.target.value }))} className={inputCls} placeholder="Full address" />
                        </Field>
                        <Field label="Operating Areas" hint="Type an area and press Enter to add it as a tag.">
                          <ChipInput
                            value={companyForm.areas}
                            onChange={v => setCompanyForm(p => ({ ...p, areas: v }))}
                            placeholder="e.g. Hyderabad, Vizag…"
                          />
                        </Field>
                        <Field label="Project Types" hint="Type a type and press Enter to add it as a tag.">
                          <ChipInput
                            value={companyForm.projectTypes}
                            onChange={v => setCompanyForm(p => ({ ...p, projectTypes: v }))}
                            placeholder="e.g. Plots, Villas, Apartments…"
                          />
                        </Field>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="px-5 py-3.5 border-b border-slate-200/90 dark:border-gray-800/60 bg-slate-50/90 dark:bg-gray-900/50 shrink-0">
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {creating ? 'New Project' : selectedProject ? selectedProject.name : 'Select a Project'}
                      </h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                      {(creating || selectedProject) ? (
                        <KnowledgeBaseProjectForm
                          initialProject={creating ? null : selectedProject}
                          submitLabel={creating ? 'Create Project' : 'Save Changes'}
                          onCancel={() => { setCreating(false); if (!selectedProject) setKbPane('company'); }}
                          onSubmit={submitProject}
                        />
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center gap-3">
                          <Building className="w-10 h-10 text-slate-300 dark:text-gray-700" />
                          <p className="text-sm text-slate-500 dark:text-gray-500">Select a project from the sidebar or create a new one.</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── CONVERSATION TAB ────────────────────────────────────────────── */}
        {activeTab === 'conversation' && (
          <div className="max-w-3xl space-y-8">
            <p className="text-xs text-slate-500 dark:text-gray-500 -mt-1">
              Scripts save automatically. Use tokens from the reference below to personalise each call.
            </p>
            <ConversationPlaceholderReference />

            {/* Intro + live preview */}
            <section className="surface-card rounded-2xl overflow-hidden animate-slide-up" style={{ animationDelay: '400ms' }}>
              <div className="px-5 py-4 border-b border-slate-200/90 dark:border-gray-800/60 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Introduction Script</h2>
                  <p className="text-xs text-slate-500 dark:text-gray-500 mt-0.5">First thing the agent says when the call connects.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPreview(p => !p)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    showPreview
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300'
                      : 'bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  {showPreview ? 'Hide Preview' : 'Preview'}
                </button>
              </div>
              <div className="p-5 space-y-3">
                <textarea
                  value={settings.introTemplate || ''}
                  onChange={e => handleUpdateSetting('introTemplate', e.target.value)}
                  rows={4}
                  maxLength={600}
                  className="w-full bg-white border border-slate-300 rounded-xl p-4 text-sm text-slate-800 focus:outline-none focus:border-brand-500 custom-scrollbar dark:bg-gray-950 dark:border-gray-800 dark:text-gray-300 resize-none"
                />
                <div className="flex justify-end">
                  <span className={`text-xs ${(settings.introTemplate?.length || 0) > 500 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-slate-400 dark:text-gray-600'}`}>
                    {settings.introTemplate?.length || 0} / 600 chars
                    {(settings.introTemplate?.length || 0) > 500 && ' — keep intro short for faster TTS'}
                  </span>
                </div>
                {showPreview && (
                  <div className="rounded-xl border border-brand-200/60 dark:border-brand-800/40 bg-brand-50/40 dark:bg-brand-950/20 p-4">
                    <div className="flex items-center gap-2 mb-2.5">
                      <Mic className="w-3.5 h-3.5 text-brand-500" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
                        Live preview — sample lead data
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-gray-300 leading-relaxed italic">
                      "{fillTemplate(settings.introTemplate || '', sampleTokenMap)}"
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-gray-500 mt-2 border-t border-brand-200/40 dark:border-brand-800/30 pt-2">
                      Sample: Priya Sharma · {companyForm.name || 'Your Company'} · {settings.agentName || 'Agent'}
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* Voicemail */}
            <section className="surface-card rounded-2xl p-5 animate-slide-up" style={{ animationDelay: '500ms' }}>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Voicemail Drop</h2>
              <p className="text-xs text-slate-500 dark:text-gray-500 mb-4">Played when the call goes to voicemail. Same tokens apply.</p>
              <textarea
                value={settings.voicemailTemplate || ''}
                onChange={e => handleUpdateSetting('voicemailTemplate', e.target.value)}
                rows={3}
                placeholder="Hello {leadName}, this is {agentName} calling from {companyName}. Please call us back at {companyPhone}."
                className="w-full bg-white border border-slate-300 rounded-xl p-4 text-sm text-slate-800 focus:outline-none focus:border-brand-500 dark:bg-gray-950 dark:border-gray-800 dark:text-gray-300 resize-none"
              />
            </section>

            {/* Privacy consent */}
            <section className="surface-card rounded-2xl p-5 animate-slide-up" style={{ animationDelay: '600ms' }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Privacy Consent Notice</h2>
                  <p className="text-xs text-slate-500 dark:text-gray-500 mb-4">Read aloud at call start. Enable where required by law.</p>
                  <textarea
                    value={settings.consentTemplate || ''}
                    onChange={e => handleUpdateSetting('consentTemplate', e.target.value)}
                    disabled={!settings.requireConsent}
                    rows={2}
                    placeholder="Before we proceed, please note that this call may be recorded for quality purposes."
                    className={`w-full bg-white border border-slate-300 rounded-xl p-4 text-sm focus:outline-none focus:border-brand-500 dark:bg-gray-950 dark:border-gray-800 resize-none transition-opacity ${
                      !settings.requireConsent ? 'opacity-40 cursor-not-allowed' : 'text-slate-800 dark:text-gray-300'
                    }`}
                  />
                </div>
                {/* Toggle switch */}
                <div className="flex flex-col items-center gap-1.5 pt-1 shrink-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!settings.requireConsent}
                    onClick={() => handleUpdateSetting('requireConsent', !settings.requireConsent)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      settings.requireConsent ? 'bg-brand-600' : 'bg-slate-300 dark:bg-gray-700'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${settings.requireConsent ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <span className="text-[11px] text-slate-500 dark:text-gray-500">{settings.requireConsent ? 'On' : 'Off'}</span>
                </div>
              </div>
            </section>

            {/* Streaming STT (experimental) */}
            <section className="surface-card rounded-2xl p-5 animate-slide-up" style={{ animationDelay: '650ms' }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
                    Streaming STT <span className="text-[10px] font-medium uppercase tracking-wide text-amber-500">Experimental</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-gray-500">
                    Streams your voice to the transcriber while you speak instead of after you finish, cutting ~0.8–1.2s of latency per turn. Falls back automatically if unavailable. Note: caller-side call recording is skipped while this is on.
                  </p>
                </div>
                {/* Toggle switch */}
                <div className="flex flex-col items-center gap-1.5 pt-1 shrink-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!settings.streamingStt}
                    onClick={() => handleUpdateSetting('streamingStt', !settings.streamingStt)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      settings.streamingStt ? 'bg-brand-600' : 'bg-slate-300 dark:bg-gray-700'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${settings.streamingStt ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <span className="text-[11px] text-slate-500 dark:text-gray-500">{settings.streamingStt ? 'On' : 'Off'}</span>
                </div>
              </div>
            </section>

            {/* Timezone */}
            <section className="surface-card rounded-2xl p-5 animate-slide-up" style={{ animationDelay: '700ms' }}>
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-4 h-4 text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Timezone</h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-gray-500 mb-4">
                Used for{' '}
                <code className="font-mono text-brand-600 dark:text-brand-400 text-[11px]">{'{timeNow}'}</code>,{' '}
                <code className="font-mono text-brand-600 dark:text-brand-400 text-[11px]">{'{dateToday}'}</code>,
                and the operating schedule.
              </p>
              <select
                value={settings.timezone || 'Asia/Kolkata'}
                onChange={e => handleUpdateSetting('timezone', e.target.value)}
                className={inputCls}
              >
                {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
            </section>
          </div>
        )}
      </div>

      {/* ── Delete Project Modal ─────────────────────────────────────────── */}
      {deleteProjectModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setDeleteProjectModal(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl border border-slate-200/90 dark:border-gray-800"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">Delete Project</h3>
                <p className="text-sm text-slate-600 dark:text-gray-400 mt-1">
                  Delete <strong>"{deleteProjectModal.name}"</strong>? This removes all project data from the knowledge base and cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteProjectModal(null)}
                className="px-4 py-2 text-sm rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteProject}
                disabled={!!deletingId}
                className="px-4 py-2 text-sm rounded-xl bg-red-600 hover:bg-red-500 text-white disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                {deletingId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toasts ──────────────────────────────────────────────────────── */}
      <div className="absolute bottom-6 right-6 z-[60] space-y-3">
        {toasts.map(toast => (
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
            {toast.tone === 'error'
              ? <AlertCircle className="w-5 h-5 shrink-0" />
              : <CheckCircle2 className="w-5 h-5 shrink-0" />}
            <span className="text-sm font-medium flex-1">{toast.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="shrink-0 ml-1 p-1 rounded-md opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-opacity"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function WorkspaceSaveStatus({ settingsSaveUi }) {
  const st = settingsSaveUi?.status || 'idle';
  if (st === 'idle') return null;
  if (st === 'syncing') return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-amber-300/70 bg-amber-50/95 text-amber-950 dark:border-amber-500/25 dark:bg-amber-950/30 dark:text-amber-100 px-3 py-2 text-xs shrink-0">
      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden />
      <span>Syncing…</span>
    </div>
  );
  if (st === 'saved') return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/70 bg-emerald-50/95 text-emerald-950 dark:border-emerald-500/25 dark:bg-emerald-950/30 dark:text-emerald-100 px-3 py-2 text-xs shrink-0">
      <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" aria-hidden />
      <span>Saved to workspace</span>
    </div>
  );
  if (st === 'error') return (
    <div className="inline-flex items-start gap-2 rounded-lg border border-red-300/70 bg-red-50/95 text-red-900 dark:border-red-500/30 dark:bg-red-950/35 dark:text-red-100 max-w-sm shrink-0 px-3 py-2 text-xs">
      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400" aria-hidden />
      <span className="min-w-0 break-words">{settingsSaveUi?.errorMessage || 'Sync failed'}</span>
    </div>
  );
  return null;
}

function CopyTokenButton({ token }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(token).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); })}
      className="shrink-0 p-1 rounded-md text-slate-500 hover:text-brand-600 hover:bg-slate-100 border border-transparent hover:border-slate-300 transition-colors dark:text-gray-500 dark:hover:text-brand-300 dark:hover:bg-gray-800/80 dark:hover:border-gray-700"
      title={`Copy ${token}`}
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
        <span>Template token reference — click to expand</span>
        <span className="text-slate-500 dark:text-gray-500 text-xs font-normal group-open:hidden">▼</span>
        <span className="text-slate-500 dark:text-gray-500 text-xs font-normal hidden group-open:inline">▲</span>
      </summary>
      <div className="px-5 pb-4 max-h-[min(420px,55vh)] overflow-y-auto custom-scrollbar border-t border-slate-200/90 dark:border-gray-800/50 space-y-5 pt-4">
        {CONVERSATION_PLACEHOLDER_GROUPS.map(group => (
          <div key={group.title}>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-500 mb-2">{group.title}</h3>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {group.items.map(({ token, hint }) => (
                <li key={token} className="flex items-start gap-1 text-xs bg-slate-50 rounded-lg px-2 py-1.5 border border-slate-200/90 dark:bg-gray-950/80 dark:border-gray-800/40">
                  <code className="text-brand-700 dark:text-brand-200 shrink-0 font-mono text-[11px] pt-0.5">{token}</code>
                  <CopyTokenButton token={token} />
                  {hint ? <span className="text-slate-500 dark:text-gray-500 flex-1 min-w-0 pt-0.5 leading-snug">{hint}</span> : null}
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
        active
          ? 'text-brand-600 border-brand-600 dark:text-brand-400 dark:border-brand-400'
          : 'text-slate-500 border-transparent hover:text-slate-800 dark:text-gray-500 dark:hover:text-gray-300'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
