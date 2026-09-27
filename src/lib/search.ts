import type {BookmarkNode} from './bookmarks.svelte';
import {t} from './i18n/index.svelte';
import type {SearchEngine} from './settings/schema';

/** Search engine name in the interface language */
export function searchEngineName(engine: SearchEngine): string {
  switch (engine) {
    case 'google':
      return 'Google';
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
  bing: 'https://www.bing.com/search?q=%s',
  duckduckgo: 'https://duckduckgo.com/?q=%s',
};

/** Results page URL; a custom template without %s or with a wrong scheme falls back to Google */
export function buildSearchUrl(engine: SearchEngine, query: string, customUrl = ''): string {
  const valid = /^https?:\/\/.+%s/i.test(customUrl);
  const template = engine === 'custom' ? (valid ? customUrl : SEARCH_URLS.google) : SEARCH_URLS[engine];
  return template.replace('%s', encodeURIComponent(query.trim()));
}

const MAX_RESULTS = 60;
const MAX_HISTORY = 20;

/** Search results: folders with a matching name first — to open a folder by its name — then bookmarks */
export function orderResults(found: BookmarkNode[], max = MAX_RESULTS): BookmarkNode[] {
  const folders = found.filter((node) => !node.url);
  const sites = found.filter((node) => node.url);
  return [...folders, ...sites].slice(0, max);
}

/** Recent searches with the query on top: a repeat moves up instead of appearing twice (case doesn't matter) */
export function addHistoryEntry(entries: readonly string[], query: string, max = MAX_HISTORY): string[] {
  const text = query.trim();
  if (!text) return [...entries];
  const key = text.toLowerCase();
  return [text, ...entries.filter((entry) => entry.toLowerCase() !== key)].slice(0, max);
}
