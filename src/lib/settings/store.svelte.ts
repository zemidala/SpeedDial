import {DEFAULT_SETTINGS, sanitizeSettings, type Settings} from './schema';
import {loadStoredSettings, onSettingsChanged, saveSettings} from './storage';

// localStorage: written synchronously, so it survives closing the tab right after a change,
// and read synchronously (theme-init.js too) — no flash on load
const CACHE_KEY = 'settings-cache';
const SAVE_DELAY = 500; // Ms; sync limits the write rate, and sliders fire an event on every move

interface CachedSettings {
  settings: Settings;
  updatedAt: number;
}

function readCache(): CachedSettings {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    return {
      settings: sanitizeSettings(cached?.settings),
      updatedAt: typeof cached?.updatedAt === 'number' ? cached.updatedAt : 0,
    };
  } catch {
    return {settings: {...DEFAULT_SETTINGS}, updatedAt: 0};
  }
}

const cache = readCache();

class SettingsStore {
  current = $state<Settings>(cache.settings);

  #updatedAt = cache.updatedAt; // Time of the last change of the current settings
  #saveTimer: ReturnType<typeof setTimeout> | undefined;
  #pendingWrites = 0; // Storage writes that haven't finished yet
  #reloadId = 0; // Number of the latest read, to drop stale ones

  /** There are changes not yet in storage: reading from it now would return old data */
  get #hasUnsavedChanges(): boolean {
    return this.#saveTimer !== undefined || this.#pendingWrites > 0;
  }

  /** Loads settings from chrome.storage and watches for changes made elsewhere */
  start(): Promise<void> {
    onSettingsChanged(() => {
      this.#reload('change').catch((error) => console.error('Failed to reload settings', error));
    });
    // Try to save right away; if the tab closes first, the changes stay in the cache
    window.addEventListener('pagehide', () => this.flush());
    return this.#reload('startup');
  }

  /** Saves pending changes immediately */
  flush(): void {
    if (this.#saveTimer === undefined) return;
    clearTimeout(this.#saveTimer);
    this.#save();
  }

  update(patch: Partial<Settings>): void {
    Object.assign(this.current, patch);
    this.#changed();
  }

  /** Replaces all settings (import, reset); invalid values are replaced with defaults */
  replace(value: unknown): void {
    this.current = sanitizeSettings(value);
    this.#changed();
  }

  /** A non-reactive snapshot of the current settings — for export and passing to APIs */
  snapshot(): Settings {
    return $state.snapshot(this.current) as Settings;
  }

  /**
   * startup — when the page opens: if the cache has newer changes, the previous tab closed
   * before saving them — finish saving. change — storage changed from outside: apply only
   * newer data (empty storage after "Delete synced data" doesn't affect this tab)
   */
  async #reload(reason: 'startup' | 'change'): Promise<void> {
    // An event from our own write (it goes to two storages in turn) or there are newer changes here
    if (this.#hasUnsavedChanges) return;

    const reloadId = ++this.#reloadId;
    const updatedAt = this.#updatedAt;
    const stored = await loadStoredSettings();
    // Apply only the latest read and only if nothing changed here while reading
    if (reloadId !== this.#reloadId || updatedAt !== this.#updatedAt || this.#hasUnsavedChanges) return;

    if (stored.updatedAt < this.#updatedAt) {
      if (reason === 'startup') this.#save();
      return;
    }
    this.current = stored.settings;
    this.#updatedAt = stored.updatedAt;
    this.#writeCache();
  }

  #changed(): void {
    this.#updatedAt = Date.now();
    this.#writeCache();
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => this.#save(), SAVE_DELAY);
  }

  #save(): void {
    this.#saveTimer = undefined;
    this.#pendingWrites++;
    saveSettings(this.snapshot(), this.#updatedAt)
      .catch((error) => console.error('Failed to save settings', error))
      .finally(() => this.#pendingWrites--);
  }

  #writeCache(): void {
    try {
      const cached: CachedSettings = {settings: this.snapshot(), updatedAt: this.#updatedAt};
      localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    } catch (error) {
      console.error('Failed to cache settings', error);
    }
  }
}

export const settings = new SettingsStore();
