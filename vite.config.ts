import {execSync} from 'node:child_process';
import {resolve} from 'node:path';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import {defineConfig} from 'vitest/config';

/**
 * Build identity shown in Settings → About: a build number (the commit count — it only grows and maps
 * to an exact commit), the short commit hash (with -dirty for uncommitted changes) and the build time
 */
function buildInfo(): {number: number; commit: string; date: string} {
  let number = 0;
  let commit = 'unknown';
  try {
    number = Number(execSync('git rev-list --count HEAD', {encoding: 'utf8'}).trim()) || 0;
    commit = execSync('git rev-parse --short HEAD', {encoding: 'utf8'}).trim();
    if (execSync('git status --porcelain', {encoding: 'utf8'}).trim()) commit += '-dirty';
  } catch {
    // Not a git checkout (e.g. a source archive) — the build still works
  }
  return {number, commit, date: new Date().toISOString()};
}

export default defineConfig({
  plugins: [svelte()],
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo()),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome123',
    rolldownOptions: {
      input: {
        newtab: resolve(import.meta.dirname, 'newtab.html'),
        welcome: resolve(import.meta.dirname, 'welcome.html'),
        background: resolve(import.meta.dirname, 'src/background/index.ts'),
      },
      output: {
        // The service worker path is set in manifest.json, so the name has no hash
        entryFileNames: (chunk) => (chunk.name === 'background'
          ? 'background.js'
          : 'assets/[name]-[hash].js'),
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    // Tests check Russian error texts; English is covered by a separate i18n test
    setupFiles: ['src/test-setup.ts'],
  },
});
