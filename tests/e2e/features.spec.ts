import {dropAt, expect, getChildren, openSettings, seed, test, tile, waitForTileAnimations} from './fixtures';

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

// Перетаскивание в Playwright эмулируется: dragover приходит только при движении мыши, и под сильной
// нагрузкой (много браузеров параллельно) браузер иногда отменяет сброс — событие drop до страницы не доходит.
// Живой браузер шлёт dragover непрерывно, поэтому повтор здесь допустим; такие прогоны отмечаются как flaky
test.describe('перетаскивание', () => {
test.describe.configure({retries: 2});

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

  await dropAt(newtab, beta.box.x + 10, beta.y);
  await expect.poll(browserOrder).toEqual(['Альфа', 'Бета', 'Папка']);
  await expect(tile(newtab, 'Альфа')).not.toHaveClass(/tile--dragging/);
  expect(await titles(newtab)).toEqual(['Альфа', 'Бета', 'Папка']);
});

test('в папку можно положить, подведя плитку сбоку; задержка у края папки — встать рядом', async ({newtab}) => {
  const browserOrder = async (folderId = '1') => (await getChildren(newtab, folderId)).map((node) => node.title);
  const folderId = (await tile(newtab, 'Папка').getAttribute('data-bookmark-id'))!;

  // «Альфа» и «Папка» в одном ряду: ведём «Альфу» по горизонтали через левый край папки к её середине
  const alpha = (await tile(newtab, 'Альфа').boundingBox())!;
  const folder = (await tile(newtab, 'Папка').boundingBox())!;
  const y = folder.y + folder.height / 2;
  await newtab.mouse.move(alpha.x + alpha.width / 2, alpha.y + alpha.height / 2);
  await newtab.mouse.down();
  await newtab.mouse.move(folder.x + folder.width * 0.1, y, {steps: 6}); // Край папки
  await newtab.mouse.move(folder.x + folder.width / 2, y, {steps: 6}); // Середина
  await newtab.mouse.move(folder.x + folder.width / 2 + 2, y); // Playwright доставляет dragover при следующем движении

  // Папка осталась на месте и подсвечена
  await expect(tile(newtab, 'Папка')).toHaveClass(/tile--drop-into/);
  expect(await titles(newtab)).toEqual(['Бета', 'Альфа', 'Папка']);
  await dropAt(newtab, folder.x + folder.width / 2, y);
  await expect.poll(() => browserOrder(folderId)).toEqual(['Гамма', 'Альфа']);

  // Если задержаться у края папки, плитки расступаются — закладка встанет рядом
  await expect.poll(() => titles(newtab)).toEqual(['Бета', 'Папка']);
  await waitForTileAnimations(newtab);
  const beta = (await tile(newtab, 'Бета').boundingBox())!;
  const folderNow = (await tile(newtab, 'Папка').boundingBox())!;
  const edge = {x: folderNow.x + folderNow.width * 0.9, y: folderNow.y + folderNow.height / 2};
  await newtab.mouse.move(beta.x + beta.width / 2, beta.y + beta.height / 2);
  await newtab.mouse.down();
  await newtab.mouse.move(edge.x, edge.y, {steps: 6});
  await newtab.mouse.move(edge.x + 1, edge.y);
  // Пока ждём — у папки «растущая» линия с той стороны, куда встанет плитка
  await expect(newtab.locator('.bookmark-grid__cell--insert-pending.bookmark-grid__cell--insert-after')).toHaveCount(1);
  await expect.poll(() => titles(newtab)).toEqual(['Папка', 'Бета']);
  await expect(tile(newtab, 'Папка')).not.toHaveClass(/tile--drop-into/);
  // Плитки расступились: отпускаем на освободившемся месте
  await dropAt(newtab, folderNow.x + folderNow.width / 2, edge.y);
  await expect.poll(() => browserOrder()).toEqual(['Папка', 'Бета']);
});

test('курсор между плитками — линия-вставка, плитки не двигаются', async ({newtab}) => {
  const browserOrder = async () => (await getChildren(newtab, '1')).map((node) => node.title);
  const cell = (title: string) => newtab.locator('.bookmark-grid__cell', {has: tile(newtab, title)});

  // Тянем «Папку» в промежуток между «Бета» и «Альфа» в обход плиток — под рядом и снизу вверх:
  // над плиткой плитки расступились бы, а нам нужен именно промежуток
  const folder = (await tile(newtab, 'Папка').boundingBox())!;
  const beta = (await cell('Бета').boundingBox())!;
  const alpha = (await cell('Альфа').boundingBox())!;
  const gap = {x: (beta.x + beta.width + alpha.x) / 2, y: alpha.y + alpha.height / 2};
  const below = alpha.y + alpha.height + 40;
  await newtab.mouse.move(folder.x + folder.width / 2, folder.y + folder.height / 2);
  await newtab.mouse.down();
  await newtab.mouse.move(folder.x + folder.width / 2, below, {steps: 4});
  await newtab.mouse.move(gap.x, below, {steps: 6});
  await newtab.mouse.move(gap.x, gap.y, {steps: 4});
  await newtab.mouse.move(gap.x, gap.y + 1);

  // Линия — перед «Альфа», то есть в промежутке; порядок на экране прежний
  await expect(cell('Альфа')).toHaveClass(/bookmark-grid__cell--insert-before/);
  await expect(newtab.locator('[class*="--insert-"]')).toHaveCount(1);
  expect(await titles(newtab)).toEqual(['Бета', 'Альфа', 'Папка']);

  await dropAt(newtab, gap.x, gap.y);
  await expect.poll(browserOrder).toEqual(['Бета', 'Папка', 'Альфа']);
  await expect(newtab.locator('[class*="--insert-"]')).toHaveCount(0);
});

});

test('плитки «Назад» и «Добавить», новые закладки в начало', async ({newtab}) => {
  await tile(newtab, 'Папка').click();
  await newtab.getByRole('button', {name: 'Назад'}).click();
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
  await page.getByRole('navigation', {name: 'Путь к папке'}).getByRole('button', {name: 'Главная'}).click();
  await expect(page.locator('[data-bookmark-id]').first()).toBeVisible();

  const another = await context.newPage();
  await another.goto(`chrome-extension://${extensionId}/newtab.html`);
  await expect(another.getByRole('navigation', {name: 'Путь к папке'}).locator('.breadcrumbs__item')).toHaveText(['Главная']);
});

test('выбор папки в панели поиска', async ({newtab}) => {
  const folderId = await tile(newtab, 'Папка').getAttribute('data-bookmark-id');
  await newtab.getByRole('combobox', {name: 'Папка'}).selectOption(folderId!);
  await expect(tile(newtab, 'Гамма')).toBeVisible();
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
