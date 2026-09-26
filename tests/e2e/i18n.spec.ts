import {readFileSync} from 'node:fs';
import {expect, EXTENSION_PATH, openSettings, seed, test, tile} from './fixtures';

test.beforeEach(async ({newtab}) => {
  await seed(newtab, [{title: 'Example', url: 'https://example.com/'}]);
  await expect(tile(newtab, 'Example')).toBeVisible();
});

test.describe('английский браузер', () => {
  test.use({browserLocale: 'en-US'});

  test('интерфейс на английском', async ({newtab}) => {
    await expect(newtab).toHaveTitle('New Tab');
    await expect(newtab.locator('html')).toHaveAttribute('lang', 'en');
    await expect(newtab.getByRole('searchbox', {name: 'Search'})).toHaveAttribute('placeholder', 'Search bookmarks, Enter to search Google');

    await tile(newtab, 'Example').click({button: 'right'});
    await expect(newtab.getByRole('menuitem', {name: 'Open in new tab'})).toBeVisible();
    await newtab.keyboard.press('Escape');

    await newtab.getByRole('button', {name: 'Settings'}).click();
    const dialog = newtab.getByRole('dialog', {name: 'Settings'});
    await expect(dialog.getByRole('tab')).toHaveText(['Appearance', 'General', 'Backups', 'Advanced']);
    await expect(dialog.getByLabel('Language')).toHaveValue('auto');
  });

  test('русский можно выбрать в настройках — интерфейс меняется сразу', async ({newtab}) => {
    await newtab.getByRole('button', {name: 'Settings'}).click();
    const settings = newtab.getByRole('dialog', {name: 'Settings'});
    await settings.getByLabel('Language').selectOption('ru');

    const russian = newtab.getByRole('dialog', {name: 'Настройки'});
    await expect(russian.getByRole('tab')).toHaveText(['Вид', 'Общие', 'Копии', 'Расширенные']);
    await expect(newtab.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(newtab).toHaveTitle('Новая вкладка');

    // Выбор сохраняется
    await russian.getByRole('button', {name: 'Готово'}).click();
    await newtab.reload();
    await expect(newtab.getByRole('button', {name: 'Настройки'})).toBeVisible();
  });
});

test.describe('браузер на языке без перевода', () => {
  test.use({browserLocale: 'de-DE'});

  test('английский по умолчанию', async ({newtab}) => {
    await expect(newtab.getByRole('button', {name: 'Settings'})).toBeVisible();
    await expect(newtab.locator('html')).toHaveAttribute('lang', 'en');
  });
});

test('русский браузер — русский интерфейс; English в настройках', async ({newtab}) => {
  await expect(newtab).toHaveTitle('Новая вкладка');

  const dialog = await openSettings(newtab);
  await dialog.getByLabel('Язык').selectOption('en');
  await expect(newtab.getByRole('dialog', {name: 'Settings'}).getByRole('tab', {name: 'Appearance'})).toBeVisible();
  await expect(tile(newtab, 'Example')).toBeVisible();
});

test('описание в манифесте — из _locales, английский по умолчанию', () => {
  const read = (file: string) => JSON.parse(readFileSync(`${EXTENSION_PATH}/${file}`, 'utf8'));
  const manifest = read('manifest.json');
  expect(manifest.default_locale).toBe('en');
  expect(manifest.description).toBe('__MSG_extDescription__');
  expect(manifest.action.default_title).toBe('__MSG_actionTitle__');
  for (const locale of ['en', 'ru']) {
    const messages = read(`_locales/${locale}/messages.json`);
    expect(Object.keys(messages).sort()).toEqual(['actionTitle', 'extDescription']);
  }
  expect(read('_locales/en/messages.json').actionTitle.message).toBe('Open SpeedDial');
});
