import {resolve} from 'node:path';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome123',
    rolldownOptions: {
      input: {
        newtab: resolve(import.meta.dirname, 'newtab.html'),
        background: resolve(import.meta.dirname, 'src/background/index.ts'),
      },
      output: {
        // Путь к service worker прописан в manifest.json, поэтому имя без хэша
        entryFileNames: (chunk) => (chunk.name === 'background'
          ? 'background.js'
          : 'assets/[name]-[hash].js'),
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
