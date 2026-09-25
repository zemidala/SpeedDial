import {readFileSync} from 'node:fs';
import {expect, grantPermissions, makePng, openSettings, seed, test, tile} from './fixtures';

test.beforeEach(async ({newtab}) => {
  await seed(newtab, [{title: 'Example', url: 'https://example.com/'}]);
  await expect(tile(newtab, 'Example')).toBeVisible();
});

const storedSettings = (page: import('@playwright/test').Page, area: 'sync' | 'local') =>
  page.evaluate(async (area) => (await chrome.storage[area].get('settings')).settings as Record<string, unknown> | undefined, area);

test('вкладки окна настроек', async ({newtab}) => {
  const dialog = await openSettings(newtab);
  await expect(dialog.getByRole('tab', {name: 'Вид'})).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByLabel('Светлая или тёмная')).toBeVisible();

  await dialog.getByRole('tab', {name: 'Общие'}).click();
  await expect(dialog.getByLabel('Поисковая система')).toBeVisible();

  await dialog.getByRole('tab', {name: 'Расширенные'}).click();
  await expect(dialog.getByLabel('Пользовательский CSS')).toBeVisible();

  await newtab.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('экспорт и импорт настроек', async ({newtab}) => {
  const dialog = await openSettings(newtab);
  await dialog.getByLabel('Количество колонок').selectOption('4');

  await dialog.getByRole('tab', {name: 'Расширенные'}).click();
  const download = newtab.waitForEvent('download');
  await dialog.getByRole('button', {name: 'Экспорт', exact: true}).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^speeddial-settings-\d{4}-\d{2}-\d{2}\.json$/);

  const exported = JSON.parse(readFileSync((await file.path())!, 'utf8'));
  expect(exported).toMatchObject({format: 'speeddial-settings', version: 1, settings: {columns: 4}});
  expect(exported.settings).not.toHaveProperty('defaultFolderId'); // Локальные настройки не выгружаются

  // Импорт: файл с другим числом колонок и мусором
  const chooser = newtab.waitForEvent('filechooser');
  await dialog.getByRole('button', {name: 'Импорт…'}).click();
  const imported = {...exported, settings: {...exported.settings, columns: 8, theme: 'purple', unknown: 1}};
  await (await chooser).setFiles({name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported))});
  await expect(dialog.getByRole('status')).toHaveText('Настройки импортированы');

  await dialog.getByRole('tab', {name: 'Вид'}).click();
  await expect(dialog.getByLabel('Количество колонок')).toHaveValue('8');
  await expect(dialog.getByLabel('Светлая или тёмная')).toHaveValue('auto'); // Некорректное значение отброшено

  // Чужой файл
  await dialog.getByRole('tab', {name: 'Расширенные'}).click();
  const wrongChooser = newtab.waitForEvent('filechooser');
  await dialog.getByRole('button', {name: 'Импорт…'}).click();
  await (await wrongChooser).setFiles({name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}')});
  await expect(dialog.getByRole('status')).toHaveText('Это не файл настроек SpeedDial');
});

test('сброс настроек', async ({newtab}) => {
  const dialog = await openSettings(newtab);
  await dialog.getByLabel('Количество колонок').selectOption('2');

  await dialog.getByRole('tab', {name: 'Расширенные'}).click();
  await dialog.getByRole('button', {name: 'Сбросить'}).click();
  await newtab.getByRole('dialog', {name: 'Сбросить настройки?'}).getByRole('button', {name: 'Сбросить'}).click();
  await expect(dialog.getByRole('status')).toHaveText('Настройки сброшены');

  await dialog.getByRole('tab', {name: 'Вид'}).click();
  await expect(dialog.getByLabel('Количество колонок')).toHaveValue('6');
});

test('выключенная синхронизация хранит настройки только на устройстве', async ({newtab}) => {
  const dialog = await openSettings(newtab, 'Общие');
  await dialog.getByLabel('Включить синхронизацию').uncheck();
  await dialog.getByRole('tab', {name: 'Вид'}).click();
  await dialog.getByLabel('Количество колонок').selectOption('5');

  await expect.poll(() => storedSettings(newtab, 'local')).toMatchObject({columns: 5});
  expect((await storedSettings(newtab, 'sync'))?.columns).not.toBe(5);

  // После перезагрузки настройки читаются из локального хранилища
  await newtab.evaluate(() => localStorage.clear());
  await newtab.reload();
  const reopened = await openSettings(newtab);
  await expect(reopened.getByLabel('Количество колонок')).toHaveValue('5');
});

test('удаление синхронизированных данных', async ({newtab}) => {
  const dialog = await openSettings(newtab);
  await dialog.getByLabel('Количество колонок').selectOption('3');
  await expect.poll(() => storedSettings(newtab, 'sync')).toMatchObject({columns: 3});

  await dialog.getByRole('tab', {name: 'Расширенные'}).click();
  await dialog.getByRole('button', {name: 'Удалить', exact: true}).click();
  await newtab.getByRole('dialog', {name: 'Удалить данные из аккаунта?'}).getByRole('button', {name: 'Удалить'}).click();
  await expect(dialog.getByRole('status')).toHaveText('Синхронизированные данные удалены');
  expect(await storedSettings(newtab, 'sync')).toBeUndefined();
});

test('ошибка запроса разрешения видна на странице', async ({context, newtab}) => {
  // Так браузер отвечает, если после обновления файлов расширение не перезагрузили и манифест устарел
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

  // Без открытых окон уведомление показывается на самой странице — например, после «Сделать снимок страницы»
  await dialog.getByRole('button', {name: 'Готово'}).click();
  await newtab.evaluate(() => chrome.bookmarks.create({parentId: '1', title: 'Снимок', url: 'https://shot.example/'}));
  await tile(newtab, 'Снимок').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Значок…'}).click();
  await newtab.getByRole('dialog').getByRole('button', {name: 'Сделать снимок страницы'}).click();
  await expect(notice).toBeVisible();
  await notice.getByRole('button', {name: 'Закрыть уведомление'}).click();
  await expect(notice).toHaveCount(0);
});

test('фон «Картинка дня Bing» с подписью и кэшем', async ({context, newtab}) => {
  let apiRequests = 0;
  const image = await makePng(newtab, 64, '#205080');
  await context.route('https://www.bing.com/**', (route) => {
    const url = new URL(route.request().url());
    const headers = {'Access-Control-Allow-Origin': '*'};
    if (url.pathname === '/HPImageArchive.aspx') {
      apiRequests++;
      expect(url.searchParams.get('mkt')).toBe('en-US'); // Язык тестового браузера
      return route.fulfill({headers, contentType: 'application/json', body: JSON.stringify({
        images: [{
          url: '/th?id=OHR.Test_1920x1080.jpg',
          urlbase: '/th?id=OHR.Test',
          fullstartdate: '209901010700', // Картинка «ещё свежая» — берётся из кэша
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

  await expect(newtab.locator('body')).toHaveCSS('background-image', 'url("https://www.bing.com/th?id=OHR.Test_1920x1080.jpg")');
  const caption = newtab.getByRole('link', {name: 'Горное озеро'});
  await expect(caption).toHaveAttribute('href', 'https://www.bing.com/search?q=lake');
  await expect(newtab.getByText('Озеро в горах (© Фотограф)')).toBeVisible();

  // Пока картинка актуальна, Bing повторно не запрашивается
  await newtab.reload();
  await expect(newtab.locator('body')).toHaveCSS('background-image', /OHR\.Test/);
  expect(apiRequests).toBe(1);
});

test('фоновое изображение', async ({newtab}) => {
  const dialog = await openSettings(newtab);
  await dialog.getByLabel('Фон', {exact: true}).selectOption('image');
  const chooser = newtab.waitForEvent('filechooser');
  await dialog.getByRole('button', {name: 'Выбрать файл…'}).click();
  await (await chooser).setFiles({name: 'bg.png', mimeType: 'image/png', buffer: await makePng(newtab, 64, '#123456')});

  await expect(newtab.locator('body')).toHaveClass(/page--background-image/);
  await expect(newtab.locator('body')).toHaveCSS('background-image', /^url\("blob:/);

  await dialog.getByRole('button', {name: 'Убрать'}).click();
  await expect(newtab.locator('body')).not.toHaveClass(/page--background-image/);
});
