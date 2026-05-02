import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useVoiceAgent } from './hooks/useVoiceAgent';
import Sidebar from './components/Sidebar';
import DashboardHome from './components/DashboardHome';
import Campaigns from './components/Campaigns';
import Dialer from './components/Dialer';
import AgentConfig from './components/AgentConfig';

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

function loadSettings() {
  try {
    const saved = localStorage.getItem('sb-voice-settings');
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
    const saved = localStorage.getItem('sb-leads');
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return normalizeLeadIds(parsed);
  } catch {
    return [];
  }
}

function loadActiveLeadId() {
  try {
    return localStorage.getItem('sb-active-lead-id');
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
  const [activeTab, setActiveTab] = useState('dashboard');
  const [settings, setSettings] = useState(loadSettings);
  const [leads, setLeads] = useState(loadLeads);
  const [activeLeadId, setActiveLeadId] = useState(loadActiveLeadId);
  const [summaryNote, setSummaryNote] = useState('');
  
  const activeLead = leads.find((lead) => lead.id === activeLeadId) || null;

  const { status, turns, errorMsg, closeDetected, callNotice, clearSession, vadLoading, vadError, isVadListening, startVad, pauseVad, endCall, retryIntro } =
    useVoiceAgent(SESSION_ID, settings, activeLead);

  const handleTabChange = useCallback((tabId) => {
    setActiveTab(tabId);
  }, []);

  const handleSettingsChange = useCallback((next) => {
    setSettings(next);
    localStorage.setItem('sb-voice-settings', JSON.stringify(next));
  }, []);

  const handleLeadsChange = useCallback((nextLeads) => {
    const normalized = normalizeLeadIds(nextLeads);
    setLeads(normalized);
    localStorage.setItem('sb-leads', JSON.stringify(normalized));
  }, []);

  const handleActiveLeadChange = useCallback((nextLead) => {
    const nextId = nextLead?.id || null;
    setActiveLeadId(nextId);
    if (nextId) {
      localStorage.setItem('sb-active-lead-id', nextId);
    } else {
      localStorage.removeItem('sb-active-lead-id');
    }
  }, []);

  const handleNextLeadQuick = useCallback(() => {
    if (!activeLead) return;
    const idx = leads.findIndex((lead) => lead.id === activeLead.id);
    const nextLead = leads[idx + 1] || null;
    handleActiveLeadChange(nextLead);
  }, [activeLead, leads, handleActiveLeadChange]);

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

    </div>
  );
}
