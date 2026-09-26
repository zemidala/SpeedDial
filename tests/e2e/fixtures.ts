import {cpSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {type BrowserContext, chromium, type Page, test as base} from '@playwright/test';

export const EXTENSION_PATH = resolve(import.meta.dirname, '../../dist');

export interface SeedItem {
  title: string;
  url?: string;
  children?: SeedItem[];
}

/** A copy of the build in a temporary folder — its manifest can be changed */
function copyBuild(): string {
  const path = mkdtempSync(join(tmpdir(), 'speeddial-'));
  cpSync(EXTENSION_PATH, path, {recursive: true});
  return path;
}

export function patchManifest(buildPath: string, patch: (manifest: Record<string, unknown>) => void): void {
  const manifestPath = join(buildPath, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  patch(manifest);
  writeFileSync(manifestPath, JSON.stringify(manifest));
}

let hostAccessBuild: string | null = null;

/**
 * A copy of the build with site access in the manifest: the browser grants it to an unpacked
 * extension on install. Needed for page screenshots — a permission prompt can't be clicked in a test
 */
function getHostAccessBuild(): string {
  if (!hostAccessBuild) {
    hostAccessBuild = copyBuild();
    patchManifest(hostAccessBuild, (manifest) => {
      manifest.host_permissions = ['<all_urls>'];
    });
  }
  return hostAccessBuild;
}

interface Fixtures {
  /** Site access granted up front (via the manifest) */
  hostAccess: boolean;
  /** A separate copy of the build for the test — if the test changes its files */
  isolatedBuild: boolean;
  /** Browser language; the tests are written for the Russian interface */
  browserLocale: string;
  /** Optional permissions granted up front: moved to "permissions" in a copy of the manifest */
  grantedPermissions: string[];
  extensionPath: string;
  context: BrowserContext;
  extensionId: string;
  newtab: Page;
}

// Each test gets a clean Chromium profile with the extension loaded from dist/
export const test = base.extend<Fixtures>({
  hostAccess: [false, {option: true}],
  isolatedBuild: [false, {option: true}],
  browserLocale: ['ru-RU', {option: true}],
  grantedPermissions: [[], {option: true}],

  extensionPath: async ({hostAccess, isolatedBuild, grantedPermissions}, use) => {
    if (grantedPermissions.length > 0) {
      const path = copyBuild();
      patchManifest(path, (manifest) => {
        manifest.permissions = [...(manifest.permissions as string[]), ...grantedPermissions];
      });
      await use(path);
      return;
    }
    await use(isolatedBuild ? copyBuild() : hostAccess ? getHostAccessBuild() : EXTENSION_PATH);
  },

  context: async ({extensionPath, browserLocale}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      // "System default" gives this locale's language
      locale: browserLocale,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
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

/** Creates bookmarks via the API; by default — in the bookmarks bar */
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

/** Direct access to the bookmarks API for assertions */
export function getChildren(page: Page, folderId: string) {
  return page.evaluate((id) => chrome.bookmarks.getChildren(id), folderId);
}

export function tile(page: Page, title: string) {
  return page.locator('[data-bookmark-id]', {has: page.getByText(title, {exact: true})});
}

/** Waits for tiles to finish the reorder animation: until then their on-screen position is intermediate */
export async function waitForTileAnimations(page: Page) {
  await page.locator('.bookmark-grid').evaluate((grid) =>
    Promise.all(grid.getAnimations({subtree: true}).map((animation) => animation.finished)));
}

/**
 * Drops the dragged tile at x, y. A real browser sends dragover continuously, while Playwright does so
 * only on mouse moves and cancels the drop without a fresh dragover, so the mouse is wiggled before releasing
 */
export async function dropAt(page: Page, x: number, y: number) {
  for (const dx of [2, 1, 0]) await page.mouse.move(x + dx, y);
  await page.mouse.up();
}

/** Opens the settings dialog on the given tab */
export async function openSettings(page: Page, tab: 'Вид' | 'Общие' | 'Копии' | 'Расширенные' | 'О программе' = 'Вид') {
  await page.getByRole('button', {name: 'Настройки'}).click();
  const dialog = page.getByRole('dialog', {name: 'Настройки'});
  await dialog.getByRole('tab', {name: tab}).click();
  return dialog;
}

/** A PNG of the given size with a solid fill (or only a circle in the centre — with transparent corners) */
export async function makePng(page: Page, size: number, color: string, shape: 'square' | 'circle' = 'square') {
  const bytes = await page.evaluate(async ({size, color, shape}) => {
    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext('2d')!;
    context.fillStyle = color;
    if (shape === 'square') {
      context.fillRect(0, 0, size, size);
    } else {
      context.arc(size / 2, size / 2, size / 3, 0, Math.PI * 2);
      context.fill();
    }
    const blob = await canvas.convertToBlob({type: 'image/png'});
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, {size, color, shape});
  return Buffer.from(bytes);
}

/** An .ico with a single PNG image (that's how large favicon versions are stored) */
export function makeIco(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(1, 2); // Type: icon
  header.writeUInt16LE(1, 4); // One image
  header.writeUInt8(size >= 256 ? 0 : size, 6); // Width (0 = 256)
  header.writeUInt8(size >= 256 ? 0 : size, 7); // Height
  header.writeUInt16LE(1, 10); // Planes
  header.writeUInt16LE(32, 12); // Bits per pixel
  header.writeUInt32LE(png.length, 14); // Data size
  header.writeUInt32LE(22, 18); // Data offset
  return Buffer.concat([header, png]);
}

/** Imitates granted site access: the permission prompt is browser UI and can't be clicked in a test */
export async function grantPermissions(context: BrowserContext) {
  await context.addInitScript(() => {
    Object.defineProperty(chrome.permissions, 'contains', {value: async () => true});
    Object.defineProperty(chrome.permissions, 'request', {value: async () => true});
  });
}
