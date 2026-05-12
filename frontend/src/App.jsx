import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { login, switchTenant, getAuthUser, clearAuthSession, AUTH_INVALID_EVENT } from './services/auth';
import { listTenants, createTenant } from './services/tenants';
import { fetchAgentConfig, saveAgentConfig } from './services/agentConfigApi';
import { getQuestionnaire } from './services/questionnairesApi';
import { Building2, Loader2, Mic, PhoneCall, Sparkles, ShieldCheck } from 'lucide-react';
import { useVoiceAgent } from './hooks/useVoiceAgent';
import Sidebar from './components/Sidebar';
import Dialer from './components/Dialer';
import ErrorBoundary from './components/ErrorBoundary';
import ThemeToggle from './components/ThemeToggle';
import { Skeleton } from './components/ui/Skeleton';

const DashboardHome = lazy(() => import('./components/DashboardHome'));
const Campaigns = lazy(() => import('./components/Campaigns'));
const AgentConfig = lazy(() => import('./components/AgentConfig'));
const UserManagement = lazy(() => import('./components/UserManagement'));
const QuestionnaireBuilder = lazy(() => import('./components/QuestionnaireBuilder'));

const SESSION_ID = uuidv4();

const APP_TAB_HEADINGS = {
  dashboard: { title: 'Dashboard', subtitle: 'Performance, calls, and outcomes' },
  campaigns: { title: 'Campaigns', subtitle: 'Lead lists and imports' },
  questionnaires: { title: 'Questionnaires', subtitle: 'Build discovery and survey scripts' },
  team: { title: 'Team', subtitle: 'Members and access for this workspace' },
  dialer: { title: 'Dialer', subtitle: 'Voice sessions' },
  'agent-config': { title: 'Agent configuration', subtitle: 'Voice, language, and prompts' },
};

const headerControl =
  'h-9 shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand-400/80 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500';

function TabRouteFallback() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overflow-x-hidden bg-slate-100 px-4 py-6 dark:bg-gray-950 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-9 w-52 max-w-full" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>
        <Skeleton className="h-8 w-28 shrink-0" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-2xl border border-slate-200/90 bg-white/90 p-6 dark:border-gray-800/60 dark:bg-gray-900/50"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-72 w-full max-w-5xl rounded-2xl" />
    </div>
  );
}

const DEFAULT_SETTINGS = {
  agentName: 'Voice Agent',
  sttModel: 'saarika:v2.5',
  ttsProvider: 'sarvam',
  ttsModel: 'bulbul:v3',
  ttsVoice: 'shubh',
  languageMode: 'telugu',
  autoEndCall: true,
  introTemplate: 'హలో {leadName} గారు, నేను {agentName} నుండి మాట్లాడుతున్నాను. మీకు ఇది మాట్లాడటానికి సరైన సమయమా?',
};

const LS_KEYS = {
  settings: 'voice-agent-settings',
  leads: 'voice-agent-leads',
  activeLeadId: 'voice-agent-active-lead-id',
  campaigns: 'voice-agent-campaigns',
  activeCampaignId: 'voice-agent-active-campaign-id',
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
      // Migrate deprecated model names → current supported values
      if (parsed.sttModel === 'saaras:v3' || parsed.sttModel === 'saarika:v2') parsed.sttModel = 'saarika:v2.5';
      if (parsed.ttsModel === 'bulbul:v1' || parsed.ttsModel === 'bulbul:v2') parsed.ttsModel = 'bulbul:v3';
      if (!parsed.agentName) parsed.agentName = 'Voice Agent';
      if (parsed.introTemplate && !parsed.introTemplate.includes('{agentName}')) {
        parsed.introTemplate = parsed.introTemplate.replace('SB Ventures', '{agentName}');
      }
      const validVoices = ['aditya', 'ritu', 'ashutosh', 'priya', 'neha', 'rahul', 'pooja', 'rohan', 'simran', 'kavya', 'amit', 'dev', 'ishita', 'shreya', 'ratan', 'varun', 'manan', 'sumit', 'roopa', 'kabir', 'aayan', 'shubh', 'advait', 'anand', 'tanya', 'tarun', 'sunny', 'mani', 'gokul', 'vijay', 'shruti', 'suhani', 'mohit', 'kavitha', 'rehan', 'soham', 'rupali', 'niharika'];
      if (!validVoices.includes(parsed.ttsVoice)) parsed.ttsVoice = 'shubh';
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
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

/** @returns {{ id: string, name: string, createdAt: string, leads: object[] }[]} */
function loadCampaignsBootstrap() {
  try {
    const raw = localStorage.getItem(LS_KEYS.campaigns);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.map((c) => ({
          id: String(c.id || uuidv4()),
          name: typeof c.name === 'string' && c.name.trim() ? c.name.trim() : 'Campaign',
          createdAt: typeof c.createdAt === 'string' ? c.createdAt : new Date().toISOString(),
          leads: normalizeLeadIds(Array.isArray(c.leads) ? c.leads : []),
          questionnaireId: typeof c.questionnaireId === 'string' ? c.questionnaireId : null,
          questionnaireName: typeof c.questionnaireName === 'string' ? c.questionnaireName : '',
        }));
      }
    }
    const flat =
      localStorage.getItem(LS_KEYS.leads) || localStorage.getItem(LEGACY_LS_KEYS.leads);
    if (flat) {
      const leads = normalizeLeadIds(JSON.parse(flat));
      const id = uuidv4();
      const migrated = [
        {
          id,
          name: 'Imported list',
          createdAt: new Date().toISOString(),
          leads,
          questionnaireId: null,
          questionnaireName: '',
        },
      ];
      try {
        localStorage.setItem(LS_KEYS.campaigns, JSON.stringify(migrated));
        localStorage.removeItem(LS_KEYS.leads);
        localStorage.removeItem(LEGACY_LS_KEYS.leads);
      } catch {
        // ignore
      }
      return migrated;
    }
  } catch {
    // fall through
  }
  const id = uuidv4();
  return [
    {
      id,
      name: 'My first campaign',
      createdAt: new Date().toISOString(),
      leads: [],
      questionnaireId: null,
      questionnaireName: '',
    },
  ];
}

function loadInitialActiveCampaignId(campaigns) {
  try {
    const saved = localStorage.getItem(LS_KEYS.activeCampaignId);
    if (saved && campaigns.some((c) => c.id === saved)) return saved;
  } catch {
    // ignore
  }
  return campaigns[0]?.id || '';
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
  const [tenants, setTenants] = useState([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [tenantActionError, setTenantActionError] = useState('');
  const [newTenantName, setNewTenantName] = useState('');
  const [settingsSaveUi, setSettingsSaveUi] = useState({ status: 'idle', errorMessage: '' });
  const [agentConfigLoadError, setAgentConfigLoadError] = useState('');
  const settingsSaveDebounceRef = useRef(null);
  const settingsSaveSeqRef = useRef(0);

  useEffect(() => {
    const onSessionInvalid = () => {
      setAuthUser(null);
    };
    window.addEventListener(AUTH_INVALID_EVENT, onSessionInvalid);
    return () => window.removeEventListener(AUTH_INVALID_EVENT, onSessionInvalid);
  }, []);

  useEffect(() => {
    // One-time migration from legacy sb-* keys (settings / active lead only; leads live under campaigns).
    try {
      if (!localStorage.getItem(LS_KEYS.settings)) {
        const legacySettings = localStorage.getItem(LEGACY_LS_KEYS.settings);
        if (legacySettings) localStorage.setItem(LS_KEYS.settings, legacySettings);
      }
      if (!localStorage.getItem(LS_KEYS.campaigns) && !localStorage.getItem(LS_KEYS.leads)) {
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

  const initialCampaigns = useMemo(() => loadCampaignsBootstrap(), []);
  const [campaigns, setCampaigns] = useState(() => initialCampaigns);
  const [activeCampaignId, setActiveCampaignId] = useState(() =>
    loadInitialActiveCampaignId(initialCampaigns)
  );

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.campaigns, JSON.stringify(campaigns));
      localStorage.setItem(LS_KEYS.activeCampaignId, activeCampaignId);
    } catch {
      // ignore
    }
  }, [campaigns, activeCampaignId]);

  const activeCampaign = useMemo(() => {
    const c = campaigns.find((x) => x.id === activeCampaignId);
    return c || campaigns[0];
  }, [campaigns, activeCampaignId]);

  const leads = activeCampaign?.leads ?? [];
  const allLeadsFlat = useMemo(() => campaigns.flatMap((c) => c.leads), [campaigns]);

  const [activeLeadId, setActiveLeadId] = useState(loadActiveLeadId);
  const [activeQuestionnaire, setActiveQuestionnaire] = useState(null);

  const activeLead = leads.find((lead) => lead.id === activeLeadId) || null;
  const activeLeadForDialer = useMemo(() => {
    if (!activeLead) return null;
    return {
      ...activeLead,
      questionnaireId: activeCampaign?.questionnaireId || null,
      questionnaireName: activeCampaign?.questionnaireName || '',
      questionnaire: activeQuestionnaire || null,
    };
  }, [activeLead, activeCampaign?.questionnaireId, activeCampaign?.questionnaireName, activeQuestionnaire]);

  const {
    status,
    processingStage,
    socketReady,
    reconnecting,
    reconnectAttempt,
    turns,
    errorMsg,
    closeDetected,
    callNotice,
    lastCallSummary,
    clearSession,
    retryConnection,
    vadLoading,
    vadError,
    isVadListening,
    isPushToTalkMode,
    startVad,
    pauseVad,
    endCall,
    retryIntro,
    startPushToTalk,
    stopPushToTalk,
  } = useVoiceAgent(SESSION_ID, settings, activeLeadForDialer);

  useEffect(() => {
    const questionnaireId = activeCampaign?.questionnaireId;
    if (!questionnaireId) {
      setActiveQuestionnaire(null);
      return;
    }
    let cancelled = false;
    getQuestionnaire(questionnaireId)
      .then((q) => {
        if (!cancelled) setActiveQuestionnaire(q || null);
      })
      .catch(() => {
        if (!cancelled) setActiveQuestionnaire(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCampaign?.questionnaireId, authUser?.activeCompanyId]);

  useEffect(() => {
    if (activeLeadId && !leads.some((l) => l.id === activeLeadId)) {
      clearSession();
      setActiveLeadId(null);
      try {
        localStorage.removeItem(LS_KEYS.activeLeadId);
      } catch {
        // ignore
      }
    }
  }, [leads, activeLeadId, clearSession]);

  useEffect(() => {
    if (!authUser?.isMasterAdmin) {
      setTenants([]);
      return;
    }
    setTenantsLoading(true);
    setTenantActionError('');
    listTenants()
      .then((rows) => setTenants(rows))
      .catch((err) => setTenantActionError(err.message || 'Failed to load organizations'))
      .finally(() => setTenantsLoading(false));
  }, [authUser?.isMasterAdmin]);

  useEffect(() => {
    if (!authUser) return;
    setAgentConfigLoadError('');
    fetchAgentConfig()
      .then((config) => {
        if (config) {
          setSettings((prev) => ({ ...DEFAULT_SETTINGS, ...prev, ...config }));
        }
      })
      .catch((err) => {
        const msg = err.message || 'Failed to load workspace settings';
        setAgentConfigLoadError(msg);
        console.warn('Failed to load agent config:', msg);
      });
  }, [authUser?.activeCompanyId]);

  const canManageUsers = useMemo(
    () => Boolean(authUser?.isMasterAdmin || authUser?.role === 'tenant_admin'),
    [authUser]
  );

  useEffect(() => {
    if (!authUser) return;
    if (activeTab === 'team' && !canManageUsers) setActiveTab('dashboard');
  }, [authUser, activeTab, canManageUsers]);

  const handleTabChange = useCallback((tabId) => {
    setActiveTab(tabId);
  }, []);

  const prefetchTab = useCallback((tabId) => {
    const loaders = {
      dashboard: () => import('./components/DashboardHome'),
      campaigns: () => import('./components/Campaigns'),
      team: () => import('./components/UserManagement'),
      questionnaires: () => import('./components/QuestionnaireBuilder'),
      'agent-config': () => import('./components/AgentConfig'),
    };
    const fn = loaders[tabId];
    if (fn) fn().catch(() => {});
  }, []);

  const handleSettingsChange = useCallback((next) => {
    setSettings(next);
    localStorage.setItem(LS_KEYS.settings, JSON.stringify(next));
    setSettingsSaveUi({ status: 'syncing', errorMessage: '' });
    if (settingsSaveDebounceRef.current) {
      clearTimeout(settingsSaveDebounceRef.current);
    }
    settingsSaveDebounceRef.current = setTimeout(() => {
      const seq = (settingsSaveSeqRef.current += 1);
      saveAgentConfig(next)
        .then(() => {
          if (seq !== settingsSaveSeqRef.current) return;
          setSettingsSaveUi({ status: 'saved', errorMessage: '' });
          setTimeout(() => {
            if (seq === settingsSaveSeqRef.current) {
              setSettingsSaveUi((u) => (u.status === 'saved' ? { status: 'idle', errorMessage: '' } : u));
            }
          }, 2200);
        })
        .catch((err) => {
          if (seq !== settingsSaveSeqRef.current) return;
          const errorMessage =
            err.message ||
            'Could not sync to the server. This device still has your latest edits in local storage.';
          setSettingsSaveUi({ status: 'error', errorMessage });
          console.warn('Failed to save agent config:', errorMessage);
        });
    }, 450);
  }, []);

  const handleLeadsChange = useCallback((nextLeads) => {
    const normalized = normalizeLeadIds(nextLeads);
    setCampaigns((prev) =>
      prev.map((c) => (c.id === activeCampaignId ? { ...c, leads: normalized } : c))
    );
  }, [activeCampaignId]);

  const handleActiveCampaignChange = useCallback(
    (nextId) => {
      if (!nextId || !campaigns.some((c) => c.id === nextId)) return;
      if (nextId === activeCampaignId) return;
      clearSession();
      setActiveLeadId(null);
      try {
        localStorage.removeItem(LS_KEYS.activeLeadId);
      } catch {
        // ignore
      }
      setActiveCampaignId(nextId);
    },
    [campaigns, activeCampaignId, clearSession]
  );

  const handleCreateCampaign = useCallback((name) => {
    const id = uuidv4();
    const trimmed = (name || '').trim();
    setCampaigns((prev) => [
      ...prev,
      {
        id,
        name: trimmed || `Campaign ${prev.length + 1}`,
        createdAt: new Date().toISOString(),
        leads: [],
        questionnaireId: null,
        questionnaireName: '',
      },
    ]);
    setActiveCampaignId(id);
    clearSession();
    setActiveLeadId(null);
    try {
      localStorage.removeItem(LS_KEYS.activeLeadId);
    } catch {
      // ignore
    }
  }, [clearSession]);

  const handleRenameCampaign = useCallback((campaignId, nextName) => {
    const t = (nextName || '').trim();
    if (!t) return;
    setCampaigns((prev) => prev.map((c) => (c.id === campaignId ? { ...c, name: t } : c)));
  }, []);

  const handleSetCampaignQuestionnaire = useCallback((campaignId, questionnaireId, questionnaireName = '') => {
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === campaignId
          ? {
              ...c,
              questionnaireId: questionnaireId || null,
              questionnaireName: questionnaireName || '',
            }
          : c
      )
    );
  }, []);

  const handleDeleteCampaign = useCallback(
    (campaignId) => {
      if (campaigns.length <= 1) return;
      const victim = campaigns.find((c) => c.id === campaignId);
      if (!victim) return;
      if (
        !window.confirm(
          `Delete campaign "${victim.name}" and all of its leads? This cannot be undone.`
        )
      ) {
        return;
      }
      const next = campaigns.filter((c) => c.id !== campaignId);
      setCampaigns(next);
      if (activeCampaignId === campaignId) {
        setActiveCampaignId(next[0].id);
        clearSession();
        setActiveLeadId(null);
        try {
          localStorage.removeItem(LS_KEYS.activeLeadId);
        } catch {
          // ignore
        }
      }
    },
    [campaigns, activeCampaignId, clearSession]
  );

  useEffect(() => {
    if (campaigns.length > 0 && !campaigns.some((c) => c.id === activeCampaignId)) {
      setActiveCampaignId(campaigns[0].id);
    }
  }, [campaigns, activeCampaignId]);

  const handleActiveLeadChange = useCallback((nextLead) => {
    const nextId = nextLead?.id || null;
    setActiveLeadId(nextId);
    clearSession();
    if (nextId) {
      localStorage.setItem(LS_KEYS.activeLeadId, nextId);
    } else {
      localStorage.removeItem(LS_KEYS.activeLeadId);
    }
  }, [clearSession]);

  const handleNextLeadQuick = useCallback(() => {
    if (!activeLead) return;
    const idx = leads.findIndex((lead) => lead.id === activeLead.id);
    const nextLead = leads[idx + 1] || null;
    handleActiveLeadChange(nextLead);
  }, [activeLead, leads, handleActiveLeadChange]);

  const handleAuth = useCallback(async ({ email, password }) => {
    try {
      setAuthError('');
      setAuthLoading(true);
      const result = await login(email, password);
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

  const handleTenantSwitch = useCallback(async (nextCompanyId) => {
    if (!nextCompanyId || nextCompanyId === authUser?.activeCompanyId) return;
    try {
      setTenantActionError('');
      setTenantsLoading(true);
      const result = await switchTenant(nextCompanyId);
      setAuthUser(result.user);
      window.location.reload();
    } catch (err) {
      setTenantActionError(err.message || 'Failed to switch organization');
    } finally {
      setTenantsLoading(false);
    }
  }, [authUser?.activeCompanyId]);

  const handleCreateTenant = useCallback(async () => {
    const name = newTenantName.trim();
    if (!name) return;
    try {
      setTenantActionError('');
      setTenantsLoading(true);
      const tenant = await createTenant(name);
      setTenants((prev) => [tenant, ...prev]);
      setNewTenantName('');
    } catch (err) {
      setTenantActionError(err.message || 'Failed to create organization');
    } finally {
      setTenantsLoading(false);
    }
  }, [newTenantName]);

  if (!authUser) {
    return (
      <AuthScreen loading={authLoading} error={authError} onSubmit={handleAuth} />
    );
  }

  return (
    <div className="motion-safe:transition-colors motion-safe:duration-200 flex h-screen w-full overflow-hidden font-sans antialiased text-slate-900 dark:text-gray-200">
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onTabHover={prefetchTab}
        canManageUsers={canManageUsers}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pr-4 lg:pr-6 py-4 lg:py-6 gap-4 lg:gap-6">
        <header
          className="z-30 surface-card flex h-16 shrink-0 items-center gap-3 px-6 shadow-sm sm:gap-5"
          aria-label="Workspace and account"
        >
          <div className="min-w-0 flex-1 pr-2">
            <p className="truncate text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
              {(APP_TAB_HEADINGS[activeTab] || APP_TAB_HEADINGS.dashboard).title}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-gray-500">
              {(APP_TAB_HEADINGS[activeTab] || APP_TAB_HEADINGS.dashboard).subtitle}
            </p>
          </div>

          <div className="flex min-w-0 shrink-0 items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] motion-safe:scroll-smooth sm:gap-3 md:overflow-visible [&::-webkit-scrollbar]:hidden">
            {authUser?.isMasterAdmin && (
              <div
                className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/95 py-1 pl-2 pr-1.5 dark:border-gray-700/80 dark:bg-gray-900/50 sm:gap-2.5 sm:pl-3"
                role="group"
                aria-label="Workspace"
              >
                <div className="hidden items-center gap-1.5 text-slate-600 dark:text-gray-400 sm:flex" title="Active organization">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-brand-500 dark:text-brand-400" aria-hidden />
                  <span className="max-w-[7rem] truncate text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-gray-400">
                    Workspace
                  </span>
                </div>
                <select
                  className={`${headerControl} w-[min(200px,42vw)] min-w-[8.5rem] max-w-[220px] sm:w-44`}
                  value={authUser.activeCompanyId || ''}
                  onChange={(e) => handleTenantSwitch(e.target.value)}
                  disabled={tenantsLoading}
                  aria-busy={tenantsLoading}
                  aria-label="Switch organization"
                  title="Switch organization"
                >
                  <option value="" disabled>
                    {tenantsLoading ? 'Loading…' : 'Select organization'}
                  </option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </select>
                <input
                  value={newTenantName}
                  onChange={(e) => setNewTenantName(e.target.value)}
                  placeholder="New org"
                  className={`${headerControl} w-[5.5rem] min-w-0 sm:w-32 md:w-36`}
                  aria-label="New organization name"
                />
                <button
                  type="button"
                  onClick={handleCreateTenant}
                  disabled={tenantsLoading || !newTenantName.trim()}
                  className="h-9 shrink-0 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-500 disabled:pointer-events-none disabled:opacity-45 dark:shadow-brand-900/20"
                >
                  Create
                </button>
              </div>
            )}

            {authUser?.isMasterAdmin && tenantsLoading && (
              <span
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2 py-1 text-[11px] text-slate-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                aria-live="polite"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500" aria-hidden />
                <span className="hidden sm:inline">Working…</span>
              </span>
            )}

            {authUser?.isMasterAdmin && (
              <span className="hidden h-7 w-px shrink-0 bg-slate-200 dark:bg-gray-700 sm:block" aria-hidden />
            )}

            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden rounded-md bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-700/10 dark:bg-brand-500/10 dark:text-brand-400 dark:ring-brand-500/20 sm:flex items-center gap-1.5 shadow-sm max-w-[12rem]">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {tenants.find(t => t.id === authUser?.activeCompanyId)?.name || authUser?.companyName || 'Workspace'}
                </span>
              </span>
              <ThemeToggle />
              <button
                type="button"
                onClick={handleLogout}
                className="h-9 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Logout
              </button>
            </div>
          </div>
        </header>
        {tenantActionError && (
          <div className="flex-shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
            {tenantActionError}
          </div>
        )}

        <main className="relative surface-card flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden [&>*]:min-h-0">
          <Suspense fallback={<TabRouteFallback />}>
            {activeTab === 'dashboard' && (
              <DashboardHome
                leads={allLeadsFlat}
                activeCampaignName={activeCampaign?.name}
                onNavigateCampaigns={() => setActiveTab('campaigns')}
                onNavigateDialer={() => setActiveTab('dialer')}
              />
            )}
            {activeTab === 'questionnaires' && (
              <QuestionnaireBuilder activeCompanyId={authUser?.activeCompanyId} />
            )}
            {activeTab === 'campaigns' && (
              <Campaigns
                campaigns={campaigns}
                activeCampaignId={activeCampaignId}
                onActiveCampaignChange={handleActiveCampaignChange}
                onCreateCampaign={handleCreateCampaign}
                onRenameCampaign={handleRenameCampaign}
                onDeleteCampaign={handleDeleteCampaign}
                onSetCampaignQuestionnaire={handleSetCampaignQuestionnaire}
                leads={leads}
                activeLead={activeLead}
                onLeadsChange={handleLeadsChange}
                onActiveLeadChange={handleActiveLeadChange}
                onNavigateToDialer={() => setActiveTab('dialer')}
              />
            )}
            {activeTab === 'team' && canManageUsers && (
              <UserManagement
                activeCompanyId={authUser?.activeCompanyId}
                tenants={tenants}
                isMasterAdmin={Boolean(authUser?.isMasterAdmin)}
                tenantsLoading={tenantsLoading}
              />
            )}
            {activeTab === 'dialer' && (
              <ErrorBoundary label="Dialer">
                <Dialer
                  status={status}
                  processingStage={processingStage}
                  socketReady={socketReady}
                  reconnecting={reconnecting}
                  reconnectAttempt={reconnectAttempt}
                  turns={turns}
                  errorMsg={errorMsg}
                  closeDetected={closeDetected}
                  vadLoading={vadLoading}
                  vadError={vadError}
                  isVadListening={isVadListening}
                  isPushToTalkMode={isPushToTalkMode}
                  startVad={startVad}
                  pauseVad={pauseVad}
                  endCall={endCall}
                  retryIntro={retryIntro}
                  activeLead={activeLeadForDialer}
                  leads={leads}
                  handleNextLeadQuick={handleNextLeadQuick}
                  settings={settings}
                  summaryNote={callNotice}
                  lastCallSummary={lastCallSummary}
                  onRetryConnection={retryConnection}
                  onOpenCampaigns={() => setActiveTab('campaigns')}
                  startPushToTalk={startPushToTalk}
                  stopPushToTalk={stopPushToTalk}
                />
              </ErrorBoundary>
            )}
            {activeTab === 'agent-config' && (
              <AgentConfig
                settings={settings}
                onSettingsChange={handleSettingsChange}
                settingsSaveUi={settingsSaveUi}
                agentConfigLoadError={agentConfigLoadError}
              />
            )}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function AuthScreen({ onSubmit, loading, error }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const inputClass =
    'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-600';

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 font-sans text-slate-900 dark:bg-black dark:text-gray-200">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(195,70,239,0.22),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(195,70,239,0.18),transparent)]" />
      <div className="pointer-events-none absolute top-1/4 left-0 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-brand-500/15 blur-3xl dark:bg-brand-500/10" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[380px] w-[380px] translate-x-1/3 rounded-full bg-indigo-500/15 blur-3xl dark:bg-indigo-500/10" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col lg:flex-row lg:items-stretch">
        {/* Landing hero */}
        <section className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Voice Agent
          </div>
          <h1 className="mt-6 max-w-xl text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
            AI voice outreach that sounds natural
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-600 dark:text-gray-400 sm:text-lg">
            Run outbound campaigns, manage leads, and measure outcomes—all from one workspace built for real phone conversations.
          </p>
          <ul className="mt-10 max-w-md space-y-4 text-sm text-slate-700 dark:text-gray-300">
            <li className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                <Mic className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="font-semibold text-slate-900 dark:text-white">Speech-to-text &amp; voice replies</span>
                <span className="mt-0.5 block text-slate-600 dark:text-gray-500">
                  Natural flow with interrupt-friendly playback and session-aware turns.
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-600 dark:bg-indigo-400/90 dark:text-indigo-200">
                <PhoneCall className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="font-semibold text-slate-900 dark:text-white">Campaigns &amp; dialer in one place</span>
                <span className="mt-0.5 block text-slate-600 dark:text-gray-500">
                  Import leads, pick who to call next, and stay in rhythm with your list.
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/80 dark:text-emerald-100">
                <ShieldCheck className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="font-semibold text-slate-900 dark:text-white">Workspace sign-in</span>
                <span className="mt-0.5 block text-slate-600 dark:text-gray-500">
                  Access is limited to invited team accounts—sign in with your organization credentials.
                </span>
              </span>
            </li>
          </ul>
        </section>

        {/* Login panel */}
        <section className="flex flex-1 flex-col justify-center px-4 pb-14 pt-4 sm:px-8 lg:max-w-[480px] lg:border-l lg:border-slate-200/80 lg:pb-16 lg:pt-12 xl:max-w-[520px] dark:lg:border-gray-800/80">
          <div className="surface-card mx-auto w-full max-w-md rounded-3xl p-8 shadow-xl shadow-slate-900/5 dark:shadow-black/40">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                  Voice Agent Login
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-gray-400">
                  Sign in to your tenant workspace
                </p>
              </div>
              <ThemeToggle />
            </div>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                onSubmit({ email, password });
              }}
            >
              <div>
                <label htmlFor="auth-email" className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-gray-400">
                  Email
                </label>
                <input
                  id="auth-email"
                  className={inputClass}
                  placeholder="you@company.com"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="auth-password" className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-gray-400">
                  Password
                </label>
                <input
                  id="auth-password"
                  className={inputClass}
                  placeholder="Password (min 6 chars)"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </p>
              )}
              <button
                disabled={loading}
                className="flex h-12 w-full items-center justify-center rounded-xl bg-brand-600 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-colors hover:bg-brand-500 disabled:opacity-60 motion-safe:transition-colors dark:shadow-brand-900/30"
                type="submit"
              >
                {loading ? 'Signing in…' : 'Login'}
              </button>
            </form>
            <p className="mt-6 text-center text-xs leading-relaxed text-slate-500 dark:text-gray-500">
              Need an account? Contact your workspace administrator—public registration is not available from this screen.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
