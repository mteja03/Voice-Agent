import { LayoutDashboard, Megaphone, Settings, Phone, UserCog, ClipboardList } from 'lucide-react';

export default function Sidebar({ activeTab, onTabChange, onTabHover, canManageUsers }) {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
    { id: 'questionnaires', label: 'Questionnaires', icon: ClipboardList },
    ...(canManageUsers ? [{ id: 'team', label: 'Team', icon: UserCog }] : []),
    { id: 'dialer', label: 'Dialer', icon: Phone },
    { id: 'agent-config', label: 'Agent Config', icon: Settings },
  ];

  return (
    <aside className="sticky top-0 flex h-screen w-72 shrink-0 flex-col p-4 lg:p-6 z-20">
      <div className="surface-card flex h-full w-full flex-col overflow-hidden !rounded-[2rem] border border-white/60 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)]">
        <div className="flex h-24 shrink-0 items-center px-6 relative overflow-hidden border-b border-slate-200/50 dark:border-white/5">
          {/* Subtle gradient glow behind logo */}
          <div className="absolute -left-10 -top-10 h-32 w-32 rounded-full bg-brand-500/20 blur-2xl" />
          
          <div className="mr-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-600 shadow-lg shadow-brand-500/30 relative z-10 border border-white/20">
            <span className="text-sm font-bold tracking-tight text-white">VA</span>
          </div>
          <div className="min-w-0 relative z-10">
            <h1 className="truncate text-base font-semibold leading-tight text-slate-900 dark:text-white">Voice Agent</h1>
            <p className="mt-0.5 text-[10px] font-bold uppercase leading-none tracking-widest text-brand-600 dark:text-brand-400">
              AI Assistant
            </p>
          </div>
        </div>

        <nav className="custom-scrollbar flex-1 space-y-2 overflow-y-auto px-4 py-6 relative z-10">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                onMouseEnter={() => onTabHover?.(tab.id)}
                onFocus={() => onTabHover?.(tab.id)}
                className={`group relative flex w-full items-center rounded-2xl px-4 py-3.5 text-sm font-semibold transition-all duration-300 outline-none ${
                  isActive
                    ? 'text-white shadow-md hover:-translate-y-0.5'
                    : 'text-slate-600 hover:bg-slate-100/50 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-gray-800/30 dark:hover:text-gray-200'
                }`}
              >
                {isActive && (
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-brand-500 to-indigo-500 opacity-90 shadow-lg shadow-brand-500/25 border border-white/20" />
                )}
                
                <Icon
                  className={`mr-3 h-5 w-5 transition-colors relative z-10 ${
                    isActive
                      ? 'text-white'
                      : 'text-slate-400 group-hover:text-brand-500 dark:text-gray-500 dark:group-hover:text-brand-400'
                  }`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span className="relative z-10">{tab.label}</span>
                
                {isActive && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
