import { defineConfig } from '@playwright/test';

// UI tests drive the real webview bundle (media/webview.js) in headless Chromium, backed by the
// real SpyglassController and ripgrep with only the VS Code API mocked. `npm run test:ui` rebuilds
// the bundle first; if you run `npx playwright test` directly, run `npm run bundle-webview` before.
//
// SPYGLASS_CHROMIUM can point at an already installed Chromium/Chrome binary instead of the one
// `npx playwright install chromium` downloads.
export default defineConfig({
  testDir: 'ui-tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1100, height: 700 },
    launchOptions: { executablePath: process.env.SPYGLASS_CHROMIUM || undefined },
  },
});
