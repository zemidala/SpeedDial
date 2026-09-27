import {readFileSync} from 'node:fs';
import type {Page} from '@playwright/test';
import {expect, grantPermissions, makePng, openSettings, seed, test, tile} from './fixtures';

test.beforeEach(async ({newtab}) => {
  await seed(newtab, [{title: 'Example', url: 'https://example.com/'}]);
  await expect(tile(newtab, 'Example')).toBeVisible();
});

const storedSettings = (page: import('@playwright/test').Page, area: 'sync' | 'local') =>
  page.evaluate(async (area) => (await chrome.storage[area].get('settings')).settings as Record<string, unknown> | undefined, area);

test('settings dialog tabs', async ({newtab}) => {
  const dialog = await openSettings(newtab);
  await expect(dialog.getByRole('tab', {name: 'Вид'})).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByLabel('Светлая или тёмная')).toBeVisible();
  // Settings inside a tab are grouped into titled sections
  await expect(dialog.getByRole('heading', {level: 3}).first()).toHaveText('Язык и тема');
  const fontGroup = dialog.locator('.settings-group', {has: newtab.getByRole('heading', {name: 'Шрифт', exact: true})});
  await expect(fontGroup.getByLabel('Размер шрифта')).toBeVisible();

  await dialog.getByRole('tab', {name: 'Общие'}).click();
  await expect(dialog.getByLabel('Поисковая система')).toBeVisible();

  await dialog.getByRole('tab', {name: 'Расширенные'}).click();
  await expect(dialog.getByLabel('Пользовательский CSS')).toBeVisible();

  await newtab.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('About shows the version and build and copies the details', async ({newtab}) => {
  const dialog = await openSettings(newtab, 'О программе');
  const version = await newtab.evaluate(() => chrome.runtime.getManifest().version);
  const build = dialog.getByRole('tabpanel');
  await expect(build.getByRole('heading', {name: 'Сведения'})).toBeVisible();
  await expect(build).toContainText(version);
  // The build number is the fourth part of the version, and next to it the commit (maybe not committed yet) and date
  const buildNumber = version.split('.')[3];
  expect(buildNumber).toMatch(/^\d+$/);
  await expect(build).toContainText(new RegExp(`${buildNumber}\\s*\\([0-9a-f]{7,}(, не закоммичена)?\\)\\s*· `));
  await expect(build).toContainText(`Версия ${version}`);
  await expect(build).toContainText(await newtab.evaluate(() => chrome.runtime.id));
  await expect(build).toContainText('Разработка (распакованное)');

  // Copying writes the plain-text summary; the page can't read the clipboard, so record the write
  await newtab.evaluate(() => {
    Object.assign(window, {copied: ''});
    navigator.clipboard.writeText = async (text: string) => {
      (window as unknown as {copied: string}).copied = text;
    };
  });
  await dialog.getByRole('button', {name: 'Скопировать сведения'}).click();
  await expect(dialog.getByRole('status')).toHaveText('Сведения скопированы');
  expect(await newtab.evaluate(() => (window as unknown as {copied: string}).copied)).toMatch(new RegExp(`^SpeedDial ${version}\\nСборка: \\d+ \\(`));

  // Donation placeholder and the welcome page
  await expect(dialog.getByRole('link', {name: '♥ Поддержать автора'})).toHaveAttribute('href', /^https:\/\/boosty\.to\//);
  const welcome = newtab.context().waitForEvent('page');
  await dialog.getByRole('link', {name: 'Страница приветствия'}).click();
  const page = await welcome;
  await expect(page.getByRole('heading', {name: 'Спасибо за установку SpeedDial!'})).toBeVisible();
  await expect(page.getByRole('link', {name: '♥ Поддержать автора'})).toHaveAttribute('href', /^https:\/\/boosty\.to\//);
  await page.getByRole('link', {name: 'Открыть SpeedDial'}).click();
  await expect(page).toHaveURL(/newtab\.html$/);
});

test('exporting and importing settings', async ({newtab}) => {
  const dialog = await openSettings(newtab);
  await dialog.getByLabel('Количество колонок').selectOption('4');

  await dialog.getByRole('tab', {name: 'Расширенные'}).click();
  const download = newtab.waitForEvent('download');
  await dialog.getByRole('button', {name: 'Экспорт', exact: true}).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^speeddial-settings-\d{4}-\d{2}-\d{2}\.json$/);

  const exported = JSON.parse(readFileSync((await file.path())!, 'utf8'));
  expect(exported).toMatchObject({format: 'speeddial-settings', version: 1, settings: {columns: 4}});
  expect(exported.settings).not.toHaveProperty('defaultFolderId'); // Local settings aren't exported

  // Import: a file with a different column count and garbage
  const chooser = newtab.waitForEvent('filechooser');
  await dialog.getByRole('button', {name: 'Импорт…'}).click();
  const imported = {...exported, settings: {...exported.settings, columns: 8, theme: 'purple', unknown: 1}};
  await (await chooser).setFiles({name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported))});
  await expect(dialog.getByRole('status')).toHaveText('Настройки импортированы');

  await dialog.getByRole('tab', {name: 'Вид'}).click();
  await expect(dialog.getByLabel('Количество колонок')).toHaveValue('8');
  await expect(dialog.getByLabel('Светлая или тёмная')).toHaveValue('auto'); // The invalid value was dropped

  // A foreign file
  await dialog.getByRole('tab', {name: 'Расширенные'}).click();
  const wrongChooser = newtab.waitForEvent('filechooser');
  await dialog.getByRole('button', {name: 'Импорт…'}).click();
  await (await wrongChooser).setFiles({name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}')});
  await expect(dialog.getByRole('status')).toHaveText('Это не файл настроек SpeedDial');
});

test('resetting settings', async ({newtab}) => {
  const dialog = await openSettings(newtab);
  await dialog.getByLabel('Количество колонок').selectOption('2');

  await dialog.getByRole('tab', {name: 'Расширенные'}).click();
  await dialog.getByRole('button', {name: 'Сбросить'}).click();
  await newtab.getByRole('dialog', {name: 'Сбросить настройки?'}).getByRole('button', {name: 'Сбросить'}).click();
  await expect(dialog.getByRole('status')).toHaveText('Настройки сброшены');

  await dialog.getByRole('tab', {name: 'Вид'}).click();
  await expect(dialog.getByLabel('Количество колонок')).toHaveValue('6');
});

test('with sync off, settings stay on the device only', async ({newtab}) => {
  const dialog = await openSettings(newtab, 'Общие');
  await dialog.getByLabel('Включить синхронизацию').uncheck();
  await dialog.getByRole('tab', {name: 'Вид'}).click();
  await dialog.getByLabel('Количество колонок').selectOption('5');

  await expect.poll(() => storedSettings(newtab, 'local')).toMatchObject({columns: 5});
  expect((await storedSettings(newtab, 'sync'))?.columns).not.toBe(5);

  // After a reload settings are read from local storage
  await newtab.evaluate(() => localStorage.clear());
  await newtab.reload();
  const reopened = await openSettings(newtab);
  await expect(reopened.getByLabel('Количество колонок')).toHaveValue('5');
});

test('deleting synced data', async ({newtab}) => {
  const dialog = await openSettings(newtab);
  await dialog.getByLabel('Количество колонок').selectOption('3');
  await expect.poll(() => storedSettings(newtab, 'sync')).toMatchObject({columns: 3});

  await dialog.getByRole('tab', {name: 'Расширенные'}).click();
  await dialog.getByRole('button', {name: 'Удалить', exact: true}).click();
  await newtab.getByRole('dialog', {name: 'Удалить данные из аккаунта?'}).getByRole('button', {name: 'Удалить'}).click();
  await expect(dialog.getByRole('status')).toHaveText('Синхронизированные данные удалены');
  expect(await storedSettings(newtab, 'sync')).toBeUndefined();
});

test('a permission request error is visible on the page', async ({context, newtab}) => {
  // The browser answers like this if the extension wasn't reloaded after the files changed and the manifest is stale
  await context.addInitScript(() => {
    Object.defineProperty(chrome.permissions, 'request', {
      value: async () => {
        throw new Error('Only permissions specified in the manifest may be requested.');
      },
    });
  });
  await newtab.reload();

  const dialog = await openSettings(newtab, 'Расширенные');
  await dialog.getByLabel('Доступ к сайтам').click();

  const notice = newtab.getByRole('alert').filter({hasText: 'устаревшую версию расширения'});
  await expect(notice).toBeVisible();
  await expect(dialog.getByLabel('Доступ к сайтам')).not.toBeChecked();

  await notice.getByRole('button', {name: 'Закрыть уведомление'}).click();
  await expect(notice).toHaveCount(0);

  // With no dialogs open the notification shows on the page itself — e.g. after "Take a page screenshot"
  await dialog.getByRole('button', {name: 'Готово'}).click();
  await newtab.evaluate(() => chrome.bookmarks.create({parentId: '1', title: 'Снимок', url: 'https://shot.example/'}));
  await tile(newtab, 'Снимок').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Значок…'}).click();
  await newtab.getByRole('dialog').getByRole('button', {name: 'Сделать снимок страницы'}).click();
  await expect(notice).toBeVisible();
  await notice.getByRole('button', {name: 'Закрыть уведомление'}).click();
  await expect(notice).toHaveCount(0);
});

test('automatic thumbnails point out the missing site access', async ({newtab}) => {
  const dialog = await openSettings(newtab, 'Общие');
  await expect(dialog.getByLabel('Автоматические миниатюры')).toHaveValue('missing');
  await expect(dialog.getByText('Нужен доступ к сайтам')).toBeVisible();

  await dialog.getByLabel('Автоматические миниатюры').selectOption('Выключены');
  await expect(dialog.getByText('Нужен доступ к сайтам')).toHaveCount(0);
});

test('"Bing image of the day" background with caption and cache', async ({context, newtab}) => {
  let apiRequests = 0;
  const image = await makePng(newtab, 64, '#205080');
  await context.route('https://www.bing.com/**', (route) => {
    const url = new URL(route.request().url());
    const headers = {'Access-Control-Allow-Origin': '*'};
    if (url.pathname === '/HPImageArchive.aspx') {
      apiRequests++;
      expect(url.searchParams.get('mkt')).toBe('ru-RU'); // Language of the test browser
      return route.fulfill({headers, contentType: 'application/json', body: JSON.stringify({
        images: [{
          url: '/th?id=OHR.Test_1920x1080.jpg',
          urlbase: '/th?id=OHR.Test',
          fullstartdate: '209901010700', // The image is "still fresh" — taken from the cache
          title: 'Горное озеро',
          copyright: 'Озеро в горах (© Фотограф)',
          copyrightlink: '/search?q=lake',
        }],
      })});
    }
    return route.fulfill({headers, contentType: 'image/png', body: image});
  });
  await grantPermissions(context);
  await newtab.reload();

  const dialog = await openSettings(newtab);
  await dialog.getByLabel('Фон', {exact: true}).selectOption('bing');
  await dialog.getByRole('button', {name: 'Готово'}).click();

  await expect.poll(backgroundLayer(newtab, 'background-image')).toContain('url("https://www.bing.com/th?id=OHR.Test_1920x1080.jpg")');
  const caption = newtab.getByRole('link', {name: 'Горное озеро'});
  await expect(caption).toHaveAttribute('href', 'https://www.bing.com/search?q=lake');
  await expect(newtab.getByText('Озеро в горах (© Фотограф)')).toBeVisible();

  // While the image is current, Bing isn't requested again
  await newtab.reload();
  await expect.poll(backgroundLayer(newtab, 'background-image')).toMatch(/OHR\.Test/);
  expect(apiRequests).toBe(1);
});

/** A property of the background image layer (the body pseudo-element) */
const backgroundLayer = (page: Page, property: string) =>
  () => page.evaluate((property) => getComputedStyle(document.body, '::before').getPropertyValue(property), property);

test('background image', async ({newtab}) => {
  const dialog = await openSettings(newtab);
  await dialog.getByLabel('Фон', {exact: true}).selectOption('image');
  const chooser = newtab.waitForEvent('filechooser');
  await dialog.getByRole('button', {name: 'Выбрать файл…'}).click();
  await (await chooser).setFiles({name: 'bg.png', mimeType: 'image/png', buffer: await makePng(newtab, 64, '#123456')});

  await expect(newtab.locator('body')).toHaveClass(/page--background-image/);
  await expect.poll(backgroundLayer(newtab, 'background-image')).toMatch(/url\("blob:/);

  // Blur and dimming apply only to the image layer; tiles stay sharp
  await dialog.getByLabel('Размытие фона').fill('8');
  await dialog.getByLabel('Затемнение фона').fill('40');
  await expect.poll(backgroundLayer(newtab, 'filter')).toBe('blur(8px)');
  await expect.poll(backgroundLayer(newtab, 'background-image')).toContain('rgba(0, 0, 0, 0.4)');
  await expect(newtab.locator('.app')).toHaveCSS('filter', 'none');

  await dialog.getByRole('button', {name: 'Убрать'}).click();
  await expect(newtab.locator('body')).not.toHaveClass(/page--background-image/);
});

test('background image from a link: checked before it\'s used', async ({context, newtab}) => {
  const png = await makePng(newtab, 64, '#654321');
  await context.route('https://pictures.example/**', (route) => (route.request().url().endsWith('/sky.png')
    ? route.fulfill({contentType: 'image/png', body: png})
    : route.fulfill({status: 404})));
  const dialog = await openSettings(newtab);
  await dialog.getByLabel('Фон', {exact: true}).selectOption('url');
  const field = dialog.getByLabel('Ссылка на картинку');

  // A link that doesn't lead to a picture is pointed out and not used
  await field.fill('pictures.example/missing.png');
  await field.blur();
  await expect(dialog.getByText('Картинка по этой ссылке не загрузилась — проверьте адрес')).toBeVisible();
  await expect(newtab.locator('body')).not.toHaveClass(/page--background-image/);

  await field.fill('pictures.example/sky.png');
  await field.blur();
  await expect(field).toHaveValue('https://pictures.example/sky.png');
  await expect(newtab.locator('body')).toHaveClass(/page--background-image/);
  await expect.poll(backgroundLayer(newtab, 'background-image')).toContain('url("https://pictures.example/sky.png")');
  // Blur and dimming work for it too
  await expect(dialog.getByLabel('Размытие фона')).toBeVisible();
});

test('after an update to a new release the new tab tells what\'s new, once', async ({newtab}) => {
  // What the service worker leaves after an update from 1.9.0 to this release
  await newtab.evaluate(() => chrome.storage.local.set({whatsNewPending: '2.0.0'}));
  await newtab.reload();
  const notice = newtab.getByRole('status').filter({hasText: 'SpeedDial обновлён до версии 2.0.0'});
  await notice.getByRole('button', {name: 'Что нового'}).click();

  const dialog = newtab.getByRole('dialog', {name: 'Настройки'});
  await expect(dialog.getByRole('heading', {name: 'Что нового в версии 2.0.0'})).toBeVisible();
  await expect(dialog.getByText('Поиск дублей закладок')).toBeVisible();

  // Told once
  await newtab.reload();
  await expect(tile(newtab, 'Example')).toBeVisible();
  await newtab.waitForTimeout(500);
  await expect(newtab.getByRole('status').filter({hasText: 'обновлён до версии'})).toHaveCount(0);
});

test('a click outside closes the settings if nothing was changed, and keeps them open otherwise', async ({newtab}) => {
  let dialog = await openSettings(newtab);
  await newtab.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);

  dialog = await openSettings(newtab);
  await dialog.getByLabel('Количество колонок').selectOption('3');
  await newtab.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  // Selecting text that ends outside the window doesn't close it either
  await dialog.getByRole('button', {name: 'Готово'}).click();
  await expect(dialog).toHaveCount(0);
});

test('changes since the settings opened are marked on their rows and tabs', async ({newtab}) => {
  const dialog = await openSettings(newtab);
  const viewTab = dialog.getByRole('tab', {name: /Вид/});
  const changedMark = (tab: import('@playwright/test').Locator) => tab.locator('.settings-tabs__changed');
  await expect(changedMark(viewTab)).toHaveCount(0);

  await dialog.getByLabel('Количество колонок').selectOption('3');
  const row = dialog.locator('.setting-row', {has: newtab.getByLabel('Количество колонок')});
  await expect(row).toHaveClass(/setting-row--changed/);
  await expect(changedMark(viewTab)).toHaveCount(1);

  // Seen from another tab too
  await dialog.getByRole('tab', {name: /Общие/}).click();
  await expect(changedMark(viewTab)).toHaveCount(1);
  await expect(changedMark(dialog.getByRole('tab', {name: /Общие/}))).toHaveCount(0);

  // Put back as it was — nothing is marked any more
  await viewTab.click();
  await dialog.getByLabel('Количество колонок').selectOption('6');
  await expect(changedMark(viewTab)).toHaveCount(0);
  await expect(row).not.toHaveClass(/setting-row--changed/);
});
