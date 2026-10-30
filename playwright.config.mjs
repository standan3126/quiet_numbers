import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  timeout: 90000,
  use: { baseURL: 'http://localhost:4230/quiet-numbers/' },
  webServer: { command: 'node tests/serve.mjs 4230', port: 4230, reuseExistingServer: true },
  projects: [
    // iPhone-sized in Chrome: Playwright's WebKit doesn't run on this computer's Linux version.
    { name: 'iphone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'small', use: { viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true } },
  ],
})
