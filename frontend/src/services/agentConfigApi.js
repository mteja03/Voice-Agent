import { apiFetch, BACKEND_URL } from './apiFetch';

const BASE = `${BACKEND_URL}/api/agent-config`;

export function fetchAgentConfig() {
  return apiFetch(BASE).then((data) => data.agentConfig);
}

export function saveAgentConfig(config) {
  return apiFetch(BASE, {
    method: 'PUT',
    body: JSON.stringify(config),
  }).then((data) => data.agentConfig);
}
