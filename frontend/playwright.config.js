import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const backendURL = process.env.BACKEND_URL || 'http://localhost:3001';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL,
    trace: 'on-first-retry',
    // Capture screenshots on failure for easier debugging
    screenshot: 'only-on-failure',
    // Give individual actions more time before failing
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },

  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },

  // Global timeout per test
  timeout: 60000,
  // Expect timeout for assertions
  expect: { timeout: 10000 },

  projects: [
    // ── Browser projects ──────────────────────────────────────────────────
    {
      name: 'chromium',
      // api.spec.js targets the HTTP API only (see "api" project)
      testIgnore: ['**/api.spec.js'],
      use: {
        ...devices['Desktop Chrome'],
        // Allow microphone without a permission prompt — required for VAD tests
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
          ],
        },
        permissions: ['microphone'],
      },
    },
    {
      name: 'firefox',
      testIgnore: ['**/api.spec.js'],
      use: {
        ...devices['Desktop Firefox'],
        // Firefox also supports fake media via prefs
        launchOptions: {
          firefoxUserPrefs: {
            'media.navigator.permission.disabled': true,
            'media.navigator.streams.fake': true,
          },
        },
      },
    },
    {
      name: 'mobile-chrome',
      testIgnore: ['**/api.spec.js'],
      use: {
        ...devices['Pixel 7'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
          ],
        },
        permissions: ['microphone'],
      },
    },

    // ── API project — no browser, hits the backend REST API directly ──────
    {
      name: 'api',
      testMatch: '**/api.spec.js',
      use: {
        baseURL: backendURL,
        extraHTTPHeaders: {
          'Content-Type': 'application/json',
        },
      },
    },
  ],
});
