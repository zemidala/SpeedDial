import type {Page} from '@playwright/test';
import {expect, getChildren, openSettings, seed, test, tile} from './fixtures';

// The permission prompt is browser UI and can't be clicked in a test — grant the permissions via the manifest
test.use({grantedPermissions: ['topSites', 'sessions', 'tabs']});

test.beforeEach(async ({context, newtab}) => {
  await context.route('https://*.example/**', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<title>${new URL(route.request().url()).hostname}</title>`,
  }));
  // A clean profile has no browsing history, so the most visited list is faked
  await context.addInitScript(() => {
    if (!chrome.topSites) return;
    Object.defineProperty(chrome.topSites, 'get', {
      value: async () => [
        {title: 'Alpha site', url: 'https://alpha.example/'},
        {title: 'Browser settings', url: 'chrome://settings/'},
        {title: 'Beta site', url: 'https://beta.example/'},
      ],
    });
  });
  await newtab.reload();
  await seed(newtab, [{title: 'Папка', children: [{title: 'Внутри', url: 'https://inside.example/'}]}]);
  await expect(tile(newtab, 'Папка')).toBeVisible();
});

const invite = (page: Page) => page.getByRole('region', {name: 'Часто посещаемые и недавно закрытые'});
const shelf = (page: Page, name: string) => page.getByRole('region', {name, exact: true});
const folderSelect = (page: Page) => page.getByRole('combobox', {name: 'Папка'});

test('the invitation turns on the shelves below the start page tiles', async ({newtab}) => {
  await invite(newtab).getByRole('button', {name: 'Показать'}).click();
  await expect(invite(newtab)).toHaveCount(0);

  const mostVisited = shelf(newtab, 'Часто посещаемые');
  await expect(mostVisited.getByRole('link', {name: 'Alpha site'})).toBeVisible();
  await expect(mostVisited.getByRole('link', {name: 'Beta site'})).toBeVisible();
  // Web pages only
  await expect(mostVisited.getByRole('link', {name: 'Browser settings'})).toHaveCount(0);

  // The bar sits at the bottom of the window (20px page padding)
  const box = (await newtab.locator('.shelves').boundingBox())!;
  expect(box.y + box.height).toBeCloseTo((newtab.viewportSize()?.height ?? 0) - 20, -1);
  // The tooltip has the full name and the URL
  await expect(mostVisited.getByRole('link', {name: 'Alpha site'})).toHaveAttribute('title', 'Alpha site\nhttps://alpha.example/');

  // The shelves are on the start pages only, not inside other folders
  await tile(newtab, 'Папка').click();
  await expect(tile(newtab, 'Внутри')).toBeVisible();
  await expect(mostVisited).toHaveCount(0);
  await newtab.getByRole('navigation', {name: 'Путь к папке'}).getByRole('button', {name: 'Главная'}).click();
  await expect(mostVisited).toBeVisible();

  // The menu of a shelf item can add it to bookmarks, but not edit or delete it
  await mostVisited.getByRole('link', {name: 'Alpha site'}).click({button: 'right'});
  const menu = newtab.getByRole('menu');
  await expect(menu.getByRole('menuitem', {name: 'Удалить'})).toHaveCount(0);
  await menu.getByRole('menuitem', {name: 'Добавить в закладки'}).click();
  await expect(newtab.getByRole('status').filter({hasText: /^Добавлено в «/})).toBeVisible();
  await expect.poll(async () => (await getChildren(newtab, '1')).map((node) => node.url)).toContain('https://alpha.example/');

  // "All" opens the whole list as a read-only folder
  // The button shows how many items there are
  await expect(mostVisited.getByRole('button', {name: /^Все/})).toHaveText(/Все\s*2/);
  await mostVisited.getByRole('button', {name: /^Все/}).click();
  await expect(tile(newtab, 'Alpha site')).toBeVisible();
  await expect(folderSelect(newtab)).toHaveValue('most-visited');
  await expect(newtab.getByRole('button', {name: 'Добавить закладку'})).toHaveCount(0);
  await expect(newtab.getByRole('checkbox', {name: 'Выбрать «Alpha site»'})).toHaveCount(0);
  await expect(newtab.getByRole('button', {name: 'Обновить миниатюры'})).toHaveCount(0);

  // Back returns to the start page with the shelves, like Back in other folders
  await newtab.locator('.tile--action', {hasText: 'Назад'}).click();
  await expect(tile(newtab, 'Папка')).toBeVisible();
  await expect(mostVisited).toBeVisible();
});

test('recently closed: the shelf updates by itself; turning it off hides it', async ({context, newtab}) => {
  const closed = await context.newPage();
  await closed.goto('https://first.example/');
  await closed.close();

  const dialog = await openSettings(newtab, 'Общие');
  await dialog.getByLabel('Недавно закрытые вкладки').check();
  await dialog.getByRole('button', {name: 'Готово'}).click();

  const recentlyClosed = shelf(newtab, 'Недавно закрытые');
  await expect(recentlyClosed.getByRole('link', {name: 'first.example'})).toBeVisible();
  // Only one shelf is on — the invitation is gone
  await expect(invite(newtab)).toHaveCount(0);
  await expect(shelf(newtab, 'Часто посещаемые')).toHaveCount(0);

  // Closing another tab refreshes the shelf
  const another = await context.newPage();
  await another.goto('https://second.example/');
  await another.close();
  await expect(recentlyClosed.getByRole('link', {name: 'second.example'})).toBeVisible();

  const settings = await openSettings(newtab, 'Общие');
  await settings.getByLabel('Недавно закрытые вкладки').uncheck();
  await settings.getByRole('button', {name: 'Готово'}).click();
  await expect(recentlyClosed).toHaveCount(0);
  await expect(folderSelect(newtab).locator('option', {hasText: 'Недавно закрытые'})).toHaveCount(0);
});

test('"Not now" hides the invitation for good', async ({newtab}) => {
  await invite(newtab).getByRole('button', {name: 'Не сейчас'}).click();
  await expect(invite(newtab)).toHaveCount(0);
  await newtab.reload();
  await expect(tile(newtab, 'Папка')).toBeVisible();
  await expect(invite(newtab)).toHaveCount(0);
});

test('shelf items can be removed one by one or all at once, and brought back', async ({newtab}) => {
  await invite(newtab).getByRole('button', {name: 'Показать'}).click();
  const mostVisited = shelf(newtab, 'Часто посещаемые');
  await expect(mostVisited.getByRole('link', {name: 'Alpha site'})).toBeVisible();

  // One site
  await mostVisited.getByRole('link', {name: 'Alpha site'}).click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Убрать из списка'}).click();
  await expect(mostVisited.getByRole('link', {name: 'Alpha site'})).toHaveCount(0);
  await expect(mostVisited.getByRole('link', {name: 'Beta site'})).toBeVisible();

  // The whole list, from the shelf's name; the cleared shelf stays with a way back
  await mostVisited.getByRole('heading', {name: 'Часто посещаемые'}).click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Очистить список'}).click();
  await expect(mostVisited.getByRole('link')).toHaveCount(0);
  await expect(mostVisited).toContainText('Список очищен.');
  // Still hidden after a reload
  await newtab.reload();
  await expect(mostVisited).toContainText('Список очищен.');

  await mostVisited.getByRole('button', {name: 'Вернуть'}).click();
  await expect(mostVisited.getByRole('link', {name: 'Alpha site'})).toBeVisible();
  await expect(mostVisited.getByRole('link', {name: 'Beta site'})).toBeVisible();
});

test('the shelves tuck away to their tab and come back; the choice is remembered', async ({newtab}) => {
  await invite(newtab).getByRole('button', {name: 'Показать'}).click();
  const mostVisited = shelf(newtab, 'Часто посещаемые');
  await expect(mostVisited).toBeVisible();

  await newtab.getByRole('button', {name: 'Свернуть часто посещаемые и недавно закрытые'}).click();
  await expect(mostVisited).toHaveCount(0);
  const expand = newtab.getByRole('button', {name: 'Показать часто посещаемые и недавно закрытые'});
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  // Only the tab is left, on the bottom edge of the window
  const tab = (await expand.boundingBox())!;
  expect(tab.y + tab.height).toBeCloseTo(newtab.viewportSize()?.height ?? 0, -1);

  await newtab.reload();
  await expect(expand).toBeVisible();
  await expect(mostVisited).toHaveCount(0);
  await expand.click();
  await expect(mostVisited.getByRole('link', {name: 'Alpha site'})).toBeVisible();
});
