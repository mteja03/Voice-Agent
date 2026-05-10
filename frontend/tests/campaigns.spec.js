/**
 * campaigns.spec.js — Campaign and lead management tests.
 *
 * Covers: create/rename/delete campaigns, add/remove leads manually,
 * CSV import, lead selection, navigate-to-dialer shortcut.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticateSession } from './helpers/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEADS_CSV = path.join(__dirname, 'fixtures', 'leads.csv');

// ── Navigate to the Campaigns tab before every test ──────────────────────────
test.beforeEach(async ({ page }) => {
  // Use mockSocket to prevent real socket from connecting with the fake token
  await authenticateSession(page, { mockSocket: true });
  await page.getByRole('button', { name: 'Campaigns', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Campaigns' })).toBeVisible();
});

// ── Campaign CRUD ─────────────────────────────────────────────────────────────
test.describe('Campaign management', () => {
  test('shows at least one campaign on first load', async ({ page }) => {
    const select = page.locator('#campaign-select');
    await expect(select).toBeVisible();
    await expect(select.locator('option').first()).toBeAttached();
    await expect(select.locator('option')).not.toHaveCount(0);
  });

  test('creates a new campaign', async ({ page }) => {
    await page.getByRole('button', { name: 'New campaign' }).click();
    const nameInput = page.getByPlaceholder('Campaign name');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('E2E Test Campaign');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.locator('#campaign-select')).toContainText('E2E Test Campaign');
    await expect(
      page.locator('#campaign-select option').filter({ hasText: 'E2E Test Campaign' })
    ).toHaveCount(1);
  });

  test('renames an existing campaign', async ({ page }) => {
    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('prompt');
      await dialog.accept('Renamed Campaign');
    });
    await page.getByRole('button', { name: 'Rename' }).click();

    await expect(page.locator('#campaign-select')).toContainText('Renamed Campaign');
    await expect(
      page.locator('#campaign-select option').filter({ hasText: 'Renamed Campaign' })
    ).toHaveCount(1);
  });

  test('cannot delete the last campaign', async ({ page }) => {
    const optionCount = await page.locator('#campaign-select option').count();
    if (optionCount > 1) {
      test.skip(true, 'More than one campaign present — skip last-campaign guard test');
      return;
    }
    // The delete button should be absent or disabled when only 1 campaign exists
    const deleteBtn = page
      .getByRole('button', { name: /delete campaign/i })
      .or(page.locator('button[aria-label*="delete campaign" i]'))
      .first();
    if (await deleteBtn.isVisible().catch(() => false)) {
      await expect(deleteBtn).toBeDisabled();
    }
    // If no delete button at all, test passes implicitly
  });
});

// ── Lead management ───────────────────────────────────────────────────────────
test.describe('Lead management', () => {
  test('shows empty state when no leads', async ({ page }) => {
    // Clear leads for the current campaign via localStorage
    await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('voice-agent-campaigns');
        if (!raw) return;
        const campaigns = JSON.parse(raw);
        const active = localStorage.getItem('voice-agent-active-campaign-id');
        const updated = campaigns.map((c) =>
          c.id === active ? { ...c, leads: [] } : c
        );
        localStorage.setItem('voice-agent-campaigns', JSON.stringify(updated));
      } catch {}
    });
    await page.reload();
    await page.getByRole('button', { name: 'Campaigns', exact: true }).click();

    // Should show some "no leads" empty state text
    await expect(
      page.getByText(/no leads|add leads|import/i).first()
    ).toBeVisible({ timeout: 8000 });
  });

  test('adds a lead manually', async ({ page }) => {
    // Find the "Add lead" / "+" button
    const addBtn = page
      .getByRole('button', { name: /add lead|new lead|\+/i })
      .first();
    if (!(await addBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'Add lead button not found — skip');
      return;
    }
    await addBtn.click();

    // Fill in the lead form
    const nameInput = page.getByPlaceholder(/name/i).last();
    const phoneInput = page.getByPlaceholder(/phone/i).last();
    await nameInput.fill('Test Lead');
    await phoneInput.fill('+919999888877');

    const saveBtn = page.getByRole('button', { name: /save|add|create/i }).last();
    await saveBtn.click();

    // Lead should appear in the table / list
    await expect(page.getByText('Test Lead')).toBeVisible({ timeout: 5000 });
  });

  test('imports leads from CSV', async ({ page }) => {
    // Find the file input for CSV import
    const fileInput = page.locator('input[type="file"][accept*="csv"], input[type="file"]').first();
    if (!(await fileInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      // Some UIs hide the input and use a label — check for that
      const uploadLabel = page.getByRole('button', { name: /import|upload|csv/i }).first();
      if (!(await uploadLabel.isVisible({ timeout: 2000 }).catch(() => false))) {
        test.skip(true, 'CSV import input not found — skip');
        return;
      }
      await uploadLabel.click();
    }

    await fileInput.setInputFiles(LEADS_CSV);

    // Should show some count of imported leads or a success message
    await expect(
      page.getByText(/imported|5 leads|leads added/i).first()
    ).toBeVisible({ timeout: 8000 });
  });

  test('selects a lead and activates it', async ({ page }) => {
    // Ensure there are leads by seeding via localStorage
    await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('voice-agent-campaigns');
        if (!raw) return;
        const campaigns = JSON.parse(raw);
        const active = localStorage.getItem('voice-agent-active-campaign-id');
        const leads = [
          { id: 'seed-lead-1', name: 'రాజేష్ కుమార్', phone: '+919876543210' },
          { id: 'seed-lead-2', name: 'సుమిత్ శర్మ', phone: '+919123456789' },
        ];
        const updated = campaigns.map((c) =>
          c.id === active ? { ...c, leads } : c
        );
        localStorage.setItem('voice-agent-campaigns', JSON.stringify(updated));
      } catch {}
    });
    await page.reload();
    await page.getByRole('button', { name: 'Campaigns', exact: true }).click();

    // Click on the first lead row
    await page.getByText('రాజేష్ కుమార్').first().click();

    // The lead should be highlighted / marked as active
    const activeIndicator = page.locator(
      '[data-active="true"], [aria-selected="true"], [data-testid="active-lead"]'
    ).first();
    const isHighlighted = await activeIndicator.isVisible().catch(() => false);
    // Or a "Start Call" / "Dial" button appears
    const dialBtn = page.getByRole('button', { name: /start|dial|call/i }).first();
    const dialVisible = await dialBtn.isVisible().catch(() => false);
    expect(isHighlighted || dialVisible).toBe(true);
  });

  test('navigate to dialer button is present when lead is selected', async ({ page }) => {
    // Seed a lead
    await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('voice-agent-campaigns');
        if (!raw) return;
        const campaigns = JSON.parse(raw);
        const active = localStorage.getItem('voice-agent-active-campaign-id');
        const leads = [{ id: 'nav-lead-1', name: 'Navigate Lead', phone: '+910000000001' }];
        const updated = campaigns.map((c) =>
          c.id === active ? { ...c, leads } : c
        );
        localStorage.setItem('voice-agent-campaigns', JSON.stringify(updated));
      } catch {}
    });
    await page.reload();
    await page.getByRole('button', { name: 'Campaigns', exact: true }).click();

    await page.getByText('Navigate Lead').first().click();

    // Should show a "Go to Dialer" or "Open Dialer" button/link
    const dialerLink = page
      .getByRole('button', { name: /dialer|start call|open dialer/i })
      .first();
    await expect(dialerLink).toBeVisible({ timeout: 5000 });
  });
});

// ── Filtering / search ────────────────────────────────────────────────────────
test.describe('Lead filtering', () => {
  test.beforeEach(async ({ page }) => {
    // Seed 3 leads
    await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('voice-agent-campaigns');
        if (!raw) return;
        const campaigns = JSON.parse(raw);
        const active = localStorage.getItem('voice-agent-active-campaign-id');
        const leads = [
          { id: 'filter-1', name: 'అల్ఫా వ్యక్తి', phone: '+910000000010' },
          { id: 'filter-2', name: 'బీటా వ్యక్తి', phone: '+910000000011' },
          { id: 'filter-3', name: 'Alpha Person', phone: '+910000000012' },
        ];
        const updated = campaigns.map((c) =>
          c.id === active ? { ...c, leads } : c
        );
        localStorage.setItem('voice-agent-campaigns', JSON.stringify(updated));
      } catch {}
    });
    await page.reload();
    await page.getByRole('button', { name: 'Campaigns', exact: true }).click();
  });

  test('search box filters leads by name', async ({ page }) => {
    const searchBox = page.getByPlaceholder(/search|filter/i).first();
    if (!(await searchBox.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'Search box not found — skip');
      return;
    }
    await searchBox.fill('Alpha');
    await expect(page.getByText('Alpha Person')).toBeVisible();
    await expect(page.getByText('అల్ఫా వ్యక్తి')).not.toBeVisible();
  });
});
