import { apiFetch, BACKEND_URL } from './apiFetch';

const BASE = `${BACKEND_URL}/api/calls`;

export function listRecentCalls(limit = 25) {
  const q = limit ? `?limit=${encodeURIComponent(String(limit))}` : '';
  return apiFetch(`${BASE}/recent${q}`).then((data) => data.calls || []);
}

export function listLeadCallHistory({ leadId, phone, limit = 20 }) {
  const params = new URLSearchParams();
  if (leadId) params.set('leadId', String(leadId));
  if (phone) params.set('phone', String(phone));
  if (limit) params.set('limit', String(limit));
  const q = params.toString();
  return apiFetch(`${BASE}/lead-history${q ? `?${q}` : ''}`).then((data) => data.calls || []);
}
