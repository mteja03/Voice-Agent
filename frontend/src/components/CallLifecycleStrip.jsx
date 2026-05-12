import { Wifi, WifiOff, Mic, Brain, Volume2, UserCircle } from 'lucide-react';

const STEPS = [
  { id: 'backend', label: 'Backend', Icon: Wifi },
  { id: 'mic', label: 'Your mic', Icon: Mic },
  { id: 'agent', label: 'Agent', Icon: Brain },
  { id: 'playback', label: 'Playback', Icon: Volume2 },
  { id: 'you', label: 'You speak', Icon: UserCircle },
];

export default function CallLifecycleStrip({ socketReady, vadLoading, status, hasLead, hasTurns }) {
  const backendOk = socketReady;
  const micWarm = !vadLoading;
  const sessionActive = hasLead && status !== 'idle';

  const stepState = (id) => {
    if (id === 'backend') {
      return backendOk ? 'done' : 'active';
    }
    if (id === 'mic') {
      if (!backendOk) return 'idle';
      if (!micWarm) return 'active';
      return sessionActive ? 'done' : 'idle';
    }
    if (id === 'agent') {
      if (!sessionActive) return 'idle';
      if (status === 'processing') return 'active';
      return 'idle';
    }
    if (id === 'playback') {
      if (!sessionActive) return 'idle';
      if (status === 'speaking') return 'active';
      if (status === 'listening') return 'done';
      return 'idle';
    }
    if (id === 'you') {
      if (!sessionActive) return 'idle';
      if (status === 'listening') return 'active';
      // Only mark "done" if the user has actually spoken at least once
      if ((status === 'processing' || status === 'speaking') && hasTurns) return 'done';
      return 'idle';
    }
    return 'idle';
  };

  return (
    <div
      className="flex-shrink-0 rounded-xl border border-slate-200/90 bg-slate-50/90 dark:border-gray-800/70 dark:bg-gray-900/40 px-3 py-2.5 sm:px-4"
      aria-label="Call connection lifecycle"
    >
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-0 sm:justify-between">
        {STEPS.map((step, idx) => {
          const state = stepState(step.id);
          const Icon = step.id === 'backend' && !backendOk ? WifiOff : step.Icon;
          const active = state === 'active';
          const done = state === 'done';
          return (
            <div key={step.id} className="flex items-center gap-1.5 sm:gap-2">
              {idx > 0 && (
                <span className="hidden sm:inline text-slate-400 dark:text-gray-700 text-[10px] px-0.5 select-none" aria-hidden>
                  →
                </span>
              )}
              <div
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] sm:text-[11px] font-medium border transition-colors ${
                  active
                    ? 'border-brand-500/50 bg-brand-500/15 text-brand-800 dark:text-brand-200'
                    : done
                      ? 'border-emerald-300/60 bg-emerald-50/90 text-emerald-900 dark:border-emerald-800/40 dark:bg-emerald-950/25 dark:text-emerald-200/90'
                      : 'border-slate-200/90 bg-white/80 text-slate-500 dark:border-gray-800/80 dark:bg-gray-950/50 dark:text-gray-500'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-brand-600 dark:text-brand-300' : done ? 'text-emerald-600 dark:text-emerald-400/90' : ''}`} aria-hidden />
                <span className="whitespace-nowrap">{step.label}</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-slate-600 dark:text-gray-500 leading-snug">
        {!backendOk && 'Waiting for a live socket to the server…'}
        {backendOk && vadLoading && 'Loading voice-activity model in the browser…'}
        {backendOk && !vadLoading && !hasLead && 'Pick a lead to light up the rest of the flow.'}
        {backendOk && !vadLoading && hasLead && status === 'idle' && 'Tap Start to open the mic and play the intro.'}
        {backendOk && !vadLoading && hasLead && status === 'processing' && 'Transcribing or generating a reply…'}
        {backendOk && !vadLoading && hasLead && status === 'speaking' && 'Assistant audio is playing.'}
        {backendOk && !vadLoading && hasLead && status === 'listening' && 'Listening for your reply.'}
      </p>
    </div>
  );
}
