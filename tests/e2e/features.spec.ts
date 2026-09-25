import {expect, getChildren, openSettings, seed, test, tile} from './fixtures';

test.beforeEach(async ({newtab}) => {
  await seed(newtab, [
    {title: 'Бета', url: 'https://beta.example/'},
    {title: 'Альфа', url: 'https://alpha.example/'},
    {title: 'Папка', children: [{title: 'Гамма', url: 'https://gamma.example/'}]},
  ]);
  await expect(tile(newtab, 'Альфа')).toBeVisible();
});

const titles = (page: import('@playwright/test').Page) =>
  page.locator('[data-bookmark-id] .tile__title-text').allTextContents();

test('поиск по закладкам и в интернете', async ({context, newtab}) => {
  const search = newtab.getByRole('searchbox', {name: 'Поиск'});
  await search.fill('гамма');
  await expect(newtab.getByRole('region', {name: 'Результаты поиска'})).toBeVisible();
  await expect.poll(() => titles(newtab)).toEqual(['Гамма']);

  await search.fill('несуществующее');
  await expect(newtab.getByText(/Ничего не найдено/)).toBeVisible();

  // Esc очищает поиск
  await search.press('Escape');
  await expect(tile(newtab, 'Альфа')).toBeVisible();

  // Enter — поиск в выбранной поисковой системе
  await context.route('https://duckduckgo.com/**', (route) => route.fulfill({body: 'ok'}));
  const dialog = await openSettings(newtab, 'Общие');
  await dialog.getByLabel('Поисковая система').selectOption('duckduckgo');
  await dialog.getByRole('button', {name: 'Готово'}).click();
  await search.fill('svelte runes');
  await search.press('Enter');
  await expect(newtab).toHaveURL('https://duckduckgo.com/?q=svelte%20runes');
});

test('сортировка отключает перетаскивание и не меняет закладки', async ({newtab}) => {
  expect(await titles(newtab)).toEqual(['Бета', 'Альфа', 'Папка']);

  const dialog = await openSettings(newtab, 'Общие');
  await dialog.getByLabel('Сортировать').selectOption('title');
  await expect.poll(() => titles(newtab)).toEqual(['Альфа', 'Бета', 'Папка']);
  await dialog.getByLabel('Папки и закладки').selectOption('foldersFirst');
  await expect.poll(() => titles(newtab)).toEqual(['Папка', 'Альфа', 'Бета']);

  // В самом браузере порядок прежний
  const order = (await getChildren(newtab, '1')).map((node) => node.title);
  expect(order).toEqual(['Бета', 'Альфа', 'Папка']);
});

test('перетаскивание: порядок и перенос в папку', async ({newtab}) => {
  // «Альфа» перед «Бета»: бросаем на левую часть плитки
  const beta = tile(newtab, 'Бета');
  const box = (await beta.boundingBox())!;
  await tile(newtab, 'Альфа').dragTo(beta, {targetPosition: {x: 5, y: box.height / 2}});
  await expect.poll(() => titles(newtab)).toEqual(['Альфа', 'Бета', 'Папка']);

  // «Бета» внутрь папки: бросаем в центр плитки папки
  await tile(newtab, 'Бета').dragTo(tile(newtab, 'Папка'));
  await expect.poll(() => titles(newtab)).toEqual(['Альфа', 'Папка']);
  const folderId = await tile(newtab, 'Папка').getAttribute('data-bookmark-id');
  expect((await getChildren(newtab, folderId!)).map((node) => node.title)).toEqual(['Гамма', 'Бета']);

  // Обратно — на плитку «Назад»
  await tile(newtab, 'Папка').click();
  await newtab.locator('[data-bookmark-id]', {hasText: 'Бета'}).dragTo(newtab.locator('.tile[data-drop-folder-id]'));
  await expect(tile(newtab, 'Бета')).toHaveCount(0);
  expect((await getChildren(newtab, '1')).map((node) => node.title)).toContain('Бета');
});

test('во время перетаскивания плитки расступаются, а на месте плитки остаётся след', async ({newtab}) => {
  const browserOrder = async () => (await getChildren(newtab, '1')).map((node) => node.title);
  const center = async (locator: import('@playwright/test').Locator) => {
    const box = (await locator.boundingBox())!;
    return {x: box.x + box.width / 2, y: box.y + box.height / 2, box};
  };

  const alpha = await center(tile(newtab, 'Альфа'));
  const beta = await center(tile(newtab, 'Бета'));
  await newtab.mouse.move(alpha.x, alpha.y);
  await newtab.mouse.down();
  await newtab.mouse.move(beta.box.x + 10, beta.y, {steps: 8});

  // Кнопка ещё не отпущена: «Бета» уже отъехала, на месте «Альфы» — след, в браузере порядок прежний
  await expect.poll(() => titles(newtab)).toEqual(['Альфа', 'Бета', 'Папка']);
  await expect(tile(newtab, 'Альфа')).toHaveClass(/tile--dragging/);
  expect(await browserOrder()).toEqual(['Бета', 'Альфа', 'Папка']);

  // Над серединой папки она подсвечивается, а плитки не двигаются
  const folder = await center(tile(newtab, 'Папка'));
  await newtab.mouse.move(folder.x, folder.y, {steps: 8});
  await expect(tile(newtab, 'Папка')).toHaveClass(/tile--drop-into/);
  await newtab.mouse.move(beta.box.x + 10, beta.y, {steps: 8});
  await expect(tile(newtab, 'Папка')).not.toHaveClass(/tile--drop-into/);

  await newtab.mouse.up();
  await expect.poll(browserOrder).toEqual(['Альфа', 'Бета', 'Папка']);
  await expect(tile(newtab, 'Альфа')).not.toHaveClass(/tile--dragging/);
  expect(await titles(newtab)).toEqual(['Альфа', 'Бета', 'Папка']);
});

test('плитки «Назад» и «Добавить», новые закладки в начало', async ({newtab}) => {
  await tile(newtab, 'Папка').click();
  await newtab.getByRole('link', {name: 'Назад'}).click();
  await expect(tile(newtab, 'Альфа')).toBeVisible();

  const dialog = await openSettings(newtab, 'Общие');
  await dialog.getByLabel('Добавлять новые закладки в начало папки').check();
  await dialog.getByRole('button', {name: 'Готово'}).click();

  await newtab.getByRole('button', {name: 'Добавить закладку'}).click();
  await newtab.getByRole('dialog').getByLabel('Адрес').fill('first.example');
  await newtab.getByRole('dialog').getByRole('button', {name: 'Создать'}).click();
  await expect.poll(() => titles(newtab)).toEqual(['first.example', 'Бета', 'Альфа', 'Папка']);
});

test('папка по умолчанию и последняя открытая папка', async ({context, extensionId, newtab}) => {
  const folderId = await tile(newtab, 'Папка').getAttribute('data-bookmark-id');
  const dialog = await openSettings(newtab, 'Общие');
  await dialog.getByLabel('Папка по умолчанию').selectOption(folderId!);
  await dialog.getByRole('button', {name: 'Готово'}).click();
  await expect.poll(() => newtab.evaluate(async () => (await chrome.storage.local.get('localSettings')).localSettings))
    .toMatchObject({defaultFolderId: folderId});

  // Новая вкладка без адреса папки открывает папку по умолчанию
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab.html`);
  await expect(tile(page, 'Гамма')).toBeVisible();

  // С «последней папкой» открывается та, где были в прошлый раз
  const settings = await openSettings(page, 'Общие');
  await settings.getByLabel('Открывать последнюю открытую папку').check();
  await settings.getByRole('button', {name: 'Готово'}).click();
  await page.getByRole('navigation', {name: 'Путь к папке'}).getByRole('link', {name: 'Главная'}).click();
  await expect(page.locator('[data-bookmark-id]').first()).toBeVisible();

  const another = await context.newPage();
  await another.goto(`chrome-extension://${extensionId}/newtab.html`);
  await expect(another.getByRole('navigation', {name: 'Путь к папке'}).getByRole('link')).toHaveText(['Главная']);
});

test('выбор папки в панели поиска', async ({newtab}) => {
  const folderId = await tile(newtab, 'Папка').getAttribute('data-bookmark-id');
  await newtab.getByRole('combobox', {name: 'Папка'}).selectOption(folderId!);
  await expect(tile(newtab, 'Гамма')).toBeVisible();
});

test('удаление без подтверждения', async ({newtab}) => {
  const dialog = await openSettings(newtab, 'Расширенные');
  await dialog.getByLabel('Не спрашивать подтверждения при удалении').check();
  await dialog.getByRole('button', {name: 'Готово'}).click();

  await tile(newtab, 'Бета').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Удалить…'}).click();
  await expect(tile(newtab, 'Бета')).toHaveCount(0);
  await expect(newtab.getByRole('dialog')).toHaveCount(0);
});

test('меню сервисов редактируется в настройках', async ({newtab}) => {
  const dialog = await openSettings(newtab, 'Общие');
  await dialog.getByLabel('Сервисы', {exact: true}).fill('Почта | mail.example.com\nнекорректная строка с пробелом\nwiki.example.org');
  await dialog.getByLabel('Сервисы', {exact: true}).blur();
  await dialog.getByRole('button', {name: 'Готово'}).click();

  await newtab.getByRole('button', {name: 'Сервисы'}).click();
  const menu = newtab.getByRole('navigation', {name: 'Сервисы'});
  await expect(menu.getByRole('link')).toHaveCount(2);
  await expect(menu.getByRole('link', {name: 'Почта', exact: true})).toHaveAttribute('href', 'https://mail.example.com/');
  await expect(menu.getByRole('link', {name: 'wiki.example.org', exact: true})).toBeVisible();
});
