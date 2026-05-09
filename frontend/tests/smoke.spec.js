import { test, expect } from '@playwright/test';
import { authenticateSession } from './helpers/auth.js';

test('app shell renders', async ({ page }) => {
  await authenticateSession(page);
  await expect(page.getByText('Voice Agent').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dialer', exact: true })).toBeVisible();
});
