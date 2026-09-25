import {expect, seed, test, tile} from './fixtures';

const LIGHT_SURFACE = 'rgb(255, 255, 255)';
const DARK_SURFACE = 'rgb(35, 38, 45)'; // #23262d

test.beforeEach(async ({newtab}) => {
  await seed(newtab, [{title: 'Example', url: 'https://example.com/'}]);
  await expect(tile(newtab, 'Example')).toBeVisible();
});

function surfaceColor(page: import('@playwright/test').Page) {
  return () => page.locator('.breadcrumbs').evaluate((el) => getComputedStyle(el).backgroundColor);
}

test('тема по умолчанию следует за системой', async ({newtab}) => {
  await newtab.emulateMedia({colorScheme: 'dark'});
  await expect.poll(surfaceColor(newtab)).toBe(DARK_SURFACE);

  await newtab.emulateMedia({colorScheme: 'light'});
  await expect.poll(surfaceColor(newtab)).toBe(LIGHT_SURFACE);
});

test('переключение темы кнопкой и в настройках', async ({newtab}) => {
  await newtab.emulateMedia({colorScheme: 'light'});

  await newtab.getByRole('button', {name: 'Включить тёмную тему'}).click();
  await expect(newtab.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(surfaceColor(newtab)).toBe(DARK_SURFACE);

  await newtab.getByRole('button', {name: 'Включить светлую тему'}).click();
  await expect(newtab.locator('html')).toHaveAttribute('data-theme', 'light');

  // «Системная» убирает явный выбор
  await newtab.getByRole('button', {name: 'Настройки'}).click();
  await newtab.getByText('Системная').click();
  await expect(newtab.locator('html')).not.toHaveAttribute('data-theme');
  await expect(newtab.getByRole('radio', {name: 'Системная'})).toBeChecked();
});

test('тема применяется до первой отрисовки, без вспышки', async ({context, newtab}) => {
  await newtab.getByRole('button', {name: 'Включить тёмную тему'}).click();
  await expect(newtab.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Запоминаем тему в момент, когда парсер только дошёл до <body>, — до запуска приложения
  await context.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (!document.body) return;
      (window as unknown as {themeAtBody: string | null}).themeAtBody = document.documentElement.dataset.theme ?? null;
      observer.disconnect();
    }).observe(document, {childList: true, subtree: true});
  });
  await newtab.reload();

  expect(await newtab.evaluate(() => (window as unknown as {themeAtBody: string | null}).themeAtBody)).toBe('dark');
});

test('свой цвет плитки с читаемым текстом в тёмной теме', async ({newtab}) => {
  await newtab.emulateMedia({colorScheme: 'dark'});
  await newtab.getByRole('button', {name: 'Настройки'}).click();

  const reset = newtab.getByRole('button', {name: 'Сбросить'}).first();
  await expect(reset).toBeDisabled();
  await newtab.getByLabel('Цвет плитки').fill('#ffffff');

  // Подкрашивание отключаем, чтобы проверить чистый цвет
  await newtab.getByLabel('Подкрашивать плитку цветом иконки').uncheck();
  const example = tile(newtab, 'Example');
  await expect(example).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(example).toHaveCSS('color', 'rgb(31, 35, 40)');

  await reset.click();
  await expect(example).toHaveCSS('background-color', 'rgb(38, 42, 49)');
});

test('вместо стандартного глобуса — цветная буква сайта', async ({newtab}) => {
  // В чистом профиле браузер не знает иконок сайтов и отдаёт глобус
  const plate = tile(newtab, 'Example').locator('.plate');
  await expect(plate).toHaveClass(/letter/);
  await expect(plate).toHaveText('E');
});

test('иконка высокого качества с сайта', async ({context, newtab}) => {
  // Иконка 180×180 со сплошным фоном
  const png = await newtab.evaluate(async () => {
    const canvas = new OffscreenCanvas(180, 180);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#d03030';
    context.fillRect(0, 0, 180, 180);
    const blob = await canvas.convertToBlob({type: 'image/png'});
    return [...new Uint8Array(await blob.arrayBuffer())];
  });

  // Сайт: страница объявляет apple-touch-icon. CORS-заголовок заменяет разрешение на доступ к сайту
  const headers = {'Access-Control-Allow-Origin': '*'};
  await context.route('https://hq.example/**', (route) => {
    const {pathname} = new URL(route.request().url());
    if (pathname === '/') {
      return route.fulfill({headers, contentType: 'text/html', body: '<link rel="apple-touch-icon" href="/touch.png">'});
    }
    if (pathname === '/touch.png') {
      return route.fulfill({headers, contentType: 'image/png', body: Buffer.from(png)});
    }
    return route.fulfill({headers, status: 404});
  });

  // Окно запроса разрешения — это интерфейс браузера, в тесте его не нажать; имитируем выданное
  await context.addInitScript(() => {
    Object.defineProperty(chrome.permissions, 'contains', {value: async () => true});
  });
  await newtab.evaluate(() => chrome.storage.sync.set({settings: {hqIcons: true}}));
  await newtab.reload();
  await seed(newtab, [{title: 'HQ', url: 'https://hq.example/'}]);

  const hq = tile(newtab, 'HQ');
  await expect(hq.locator('.plate img')).toHaveAttribute('src', /^blob:/);
  await expect(hq.locator('.plate')).toHaveClass(/fill/);
  expect(await hq.evaluate((el) => el.style.getPropertyValue('--icon-color'))).toBe('#d03030');

  // Иконка сохранена и после перезагрузки берётся из кэша, без запросов к сайту
  await context.unroute('https://hq.example/**');
  await context.route('https://hq.example/**', (route) => route.abort());
  await newtab.reload();
  await expect(tile(newtab, 'HQ').locator('.plate img')).toHaveAttribute('src', /^blob:/);
});
