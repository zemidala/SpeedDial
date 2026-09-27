import {expect, getChildren, makePng, openSettings, seed, test, tile} from './fixtures';

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

test('shows bookmarks and folders without reloading the page', async ({newtab}) => {
  await expect(tile(newtab, 'Example')).toBeVisible();
  await expect(tile(newtab, 'Example')).toHaveAttribute('href', 'https://example.com/');

  // Folder previews: a bookmark and a subfolder icon
  const folder = tile(newtab, 'Работа');
  await expect(folder.locator('.folder-preview [title="Docs"]')).toBeVisible();
  await expect(folder.locator('.folder-preview [title="Архив"] svg')).toBeVisible();

  // The subfolder icon and the site icon fill almost the whole cell, equally
  const subfolder = folder.locator('.folder-preview [title="Архив"]');
  const subfolderCell = (await subfolder.boundingBox())!;
  const subfolderIcon = (await subfolder.locator('svg').boundingBox())!;
  expect(subfolderIcon.height).toBeGreaterThan(subfolderCell.height * 0.6);

  const site = folder.locator('.folder-preview [title="Docs"]');
  const siteCell = (await site.boundingBox())!;
  const siteIcon = (await site.locator('.site-icon').boundingBox())!;
  expect(siteIcon.height).toBeGreaterThan(siteCell.height * 0.6);
});

test('a folder tile is a button without a URL; Ctrl+click opens the folder in a new tab', async ({context, newtab}) => {
  const folder = tile(newtab, 'Работа');
  // Not a link: the browser doesn't show chrome-extension://… on hover
  await expect(folder).not.toHaveAttribute('href');

  const opened = context.waitForEvent('page');
  await folder.click({modifiers: ['ControlOrMeta']});
  const page = await opened;
  await expect(page).toHaveURL(/newtab\.html#folder=\d+$/);
  await expect(tile(page, 'Docs')).toBeVisible();
  // The tab itself stayed in the same folder
  await expect(tile(newtab, 'Example')).toBeVisible();
});

test('navigating folders and breadcrumbs', async ({newtab}) => {
  await tile(newtab, 'Работа').click();
  await expect(tile(newtab, 'Docs')).toBeVisible();
  await expect(newtab).toHaveURL(/#folder=\d+$/);

  // The bookmarks bar name depends on the browser language
  const [bar] = await newtab.evaluate(() => chrome.bookmarks.get('1'));
  const crumbs = newtab.getByRole('navigation', {name: 'Путь к папке'});
  await expect(crumbs.locator('.breadcrumbs__item')).toHaveText(['Главная', bar.title, 'Работа']);
  // Path folders are buttons: the browser doesn't show chrome-extension://… on hover
  await expect(crumbs.locator('a')).toHaveCount(0);

  // A reload keeps the same folder
  await newtab.reload();
  await expect(tile(newtab, 'Docs')).toBeVisible();

  // The browser's Back button
  await newtab.goBack();
  await expect(tile(newtab, 'Example')).toBeVisible();

  // "Home" is the root: system folders are shown, no empty breadcrumbs
  await crumbs.getByRole('button', {name: 'Главная'}).click();
  await expect(tile(newtab, bar.title)).toBeVisible();
  await expect(crumbs.locator('.breadcrumbs__item')).toHaveCount(1);
});

test('adds a bookmark to the open folder via the context menu', async ({newtab}) => {
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

test('shows an error for an invalid URL', async ({newtab}) => {
  await newtab.locator('main').click({button: 'right', position: {x: 5, y: 5}});
  await newtab.getByRole('menuitem', {name: 'Новая закладка…'}).click();

  const dialog = newtab.getByRole('dialog');
  await dialog.getByLabel('Адрес').fill('exa mple');
  await dialog.getByRole('button', {name: 'Создать'}).click();
  await expect(dialog.getByRole('alert')).toHaveText('Неверный формат URL');

  await newtab.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('edits a bookmark', async ({newtab}) => {
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

test('renames a folder without a URL field', async ({newtab}) => {
  await tile(newtab, 'Работа').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Редактировать…'}).click();

  const dialog = newtab.getByRole('dialog', {name: 'Изменить папку'});
  await expect(dialog.getByLabel('Адрес')).toHaveCount(0);
  await dialog.getByLabel('Название').fill('Проекты');
  await dialog.getByRole('button', {name: 'Сохранить'}).click();

  await expect(tile(newtab, 'Проекты')).toBeVisible();
});

test('deletes a folder after confirmation', async ({newtab}) => {
  const settings = await openSettings(newtab, 'Общие');
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

test('deleting without a question and undoing from the notification', async ({newtab}) => {
  await tile(newtab, 'Работа').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Удалить', exact: true}).click();
  await expect(tile(newtab, 'Работа')).toHaveCount(0);
  await expect(newtab.getByRole('dialog')).toHaveCount(0);

  const notice = newtab.getByRole('status').filter({hasText: 'Папка «Работа» удалена'});
  await notice.getByRole('button', {name: 'Отменить'}).click();
  await expect(notice).toHaveCount(0);

  // The folder is back at its old place with its contents
  await expect(tile(newtab, 'Работа')).toBeVisible();
  const children = await getChildren(newtab, '1');
  expect(children.map((node) => node.title)).toEqual(['Example', 'Работа']);
  const restored = await getChildren(newtab, children[1].id);
  expect(restored.map((node) => [node.title, node.url ?? null])).toEqual([
    ['Docs', 'https://docs.example.com/'],
    ['Архив', null],
  ]);
});

test('settings fields keep the browser\'s standard menu', async ({newtab}) => {
  await openSettings(newtab);
  await newtab.getByLabel('Шрифт', {exact: true}).click({button: 'right'});
  await expect(newtab.getByRole('menu')).toHaveCount(0);
});

test('settings apply immediately and are saved', async ({newtab}) => {
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

  // Wait for the delayed write to chrome.storage.sync and check after a reload
  await expect.poll(() => newtab.evaluate(async () => (await chrome.storage.sync.get('settings')).settings))
    .toMatchObject({columns: 3, fontFamily: '"Georgia", system-ui, sans-serif'});
  await newtab.evaluate(() => localStorage.clear());
  await newtab.reload();
  await expect(tile(newtab, 'Example')).toBeVisible();
  await expect.poll(columnCount).toBe(3);
});

test('only the tiles scroll: the header stays in place', async ({newtab}) => {
  await newtab.setViewportSize({width: 1000, height: 600});
  await seed(newtab, Array.from({length: 40}, (_, i) => ({title: `Tile ${i}`, url: `https://t${i}.example/`})));
  await expect(tile(newtab, 'Tile 39')).toBeAttached();

  const content = newtab.locator('.app__content');
  const header = newtab.getByRole('searchbox', {name: 'Поиск'});
  const headerTop = (await header.boundingBox())!.y;
  await newtab.mouse.move(500, 400);
  await newtab.mouse.wheel(0, 2000);
  await expect.poll(() => content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  // The page itself didn't scroll and the header didn't move
  expect(await newtab.evaluate(() => scrollY)).toBe(0);
  expect((await header.boundingBox())!.y).toBe(headerTop);
  await expect(tile(newtab, 'Tile 39')).toBeInViewport();
});

// The reload itself can't be run here: an extension loaded from the command line stays off after
// chrome.runtime.reload(). The list is checked here, the restoring in openTabs.test.ts
test('the service worker can open SpeedDial again in a tab without the "tabs" permission', async ({context, extensionId}) => {
  const tab = await context.newPage();
  await tab.route('https://example.com/**', (route) => route.fulfill({body: '<title>Example page</title>'}));
  await tab.goto('https://example.com/');
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
    await chrome.tabs.update(tab.id!, {url: 'chrome://newtab/'});
  });
  await expect.poll(() => tab.url()).toBe(`chrome-extension://${extensionId}/newtab.html`);
  await expect(tab.getByRole('searchbox', {name: 'Поиск'})).toBeVisible();
});

test('a tab that left SpeedDial or was closed isn\'t taken back after a reload', async ({context, newtab}) => {
  const worker = context.serviceWorkers()[0];
  const stored = () => worker.evaluate(async () => (await chrome.storage.local.get('openNewTabs')).openNewTabs ?? []);
  await expect.poll(stored).toHaveLength(1);

  const other = await context.newPage();
  await other.goto('chrome://newtab/');
  await expect.poll(stored).toHaveLength(2);
  await other.close();
  await expect.poll(stored).toHaveLength(1);

  await newtab.route('https://example.com/**', (route) => route.fulfill({body: '<title>Example page</title>'}));
  await newtab.goto('https://example.com/');
  await expect.poll(stored).toHaveLength(0);
});

test('"Back to top" shows up as soon as the tiles are scrolled down and brings them back', async ({newtab}) => {
  await newtab.setViewportSize({width: 1000, height: 600});
  await seed(newtab, Array.from({length: 60}, (_, i) => ({title: `Tile ${i}`, url: `https://t${i}.example/`})));
  await expect(tile(newtab, 'Tile 59')).toBeAttached();

  const content = newtab.locator('.app__content');
  const button = newtab.getByRole('button', {name: 'Наверх'});
  await expect(button).toHaveCount(0); // Hidden at the top, also from screen readers

  // Any scroll down is enough
  await content.evaluate((el) => el.scrollTo({top: 20, behavior: 'instant'}));
  await expect(button).toBeVisible();
  await content.evaluate((el) => el.scrollTo({top: 0, behavior: 'instant'}));
  await expect(button).toHaveCount(0);
  await content.evaluate((el) => el.scrollTo({top: el.scrollHeight, behavior: 'instant'}));
  await expect(button).toBeVisible();

  await button.click();
  await expect.poll(() => content.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(button).toHaveCount(0);
  await expect(tile(newtab, 'Tile 0')).toBeInViewport();
  // The focus doesn't stay on the hidden button: it goes on to the first tile
  await expect(tile(newtab, 'Example')).toBeFocused();

  // From the keyboard too
  await newtab.locator('body').click({position: {x: 5, y: 5}});
  await content.evaluate((el) => el.scrollTo({top: el.scrollHeight, behavior: 'instant'}));
  await button.press('Enter');
  await expect.poll(() => content.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(tile(newtab, 'Example')).toBeFocused();
});

test('the folder list is exactly as wide as the round buttons, even with long folder names', async ({newtab}) => {
  await seed(newtab, [{title: 'Очень длинное название папки, которое не должно расширять список', children: []}]);
  await expect(tile(newtab, 'Очень длинное название папки, которое не должно расширять список')).toBeVisible();
  const buttons = (await newtab.locator('.app-header__buttons').boundingBox())!;
  const select = (await newtab.getByRole('combobox', {name: 'Папка'}).boundingBox())!;
  expect(select.width).toBeCloseTo(buttons.width, 0);
  expect(select.x + select.width).toBeCloseTo(buttons.x + buttons.width, 0);

  // With some buttons hidden the list keeps the width of four buttons
  const dialog = await openSettings(newtab, 'Общие');
  await dialog.getByLabel('Кнопка обновления миниатюр').uncheck();
  await dialog.getByRole('button', {name: 'Готово'}).click();
  await expect(newtab.locator('.app-header__buttons .icon-button')).toHaveCount(3);
  expect((await newtab.getByRole('combobox', {name: 'Папка'}).boundingBox())!.width).toBeCloseTo(select.width, 0);
});

test('a web bookmark opens in the current tab', async ({context, newtab}) => {
  await context.route('https://example.com/**', (route) => route.fulfill({body: '<title>Example page</title>'}));
  await tile(newtab, 'Example').click();
  await expect(newtab).toHaveURL('https://example.com/');
});

test('folder preview grid: 4×3 by default, any size from the settings', async ({newtab}) => {
  const sites = Array.from({length: 20}, (_, i) => ({title: `Сайт ${i + 1}`, url: `https://site${i + 1}.example/`}));
  await seed(newtab, [{title: 'Много', children: sites}, {title: 'Мало', children: sites.slice(0, 3)}]);
  const cells = (folder: string) => tile(newtab, folder).locator('.folder-preview > *');
  const filled = (folder: string) => tile(newtab, folder).locator('.folder-preview > .preview-cell');
  await expect(cells('Много')).toHaveCount(12);
  await expect(filled('Много')).toHaveCount(12);

  const dialog = await openSettings(newtab, 'Общие');
  const buttons = dialog.getByRole('radiogroup', {name: 'Сетка превью'});
  await expect(buttons.getByRole('radio', {name: '4 × 3'})).toBeChecked();
  for (const [name, count] of [['2 × 2', 4], ['3 × 3', 9], ['4 × 2', 8], ['4 × 4', 16]] as const) {
    await buttons.getByRole('radio', {name}).check();
    await expect(cells('Много')).toHaveCount(count);
    await expect(filled('Много')).toHaveCount(count);
    // A folder with few sites is padded with empty cells to the full grid
    await expect(cells('Мало')).toHaveCount(count);
    await expect(filled('Мало')).toHaveCount(3);
  }
  // Columns follow the grid
  const columns = await tile(newtab, 'Много').locator('.folder-preview')
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(4);
});

test('subfolders in a folder\'s preview: four looks; a subfolder\'s own picture shows there too', async ({newtab}) => {
  await seed(newtab, [{title: 'Внешняя', children: [
    {title: 'Сайт', url: 'https://site.example/'},
    {title: 'Проекты', children: [{title: 'A', url: 'https://alpha.example/'}, {title: 'B', url: 'https://beta.example/'}]},
  ]}]);
  const cell = tile(newtab, 'Внешняя').locator('.folder-preview [title="Проекты"]');
  await expect(cell.locator('svg')).toBeVisible(); // A folder outline by default

  const dialog = await openSettings(newtab, 'Общие');
  const style = dialog.getByLabel('Вложенные папки в превью');
  await style.selectOption('letter');
  await expect(cell.locator('.preview-cell__letter')).toHaveText('П');
  await style.selectOption('contents');
  await expect(cell.locator('.site-icon')).toHaveCount(2);
  await style.selectOption('filled');
  await expect(cell).toHaveClass(/preview-cell--filled/);
  await dialog.getByRole('button', {name: 'Готово'}).click();

  // A picture chosen for the subfolder replaces its look in the parent's preview
  await tile(newtab, 'Внешняя').click();
  await tile(newtab, 'Проекты').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Картинка…'}).click();
  const chooser = newtab.waitForEvent('filechooser');
  await newtab.getByRole('dialog').getByRole('button', {name: 'Выбрать картинку…'}).click();
  await (await chooser).setFiles({name: 'p.png', mimeType: 'image/png', buffer: await makePng(newtab, 200, '#ff6600')});
  await newtab.getByRole('dialog').getByRole('button', {name: 'Готово'}).click();
  await newtab.goBack();
  await expect(tile(newtab, 'Внешняя').locator(`.folder-preview [title="Проекты"] img`)).toBeVisible();
});
