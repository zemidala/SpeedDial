import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  reporter: 'list',
  // Каждый тест запускает свой Chromium с расширением; при параллельном прогоне 5 секунд по умолчанию впритык
  expect: {timeout: 10_000},
  use: {
    trace: 'retain-on-failure',
  },
});
