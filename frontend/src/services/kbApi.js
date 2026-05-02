const API_BASE = 'http://localhost:3001/api/kb';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || `Request failed (${res.status})`);
  return payload;
}

export function listProjects(query = '') {
  const q = query ? `?q=${encodeURIComponent(query)}` : '';
  return request(`/projects${q}`);
}

export function createProject(project) {
  return request('/projects', { method: 'POST', body: JSON.stringify(project) });
}

export function updateProject(id, project) {
  return request(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(project) });
}

export function deleteProject(id) {
  return request(`/projects/${id}`, { method: 'DELETE' });
}

export function getCompanyInfo() {
  return request('/company-info');
}

export function updateCompanyInfo(companyInfo) {
  return request('/company-info', { method: 'PUT', body: JSON.stringify(companyInfo) });
}
