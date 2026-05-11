import { test, expect } from '@playwright/test';
import { authenticateSession } from './helpers/auth.js';

test.beforeEach(async ({ page }) => {
  await authenticateSession(page, { mockSocket: true });
});

test('navigation switches between main tabs', async ({ page }) => {
  await page.getByRole('button', { name: 'Campaigns', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Campaigns' })).toBeVisible();

  await page.getByRole('button', { name: 'Dialer', exact: true }).click();
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
  await page.getByRole('button', { name: 'Dialer', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Active Call' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No lead selected' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to Campaigns' })).toBeVisible();
});
