/**
 * auth.spec.js — Authentication flow tests.
 *
 * Covers: login form validation, session persistence,
 * and logout. Real API tests are skipped unless E2E_EMAIL/PASSWORD are set.
 */
import { test, expect } from '@playwright/test';

// ── Helper: Visit page without any auth ──────────────────────────────────────
async function visitUnauthenticated(page) {
  await page.goto('/');
  // Ensure we're on the login screen (clear any existing localStorage first)
  await page.evaluate(() => {
    localStorage.removeItem('voice-agent-token');
    localStorage.removeItem('voice-agent-user');
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Voice Agent Login' })).toBeVisible({
    timeout: 10000,
  });
}

// ── Login form structure ──────────────────────────────────────────────────────
test.describe('Login form', () => {
  test('renders all required fields', async ({ page }) => {
    await visitUnauthenticated(page);
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByPlaceholder('Password (min 6 chars)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
    await expect(page.getByRole('button', { name: /register/i })).not.toBeVisible();
  });

  test('email field has type=email for native validation', async ({ page }) => {
    await visitUnauthenticated(page);
    const emailInput = page.getByLabel('Email');
    await expect(emailInput).toHaveAttribute('type', 'email');
  });

  test('password field has minLength=6', async ({ page }) => {
    await visitUnauthenticated(page);
    const pwInput = page.getByLabel('Password');
    await expect(pwInput).toHaveAttribute('minlength', '6');
  });
});

// ── Session persistence ───────────────────────────────────────────────────────
test.describe('Session persistence', () => {
  test('remains logged in after page reload', async ({ page }) => {
    // Simulate already being logged in via localStorage
    await page.goto('/');
    await page.evaluate(() => {
      const user = {
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
      localStorage.setItem('voice-agent-token', 'playwright-e2e-placeholder-token');
      localStorage.setItem('voice-agent-user', JSON.stringify(user));
    });
    await page.reload();
    // Should be on the app shell (not the login screen)
    await expect(page.getByRole('button', { name: 'Campaigns', exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('heading', { name: 'Voice Agent Login' })).not.toBeVisible();
  });

  test('redirects to login after clearing token', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const user = {
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
      localStorage.setItem('voice-agent-token', 'playwright-e2e-placeholder-token');
      localStorage.setItem('voice-agent-user', JSON.stringify(user));
    });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Campaigns', exact: true })).toBeVisible({
      timeout: 15000,
    });

    // Now clear the session and reload
    await page.evaluate(() => {
      localStorage.removeItem('voice-agent-token');
      localStorage.removeItem('voice-agent-user');
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Voice Agent Login' })).toBeVisible({
      timeout: 10000,
    });
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────
test.describe('Logout', () => {
  test('logout button clears session and shows login screen', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const user = {
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
      localStorage.setItem('voice-agent-token', 'playwright-e2e-placeholder-token');
      localStorage.setItem('voice-agent-user', JSON.stringify(user));
    });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Campaigns', exact: true })).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByRole('heading', { name: 'Voice Agent Login' })).toBeVisible({
      timeout: 10000,
    });
  });
});

// ── Real API login (skipped without credentials) ──────────────────────────────
test.describe('Real API login', () => {
  test.skip(
    !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
    'Set E2E_EMAIL and E2E_PASSWORD to run real login tests'
  );

  test('successfully logs in with valid credentials', async ({ page }) => {
    await visitUnauthenticated(page);
    await page.getByLabel('Email').fill(process.env.E2E_EMAIL);
    await page.getByLabel('Password').fill(process.env.E2E_PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByRole('button', { name: 'Campaigns', exact: true })).toBeVisible({
      timeout: 25000,
    });
  });

  test('shows error message for wrong password', async ({ page }) => {
    await visitUnauthenticated(page);
    await page.getByLabel('Email').fill(process.env.E2E_EMAIL);
    await page.getByLabel('Password').fill('definitely-wrong-password-123');
    await page.getByRole('button', { name: 'Login' }).click();
    // Should show an error (either inline or toast)
    await expect(
      page.locator('p.text-red-600, p.text-red-400, [role="alert"]').first()
    ).toBeVisible({ timeout: 10000 });
  });
});
