import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  reporter: 'list',
  // Every test runs a whole browser; with more at once, screenshots and drags start timing out on a busy machine
  workers: 4,
  // Each test starts its own Chromium with the extension; with parallel runs the default 5 seconds is too tight
  expect: {timeout: 10_000},
  use: {
    trace: 'retain-on-failure',
  },
});
