import type {Page} from '@playwright/test';
import {expect, getChildren, openSettings, seed, test, tile} from './fixtures';

test.beforeEach(async ({newtab}) => {
  await seed(newtab, [
    {title: 'Example', url: 'https://example.com/'},
    {title: 'Unique', url: 'https://unique.example/'},
    {title: 'Работа', children: [
      {title: 'Example again', url: 'http://www.example.com'},
      {title: 'Docs', url: 'https://docs.example/'},
    ]},
    {title: 'Docs copy', url: 'https://docs.example/#top'},
  ]);
  await expect(tile(newtab, 'Example')).toBeVisible();
});

const dialogOf = (page: Page) => page.getByRole('dialog', {name: 'Дубли закладок'});

async function openFromMenu(page: Page) {
  await page.locator('main').click({button: 'right', position: {x: 5, y: 5}});
  await page.getByRole('menuitem', {name: 'Найти дубли…'}).click();
  return dialogOf(page);
}

test('finds duplicates, deletes the extra copies and undoes it', async ({newtab}) => {
  const dialog = await openFromMenu(newtab);
  await expect(dialog.getByRole('status').first()).toHaveText(/^2 страницы в закладках больше одного раза — 2 лишние копии/);

  // The first copy stays, the rest are marked
  await expect(dialog.getByRole('checkbox', {name: /^Удалить «Example» из/})).not.toBeChecked();
  await expect(dialog.getByRole('checkbox', {name: /^Удалить «Example again» из «.* › Работа»$/})).toBeChecked();
  await expect(dialog.getByRole('checkbox', {name: /^Удалить «Docs copy»/})).toBeChecked();

  // Changed my mind about the docs: keep both
  await dialog.getByRole('checkbox', {name: /^Удалить «Docs copy»/}).uncheck();
  await dialog.getByRole('button', {name: 'Удалить отмеченные (1)'}).click();

  // Only the docs group is left
  await expect(dialog.getByRole('checkbox')).toHaveCount(2);
  const [work] = (await getChildren(newtab, '1')).filter((node) => node.title === 'Работа');
  expect((await getChildren(newtab, work.id)).map((node) => node.title)).toEqual(['Docs']);

  // Undo from the notification inside the dialog
  await dialog.getByRole('status').filter({hasText: 'Удалено дублей: 1'}).getByRole('button', {name: 'Отменить'}).click();
  await expect(dialog.getByRole('checkbox')).toHaveCount(4);
  expect((await getChildren(newtab, work.id)).map((node) => node.title)).toEqual(['Example again', 'Docs']);
});

test('deleting everything leaves the dialog with "no duplicates"; the folder opens from the list', async ({newtab}) => {
  let dialog = await openFromMenu(newtab);
  await dialog.getByRole('button', {name: 'Удалить отмеченные (2)'}).click();
  await expect(dialog.getByText('Дублей нет')).toBeVisible();
  await dialog.getByRole('button', {name: 'Закрыть', exact: true}).click();

  await newtab.evaluate(() => chrome.bookmarks.create({parentId: '2', title: 'Unique copy', url: 'https://unique.example'}));
  const settings = await openSettings(newtab, 'Общие');
  await settings.getByRole('button', {name: 'Найти…'}).click();
  dialog = dialogOf(newtab);
  // The folder name opens that folder
  const otherTitle = (await getChildren(newtab, '0')).find((node) => node.id === '2')!.title;
  await dialog.getByRole('button', {name: otherTitle}).click();
  await expect(dialog).toHaveCount(0);
  await expect(tile(newtab, 'Unique copy')).toBeVisible();
});
