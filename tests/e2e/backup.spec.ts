import {readFileSync} from 'node:fs';
import type {BrowserContext, Page} from '@playwright/test';
import {expect, getChildren, openSettings, seed, test, tile} from './fixtures';

// Разрешение на доступ к серверу копий входит в доступ ко всем сайтам — выдаём его заранее
test.use({hostAccess: true});

const SERVER = 'https://dav.example/dav';
const AUTH = `Basic ${Buffer.from('user:секрет').toString('base64')}`;

/** Простой WebDAV-сервер в памяти: папки, PROPFIND, GET, PUT, DELETE и проверка пароля */
async function fakeWebDav(context: BrowserContext) {
  const files = new Map<string, {body: string; modified: Date}>();
  const folders = new Set<string>();
  await context.route(`${SERVER}/**`, async (route) => {
    const request = route.request();
    if (request.headers().authorization !== AUTH) return route.fulfill({status: 401});
    const path = decodeURIComponent(new URL(request.url()).pathname);
    switch (request.method()) {
      case 'MKCOL':
        if (folders.has(path)) return route.fulfill({status: 405});
        folders.add(path);
        return route.fulfill({status: 201});
      case 'PROPFIND': {
        if (!folders.has(path)) return route.fulfill({status: 404});
        const entries = [...files].filter(([name]) => name.startsWith(path)).map(([name, file]) =>
          `<d:response><d:href>${encodeURI(name)}</d:href><d:propstat><d:prop><d:resourcetype/>`
          + `<d:getlastmodified>${file.modified.toUTCString()}</d:getlastmodified>`
          + `<d:getcontentlength>${file.body.length}</d:getcontentlength></d:prop></d:propstat></d:response>`);
        return route.fulfill({
          status: 207,
          contentType: 'application/xml',
          body: `<d:multistatus xmlns:d="DAV:"><d:response><d:href>${encodeURI(path)}</d:href><d:propstat><d:prop>`
            + `<d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>${entries.join('')}</d:multistatus>`,
        });
      }
      case 'PUT':
        files.set(path, {body: request.postData() ?? '', modified: new Date()});
        return route.fulfill({status: 201});
      case 'GET': {
        const file = files.get(path);
        return file ? route.fulfill({contentType: 'application/json', body: file.body}) : route.fulfill({status: 404});
      }
      case 'DELETE':
        files.delete(path);
        return route.fulfill({status: 204});
    }
    return route.fulfill({status: 405});
  });
  return {files, folders};
}

async function connect(page: Page, password = 'секрет') {
  const dialog = await openSettings(page, 'Копии');
  await dialog.getByLabel('Сервис').selectOption('other');
  await dialog.getByLabel('Адрес сервера').fill(SERVER);
  await dialog.getByLabel('Логин').fill('user');
  await dialog.getByLabel('Пароль').fill(password);
  await dialog.getByRole('button', {name: 'Подключить'}).click();
  return dialog;
}

test.beforeEach(async ({newtab}) => {
  await seed(newtab, [
    {title: 'Альфа', url: 'https://alpha.example/'},
    {title: 'Папка', children: [{title: 'Внутри', url: 'https://inside.example/'}]},
    {title: 'Бета', url: 'https://beta.example/'},
  ]);
  await expect(tile(newtab, 'Альфа')).toBeVisible();
});

test('подключение, копия в облако и полное восстановление с отменой', async ({context, newtab}) => {
  const server = await fakeWebDav(context);
  const dialog = await connect(newtab);
  await expect(dialog.getByRole('status')).toHaveText('Подключено. Копии будут сохраняться автоматически');
  expect(server.folders).toContain('/dav/SpeedDial/');
  await expect(dialog.getByText('На сервере пока нет копий')).toBeVisible();
  // Пароль в настройках браузера не синхронизируется
  expect(await newtab.evaluate(async () => JSON.stringify(await chrome.storage.sync.get()))).not.toContain('секрет');

  await dialog.getByRole('button', {name: 'Сохранить копию сейчас'}).click();
  await expect(dialog.getByRole('status')).toHaveText('Копия сохранена');
  const copies = dialog.getByRole('list', {name: 'Копии на сервере'}).getByRole('listitem');
  await expect(copies).toHaveCount(1);
  const [[name, file]] = [...server.files];
  expect(name).toMatch(/^\/dav\/SpeedDial\/speeddial-\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d\.json$/);
  expect(JSON.parse(file.body).roots[0].children.map((node: {title: string}) => node.title)).toEqual(['Альфа', 'Папка', 'Бета']);

  // Меняем закладки и настройки — и восстанавливаем копию полностью
  await dialog.getByRole('tab', {name: 'Вид'}).click();
  await dialog.getByLabel('Количество колонок').selectOption('3');
  await dialog.getByRole('tab', {name: 'Копии'}).click();
  await newtab.evaluate(async () => {
    const [alpha] = await chrome.bookmarks.search({title: 'Альфа'});
    await chrome.bookmarks.remove(alpha.id);
    await chrome.bookmarks.create({parentId: '1', title: 'Лишняя', url: 'https://extra.example/'});
  });
  await expect(tile(newtab, 'Альфа')).toHaveCount(0);

  await copies.first().getByRole('button', {name: 'Восстановить…'}).click();
  const restore = newtab.getByRole('dialog', {name: /^Восстановить копию от/});
  await restore.getByLabel(/Восстановить полностью/).check();
  await restore.getByRole('button', {name: 'Восстановить'}).click();
  await expect(restore).toHaveCount(0);

  const titles = async () => (await getChildren(newtab, '1')).map((node) => node.title);
  await expect.poll(titles).toEqual(['Альфа', 'Папка', 'Бета']);
  expect(await newtab.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--columns'))).not.toBe('3');

  // Восстановление можно отменить
  await newtab.getByRole('status').filter({hasText: 'Копия восстановлена'}).getByRole('button', {name: 'Отменить'}).click();
  await expect.poll(titles).toEqual(['Папка', 'Бета', 'Лишняя']);
});

test('«добавить недостающие» из облака и автоматическая копия после изменений', async ({context, newtab}) => {
  const server = await fakeWebDav(context);
  const dialog = await connect(newtab);
  await dialog.getByRole('button', {name: 'Сохранить копию сейчас'}).click();
  await expect(dialog.getByRole('list', {name: 'Копии на сервере'}).getByRole('listitem')).toHaveCount(1);
  expect(server.files.size).toBe(1);

  // Изменение закладок назначает автоматическую копию
  await newtab.evaluate(() => chrome.alarms.clearAll());
  await newtab.evaluate(async () => {
    const [beta] = await chrome.bookmarks.search({title: 'Бета'});
    await chrome.bookmarks.remove(beta.id);
  });
  await expect.poll(() => newtab.evaluate(async () => Boolean(await chrome.alarms.get('cloud-backup')))).toBe(true);

  await dialog.getByRole('list', {name: 'Копии на сервере'}).getByRole('button', {name: 'Восстановить…'}).click();
  const restore = newtab.getByRole('dialog', {name: /^Восстановить копию от/});
  await expect(restore.getByLabel(/Добавить недостающие закладки/)).toBeChecked();
  await restore.getByRole('button', {name: 'Восстановить'}).click();

  await expect(newtab.getByRole('status').filter({hasText: 'Добавлено закладок и папок: 1'})).toBeVisible();
  expect((await getChildren(newtab, '1')).map((node) => node.title)).toEqual(['Альфа', 'Папка', 'Бета']);
});

test('неверный пароль — понятная ошибка, подключение не сохраняется', async ({context, newtab}) => {
  await fakeWebDav(context);
  const dialog = await connect(newtab, 'неверный');
  await expect(dialog.getByRole('alert')).toContainText('Сервер отклонил логин или пароль');
  await expect(dialog.getByRole('button', {name: 'Подключить'})).toBeVisible();
});

test('копия в файл и восстановление из файла', async ({newtab}) => {
  const dialog = await openSettings(newtab, 'Копии');
  const download = newtab.waitForEvent('download');
  await dialog.getByRole('button', {name: 'Сохранить в файл'}).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^speeddial-.*\.json$/);
  const content = readFileSync((await file.path())!, 'utf8');

  await newtab.evaluate(async () => {
    const [folder] = await chrome.bookmarks.search({title: 'Папка'});
    await chrome.bookmarks.removeTree(folder.id);
  });
  await expect(tile(newtab, 'Папка')).toHaveCount(0);

  const chooser = newtab.waitForEvent('filechooser');
  await dialog.getByRole('button', {name: 'Восстановить…'}).click();
  await (await chooser).setFiles({name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(content)});
  await newtab.getByRole('dialog', {name: 'Восстановить «backup.json»'}).getByRole('button', {name: 'Восстановить'}).click();

  await expect(tile(newtab, 'Папка')).toBeVisible();
  await dialog.getByRole('button', {name: 'Готово'}).click();
  await tile(newtab, 'Папка').click();
  await expect(tile(newtab, 'Внутри')).toBeVisible();
});

test('облако без Client ID в сборке — в режиме разработки подсказка и адрес возврата', async ({extensionId, newtab}) => {
  const dialog = await openSettings(newtab, 'Копии');
  for (const service of ['Google Диск', 'Dropbox', 'OneDrive']) {
    await dialog.getByLabel('Сервис').selectOption({label: service});
    await expect(dialog.getByText(`Вход в ${service} не настроен в этой сборке расширения`)).toBeVisible();
    await expect(dialog.getByText(`https://${extensionId}.chromiumapp.org/`)).toBeVisible();
    await expect(dialog.getByLabel('Пароль')).toHaveCount(0);
  }
  await dialog.getByLabel('Сервис').selectOption({label: 'Яндекс.Диск'});
  await expect(dialog.getByLabel('Адрес сервера')).toHaveValue('https://webdav.yandex.ru');
});

test('установка из магазина — ненастроенных облаков в списке нет', async ({context, newtab}) => {
  await context.addInitScript(() => {
    Object.defineProperty(chrome.management, 'getSelf', {
      value: async () => ({installType: 'normal'}),
    });
  });
  await newtab.reload();
  const dialog = await openSettings(newtab, 'Копии');
  await expect(dialog.getByLabel('Сервис').locator('option'))
    .toHaveText(['Яндекс.Диск', 'Nextcloud / ownCloud', 'Другой WebDAV']);
});
