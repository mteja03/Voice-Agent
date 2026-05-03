import { apiFetch } from './apiFetch';

const API_BASE = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/kb`;

function kb(path, options = {}) {
  return apiFetch(`${API_BASE}${path}`, options);
}

export function listProjects(query = '') {
  const q = query ? `?q=${encodeURIComponent(query)}` : '';
  return kb(`/projects${q}`);
}

export function createProject(project) {
  return kb('/projects', { method: 'POST', body: JSON.stringify(project) });
}

export function updateProject(id, project) {
  return kb(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(project) });
}

export function deleteProject(id) {
  return kb(`/projects/${id}`, { method: 'DELETE' });
}

export function getCompanyInfo() {
  return kb('/company-info');
}

export function updateCompanyInfo(companyInfo) {
  return kb('/company-info', { method: 'PUT', body: JSON.stringify(companyInfo) });
}
