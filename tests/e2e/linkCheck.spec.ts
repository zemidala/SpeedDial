import type {BrowserContext, Page} from '@playwright/test';
import {expect, getChildren, seed, test, tile} from './fixtures';

// Reading other sites' answers needs access to sites
test.use({hostAccess: true});

/** Fake sites: a working one, a gone page, one without HEAD support, a failing server and one that doesn't exist */
async function fakeSites(context: BrowserContext, deadWorks = false) {
  await context.unrouteAll({behavior: 'ignoreErrors'});
  await context.route('https://ok.example/**', (route) => route.fulfill({status: 200, body: 'ok'}));
  await context.route('https://gone.example/**', (route) => route.fulfill({status: 404, body: 'not found'}));
  await context.route('https://nohead.example/**', (route) =>
    route.fulfill({status: route.request().method() === 'HEAD' ? 405 : 200, body: 'ok'}));
  await context.route('https://server.example/**', (route) => route.fulfill({status: 502, body: 'bad gateway'}));
  await context.route('https://dead.example/**', (route) =>
    (deadWorks ? route.fulfill({status: 200, body: 'back'}) : route.abort('namenotresolved')));
}

test.beforeEach(async ({context, newtab}) => {
  await fakeSites(context);
  await seed(newtab, [
    {title: 'Works', url: 'https://ok.example/'},
    {title: 'Gone', url: 'https://gone.example/page'},
    {title: 'No HEAD', url: 'https://nohead.example/'},
    {title: 'Server', url: 'https://server.example/'},
    {title: 'Папка', children: [{title: 'Dead', url: 'https://dead.example/'}]},
  ]);
  await expect(tile(newtab, 'Works')).toBeVisible();
});

const dialogOf = (page: Page) => page.getByRole('dialog', {name: 'Проверка ссылок'});

async function runCheck(page: Page) {
  await page.locator('main').click({button: 'right', position: {x: 5, y: 5}});
  await page.getByRole('menuitem', {name: 'Проверить ссылки…'}).click();
  const dialog = dialogOf(page);
  await expect(dialog).toContainText('Для каждой из 5 закладок');
  await dialog.getByRole('button', {name: 'Проверить'}).click();
  await expect(dialog.getByRole('status').first()).toHaveText(/^Проверено ссылок: 5\./, {timeout: 30_000});
  return dialog;
}

test('finds broken links and marks them: the tile shows the placeholder', async ({newtab}) => {
  const dialog = await runCheck(newtab);
  await expect(dialog.getByRole('status').first()).toHaveText('Проверено ссылок: 5. Не работают: 3');

  // A gone page and a dead site are selected; a server error may be temporary — not selected; working ones aren't listed
  await expect(dialog.getByRole('checkbox', {name: 'Выбрать «Gone»'})).toBeChecked();
  await expect(dialog.getByRole('checkbox', {name: 'Выбрать «Dead»'})).toBeChecked();
  await expect(dialog.getByRole('checkbox', {name: 'Выбрать «Server»'})).not.toBeChecked();
  await expect(dialog.getByRole('checkbox')).toHaveCount(3);
  await expect(dialog.getByText('Страница не найдена (404)')).toBeVisible();
  await expect(dialog.getByText('Ошибка сервера (502)')).toBeVisible();
  await expect(dialog.getByText('Сайт не отвечает')).toBeVisible();

  await dialog.getByRole('button', {name: 'Пометить (2)'}).click();
  await expect(dialog.getByRole('status').filter({hasText: 'Помечено как нерабочие: 2'})).toBeVisible();
  await dialog.getByRole('button', {name: 'Закрыть', exact: true}).click();

  const gone = tile(newtab, 'Gone');
  await expect(gone).toHaveClass(/tile--broken/);
  await expect(gone.locator('.tile__broken')).toBeVisible();
  await expect(gone).toHaveAttribute('title', 'Gone\nНе работает: Страница не найдена (404)');
  await expect(tile(newtab, 'Works')).not.toHaveClass(/tile--broken/);
  // Marks survive a reload
  await newtab.reload();
  await expect(tile(newtab, 'Gone')).toHaveClass(/tile--broken/);

  // The mark can be removed from the tile's menu
  await tile(newtab, 'Gone').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Снять отметку «не работает»'}).click();
  await expect(tile(newtab, 'Gone')).not.toHaveClass(/tile--broken/);

  // The other mark stays, also inside folders
  await tile(newtab, 'Папка').click();
  await expect(tile(newtab, 'Dead')).toHaveClass(/tile--broken/);
});

test('a mark goes away when the link works again or its address changes', async ({context, newtab}) => {
  let dialog = await runCheck(newtab);
  await dialog.getByRole('checkbox', {name: 'Выбрать «Server»'}).check();
  await dialog.getByRole('button', {name: 'Пометить (3)'}).click();
  await dialog.getByRole('button', {name: 'Закрыть', exact: true}).click();
  await expect(tile(newtab, 'Server')).toHaveClass(/tile--broken/);

  // The address was fixed — the mark goes
  const id = (await tile(newtab, 'Gone').getAttribute('data-bookmark-id'))!;
  await newtab.evaluate((id) => chrome.bookmarks.update(id, {url: 'https://ok.example/fixed'}), id);
  await expect(tile(newtab, 'Gone')).not.toHaveClass(/tile--broken/);

  // The site is back — the next check removes its mark
  await fakeSites(context, true);
  dialog = await runCheck(newtab);
  await expect(dialog.getByRole('status').first()).toHaveText('Проверено ссылок: 5. Не работают: 1');
  await dialog.getByRole('button', {name: 'Закрыть', exact: true}).click();
  await tile(newtab, 'Папка').click();
  await expect(tile(newtab, 'Dead')).not.toHaveClass(/tile--broken/);
});

test('checking doesn\'t download what a site asks to preload', async ({context, newtab}) => {
  const preloaded: string[] = [];
  await context.route('https://ok.example/**', (route) => {
    if (route.request().url().endsWith('.css')) {
      preloaded.push(route.request().url());
      return route.fulfill({contentType: 'text/css', body: 'body{}'});
    }
    return route.fulfill({status: 200, headers: {link: '<https://ok.example/app.css>; rel=preload; as=style'}, body: 'ok'});
  });
  const warnings: string[] = [];
  newtab.on('console', (message) => warnings.push(message.text()));

  await runCheck(newtab);
  await newtab.waitForTimeout(3500); // Chrome warns about an unused preload a few seconds after it
  expect(preloaded).toEqual([]);
  expect(warnings.filter((text) => text.includes('preload'))).toEqual([]);
});

test('broken links are deleted and brought back with undo', async ({newtab}) => {
  const dialog = await runCheck(newtab);
  await dialog.getByRole('button', {name: 'Удалить (2)'}).click();
  await expect(dialog.getByRole('checkbox')).toHaveCount(1);
  await expect.poll(async () => (await getChildren(newtab, '1')).map((node) => node.title))
    .toEqual(['Works', 'No HEAD', 'Server', 'Папка']);

  await dialog.getByRole('status').filter({hasText: 'Удалено: 2'}).getByRole('button', {name: 'Отменить'}).click();
  await expect.poll(async () => (await getChildren(newtab, '1')).map((node) => node.title))
    .toEqual(['Works', 'Gone', 'No HEAD', 'Server', 'Папка']);
});
