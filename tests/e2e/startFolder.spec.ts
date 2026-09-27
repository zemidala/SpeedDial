import type {BrowserContext} from '@playwright/test';
import {expect, openSettings, seed, test, tile} from './fixtures';

/**
 * Makes the browser look different: the bookmarks bar with another id (like Chrome with account bookmarks),
 * no bar at all, or no folders at all. Only what the page sees changes
 */
async function browserFolders(context: BrowserContext, mode: 'moved-bar' | 'no-bar' | 'empty') {
  await context.addInitScript((mode) => {
    const {getChildren, get} = chrome.bookmarks;
    const hidden = new Set(mode === 'empty' ? ['1', '2', '3'] : ['1']);
    Object.defineProperty(chrome.bookmarks, 'getChildren', {
      value: async (id: string) => {
        const children = await getChildren(id);
        if (id !== '0') return children;
        const visible = children.filter((node) => !hidden.has(node.id));
        // "Other bookmarks" plays the bar: a bar whose id isn't 1
        return mode === 'moved-bar'
          ? visible.map((node) => (node.id === '2' ? {...node, folderType: 'bookmarks-bar'} : {...node, folderType: undefined}))
          : visible.map((node) => ({...node, folderType: undefined}));
      },
    });
    Object.defineProperty(chrome.bookmarks, 'get', {
      value: async (id: string | string[]) => {
        if (typeof id === 'string' && hidden.has(id)) throw new Error('Can\'t find bookmark for id.');
        return get(id as string);
      },
    });
  }, mode);
}

test.beforeEach(async ({newtab}) => {
  await seed(newtab, [{title: 'На панели', url: 'https://bar.example/'}]);
  await seed(newtab, [{title: 'В других', url: 'https://other.example/'}], '2');
});

test('the bookmarks bar is the start folder even when its id is different', async ({context, newtab}) => {
  await browserFolders(context, 'moved-bar');
  await newtab.reload();
  await expect(tile(newtab, 'В других')).toBeVisible();
  await expect(newtab).toHaveURL(/newtab\.html$/);
});

test('without a bookmarks bar the start page is Home', async ({context, newtab}) => {
  await browserFolders(context, 'no-bar');
  await newtab.reload();
  const crumbs = newtab.getByRole('navigation', {name: 'Путь к папке'});
  await expect(crumbs.locator('.breadcrumbs__item')).toHaveText(['Главная']);
  // Home shows the folders there are; no "pick a folder" prompt
  await expect(newtab.locator('.tile--folder').first()).toBeVisible();
  await expect(newtab.getByText('Папки закладок не найдены')).toHaveCount(0);
});

test('with no folders at all, the user is asked to pick the start folder', async ({context, newtab}) => {
  await browserFolders(context, 'empty');
  await newtab.reload();
  // The folder list in the header asks for a choice
  const folderSelect = newtab.getByRole('combobox', {name: 'Папка'});
  await expect(folderSelect).toHaveAttribute('aria-invalid', 'true');
  await expect(folderSelect.locator('option:checked')).toHaveText('Выберите папку…');

  // The notice leads to the start folder setting
  const notice = newtab.getByRole('status').filter({hasText: 'Папки закладок не найдены'});
  await notice.getByRole('button', {name: 'Выбрать'}).click();
  const dialog = newtab.getByRole('dialog', {name: 'Настройки'});
  await expect(dialog.getByLabel('Папка по умолчанию')).toBeVisible();
});

test('a start folder that\'s gone: the bar opens, and the setting asks for a new choice', async ({newtab}) => {
  const folder = await newtab.evaluate(() => chrome.bookmarks.create({parentId: '1', title: 'Temp'}));
  const settings = await openSettings(newtab, 'Общие');
  await settings.getByLabel('Папка по умолчанию').selectOption(folder.id);
  await settings.getByRole('button', {name: 'Готово'}).click();
  await newtab.evaluate((id) => chrome.bookmarks.remove(id), folder.id);
  await newtab.reload();

  await expect(tile(newtab, 'На панели')).toBeVisible();
  const dialog = await openSettings(newtab, 'Общие');
  const field = dialog.getByLabel('Папка по умолчанию');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field.locator('option:checked')).toHaveText('Выберите папку…');
  await field.selectOption({label: 'Главная'});
  await expect(field).not.toHaveAttribute('aria-invalid');
});
