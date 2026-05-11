import { getAuthToken, notifyAuthInvalid } from './authSession';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export { BACKEND_URL };

/**
 * JSON API client: standard `{ success, data, error, meta }` envelope.
 * @param {string} url - Absolute URL.
 * @param {RequestInit & { skipAuth?: boolean }} [options]
 * @returns {Promise<any>} Parsed `data` field on success.
 */
export async function apiFetch(url, options = {}) {
  const { skipAuth = false, ...rest } = options;
  const headers = {
    'Content-Type': 'application/json',
    ...(rest.headers || {}),
  };
  if (!skipAuth) {
    headers.Authorization = `Bearer ${getAuthToken()}`;
  }

  const res = await fetch(url, { ...rest, headers });
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: 'Invalid JSON response' };
    }
  }

  if (res.status === 401) {
    if (!skipAuth) notifyAuthInvalid();
    throw new Error(
      (data && typeof data.error === 'string' && data.error) || 'Unauthorized'
    );
  }

  if (res.status === 403) {
    throw new Error(
      (data && typeof data.error === 'string' && data.error) || 'You do not have permission to do that'
    );
  }

  if (!res.ok) {
    throw new Error(
      (data && typeof data.error === 'string' && data.error) || 'Request failed'
    );
  }

  if (data.success !== true) {
    throw new Error(
      (data && typeof data.error === 'string' && data.error) || 'Request failed'
    );
  }

  return data.data;
}
