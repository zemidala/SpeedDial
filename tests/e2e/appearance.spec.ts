import {expect, openSettings, seed, test, tile} from './fixtures';

const LIGHT_SURFACE = 'rgb(255, 255, 255)';
const DARK_SURFACE = 'rgb(44, 48, 57)'; // #2c3039

test.beforeEach(async ({newtab}) => {
  // Exact colours are checked without softening the light theme
  await newtab.evaluate(() => chrome.storage.sync.set({settings: {lightDimming: 0}}));
  await newtab.reload();
  await seed(newtab, [
    {title: 'Example', url: 'https://example.com/'},
    {title: 'Папка', children: [{title: 'Внутри', url: 'https://inside.example/'}]},
  ]);
  await expect(tile(newtab, 'Example')).toBeVisible();
});

function surfaceColor(page: import('@playwright/test').Page) {
  return () => page.locator('.breadcrumbs').evaluate((el) => getComputedStyle(el).backgroundColor);
}

test('the default theme follows the system', async ({newtab}) => {
  await newtab.emulateMedia({colorScheme: 'dark'});
  await expect.poll(surfaceColor(newtab)).toBe(DARK_SURFACE);

  await newtab.emulateMedia({colorScheme: 'light'});
  await expect.poll(surfaceColor(newtab)).toBe(LIGHT_SURFACE);
});

test('switching the theme with the button and in the settings', async ({newtab}) => {
  await newtab.emulateMedia({colorScheme: 'light'});

  await newtab.getByRole('button', {name: 'Включить тёмную тему'}).click();
  await expect(newtab.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(surfaceColor(newtab)).toBe(DARK_SURFACE);

  await newtab.getByRole('button', {name: 'Включить светлую тему'}).click();
  await expect(newtab.locator('html')).toHaveAttribute('data-theme', 'light');

  // "System default" removes the explicit choice
  const dialog = await openSettings(newtab);
  await dialog.getByLabel('Светлая или тёмная').selectOption('auto');
  await expect(newtab.locator('html')).not.toHaveAttribute('data-theme');
});

test('theme and custom CSS apply before the first paint, without a flash', async ({context, newtab}) => {
  await newtab.getByRole('button', {name: 'Включить тёмную тему'}).click();
  const dialog = await openSettings(newtab, 'Расширенные');
  await dialog.getByLabel('Пользовательский CSS').fill('.tile__title { letter-spacing: 3px; }');
  await expect(tile(newtab, 'Example').locator('.tile__title')).toHaveCSS('letter-spacing', '3px');

  // Record the state at the moment the parser reaches body — before the app starts
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
  // Custom CSS overrides the page styles
  await expect(tile(newtab, 'Example').locator('.tile__title')).toHaveCSS('letter-spacing', '3px');
});

test('custom tile colour with readable text in the dark theme', async ({newtab}) => {
  await newtab.emulateMedia({colorScheme: 'dark'});
  const dialog = await openSettings(newtab);

  const reset = dialog.getByRole('button', {name: 'Сбросить'}).first();
  await expect(reset).toBeDisabled();
  await dialog.getByLabel('Цвет плитки').fill('#ffffff');

  // Tinting is off to check the pure colour
  await dialog.getByLabel('Подкрашивать плитку цветом иконки').uncheck();
  const card = tile(newtab, 'Example').locator('.tile__card');
  await expect(card).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(card).toHaveCSS('color', 'rgb(31, 35, 40)');

  await reset.click();
  await expect(card).toHaveCSS('background-color', 'rgb(44, 48, 57)');
});

test('name position: inside and outside, top and bottom', async ({newtab}) => {
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

  // By default the names are above the tiles
  expect(await place()).toBe('top-outside');
  const dialog = await openSettings(newtab);
  for (const position of ['top-inside', 'bottom-outside', 'bottom-inside', 'top-outside']) {
    await dialog.getByLabel('Положение названий').selectOption(position);
    await expect.poll(place).toBe(position);
  }
});

test('panel width, centring, names and service tiles', async ({newtab}) => {
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

  // Settings stay available from the context menu
  await newtab.locator('main').click({button: 'right', position: {x: 5, y: 5}});
  await newtab.getByRole('menuitem', {name: 'Настройки'}).click();
  await expect(newtab.getByRole('dialog', {name: 'Настройки'})).toBeVisible();
});

test('contrast: system default, high, normal', async ({newtab}) => {
  const html = newtab.locator('html');
  const cardBorder = tile(newtab, 'Example').locator('.tile__card');

  // "System default" follows prefers-contrast
  await expect(html).not.toHaveAttribute('data-contrast');
  await newtab.emulateMedia({contrast: 'more'});
  await expect(html).toHaveAttribute('data-contrast', 'high');
  await expect(cardBorder).toHaveCSS('border-top-width', '2px');

  // "Normal" — even with system high contrast
  const dialog = await openSettings(newtab);
  await dialog.getByLabel('Контрастность').selectOption('normal');
  await expect(html).not.toHaveAttribute('data-contrast');
  await expect(cardBorder).toHaveCSS('border-top-width', '1px');

  await newtab.emulateMedia({contrast: 'no-preference'});
  await dialog.getByLabel('Контрастность').selectOption('high');
  await expect(html).toHaveAttribute('data-contrast', 'high');
  // A folder gets an accent-coloured border, names are bold
  await expect(tile(newtab, 'Папка').locator('.tile__card')).toHaveCSS('border-top-color', 'rgb(0, 102, 204)');
  await expect(tile(newtab, 'Example').locator('.tile__title')).toHaveCSS('font-weight', '600');

  // Applied before the first paint
  await dialog.getByRole('button', {name: 'Готово'}).click();
  await newtab.reload();
  await expect(html).toHaveAttribute('data-contrast', 'high');
});

test('fonts: text size, font sample, custom font, tile names', async ({newtab}) => {
  const html = newtab.locator('html');
  const title = tile(newtab, 'Example').locator('.tile__title');
  const dialog = await openSettings(newtab);

  await expect(html).toHaveCSS('font-size', '16px');
  await dialog.getByLabel('Размер шрифта').selectOption({label: 'Крупный'});
  await expect(html).toHaveCSS('font-size', '18px');
  await expect(title).toHaveCSS('font-size', '14.625px'); // 0.8125rem at 18px

  // The sample text is set in the chosen font
  await dialog.getByLabel('Шрифт', {exact: true}).selectOption('Georgia');
  await expect(dialog.getByText('Съешь же ещё этих мягких французских булок, да выпей чаю'))
    .toHaveCSS('font-family', /Georgia/);

  // "Other…" — any name typed in
  await dialog.getByLabel('Шрифт', {exact: true}).selectOption({label: 'Другой…'});
  await dialog.getByLabel('Название шрифта').fill('Comic Sans MS');
  await expect(newtab.locator('body')).toHaveCSS('font-family', /^"?Comic Sans MS/);

  await dialog.getByLabel('Размер названий плиток').selectOption({label: 'Мелкий'});
  await dialog.getByLabel('Жирные названия плиток').check();
  await expect(title).toHaveCSS('font-size', '13.5px'); // 0.75rem at 18px
  await expect(title).toHaveCSS('font-weight', '600');

  // Text size is applied before the first paint — no jump
  await dialog.getByRole('button', {name: 'Готово'}).click();
  await newtab.reload();
  expect(await newtab.evaluate(() => document.documentElement.style.fontSize)).toBe('112.5%');
});

test('page background: colour', async ({newtab}) => {
  const dialog = await openSettings(newtab);
  await dialog.getByLabel('Фон', {exact: true}).selectOption('color');
  await dialog.getByLabel('Цвет фона').fill('#336699');
  await expect(newtab.locator('body')).toHaveCSS('background-color', 'rgb(51, 102, 153)');
});

test('a folder tile without previews shows the folder icon', async ({newtab}) => {
  const folder = tile(newtab, 'Папка');
  await expect(folder.locator('.folder-preview')).toBeVisible();

  const dialog = await openSettings(newtab, 'Общие');
  await dialog.getByLabel('Миниатюры сайтов на папке').uncheck();
  await expect(folder.locator('.folder-preview')).toHaveCount(0);
  await expect(folder.locator('.folder-tile__icon')).toBeVisible();
});
