import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import type {Page} from '@playwright/test';
import {expect, seed, test, tile} from '../e2e/fixtures';

// Screenshots for the store listing, 1280×800, in English and Russian. Real sites give real icons, so this needs
// the internet; access to sites is granted up front (hostAccess), as a user would allow it in the settings
const OUT = resolve(import.meta.dirname, '../../docs/store');
const SIZE = {width: 1280, height: 800};

const TEXT = {
  en: {
    work: 'Work', games: 'Games', news: 'News', music: 'Music', reading: 'Reading',
    settings: 'Settings', search: 'Search', view: 'Appearance', backups: 'Backups', import: 'Import…',
    importDialog: /^Import/,
  },
  ru: {
    work: 'Работа', games: 'Игры', news: 'Новости', music: 'Музыка', reading: 'Почитать',
    settings: 'Настройки', search: 'Поиск', view: 'Вид', backups: 'Копии', import: 'Импортировать…',
    importDialog: /^Импорт/,
  },
} as const;

type Language = keyof typeof TEXT;

async function fill(page: Page, text: (typeof TEXT)[Language]) {
  await seed(page, [
    {title: text.work, children: [
      {title: 'GitHub', url: 'https://github.com/'},
      {title: 'Stack Overflow', url: 'https://stackoverflow.com/'},
      {title: 'MDN', url: 'https://developer.mozilla.org/'},
      {title: 'npm', url: 'https://www.npmjs.com/'},
      {title: 'Figma', url: 'https://www.figma.com/'},
    ]},
    {title: text.games, children: [
      {title: 'Steam', url: 'https://store.steampowered.com/'},
      {title: 'GOG', url: 'https://www.gog.com/'},
      {title: 'Epic Games', url: 'https://store.epicgames.com/'},
      {title: 'Twitch', url: 'https://www.twitch.tv/'},
    ]},
    {title: text.news, children: [
      {title: 'BBC', url: 'https://www.bbc.com/'},
      {title: 'Reuters', url: 'https://www.reuters.com/'},
      {title: 'The Verge', url: 'https://www.theverge.com/'},
    ]},
    {title: 'YouTube', url: 'https://www.youtube.com/'},
    {title: 'Wikipedia', url: 'https://www.wikipedia.org/'},
    {title: 'Telegram', url: 'https://web.telegram.org/'},
    {title: 'Notion', url: 'https://www.notion.so/'},
    {title: 'Spotify', url: 'https://open.spotify.com/'},
    {title: 'Discord', url: 'https://discord.com/'},
    {title: 'Reddit', url: 'https://www.reddit.com/'},
    {title: 'Trello', url: 'https://trello.com/'},
    {title: 'Duolingo', url: 'https://www.duolingo.com/'},
  ]);
}

/** Settings as a new user would pick them, without the one-time invitations */
async function configure(page: Page, settings: Record<string, unknown>) {
  await page.evaluate(async (values) => {
    const {settings: current} = await chrome.storage.sync.get('settings');
    await chrome.storage.sync.set({settings: {...(current as object), shelfInviteDismissed: true, siteIcons: true, ...values}});
  }, settings);
  await page.reload();
}

/**
 * Site icons come from the sites: a letter shows first, the site's own icon replaces it when it arrives.
 * Wait until the number of icon images stops growing (up to a minute)
 */
async function settle(page: Page) {
  const images = () => page.locator('.site-icon__image').count();
  let last = -1;
  let steady = 0;
  for (let waited = 0; waited < 60_000 && steady < 3; waited += 2000) {
    await page.waitForTimeout(2000);
    const count = await images();
    steady = count === last ? steady + 1 : 0;
    last = count;
  }
}

for (const language of ['en', 'ru'] as const) {
  test.describe(language, () => {
    test.use({hostAccess: true, browserLocale: language === 'en' ? 'en-US' : 'ru-RU'});

    test(`store screenshots (${language})`, async ({newtab}) => {
      const text = TEXT[language];
      mkdirSync(OUT, {recursive: true});
      await newtab.setViewportSize(SIZE);
      await fill(newtab, text);
      await configure(newtab, {columns: 6, theme: 'light'});
      await expect(tile(newtab, 'YouTube')).toBeVisible();
      // The first visit looks the icons up on the sites; they're kept, so after a reload all come at once
      await settle(newtab);
      await newtab.reload();
      await settle(newtab);
      await newtab.screenshot({path: `${OUT}/screenshot-1-bookmarks-${language}.png`});

      // Dark. Not over Bing's image of the day: its photos belong to their authors, not for store listings
      await configure(newtab, {theme: 'dark'});
      await settle(newtab);
      await newtab.screenshot({path: `${OUT}/screenshot-2-dark-${language}.png`});

      // Search: bookmarks filter below, recent searches and suggestions under the box
      await configure(newtab, {theme: 'light', background: 'none', searchSuggestions: true});
      await newtab.evaluate(() => chrome.storage.local.set({searchHistory: ['weather', 'github actions']}));
      await newtab.reload();
      const search = newtab.getByRole('combobox', {name: text.search});
      await search.click();
      await search.fill('g');
      await settle(newtab);
      await newtab.screenshot({path: `${OUT}/screenshot-3-search-${language}.png`});
      await search.press('Escape');
      await search.press('Escape');

      // The settings, on their first tab
      await newtab.getByRole('button', {name: text.settings}).click();
      const dialog = newtab.getByRole('dialog', {name: text.settings});
      await expect(dialog.getByRole('tab', {name: text.view})).toHaveAttribute('aria-selected', 'true');
      await newtab.waitForTimeout(500);
      await newtab.screenshot({path: `${OUT}/screenshot-4-settings-${language}.png`});
      await newtab.keyboard.press('Escape');
    });
  });
}

test('promotional tile 440×280', async ({context}) => {
  const page = await context.newPage();
  await page.setViewportSize({width: 440, height: 280});
  const {readFileSync} = await import('node:fs');
  const logo = readFileSync(resolve(import.meta.dirname, '../../icon/icon.svg'), 'utf8');
  await page.setContent(`
    <style>
      body { margin: 0; width: 440px; height: 280px; display: flex; align-items: center; gap: 24px; padding: 0 36px;
        box-sizing: border-box; font-family: 'Segoe UI', system-ui, sans-serif; color: #fff;
        background: linear-gradient(135deg, #1f3b73 0%, #2a5bb8 100%); }
      svg { width: 120px; height: 120px; flex-shrink: 0; filter: drop-shadow(0 6px 16px rgb(0 0 0 / 0.35)); }
      h1 { margin: 0 0 8px; font-size: 40px; font-weight: 700; }
      p { margin: 0; font-size: 17px; line-height: 1.35; opacity: 0.92; }
    </style>
    ${logo}
    <div><h1>SpeedDial</h1><p>Your bookmarks on the new tab page — tiles, folders, themes</p></div>
  `);
  await page.screenshot({path: `${OUT}/promo-440x280.png`});
  await page.close();
});
