/**
 * dialer.spec.js — Dialer UI and voice pipeline tests (socket-mocked).
 *
 * ALL dialer tests use the socket mock to prevent the real Socket.IO client
 * from attempting a backend connection (which would reject the fake test token
 * and force a logout via notifyAuthInvalid).
 *
 * Test groups:
 *  - Empty state (no lead selected)
 *  - Socket connection & status badge
 *  - Voice turn: transcript → AI response → latency badge
 *  - Reconnect banner
 *  - Space-bar keyboard shortcut
 */
import { test, expect } from '@playwright/test';
import {
  setupSocketMock,
  mockApiCalls,
  connectMockSocket,
  triggerSocketEvent,
  triggerReconnectAttempt,
  triggerReconnect,
  getSocketEmits,
  simulateVoiceTurn,
} from './helpers/socket-mock.js';

// ── Mock user constant ────────────────────────────────────────────────────────
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

// ── Shared setup: installs mock, loads app, optionally seeds a lead ───────────
async function setupApp(page, { withLead = false } = {}) {
  // Both must be called before page.goto()
  // mockApiCalls prevents 401→notifyAuthInvalid from logging out the test user
  await mockApiCalls(page);
  await setupSocketMock(page);
  await page.goto('/');

  const lead = withLead
    ? { id: 'dialer-test-lead', name: 'Playwright Lead', phone: '+919000000001', email: 'pw@test.com' }
    : null;

  await page.evaluate(
    ({ user, lead }) => {
      localStorage.setItem('voice-agent-token', 'playwright-e2e-token');
      localStorage.setItem('voice-agent-user', JSON.stringify(user));
      if (lead) {
        const campaigns = [{
          id: 'dialer-test-campaign',
          name: 'Dialer Test Campaign',
          createdAt: new Date().toISOString(),
          leads: [lead],
        }];
        localStorage.setItem('voice-agent-campaigns', JSON.stringify(campaigns));
        localStorage.setItem('voice-agent-active-campaign-id', 'dialer-test-campaign');
        localStorage.setItem('voice-agent-active-lead-id', lead.id);
      } else {
        localStorage.removeItem('voice-agent-active-lead-id');
      }
    },
    { user: MOCK_USER, lead }
  );

  await page.reload();
  // Wait for the app shell to be ready
  await expect(
    page.getByRole('button', { name: 'Campaigns', exact: true })
  ).toBeVisible({ timeout: 15000 });
}

// ── Navigate to the Dialer tab ────────────────────────────────────────────────
async function goToDialer(page) {
  await page.getByRole('button', { name: 'Dialer', exact: true }).click();
  // The Dialer always renders an h1 "Active Call" (even in the no-lead state)
  await expect(
    page.getByRole('heading', { name: 'Active Call' })
  ).toBeVisible({ timeout: 10000 });
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dialer — empty state', () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page, { withLead: false });
  });

  test('shows "No lead selected" heading when no lead is active', async ({ page }) => {
    await goToDialer(page);
    await expect(page.getByRole('heading', { name: /no lead selected/i })).toBeVisible();
  });

  test('shows "Go to Campaigns" button', async ({ page }) => {
    await goToDialer(page);
    await expect(page.getByRole('button', { name: /go to campaigns/i })).toBeVisible();
  });

  test('"Go to Campaigns" button switches to Campaigns tab', async ({ page }) => {
    await goToDialer(page);
    await page.getByRole('button', { name: /go to campaigns/i }).click();
    await expect(page.getByRole('heading', { name: 'Campaigns' })).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dialer — socket connection', () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page, { withLead: true });
    await goToDialer(page);
  });

  test('shows "Connecting" badge before socket connects', async ({ page }) => {
    // Before connectMockSocket() the socket is disconnected → socketReady = false
    await expect(page.getByText(/connecting/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('status badge changes to Ready after socket connects', async ({ page }) => {
    await connectMockSocket(page);
    await expect(
      page.getByText(/ready|idle/i).first()
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/connecting/i).first()).not.toBeVisible({ timeout: 3000 });
  });

  test('record button is disabled/blocked while socket is not ready', async ({ page }) => {
    const startBtn = page
      .getByRole('button', { name: /start voice assistant|hold to speak/i })
      .first();
    if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(startBtn).toBeDisabled();
    }
  });

  test('socket is in ready state after connect and no spurious events emitted', async ({ page }) => {
    // The app should NOT auto-emit session events on connect — start_assistant is only
    // emitted when the user explicitly clicks the Start Voice Assistant button.
    await connectMockSocket(page);
    await page.waitForTimeout(400);

    // Status badge should now show "Ready" or "Idle" (socketReady = true)
    await expect(
      page.getByText(/ready|idle/i).first()
    ).toBeVisible({ timeout: 5000 });

    // No session-start events should be emitted automatically
    const emits = await getSocketEmits(page);
    const autoSessionEmit = emits.find(
      (e) => e.event === 'start_assistant' || e.event === 'join_session'
    );
    expect(autoSessionEmit).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dialer — voice turn flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page, { withLead: true });
    await goToDialer(page);
    await connectMockSocket(page);
    await page.waitForTimeout(200);
  });

  test('user transcript appears in conversation feed', async ({ page }) => {
    await triggerSocketEvent(page, 'transcript', {
      transcript: 'హలో, మీరు ఎలా ఉన్నారు?',
    });
    await expect(page.getByText('హలో, మీరు ఎలా ఉన్నారు?')).toBeVisible({ timeout: 5000 });
  });

  test('AI response text appears after response_complete', async ({ page }) => {
    await simulateVoiceTurn(page, {
      userText: 'హలో',
      aiText: 'నమస్కారం! SB Ventures నుండి మాట్లాడుతున్నాను.',
    });
    await expect(
      page.getByText('నమస్కారం! SB Ventures నుండి మాట్లాడుతున్నాను.')
    ).toBeVisible({ timeout: 5000 });
  });

  test('latency badge shows total time after response_complete', async ({ page }) => {
    await simulateVoiceTurn(page, {
      userText: 'నేను విన్నాను',
      aiText: 'మీతో మాట్లాడడం సంతోషంగా ఉంది.',
      latency: { total: 750, stt: 180, llm: 350, tts: 220 },
    });
    // LatencyBadge renders "⚡ 750ms" or "⚡ 0.8s"
    await expect(
      page.locator('text=/⚡/').first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('latency badge shows STT, LLM, TTS breakdown', async ({ page }) => {
    await simulateVoiceTurn(page, {
      userText: 'timing test',
      aiText: 'timing reply',
      latency: { total: 900, stt: 200, llm: 500, tts: 200 },
    });
    // Should show individual component labels
    await expect(page.getByText(/STT/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/LLM/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/TTS/)).toBeVisible({ timeout: 5000 });
  });

  test('multiple turns accumulate in the conversation feed', async ({ page }) => {
    await simulateVoiceTurn(page, { userText: 'Turn 1', aiText: 'Reply 1' });
    await simulateVoiceTurn(page, { userText: 'Turn 2', aiText: 'Reply 2' });
    await expect(page.getByText('Turn 1')).toBeVisible();
    await expect(page.getByText('Reply 1')).toBeVisible();
    await expect(page.getByText('Turn 2')).toBeVisible();
    await expect(page.getByText('Reply 2')).toBeVisible();
  });

  test('response_complete without latency does not crash', async ({ page }) => {
    await triggerSocketEvent(page, 'transcript', { transcript: 'no latency test' });
    await triggerSocketEvent(page, 'tts_audio_chunk', { audioBuffer: null, text: 'No latency response.' });
    await triggerSocketEvent(page, 'response_complete', {
      shouldEndCall: false,
      latency: null,
    });
    await expect(page.getByText('No latency response.')).toBeVisible({ timeout: 5000 });
  });

  test('intro text arrives via tts_audio_chunk before any user transcript', async ({ page }) => {
    // Intro arrives as tts_audio_chunk with no prior transcript → isIntro=true turn
    await triggerSocketEvent(page, 'tts_audio_chunk', {
      audioBuffer: null,
      text: 'హలో Playwright Lead గారు, నేను Voice Agent నుండి మాట్లాడుతున్నాను.',
    });
    await triggerSocketEvent(page, 'response_complete', { shouldEndCall: false, latency: null });
    await expect(
      page.getByText('హలో Playwright Lead గారు, నేను Voice Agent నుండి మాట్లాడుతున్నాను.')
    ).toBeVisible({ timeout: 5000 });
  });

  test('conversation feed empty state disappears once a turn is added', async ({ page }) => {
    // ConversationFeed shows Telugu heading when turns.length === 0
    const emptyHeading = page.getByText('మీ conversation ఇక్కడ కనిపిస్తుంది');
    await expect(emptyHeading).toBeVisible({ timeout: 5000 });

    // After sending a transcript, turns.length > 0 → empty state disappears
    await triggerSocketEvent(page, 'transcript', { transcript: 'Hello' });
    await expect(emptyHeading).not.toBeVisible({ timeout: 5000 });

    // Finish the turn
    await triggerSocketEvent(page, 'tts_audio_chunk', { audioBuffer: null, text: 'Hi!' });
    await triggerSocketEvent(page, 'response_complete', { shouldEndCall: false, latency: null });
    await expect(page.getByText('Hi!')).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dialer — reconnect banner', () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page, { withLead: true });
    await goToDialer(page);
    await connectMockSocket(page);
    await page.waitForTimeout(200);
  });

  test('amber banner appears on reconnect_attempt', async ({ page }) => {
    await triggerReconnectAttempt(page, 1);
    await expect(
      page.getByText(/reconnecting|connection dropped/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('banner shows the attempt number', async ({ page }) => {
    await triggerReconnectAttempt(page, 3);
    await expect(
      page.getByText(/attempt 3|#3/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('banner disappears after successful reconnect', async ({ page }) => {
    await triggerReconnectAttempt(page, 1);
    await expect(
      page.getByText(/reconnecting|connection dropped/i).first()
    ).toBeVisible({ timeout: 5000 });

    await triggerReconnect(page, 1);
    await expect(
      page.getByText(/reconnecting|connection dropped/i).first()
    ).not.toBeVisible({ timeout: 5000 });
  });

  test('record button is blocked while reconnecting', async ({ page }) => {
    await triggerReconnectAttempt(page, 1);
    const startBtn = page
      .getByRole('button', { name: /start voice assistant|hold to speak/i })
      .first();
    if (await startBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(startBtn).toBeDisabled({ timeout: 3000 });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dialer — keyboard shortcut (Space bar)', () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page, { withLead: true });
    await goToDialer(page);
    await connectMockSocket(page);
    await page.waitForTimeout(200);
  });

  test('Space bar does not trigger voice when focus is inside a text input', async ({ page }) => {
    const textInput = page.locator('input[type="text"], input[type="search"]').first();
    if (!(await textInput.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, 'No text input visible in dialer to test focus guard');
      return;
    }
    await textInput.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    const emits = await getSocketEmits(page);
    const vadEmit = emits.find((e) =>
      e.event === 'process_audio' || e.event === 'start_push_to_talk'
    );
    expect(vadEmit).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dialer — mode hint text', () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page, { withLead: true });
    await goToDialer(page);
  });

  test('shows a hint text in the record button area', async ({ page }) => {
    // Either "Tap once to start" (VAD) or "Hold button" (PTT)
    const hint = page
      .getByText(/tap once to start|hold button|hold to speak/i)
      .first();
    await expect(hint).toBeVisible({ timeout: 5000 });
  });
});
