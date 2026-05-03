import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useVoiceAgent } from './hooks/useVoiceAgent';
import Sidebar from './components/Sidebar';
import DashboardHome from './components/DashboardHome';
import Campaigns from './components/Campaigns';
import Dialer from './components/Dialer';
import AgentConfig from './components/AgentConfig';
import { login, register, getAuthUser, clearAuthSession, AUTH_INVALID_EVENT } from './services/auth';

const SESSION_ID = uuidv4();

const DEFAULT_SETTINGS = {
  agentName: 'Voice Agent',
  sttModel: 'saaras:v3',
  ttsProvider: 'sarvam',
  ttsModel: 'bulbul:v3',
  ttsVoice: 'aditya',
  languageMode: 'telugu',
  autoEndCall: true,
  introTemplate: 'హలో {leadName} గారు, నేను {agentName} నుండి మాట్లాడుతున్నాను. మీకు ఇది మాట్లాడటానికి సరైన సమయమా?',
};

const LS_KEYS = {
  settings: 'voice-agent-settings',
  leads: 'voice-agent-leads',
  activeLeadId: 'voice-agent-active-lead-id',
};

const LEGACY_LS_KEYS = {
  settings: 'sb-voice-settings',
  leads: 'sb-leads',
  activeLeadId: 'sb-active-lead-id',
};

function loadSettings() {
  try {
    const saved = localStorage.getItem(LS_KEYS.settings)
      || localStorage.getItem(LEGACY_LS_KEYS.settings);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.sttModel === 'saarika:v2.5') parsed.sttModel = 'saaras:v3';
      if (parsed.ttsModel === 'bulbul:v2') parsed.ttsModel = 'bulbul:v3';
      if (!parsed.agentName) parsed.agentName = 'Voice Agent';
      if (parsed.introTemplate && !parsed.introTemplate.includes('{agentName}')) {
        parsed.introTemplate = parsed.introTemplate.replace('SB Ventures', '{agentName}');
      }
      const validVoices = ['aditya', 'ritu', 'ashutosh', 'priya', 'neha', 'rahul', 'pooja', 'rohan', 'simran', 'kavya', 'amit', 'dev', 'ishita', 'shreya', 'ratan', 'varun', 'manan', 'sumit', 'roopa', 'kabir', 'aayan', 'shubh', 'advait', 'anand', 'tanya', 'tarun', 'sunny', 'mani', 'gokul', 'vijay', 'shruti', 'suhani', 'mohit', 'kavitha', 'rehan', 'soham', 'rupali', 'niharika'];
      if (!validVoices.includes(parsed.ttsVoice)) parsed.ttsVoice = 'aditya';
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadLeads() {
  try {
    const saved = localStorage.getItem(LS_KEYS.leads)
      || localStorage.getItem(LEGACY_LS_KEYS.leads);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return normalizeLeadIds(parsed);
  } catch {
    return [];
  }
}

function loadActiveLeadId() {
  try {
    return localStorage.getItem(LS_KEYS.activeLeadId)
      || localStorage.getItem(LEGACY_LS_KEYS.activeLeadId);
  } catch {
    return null;
  }
}

function normalizeLeadIds(leads) {
  if (!Array.isArray(leads)) return [];
  const seen = new Set();
  return leads.map((lead, idx) => {
    const baseId = lead?.id || `${lead?.phone || 'lead'}-${idx}`;
    let nextId = baseId;
    let dup = 1;
    while (seen.has(nextId)) {
      nextId = `${baseId}-${dup}`;
      dup += 1;
    }
    seen.add(nextId);
    return { ...lead, id: nextId };
  });
}

export default function App() {
  const [authUser, setAuthUser] = useState(getAuthUser);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [settings, setSettings] = useState(loadSettings);
  const [leads, setLeads] = useState(loadLeads);
  const [activeLeadId, setActiveLeadId] = useState(loadActiveLeadId);
  const [summaryNote, setSummaryNote] = useState('');

  useEffect(() => {
    const onSessionInvalid = () => {
      setAuthUser(null);
    };
    window.addEventListener(AUTH_INVALID_EVENT, onSessionInvalid);
    return () => window.removeEventListener(AUTH_INVALID_EVENT, onSessionInvalid);
  }, []);

  useEffect(() => {
    // One-time migration from legacy sb-* keys.
    try {
      if (!localStorage.getItem(LS_KEYS.settings)) {
        const legacySettings = localStorage.getItem(LEGACY_LS_KEYS.settings);
        if (legacySettings) localStorage.setItem(LS_KEYS.settings, legacySettings);
      }
      if (!localStorage.getItem(LS_KEYS.leads)) {
        const legacyLeads = localStorage.getItem(LEGACY_LS_KEYS.leads);
        if (legacyLeads) localStorage.setItem(LS_KEYS.leads, legacyLeads);
      }
      if (!localStorage.getItem(LS_KEYS.activeLeadId)) {
        const legacyActiveLeadId = localStorage.getItem(LEGACY_LS_KEYS.activeLeadId);
        if (legacyActiveLeadId) localStorage.setItem(LS_KEYS.activeLeadId, legacyActiveLeadId);
      }
    } catch {
      // Ignore storage errors (private mode, blocked storage, etc.)
    }
  }, []);
  
  const activeLead = leads.find((lead) => lead.id === activeLeadId) || null;

  const { status, turns, errorMsg, closeDetected, callNotice, clearSession, vadLoading, vadError, isVadListening, startVad, pauseVad, endCall, retryIntro } =
    useVoiceAgent(SESSION_ID, settings, activeLead);

  const handleTabChange = useCallback((tabId) => {
    setActiveTab(tabId);
  }, []);

  const handleSettingsChange = useCallback((next) => {
    setSettings(next);
    localStorage.setItem(LS_KEYS.settings, JSON.stringify(next));
  }, []);

  const handleLeadsChange = useCallback((nextLeads) => {
    const normalized = normalizeLeadIds(nextLeads);
    setLeads(normalized);
    localStorage.setItem(LS_KEYS.leads, JSON.stringify(normalized));
  }, []);

  const handleActiveLeadChange = useCallback((nextLead) => {
    const nextId = nextLead?.id || null;
    setActiveLeadId(nextId);
    if (nextId) {
      localStorage.setItem(LS_KEYS.activeLeadId, nextId);
    } else {
      localStorage.removeItem(LS_KEYS.activeLeadId);
    }
  }, []);

  const handleNextLeadQuick = useCallback(() => {
    if (!activeLead) return;
    const idx = leads.findIndex((lead) => lead.id === activeLead.id);
    const nextLead = leads[idx + 1] || null;
    handleActiveLeadChange(nextLead);
  }, [activeLead, leads, handleActiveLeadChange]);

  const handleAuth = useCallback(async ({ mode, email, password, companyName }) => {
    try {
      setAuthError('');
      setAuthLoading(true);
      const result = mode === 'register'
        ? await register(email, password, companyName)
        : await login(email, password);
      setAuthUser(result.user);
      window.location.reload();
    } catch (err) {
      setAuthError(err.message || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const handleLogout = useCallback(() => {
    clearAuthSession();
    setAuthUser(null);
    window.location.reload();
  }, []);

  if (!authUser) {
    return (
      <AuthScreen loading={authLoading} error={authError} onSubmit={handleAuth} />
    );
  }

  return (
    <div className="flex h-screen w-full bg-black overflow-hidden font-sans antialiased text-gray-200">
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />

      <main className="flex-1 relative flex flex-col min-w-0 overflow-hidden">
        {activeTab === 'dashboard' && <DashboardHome leads={leads} />}
        {activeTab === 'campaigns' && (
          <Campaigns 
            leads={leads} 
            activeLead={activeLead} 
            onLeadsChange={handleLeadsChange} 
            onActiveLeadChange={handleActiveLeadChange}
            onNavigateToDialer={() => setActiveTab('dialer')}
          />
        )}
        {activeTab === 'dialer' && (
          <Dialer
            status={status}
            turns={turns}
            errorMsg={errorMsg}
            closeDetected={closeDetected}
            vadLoading={vadLoading}
            vadError={vadError}
            isVadListening={isVadListening}
            startVad={startVad}
            pauseVad={pauseVad}
            endCall={endCall}
            retryIntro={retryIntro}
            activeLead={activeLead}
            leads={leads}
            handleNextLeadQuick={handleNextLeadQuick}
            settings={settings}
            summaryNote={callNotice || summaryNote}
          />
        )}
        {activeTab === 'agent-config' && (
          <AgentConfig 
            settings={settings} 
            onSettingsChange={handleSettingsChange} 
          />
        )}
      </main>
      <button
        onClick={handleLogout}
        className="absolute top-3 right-3 text-xs px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700"
      >
        Logout
      </button>

    </div>
  );
}

function AuthScreen({ onSubmit, loading, error }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('Voice Agent Company');

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl">
        <h1 className="text-2xl font-semibold text-white mb-1">Voice Agent Login</h1>
        <p className="text-sm text-gray-400 mb-6">
          {mode === 'register' ? 'Create your tenant account' : 'Sign in to your tenant workspace'}
        </p>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ mode, email, password, companyName });
          }}
        >
          <input
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
            placeholder="Password (min 6 chars)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
          {mode === 'register' && (
            <input
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              placeholder="Company Name"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            disabled={loading}
            className="w-full bg-brand-500 hover:bg-brand-400 text-black font-medium rounded-lg py-2 disabled:opacity-60"
            type="submit"
          >
            {loading ? 'Please wait...' : mode === 'register' ? 'Register' : 'Login'}
          </button>
        </form>
        <button
          className="mt-4 text-sm text-gray-400 hover:text-gray-200"
          onClick={() => setMode((m) => (m === 'login' ? 'register' : 'login'))}
        >
          {mode === 'login' ? 'New tenant? Register' : 'Have an account? Login'}
        </button>
      </div>
    </div>
  );
}
