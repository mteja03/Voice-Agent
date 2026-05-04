import { test, expect } from '@playwright/test';

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

async function authenticateSession(page) {
  if (process.env.E2E_EMAIL && process.env.E2E_PASSWORD) {
    await page.goto('/');
    const loginHeading = page.getByRole('heading', { name: 'Voice Agent Login' });
    if (await loginHeading.isVisible().catch(() => false)) {
      await page.getByPlaceholder('Email').fill(process.env.E2E_EMAIL);
      await page.getByPlaceholder('Password (min 6 chars)').fill(process.env.E2E_PASSWORD);
      await page.getByRole('button', { name: 'Login' }).click();
      await expect(page.getByRole('button', { name: 'Campaigns' })).toBeVisible({ timeout: 25000 });
    }
    return;
  }

  await page.goto('/');
  await page.evaluate((userJson) => {
    localStorage.setItem('voice-agent-token', 'playwright-e2e-placeholder-token');
    localStorage.setItem('voice-agent-user', userJson);
  }, JSON.stringify(MOCK_USER));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Campaigns' })).toBeVisible({ timeout: 15000 });
}

test.beforeEach(async ({ page }) => {
  await authenticateSession(page);
});

test('navigation switches between main tabs', async ({ page }) => {
  await page.getByRole('button', { name: 'Campaigns' }).click();
  await expect(page.getByRole('heading', { name: 'Campaigns' })).toBeVisible();

  await page.getByRole('button', { name: 'Dialer' }).click();
  await expect(page.getByRole('heading', { name: 'Active Call' })).toBeVisible();

  await page.getByRole('button', { name: 'Agent Config' }).click();
  await expect(page.getByRole('heading', { name: 'Agent Configuration' })).toBeVisible();
});

test('agent name persists after reload', async ({ page }) => {
  test.skip(
    !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
    'Set E2E_EMAIL and E2E_PASSWORD for API-backed agent config persistence'
  );

  await page.getByRole('button', { name: 'Agent Config' }).click();

  const agentNameInput = page.locator('label:has-text("Agent Name") + input');
  await agentNameInput.fill('Playwright Agent');
  await expect(agentNameInput).toHaveValue('Playwright Agent');

  await page.reload();
  await page.getByRole('button', { name: 'Agent Config' }).click();
  await expect(page.locator('label:has-text("Agent Name") + input')).toHaveValue('Playwright Agent');
});

test('dialer shows empty state without selected lead', async ({ page }) => {
  await page.getByRole('button', { name: 'Dialer' }).click();

  await expect(page.getByRole('heading', { name: 'Active Call' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No lead selected' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to Campaigns' })).toBeVisible();
});
