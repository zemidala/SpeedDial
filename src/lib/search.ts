import {t} from './i18n/index.svelte';
import type {SearchEngine} from './settings/schema';

/** Название поисковой системы на языке интерфейса */
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

// %s заменяется закодированным запросом
const SEARCH_URLS: Record<Exclude<SearchEngine, 'custom'>, string> = {
  google: 'https://www.google.com/search?q=%s',
  yandex: 'https://yandex.ru/search/?text=%s',
  bing: 'https://www.bing.com/search?q=%s',
  duckduckgo: 'https://duckduckgo.com/?q=%s',
};

/** Адрес страницы результатов; свой шаблон без %s или с неверной схемой заменяется на Google */
export function buildSearchUrl(engine: SearchEngine, query: string, customUrl = ''): string {
  const valid = /^https?:\/\/.+%s/i.test(customUrl);
  const template = engine === 'custom' ? (valid ? customUrl : SEARCH_URLS.google) : SEARCH_URLS[engine];
  return template.replace('%s', encodeURIComponent(query.trim()));
}
