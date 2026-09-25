import type {BrowserContext, Page} from '@playwright/test';
import {expect, grantPermissions, makeIco, makePng, openSettings, seed, test, tile} from './fixtures';

// Сайт-заглушка: страница и файлы по адресам. CORS-заголовок нужен, пока доступ к сайтам имитирован
async function serveSite(context: BrowserContext, origin: string, files: Record<string, {type: string; body: Buffer | string}>) {
  const headers = {'Access-Control-Allow-Origin': '*'};
  await context.route(`${origin}/**`, (route) => {
    const file = files[new URL(route.request().url()).pathname];
    return file
      ? route.fulfill({headers, contentType: file.type, body: file.body})
      : route.fulfill({headers, status: 404});
  });
}

async function enableSiteIcons(context: BrowserContext, newtab: import('@playwright/test').Page, extra = {}) {
  await grantPermissions(context);
  await newtab.evaluate((extra) => chrome.storage.sync.set({settings: {siteIcons: true, ...extra}}), extra);
  await newtab.reload();
}

test('вместо стандартного глобуса — цветная буква сайта', async ({newtab}) => {
  await seed(newtab, [{title: 'Example', url: 'https://example.com/'}]);
  // В чистом профиле браузер не знает иконок сайтов и отдаёт глобус
  const icon = tile(newtab, 'Example').locator('.site-icon');
  await expect(icon).toHaveClass(/site-icon--letter/);
  await expect(icon).toHaveText('E');
});

test('крупная иконка с сайта заполняет подложку и берётся из кэша', async ({context, newtab}) => {
  await serveSite(context, 'https://hq.example', {
    '/': {type: 'text/html', body: '<link rel="apple-touch-icon" href="/touch.png">'},
    '/touch.png': {type: 'image/png', body: await makePng(newtab, 180, '#d03030')},
  });
  await enableSiteIcons(context, newtab);
  await seed(newtab, [{title: 'HQ', url: 'https://hq.example/'}]);

  const hq = tile(newtab, 'HQ');
  await expect(hq.locator('.site-icon__image')).toHaveAttribute('src', /^blob:/);
  await expect(hq.locator('.site-icon')).toHaveClass(/site-icon--cover/);
  expect(await hq.evaluate((el) => el.style.getPropertyValue('--icon-color'))).toBe('#d03030');

  // После перезагрузки иконка берётся из кэша, без запросов к сайту
  await context.unroute('https://hq.example/**');
  await context.route('https://hq.example/**', (route) => route.abort());
  await newtab.reload();
  await expect(tile(newtab, 'HQ').locator('.site-icon__image')).toHaveAttribute('src', /^blob:/);
});

test('самая крупная картинка из .ico', async ({context, newtab}) => {
  // Размер .ico не объявлен, а внутри лежит версия 256×256.
  // Путь не /favicon.ico: запросы к нему Playwright не перехватывает
  const png = await makePng(newtab, 256, '#2060c0');
  await serveSite(context, 'https://ico.example', {
    '/': {type: 'text/html', body: '<link rel="icon" href="/static/site.ico">'},
    '/static/site.ico': {type: 'image/x-icon', body: makeIco(png, 256)},
  });
  await enableSiteIcons(context, newtab);
  await seed(newtab, [{title: 'ICO', url: 'https://ico.example/'}]);

  const image = tile(newtab, 'ICO').locator('.site-icon__image');
  await expect(image).toHaveAttribute('src', /^blob:/);
  expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(256);
});

test('маленькие картинки с сайта отклоняются', async ({context, newtab}) => {
  // Объявлен «большой» apple-touch-icon, а на деле он 32×32 — объявленным размерам не верим
  await serveSite(context, 'https://tiny.example', {
    '/': {type: 'text/html', body: '<link rel="apple-touch-icon" href="/touch.png">'},
    '/touch.png': {type: 'image/png', body: await makePng(newtab, 32, '#10a010')},
  });
  await enableSiteIcons(context, newtab);
  await seed(newtab, [{title: 'Tiny', url: 'https://tiny.example/'}]);

  await expect(tile(newtab, 'Tiny').locator('.site-icon')).toHaveClass(/site-icon--letter/);
});

test('иконка на весь блок: область заливается цветом краёв иконки', async ({context, newtab}) => {
  await serveSite(context, 'https://fill.example', {
    '/': {type: 'text/html', body: '<link rel="icon" sizes="192x192" href="/icon.png">'},
    '/icon.png': {type: 'image/png', body: await makePng(newtab, 192, '#e0a020')},
  });
  await enableSiteIcons(context, newtab, {iconStyle: 'fill', iconScale: 100});
  await seed(newtab, [{title: 'Fill', url: 'https://fill.example/'}]);

  const fill = tile(newtab, 'Fill');
  await expect(fill.locator('.site-icon--fill .site-icon__image')).toHaveAttribute('src', /^blob:/);
  await expect(fill.locator('.tile__visual')).toHaveCSS('background-color', 'rgb(224, 160, 32)');
});

/** Картинка small×small из цветного шума, растянутая без сглаживания до size×size — как favicon у браузера */
async function makeUpscaledPng(page: Page, small: number, size: number) {
  const bytes = await page.evaluate(async ({small, size}) => {
    const source = new OffscreenCanvas(small, small);
    const sourceContext = source.getContext('2d')!;
    for (let y = 0; y < small; y++) {
      for (let x = 0; x < small; x++) {
        sourceContext.fillStyle = `rgb(${(x * 73 + y * 151) % 256} ${(x * 29 + y * 97) % 256} ${(x * y * 13) % 256})`;
        sourceContext.fillRect(x, y, 1, 1);
      }
    }
    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext('2d')!;
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0, size, size);
    const blob = await canvas.convertToBlob({type: 'image/png'});
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, {small, size});
  return Buffer.from(bytes);
}

/** Отвечает на запросы к сервису иконок: у каждого домена своя картинка, у остальных — заглушка */
async function serveLogoService(
  context: BrowserContext,
  pattern: string,
  icons: Record<string, {type: string; body: Buffer}>,
  placeholder?: {type: string; body: Buffer},
) {
  const requested: string[] = [];
  await context.route(pattern, (route) => {
    const url = route.request().url();
    requested.push(url);
    const icon = Object.entries(icons).find(([domain]) => url.includes(domain))?.[1] ?? placeholder;
    const headers = {'Access-Control-Allow-Origin': '*'};
    return icon
      ? route.fulfill({headers, contentType: icon.type, body: icon.body})
      : route.fulfill({headers, status: 404});
  });
  return requested;
}

test('свой адрес сервиса иконок', async ({context, newtab}) => {
  const requested = await serveLogoService(context, 'https://logos.example/**', {
    'github.com': {type: 'image/png', body: await makePng(newtab, 128, '#7030c0')},
  });
  await seed(newtab, [{title: 'GitHub', url: 'https://github.com/zemidala'}]);

  const dialog = await openSettings(newtab);
  await dialog.getByLabel('Сервис иконок').selectOption('custom');
  await dialog.getByLabel('Адрес иконки').fill('https://logos.example/{{website}}.png');

  const image = tile(newtab, 'GitHub').locator('.site-icon__image');
  await expect(image).toHaveAttribute('src', /^blob:/);
  expect(requested).toContain('https://logos.example/github.com.png');
  expect(await tile(newtab, 'GitHub').evaluate((el) => el.style.getPropertyValue('--icon-color'))).toBe('#7030c0');
});

test('Google: растянутая картинка не растягивается ещё больше, заглушка — буква', async ({context, newtab}) => {
  const placeholder = await makeUpscaledPng(newtab, 16, 256); // Для неизвестных сайтов Google отдаёт свою заглушку
  await serveLogoService(context, 'https://www.google.com/s2/favicons**', {
    'small.example': {type: 'image/png', body: await makeUpscaledPng(newtab, 32, 256)},
  }, {type: 'image/png', body: placeholder});
  await seed(newtab, [
    {title: 'Small', url: 'https://small.example/'},
    {title: 'Unknown', url: 'https://unknown.example/'},
  ]);
  await newtab.evaluate(() => chrome.storage.sync.set({settings: {logoService: 'google', iconScale: 100}}));
  await newtab.reload();

  // Google растянул иконку 32×32 до 256×256: показываем её не больше 32 × 1,5 = 48 px, а не на всю плитку
  const image = tile(newtab, 'Small').locator('.site-icon__image');
  await expect(image).toHaveAttribute('src', /^blob:/);
  expect((await image.boundingBox())!.width).toBeLessThanOrEqual(48);

  await expect(tile(newtab, 'Unknown').locator('.site-icon')).toHaveClass(/site-icon--letter/);
});

test('DuckDuckGo: крупная картинка из .ico', async ({context, newtab}) => {
  const png = await makePng(newtab, 128, '#10a0a0');
  await serveLogoService(context, 'https://icons.duckduckgo.com/**', {
    'duck.example': {type: 'image/x-icon', body: makeIco(png, 128)},
  });
  await seed(newtab, [{title: 'Duck', url: 'https://duck.example/'}]);
  await newtab.evaluate(() => chrome.storage.sync.set({settings: {logoService: 'duckduckgo'}}));
  await newtab.reload();

  const image = tile(newtab, 'Duck').locator('.site-icon__image');
  await expect(image).toHaveAttribute('src', /^blob:/);
  expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(128);
});

test('иконка с сайта главнее сервиса', async ({context, newtab}) => {
  await serveSite(context, 'https://both.example', {
    '/': {type: 'text/html', body: '<link rel="apple-touch-icon" href="/touch.png">'},
    '/touch.png': {type: 'image/png', body: await makePng(newtab, 180, '#d03030')},
  });
  await serveLogoService(context, 'https://logos.example/**', {
    'both.example': {type: 'image/png', body: await makePng(newtab, 128, '#3030d0')},
  });
  await enableSiteIcons(context, newtab, {logoService: 'custom', externalLogoUrl: 'https://logos.example/{{website}}.png'});
  await seed(newtab, [{title: 'Both', url: 'https://both.example/'}]);

  // Сначала показывается иконка сервиса, потом её заменяет более крупная иконка с сайта
  const both = tile(newtab, 'Both');
  await expect.poll(() => both.evaluate((el) => el.style.getPropertyValue('--icon-color'))).toBe('#d03030');

  // После перезагрузки иконка с сайта берётся из кэша сразу, без сервиса
  await newtab.reload();
  await expect(tile(newtab, 'Both').locator('.site-icon')).toHaveClass(/site-icon--cover/);
  expect(await tile(newtab, 'Both').evaluate((el) => el.style.getPropertyValue('--icon-color'))).toBe('#d03030');
});
