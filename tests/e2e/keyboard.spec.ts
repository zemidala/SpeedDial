import type {Page} from '@playwright/test';
import {expect, getChildren, seed, test, tile} from './fixtures';

test.beforeEach(async ({context, newtab}) => {
  await context.route('https://*.example/**', (route) => route.fulfill({body: '<title>Страница</title>'}));
  await newtab.setViewportSize({width: 1000, height: 800});
  await seed(newtab, [
    {title: 'Альфа', url: 'https://alpha.example/'},
    {title: 'Папка', children: [{title: 'Внутри', url: 'https://inside.example/'}]},
    {title: 'Бета', url: 'https://beta.example/'},
    {title: 'Гамма', url: 'https://gamma.example/'},
    {title: 'Дельта', url: 'https://delta.example/'},
    {title: 'Эпсилон', url: 'https://epsilon.example/'},
    {title: 'Дзета', url: 'https://zeta.example/'},
    {title: 'Эта', url: 'https://eta.example/'},
  ]);
  await expect(tile(newtab, 'Альфа')).toBeVisible();
});

const focusedTitle = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.title ?? null);

test('"/" — to search, arrow down — to tiles, Enter opens', async ({newtab}) => {
  await newtab.locator('main').click({position: {x: 5, y: 5}});
  await newtab.keyboard.press('/');
  const searchInput = newtab.getByRole('combobox', {name: 'Поиск'});
  await expect(searchInput).toBeFocused();
  await expect(searchInput).toHaveValue('');

  await newtab.keyboard.type('гам');
  await expect(tile(newtab, 'Альфа')).toHaveCount(0);
  await expect(tile(newtab, 'Гамма')).toBeVisible();
  await newtab.keyboard.press('ArrowDown');
  await expect(tile(newtab, 'Гамма')).toBeFocused();
  await newtab.keyboard.press('Enter');
  await expect(newtab).toHaveURL('https://gamma.example/');
});

test('arrows across the grid, Home and End', async ({newtab}) => {
  await newtab.getByRole('combobox', {name: 'Поиск'}).focus();
  await newtab.keyboard.press('ArrowDown');
  await expect(tile(newtab, 'Альфа')).toBeFocused();

  await newtab.keyboard.press('ArrowRight');
  await expect(tile(newtab, 'Папка')).toBeFocused();
  await newtab.keyboard.press('ArrowLeft');
  await expect(tile(newtab, 'Альфа')).toBeFocused();

  // Down — the tile below the current one, in the same column
  const x = async () => (await newtab.locator(':focus').boundingBox())!;
  const before = await x();
  await newtab.keyboard.press('ArrowDown');
  const after = await x();
  expect(after.y).toBeGreaterThan(before.y);
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
  await newtab.keyboard.press('ArrowUp');
  await expect(tile(newtab, 'Альфа')).toBeFocused();

  // End — the last tile ("Add bookmark"), Home — the first
  await newtab.keyboard.press('End');
  await expect(newtab.getByRole('button', {name: 'Добавить закладку'})).toBeFocused();
  await newtab.keyboard.press('Home');
  await expect(tile(newtab, 'Альфа')).toBeFocused();
  // The page didn't scroll with the arrows meanwhile
  expect(await newtab.evaluate(() => scrollY)).toBe(0);
});

test('Delete removes the focused tile, F2 edits', async ({newtab}) => {
  await tile(newtab, 'Бета').focus();
  await newtab.keyboard.press('F2');
  const dialog = newtab.getByRole('dialog', {name: 'Изменить закладку'});
  await expect(dialog.getByLabel('Название')).toHaveValue('Бета');
  await newtab.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await tile(newtab, 'Бета').focus();
  await newtab.keyboard.press('Delete');
  await expect(tile(newtab, 'Бета')).toHaveCount(0);
  // Focus is on the tile that took the removed one's place: delete in a row
  await expect.poll(() => focusedTitle(newtab)).toBe('Гамма');
  await expect(newtab.getByRole('status').filter({hasText: 'Закладка «Бета» удалена'})).toBeVisible();
  expect((await getChildren(newtab, '1')).map((node) => node.title)).not.toContain('Бета');
});

test('Alt+digit opens a tile by number', async ({newtab}) => {
  await newtab.keyboard.press('Alt+2');
  await expect(tile(newtab, 'Внутри')).toBeVisible();

  await newtab.keyboard.press('Alt+1');
  await expect(newtab).toHaveURL('https://inside.example/');
});

test('a keyboard-opened menu appears at the tile, Esc returns focus', async ({newtab}) => {
  await tile(newtab, 'Гамма').focus();
  await newtab.keyboard.press('Shift+F10');
  const menu = newtab.getByRole('menu');
  await expect(menu).toBeVisible();

  const tileBox = (await tile(newtab, 'Гамма').boundingBox())!;
  const menuBox = (await menu.boundingBox())!;
  expect(menuBox.x).toBeGreaterThanOrEqual(tileBox.x);
  expect(menuBox.x).toBeLessThanOrEqual(tileBox.x + tileBox.width);

  await newtab.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(tile(newtab, 'Гамма')).toBeFocused();
});
