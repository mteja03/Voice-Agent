import { useEffect, useState } from 'react';

const OUTCOMES = ['interested', 'follow_up', 'not_interested', 'closed'];
const INTEREST_LEVELS = ['high', 'medium', 'low', 'unknown'];

export default function PostCallDrawer({ isOpen, summary, leadName, onClose, onSave, onSaveAndNext }) {
  const [form, setForm] = useState({
    outcome: 'follow_up',
    interestLevel: 'unknown',
    timeline: '',
    budgetConfirmed: '',
    locationConfirmed: '',
    nextAction: '',
    followupDate: '',
    summaryNote: '',
  });

  useEffect(() => {
    if (!summary) return;
    setForm({
      outcome: summary.outcome || 'follow_up',
      interestLevel: summary.interestLevel || 'unknown',
      timeline: summary.timeline || '',
      budgetConfirmed: summary.budgetConfirmed || '',
      locationConfirmed: summary.locationConfirmed || '',
      nextAction: summary.nextAction || '',
      followupDate: summary.followupDate || '',
      summaryNote: summary.summaryNote || '',
    });
  }, [summary]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-white border-l border-slate-200 flex flex-col shadow-2xl overflow-y-auto dark:bg-gray-900 dark:border-gray-700/50">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-gray-800">
          <p className="text-xs text-slate-500 dark:text-gray-500 uppercase tracking-wider">Post-call review</p>
          <h3 className="text-base text-slate-900 dark:text-white font-semibold mt-1">{leadName || 'Selected lead'}</h3>
        </div>

        <div className="flex-1 px-6 py-5 space-y-4">
          <Field label="Outcome">
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-500/40 dark:focus:border-slate-500"
              value={form.outcome}
              onChange={(e) => setForm((prev) => ({ ...prev, outcome: e.target.value }))}
            >
              {OUTCOMES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>

          <Field label="Interest level">
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-500/40 dark:focus:border-slate-500"
              value={form.interestLevel}
              onChange={(e) => setForm((prev) => ({ ...prev, interestLevel: e.target.value }))}
            >
              {INTEREST_LEVELS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>

          <Field label="Timeline">
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-500/40 dark:focus:border-slate-500"
              value={form.timeline}
              onChange={(e) => setForm((prev) => ({ ...prev, timeline: e.target.value }))}
              placeholder="e.g. this month, 3 months"
            />
          </Field>

          <Field label="Budget confirmed">
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-500/40 dark:focus:border-slate-500"
              value={form.budgetConfirmed}
              onChange={(e) => setForm((prev) => ({ ...prev, budgetConfirmed: e.target.value }))}
              placeholder="e.g. 40L-60L"
            />
          </Field>

          <Field label="Location confirmed">
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-500/40 dark:focus:border-slate-500"
              value={form.locationConfirmed}
              onChange={(e) => setForm((prev) => ({ ...prev, locationConfirmed: e.target.value }))}
              placeholder="e.g. Rajahmundry"
            />
          </Field>

          <Field label="Follow-up date">
            <input
              type="date"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-500/40 dark:focus:border-slate-500"
              value={form.followupDate}
              onChange={(e) => setForm((prev) => ({ ...prev, followupDate: e.target.value }))}
            />
          </Field>

          <Field label="Next action">
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-500/40 dark:focus:border-slate-500"
              value={form.nextAction}
              onChange={(e) => setForm((prev) => ({ ...prev, nextAction: e.target.value }))}
              placeholder="e.g. Site visit follow-up tomorrow"
            />
          </Field>

          <Field label="Summary note">
            <textarea
              className="w-full min-h-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-500/40 dark:focus:border-slate-500"
              value={form.summaryNote}
              onChange={(e) => setForm((prev) => ({ ...prev, summaryNote: e.target.value }))}
            />
          </Field>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-gray-800 flex items-center gap-2">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg ui-muted">Cancel</button>
          <button onClick={() => onSave(form)} className="text-xs px-3 py-1.5 rounded-lg ui-primary">Save</button>
          <button onClick={() => onSaveAndNext(form)} className="text-xs px-3 py-1.5 rounded-lg ui-primary">Save & Next</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-600 dark:text-gray-400 block mb-1">{label}</span>
      {children}
    </label>
  );
}
