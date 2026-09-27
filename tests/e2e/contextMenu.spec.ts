import type {Page} from '@playwright/test';
import {expect, getChildren, makePng, seed, test, tile} from './fixtures';

test.beforeEach(async ({context, newtab}) => {
  await context.route('https://*.example/**', (route) => route.fulfill({body: '<title>Страница</title>'}));
  await seed(newtab, [
    {title: 'Бета', url: 'https://beta.example/'},
    {title: 'Альфа', url: 'https://alpha.example/'},
    {title: 'Папка', children: [{title: 'Гамма', url: 'https://gamma.example/'}]},
  ]);
  await expect(tile(newtab, 'Альфа')).toBeVisible();
});

const menuItems = (page: Page) => page.getByRole('menu').getByRole('menuitem');
const openPageMenu = (page: Page) => page.locator('main').click({button: 'right', position: {x: 5, y: 300}});
const titles = (page: Page) => page.locator('[data-bookmark-id] .tile__title-text').allTextContents();

test('menu of a bookmark tile, a folder tile and an empty area', async ({newtab}) => {
  await tile(newtab, 'Бета').click({button: 'right'});
  await expect(menuItems(newtab)).toHaveText([
    'Открыть',
    'Открыть в новой вкладке',
    'Открыть в фоновой вкладке',
    'Открыть в новом окне',
    'Открыть в окне в режиме инкогнито',
    'Назад',
    'Вперед',
    'Копировать ссылку',
    'Новая закладка…',
    'Новая папка…',
    'Редактировать…',
    'Значок…',
    'Сортировать…',
    'Проверить ссылку',
    'Удалить',
    'Обновить',
  ]);
  await newtab.keyboard.press('Escape');

  // A folder has no incognito and copy link; it opens all its bookmarks and gets a picture instead of an icon
  await tile(newtab, 'Папка').click({button: 'right'});
  await expect(menuItems(newtab)).toHaveText([
    'Открыть',
    'Открыть в новой вкладке',
    'Открыть в фоновой вкладке',
    'Открыть в новом окне',
    'Открыть все закладки',
    'Открыть все в новом окне',
    'Назад',
    'Вперед',
    'Новая закладка в этой папке…',
    'Новая папка в этой папке…',
    'Редактировать…',
    'Картинка…',
    'Сортировать…',
    'Проверить ссылки в папке…',
    'Экспортировать папку в файл',
    'Удалить',
    'Обновить',
  ]);
  await newtab.keyboard.press('Escape');

  await openPageMenu(newtab);
  await expect(menuItems(newtab)).toHaveText(['Назад', 'Вперед', 'Новая закладка…', 'Новая папка…', 'Сортировать…', 'Найти дубли…', 'Проверить все ссылки…', 'Проверить ссылки в этой папке…', 'Обновить']);
});

test.describe(() => {
  // Site access is needed for chrome.tabs to show tab URLs
  test.use({hostAccess: true});

  test('opening in a new tab, a background tab and a new window', async ({newtab}) => {
    // Tabs created via the extension API aren't routed to the stub by Playwright — inspect them via chrome.tabs
    const openedTab = () => newtab.evaluate(async () => {
      const speedDial = await chrome.tabs.getCurrent();
      const tabs = await chrome.tabs.query({url: 'https://alpha.example/*'});
      const tab = tabs.at(-1);
      return tab && {active: tab.active, sameWindow: tab.windowId === speedDial?.windowId};
    });
    const closeOpened = () => newtab.evaluate(async () => {
      const tabs = await chrome.tabs.query({url: 'https://alpha.example/*'});
      await chrome.tabs.remove(tabs.map((tab) => tab.id!));
    });

    const cases = [
      ['Открыть в новой вкладке', {active: true, sameWindow: true}],
      ['Открыть в фоновой вкладке', {active: false, sameWindow: true}],
      ['Открыть в новом окне', {active: true, sameWindow: false}],
    ] as const;
    for (const [item, expected] of cases) {
      await tile(newtab, 'Альфа').click({button: 'right'});
      await newtab.getByRole('menuitem', {name: item}).click();
      await expect.poll(openedTab).toEqual(expected);
      await closeOpened();
    }
    // The SpeedDial tab itself stayed in place
    await expect(tile(newtab, 'Альфа')).toBeVisible();
  });
});

test('a folder opens as a SpeedDial page in a new tab', async ({context, newtab}) => {
  const folderPage = context.waitForEvent('page');
  await tile(newtab, 'Папка').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Открыть в новой вкладке'}).click();
  await expect(tile(await folderPage, 'Гамма')).toBeVisible();

  await tile(newtab, 'Альфа').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Открыть', exact: true}).click();
  await expect(newtab).toHaveURL('https://alpha.example/');
});

test('copying a link', async ({newtab}) => {
  // An extension page can't read the clipboard without a permission, so record what was sent to it.
  // The real write still happens — if it fails, an error shows instead of the confirmation
  await newtab.evaluate(() => {
    const original = navigator.clipboard.writeText.bind(navigator.clipboard);
    Object.assign(window, {copied: [] as string[]});
    navigator.clipboard.writeText = async (text: string) => {
      await original(text);
      (window as unknown as {copied: string[]}).copied.push(text);
    };
  });
  await tile(newtab, 'Альфа').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Копировать ссылку'}).click();

  await expect(newtab.getByRole('status').filter({hasText: 'Ссылка скопирована'})).toBeVisible();
  expect(await newtab.evaluate(() => (window as unknown as {copied: string[]}).copied)).toEqual(['https://alpha.example/']);
});

test('new folder on an empty area and a new bookmark after a tile', async ({newtab}) => {
  await openPageMenu(newtab);
  await newtab.getByRole('menuitem', {name: 'Новая папка…'}).click();
  const folderDialog = newtab.getByRole('dialog', {name: 'Новая папка'});
  await expect(folderDialog.getByLabel('Адрес')).toHaveCount(0);
  await folderDialog.getByLabel('Название').fill('Проекты');
  await folderDialog.getByRole('button', {name: 'Создать'}).click();
  await expect.poll(() => titles(newtab)).toEqual(['Бета', 'Альфа', 'Папка', 'Проекты']);

  // Right-click on "Бета" — the new bookmark goes right after it
  await tile(newtab, 'Бета').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Новая закладка…'}).click();
  const bookmarkDialog = newtab.getByRole('dialog', {name: 'Новая закладка'});
  await bookmarkDialog.getByLabel('Название').fill('Вставка');
  await bookmarkDialog.getByLabel('Адрес').fill('insert.example');
  await bookmarkDialog.getByRole('button', {name: 'Создать'}).click();
  await expect.poll(() => titles(newtab)).toEqual(['Бета', 'Вставка', 'Альфа', 'Папка', 'Проекты']);

  // Empty folder name — "New folder"
  await openPageMenu(newtab);
  await newtab.getByRole('menuitem', {name: 'Новая папка…'}).click();
  await newtab.getByRole('dialog', {name: 'Новая папка'}).getByRole('button', {name: 'Создать'}).click();
  await expect(tile(newtab, 'Новая папка')).toBeVisible();
});

test('new folder and bookmark — inside the folder the menu was opened on', async ({newtab}) => {
  const folderId = (await tile(newtab, 'Папка').getAttribute('data-bookmark-id'))!;

  await tile(newtab, 'Папка').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Новая папка в этой папке…'}).click();
  const folderDialog = newtab.getByRole('dialog', {name: 'Новая папка в «Папка»'});
  await folderDialog.getByLabel('Название').fill('Вложенная');
  await folderDialog.getByRole('button', {name: 'Создать'}).click();

  await tile(newtab, 'Папка').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Новая закладка в этой папке…'}).click();
  const bookmarkDialog = newtab.getByRole('dialog', {name: 'Новая закладка в «Папка»'});
  await bookmarkDialog.getByLabel('Адрес').fill('inside.example');
  await bookmarkDialog.getByRole('button', {name: 'Создать'}).click();

  await expect.poll(async () => (await getChildren(newtab, folderId)).map((node) => node.title))
    .toEqual(['Гамма', 'Вложенная', 'inside.example']);
  // Nothing appeared in the open folder, and the folder preview shows the new subfolder
  expect(await titles(newtab)).toEqual(['Бета', 'Альфа', 'Папка']);
  await expect(tile(newtab, 'Папка').locator('.folder-preview [title="Вложенная"]')).toBeVisible();
});

test('sorting a folder changes the order in the browser', async ({newtab}) => {
  await openPageMenu(newtab);
  await newtab.getByRole('menuitem', {name: 'Сортировать…'}).click();
  const dialog = newtab.getByRole('dialog', {name: /^Сортировать «/});
  await dialog.getByLabel('Порядок').selectOption('title');
  await dialog.getByLabel('Папки и закладки').selectOption('foldersFirst');
  await dialog.getByRole('button', {name: 'Сортировать'}).click();

  await expect.poll(() => titles(newtab)).toEqual(['Папка', 'Альфа', 'Бета']);
  expect((await getChildren(newtab, '1')).map((node) => node.title)).toEqual(['Папка', 'Альфа', 'Бета']);

  // Nothing to sort at the root: it holds system folders
  await newtab.getByRole('navigation', {name: 'Путь к папке'}).getByRole('button', {name: 'Главная'}).click();
  await openPageMenu(newtab);
  await expect(newtab.getByRole('menuitem', {name: 'Сортировать…'})).toBeDisabled();
});

test('back and forward through folders, keyboard control', async ({newtab}) => {
  await openPageMenu(newtab);
  await expect(newtab.getByRole('menuitem', {name: 'Назад'})).toBeDisabled();
  await newtab.keyboard.press('Escape');

  await tile(newtab, 'Папка').click();
  await expect(tile(newtab, 'Гамма')).toBeVisible();

  // Focus on the first available item; arrows and Enter
  await openPageMenu(newtab);
  await expect(newtab.getByRole('menuitem', {name: 'Назад'})).toBeFocused();
  await newtab.keyboard.press('Enter');
  await expect(tile(newtab, 'Альфа')).toBeVisible();

  await openPageMenu(newtab);
  await expect(newtab.getByRole('menuitem', {name: 'Назад'})).toBeDisabled();
  await expect(newtab.getByRole('menuitem', {name: 'Вперед'})).toBeFocused();
  await newtab.keyboard.press('ArrowDown');
  await expect(newtab.getByRole('menuitem', {name: 'Новая закладка…'})).toBeFocused();
  await newtab.keyboard.press('ArrowUp');
  await newtab.keyboard.press('Enter');
  await expect(tile(newtab, 'Гамма')).toBeVisible();
});

test.describe('opening a folder\'s bookmarks', () => {
  // With site access the extension sees the addresses of the tabs it opened
  test.use({hostAccess: true});

  test('all at once — in tabs or in a new window', async ({newtab}) => {
    await seed(newtab, [{title: 'Набор', children: [
      {title: 'Один', url: 'https://one.example/'},
      {title: 'Два', url: 'https://two.example/'},
      {title: 'Вложенная', children: [{title: 'Не открывается', url: 'https://nested.example/'}]},
    ]}]);
    const openedTabs = () => newtab.evaluate(async () => {
      const tabs = await chrome.tabs.query({url: 'https://*.example/*'});
      return tabs.map((tab) => ({url: tab.url ?? tab.pendingUrl, windowId: tab.windowId}));
    });

    await tile(newtab, 'Набор').click({button: 'right'});
    await newtab.getByRole('menuitem', {name: 'Открыть все закладки'}).click();
    // Only the bookmarks right inside, like "Open all" in the browser
    await expect.poll(async () => (await openedTabs()).map((tab) => tab.url).sort())
      .toEqual(['https://one.example/', 'https://two.example/']);

    await tile(newtab, 'Набор').click({button: 'right'});
    await newtab.getByRole('menuitem', {name: 'Открыть все в новом окне'}).click();
    // Both again, together in a window of their own
    await expect.poll(async () => (await openedTabs()).length).toBe(4);
    const tabs = await openedTabs();
    const current = await newtab.evaluate(async () => (await chrome.windows.getCurrent()).id);
    const inNewWindow = tabs.filter((tab) => tab.windowId !== current);
    expect(inNewWindow.map((tab) => tab.url).sort()).toEqual(['https://one.example/', 'https://two.example/']);
  });
});

test('a folder gets its own picture instead of the previews of its contents', async ({newtab}) => {
  await tile(newtab, 'Папка').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Картинка…'}).click();
  const dialog = newtab.getByRole('dialog', {name: 'Картинка папки «Папка»'});
  // Nothing about site icons or page screenshots for a folder
  await expect(dialog.getByRole('button', {name: 'Обновить иконку сайта'})).toHaveCount(0);
  await expect(dialog.getByRole('button', {name: 'Сделать снимок страницы'})).toHaveCount(0);

  const chooser = newtab.waitForEvent('filechooser');
  await dialog.getByRole('button', {name: 'Выбрать картинку…'}).click();
  await (await chooser).setFiles({name: 'folder.png', mimeType: 'image/png', buffer: await makePng(newtab, 300, '#2080ff')});
  const picture = tile(newtab, 'Папка').locator('.tile__thumbnail');
  await expect(picture).toBeVisible();
  await expect(tile(newtab, 'Папка').locator('.folder-preview')).toHaveCount(0);

  await dialog.getByRole('button', {name: 'Убрать картинку'}).click();
  await expect(dialog.getByRole('status')).toHaveText('Картинка убрана — на плитке снова содержимое папки');
  await expect(picture).toHaveCount(0);
  await expect(tile(newtab, 'Папка').locator('.folder-preview')).toBeVisible();
});
