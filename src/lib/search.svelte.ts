import type {BookmarkNode} from './bookmarks.svelte';
import {FOLDER_PREVIEW_SIZE} from './constants';
import {buildSearchUrl, orderResults} from './search';
import {searchHistory} from './searchHistory.svelte';
import {settings} from './settings/store.svelte';

const SEARCH_DELAY = 150;

/** Searching bookmarks from the search box; Enter — web search */
class SearchStore {
  query = $state('');
  results = $state.raw<BookmarkNode[]>([]);
  /** First items of the folders among the results — for their tile previews */
  previews = $state.raw<Record<string, BookmarkNode[]>>({});

  #timer: ReturnType<typeof setTimeout> | undefined;
  #searchId = 0;

  constructor() {
    // A folder opened from the results (or any other navigation) ends the search
    if (typeof window !== 'undefined') window.addEventListener('hashchange', () => this.clear());
  }

  get active(): boolean {
    return this.query.trim() !== '';
  }

  setQuery(query: string): void {
    this.query = query;
    clearTimeout(this.#timer);
    const trimmed = query.trim();
    if (!trimmed) {
      this.results = [];
      this.previews = {};
      return;
    }
    const searchId = ++this.#searchId;
    this.#timer = setTimeout(async () => {
      const found = orderResults(await chrome.bookmarks.search(trimmed).catch(() => []));
      const folders = found.filter((node) => !node.url);
      const children = await Promise.all(folders.map((folder) =>
        chrome.bookmarks.getChildren(folder.id).then((items) => items.slice(0, FOLDER_PREVIEW_SIZE), () => [])));
      if (searchId !== this.#searchId) return;
      this.results = found;
      this.previews = Object.fromEntries(folders.map((folder, i) => [folder.id, children[i]]));
    }, SEARCH_DELAY);
  }

  clear(): void {
    this.setQuery('');
  }

  /** Opens web search results — for the typed query or a chosen suggestion */
  searchWeb(text = this.query): void {
    const query = text.trim();
    if (!query) return;
    searchHistory.add(query);
    const {searchEngine, customSearchUrl, openInNewTab} = settings.current;
    const url = buildSearchUrl(searchEngine, query, customSearchUrl);
    if (openInNewTab) {
      chrome.tabs.create({url});
    } else {
      location.href = url;
    }
  }
}

export const search = new SearchStore();
