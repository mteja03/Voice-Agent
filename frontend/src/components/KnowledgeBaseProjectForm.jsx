import { useEffect, useMemo, useState } from 'react';

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

export default function KnowledgeBaseProjectForm({
  initialProject,
  onCancel,
  onSubmit,
  submitLabel = 'Save',
  typeOptions = [],
  locationOptions = [],
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

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (!String(form.name || '').trim()) nextErrors.name = 'Project name is required';
    if (!String(form.type || '').trim()) nextErrors.type = 'Project type is required';
    if (!String(form.location || '').trim()) nextErrors.location = 'Location is required';
    if (!String(form.description || '').trim()) nextErrors.description = 'Description is required';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    onSubmit({
      ...form,
      amenities: form.amenitiesText.split(',').map((v) => v.trim()).filter(Boolean),
      keywords: form.keywordsText.split(',').map((v) => v.trim()).filter(Boolean),
    });
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input label="Name" value={form.name} onChange={(v) => setField('name', v)} required error={errors.name} />
        <Input label="Name Telugu Hint" value={form.nameTeluguHint} onChange={(v) => setField('nameTeluguHint', v)} />
        <Input
          label="Type"
          value={form.type}
          onChange={(v) => setField('type', v)}
          options={typeOptions}
          error={errors.type}
        />
        <Input
          label="Location"
          value={form.location}
          onChange={(v) => setField('location', v)}
          options={locationOptions}
          error={errors.location}
        />
        <Input label="Location Telugu Hint" value={form.locationTeluguHint} onChange={(v) => setField('locationTeluguHint', v)} />
        <Input label="Website URL" value={form.url} onChange={(v) => setField('url', v)} />
      </div>
      <TextArea label="Description" value={form.description} onChange={(v) => setField('description', v)} error={errors.description} />
      <TextArea label="Highlights" value={form.highlights} onChange={(v) => setField('highlights', v)} />
      <TextArea label="Offer" value={form.offer} onChange={(v) => setField('offer', v)} />
      <Input label="Amenities (comma separated)" value={form.amenitiesText} onChange={(v) => setField('amenitiesText', v)} />
      <Input label="Keywords (comma separated)" value={form.keywordsText} onChange={(v) => setField('keywordsText', v)} />
      <label className="text-xs text-slate-700 dark:text-gray-300 flex items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(form.siteVisitAvailable)}
          onChange={(e) => setField('siteVisitAvailable', e.target.checked)}
        />
        Site visit available
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs rounded bg-slate-200 text-slate-800 hover:bg-slate-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600">Cancel</button>
        <button type="submit" className="px-3 py-1.5 text-xs rounded bg-brand-600 text-white">{submitLabel}</button>
      </div>
    </form>
  );
}

function Input({ label, value, onChange, required = false, options = [], error = '' }) {
  const datalistId = options.length ? `suggest-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '';
  return (
    <label className="block">
      <span className="text-[11px] text-slate-600 dark:text-gray-400">{label}</span>
      <input
        required={required}
        list={datalistId || undefined}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm text-slate-900 dark:bg-gray-800 dark:text-white ${
          error ? 'border-red-600' : 'border-slate-300 dark:border-gray-700'
        }`}
      />
      {options.length > 0 && (
        <datalist id={datalistId}>
          {options.map((opt) => (
            <option key={opt} value={opt} />
          ))}
        </datalist>
      )}
      {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
    </label>
  );
}

function TextArea({ label, value, onChange, error = '' }) {
  return (
    <label className="block">
      <span className="text-[11px] text-slate-600 dark:text-gray-400">{label}</span>
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className={`mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm text-slate-900 dark:bg-gray-800 dark:text-white ${
          error ? 'border-red-600' : 'border-slate-300 dark:border-gray-700'
        }`}
      />
      {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
    </label>
  );
}
