import { apiFetch, BACKEND_URL } from './apiFetch';

const TENANTS_API_BASE = `${BACKEND_URL}/api/tenants`;

export function listTenants() {
  return apiFetch(TENANTS_API_BASE).then((data) => data.tenants || []);
}

export function createTenant(name) {
  return apiFetch(TENANTS_API_BASE, {
    method: 'POST',
    body: JSON.stringify({ name }),
  }).then((data) => data.tenant);
}
