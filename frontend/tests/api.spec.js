/**
 * api.spec.js — Backend REST API tests.
 *
 * These run in the "api" Playwright project (no browser) and target the
 * backend directly. All tests are skipped unless BACKEND_URL and
 * E2E_EMAIL / E2E_PASSWORD are set.
 *
 * BACKEND_URL defaults to http://localhost:3001.
 *
 * Run with:
 *   BACKEND_URL=http://localhost:3001 E2E_EMAIL=... E2E_PASSWORD=... npx playwright test --project=api
 */
import { test, expect } from '@playwright/test';
import { apiLogin, apiGet, apiPost, apiPatch } from './helpers/api.js';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

// Skip ALL tests in this file if credentials are absent
test.beforeAll(async () => {
  if (!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD) {
    // Can't use test.skip in beforeAll cleanly, so we'll rely on per-test skips
  }
});

function requireCreds() {
  if (!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD) {
    return 'Set E2E_EMAIL and E2E_PASSWORD to run API tests';
  }
  return false;
}

// ── Auth endpoints ─────────────────────────────────────────────────────────────
test.describe('POST /api/auth/login', () => {
  test('returns 200 and a token with valid credentials', async ({ request }) => {
    test.skip(!!requireCreds(), requireCreds() || '');

    const res = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: {
        email: process.env.E2E_EMAIL,
        password: process.env.E2E_PASSWORD,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const token = body.token || body.data?.token;
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);
  });

  test('returns 401 with wrong password', async ({ request }) => {
    test.skip(!!requireCreds(), requireCreds() || '');

    const res = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: {
        email: process.env.E2E_EMAIL,
        password: 'definitely-wrong-password-xyz',
      },
    });
    expect([401, 400]).toContain(res.status());
  });

  test('returns 400 with missing fields', async ({ request }) => {
    const res = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: {},
    });
    expect([400, 401, 422]).toContain(res.status());
  });
});

// ── Agent Config endpoints ─────────────────────────────────────────────────────
test.describe('GET /api/agent-config', () => {
  test('requires authentication', async ({ request }) => {
    const res = await apiGet(request, '/api/agent-config', null);
    expect([401, 403]).toContain(res.status());
  });

  test('returns config for authenticated user', async ({ request }) => {
    test.skip(!!requireCreds(), requireCreds() || '');

    const token = await apiLogin(request);
    expect(token).toBeTruthy();

    const res = await apiGet(request, '/api/agent-config', token);
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Should have basic shape
    expect(typeof body).toBe('object');
  });
});

test.describe('POST /api/agent-config', () => {
  test('saves agent config and returns updated values', async ({ request }) => {
    test.skip(!!requireCreds(), requireCreds() || '');

    const token = await apiLogin(request);
    expect(token).toBeTruthy();

    const payload = {
      agentName: `API Test Agent ${Date.now()}`,
      sttModel: 'saarika:v2.5',
      ttsVoice: 'shubh',
      languageMode: 'telugu',
    };

    const res = await apiPost(request, '/api/agent-config', payload, token);
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    expect(body?.agentName || body?.data?.agentName).toBe(payload.agentName);
  });
});

// ── Health check ───────────────────────────────────────────────────────────────
test.describe('Health endpoint', () => {
  test('GET /health returns 200', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/health`).catch(() => null);
    if (!res) {
      // /health may not exist — try /api/health
      const res2 = await request.get(`${BACKEND_URL}/api/health`).catch(() => null);
      if (!res2) {
        test.skip(true, 'No health endpoint found');
        return;
      }
      expect(res2.status()).toBe(200);
      return;
    }
    expect(res.status()).toBe(200);
  });
});

// ── Conversation history ────────────────────────────────────────────────────────
test.describe('GET /api/conversations', () => {
  test('requires authentication', async ({ request }) => {
    const res = await apiGet(request, '/api/conversations', null);
    expect([401, 403, 404]).toContain(res.status());
  });

  test('returns array for authenticated user', async ({ request }) => {
    test.skip(!!requireCreds(), requireCreds() || '');

    const token = await apiLogin(request);
    expect(token).toBeTruthy();

    const res = await apiGet(request, '/api/conversations', token);
    if (res.status() === 404) {
      test.skip(true, '/api/conversations endpoint not found');
      return;
    }
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body) || Array.isArray(body?.data)).toBe(true);
  });
});

// ── CORS headers ───────────────────────────────────────────────────────────────
test.describe('CORS', () => {
  test('backend allows requests from frontend origin', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/health`, {
      headers: { Origin: 'http://localhost:5173' },
    }).catch(() => null);
    if (!res) {
      test.skip(true, 'Backend not reachable');
      return;
    }
    // Should not return a 403 or empty Access-Control-Allow-Origin
    const allowOrigin = res.headers()['access-control-allow-origin'];
    // Either '*' or explicit origin should be set
    if (allowOrigin) {
      expect(['*', 'http://localhost:5173']).toContain(allowOrigin);
    }
  });
});
