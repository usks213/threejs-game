import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
 testDir: './tests/e2e', fullyParallel: true, workers: process.env.CI ? 1 : undefined,
 timeout: 60000, expect: { timeout: 15000 }, retries: process.env.CI ? 1 : 0,
 reporter: [['list'], ['html', { open: 'never' }]],
 use: { baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173', trace: 'on-first-retry', screenshot: 'only-on-failure', launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
 projects: [
  { name: 'desktop-chromium', testIgnore: '**/iphone-webkit.spec.ts', use: { ...devices['Desktop Chrome'] } },
  { name: 'android-chromium', testIgnore: '**/iphone-webkit.spec.ts', use: { ...devices['Pixel 7'], deviceScaleFactor: 1 } },
  // Engine/device emulation only. WebKit must not inherit Chromium's ANGLE flags.
  { name: 'iphone-webkit', testMatch: '**/iphone-webkit.spec.ts', retries: 0, use: { ...devices['iPhone 13'], launchOptions: { args: [] } } },
 ],
 webServer: process.env.E2E_BASE_URL ? undefined : { command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
