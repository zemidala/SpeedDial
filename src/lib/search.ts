import {t} from './i18n/index.svelte';
import type {SearchEngine} from './settings/schema';

/** Search engine name in the interface language */
export function searchEngineName(engine: SearchEngine): string {
  switch (engine) {
    case 'google':
      return 'Google';
    case 'yandex':
      return t.general.searchEngineYandex;
    case 'bing':
      return 'Bing';
    case 'duckduckgo':
      return 'DuckDuckGo';
    case 'custom':
      return t.general.searchEngineCustom;
  }
}

// %s is replaced with the encoded query
const SEARCH_URLS: Record<Exclude<SearchEngine, 'custom'>, string> = {
  google: 'https://www.google.com/search?q=%s',
  yandex: 'https://yandex.ru/search/?text=%s',
  bing: 'https://www.bing.com/search?q=%s',
  duckduckgo: 'https://duckduckgo.com/?q=%s',
};

/** Results page URL; a custom template without %s or with a wrong scheme falls back to Google */
export function buildSearchUrl(engine: SearchEngine, query: string, customUrl = ''): string {
  const valid = /^https?:\/\/.+%s/i.test(customUrl);
  const template = engine === 'custom' ? (valid ? customUrl : SEARCH_URLS.google) : SEARCH_URLS[engine];
  return template.replace('%s', encodeURIComponent(query.trim()));
}
