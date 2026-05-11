/**
 * api.js — helpers for backend REST API tests (api.spec.js, api project).
 *
 * These helpers use Playwright's `request` fixture, which is available in the
 * `api` project (no browser required).
 *
 * Usage in api.spec.js:
 *   import { apiLogin, apiGet, apiPost } from './helpers/api.js';
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

/**
 * Authenticate against the real backend and return a JWT token.
 * Skips the test if credentials are not provided.
 */
export async function apiLogin(request) {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) return null;

  const res = await request.post(`${BACKEND_URL}/api/auth/login`, {
    data: { email, password },
  });
  if (!res.ok()) return null;
  const body = await res.json();
  return body.token || body.data?.token || null;
}

/**
 * Authenticated GET.
 */
export async function apiGet(request, path, token) {
  return request.get(`${BACKEND_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

/**
 * Authenticated POST.
 */
export async function apiPost(request, path, data, token) {
  return request.post(`${BACKEND_URL}${path}`, {
    data,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

/**
 * Authenticated PATCH.
 */
export async function apiPatch(request, path, data, token) {
  return request.patch(`${BACKEND_URL}${path}`, {
    data,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

/**
 * Authenticated DELETE.
 */
export async function apiDelete(request, path, token) {
  return request.delete(`${BACKEND_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}
