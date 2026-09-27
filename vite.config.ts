import {execSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import type {Plugin} from 'vite';
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
    // Uncommitted changes are the next commit in the making — they already carry its number
    if (execSync('git status --porcelain', {encoding: 'utf8'}).trim()) {
      number++;
      commit += '-dirty';
    }
  } catch {
    // Not a git checkout (e.g. a source archive) — the build still works
  }
  return {number, commit, date: new Date().toISOString()};
}

const BUILD_INFO = buildInfo();

/**
 * The build number becomes the fourth part of the version in the built manifest: 2.0.0 → 2.0.0.145. The browser's
 * extensions page shows it, so every build is told apart; the first three parts change with releases
 */
function manifestBuildVersion(): Plugin {
  return {
    name: 'manifest-build-version',
    closeBundle() {
      const path = resolve(import.meta.dirname, 'dist/manifest.json');
      const manifest = JSON.parse(readFileSync(path, 'utf8')) as {version: string};
      manifest.version = `${manifest.version.split('.').slice(0, 3).join('.')}.${BUILD_INFO.number}`;
      writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}

export default defineConfig({
  plugins: [svelte(), manifestBuildVersion()],
  define: {
    __BUILD_INFO__: JSON.stringify(BUILD_INFO),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome123',
    rolldownOptions: {
      input: {
        newtab: resolve(import.meta.dirname, 'newtab.html'),
        welcome: resolve(import.meta.dirname, 'welcome.html'),
        popup: resolve(import.meta.dirname, 'popup.html'),
        add: resolve(import.meta.dirname, 'add.html'),
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
