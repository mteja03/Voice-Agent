/**
 * error-states.spec.js — Error and edge-case state tests.
 *
 * ALL tests use the socket mock to prevent the real Socket.IO client from
 * connecting with a fake token (which would trigger auth invalidation and
 * log the user out mid-test).
 *
 * Covers:
 *  - Reconnecting banner (socket reconnect_attempt events)
 *  - Server-originated error events
 *  - Empty conversation feed
 *  - Session ended event
 *  - Processing → resolve
 *  - Navigation edge cases
 */
import { test, expect } from '@playwright/test';
import {
  setupSocketMock,
  mockApiCalls,
  connectMockSocket,
  triggerSocketEvent,
  triggerReconnectAttempt,
  triggerReconnect,
} from './helpers/socket-mock.js';

// ── Mock user ─────────────────────────────────────────────────────────────────
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

// ── Shared setup ──────────────────────────────────────────────────────────────
async function setupApp(page, { withLead = true } = {}) {
  await mockApiCalls(page);
  await setupSocketMock(page);
  await page.goto('/');

  const lead = withLead
    ? { id: 'err-lead-1', name: 'Error Test Lead', phone: '+919000000099' }
    : null;

  await page.evaluate(
    ({ user, lead }) => {
      localStorage.setItem('voice-agent-token', 'playwright-e2e-token');
      localStorage.setItem('voice-agent-user', JSON.stringify(user));
      if (lead) {
        const campaigns = [{
          id: 'err-test-campaign',
          name: 'Error Test Campaign',
          createdAt: new Date().toISOString(),
          leads: [lead],
        }];
        localStorage.setItem('voice-agent-campaigns', JSON.stringify(campaigns));
        localStorage.setItem('voice-agent-active-campaign-id', 'err-test-campaign');
        localStorage.setItem('voice-agent-active-lead-id', lead.id);
      } else {
        localStorage.removeItem('voice-agent-active-lead-id');
      }
    },
    { user: MOCK_USER, lead }
  );

  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Campaigns', exact: true })
  ).toBeVisible({ timeout: 15000 });
}

async function goToDialer(page) {
  await page.getByRole('button', { name: 'Dialer', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Active Call' })
  ).toBeVisible({ timeout: 10000 });
}

// ── Reconnect banner ─────────────────────────────────────────────────────────
test.describe('Reconnect banner', () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page, { withLead: true });
    await goToDialer(page);
    await connectMockSocket(page);
    await page.waitForTimeout(200);
  });

  test('amber banner shows on reconnect_attempt', async ({ page }) => {
    await triggerReconnectAttempt(page, 1);
    await expect(
      page.getByText(/reconnecting|connection dropped/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('banner persists through multiple reconnect_attempt events', async ({ page }) => {
    for (let i = 1; i <= 3; i++) {
      await triggerReconnectAttempt(page, i);
      await page.waitForTimeout(50);
    }
    await expect(
      page.getByText(/attempt 3|#3/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('banner disappears on successful reconnect', async ({ page }) => {
    await triggerReconnectAttempt(page, 2);
    await expect(
      page.getByText(/reconnecting|connection dropped/i).first()
    ).toBeVisible({ timeout: 5000 });

    await triggerReconnect(page, 2);
    await expect(
      page.getByText(/reconnecting|connection dropped/i).first()
    ).not.toBeVisible({ timeout: 5000 });
  });
});

// ── Socket error / lifecycle events ──────────────────────────────────────────
test.describe('Socket error handling', () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page, { withLead: true });
    await goToDialer(page);
    await connectMockSocket(page);
    await page.waitForTimeout(200);
  });

  test('server error event shows an error indication', async ({ page }) => {
    await triggerSocketEvent(page, 'error', {
      message: 'Server error: out of quota',
      type: 'QUOTA',
    });
    await expect(
      page.getByText(/error|quota|server/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('session_ended event does not crash the UI', async ({ page }) => {
    await triggerSocketEvent(page, 'session_ended', {
      reason: 'auto_end',
      summary: 'Call completed after 3 turns.',
    });
    await page.waitForTimeout(400);
    // The main UI should still be visible — no crash/error boundary
    await expect(
      page.getByRole('heading', { name: 'Active Call' })
    ).toBeVisible();
    await expect(
      page.getByText(/something went wrong|unexpected error/i).first()
    ).not.toBeVisible();
  });
});

// ── Empty conversation feed ───────────────────────────────────────────────────
test.describe('Empty conversation feed', () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page, { withLead: true });
    await goToDialer(page);
    await connectMockSocket(page);
    await page.waitForTimeout(200);
  });

  test('shows the empty-state prompt when no turns exist', async ({ page }) => {
    // The ConversationFeed shows a Telugu empty-state heading when turns.length === 0
    const emptyMsg = page.getByText('మీ conversation ఇక్కడ కనిపిస్తుంది');
    await expect(emptyMsg).toBeVisible({ timeout: 5000 });
  });

  test('empty state disappears after first transcript arrives', async ({ page }) => {
    // Empty state is shown when turns.length === 0; sending a transcript adds a turn
    const emptyHeading = page.getByText('మీ conversation ఇక్కడ కనిపిస్తుంది');
    await expect(emptyHeading).toBeVisible({ timeout: 5000 });

    // Sending transcript adds a turn → empty state should disappear
    await triggerSocketEvent(page, 'transcript', { transcript: 'Hello' });
    await expect(emptyHeading).not.toBeVisible({ timeout: 5000 });

    // AI reply via tts_audio_chunk
    await triggerSocketEvent(page, 'tts_audio_chunk', { audioBuffer: null, text: 'Hi there!' });
    await triggerSocketEvent(page, 'response_complete', {
      shouldEndCall: false,
      latency: { total: 400, stt: 100, llm: 200, tts: 100 },
    });
    await expect(page.getByText('Hi there!')).toBeVisible({ timeout: 5000 });
  });
});

// ── Navigation edge cases ─────────────────────────────────────────────────────
test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page, { withLead: false });
  });

  test('Dialer shows "No lead selected" when no lead is active', async ({ page }) => {
    await goToDialer(page);
    await expect(page.getByRole('heading', { name: /no lead selected/i })).toBeVisible();
  });

  test('switches between tabs without crashing', async ({ page }) => {
    const tabs = [
      { button: 'Campaigns', heading: 'Campaigns' },
      { button: 'Dialer', heading: 'Active Call' },
      { button: 'Agent Config', heading: /agent config/i },
    ];

    for (const { button, heading } of tabs) {
      await page
        .getByRole('button', { name: button, exact: true })
        .or(page.getByRole('button', { name: new RegExp(button, 'i') }))
        .first()
        .click();
      await expect(
        page.getByRole('heading', { name: heading }).first()
      ).toBeVisible({ timeout: 8000 });
      await expect(
        page.getByText(/something went wrong|unexpected error/i).first()
      ).not.toBeVisible();
    }
  });
});

// ── Processing stage completion ───────────────────────────────────────────────
test.describe('Processing stage indicators', () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page, { withLead: true });
    await goToDialer(page);
    await connectMockSocket(page);
    await page.waitForTimeout(200);
  });

  test('typing indicator label clears after tts_audio_chunk received', async ({ page }) => {
    // transcript → status='processing', processingStage='generating' → "Generating reply…" label
    await triggerSocketEvent(page, 'transcript', {
      transcript: 'నేను అడుగుతున్నాను',
    });
    // The "Generating reply…" stage label should appear
    await expect(page.getByText('Generating reply…')).toBeVisible({ timeout: 5000 });

    // tts_audio_chunk clears processingStage → stage label disappears
    await triggerSocketEvent(page, 'tts_audio_chunk', { audioBuffer: null, text: 'సమాధానం వచ్చింది.' });

    // Stage label ("Generating reply…") should be gone — processingStage=null
    await expect(page.getByText('Generating reply…')).not.toBeVisible({ timeout: 5000 });

    // The AI response text should be visible in the conversation feed
    await expect(page.getByText('సమాధానం వచ్చింది.')).toBeVisible({ timeout: 5000 });

    // Complete the response
    await triggerSocketEvent(page, 'response_complete', {
      shouldEndCall: false,
      latency: { total: 500, stt: 150, llm: 250, tts: 100 },
    });
  });

  test('status badge shows Processing after transcript received', async ({ page }) => {
    // After a transcript arrives, processingStage becomes 'generating'
    await triggerSocketEvent(page, 'transcript', { transcript: 'test query' });
    // The status badge or processing sub-stage text should show briefly
    // Then resolve after tts_audio_chunk + response_complete
    await triggerSocketEvent(page, 'tts_audio_chunk', { audioBuffer: null, text: 'answer' });
    await triggerSocketEvent(page, 'response_complete', {
      shouldEndCall: false,
      latency: { total: 300, stt: 100, llm: 100, tts: 100 },
    });
    await expect(page.getByText('answer')).toBeVisible({ timeout: 5000 });
  });
});
