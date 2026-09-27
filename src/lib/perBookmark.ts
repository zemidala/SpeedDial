// Extra data of bookmarks the browser has no field for (a description, "show the icon", a "doesn't work" mark),
// by bookmark id. In chrome.storage.local: every tab and the service worker see the same data. No Svelte.
//
// Each bookmark's value is a key of its own ("descriptions:42"). One shared object would be read, changed and
// written back by a tab and the service worker at the same time — and one of them would bring back what
// the other had just removed
export interface PerBookmarkStorage<T> {
  load(): Promise<Record<string, T>>;
  /** Several bookmarks at once; null removes a bookmark's value */
  set(values: Record<string, T | null>): Promise<void>;
  /** For removed bookmarks; ids without a value cost nothing */
  forget(ids: string[]): Promise<void>;
  /** What changed — in this or another tab, or in the service worker; null — removed */
  onChanged(callback: (changes: Record<string, T | null>) => void): void;
}

export function perBookmarkStorage<T>(name: string): PerBookmarkStorage<T> {
  const prefix = `${name}:`;
  const keyOf = (id: string) => `${prefix}${id}`;

  /** Earlier versions kept everything in one object under the bare name — split it into keys once */
  async function migrate(): Promise<void> {
    const legacy = (await chrome.storage.local.get(name))[name];
    if (!legacy || typeof legacy !== 'object') return;
    const values = Object.fromEntries(Object.entries(legacy as Record<string, T>).map(([id, value]) => [keyOf(id), value]));
    await chrome.storage.local.set(values);
    await chrome.storage.local.remove(name);
  }

  return {
    async load() {
      await migrate();
      const all = await chrome.storage.local.get(null);
      return Object.fromEntries(Object.entries(all)
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => [key.slice(prefix.length), value as T]));
    },
    async set(values) {
      const entries = Object.entries(values);
      const kept = entries.filter(([, value]) => value !== null).map(([id, value]) => [keyOf(id), value]);
      const removed = entries.filter(([, value]) => value === null).map(([id]) => keyOf(id));
      if (kept.length > 0) await chrome.storage.local.set(Object.fromEntries(kept));
      if (removed.length > 0) await chrome.storage.local.remove(removed);
    },
    async forget(ids) {
      if (ids.length > 0) await chrome.storage.local.remove(ids.map(keyOf));
    },
    onChanged(callback) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        const ours = Object.entries(changes).filter(([key]) => key.startsWith(prefix));
        if (ours.length === 0) return;
        callback(Object.fromEntries(ours.map(([key, change]) => [key.slice(prefix.length), (change.newValue as T | undefined) ?? null])));
      });
    },
  };
}

/** Bookmarks whose tile shows the site icon although they have a thumbnail (kept, so switching back is instant) */
export const iconOnlyStorage = perBookmarkStorage<true>('iconOnly');

/** The bookmark's description: typed in or taken from the site — shown in the tile's tooltip */
export const descriptionStorage = perBookmarkStorage<string>('descriptions');
