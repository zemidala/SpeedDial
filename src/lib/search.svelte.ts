import type {BookmarkNode} from './bookmarks.svelte';
import {buildSearchUrl} from './search';
import {settings} from './settings/store.svelte';

const SEARCH_DELAY = 150;
const MAX_RESULTS = 60;

/** Searching bookmarks from the search box; Enter — web search */
class SearchStore {
  query = $state('');
  results = $state.raw<BookmarkNode[]>([]);

  #timer: ReturnType<typeof setTimeout> | undefined;
  #searchId = 0;

  get active(): boolean {
    return this.query.trim() !== '';
  }

  setQuery(query: string): void {
    this.query = query;
    clearTimeout(this.#timer);
    const trimmed = query.trim();
    if (!trimmed) {
      this.results = [];
      return;
    }
    const searchId = ++this.#searchId;
    this.#timer = setTimeout(async () => {
      const found = await chrome.bookmarks.search(trimmed).catch(() => []);
      if (searchId !== this.#searchId) return;
      this.results = found.filter((node) => node.url).slice(0, MAX_RESULTS);
    }, SEARCH_DELAY);
  }

  clear(): void {
    this.setQuery('');
  }

  /** Opens web search results */
  searchWeb(): void {
    if (!this.active) return;
    const {searchEngine, customSearchUrl, openInNewTab} = settings.current;
    const url = buildSearchUrl(searchEngine, this.query, customSearchUrl);
    if (openInNewTab) {
      chrome.tabs.create({url});
    } else {
      location.href = url;
    }
  }
}

export const search = new SearchStore();
