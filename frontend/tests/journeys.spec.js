import { test, expect } from '@playwright/test';

test('navigation switches between main tabs', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Campaigns' }).click();
  await expect(page.getByRole('heading', { name: 'Campaigns' })).toBeVisible();

  await page.getByRole('button', { name: 'Dialer' }).click();
  await expect(page.getByRole('heading', { name: 'Active Call' })).toBeVisible();

  await page.getByRole('button', { name: 'Agent Config' }).click();
  await expect(page.getByRole('heading', { name: 'Agent Configuration' })).toBeVisible();
});

test('agent name persists after reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Agent Config' }).click();

  const agentNameInput = page.locator('label:has-text("Agent Name") + input');
  await agentNameInput.fill('Playwright Agent');
  await expect(agentNameInput).toHaveValue('Playwright Agent');

  await page.reload();
  await page.getByRole('button', { name: 'Agent Config' }).click();
  await expect(page.locator('label:has-text("Agent Name") + input')).toHaveValue('Playwright Agent');
});

test('dialer shows ready/socket-safe state without selected lead', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Dialer' }).click();

  await expect(page.getByRole('heading', { name: 'Active Call' })).toBeVisible();
  await expect(page.getByText('Ready for the next call.')).toBeVisible();
  await expect(page.getByText('Select a lead to begin')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Start voice assistant' })).toBeVisible();
});
