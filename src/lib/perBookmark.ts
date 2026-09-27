// Extra data of bookmarks the browser has no field for (a description, "show the icon"), by bookmark id.
// In chrome.storage.local: every tab and the service worker see the same data. No Svelte
export interface PerBookmarkStorage<T> {
  load(): Promise<Record<string, T>>;
  /** null removes the bookmark's value */
  set(id: string, value: T | null): Promise<void>;
  /** For removed bookmarks; ids without a value cost nothing — no write */
  forget(ids: string[]): Promise<void>;
  onChanged(callback: (values: Record<string, T>) => void): void;
}

export function perBookmarkStorage<T>(key: string): PerBookmarkStorage<T> {
  const load = async (): Promise<Record<string, T>> => {
    const stored = (await chrome.storage.local.get(key))[key];
    return stored && typeof stored === 'object' ? stored as Record<string, T> : {};
  };

  return {
    load,
    async set(id, value) {
      const values = await load();
      if (value === null) {
        if (!(id in values)) return;
        delete values[id];
      } else {
        values[id] = value;
      }
      await chrome.storage.local.set({[key]: values});
    },
    async forget(ids) {
      const values = await load();
      const present = ids.filter((id) => id in values);
      if (present.length === 0) return;
      present.forEach((id) => delete values[id]);
      await chrome.storage.local.set({[key]: values});
    },
    onChanged(callback) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && key in changes) callback((changes[key].newValue as Record<string, T> | undefined) ?? {});
      });
    },
  };
}

/** Bookmarks whose tile shows the site icon although they have a thumbnail (kept, so switching back is instant) */
export const iconOnlyStorage = perBookmarkStorage<true>('iconOnly');

/** The bookmark's description: typed in or taken from the site — shown in the tile's tooltip */
export const descriptionStorage = perBookmarkStorage<string>('descriptions');
