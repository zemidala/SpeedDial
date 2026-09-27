// Reactive per-bookmark data for tiles and dialogs; see perBookmark.ts
import {SvelteMap} from 'svelte/reactivity';
import {descriptionStorage, iconOnlyStorage, type PerBookmarkStorage} from './perBookmark';

export class PerBookmarkStore<T> {
  #values = new SvelteMap<string, T>();

  constructor(private readonly storage: PerBookmarkStorage<T>) {}

  start(): void {
    this.storage.load()
      .then((values) => Object.entries(values).forEach(([id, value]) => this.#values.set(id, value)))
      .catch((error) => console.error('Failed to load bookmark data', error));
    // Changes from another tab or the service worker
    this.storage.onChanged((changes) => this.#apply(changes));
  }

  get(id: string): T | undefined {
    return this.#values.get(id);
  }

  set(id: string, value: T | null): Promise<void> {
    return this.setMany({[id]: value});
  }

  /** Shown at once, written after */
  async setMany(values: Record<string, T | null>): Promise<void> {
    this.#apply(values);
    await this.storage.set(values);
  }

  #apply(changes: Record<string, T | null>): void {
    for (const [id, value] of Object.entries(changes)) {
      if (value === null) this.#values.delete(id);
      else this.#values.set(id, value);
    }
  }
}

export const iconOnly = new PerBookmarkStore(iconOnlyStorage);
export const descriptions = new PerBookmarkStore(descriptionStorage);
