import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Settings, BookOpen, MessageSquare, Save, CheckCircle2, AlertCircle, Plus, Search, Building, FileText } from 'lucide-react';
import { listProjects, createProject, updateProject, deleteProject, getCompanyInfo, updateCompanyInfo } from '../services/kbApi';
import KnowledgeBaseProjectForm from './KnowledgeBaseProjectForm';

const VOICES = ['aditya', 'ritu', 'ashutosh', 'priya', 'neha', 'rahul', 'pooja', 'rohan', 'simran', 'kavya', 'amit', 'dev', 'ishita', 'shreya', 'ratan', 'varun', 'manan', 'sumit', 'roopa', 'kabir', 'aayan', 'shubh', 'advait', 'anand', 'tanya', 'tarun', 'sunny', 'mani', 'gokul', 'vijay', 'shruti', 'suhani', 'mohit', 'kavitha', 'rehan', 'soham', 'rupali', 'niharika'];

export default function AgentConfig({ settings, onSettingsChange }) {
  const [activeTab, setActiveTab] = useState('general');
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(1);

  // --- Knowledge Base State ---
  const [projects, setProjects] = useState([]);
  const [companyInfo, setCompanyInfo] = useState({});
  const [companyDraft, setCompanyDraft] = useState('');
  const [kbLoading, setKbLoading] = useState(false);
  const [kbError, setKbError] = useState('');
  const [kbPane, setKbPane] = useState('company'); // 'company' or 'projects'
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);

  const selectedProject = useMemo(() => projects.find((p) => p.id === selectedId) || null, [projects, selectedId]);
  const visibleProjects = useMemo(() => {
    if (!search) return projects;
    const lower = search.toLowerCase();
    return projects.filter(p => (p.name && p.name.toLowerCase().includes(lower)) || (p.location && p.location.toLowerCase().includes(lower)));
  }, [projects, search]);

  const loadKb = async () => {
    setKbLoading(true);
    try {
      const [{ projects: items }, { companyInfo: info }] = await Promise.all([listProjects(), getCompanyInfo()]);
      setProjects(items || []);
      setCompanyInfo(info || {});
      setCompanyDraft(JSON.stringify(info || {}, null, 2));
    } catch (err) {
      setKbError(err.message);
    } finally {
      setKbLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'knowledge-base' && projects.length === 0) {
      loadKb();
    }
  }, [activeTab]);

  const pushToast = (message, tone = 'success') => {
    const id = toastIdRef.current++;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  };

  // --- Settings Handlers ---
  const handleUpdateSetting = (key, value) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  // --- Knowledge Base Handlers ---
  const saveCompany = async () => {
    try {
      setKbError('');
      const parsed = JSON.parse(companyDraft || '{}');
      const { companyInfo: next } = await updateCompanyInfo(parsed);
      setCompanyInfo(next || {});
      pushToast('Company info saved successfully');
    } catch (err) {
      setKbError('Invalid JSON format');
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

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-950 text-gray-200 relative">
      <header className="px-8 py-6 border-b border-gray-800/60 bg-gray-900/30 backdrop-blur">
        <h1 className="text-2xl font-bold text-white tracking-tight">Agent Configuration</h1>
        <p className="text-sm text-gray-400 mt-1">Configure your AI agent's personality, knowledge, and conversation scripts.</p>
        
        <div className="flex gap-6 mt-6 border-b border-gray-800">
          <TabButton id="general" label="General" icon={Settings} active={activeTab === 'general'} onClick={setActiveTab} />
          <TabButton id="knowledge-base" label="Knowledge Base" icon={BookOpen} active={activeTab === 'knowledge-base'} onClick={setActiveTab} />
          <TabButton id="conversation" label="Conversation" icon={MessageSquare} active={activeTab === 'conversation'} onClick={setActiveTab} />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        {activeTab === 'general' && (
          <div className="max-w-3xl space-y-8">
            <section className="bg-gray-900/50 border border-gray-800/60 rounded-2xl p-6 backdrop-blur-sm shadow-xl">
              <h2 className="text-lg font-semibold text-white mb-6">Agent Personalization</h2>
              
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Agent Name</label>
                  <input 
                    type="text" 
                    value={settings.agentName || 'Voice Agent'} 
                    onChange={(e) => handleUpdateSetting('agentName', e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
                  />
                  <p className="text-xs text-gray-500 mt-1.5">This name will be used by the agent during introductions.</p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Default Language</label>
                    <select 
                      value={settings.languageMode} 
                      onChange={(e) => handleUpdateSetting('languageMode', e.target.value)}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
                    >
                      <option value="telugu">Telugu</option>
                      <option value="english">English</option>
                      <option value="hindi">Hindi</option>
                      <option value="auto">Auto-detect</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Agent Voice</label>
                    <select 
                      value={settings.ttsVoice} 
                      onChange={(e) => handleUpdateSetting('ttsVoice', e.target.value)}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500 capitalize"
                    >
                      {VOICES.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-gray-900/50 border border-gray-800/60 rounded-2xl p-6 backdrop-blur-sm shadow-xl">
              <h2 className="text-lg font-semibold text-white mb-6">Operating Schedule</h2>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Operating Days</label>
                  <select 
                    value={settings.operatingDays || 'every_day'} 
                    onChange={(e) => handleUpdateSetting('operatingDays', e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="every_day">Every day</option>
                    <option value="weekdays">Weekdays Only</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Calling Hours</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="time" 
                      value={settings.operatingStart || '09:00'} 
                      onChange={(e) => handleUpdateSetting('operatingStart', e.target.value)}
                      className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
                    />
                    <span className="text-gray-500">to</span>
                    <input 
                      type="time" 
                      value={settings.operatingEnd || '19:00'} 
                      onChange={(e) => handleUpdateSetting('operatingEnd', e.target.value)}
                      className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">Auto-dialer will only operate within this window.</p>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'knowledge-base' && (
          <div className="max-w-5xl flex gap-6 h-[600px]">
            {/* KB Sidebar */}
            <div className="w-64 bg-gray-900/50 border border-gray-800/60 rounded-2xl flex flex-col overflow-hidden">
              <button
                onClick={() => setKbPane('company')}
                className={`w-full text-left px-4 py-4 border-b border-gray-800/60 flex items-center gap-3 transition-colors ${kbPane === 'company' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/50'}`}
              >
                <FileText className="w-4 h-4" />
                <span className="font-medium text-sm">Company Profile</span>
              </button>
              
              <div className="flex-1 flex flex-col p-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-gray-300 flex items-center gap-2">
                    <Building className="w-4 h-4" />
                    Projects
                  </span>
                  <button onClick={() => { setKbPane('projects'); setCreating(true); setSelectedId(null); }} className="p-1 rounded-md text-brand-400 hover:bg-brand-500/10">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
                  {projects.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setKbPane('projects'); setSelectedId(p.id); setCreating(false); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${kbPane === 'projects' && selectedId === p.id && !creating ? 'bg-brand-500/10 text-brand-400' : 'text-gray-400 hover:bg-gray-800'}`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* KB Content */}
            <div className="flex-1 bg-gray-900/50 border border-gray-800/60 rounded-2xl overflow-hidden shadow-xl flex flex-col">
              {kbPane === 'company' ? (
                <>
                  <div className="p-4 border-b border-gray-800/60 flex items-center justify-between bg-gray-900/50">
                    <h2 className="text-md font-semibold text-white">Company Information (JSON)</h2>
                    <button onClick={saveCompany} className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-brand-600 hover:bg-brand-500">
                      Save Profile
                    </button>
                  </div>
                  <div className="flex-1 p-4">
                    <textarea
                      value={companyDraft}
                      onChange={(e) => setCompanyDraft(e.target.value)}
                      className="w-full h-full bg-gray-950 border border-gray-800 rounded-xl p-4 text-sm text-gray-300 font-mono focus:outline-none focus:border-brand-500 custom-scrollbar"
                      spellCheck="false"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="p-4 border-b border-gray-800/60 bg-gray-900/50">
                    <h2 className="text-md font-semibold text-white">
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
                      <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                        Select a project from the left or create a new one.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'conversation' && (
          <div className="max-w-3xl space-y-8">
            <section className="bg-gray-900/50 border border-gray-800/60 rounded-2xl p-6 backdrop-blur-sm shadow-xl">
              <h2 className="text-lg font-semibold text-white mb-2">Introduction Messaging</h2>
              <p className="text-xs text-gray-400 mb-6">Customize the first message the Agent will say when the call connects. Available placeholders: {'{leadName}'}, {'{agentName}'}, {'{companyName}'}.</p>
              
              <textarea
                value={settings.introTemplate}
                onChange={(e) => handleUpdateSetting('introTemplate', e.target.value)}
                rows={4}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl p-4 text-sm text-gray-300 focus:outline-none focus:border-brand-500 custom-scrollbar"
              />
            </section>

            <section className="bg-gray-900/50 border border-gray-800/60 rounded-2xl p-6 backdrop-blur-sm shadow-xl">
              <h2 className="text-lg font-semibold text-white mb-2">Voicemail Drop</h2>
              <p className="text-xs text-gray-400 mb-6">Customize the message the Agent will recite if the call is directed to a voicemail inbox. Available placeholders: {'{leadName}'}, {'{agentName}'}, {'{companyName}'}.</p>
              
              <textarea
                value={settings.voicemailTemplate || 'Hello {leadName}, this is {agentName}. Please call us back at your earliest convenience.'}
                onChange={(e) => handleUpdateSetting('voicemailTemplate', e.target.value)}
                rows={3}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl p-4 text-sm text-gray-300 focus:outline-none focus:border-brand-500 custom-scrollbar"
              />
            </section>

            <section className="bg-gray-900/50 border border-gray-800/60 rounded-2xl p-6 backdrop-blur-sm shadow-xl">
              <h2 className="text-lg font-semibold text-white mb-2">Privacy Consent Messaging</h2>
              <p className="text-xs text-gray-400 mb-6">Enable a message informing the user that the call is being recorded (required in some jurisdictions).</p>
              
              <div className="flex items-start gap-3">
                <input 
                  type="checkbox" 
                  checked={settings.requireConsent || false}
                  onChange={(e) => handleUpdateSetting('requireConsent', e.target.checked)}
                  className="mt-1 bg-gray-900 border-gray-700 rounded text-brand-500 focus:ring-brand-500"
                />
                <div className="flex-1">
                  <textarea
                    value={settings.consentTemplate || 'Before we proceed, please note that this call is recorded for quality purposes.'}
                    onChange={(e) => handleUpdateSetting('consentTemplate', e.target.value)}
                    disabled={!settings.requireConsent}
                    rows={2}
                    className={`w-full bg-gray-950 border border-gray-800 rounded-xl p-4 text-sm focus:outline-none focus:border-brand-500 transition-colors ${!settings.requireConsent ? 'text-gray-600 opacity-50' : 'text-gray-300'}`}
                  />
                </div>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Toasts */}
      <div className="absolute bottom-6 right-6 z-[60] space-y-3 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-xl border shadow-xl flex items-center gap-3 animate-slide-up ${
              toast.tone === 'error' ? 'bg-red-950/90 text-red-200 border-red-800/60' : 'bg-emerald-950/90 text-emerald-200 border-emerald-800/60'
            }`}
          >
            {toast.tone === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabButton({ id, label, icon: Icon, active, onClick }) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex items-center gap-2 pb-4 text-sm font-medium transition-colors border-b-2 ${
        active ? 'text-brand-400 border-brand-400' : 'text-gray-500 border-transparent hover:text-gray-300'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
