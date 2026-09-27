import {expect, getChildren, seed, test, tile} from './fixtures';

// The browser's own context menu can't be opened or clicked from a test: the menu is checked as the service worker
// builds it, and "Other folder…" — through its window, which adds the bookmark the same way the menu does

test.beforeEach(async ({newtab}) => {
  await seed(newtab, [
    {title: 'Games', children: [{title: 'Old games', children: []}]},
    {title: 'Work', children: []},
    {title: 'Site', url: 'https://site.example/'},
  ]);
  await expect(tile(newtab, 'Games')).toBeVisible();
});

test('"Add to folder": the bookmarks bar and its folders, recent ones on top, rebuilt when folders change', async ({context, newtab}) => {
  const worker = context.serviceWorkers()[0];
  // Record what the menu is built of; any folder change rebuilds it
  await worker.evaluate(() => {
    const items: Array<{id: string; parentId?: string; title?: string; type?: string}> = [];
    Object.assign(globalThis, {menuItems: items});
    const create = chrome.contextMenus.create.bind(chrome.contextMenus);
    chrome.contextMenus.create = ((properties: chrome.contextMenus.CreateProperties) => {
      items.push({id: String(properties.id), parentId: properties.parentId as string, title: properties.title, type: properties.type});
      return create(properties);
    }) as typeof chrome.contextMenus.create;
    const removeAll = chrome.contextMenus.removeAll.bind(chrome.contextMenus);
    chrome.contextMenus.removeAll = (() => {
      items.length = 0;
      return removeAll();
    }) as typeof chrome.contextMenus.removeAll;
  });
  const submenu = () => worker.evaluate(() =>
    (globalThis as unknown as {menuItems: Array<{parentId?: string; title?: string; type?: string}>}).menuItems
      .filter((item) => item.parentId === 'add-to-folder')
      .map((item) => (item.type === 'separator' ? '—' : item.title)));
  const topLevel = () => worker.evaluate(() =>
    (globalThis as unknown as {menuItems: Array<{parentId?: string; title?: string}>}).menuItems
      .filter((item) => !item.parentId).map((item) => item.title));

  await seed(newtab, [{title: 'New', children: []}]);
  await expect.poll(submenu).toEqual(['Панель закладок', 'Games', 'Work', 'New', '—', 'Другая папка…']);
  expect(await topLevel()).toEqual(['Добавить в SpeedDial', 'Добавить в папку']);

  // A folder used recently comes first, above a line
  const oldGames = (await getChildren(newtab, (await tile(newtab, 'Games').getAttribute('data-bookmark-id'))!))[0];
  await newtab.evaluate((id) => chrome.storage.local.set({recentFolders: [id]}), oldGames.id);
  await expect.poll(submenu).toEqual(['Old games', '—', 'Панель закладок', 'Games', 'Work', 'New', '—', 'Другая папка…']);
});

test('"Other folder…": any folder, the name can be changed; the folder is remembered as recent', async ({context, extensionId, newtab}) => {
  const gamesId = (await tile(newtab, 'Games').getAttribute('data-bookmark-id'))!;
  const oldGamesId = (await getChildren(newtab, gamesId))[0].id;

  const window = await context.newPage();
  const params = new URLSearchParams({url: 'https://news.example/today', title: 'Today’s news', link: '0'});
  await window.goto(`chrome-extension://${extensionId}/add.html?${params}`);
  await expect(window.getByRole('heading', {name: 'Добавить эту страницу в папку'})).toBeVisible();
  await expect(window.getByText('news.example')).toBeVisible();

  // Nested folders are indented: "Old games" is two levels below the bar
  const folder = window.getByLabel('Папка');
  await expect(folder.locator('option', {hasText: 'Old games'})).toHaveText(/^\u00a0{6}Old games$/);
  await folder.selectOption(oldGamesId);
  await window.getByLabel('Название').fill('Новости');
  await window.getByRole('button', {name: 'Добавить'}).click();

  await expect.poll(async () => (await getChildren(newtab, oldGamesId)).map((node) => [node.title, node.url]))
    .toEqual([['Новости', 'https://news.example/today']]);
  expect(await newtab.evaluate(async () => (await chrome.storage.local.get('recentFolders')).recentFolders))
    .toEqual([oldGamesId]);

  // Next time the recent folder is offered first
  const again = await context.newPage();
  await again.goto(`chrome-extension://${extensionId}/add.html?${params}`);
  await expect(again.getByLabel('Папка')).toHaveValue(oldGamesId);
});
