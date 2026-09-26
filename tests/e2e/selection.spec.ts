import type {Locator, Page} from '@playwright/test';
import {dropAt, expect, getChildren, seed, test, tile} from './fixtures';

test.beforeEach(async ({context, newtab}) => {
  await context.route('https://*.example/**', (route) => route.fulfill({body: '<title>Страница</title>'}));
  await newtab.setViewportSize({width: 1200, height: 900});
  await seed(newtab, [
    {title: 'Альфа', url: 'https://alpha.example/'},
    {title: 'Бета', url: 'https://beta.example/'},
    {title: 'Гамма', url: 'https://gamma.example/'},
    {title: 'Дельта', url: 'https://delta.example/'},
    {title: 'Папка', children: [{title: 'Внутри', url: 'https://inside.example/'}]},
  ]);
  await expect(tile(newtab, 'Альфа')).toBeVisible();
});

const check = (page: Page, title: string) => page.getByRole('checkbox', {name: `Выбрать «${title}»`});
const bar = (page: Page) => page.getByRole('toolbar', {name: 'Выделенные закладки'});
const browserOrder = async (page: Page, folderId = '1') => (await getChildren(page, folderId)).map((node) => node.title);

test('check mark, click, Shift range, Ctrl+A and Esc', async ({newtab}) => {
  await expect(bar(newtab)).toHaveCount(0);
  await tile(newtab, 'Альфа').hover();
  await check(newtab, 'Альфа').click();
  await expect(check(newtab, 'Альфа')).toBeChecked();
  await expect(bar(newtab)).toContainText('Выбрано: 1');

  // While something is selected, a click on a tile marks it instead of opening it
  await tile(newtab, 'Гамма').click();
  await expect(newtab).toHaveURL(/newtab\.html/);
  await expect(bar(newtab)).toContainText('Выбрано: 2');
  await tile(newtab, 'Гамма').click();
  await expect(check(newtab, 'Гамма')).not.toBeChecked();

  // Shift+click — from the last clicked tile ("Гамма") to this one; "Альфа" stays marked
  await tile(newtab, 'Дельта').click({modifiers: ['Shift']});
  await expect(bar(newtab)).toContainText('Выбрано: 3');
  await expect(check(newtab, 'Бета')).not.toBeChecked();
  await expect(check(newtab, 'Гамма')).toBeChecked();
  await expect(check(newtab, 'Папка')).not.toBeChecked();

  await newtab.keyboard.press('Escape');
  await expect(bar(newtab)).toHaveCount(0);

  await newtab.locator('main').click({position: {x: 5, y: 5}});
  await newtab.keyboard.press('Control+KeyA');
  await expect(bar(newtab)).toContainText('Выбрано: 5');

  // The selection resets when moving to another folder
  await bar(newtab).getByRole('button', {name: 'Снять выделение'}).click();
  await tile(newtab, 'Альфа').focus();
  await newtab.keyboard.press('Space');
  await expect(check(newtab, 'Альфа')).toBeChecked();
  await newtab.getByRole('checkbox', {name: 'Выбрать «Папка»'}).click();
  await newtab.keyboard.press('Escape');
  await tile(newtab, 'Папка').click();
  await expect(tile(newtab, 'Внутри')).toBeVisible();
  await expect(bar(newtab)).toHaveCount(0);
});

test('moving to a folder and deleting a group with undo', async ({newtab}) => {
  const folderId = (await tile(newtab, 'Папка').getAttribute('data-bookmark-id'))!;
  await tile(newtab, 'Бета').hover();
  await check(newtab, 'Бета').click();
  await tile(newtab, 'Дельта').click();

  await bar(newtab).getByRole('button', {name: 'Переместить в папку…'}).click();
  const dialog = newtab.getByRole('dialog', {name: 'Переместить 2 элемента'});
  await dialog.getByLabel('Папка').selectOption({label: 'Папка'});
  await dialog.getByRole('button', {name: 'Переместить'}).click();

  await expect.poll(() => browserOrder(newtab, folderId)).toEqual(['Внутри', 'Бета', 'Дельта']);
  await expect(newtab.getByRole('status').filter({hasText: 'Перемещено в «Папка»: 2'})).toBeVisible();
  await expect(bar(newtab)).toHaveCount(0);

  // Deleting a group is one action and is undone the same way
  await tile(newtab, 'Альфа').hover();
  await check(newtab, 'Альфа').click();
  await tile(newtab, 'Гамма').click();
  await bar(newtab).getByRole('button', {name: 'Удалить'}).click();
  await expect.poll(() => browserOrder(newtab)).toEqual(['Папка']);

  await newtab.getByRole('status').filter({hasText: 'Удалено: 2'}).getByRole('button', {name: 'Отменить'}).click();
  await expect.poll(() => browserOrder(newtab)).toEqual(['Альфа', 'Гамма', 'Папка']);
});

test('Delete on a selected tile removes the whole group', async ({newtab}) => {
  await tile(newtab, 'Альфа').focus();
  await newtab.keyboard.press('Space');
  await tile(newtab, 'Бета').focus();
  await newtab.keyboard.press('Space');
  await newtab.keyboard.press('Delete');
  await expect.poll(() => browserOrder(newtab)).toEqual(['Гамма', 'Дельта', 'Папка']);
});

test.describe(() => {
  // Site access is needed for chrome.tabs to show tab URLs
  test.use({hostAccess: true});

  test('"Open all" opens bookmarks in background tabs and skips folders', async ({newtab}) => {
    await newtab.keyboard.press('Control+KeyA');
    await bar(newtab).getByRole('button', {name: 'Открыть все'}).click();
    await expect.poll(() => newtab.evaluate(async () => {
      const tabs = await chrome.tabs.query({url: 'https://*.example/*'});
      return tabs.map((tab) => ({url: tab.url ?? tab.pendingUrl, active: tab.active})).sort((a, b) => a.url!.localeCompare(b.url!));
    })).toEqual([
      {url: 'https://alpha.example/', active: false},
      {url: 'https://beta.example/', active: false},
      {url: 'https://delta.example/', active: false},
      {url: 'https://gamma.example/', active: false},
    ]);
    await expect(tile(newtab, 'Альфа')).toBeVisible();
  });
});

test.describe('dragging a group', () => {
  test.describe.configure({retries: 2});

  const center = async (locator: Locator) => {
    const box = (await locator.boundingBox())!;
    return {x: box.x + box.width / 2, y: box.y + box.height / 2};
  };

  test('selected tiles move as a block', async ({newtab}) => {
    await tile(newtab, 'Альфа').hover();
    await check(newtab, 'Альфа').click();
    await tile(newtab, 'Бета').click();

    const from = await center(tile(newtab, 'Альфа'));
    const to = await center(tile(newtab, 'Дельта'));
    await newtab.mouse.move(from.x, from.y);
    await newtab.mouse.down();
    await newtab.mouse.move(to.x, to.y, {steps: 10});
    // The other selected tiles are "in flight" too
    await expect(newtab.locator('.bookmark-grid__cell--group-dragging')).toHaveCount(1);
    await dropAt(newtab, to.x, to.y);

    await expect.poll(() => browserOrder(newtab)).toEqual(['Гамма', 'Дельта', 'Альфа', 'Бета', 'Папка']);
  });

  test('selected tiles move into a folder', async ({newtab}) => {
    const folderId = (await tile(newtab, 'Папка').getAttribute('data-bookmark-id'))!;
    await tile(newtab, 'Альфа').hover();
    await check(newtab, 'Альфа').click();
    await tile(newtab, 'Гамма').click();

    const from = await center(tile(newtab, 'Гамма'));
    const to = await center(tile(newtab, 'Папка'));
    await newtab.mouse.move(from.x, from.y);
    await newtab.mouse.down();
    await newtab.mouse.move(to.x, to.y, {steps: 10});
    await expect(tile(newtab, 'Папка')).toHaveClass(/tile--drop-into/);
    await dropAt(newtab, to.x, to.y);

    await expect.poll(() => browserOrder(newtab, folderId)).toEqual(['Внутри', 'Альфа', 'Гамма']);
    expect(await browserOrder(newtab)).toEqual(['Бета', 'Дельта', 'Папка']);
  });
});
