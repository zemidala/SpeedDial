import type {Page} from '@playwright/test';
import {expect, openSettings, seed, test, tile} from './fixtures';

test.beforeEach(async ({newtab}) => {
  // Exact theme colours are checked without light theme softening; the softening itself has its own test
  await newtab.evaluate(() => chrome.storage.sync.set({settings: {lightDimming: 0}}));
  await newtab.reload();
  await seed(newtab, [
    {title: 'Example', url: 'https://example.com/'},
    {title: 'Папка', children: [{title: 'Внутри', url: 'https://inside.example/'}]},
  ]);
  await expect(tile(newtab, 'Example')).toBeVisible();
});

const style = (page: Page, selector: string, property: string) =>
  () => page.locator(selector).first().evaluate((el, property) => getComputedStyle(el).getPropertyValue(property), property);

test('the theme colours panels, tiles and folders in both modes', async ({newtab}) => {
  await newtab.emulateMedia({colorScheme: 'light'});
  const dialog = await openSettings(newtab);
  const nord = dialog.getByRole('radio', {name: 'Nord'});
  await nord.click();
  await expect(nord).toHaveAttribute('aria-checked', 'true');
  await dialog.getByRole('button', {name: 'Готово'}).click();

  // Light variant of Nord
  await expect.poll(style(newtab, '.breadcrumbs', 'background-color')).toBe('rgb(248, 249, 251)');
  await expect.poll(style(newtab, '.tile--folder .tile__card', 'background-color')).toBe('rgb(221, 230, 240)');
  await expect.poll(style(newtab, '.breadcrumbs__item', 'color')).toBe('rgb(75, 107, 148)');

  // The dark variant — automatically, when the system mode changes
  await newtab.emulateMedia({colorScheme: 'dark'});
  await expect.poll(style(newtab, '.breadcrumbs', 'background-color')).toBe('rgb(59, 66, 82)');
  await expect.poll(style(newtab, '.tile--folder .tile__card', 'background-color')).toBe('rgb(57, 74, 94)');
  await expect.poll(style(newtab, 'body', 'color')).toBe('rgb(236, 239, 244)');
});

test('softening the light theme: gentler backgrounds, readable text, the dark theme unchanged', async ({newtab}) => {
  const luminance = style(newtab, '.breadcrumbs', 'background-color');
  const brightness = async () => (await luminance()).match(/\d+/g)!.slice(0, 3).map(Number).reduce((a, b) => a + b, 0);
  const textContrast = () => newtab.evaluate(() => {
    const parse = (color: string) => color.match(/\d+/g)!.slice(0, 3).map(Number);
    const lum = (rgb: number[]) => {
      const [r, g, b] = rgb.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const text = getComputedStyle(document.body).color;
    const panel = getComputedStyle(document.querySelector('.breadcrumbs')!).backgroundColor;
    const [a, b] = [lum(parse(text)), lum(parse(panel))].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  });

  await newtab.emulateMedia({colorScheme: 'light'});
  expect(await luminance()).toBe('rgb(255, 255, 255)');
  const dialog = await openSettings(newtab);
  await dialog.getByLabel('Приглушить светлую тему').fill('30');
  await expect.poll(brightness).toBeLessThan(3 * 230);
  expect(await textContrast()).toBeGreaterThanOrEqual(4.5);

  // The dark theme doesn't change
  await newtab.emulateMedia({colorScheme: 'dark'});
  await expect.poll(luminance).toBe('rgb(44, 48, 57)');
});

test('theme previews show the variant for the current mode', async ({newtab}) => {
  const dialog = await openSettings(newtab);
  const catppuccinBar = dialog.getByRole('radio', {name: 'Catppuccin'}).locator('.theme-card__bar');

  await newtab.emulateMedia({colorScheme: 'light'});
  await expect(catppuccinBar).toHaveCSS('background-color', 'rgb(239, 241, 245)'); // Latte
  await newtab.emulateMedia({colorScheme: 'dark'});
  await expect(catppuccinBar).toHaveCSS('background-color', 'rgb(49, 50, 68)'); // Mocha

  // An explicitly chosen mode is respected too
  await dialog.getByLabel('Светлая или тёмная').selectOption('light');
  await expect(catppuccinBar).toHaveCSS('background-color', 'rgb(239, 241, 245)');
});

test('custom colours: accent and background tint readable in both modes', async ({newtab}) => {
  await newtab.emulateMedia({colorScheme: 'light'});
  const dialog = await openSettings(newtab);
  await expect(dialog.getByLabel('Акцент')).toHaveCount(0);
  await dialog.getByRole('radio', {name: 'Свои цвета'}).click();

  // A bright yellow accent is unreadable on a light background — the palette darkens it for links and buttons
  await dialog.getByLabel('Акцент').fill('#ffd700');
  await dialog.getByLabel('Оттенок фона').fill('#2e8b57');
  await dialog.getByRole('button', {name: 'Готово'}).click();

  const contrast = () => newtab.evaluate(() => {
    const parse = (color: string) => color.match(/\d+/g)!.slice(0, 3).map(Number);
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const link = getComputedStyle(document.querySelector('.breadcrumbs__item')!).color;
    const panel = getComputedStyle(document.querySelector('.breadcrumbs')!).backgroundColor;
    const [a, b] = [luminance(parse(link)), luminance(parse(panel))].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  });
  expect(await contrast()).toBeGreaterThanOrEqual(4.5);
  await newtab.emulateMedia({colorScheme: 'dark'});
  await expect.poll(contrast).toBeGreaterThanOrEqual(4.5);
});

test('the theme applies before the first paint', async ({context, newtab}) => {
  const dialog = await openSettings(newtab);
  await dialog.getByRole('radio', {name: 'Gruvbox'}).click();
  await dialog.getByRole('button', {name: 'Готово'}).click();

  await context.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (!document.body) return;
      Object.assign(window, {paletteAtBody: document.getElementById('theme-palette')?.textContent ?? null});
      observer.disconnect();
    }).observe(document, {childList: true, subtree: true});
  });
  await newtab.reload();

  const palette = await newtab.evaluate(() => (window as unknown as {paletteAtBody: string | null}).paletteAtBody);
  expect(palette).toContain('--surface: light-dark(#f9f5d7, #32302f);');
});
