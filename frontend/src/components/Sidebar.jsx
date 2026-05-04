import { LayoutDashboard, Users, Settings, Phone } from 'lucide-react';

export default function Sidebar({ activeTab, onTabChange, onTabHover }) {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'campaigns', label: 'Campaigns', icon: Users },
    { id: 'dialer', label: 'Dialer', icon: Phone },
    { id: 'agent-config', label: 'Agent Config', icon: Settings },
  ];

  return (
    <aside className="sticky top-0 flex h-full w-64 shrink-0 flex-col border-r border-slate-200/90 bg-white/80 backdrop-blur-xl dark:border-gray-800/60 dark:bg-gray-900/50">
      <div className="flex h-16 shrink-0 items-center border-b border-slate-200/90 px-5 dark:border-gray-800/60 sm:px-6">
        <div className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-md shadow-brand-500/25">
          <span className="text-xs font-bold tracking-tight text-white">VA</span>
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold leading-tight text-slate-900 dark:text-white">Voice Agent</h1>
          <p className="mt-0.5 text-[10px] font-semibold uppercase leading-none tracking-widest text-brand-600 dark:text-brand-400/90">
            AI Agent
          </p>
        </div>
      </div>

      <nav className="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-6">
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
              className={`group flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-medium motion-safe:transition-all motion-safe:duration-200 ${
                isActive
                  ? 'bg-brand-500/15 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200'
              }`}
            >
              <Icon
                className={`mr-3 h-5 w-5 transition-colors ${
                  isActive
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-slate-400 group-hover:text-slate-600 dark:text-gray-500 dark:group-hover:text-gray-400'
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
