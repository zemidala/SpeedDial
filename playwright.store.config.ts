import {defineConfig} from '@playwright/test';

// Store assets (npm run store-assets): screenshots and the promotional tile, taken from the real extension.
// Separate from the tests: it needs the internet (real site icons) and writes into docs/store
export default defineConfig({
  testDir: 'tests/store',
  reporter: 'list',
  workers: 1,
  timeout: 120_000,
  expect: {timeout: 30_000},
});
