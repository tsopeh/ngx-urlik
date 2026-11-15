import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './projects/demo-app/e2e',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4200',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm start -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4200',
    // Locally, a running `npm start` is reused. In CI and release checks, a server already on the
    // port fails the run, so the tests never hit a build of other code.
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
