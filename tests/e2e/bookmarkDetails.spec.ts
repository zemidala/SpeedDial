import type {Page} from '@playwright/test';
import {expect, makePng, seed, test, tile} from './fixtures';

// The page's name and description are read from the site — that needs access to sites
test.use({hostAccess: true});

// "Привет, мир" and a description in windows-1251, like many older Russian sites
const WIN1251_PAGE = Buffer.concat([
  Buffer.from('<html><head><meta charset="windows-1251"><title>'),
  Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2, 0x2c, 0x20, 0xec, 0xe8, 0xf0]),
  Buffer.from('</title><meta name="description" content="Old site"></head></html>'),
]);

test.beforeEach(async ({context, newtab}) => {
  await context.route('https://named.example/**', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<html><head><title>Named &amp; Co — home</title>'
      + '<meta name="description" content="Everything about naming things"></head><body></body></html>',
  }));
  await context.route('https://nameless.example/**', (route) => route.fulfill({contentType: 'text/html', body: '<p>hi</p>'}));
  await context.route('https://old.example/**', (route) => route.fulfill({contentType: 'text/html', body: WIN1251_PAGE}));
  await context.route('https://shot.example/**', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<body style="margin:0;background:#00a0e0"></body>',
  }));
  await seed(newtab, [{title: 'Shot', url: 'https://shot.example/'}]);
  await expect(tile(newtab, 'Shot')).toBeVisible();
});

async function newBookmark(page: Page) {
  await page.getByRole('button', {name: 'Добавить закладку'}).click();
  return page.getByRole('dialog', {name: 'Новая закладка'});
}

test('a new bookmark gets its name and description from the site', async ({newtab}) => {
  const dialog = await newBookmark(newtab);
  await dialog.getByLabel('Адрес').fill('named.example');
  await dialog.getByLabel('Адрес').blur();
  await expect(dialog.getByLabel('Название')).toHaveValue('Named & Co — home');
  await expect(dialog.getByLabel('Описание')).toHaveValue('Everything about naming things');
  await dialog.getByRole('button', {name: 'Создать'}).click();

  // The description is in the tile's tooltip
  await expect(tile(newtab, 'Named & Co — home')).toHaveAttribute('title', 'Named & Co — home\nEverything about naming things');
});

test('a name typed by hand isn\'t replaced; the button takes it from the site anyway', async ({newtab}) => {
  const dialog = await newBookmark(newtab);
  await dialog.getByLabel('Название').fill('My name');
  await dialog.getByLabel('Адрес').fill('old.example');
  await dialog.getByLabel('Адрес').blur();
  // The empty description is filled, the typed name stays
  await expect(dialog.getByLabel('Описание')).toHaveValue('Old site');
  await expect(dialog.getByLabel('Название')).toHaveValue('My name');

  await dialog.getByRole('button', {name: 'С сайта'}).click();
  // Read in the page's own charset
  await expect(dialog.getByLabel('Название')).toHaveValue('Привет, мир');
});

test('a site without a name gets its address as the name', async ({newtab}) => {
  const dialog = await newBookmark(newtab);
  await dialog.getByLabel('Адрес').fill('https://nameless.example/page');
  await dialog.getByRole('button', {name: 'С сайта'}).click();
  await expect(dialog.getByLabel('Название')).toHaveValue('nameless.example');
  await expect(dialog.getByRole('status')).toHaveText('Сайт не сообщил название — подставлен адрес сайта');
});

test('editing keeps and changes the description', async ({newtab}) => {
  await tile(newtab, 'Shot').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Редактировать…'}).click();
  let dialog = newtab.getByRole('dialog', {name: 'Изменить закладку'});
  await dialog.getByLabel('Описание').fill('Blue page');
  await dialog.getByRole('button', {name: 'Сохранить'}).click();
  await expect(tile(newtab, 'Shot')).toHaveAttribute('title', 'Shot\nBlue page');

  await newtab.reload();
  await tile(newtab, 'Shot').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Редактировать…'}).click();
  dialog = newtab.getByRole('dialog', {name: 'Изменить закладку'});
  await expect(dialog.getByLabel('Описание')).toHaveValue('Blue page');
  await dialog.getByLabel('Описание').fill('');
  await dialog.getByRole('button', {name: 'Сохранить'}).click();
  await expect(tile(newtab, 'Shot')).toHaveAttribute('title', 'Shot');
});

test('the tile can show the site icon instead of its thumbnail, and back', async ({newtab}) => {
  await tile(newtab, 'Shot').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Значок…'}).click();
  const dialog = newtab.getByRole('dialog', {name: 'Значок «Shot»'});
  const chooser = newtab.waitForEvent('filechooser');
  await dialog.getByRole('button', {name: 'Выбрать картинку…'}).click();
  await (await chooser).setFiles({name: 'a.png', mimeType: 'image/png', buffer: await makePng(newtab, 300, '#ff8800')});
  const thumbnail = tile(newtab, 'Shot').locator('.tile__thumbnail');
  await expect(thumbnail).toBeVisible();

  const choice = dialog.getByRole('radiogroup', {name: 'Что показывать на плитке'});
  await expect(choice.getByRole('radio', {name: 'Миниатюра'})).toBeChecked();
  await choice.getByText('Иконка сайта').click();
  await expect(thumbnail).toHaveCount(0);
  await expect(tile(newtab, 'Shot').locator('.site-icon')).toBeVisible();

  // The choice stays after a reload; the thumbnail is kept
  await dialog.getByRole('button', {name: 'Готово'}).click();
  await newtab.reload();
  await expect(tile(newtab, 'Shot').locator('.tile__thumbnail')).toHaveCount(0);
  await tile(newtab, 'Shot').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Значок…'}).click();
  await expect(choice.getByRole('radio', {name: 'Иконка сайта'})).toBeChecked();
  await choice.getByText('Миниатюра').click();
  await expect(tile(newtab, 'Shot').locator('.tile__thumbnail')).toBeVisible();
});
