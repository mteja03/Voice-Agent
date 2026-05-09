import { expect } from '@playwright/test';

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
 */
export async function authenticateSession(page) {
  if (process.env.E2E_EMAIL && process.env.E2E_PASSWORD) {
    await page.goto('/');
    const loginHeading = page.getByRole('heading', { name: 'Voice Agent Login' });
    if (await loginHeading.isVisible().catch(() => false)) {
      await page.getByPlaceholder('Email').fill(process.env.E2E_EMAIL);
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
