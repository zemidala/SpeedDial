import {resolve} from 'node:path';
import {type BrowserContext, chromium, type Page, test as base} from '@playwright/test';

const EXTENSION_PATH = resolve(import.meta.dirname, '../../dist');

export interface SeedItem {
  title: string;
  url?: string;
  children?: SeedItem[];
}

// Каждый тест получает чистый профиль Chromium с загруженным расширением из dist/
export const test = base.extend<{context: BrowserContext; extensionId: string; newtab: Page}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({context}, use) => {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    await use(new URL(worker.url()).host);
  },

  newtab: async ({context, extensionId}, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);
    await use(page);
  },
});

export const {expect} = test;

/** Создаёт закладки через API; по умолчанию — в «Панели избранного» */
export async function seed(page: Page, items: SeedItem[], parentId = '1'): Promise<void> {
  await page.evaluate(async ({items, parentId}) => {
    async function create(list: SeedItem[], parent: string) {
      for (const {title, url, children} of list) {
        const node = await chrome.bookmarks.create({parentId: parent, title, url});
        if (children) await create(children, node.id);
      }
    }
    await create(items, parentId);
  }, {items, parentId});
}

/** Прямой доступ к API закладок для проверок */
export function getChildren(page: Page, folderId: string) {
  return page.evaluate((id) => chrome.bookmarks.getChildren(id), folderId);
}

export function tile(page: Page, title: string) {
  return page.locator('[data-bookmark-id]', {has: page.locator('.tile-title', {hasText: title})});
}
