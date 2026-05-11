import { apiFetch, BACKEND_URL } from './apiFetch';

const BASE = `${BACKEND_URL}/api/users`;

function companyQuery(companyId) {
  return companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
}

/** @param {string} [companyId] - Master admin only: scope list to this workspace */
export function listUsers(companyId) {
  return apiFetch(`${BASE}${companyQuery(companyId)}`).then((data) => data.users || []);
}

/** @param {string} [companyId] - Master admin only: create user in this workspace */
export function createUser({ email, password, role, companyId }) {
  const body = { email, password, role };
  if (companyId) body.companyId = companyId;
  return apiFetch(BASE, {
    method: 'POST',
    body: JSON.stringify(body),
  }).then((data) => data.user);
}

/** @param {string} [companyId] - Master admin only: scope patch to this workspace */
export function updateUser(userId, patch, companyId) {
  return apiFetch(`${BASE}/${encodeURIComponent(userId)}${companyQuery(companyId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  }).then((data) => data.user);
}
