import { apiFetch, BACKEND_URL } from './apiFetch';

const BASE = `${BACKEND_URL}/api/questionnaires`;

export function listQuestionnaires() {
  return apiFetch(BASE).then((d) => d.questionnaires || []);
}

export function getQuestionnaire(id) {
  return apiFetch(`${BASE}/${encodeURIComponent(id)}`).then((d) => d.questionnaire);
}

export function createQuestionnaire(payload) {
  return apiFetch(BASE, {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then((d) => d.questionnaire);
}

export function updateQuestionnaire(id, payload) {
  return apiFetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }).then((d) => d.questionnaire);
}

export function deleteQuestionnaire(id) {
  return apiFetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }).then(() => true);
}
