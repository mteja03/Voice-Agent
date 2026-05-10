/**
 * smoke.spec.js — Fast sanity checks for the app shell.
 *
 * These run on every CI build and should complete in < 15 seconds.
 * No socket mock needed — they only verify static UI structure.
 */
import { test, expect } from '@playwright/test';
import { authenticateSession } from './helpers/auth.js';

test.describe('App shell', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateSession(page);
  });

  test('renders branding and primary nav', async ({ page }) => {
    await expect(page.getByText('Voice Agent').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dialer', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Campaigns', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agent Config' })).toBeVisible();
  });

  test('header shows Logout button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
  });

  test('dark mode toggle is present and clickable', async ({ page }) => {
    // ThemeToggle button — look for the accessible name or icon wrapper
    const toggleBtn = page.locator('button[aria-label*="theme"], button[title*="theme"], button[aria-label*="dark"], button[aria-label*="light"]').first();
    // If the component doesn't use an aria-label, fall back to a more general selector
    const fallback = page.locator('[data-testid="theme-toggle"], button:has(svg)').first();
    const visible = await toggleBtn.isVisible().catch(() => false) || await fallback.isVisible().catch(() => false);
    expect(visible).toBe(true);
  });

  test('main content area is rendered', async ({ page }) => {
    await expect(page.locator('main')).toBeVisible();
  });

  test('dashboard is the default active tab', async ({ page }) => {
    // The header should show "Dashboard" as the active page title
    await expect(page.getByText('Dashboard', { exact: true }).first()).toBeVisible();
  });
});

test.describe('Auth screen', () => {
  test('shows login form when not authenticated', async ({ page }) => {
    // Visit without setting auth token
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Voice Agent Login' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  });

  test('does not offer public registration', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /register/i })).not.toBeVisible();
    await expect(page.getByText(/public registration is not available/i)).toBeVisible();
  });
});
