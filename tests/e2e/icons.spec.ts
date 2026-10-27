import type {BrowserContext, Page} from '@playwright/test';
import {expect, grantPermissions, makeIco, makePng, openSettings, seed, test, tile} from './fixtures';

// Stub site: a page and files by path. The CORS header is needed while site access is imitated
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

test('a coloured site letter instead of the standard globe', async ({newtab}) => {
  await seed(newtab, [{title: 'Example', url: 'https://example.com/'}]);
  // In a clean profile the browser knows no site icons and returns a globe
  const icon = tile(newtab, 'Example').locator('.site-icon');
  await expect(icon).toHaveClass(/site-icon--letter/);
  await expect(icon).toHaveText('E');
});

test('a large site icon fills the plate and comes from the cache', async ({context, newtab}) => {
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

  // After a reload the icon comes from the cache, without requests to the site
  await context.unroute('https://hq.example/**');
  await context.route('https://hq.example/**', (route) => route.abort());
  await newtab.reload();
  await expect(tile(newtab, 'HQ').locator('.site-icon__image')).toHaveAttribute('src', /^blob:/);
});

test('the largest image from an .ico', async ({context, newtab}) => {
  // The .ico size isn't declared, and inside there's a 256×256 version.
  // The path isn't /favicon.ico: Playwright doesn't intercept requests to it
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

test('small images from the site are rejected', async ({context, newtab}) => {
  // A "large" apple-touch-icon is declared but it's actually 32×32 — declared sizes aren't trusted
  await serveSite(context, 'https://tiny.example', {
    '/': {type: 'text/html', body: '<link rel="apple-touch-icon" href="/touch.png">'},
    '/touch.png': {type: 'image/png', body: await makePng(newtab, 32, '#10a010')},
  });
  await enableSiteIcons(context, newtab);
  await seed(newtab, [{title: 'Tiny', url: 'https://tiny.example/'}]);

  await expect(tile(newtab, 'Tiny').locator('.site-icon')).toHaveClass(/site-icon--letter/);
});

test('fill icon with its own background is shown whole as a rounded square — its own colours, no guessed fill', async ({context, newtab}) => {
  await serveSite(context, 'https://fill.example', {
    '/': {type: 'text/html', body: '<link rel="icon" sizes="192x192" href="/icon.png">'},
    '/icon.png': {type: 'image/png', body: await makePng(newtab, 192, '#e0a020')},
  });
  await enableSiteIcons(context, newtab, {iconStyle: 'fill', iconScale: 60});
  await seed(newtab, [{title: 'Fill', url: 'https://fill.example/'}]);

  const fill = tile(newtab, 'Fill');
  const image = fill.locator('.site-icon--fill.site-icon--cover .site-icon__image');
  await expect(image).toHaveAttribute('src', /^blob:/);
  // Whole and square — nothing cut off
  const box = (await image.boundingBox())!;
  expect(box.width).toBeCloseTo(box.height, 0);
  await expect(fill.locator('.site-icon--cover')).toHaveCSS('border-radius', /%|px/);
  // No colour painted under it
  await expect(fill.locator('.tile__visual')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

/** A small×small image of colour noise upscaled without smoothing to size×size — like a browser favicon */
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

/** Answers icon service requests: each domain has its own image, the rest get a placeholder */
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

test('custom icon service URL', async ({context, newtab}) => {
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

test('Google: an upscaled image isn\'t stretched further, the placeholder becomes a letter', async ({context, newtab}) => {
  const placeholder = await makeUpscaledPng(newtab, 16, 256); // Google returns its own placeholder for unknown sites
  await serveLogoService(context, 'https://www.google.com/s2/favicons**', {
    'small.example': {type: 'image/png', body: await makeUpscaledPng(newtab, 32, 256)},
  }, {type: 'image/png', body: placeholder});
  await seed(newtab, [
    {title: 'Small', url: 'https://small.example/'},
    {title: 'Unknown', url: 'https://unknown.example/'},
  ]);
  await newtab.evaluate(() => chrome.storage.sync.set({settings: {logoService: 'google', iconScale: 100}}));
  await newtab.reload();

  // Google upscaled a 32×32 icon to 256×256: show it no larger than 32 × 1.5 = 48 px, not over the whole tile
  const image = tile(newtab, 'Small').locator('.site-icon__image');
  await expect(image).toHaveAttribute('src', /^blob:/);
  expect((await image.boundingBox())!.width).toBeLessThanOrEqual(48);

  await expect(tile(newtab, 'Unknown').locator('.site-icon')).toHaveClass(/site-icon--letter/);
});

test('DuckDuckGo: the large image from an .ico', async ({context, newtab}) => {
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

test('the site icon wins over the service', async ({context, newtab}) => {
  await serveSite(context, 'https://both.example', {
    '/': {type: 'text/html', body: '<link rel="apple-touch-icon" href="/touch.png">'},
    '/touch.png': {type: 'image/png', body: await makePng(newtab, 180, '#d03030')},
  });
  await serveLogoService(context, 'https://logos.example/**', {
    'both.example': {type: 'image/png', body: await makePng(newtab, 128, '#3030d0')},
  });
  await enableSiteIcons(context, newtab, {logoService: 'custom', externalLogoUrl: 'https://logos.example/{{website}}.png'});
  await seed(newtab, [{title: 'Both', url: 'https://both.example/'}]);

  // The service icon shows first, then a larger icon from the site replaces it
  const both = tile(newtab, 'Both');
  await expect.poll(() => both.evaluate((el) => el.style.getPropertyValue('--icon-color'))).toBe('#d03030');

  // After a reload the site icon comes from the cache right away, without the service
  await newtab.reload();
  await expect(tile(newtab, 'Both').locator('.site-icon')).toHaveClass(/site-icon--cover/);
  expect(await tile(newtab, 'Both').evaluate((el) => el.style.getPropertyValue('--icon-color'))).toBe('#d03030');
});

test('an SVG icon that changes with the theme follows SpeedDial\'s theme, not the system\'s', async ({context, newtab}) => {
  // Like GitHub's logo: black by default, white in a dark theme
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>rect{fill:#000}'
    + '@media (prefers-color-scheme: dark){rect{fill:#fff}}</style><rect width="10" height="10"/></svg>';
  await serveSite(context, 'https://themed.example', {
    '/': {type: 'text/html', body: '<link rel="icon" type="image/svg+xml" href="/icon.svg">'},
    '/icon.svg': {type: 'image/svg+xml', body: svg},
  });
  // The system is light, SpeedDial is dark
  await newtab.emulateMedia({colorScheme: 'light'});
  await enableSiteIcons(context, newtab, {theme: 'dark'});
  await seed(newtab, [{title: 'Themed', url: 'https://themed.example/'}]);

  const image = tile(newtab, 'Themed').locator('.site-icon__image');
  const brightness = () => image.evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const canvas = new OffscreenCanvas(10, 10);
    const context = canvas.getContext('2d')!;
    context.drawImage(img, 0, 0, 10, 10);
    return context.getImageData(5, 5, 1, 1).data[0];
  });
  await expect(image).toHaveAttribute('src', /^blob:/);
  await expect.poll(brightness).toBeGreaterThan(200); // White on the dark theme

  // Switching SpeedDial to light draws it black
  const dialog = await openSettings(newtab);
  await dialog.getByLabel('Светлая или тёмная').selectOption('light');
  await expect.poll(brightness).toBeLessThan(50);
});

test('a black logo is drawn light on a dark tile without a plate, and left as is on a plate', async ({context, newtab}) => {
  // GitHub's favicon: a black octocat on a transparent background
  await serveSite(context, 'https://octo.example', {
    '/': {type: 'text/html', body: '<link rel="icon" type="image/svg+xml" href="/icon.svg">'},
    '/icon.svg': {
      type: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#24292E"/></svg>',
    },
  });
  await enableSiteIcons(context, newtab, {theme: 'dark', iconStyle: 'fill'});
  await seed(newtab, [{title: 'Octo', url: 'https://octo.example/'}]);

  const icon = tile(newtab, 'Octo').locator('.tile__visual .site-icon');
  await expect(icon.locator('.site-icon__image')).toHaveAttribute('src', /^blob:/);
  await expect(icon).toHaveClass(/site-icon--lighten/);

  // On the light plate the black logo is visible as it is
  const dialog = await openSettings(newtab);
  await dialog.getByRole('radiogroup', {name: 'Вид иконок'}).getByRole('radio', {name: 'На подложке'}).check();
  await expect(icon).not.toHaveClass(/site-icon--lighten/);
});

test('a site that didn\'t answer is asked again; "Load again" fetches every icon anew', async ({context, newtab}) => {
  // First the site doesn't answer (offline, VPN off)
  await context.route('https://later.example/**', (route) => route.abort('connectionrefused'));
  await enableSiteIcons(context, newtab);
  await seed(newtab, [{title: 'Later', url: 'https://later.example/'}]);
  const readCache = () => newtab.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('speeddial');
    request.onsuccess = () => {
      const get = request.result.transaction('icons').objectStore('icons').get('https://later.example');
      get.onsuccess = () => resolve(get.result ? {blob: Boolean(get.result.blob), retrySoon: get.result.retrySoon ?? false} : null);
    };
  }));
  // Remembered as "the site didn't answer", not as "the site has no icon"
  await expect.poll(readCache).toEqual({blob: false, retrySoon: true});

  // The site is back; loading again finds its large icon
  await context.unroute('https://later.example/**');
  await serveSite(context, 'https://later.example', {
    '/': {type: 'text/html', body: '<link rel="apple-touch-icon" href="/touch.png">'},
    '/touch.png': {type: 'image/png', body: await makePng(newtab, 180, '#3060d0')},
  });
  const dialog = await openSettings(newtab);
  await dialog.getByRole('button', {name: 'Загрузить заново'}).click();
  await expect(dialog.getByRole('status').filter({hasText: 'Иконки сайтов загружаются заново'})).toBeVisible();
  await expect.poll(readCache).toEqual({blob: true, retrySoon: false});
  await expect(tile(newtab, 'Later').locator('.site-icon__image')).toHaveAttribute('src', /^blob:/);
});

test('a worse icon taken because the best one didn\'t download is only a stand-in', async ({context, newtab}) => {
  let busy = true;
  await context.route('https://busy.example/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = {'Access-Control-Allow-Origin': '*'};
    if (path === '/') {
      return route.fulfill({headers, contentType: 'text/html', body: '<link rel="icon" type="image/svg+xml" href="/icon.svg">'
        + '<link rel="apple-touch-icon" href="/touch.png">'});
    }
    if (path === '/icon.svg') {
      return route.fulfill({
        headers,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1" fill="red"/></svg>',
      });
    }
    // The app icon — the preferred one — is "busy" at first
    if (path === '/touch.png') {
      return busy
        ? route.fulfill({headers, status: 503})
        : route.fulfill({headers, contentType: 'image/png', body: await makePng(newtab, 180, '#30a030')});
    }
    return route.fulfill({headers, status: 404});
  });
  await enableSiteIcons(context, newtab);
  await seed(newtab, [{title: 'Busy', url: 'https://busy.example/'}]);
  const readCache = () => newtab.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('speeddial');
    request.onsuccess = () => {
      const get = request.result.transaction('icons').objectStore('icons').get('https://busy.example');
      get.onsuccess = () => resolve(get.result ? {type: get.result.blob?.type ?? null, retrySoon: get.result.retrySoon ?? false} : null);
    };
  }));
  // The app icon answered "busy" — the SVG is used for now and asked again soon
  await expect.poll(readCache).toEqual({type: 'image/svg+xml', retrySoon: true});

  busy = false;
  const dialog = await openSettings(newtab);
  await dialog.getByRole('button', {name: 'Загрузить заново'}).click();
  await expect.poll(readCache).toEqual({type: 'image/png', retrySoon: false});
});

test('an icon found while the site\'s manifest was "busy" is only a stand-in', async ({context, newtab}) => {
  await context.route('https://manifest.example/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = {'Access-Control-Allow-Origin': '*'};
    if (path === '/') {
      return route.fulfill({headers, contentType: 'text/html', body: '<link rel="manifest" href="/manifest.json">'
        + '<link rel="apple-touch-icon" href="/touch.png">'});
    }
    if (path === '/manifest.json') return route.fulfill({headers, status: 429});
    if (path === '/touch.png') return route.fulfill({headers, contentType: 'image/png', body: await makePng(newtab, 180, '#a03060')});
    return route.fulfill({headers, status: 404});
  });
  await enableSiteIcons(context, newtab);
  await seed(newtab, [{title: 'Manifest', url: 'https://manifest.example/'}]);
  await expect.poll(() => newtab.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('speeddial');
    request.onsuccess = () => {
      const get = request.result.transaction('icons').objectStore('icons').get('https://manifest.example');
      get.onsuccess = () => resolve(get.result ? {blob: Boolean(get.result.blob), retrySoon: get.result.retrySoon ?? false} : null);
    };
  }))).toEqual({blob: true, retrySoon: true});
});

/** A PNG drawn in the page: kind picks one of the shapes the "by the logo" style tells apart */
async function makeIcon(page: Page, kind: 'red-square' | 'white-square' | 'black-logo' | 'gradient' | 'small-stripes') {
  const bytes = await page.evaluate(async (kind) => {
    const canvas = kind === 'small-stripes' ? new OffscreenCanvas(128, 128) : new OffscreenCanvas(192, 192);
    const context = canvas.getContext('2d')!;
    if (kind === 'red-square' || kind === 'white-square') {
      // One colour all over with a mark in the middle — like Yandex's or VK's icon
      context.fillStyle = kind === 'red-square' ? '#fc3f1d' : '#ffffff';
      context.fillRect(0, 0, 192, 192);
      context.fillStyle = kind === 'red-square' ? '#ffffff' : '#0077ff';
      context.fillRect(72, 64, 48, 64);
    } else if (kind === 'black-logo') {
      // A black drawing on transparency with wide margins — like GitHub's mark
      context.fillStyle = '#18181a';
      context.beginPath();
      context.arc(96, 96, 40, 0, Math.PI * 2);
      context.fill();
      context.clearRect(84, 70, 24, 52);
    } else if (kind === 'small-stripes') {
      // A 32-pixel picture blown up four times — like a small favicon from the browser cache
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          context.fillStyle = Math.floor((x + y) / 4) % 2 ? '#1e5bff' : '#f91155';
          context.fillRect(x * 4, y * 4, 4, 4);
        }
      }
    } else {
      // A shape with a busy background — like Instagram's
      const gradient = context.createLinearGradient(0, 0, 192, 192);
      gradient.addColorStop(0, '#feda75');
      gradient.addColorStop(0.5, '#d62976');
      gradient.addColorStop(1, '#4f5bd5');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 192, 192);
    }
    const blob = await canvas.convertToBlob({type: 'image/png'});
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, kind);
  return Buffer.from(bytes);
}

test.describe('"By the logo" style', () => {
  async function serveIcons(context: BrowserContext, newtab: Page) {
    for (const kind of ['red-square', 'white-square', 'black-logo', 'gradient'] as const) {
      await serveSite(context, `https://${kind}.example`, {
        '/': {type: 'text/html', body: '<link rel="icon" sizes="192x192" href="/icon.png">'},
        '/icon.png': {type: 'image/png', body: await makeIcon(newtab, kind)},
      });
    }
  }

  const visual = (page: Page, title: string) => tile(page, title).locator('.site-icon-smart');

  test('the tile takes after each icon', async ({context, newtab}) => {
    await serveIcons(context, newtab);
    await enableSiteIcons(context, newtab, {iconStyle: 'smart'});
    await seed(newtab, [
      {title: 'Red', url: 'https://red-square.example/'},
      {title: 'White', url: 'https://white-square.example/'},
      {title: 'Black', url: 'https://black-logo.example/'},
      {title: 'Gradient', url: 'https://gradient.example/'},
    ]);

    // One colour at the edge: the whole picture area in that colour, the mark in the middle
    await expect(visual(newtab, 'Red')).toHaveClass(/site-icon-smart--seamless/);
    await expect(visual(newtab, 'Red')).toHaveCSS('background-color', 'rgb(252, 63, 29)');
    await expect(visual(newtab, 'White')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    // A colourless logo on transparency stands on the tile itself: a grey plate would only be a square a shade off it
    await expect(visual(newtab, 'Black')).toHaveClass(/site-icon-smart--logo/);
    await expect(visual(newtab, 'Black')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    // A busy background: whole, on a blurred copy of itself
    await expect(visual(newtab, 'Gradient')).toHaveClass(/site-icon-smart--app/);
    await expect(visual(newtab, 'Gradient').locator('.site-icon-smart__backdrop')).toBeVisible();

    // The drawing is centred in the picture area
    const area = (await visual(newtab, 'Red').boundingBox())!;
    const mark = (await visual(newtab, 'Red').locator('img').boundingBox())!;
    expect(Math.abs(mark.x + mark.width / 2 - (area.x + area.width / 2))).toBeLessThan(2);
  });

  test('a small busy icon is not blown up into squares', async ({context, newtab}) => {
    await serveSite(context, 'https://small.example', {
      '/': {type: 'text/html', body: '<link rel="icon" sizes="128x128" href="/icon.png">'},
      '/icon.png': {type: 'image/png', body: await makeIcon(newtab, 'small-stripes')},
    });
    await enableSiteIcons(context, newtab, {iconStyle: 'smart'});
    await seed(newtab, [{title: 'Small', url: 'https://small.example/'}]);

    const app = visual(newtab, 'Small').locator('.site-icon-smart__app');
    await expect(app).toBeVisible();
    // 32 real pixels: at most 1.5 times that
    const ratio = await newtab.evaluate(() => window.devicePixelRatio);
    expect((await app.boundingBox())!.height).toBeLessThanOrEqual(Math.round(32 / ratio * 1.5) + 1);
  });

  test('in the dark theme a white edge becomes its own plate, a black logo is drawn light', async ({context, newtab}) => {
    await serveIcons(context, newtab);
    await enableSiteIcons(context, newtab, {iconStyle: 'smart', theme: 'dark'});
    await seed(newtab, [
      {title: 'White', url: 'https://white-square.example/'},
      {title: 'Red', url: 'https://red-square.example/'},
      {title: 'Black', url: 'https://black-logo.example/'},
    ]);

    // The icon's own white square is the plate — no grey plate around it
    await expect(visual(newtab, 'White')).toHaveClass(/site-icon-smart--shape/);
    const shape = visual(newtab, 'White').locator('.site-icon-smart__shape');
    await expect(shape).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const [shapeBox, imageBox] = [await shape.boundingBox(), await shape.locator('img').boundingBox()];
    expect(Math.abs(shapeBox!.width - imageBox!.width)).toBeLessThan(2);
    await expect(visual(newtab, 'Red')).toHaveClass(/site-icon-smart--seamless/);
    // A pale plate would glare among dark tiles: the logo is drawn light right on the tile, no square around it
    await expect(visual(newtab, 'Black')).toHaveClass(/site-icon-smart--lighten/);
    await expect(visual(newtab, 'Black')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  });

  test('chosen with a button in the settings; the letter fills the area too', async ({newtab}) => {
    await seed(newtab, [{title: 'Example', url: 'https://example.com/'}]);
    const dialog = await openSettings(newtab);
    const styles = dialog.getByRole('radiogroup', {name: 'Вид иконок'});
    await expect(styles.getByRole('radio', {name: 'На подложке'})).toBeChecked();
    await styles.getByRole('radio', {name: 'По логотипу'}).check();
    await dialog.getByRole('button', {name: 'Готово'}).click();

    const area = visual(newtab, 'Example');
    await expect(area).toHaveClass(/site-icon-smart--letter/);
    await expect(area).toHaveText('E');
    const box = (await area.boundingBox())!;
    const card = (await tile(newtab, 'Example').locator('.tile__visual').boundingBox())!;
    expect(Math.round(box.width)).toBe(Math.round(card.width));
  });
});
