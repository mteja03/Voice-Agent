import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

const EMPTY_PROJECT = {
  name: '',
  nameTeluguHint: '',
  type: '',
  location: '',
  locationTeluguHint: '',
  description: '',
  highlights: '',
  offer: '',
  amenitiesText: '',
  keywordsText: '',
  url: '',
  siteVisitAvailable: true,
};

const inputCls =
  'w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand-500 dark:bg-gray-950 dark:border-gray-800 dark:text-white dark:placeholder:text-gray-500 transition-colors';

const textareaCls =
  'w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand-500 dark:bg-gray-950 dark:border-gray-800 dark:text-white dark:placeholder:text-gray-500 transition-colors resize-none';

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
function Field({ label, hint, required, error, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-600 dark:text-gray-400 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{error}</p>}
      {!error && hint && <p className="text-xs text-slate-500 dark:text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

// ─── Char counter ─────────────────────────────────────────────────────────────
function CharCount({ value, max }) {
  const len = (value || '').length;
  const warn = len > max * 0.85;
  return (
    <div className="flex justify-end mt-1">
      <span className={`text-xs ${warn ? 'text-amber-500 dark:text-amber-400 font-medium' : 'text-slate-400 dark:text-gray-600'}`}>
        {len} / {max}
      </span>
    </div>
  );
}

// ─── Main form ────────────────────────────────────────────────────────────────
export default function KnowledgeBaseProjectForm({
  initialProject,
  onCancel,
  onSubmit,
  submitLabel = 'Save',
  formId = 'kb-project-form',
}) {
  const seed = useMemo(() => {
    if (!initialProject) return EMPTY_PROJECT;
    return {
      ...EMPTY_PROJECT,
      ...initialProject,
      amenitiesText: (initialProject.amenities || []).join(', '),
      keywordsText: (initialProject.keywords || []).join(', '),
    };
  }, [initialProject]);

  const [form, setForm] = useState(seed);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setForm(seed);
    setErrors({});
  }, [seed]);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!String(form.name || '').trim())        errs.name = 'Project name is required';
    if (!String(form.type || '').trim())        errs.type = 'Project type is required';
    if (!String(form.location || '').trim())    errs.location = 'Location is required';
    if (!String(form.description || '').trim()) errs.description = 'Description is required';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    onSubmit({
      ...form,
      amenities: form.amenitiesText.split(',').map(v => v.trim()).filter(Boolean),
      keywords:  form.keywordsText.split(',').map(v => v.trim()).filter(Boolean),
    });
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-5">

      {/* Identity */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-500 mb-3">Project Identity</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Project Name" required error={errors.name}>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Sunrise Valley Phase 2"
              className={`${inputCls} ${errors.name ? 'border-red-400 dark:border-red-600' : ''}`}
            />
          </Field>
          <Field label="Telugu Name Hint" hint="How the agent pronounces the name in Telugu.">
            <input value={form.nameTeluguHint} onChange={e => set('nameTeluguHint', e.target.value)} placeholder="Optional Telugu transliteration" className={inputCls} />
          </Field>
          <Field label="Project Type" required error={errors.type}>
            <input
              value={form.type}
              onChange={e => set('type', e.target.value)}
              placeholder="e.g. Plots, Villas, Apartments"
              className={`${inputCls} ${errors.type ? 'border-red-400 dark:border-red-600' : ''}`}
            />
          </Field>
          <Field label="Location" required error={errors.location}>
            <input
              value={form.location}
              onChange={e => set('location', e.target.value)}
              placeholder="e.g. Shamshabad, Hyderabad"
              className={`${inputCls} ${errors.location ? 'border-red-400 dark:border-red-600' : ''}`}
            />
          </Field>
          <Field label="Location Telugu Hint" hint="How the agent pronounces the location in Telugu.">
            <input value={form.locationTeluguHint} onChange={e => set('locationTeluguHint', e.target.value)} placeholder="Optional Telugu transliteration" className={inputCls} />
          </Field>
          <Field label="Website URL">
            <input value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://project-website.com" className={inputCls} />
          </Field>
        </div>
      </div>

      {/* Content */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-500 mb-3">Content</h3>
        <div className="space-y-4">
          <Field label="Description" required error={errors.description} hint="What the agent says to describe this project.">
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={4}
              maxLength={1200}
              placeholder="Describe the project — location advantages, size, pricing, delivery timeline…"
              className={`${textareaCls} ${errors.description ? 'border-red-400 dark:border-red-600' : ''}`}
            />
            <CharCount value={form.description} max={1200} />
          </Field>
          <Field label="Key Highlights" hint="Bullet-point talking points the agent can emphasise.">
            <textarea
              value={form.highlights}
              onChange={e => set('highlights', e.target.value)}
              rows={3}
              maxLength={800}
              placeholder="e.g. HMDA approved · Gated community · 30 min from airport…"
              className={textareaCls}
            />
            <CharCount value={form.highlights} max={800} />
          </Field>
          <Field label="Current Offer / Promotion" hint="Limited-time deals or price discounts the agent can mention.">
            <textarea
              value={form.offer}
              onChange={e => set('offer', e.target.value)}
              rows={2}
              maxLength={400}
              placeholder="e.g. Book before June 30 and get ₹50,000 off + free registration…"
              className={textareaCls}
            />
            <CharCount value={form.offer} max={400} />
          </Field>
        </div>
      </div>

      {/* Tags */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-500 mb-3">Tags & Discovery</h3>
        <div className="space-y-4">
          <Field label="Amenities" hint="Type an amenity and press Enter to add it.">
            <ChipInput
              value={form.amenitiesText}
              onChange={v => set('amenitiesText', v)}
              placeholder="e.g. Swimming pool, Clubhouse, 24/7 security…"
            />
          </Field>
          <Field label="Search Keywords" hint="Words a lead might say that should surface this project.">
            <ChipInput
              value={form.keywordsText}
              onChange={v => set('keywordsText', v)}
              placeholder="e.g. gated, plot, Shamshabad, affordable…"
            />
          </Field>
        </div>
      </div>

      {/* Options */}
      <div className="flex items-center gap-3 py-1">
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(form.siteVisitAvailable)}
          onClick={() => set('siteVisitAvailable', !form.siteVisitAvailable)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
            form.siteVisitAvailable ? 'bg-brand-600' : 'bg-slate-300 dark:bg-gray-700'
          }`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${form.siteVisitAvailable ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
        <span className="text-sm text-slate-700 dark:text-gray-300">Site visit available for this project</span>
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-2 border-t border-slate-200/80 dark:border-gray-800/60">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-5 py-2 text-sm rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium transition-colors"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
