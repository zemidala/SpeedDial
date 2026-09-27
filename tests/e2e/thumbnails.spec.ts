import type {Page} from '@playwright/test';
import {expect, makePng, openSettings, seed, test, tile} from './fixtures';

test.use({hostAccess: true});
// Screenshots need real windows to be drawn; with many browsers running in parallel one sometimes isn't ready in time
test.describe.configure({retries: 2});

test.beforeEach(async ({context, newtab}) => {
  await context.route('https://shot.example/**', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<body style="margin:0;background:#00a0e0"><h1>Снимок</h1></body>',
  }));
  await seed(newtab, [
    {title: 'Shot', url: 'https://shot.example/'},
    {title: 'Папка', children: [{title: 'Inner', url: 'https://shot.example/inner'}]},
  ]);
  await expect(tile(newtab, 'Shot')).toBeVisible();
});

const thumbnailOf = (page: Page, title: string) => tile(page, title).locator('.tile__thumbnail');

/** The bookmark's "Icon…" dialog from the context menu */
async function openIconDialog(page: Page, title: string) {
  await tile(page, title).click({button: 'right'});
  await page.getByRole('menuitem', {name: 'Значок…'}).click();
  return page.getByRole('dialog', {name: `Значок «${title}»`});
}

async function chooseImage(page: Page, title: string, color: string) {
  const dialog = await openIconDialog(page, title);
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', {name: 'Выбрать картинку…'}).click();
  await (await chooser).setFiles({name: 'logo.png', mimeType: 'image/png', buffer: await makePng(page, 300, color)});
  await expect(dialog.getByRole('status')).toHaveText('Картинка обновлена');
  return dialog;
}

test('page screenshot from the "Icon" dialog and removing the thumbnail', async ({newtab}) => {
  const dialog = await openIconDialog(newtab, 'Shot');
  await dialog.getByRole('button', {name: 'Сделать снимок страницы'}).click();

  // The preview in the dialog and the tile update when the screenshot is ready
  await expect(dialog.getByRole('img', {name: 'Текущая картинка'})).toBeVisible({timeout: 20_000});
  const thumbnail = thumbnailOf(newtab, 'Shot');
  await expect(thumbnail).toHaveAttribute('src', /^blob:/);
  // The screenshot colour is the stub page's background
  const color = await thumbnail.evaluate(async (img: HTMLImageElement) => {
    const canvas = new OffscreenCanvas(1, 1);
    const context = canvas.getContext('2d')!;
    context.drawImage(img, img.naturalWidth - 1, img.naturalHeight - 1, 1, 1, 0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  });
  expect(color[2]).toBeGreaterThan(180); // Blue channel of #00a0e0

  await dialog.getByRole('button', {name: 'Убрать картинку'}).click();
  await expect(thumbnail).toHaveCount(0);
  await dialog.getByRole('button', {name: 'Готово'}).click();
});

test('thumbnail refresh button with subfolders', async ({newtab}) => {
  const dialog = await openSettings(newtab, 'Общие');
  await dialog.getByLabel('Задержка перед снимком').fill('0');
  await dialog.getByLabel('Включая подпапки').check();
  await dialog.getByRole('button', {name: 'Готово'}).click();

  await newtab.getByRole('button', {name: 'Обновить миниатюры'}).click();
  await expect(thumbnailOf(newtab, 'Shot')).toBeVisible({timeout: 30_000});

  await tile(newtab, 'Папка').click();
  await expect(thumbnailOf(newtab, 'Inner')).toBeVisible({timeout: 30_000});
});

test('creating thumbnails stops on a second press', async ({newtab}) => {
  test.setTimeout(60_000);
  // A long delay before the screenshot — enough time to stop while the first page's window is open
  const settings = await openSettings(newtab, 'Общие');
  await settings.getByLabel('Задержка перед снимком').fill('6');
  await settings.getByLabel('Включая подпапки').check();
  await settings.getByRole('button', {name: 'Готово'}).click();

  await newtab.getByRole('button', {name: 'Обновить миниатюры'}).click();
  const stop = newtab.getByRole('button', {name: 'Остановить создание миниатюр'});
  await expect(stop).toHaveText('0/2');

  // A tab opened mid-capture also offers to stop it. Wait for the screenshot window: capturing is under way
  await expect.poll(() => newtab.evaluate(async () => (await chrome.windows.getAll()).length)).toBe(2);
  await newtab.reload();
  await expect(stop).toHaveText('0/2');

  // Declined to stop — capturing continues
  await stop.click();
  await newtab.getByRole('dialog', {name: 'Остановить создание миниатюр?'}).getByRole('button', {name: 'Отмена'}).click();
  await expect(stop).toBeVisible();

  await stop.click();
  await newtab.getByRole('dialog', {name: 'Остановить создание миниатюр?'}).getByRole('button', {name: 'Остановить'}).click();
  await expect(newtab.getByRole('button', {name: 'Обновить миниатюры'})).toBeVisible();

  // The screenshot window closed right away, and after the delay no thumbnails appeared
  await expect.poll(() => newtab.evaluate(async () => (await chrome.windows.getAll()).length)).toBe(1);
  await newtab.waitForTimeout(8000);
  await expect(thumbnailOf(newtab, 'Shot')).toHaveCount(0);
  await expect(newtab.getByRole('button', {name: 'Обновить миниатюры'})).toBeVisible();
});

test('screenshot when creating a bookmark', async ({newtab}) => {
  const dialog = await openSettings(newtab, 'Общие');
  await dialog.getByLabel('Снимок страницы при создании закладки').check();
  await dialog.getByRole('button', {name: 'Готово'}).click();

  await newtab.getByRole('button', {name: 'Добавить закладку'}).click();
  const form = newtab.getByRole('dialog', {name: 'Новая закладка'});
  await form.getByLabel('Название').fill('Новая');
  await form.getByLabel('Адрес').fill('shot.example/new');
  await form.getByRole('button', {name: 'Создать'}).click();

  await expect(thumbnailOf(newtab, 'Новая')).toBeVisible({timeout: 20_000});
});

test('custom image instead of a screenshot; clearing thumbnails', async ({newtab}) => {
  const iconDialog = await chooseImage(newtab, 'Shot', '#ff8800');
  await iconDialog.getByRole('button', {name: 'Готово'}).click();
  await expect(thumbnailOf(newtab, 'Shot')).toBeVisible();

  const dialog = await openSettings(newtab, 'Расширенные');
  await dialog.getByRole('button', {name: 'Очистить'}).first().click();
  await newtab.getByRole('dialog', {name: 'Очистить миниатюры?'}).getByRole('button', {name: 'Очистить'}).click();
  await expect(dialog.getByRole('status')).toHaveText('Миниатюры удалены');
  await expect(thumbnailOf(newtab, 'Shot')).toHaveCount(0);
});

test('undoing a deletion brings back thumbnails too', async ({newtab}) => {
  await tile(newtab, 'Папка').click();
  const iconDialog = await chooseImage(newtab, 'Inner', '#ff00ff');
  await iconDialog.getByRole('button', {name: 'Готово'}).click();
  await newtab.getByRole('navigation', {name: 'Путь к папке'}).getByRole('button', {name: 'Панель закладок'}).click();

  await tile(newtab, 'Папка').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Удалить', exact: true}).click();
  await expect(tile(newtab, 'Папка')).toHaveCount(0);
  await newtab.getByRole('button', {name: 'Отменить'}).click();

  await tile(newtab, 'Папка').click();
  await expect(thumbnailOf(newtab, 'Inner')).toBeVisible();
});

test('a thumbnail is removed together with its bookmark', async ({newtab}) => {
  const iconDialog = await chooseImage(newtab, 'Shot', '#00ff00');
  await iconDialog.getByRole('button', {name: 'Готово'}).click();
  const id = await tile(newtab, 'Shot').getAttribute('data-bookmark-id');
  await expect(thumbnailOf(newtab, 'Shot')).toBeVisible();

  await newtab.evaluate((id) => chrome.bookmarks.remove(id), id!);
  await expect.poll(() => newtab.evaluate((id) => new Promise((resolve) => {
    const request = indexedDB.open('speeddial');
    request.onsuccess = () => {
      const get = request.result.transaction('thumbnails').objectStore('thumbnails').get(id);
      get.onsuccess = () => resolve(get.result === undefined);
    };
  }), id!)).toBe(true);
});

test.describe('automatic thumbnails', () => {
  test.beforeEach(async ({context}) => {
    await context.route('https://auto.example/**', (route) => route.fulfill({
      contentType: 'text/html',
      body: '<body style="margin:0;background:#e02000"><h1>Auto</h1></body>',
    }));
  });

  test('opening a bookmarked site makes its thumbnail', async ({context, newtab}) => {
    await seed(newtab, [
      {title: 'Auto', url: 'https://auto.example/page'},
      {title: 'Copy', url: 'http://www.auto.example/page/'},
      {title: 'Other', url: 'https://auto.example/other'},
    ]);
    await expect(tile(newtab, 'Auto')).toBeVisible();

    const site = await context.newPage();
    await site.goto('https://auto.example/page#section');

    // Both bookmarks of the page get the screenshot; the tab isn't opened anywhere else
    await expect(thumbnailOf(newtab, 'Auto')).toBeVisible({timeout: 15_000});
    await expect(thumbnailOf(newtab, 'Copy')).toBeVisible();
    await expect(thumbnailOf(newtab, 'Other')).toHaveCount(0);
    expect(await newtab.evaluate(async () => (await chrome.windows.getAll()).length)).toBe(1);

    const color = await thumbnailOf(newtab, 'Auto').evaluate(async (img: HTMLImageElement) => {
      const canvas = new OffscreenCanvas(1, 1);
      const context = canvas.getContext('2d')!;
      context.drawImage(img, img.naturalWidth - 1, img.naturalHeight - 1, 1, 1, 0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    });
    expect(color[0]).toBeGreaterThan(180); // Red channel of #e02000
    // The usual thumbnail proportions whatever the window shape
    const ratio = await thumbnailOf(newtab, 'Auto').evaluate((img: HTMLImageElement) => img.naturalWidth / img.naturalHeight);
    expect(ratio).toBeCloseTo(1.6, 1);
  });

  test('a custom image is kept; nothing happens when turned off', async ({context, newtab}) => {
    await seed(newtab, [
      {title: 'Auto', url: 'https://auto.example/'},
      {title: 'Off', url: 'https://auto.example/off'},
    ]);
    const iconDialog = await chooseImage(newtab, 'Auto', '#00ff00');
    await iconDialog.getByRole('button', {name: 'Готово'}).click();
    const custom = await thumbnailOf(newtab, 'Auto').getAttribute('src');

    const dialog = await openSettings(newtab, 'Общие');
    await dialog.getByLabel('Автоматические миниатюры').selectOption('Выключены');
    await dialog.getByRole('button', {name: 'Готово'}).click();

    const site = await context.newPage();
    await site.goto('https://auto.example/');
    await site.goto('https://auto.example/off');
    await site.waitForTimeout(3000);
    await expect(thumbnailOf(newtab, 'Auto')).toHaveAttribute('src', custom!);
    await expect(thumbnailOf(newtab, 'Off')).toHaveCount(0);
  });
});
