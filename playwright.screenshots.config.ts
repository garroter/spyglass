import { defineConfig } from '@playwright/test';

// Regenerates the README screenshots (images/screenshot-*.png): `npm run screenshots`.
// Not part of the test suite; they drive the real webview against this repository, in VS Code's
// Dark Modern colours, at 2x for sharp images on high-DPI screens.
export default defineConfig({
  testDir: 'scripts/screenshots',
  testMatch: '**/*.shots.ts',
  workers: 1,
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    headless: true,
    deviceScaleFactor: 2,
    launchOptions: { executablePath: process.env.SPYGLASS_CHROMIUM || undefined },
  },
});
