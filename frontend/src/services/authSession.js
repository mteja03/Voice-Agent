const TOKEN_KEY = 'voice-agent-token';
const USER_KEY = 'voice-agent-user';

/** Dispatched when the session must end (invalid/expired token, deleted org, etc.). */
export const AUTH_INVALID_EVENT = 'voice-agent-auth-invalid';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function getAuthUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAuthSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** Clear stored credentials and notify the app (e.g. return to login). */
export function notifyAuthInvalid() {
  clearAuthSession();
  window.dispatchEvent(new CustomEvent(AUTH_INVALID_EVENT));
}

export function isAuthFailureStatus(status) {
  return status === 401 || status === 403;
}
