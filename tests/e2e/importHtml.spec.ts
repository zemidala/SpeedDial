import {readFileSync} from 'node:fs';
import type {Page} from '@playwright/test';
import {expect, getChildren, openSettings, seed, test, tile} from './fixtures';

// What Chrome's "Export bookmarks" saves, shortened
const EXPORTED = [
  '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
  '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
  '<TITLE>Bookmarks</TITLE>',
  '<H1>Bookmarks</H1>',
  '<DL><p>',
  '    <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>',
  '    <DL><p>',
  '        <DT><A HREF="https://news.example/" ADD_DATE="1700000000">News &amp; weather</A>',
  '        <DT><A HREF="http://www.existing.example">Already here</A>',
  '        <DT><H3>Work</H3>',
  '        <DL><p>',
  '            <DT><A HREF="https://docs.example/">Docs</A>',
  '        </DL><p>',
  '    </DL><p>',
  '</DL><p>',
].join('\n');

test.beforeEach(async ({newtab}) => {
  await seed(newtab, [{title: 'Existing', url: 'https://existing.example/'}]);
  await expect(tile(newtab, 'Existing')).toBeVisible();
});

async function chooseFile(page: Page, name: string, content: string) {
  const dialog = await openSettings(page, 'Копии');
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', {name: 'Импортировать…'}).click();
  await (await chooser).setFiles({name, mimeType: 'text/html', buffer: Buffer.from(content)});
  return dialog;
}

test('imports a bookmarks file into a new folder, skipping existing bookmarks', async ({newtab}) => {
  const settings = await chooseFile(newtab, 'bookmarks.html', EXPORTED);
  const dialog = newtab.getByRole('dialog', {name: 'Импорт «bookmarks.html»'});
  await expect(dialog.getByRole('status')).toContainText('Будет добавлено 2 закладки в 2 папках');
  await expect(dialog.getByRole('status')).toContainText('Уже есть в закладках: 1');

  // Without the check the existing one is imported too
  await dialog.getByLabel('Пропускать закладки, которые уже есть').uncheck();
  await expect(dialog.getByRole('status')).toContainText('Будет добавлено 3 закладки');
  await dialog.getByLabel('Пропускать закладки, которые уже есть').check();

  await dialog.getByLabel('Название новой папки').fill('Из Chrome');
  await dialog.getByRole('button', {name: 'Импортировать', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(settings.getByRole('status')).toHaveText('Импортировано в «Из Chrome»: 2. Пропущено как уже существующие: 1');
  await settings.getByRole('button', {name: 'Готово'}).click();

  await expect(tile(newtab, 'Из Chrome')).toBeVisible();
  const [imported] = (await getChildren(newtab, '1')).filter((node) => node.title === 'Из Chrome');
  const [bar] = await getChildren(newtab, imported.id);
  expect(bar.title).toBe('Bookmarks bar');
  const inBar = await getChildren(newtab, bar.id);
  expect(inBar.map((node) => [node.title, node.url ?? null])).toEqual([
    ['News & weather', 'https://news.example/'],
    ['Work', null],
  ]);
  expect((await getChildren(newtab, inBar[1].id)).map((node) => node.url)).toEqual(['https://docs.example/']);
});

test('a file that isn\'t a bookmarks file is refused', async ({newtab}) => {
  const settings = await chooseFile(newtab, 'page.html', '<html><body>Hello</body></html>');
  await expect(settings.getByRole('alert')).toHaveText('«page.html» — не файл закладок');
  await expect(newtab.getByRole('dialog', {name: /^Импорт/})).toHaveCount(0);
});

test('exports all bookmarks to a file browsers can import', async ({newtab}) => {
  const dialog = await openSettings(newtab, 'Копии');
  const download = newtab.waitForEvent('download');
  await dialog.getByRole('button', {name: 'Экспортировать'}).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^bookmarks-\d{4}-\d{2}-\d{2}\.html$/);

  const html = readFileSync((await file.path())!, 'utf8');
  expect(html).toMatch(/^<!DOCTYPE NETSCAPE-Bookmark-file-1>/);
  expect(html).toContain('PERSONAL_TOOLBAR_FOLDER="true"');
  expect(html).toContain('<A HREF="https://existing.example/"');
  await expect(dialog.getByRole('status')).toHaveText('Закладки сохранены в файл');
});

test('the browser\'s own import opens from the settings, with how-tos for other browsers', async ({newtab}) => {
  const dialog = await openSettings(newtab, 'Копии');
  const tabCount = () => newtab.evaluate(async () => (await chrome.tabs.query({})).length);
  const before = await tabCount();
  await dialog.getByRole('button', {name: 'Открыть импорт браузера'}).click();
  // A new tab with the browser's settings page (Edge doesn't show its settings pages to the tests, so only the count)
  await expect.poll(tabCount).toBe(before + 1);

  await dialog.getByText('Как сохранить файл закладок в другом браузере').click();
  await expect(dialog.getByText(/Firefox:.*Экспорт закладок в HTML-файл/)).toBeVisible();
});

test('selected tiles and folders are exported with everything inside', async ({newtab}) => {
  await seed(newtab, [
    {title: 'Chosen', url: 'https://chosen.example/'},
    {title: 'Skipped', url: 'https://skipped.example/'},
    {title: 'Work', children: [{title: 'Docs', url: 'https://docs.example/'}, {title: 'Inner', children: [
      {title: 'Deep', url: 'https://deep.example/'},
    ]}]},
  ]);
  await expect(tile(newtab, 'Work')).toBeVisible();
  await tile(newtab, 'Chosen').hover();
  await newtab.getByRole('checkbox', {name: 'Выбрать «Chosen»'}).check();
  await tile(newtab, 'Work').hover();
  await newtab.getByRole('checkbox', {name: 'Выбрать «Work»'}).check();

  const download = newtab.waitForEvent('download');
  await newtab.getByRole('toolbar', {name: 'Выделенные закладки'}).getByRole('button', {name: 'Экспорт'}).click();
  const file = await download;
  await expect(newtab.getByRole('status').filter({hasText: 'Сохранено в файл закладок: 3'})).toBeVisible();

  const html = readFileSync((await file.path())!, 'utf8');
  for (const text of ['https://chosen.example/', '>Work</H3>', '>Inner</H3>', 'https://deep.example/']) expect(html).toContain(text);
  expect(html).not.toContain('skipped.example');
  // Not marked as the bookmarks bar: importing it doesn't mix into the browser's own bar
  expect(html).not.toContain('PERSONAL_TOOLBAR_FOLDER');
});

test('a folder is exported from its menu', async ({newtab}) => {
  await seed(newtab, [{title: 'Work', children: [{title: 'Docs', url: 'https://docs.example/'}]}]);
  await expect(tile(newtab, 'Work')).toBeVisible();
  const download = newtab.waitForEvent('download');
  await tile(newtab, 'Work').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Экспортировать папку в файл'}).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^Work \d{4}-\d{2}-\d{2}\.html$/);
  expect(readFileSync((await file.path())!, 'utf8')).toContain('https://docs.example/');
});
