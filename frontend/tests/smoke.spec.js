import { test, expect } from '@playwright/test';

test('app shell renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Voice Agent')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dialer' })).toBeVisible();
});
