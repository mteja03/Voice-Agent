import { LayoutDashboard, Users, BookOpen, Settings, Phone } from 'lucide-react';

export default function Sidebar({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'campaigns', label: 'Campaigns', icon: Users },
    { id: 'dialer', label: 'Dialer', icon: Phone },
    { id: 'agent-config', label: 'Agent Config', icon: Settings },
  ];

  return (
    <aside className="w-64 flex-shrink-0 bg-gray-900/50 backdrop-blur-xl border-r border-gray-800/60 flex flex-col h-full sticky top-0">
      {/* Brand */}
      <div className="h-16 flex items-center px-6 border-b border-gray-800/60">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-500/20 mr-3">
          <span className="text-white font-bold text-sm tracking-tight">VA</span>
        </div>
        <div>
          <h1 className="text-white font-semibold text-sm leading-none">Voice Agent</h1>
          <p className="text-brand-400/80 text-[10px] mt-0.5 uppercase tracking-widest font-medium">AI Agent</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto custom-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                isActive
                  ? 'bg-brand-500/10 text-brand-400'
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
              }`}
            >
              <Icon
                className={`w-5 h-5 mr-3 transition-colors ${
                  isActive ? 'text-brand-400' : 'text-gray-500 group-hover:text-gray-400'
                }`}
                strokeWidth={isActive ? 2.5 : 2}
              />
              {tab.label}
            </button>
          );
        })}
      </nav>

    </aside>
  );
}
