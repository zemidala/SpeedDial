// Reactive per-bookmark data for tiles and dialogs; see perBookmark.ts
import {SvelteMap} from 'svelte/reactivity';
import {descriptionStorage, iconOnlyStorage, type PerBookmarkStorage} from './perBookmark';

class PerBookmarkStore<T> {
  #values = new SvelteMap<string, T>();

  constructor(private readonly storage: PerBookmarkStorage<T>) {}

  start(): void {
    this.storage.load().then((values) => this.#replace(values)).catch((error) => console.error('Failed to load bookmark data', error));
    // Changes from another tab or the service worker
    this.storage.onChanged((values) => this.#replace(values));
  }

  get(id: string): T | undefined {
    return this.#values.get(id);
  }

  async set(id: string, value: T | null): Promise<void> {
    if (value === null) this.#values.delete(id);
    else this.#values.set(id, value);
    await this.storage.set(id, value);
  }

  #replace(values: Record<string, T>): void {
    for (const id of this.#values.keys()) if (!(id in values)) this.#values.delete(id);
    for (const [id, value] of Object.entries(values)) this.#values.set(id, value);
  }
}

export const iconOnly = new PerBookmarkStore(iconOnlyStorage);
export const descriptions = new PerBookmarkStore(descriptionStorage);
