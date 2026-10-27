import type {BrowserContext, Page} from '@playwright/test';
import {expect, grantPermissions, makePng, openSettings, seed, test, tile} from './fixtures';

// Stub site: a page with an og:image and the picture. The CORS header is needed while site access is imitated
async function serveSite(context: BrowserContext, origin: string, files: Record<string, {type: string; body: Buffer | string}>) {
  const headers = {'Access-Control-Allow-Origin': '*'};
  await context.route(`${origin}/**`, (route) => {
    const file = files[new URL(route.request().url()).pathname];
    return file
      ? route.fulfill({headers, contentType: file.type, body: file.body})
      : route.fulfill({headers, status: 404});
  });
}

async function enablePageImages(context: BrowserContext, newtab: Page) {
  await grantPermissions(context);
  // Automatic screenshots off: the test is about the picture, not about what replaces it
  await newtab.evaluate(() => chrome.storage.sync.set({settings: {pageImages: true, autoCapture: 'off'}}));
  await newtab.reload();
}

const page = (image: string) => `<html><head><meta property="og:image" content="${image}"></head><body></body></html>`;

test('a bookmark without a thumbnail shows the page\'s preview picture', async ({context, newtab}) => {
  await serveSite(context, 'https://news.example', {
    '/article': {type: 'text/html', body: page('/cover.png')},
    '/cover.png': {type: 'image/png', body: await makePng(newtab, 600, '#3070d0')},
  });
  await enablePageImages(context, newtab);
  await seed(newtab, [{title: 'News', url: 'https://news.example/article'}]);

  await expect(tile(newtab, 'News').locator('.tile__thumbnail')).toHaveAttribute('src', /^blob:/);

  // Kept as a thumbnail: after a reload it's there without asking the site
  await context.unroute('https://news.example/**');
  await context.route('https://news.example/**', (route) => route.abort());
  await newtab.reload();
  await expect(tile(newtab, 'News').locator('.tile__thumbnail')).toHaveAttribute('src', /^blob:/);
});

test('off by default: the site isn\'t asked', async ({context, newtab}) => {
  let asked = false;
  await context.route('https://quiet.example/**', (route) => {
    asked = true;
    return route.fulfill({contentType: 'text/html', body: page('/cover.png')});
  });
  await grantPermissions(context);
  await newtab.reload();
  await seed(newtab, [{title: 'Quiet', url: 'https://quiet.example/'}]);

  await expect(tile(newtab, 'Quiet').locator('.site-icon')).toBeVisible();
  await newtab.waitForTimeout(500);
  expect(asked).toBe(false);
  await expect(tile(newtab, 'Quiet').locator('.tile__thumbnail')).toHaveCount(0);
});

test('a small picture is a logo, not a preview — the icon stays', async ({context, newtab}) => {
  await serveSite(context, 'https://small.example', {
    '/': {type: 'text/html', body: page('/logo.png')},
    '/logo.png': {type: 'image/png', body: await makePng(newtab, 120, '#d03030')},
  });
  await enablePageImages(context, newtab);
  await seed(newtab, [{title: 'Small', url: 'https://small.example/'}]);

  await expect(tile(newtab, 'Small').locator('.site-icon')).toBeVisible();
  await newtab.waitForTimeout(1000);
  await expect(tile(newtab, 'Small').locator('.tile__thumbnail')).toHaveCount(0);
});

test('turning it off removes the page pictures', async ({context, newtab}) => {
  await serveSite(context, 'https://news.example', {
    '/': {type: 'text/html', body: page('https://news.example/cover.png')},
    '/cover.png': {type: 'image/png', body: await makePng(newtab, 600, '#3070d0')},
  });
  await enablePageImages(context, newtab);
  await seed(newtab, [{title: 'News', url: 'https://news.example/'}]);
  await expect(tile(newtab, 'News').locator('.tile__thumbnail')).toBeVisible();

  const dialog = await openSettings(newtab, 'Общие');
  const toggle = dialog.getByRole('switch', {name: 'Картинка со страницы'});
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await newtab.keyboard.press('Escape');

  await expect(tile(newtab, 'News').locator('.tile__thumbnail')).toHaveCount(0);
  await expect(tile(newtab, 'News').locator('.site-icon')).toBeVisible();
});
