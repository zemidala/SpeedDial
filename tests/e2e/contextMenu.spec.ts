import type {Page} from '@playwright/test';
import {expect, getChildren, seed, test, tile} from './fixtures';

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

test('меню плитки закладки, папки и пустого места', async ({newtab}) => {
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
    'Удалить…',
    'Обновить',
  ]);
  await newtab.keyboard.press('Escape');

  // У папки нет инкогнито, копирования ссылки и значка
  await tile(newtab, 'Папка').click({button: 'right'});
  await expect(menuItems(newtab)).toHaveText([
    'Открыть',
    'Открыть в новой вкладке',
    'Открыть в фоновой вкладке',
    'Открыть в новом окне',
    'Назад',
    'Вперед',
    'Новая закладка…',
    'Новая папка…',
    'Редактировать…',
    'Сортировать…',
    'Удалить…',
    'Обновить',
  ]);
  await newtab.keyboard.press('Escape');

  await openPageMenu(newtab);
  await expect(menuItems(newtab)).toHaveText(['Назад', 'Вперед', 'Новая закладка…', 'Новая папка…', 'Сортировать…', 'Обновить']);
});

test.describe(() => {
  // Нужен доступ к сайтам, чтобы chrome.tabs показывал адреса вкладок
  test.use({hostAccess: true});

  test('открытие в новой вкладке, в фоновой и в новом окне', async ({newtab}) => {
    // Вкладки, созданные через API расширения, Playwright не заворачивает на заглушку — смотрим на них через chrome.tabs
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
    // Сама вкладка SpeedDial осталась на месте
    await expect(tile(newtab, 'Альфа')).toBeVisible();
  });
});

test('папка открывается страницей SpeedDial в новой вкладке', async ({context, newtab}) => {
  const folderPage = context.waitForEvent('page');
  await tile(newtab, 'Папка').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Открыть в новой вкладке'}).click();
  await expect(tile(await folderPage, 'Гамма')).toBeVisible();

  await tile(newtab, 'Альфа').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Открыть', exact: true}).click();
  await expect(newtab).toHaveURL('https://alpha.example/');
});

test('копирование ссылки', async ({newtab}) => {
  // Прочитать буфер страница расширения не может без разрешения, поэтому записываем, что в него отправили.
  // Настоящая запись при этом выполняется — если она не удастся, вместо подтверждения будет ошибка
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

test('новая папка на пустом месте и новая закладка после плитки', async ({newtab}) => {
  await openPageMenu(newtab);
  await newtab.getByRole('menuitem', {name: 'Новая папка…'}).click();
  const folderDialog = newtab.getByRole('dialog', {name: 'Новая папка'});
  await expect(folderDialog.getByLabel('Адрес')).toHaveCount(0);
  await folderDialog.getByLabel('Название').fill('Проекты');
  await folderDialog.getByRole('button', {name: 'Создать'}).click();
  await expect.poll(() => titles(newtab)).toEqual(['Бета', 'Альфа', 'Папка', 'Проекты']);

  // Правый клик по «Бета» — новая закладка встаёт сразу после неё
  await tile(newtab, 'Бета').click({button: 'right'});
  await newtab.getByRole('menuitem', {name: 'Новая закладка…'}).click();
  const bookmarkDialog = newtab.getByRole('dialog', {name: 'Новая закладка'});
  await bookmarkDialog.getByLabel('Название').fill('Вставка');
  await bookmarkDialog.getByLabel('Адрес').fill('insert.example');
  await bookmarkDialog.getByRole('button', {name: 'Создать'}).click();
  await expect.poll(() => titles(newtab)).toEqual(['Бета', 'Вставка', 'Альфа', 'Папка', 'Проекты']);

  // Пустое название папки — «Новая папка»
  await openPageMenu(newtab);
  await newtab.getByRole('menuitem', {name: 'Новая папка…'}).click();
  await newtab.getByRole('dialog', {name: 'Новая папка'}).getByRole('button', {name: 'Создать'}).click();
  await expect(tile(newtab, 'Новая папка')).toBeVisible();
});

test('сортировка папки меняет порядок в браузере', async ({newtab}) => {
  await openPageMenu(newtab);
  await newtab.getByRole('menuitem', {name: 'Сортировать…'}).click();
  const dialog = newtab.getByRole('dialog', {name: /^Сортировать «/});
  await dialog.getByLabel('Порядок').selectOption('title');
  await dialog.getByLabel('Папки и закладки').selectOption('foldersFirst');
  await dialog.getByRole('button', {name: 'Сортировать'}).click();

  await expect.poll(() => titles(newtab)).toEqual(['Папка', 'Альфа', 'Бета']);
  expect((await getChildren(newtab, '1')).map((node) => node.title)).toEqual(['Папка', 'Альфа', 'Бета']);

  // В корне сортировать нечего: там системные папки
  await newtab.getByRole('navigation', {name: 'Путь к папке'}).getByRole('link', {name: 'Главная'}).click();
  await openPageMenu(newtab);
  await expect(newtab.getByRole('menuitem', {name: 'Сортировать…'})).toBeDisabled();
});

test('назад и вперёд по папкам, управление с клавиатуры', async ({newtab}) => {
  await openPageMenu(newtab);
  await expect(newtab.getByRole('menuitem', {name: 'Назад'})).toBeDisabled();
  await newtab.keyboard.press('Escape');

  await tile(newtab, 'Папка').click();
  await expect(tile(newtab, 'Гамма')).toBeVisible();

  // Фокус на первом доступном пункте; стрелки и Enter
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
