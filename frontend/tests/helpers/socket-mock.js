/**
 * socket-mock.js
 *
 * Injects a fake Socket.IO-compatible object into the page before React loads.
 * The app's socket.js checks `window.__PW_MOCK_SOCKET` and uses this object
 * instead of creating a real WebSocket connection.
 *
 * Usage:
 *   import { setupSocketMock, connectMockSocket, triggerSocketEvent, getSocketEmits } from './socket-mock.js';
 *
 *   test('...', async ({ page }) => {
 *     await setupSocketMock(page);          // must be called before page.goto()
 *     await page.goto('/');
 *     await authenticateSession(page);
 *
 *     // Simulate the socket becoming "connected"
 *     await connectMockSocket(page);
 *
 *     // Trigger events the server would normally send
 *     await triggerSocketEvent(page, 'response_complete', {
 *       aiText: 'నమస్కారం!',
 *       shouldEndCall: false,
 *       latency: { total: 800, stt: 200, llm: 400, tts: 200 },
 *     });
 *
 *     // Inspect what the app emitted to the server
 *     const emits = await getSocketEmits(page);
 *     expect(emits).toContainEqual(expect.objectContaining({ event: 'start_session' }));
 *   });
 */

/**
 * Mock all backend API calls to prevent 401 responses from triggering
 * notifyAuthInvalid() during tests that use a fake token.
 *
 * This should be called BEFORE page.goto() (just like setupSocketMock).
 * It intercepts all requests to the backend (/api/**) and returns minimal
 * valid 200 responses, preventing the real backend from ever receiving them.
 */
export async function mockApiCalls(page) {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

  // Match both relative paths (Vite proxy) and absolute backend URLs
  await page.route(
    (url) => {
      const href = url.href;
      return (
        href.includes('/api/') ||
        href.startsWith(BACKEND_URL)
      );
    },
    async (route, request) => {
      const url = request.url();
      const method = request.method();

      // Auth endpoints — return a fake successful login
      if (url.includes('/api/auth/')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              token: 'playwright-mock-token',
              user: {
                id: '00000000-0000-0000-0000-000000000099',
                email: 'e2e@local.test',
                companyId: '00000000-0000-0000-0000-000000000088',
                role: 'tenant_admin',
              },
            },
          }),
        });
      }

      // Agent config — GET must not stomp local edits (merge uses API last).
      if (url.includes('/api/agent-config')) {
        if (method === 'GET') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: { agentConfig: {} },
            }),
          });
        }
        // PUT — echo saved payload so UI stays consistent
        try {
          const payload = request.postDataJSON();
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: { agentConfig: payload && typeof payload === 'object' ? payload : {} },
            }),
          });
        } catch {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: { agentConfig: {} },
            }),
          });
        }
      }

      // Conversations / messages
      if (url.includes('/api/conversations') || url.includes('/api/messages')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: [] }),
        });
      }

      // Dashboard / analytics
      if (url.includes('/api/dashboard') || url.includes('/api/analytics')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: {} }),
        });
      }

      if (url.includes('/api/calls')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { calls: [] } }),
        });
      }

      if (url.includes('/api/questionnaires')) {
        try {
          const pathname = new URL(url).pathname;
          const parts = pathname.split('/').filter(Boolean);
          const qi = parts.indexOf('questionnaires');
          const qId = qi >= 0 ? parts[qi + 1] : null;
          if (method === 'GET' && qId) {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                data: {
                  questionnaire: {
                    id: qId,
                    name: 'Mock questionnaire',
                    description: '',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    questions: [],
                  },
                },
              }),
            });
          }
        } catch {
          // fall through
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { questionnaires: [] } }),
        });
      }

      // Tenants
      if (url.includes('/api/tenants') || url.includes('/api/organizations')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: [] }),
        });
      }

      // Health
      if (url.includes('/health')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok' }),
        });
      }

      // Default: return 200 success for any other API call
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: {} }),
      });
    }
  );
}

/** Inject the mock socket script — call this BEFORE page.goto(). */
export async function setupSocketMock(page) {
  await page.addInitScript(() => {
    // ── Mock socket factory ────────────────────────────────────────────────
    function createMockSocket() {
      const handlers = {};   // event → [fn, ...]  (socket-level events)
      const ioHandlers = {}; // event → [fn, ...]  (socket.io manager events)
      const emits = [];      // log of everything the app emits

      let connected = false;

      function on(event, fn) {
        (handlers[event] = handlers[event] || []).push(fn);
        return mock;
      }

      function off(event, fn) {
        if (!handlers[event]) return mock;
        if (fn) {
          handlers[event] = handlers[event].filter((h) => h !== fn);
        } else {
          delete handlers[event];
        }
        return mock;
      }

      function emit(event, ...args) {
        emits.push({ event, args, ts: Date.now() });
        return mock;
      }

      function connect() {
        // Do NOT auto-fire 'connect' here — tests call __pw_socket_connect() explicitly.
        // This allows tests to assert the "Connecting" badge before the socket is ready.
        // The real connect is triggered by __pw_socket_connect() via window API below.
      }

      function disconnect(reason) {
        connected = false;
        const r = reason || 'io client disconnect';
        (handlers['disconnect'] || []).forEach((fn) => fn(r));
      }

      // Separate internal method to fire the connect handshake
      function _connect() {
        connected = true;
        mock.id = 'mock-socket-' + Math.random().toString(36).slice(2);
        (handlers['connect'] || []).forEach((fn) => fn());
      }

      // Simulate the server pushing an event to the client
      function _trigger(event, ...args) {
        (handlers[event] || []).forEach((fn) => fn(...args));
      }

      // socket.io manager mock (for reconnect events)
      const ioManager = {
        on(event, fn) {
          (ioHandlers[event] = ioHandlers[event] || []).push(fn);
          return ioManager;
        },
        off(event, fn) {
          if (!ioHandlers[event]) return ioManager;
          if (fn) {
            ioHandlers[event] = ioHandlers[event].filter((h) => h !== fn);
          } else {
            delete ioHandlers[event];
          }
          return ioManager;
        },
        _trigger(event, ...args) {
          (ioHandlers[event] || []).forEach((fn) => fn(...args));
        },
        opts: { reconnection: true },
      };

      const mock = {
        id: null,
        get connected() { return connected; },
        on,
        off,
        once(event, fn) {
          const wrapper = (...args) => { off(event, wrapper); fn(...args); };
          return on(event, wrapper);
        },
        emit,
        connect,
        disconnect,
        io: ioManager,
        // Internal helpers exposed on window for test control
        _trigger,
        _connect,
        _emits: emits,
      };

      return mock;
    }

    const mockSocket = createMockSocket();
    window.__PW_MOCK_SOCKET = mockSocket;

    // ── Convenience test-control API ──────────────────────────────────────
    /** Trigger the socket connect event (simulate server accepted the connection). */
    window.__pw_socket_connect = () => mockSocket._connect();

    /** Trigger the socket disconnect event (client-initiated, no reconnect). */
    window.__pw_socket_disconnect = () => mockSocket.disconnect('io client disconnect');

    /** Trigger disconnect with server reason (triggers reconnect logic in app). */
    window.__pw_socket_disconnect_server = () => mockSocket.disconnect('io server disconnect');

    /** Trigger a server→client socket event with optional data. */
    window.__pw_trigger = (event, data) => mockSocket._trigger(event, data);

    /** Simulate manager-level reconnect events. */
    window.__pw_reconnect_attempt = (n) => mockSocket.io._trigger('reconnect_attempt', n);
    window.__pw_reconnect = (n) => mockSocket.io._trigger('reconnect', n);

    /** Return a snapshot of all events the app emitted to the server. */
    window.__pw_get_emits = () => JSON.parse(JSON.stringify(mockSocket._emits));

    /** Clear the emit log. */
    window.__pw_clear_emits = () => { mockSocket._emits.length = 0; };
  });
}

// ── Test-control helpers (call after page.goto) ──────────────────────────────

/** Simulate the socket becoming connected (server accepted the handshake). */
export async function connectMockSocket(page) {
  await page.evaluate(() => window.__pw_socket_connect());
  // Give React a tick to process the connect event
  await page.waitForTimeout(50);
}

/** Simulate the socket disconnecting. */
export async function disconnectMockSocket(page) {
  await page.evaluate(() => window.__pw_socket_disconnect());
  await page.waitForTimeout(50);
}

/**
 * Trigger a server→client socket event.
 * @param {import('@playwright/test').Page} page
 * @param {string} event  e.g. 'response_complete', 'tts_audio_chunk', 'transcript'
 * @param {*} data
 */
export async function triggerSocketEvent(page, event, data) {
  await page.evaluate(([e, d]) => window.__pw_trigger(e, d), [event, data]);
  await page.waitForTimeout(30);
}

/**
 * Simulate manager-level reconnect_attempt (shows the amber banner).
 * Also fires a server-initiated disconnect first so socketReady becomes false
 * and the app enters reconnecting state (handleReconnectAttempt sets reconnecting=true).
 */
export async function triggerReconnectAttempt(page, attempt = 1) {
  await page.evaluate((n) => {
    // Disconnect with server reason so handleDisconnect fires (sets socketReady=false)
    // and doesn't early-return like it does for 'io client disconnect'
    window.__pw_socket_disconnect_server();
    // Immediately fire manager-level reconnect_attempt
    window.__pw_reconnect_attempt(n);
  }, attempt);
  // Give the app time to process: handleDisconnect has 0ms delay for 'io server disconnect'
  await page.waitForTimeout(100);
}

/** Simulate manager-level reconnect success (hides the banner). */
export async function triggerReconnect(page, attempt = 1) {
  await page.evaluate((n) => window.__pw_reconnect(n), attempt);
  await page.waitForTimeout(50);
}

/**
 * Return the list of events the app has emitted to the server socket.
 * @returns {Array<{event: string, args: any[], ts: number}>}
 */
export async function getSocketEmits(page) {
  return page.evaluate(() => window.__pw_get_emits());
}

/** Clear the socket emit log (useful between steps). */
export async function clearSocketEmits(page) {
  await page.evaluate(() => window.__pw_clear_emits());
}

// ── Pre-built event payloads ─────────────────────────────────────────────────

/**
 * A complete voice round-trip: transcript → tts_audio_chunk (AI text) → response_complete.
 *
 * Matches the real event flow in useVoiceAgent:
 *  - handleTranscript({ transcript })           → sets userText on current turn
 *  - handleTtsAudioChunk({ audioBuffer, text })  → sets aiText on current turn
 *  - handleResponseComplete({ shouldEndCall, latency }) → attaches latency; clears processing
 */
export async function simulateVoiceTurn(page, { userText, aiText, latency } = {}) {
  // 1. User speech — field name is `transcript` (not `text`)
  await triggerSocketEvent(page, 'transcript', {
    transcript: userText || 'హలో, మీరు ఎలా ఉన్నారు?',
  });
  await page.waitForTimeout(100);
  // 2. AI text arrives via tts_audio_chunk (audioBuffer null = no real audio playback in tests)
  await triggerSocketEvent(page, 'tts_audio_chunk', {
    audioBuffer: null,
    text: aiText || 'నమస్కారం! నేను SB Ventures నుండి మాట్లాడుతున్నాను.',
  });
  await page.waitForTimeout(50);
  // 3. Response complete — only latency, no aiText field
  await triggerSocketEvent(page, 'response_complete', {
    shouldEndCall: false,
    latency: latency || { total: 820, stt: 210, llm: 390, tts: 220 },
  });
}

/** Simulate TTS audio chunk (changes status to 'speaking'). */
export async function simulateTtsChunk(page) {
  await triggerSocketEvent(page, 'tts_audio_chunk', {
    audioBuffer: null,
    text: 'నమస్కారం!',
  });
}
