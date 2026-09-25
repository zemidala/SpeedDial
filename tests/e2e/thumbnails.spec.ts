import type {Page} from '@playwright/test';
import {expect, makePng, openSettings, seed, test, tile} from './fixtures';

test.use({hostAccess: true});

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

/** Окно «Значок…» закладки из контекстного меню */
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

test('снимок страницы из окна «Значок» и удаление миниатюры', async ({newtab}) => {
  const dialog = await openIconDialog(newtab, 'Shot');
  await dialog.getByRole('button', {name: 'Сделать снимок страницы'}).click();

  // Превью в окне и плитка обновляются, когда снимок готов
  await expect(dialog.getByRole('img', {name: 'Текущая картинка'})).toBeVisible({timeout: 20_000});
  const thumbnail = thumbnailOf(newtab, 'Shot');
  await expect(thumbnail).toHaveAttribute('src', /^blob:/);
  // Цвет снимка — фон страницы-заглушки
  const color = await thumbnail.evaluate(async (img: HTMLImageElement) => {
    const canvas = new OffscreenCanvas(1, 1);
    const context = canvas.getContext('2d')!;
    context.drawImage(img, img.naturalWidth - 1, img.naturalHeight - 1, 1, 1, 0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  });
  expect(color[2]).toBeGreaterThan(180); // Синий канал #00a0e0

  await dialog.getByRole('button', {name: 'Убрать картинку'}).click();
  await expect(thumbnail).toHaveCount(0);
  await dialog.getByRole('button', {name: 'Готово'}).click();
});

test('кнопка обновления миниатюр с подпапками', async ({newtab}) => {
  const dialog = await openSettings(newtab, 'Общие');
  await dialog.getByLabel('Задержка перед снимком').fill('0');
  await dialog.getByLabel('Включая подпапки').check();
  await dialog.getByRole('button', {name: 'Готово'}).click();

  await newtab.getByRole('button', {name: 'Обновить миниатюры'}).click();
  await expect(thumbnailOf(newtab, 'Shot')).toBeVisible({timeout: 30_000});

  await tile(newtab, 'Папка').click();
  await expect(thumbnailOf(newtab, 'Inner')).toBeVisible({timeout: 30_000});
});

test('создание миниатюр останавливается повторным нажатием', async ({newtab}) => {
  test.setTimeout(60_000);
  // Большая задержка перед снимком — успеем остановить, пока открыто окно первой страницы
  const settings = await openSettings(newtab, 'Общие');
  await settings.getByLabel('Задержка перед снимком').fill('6');
  await settings.getByLabel('Включая подпапки').check();
  await settings.getByRole('button', {name: 'Готово'}).click();

  await newtab.getByRole('button', {name: 'Обновить миниатюры'}).click();
  const stop = newtab.getByRole('button', {name: 'Остановить создание миниатюр'});
  await expect(stop).toHaveText('0/2');

  // Отказались останавливать — съёмка продолжается
  await stop.click();
  await newtab.getByRole('dialog', {name: 'Остановить создание миниатюр?'}).getByRole('button', {name: 'Отмена'}).click();
  await expect(stop).toBeVisible();

  await stop.click();
  await newtab.getByRole('dialog', {name: 'Остановить создание миниатюр?'}).getByRole('button', {name: 'Остановить'}).click();
  await expect(newtab.getByRole('button', {name: 'Обновить миниатюры'})).toBeVisible();

  // Окно для снимка закрыто сразу, и после истечения задержки миниатюры так и не появились
  await expect.poll(() => newtab.evaluate(async () => (await chrome.windows.getAll()).length)).toBe(1);
  await newtab.waitForTimeout(8000);
  await expect(thumbnailOf(newtab, 'Shot')).toHaveCount(0);
  await expect(newtab.getByRole('button', {name: 'Обновить миниатюры'})).toBeVisible();
});

test('снимок при создании закладки', async ({newtab}) => {
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

test('своя картинка вместо снимка; очистка миниатюр', async ({newtab}) => {
  const iconDialog = await chooseImage(newtab, 'Shot', '#ff8800');
  await iconDialog.getByRole('button', {name: 'Готово'}).click();
  await expect(thumbnailOf(newtab, 'Shot')).toBeVisible();

  const dialog = await openSettings(newtab, 'Расширенные');
  await dialog.getByRole('button', {name: 'Очистить'}).first().click();
  await newtab.getByRole('dialog', {name: 'Очистить миниатюры?'}).getByRole('button', {name: 'Очистить'}).click();
  await expect(dialog.getByRole('status')).toHaveText('Миниатюры удалены');
  await expect(thumbnailOf(newtab, 'Shot')).toHaveCount(0);
});

test('миниатюра удаляется вместе с закладкой', async ({newtab}) => {
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
