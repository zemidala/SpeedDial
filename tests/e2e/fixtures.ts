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

/** Копия сборки во временной папке — её манифест можно менять */
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
 * Копия сборки, где доступ к сайтам прописан в манифесте: распакованному расширению браузер
 * выдаёт его при установке. Нужно для снимков страниц — окно запроса разрешения в тесте не нажать
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
  /** Доступ к сайтам выдан заранее (через манифест) */
  hostAccess: boolean;
  /** Отдельная копия сборки для теста — если тест меняет её файлы */
  isolatedBuild: boolean;
  /** Язык браузера; тесты написаны для русского интерфейса */
  browserLocale: string;
  extensionPath: string;
  context: BrowserContext;
  extensionId: string;
  newtab: Page;
}

// Каждый тест получает чистый профиль Chromium с загруженным расширением из dist/
export const test = base.extend<Fixtures>({
  hostAccess: [false, {option: true}],
  isolatedBuild: [false, {option: true}],
  browserLocale: ['ru-RU', {option: true}],

  extensionPath: async ({hostAccess, isolatedBuild}, use) => {
    await use(isolatedBuild ? copyBuild() : hostAccess ? getHostAccessBuild() : EXTENSION_PATH);
  },

  context: async ({extensionPath, browserLocale}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      // «Как в браузере» даёт язык этой локали
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
  return page.locator('[data-bookmark-id]', {has: page.getByText(title, {exact: true})});
}

/** Ждёт, пока плитки доиграют анимацию перестановки: до этого их положение на экране промежуточное */
export async function waitForTileAnimations(page: Page) {
  await page.locator('.bookmark-grid').evaluate((grid) =>
    Promise.all(grid.getAnimations({subtree: true}).map((animation) => animation.finished)));
}

/**
 * Отпускает перетаскиваемую плитку в точке x, y. Настоящий браузер шлёт dragover непрерывно, а Playwright —
 * только при движении мыши и без свежего dragover отменяет сброс, поэтому перед отпусканием чуть шевелим мышь
 */
export async function dropAt(page: Page, x: number, y: number) {
  for (const dx of [2, 1, 0]) await page.mouse.move(x + dx, y);
  await page.mouse.up();
}

/** Открывает окно настроек на нужной вкладке */
export async function openSettings(page: Page, tab: 'Вид' | 'Общие' | 'Копии' | 'Расширенные' = 'Вид') {
  await page.getByRole('button', {name: 'Настройки'}).click();
  const dialog = page.getByRole('dialog', {name: 'Настройки'});
  await dialog.getByRole('tab', {name: tab}).click();
  return dialog;
}

/** PNG заданного размера со сплошной заливкой (или только кругом в центре — с прозрачными углами) */
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

/** .ico из одной PNG-картинки (так хранят крупные версии favicon) */
export function makeIco(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(1, 2); // Тип: иконка
  header.writeUInt16LE(1, 4); // Одна картинка
  header.writeUInt8(size >= 256 ? 0 : size, 6); // Ширина (0 = 256)
  header.writeUInt8(size >= 256 ? 0 : size, 7); // Высота
  header.writeUInt16LE(1, 10); // Плоскости
  header.writeUInt16LE(32, 12); // Бит на пиксель
  header.writeUInt32LE(png.length, 14); // Размер данных
  header.writeUInt32LE(22, 18); // Смещение данных
  return Buffer.concat([header, png]);
}

/** Имитирует выданный доступ к сайтам: окно запроса разрешения — интерфейс браузера, в тесте его не нажать */
export async function grantPermissions(context: BrowserContext) {
  await context.addInitScript(() => {
    Object.defineProperty(chrome.permissions, 'contains', {value: async () => true});
    Object.defineProperty(chrome.permissions, 'request', {value: async () => true});
  });
}
