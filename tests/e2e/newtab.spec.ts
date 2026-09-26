import {expect, getChildren, openSettings, seed, test, tile} from './fixtures';

test.beforeEach(async ({newtab}) => {
  await seed(newtab, [
    {title: 'Example', url: 'https://example.com/'},
    {
      title: 'Работа',
      children: [
        {title: 'Docs', url: 'https://docs.example.com/'},
        {title: 'Архив', children: []},
      ],
    },
  ]);
});

test('показывает закладки и папки без перезагрузки страницы', async ({newtab}) => {
  await expect(tile(newtab, 'Example')).toBeVisible();
  await expect(tile(newtab, 'Example')).toHaveAttribute('href', 'https://example.com/');

  // Миниатюры папки: закладка и значок вложенной папки
  const folder = tile(newtab, 'Работа');
  await expect(folder.locator('.folder-preview [title="Docs"]')).toBeVisible();
  await expect(folder.locator('.folder-preview [title="Архив"] svg')).toBeVisible();

  // Значок подпапки и иконка сайта растянуты почти на всю ячейку, одинаково
  const subfolder = folder.locator('.folder-preview [title="Архив"]');
  const subfolderCell = (await subfolder.boundingBox())!;
  const subfolderIcon = (await subfolder.locator('svg').boundingBox())!;
  expect(subfolderIcon.height).toBeGreaterThan(subfolderCell.height * 0.6);

  const site = folder.locator('.folder-preview [title="Docs"]');
  const siteCell = (await site.boundingBox())!;
  const siteIcon = (await site.locator('.site-icon').boundingBox())!;
  expect(siteIcon.height).toBeGreaterThan(siteCell.height * 0.6);
});

test('плитка папки — кнопка без адреса; Ctrl+клик открывает папку в новой вкладке', async ({context, newtab}) => {
  const folder = tile(newtab, 'Работа');
  // Не ссылка: браузер не показывает при наведении адрес chrome-extension://…
  await expect(folder).not.toHaveAttribute('href');

  const opened = context.waitForEvent('page');
  await folder.click({modifiers: ['ControlOrMeta']});
  const page = await opened;
  await expect(page).toHaveURL(/newtab\.html#folder=\d+$/);
  await expect(tile(page, 'Docs')).toBeVisible();
  // Сама вкладка осталась в прежней папке
  await expect(tile(newtab, 'Example')).toBeVisible();
});

test('навигация по папкам и хлебным крошкам', async ({newtab}) => {
  await tile(newtab, 'Работа').click();
  await expect(tile(newtab, 'Docs')).toBeVisible();
  await expect(newtab).toHaveURL(/#folder=\d+$/);

  // Название панели закладок зависит от языка браузера
  const [bar] = await newtab.evaluate(() => chrome.bookmarks.get('1'));
  const crumbs = newtab.getByRole('navigation', {name: 'Путь к папке'});
  await expect(crumbs.locator('.breadcrumbs__item')).toHaveText(['Главная', bar.title, 'Работа']);
  // Папки пути — кнопки: браузер не показывает при наведении адрес chrome-extension://…
  await expect(crumbs.locator('a')).toHaveCount(0);

  // Перезагрузка оставляет в той же папке
  await newtab.reload();
  await expect(tile(newtab, 'Docs')).toBeVisible();

  // Кнопка «Назад» браузера
  await newtab.goBack();
  await expect(tile(newtab, 'Example')).toBeVisible();

  // «Главная» — корень: видны системные папки, пустых крошек нет
  await crumbs.getByRole('button', {name: 'Главная'}).click();
  await expect(tile(newtab, bar.title)).toBeVisible();
  await expect(crumbs.locator('.breadcrumbs__item')).toHaveCount(1);
});

test('добавляет закладку в открытую папку через контекстное меню', async ({newtab}) => {
  await tile(newtab, 'Работа').click();
  await expect(tile(newtab, 'Docs')).toBeVisible();

  await newtab.locator('main').click({button: 'right', position: {x: 5, y: 5}});
  await newtab.getByRole('menuitem', {name: 'Новая закладка…'}).click();

  const dialog = newtab.getByRole('dialog', {name: 'Новая закладка'});
  await expect(dialog.getByLabel('Название')).toBeFocused();
  await dialog.getByLabel('Адрес').fill('github.com');
  await dialog.getByRole('button', {name: 'Создать'}).click();

  await expect(dialog).toBeHidden();
  await expect(tile(newtab, 'github.com')).toHaveAttribute('href', 'https://github.com/');

  const folderId = /#folder=(\d+)$/.exec(newtab.url())![1];
  const children = await getChildren(newtab, folderId);
  expect(children.map((node) => node.url)).toContain('https://github.com/');
});

test('показывает ошибку при неверном адресе', async ({newtab}) => {
  await newtab.locator('main').click({button: 'right', position: {x: 5, y: 5}});
  await newtab.getByRole('menuitem', {name: 'Новая закладка…'}).click();

  const dialog = newtab.getByRole('dialog');
  await dialog.getByLabel('Адрес').fill('exa mple');
  await dialog.getByRole('button', {name: 'Создать'}).click();
  await expect(dialog.getByRole('alert')).toHaveText('Неверный формат URL');

  await newtab.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('изменяет закладку', async ({newtab}) => {
  await tile(newtab, 'Example').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Редактировать…'}).click();

  const dialog = newtab.getByRole('dialog', {name: 'Изменить закладку'});
  await expect(dialog.getByLabel('Адрес')).toHaveValue('https://example.com/');
  await dialog.getByLabel('Название').fill('Пример');
  await dialog.getByLabel('Адрес').fill('example.org');
  await dialog.getByRole('button', {name: 'Сохранить'}).click();

  await expect(tile(newtab, 'Пример')).toHaveAttribute('href', 'https://example.org/');
  await expect(tile(newtab, 'Example')).toHaveCount(0);
});

test('переименовывает папку без поля адреса', async ({newtab}) => {
  await tile(newtab, 'Работа').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Редактировать…'}).click();

  const dialog = newtab.getByRole('dialog', {name: 'Изменить папку'});
  await expect(dialog.getByLabel('Адрес')).toHaveCount(0);
  await dialog.getByLabel('Название').fill('Проекты');
  await dialog.getByRole('button', {name: 'Сохранить'}).click();

  await expect(tile(newtab, 'Проекты')).toBeVisible();
});

test('удаляет папку после подтверждения', async ({newtab}) => {
  const settings = await openSettings(newtab, 'Расширенные');
  await settings.getByLabel('Спрашивать подтверждение при удалении').check();
  await settings.getByRole('button', {name: 'Готово'}).click();

  await tile(newtab, 'Работа').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Удалить…'}).click();

  const dialog = newtab.getByRole('dialog', {name: 'Удалить папку?'});
  await dialog.getByRole('button', {name: 'Отмена'}).click();
  await expect(tile(newtab, 'Работа')).toBeVisible();

  await tile(newtab, 'Работа').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Удалить…'}).click();
  await newtab.getByRole('dialog').getByRole('button', {name: 'Удалить'}).click();

  await expect(tile(newtab, 'Работа')).toHaveCount(0);
  const titles = (await getChildren(newtab, '1')).map((node) => node.title);
  expect(titles).toEqual(['Example']);
});

test('удаление без вопроса и отмена из уведомления', async ({newtab}) => {
  await tile(newtab, 'Работа').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Удалить', exact: true}).click();
  await expect(tile(newtab, 'Работа')).toHaveCount(0);
  await expect(newtab.getByRole('dialog')).toHaveCount(0);

  const notice = newtab.getByRole('status').filter({hasText: 'Папка «Работа» удалена'});
  await notice.getByRole('button', {name: 'Отменить'}).click();
  await expect(notice).toHaveCount(0);

  // Папка вернулась на прежнее место вместе с содержимым
  await expect(tile(newtab, 'Работа')).toBeVisible();
  const children = await getChildren(newtab, '1');
  expect(children.map((node) => node.title)).toEqual(['Example', 'Работа']);
  const restored = await getChildren(newtab, children[1].id);
  expect(restored.map((node) => [node.title, node.url ?? null])).toEqual([
    ['Docs', 'https://docs.example.com/'],
    ['Архив', null],
  ]);
});

test('в полях настроек остаётся стандартное меню браузера', async ({newtab}) => {
  await openSettings(newtab);
  await newtab.getByLabel('Шрифт', {exact: true}).click({button: 'right'});
  await expect(newtab.getByRole('menu')).toHaveCount(0);
});

test('настройки применяются сразу и сохраняются', async ({newtab}) => {
  await expect(tile(newtab, 'Example')).toBeVisible();
  const grid = newtab.getByRole('region', {name: 'Закладки'});
  const columnCount = () => grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);

  const dialog = await openSettings(newtab);
  await dialog.getByLabel('Количество колонок').selectOption('3');
  await dialog.getByLabel('Шрифт', {exact: true}).selectOption('Georgia');

  expect(await columnCount()).toBe(3);
  await expect(grid).toHaveCSS('font-family', /^"?Georgia/);

  await dialog.getByRole('button', {name: 'Готово'}).click();
  await expect(dialog).toBeHidden();

  // Ждём отложенную запись в chrome.storage.sync и проверяем после перезагрузки
  await expect.poll(() => newtab.evaluate(async () => (await chrome.storage.sync.get('settings')).settings))
    .toMatchObject({columns: 3, fontFamily: '"Georgia", system-ui, sans-serif'});
  await newtab.evaluate(() => localStorage.clear());
  await newtab.reload();
  await expect(tile(newtab, 'Example')).toBeVisible();
  await expect.poll(columnCount).toBe(3);
});

test('веб-закладка открывается в текущей вкладке', async ({context, newtab}) => {
  await context.route('https://example.com/**', (route) => route.fulfill({body: '<title>Example page</title>'}));
  await tile(newtab, 'Example').click();
  await expect(newtab).toHaveURL('https://example.com/');
});
