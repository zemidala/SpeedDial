// Recent web searches from the search box: shown under it, kept on this device only (chrome.storage.local).
// Off in the settings — nothing is remembered and what was kept is removed
import {addHistoryEntry} from './search';
import {settings} from './settings/store.svelte';

const KEY = 'searchHistory';

class SearchHistoryStore {
  entries = $state.raw<string[]>([]);

  async start(): Promise<void> {
    const saved = (await chrome.storage.local.get(KEY))[KEY];
    if (Array.isArray(saved)) this.entries = saved.filter((entry): entry is string => typeof entry === 'string');
    // Changes from other SpeedDial tabs
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && KEY in changes) {
        const next = changes[KEY].newValue;
        this.entries = Array.isArray(next) ? next : [];
      }
    });
  }

  add(query: string): void {
    if (!settings.current.searchHistory) return;
    this.#save(addHistoryEntry(this.entries, query));
  }

  remove(query: string): void {
    this.#save(this.entries.filter((entry) => entry !== query));
  }

  clear(): void {
    this.#save([]);
  }

  #save(entries: string[]): void {
    this.entries = entries;
    const saving = entries.length > 0 ? chrome.storage.local.set({[KEY]: entries}) : chrome.storage.local.remove(KEY);
    saving.catch((error) => console.error('Failed to save recent searches', error));
  }
}

export const searchHistory = new SearchHistoryStore();
