import { apiFetch } from './apiFetch';
import { saveAuthSession } from './authSession';

export * from './authSession';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

async function authRequest(path, payload, { skipAuth = true } = {}) {
  return apiFetch(`${BACKEND_URL}/api/auth/${path}`, {
    method: 'POST',
    body: JSON.stringify(payload),
    skipAuth,
  });
}

export async function login(email, password) {
  const data = await authRequest('login', { email, password });
  saveAuthSession(data.token, data.user);
  return data;
}

export async function register(email, password, companyName) {
  const data = await authRequest('register', { email, password, companyName });
  saveAuthSession(data.token, data.user);
  return data;
}

export async function switchTenant(activeCompanyId) {
  const data = await authRequest('switch-tenant', { activeCompanyId }, { skipAuth: false });
  saveAuthSession(data.token, data.user);
  return data;
}
