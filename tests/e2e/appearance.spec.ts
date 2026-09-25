import {expect, openSettings, seed, test, tile} from './fixtures';

const LIGHT_SURFACE = 'rgb(255, 255, 255)';
const DARK_SURFACE = 'rgb(35, 38, 45)'; // #23262d

test.beforeEach(async ({newtab}) => {
  await seed(newtab, [
    {title: 'Example', url: 'https://example.com/'},
    {title: 'Папка', children: [{title: 'Внутри', url: 'https://inside.example/'}]},
  ]);
  await expect(tile(newtab, 'Example')).toBeVisible();
});

function surfaceColor(page: import('@playwright/test').Page) {
  return () => page.locator('.breadcrumbs').evaluate((el) => getComputedStyle(el).backgroundColor);
}

test('тема по умолчанию следует за системой', async ({newtab}) => {
  await newtab.emulateMedia({colorScheme: 'dark'});
  await expect.poll(surfaceColor(newtab)).toBe(DARK_SURFACE);

  await newtab.emulateMedia({colorScheme: 'light'});
  await expect.poll(surfaceColor(newtab)).toBe(LIGHT_SURFACE);
});

test('переключение темы кнопкой и в настройках', async ({newtab}) => {
  await newtab.emulateMedia({colorScheme: 'light'});

  await newtab.getByRole('button', {name: 'Включить тёмную тему'}).click();
  await expect(newtab.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(surfaceColor(newtab)).toBe(DARK_SURFACE);

  await newtab.getByRole('button', {name: 'Включить светлую тему'}).click();
  await expect(newtab.locator('html')).toHaveAttribute('data-theme', 'light');

  // «Как в системе» убирает явный выбор
  const dialog = await openSettings(newtab);
  await dialog.getByLabel('Светлая или тёмная').selectOption('auto');
  await expect(newtab.locator('html')).not.toHaveAttribute('data-theme');
});

test('тема и свой CSS применяются до первой отрисовки, без вспышки', async ({context, newtab}) => {
  await newtab.getByRole('button', {name: 'Включить тёмную тему'}).click();
  const dialog = await openSettings(newtab, 'Расширенные');
  await dialog.getByLabel('Пользовательский CSS').fill('.tile__title { letter-spacing: 3px; }');
  await expect(tile(newtab, 'Example').locator('.tile__title')).toHaveCSS('letter-spacing', '3px');

  // Запоминаем состояние в момент, когда парсер только дошёл до body, — до запуска приложения
  await context.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (!document.body) return;
      Object.assign(window, {
        atBody: {
          theme: document.documentElement.dataset.theme ?? null,
          css: document.getElementById('custom-css')?.textContent ?? null,
        },
      });
      observer.disconnect();
    }).observe(document, {childList: true, subtree: true});
  });
  await newtab.reload();

  expect(await newtab.evaluate(() => (window as unknown as {atBody: unknown}).atBody)).toEqual({
    theme: 'dark',
    css: '.tile__title { letter-spacing: 3px; }',
  });
  // Свой CSS перекрывает стили страницы
  await expect(tile(newtab, 'Example').locator('.tile__title')).toHaveCSS('letter-spacing', '3px');
});

test('свой цвет плитки с читаемым текстом в тёмной теме', async ({newtab}) => {
  await newtab.emulateMedia({colorScheme: 'dark'});
  const dialog = await openSettings(newtab);

  const reset = dialog.getByRole('button', {name: 'Сбросить'}).first();
  await expect(reset).toBeDisabled();
  await dialog.getByLabel('Цвет плитки').fill('#ffffff');

  // Подкрашивание отключаем, чтобы проверить чистый цвет
  await dialog.getByLabel('Подкрашивать плитку цветом иконки').uncheck();
  const card = tile(newtab, 'Example').locator('.tile__card');
  await expect(card).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(card).toHaveCSS('color', 'rgb(31, 35, 40)');

  await reset.click();
  await expect(card).toHaveCSS('background-color', 'rgb(38, 42, 49)');
});

test('положение названий: внутри и снаружи, сверху и снизу', async ({newtab}) => {
  const example = tile(newtab, 'Example');
  const card = example.locator('.tile__card');
  const title = example.locator('.tile__title');
  const place = async () => {
    const cardBox = (await card.boundingBox())!;
    const titleBox = (await title.boundingBox())!;
    const inside = titleBox.y >= cardBox.y && titleBox.y + titleBox.height <= cardBox.y + cardBox.height + 1;
    const top = titleBox.y < cardBox.y + cardBox.height / 2;
    return `${top ? 'top' : 'bottom'}-${inside ? 'inside' : 'outside'}`;
  };

  expect(await place()).toBe('bottom-inside');
  const dialog = await openSettings(newtab);
  for (const position of ['top-inside', 'bottom-outside', 'top-outside', 'bottom-inside']) {
    await dialog.getByLabel('Положение названий').selectOption(position);
    await expect.poll(place).toBe(position);
  }
});

test('ширина панели, центрирование, названия и служебные плитки', async ({newtab}) => {
  await newtab.setViewportSize({width: 1000, height: 800});
  const app = newtab.locator('.app');
  const dialog = await openSettings(newtab);

  await dialog.getByLabel('Ширина панели').fill('50');
  await expect.poll(() => app.evaluate((el) => el.getBoundingClientRect().width)).toBeCloseTo(480, 0);

  await dialog.getByLabel('Вертикальное центрирование').check();
  await expect(app).toHaveClass(/app--centered/);

  await dialog.getByLabel('Показывать названия закладок').uncheck();
  await expect(newtab.locator('.tile__title')).toHaveCount(0);
  await dialog.getByLabel('Показывать названия закладок').check();

  await dialog.getByLabel('Показывать иконки сайтов рядом с названием').check();
  await expect(tile(newtab, 'Example').locator('.tile__title .site-icon--mini')).toBeVisible();

  await dialog.getByLabel('Показывать плитку добавления закладки').uncheck();
  await expect(newtab.getByRole('button', {name: 'Добавить закладку'})).toHaveCount(0);

  await dialog.getByLabel('Показывать кнопку настроек').uncheck();
  await dialog.getByRole('button', {name: 'Готово'}).click();
  await expect(newtab.getByRole('button', {name: 'Настройки'})).toHaveCount(0);

  // Настройки остаются доступны из контекстного меню
  await newtab.locator('main').click({button: 'right', position: {x: 5, y: 5}});
  await newtab.getByRole('menuitem', {name: 'Настройки'}).click();
  await expect(newtab.getByRole('dialog', {name: 'Настройки'})).toBeVisible();
});

test('фон страницы: цвет', async ({newtab}) => {
  const dialog = await openSettings(newtab);
  await dialog.getByLabel('Фон', {exact: true}).selectOption('color');
  await dialog.getByLabel('Цвет фона').fill('#336699');
  await expect(newtab.locator('body')).toHaveCSS('background-color', 'rgb(51, 102, 153)');
});

test('плитка папки без миниатюр показывает значок папки', async ({newtab}) => {
  const folder = tile(newtab, 'Папка');
  await expect(folder.locator('.folder-preview')).toBeVisible();

  const dialog = await openSettings(newtab, 'Общие');
  await dialog.getByLabel('Миниатюры сайтов на папке').uncheck();
  await expect(folder.locator('.folder-preview')).toHaveCount(0);
  await expect(folder.locator('.folder-tile__icon')).toBeVisible();
});
