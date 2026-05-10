import { expect } from '@playwright/test';
import { setupSocketMock, mockApiCalls } from './socket-mock.js';

const MOCK_USER = {
  id: '00000000-0000-0000-0000-000000000099',
  email: 'e2e@local.test',
  companyId: '00000000-0000-0000-0000-000000000088',
  role: 'tenant_admin',
  dbRole: 'admin',
  platformRole: null,
  activeCompanyId: '00000000-0000-0000-0000-000000000088',
  createdAt: null,
  isMasterAdmin: false,
};

/**
 * Lands on the authenticated app shell (sidebar nav visible).
 *
 * IMPORTANT: If your test interacts with the Dialer or runs for more than
 * a few seconds, call `await setupSocketMock(page)` BEFORE calling this
 * function. That prevents the real Socket.IO client from connecting with the
 * fake token (which would trigger auth invalidation and log the user out).
 *
 * The `mockSocket` option is a convenience shortcut that does this for you:
 *   await authenticateSession(page, { mockSocket: true });
 */
export async function authenticateSession(page, { mockSocket = false } = {}) {
  if (mockSocket) {
    // Both must be installed before page.goto() so they're active on first load.
    // mockApiCalls prevents 401 responses from triggering notifyAuthInvalid.
    // setupSocketMock prevents the real Socket.IO client from connecting.
    await mockApiCalls(page);
    await setupSocketMock(page);
  }

  if (process.env.E2E_EMAIL && process.env.E2E_PASSWORD) {
    await page.goto('/');
    const loginHeading = page.getByRole('heading', { name: 'Voice Agent Login' });
    if (await loginHeading.isVisible().catch(() => false)) {
      await page.getByLabel('Email').fill(process.env.E2E_EMAIL);
      await page.getByPlaceholder('Password (min 6 chars)').fill(process.env.E2E_PASSWORD);
      await page.getByRole('button', { name: 'Login' }).click();
      await expect(page.getByRole('button', { name: 'Campaigns', exact: true })).toBeVisible({
        timeout: 25000,
      });
    }
    return;
  }

  await page.goto('/');
  await page.evaluate((userJson) => {
    localStorage.setItem('voice-agent-token', 'playwright-e2e-placeholder-token');
    localStorage.setItem('voice-agent-user', userJson);
  }, JSON.stringify(MOCK_USER));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Campaigns', exact: true })).toBeVisible({
    timeout: 15000,
  });
}
