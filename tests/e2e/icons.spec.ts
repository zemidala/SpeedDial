import type {BrowserContext} from '@playwright/test';
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

test('внешние логотипы по шаблону адреса', async ({context, newtab}) => {
  const requested: string[] = [];
  const logo = await makePng(newtab, 128, '#7030c0');
  await context.route('https://logos.example/**', async (route) => {
    requested.push(route.request().url());
    await route.fulfill({headers: {'Access-Control-Allow-Origin': '*'}, contentType: 'image/png', body: logo});
  });
  await seed(newtab, [{title: 'GitHub', url: 'https://github.com/zemidala'}]);

  const dialog = await openSettings(newtab);
  await dialog.getByLabel('Внешние логотипы').check();
  await dialog.getByLabel('Адрес логотипа').fill('https://logos.example/{{website}}.png');

  await expect(tile(newtab, 'GitHub').locator('.site-icon__image')).toHaveAttribute('src', 'https://logos.example/github.com.png');
  expect(requested).toContain('https://logos.example/github.com.png');
});
