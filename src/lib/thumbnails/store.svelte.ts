import {idbKeys} from '../idb';
import {cropImage, resizeImage, THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH} from '../images';
import {type CaptureItem, type CaptureProgress, onMessage, requestCaptureStatus, sendMessage} from '../messages';
import {permissions} from '../permissions.svelte';
import {settings} from '../settings/store.svelte';
import {queued} from '../siteIcons';
import type {CropRect} from './crop';
import {fetchPageImage, forgetMisses, isRecentMiss, rememberMiss} from './pageImage';
import {clearThumbnails, deleteThumbnail, getThumbnail, saveThumbnail, type StoredThumbnail} from './storage';

/** Thumbnail of one bookmark; url — object URL of the image, or null if there's none */
export class ThumbnailEntry {
  url = $state<string | null>(null);
  /** The first look into storage is done: "no thumbnail" is now known, not just not loaded yet */
  loaded = $state(false);

  #generation = 0;

  constructor(readonly bookmarkId: string) {}

  async load(): Promise<void> {
    const generation = ++this.#generation;
    const stored = await getThumbnail(this.bookmarkId).catch(() => undefined);
    if (generation !== this.#generation) return;

    if (this.url) URL.revokeObjectURL(this.url);
    this.url = stored ? URL.createObjectURL(stored.blob) : null;
    this.loaded = true;
  }
}

class ThumbnailsStore {
  /** Thumbnail creation progress in the service worker; null — nothing is being created */
  progress = $state<CaptureProgress | null>(null);

  #entries = new Map<string, ThumbnailEntry>();
  /** Bookmarks whose page picture was already asked for in this tab */
  #pageImageAsked = new Set<string>();

  start(): void {
    onMessage((message) => {
      if (message.type === 'thumbnails-changed') {
        this.#reload(message.ids);
      } else if (message.type === 'capture-progress') {
        this.progress = message.done < message.total ? {done: message.done, total: message.total} : null;
      }
    });
    // Capturing may have started before this tab opened — then the button offers to stop it right away
    requestCaptureStatus()
      .then((status) => {
        if (status && !this.progress) this.progress = status;
      })
      .catch((error) => console.error('Failed to get capture status', error));
  }

  get(bookmarkId: string): ThumbnailEntry {
    let entry = this.#entries.get(bookmarkId);
    if (!entry) {
      entry = new ThumbnailEntry(bookmarkId);
      this.#entries.set(bookmarkId, entry);
      entry.load().catch((error) => console.error('Failed to load thumbnail', error));
    }
    return entry;
  }

  get pageImagesEnabled(): boolean {
    return settings.current.pageImages && permissions.siteAccess;
  }

  /**
   * For a bookmark without a thumbnail: the picture its page declares for link previews (see pageImage.ts).
   * Asked once per tab; a page without a picture isn't asked again for a while
   */
  async loadPageImage(bookmarkId: string, pageUrl: string): Promise<void> {
    if (!this.pageImagesEnabled || this.#pageImageAsked.has(bookmarkId) || isRecentMiss(pageUrl)) return;
    this.#pageImageAsked.add(bookmarkId);

    const {image, final} = await queued(() => fetchPageImage(pageUrl));
    if (!image) {
      if (final) rememberMiss(pageUrl);
      return;
    }
    // A screenshot or the user's image may have come meanwhile — it's better; turned off meanwhile — not wanted
    if (!this.pageImagesEnabled || await getThumbnail(bookmarkId).catch(() => undefined)) return;
    await saveThumbnail(bookmarkId, image, 'page');
    await this.#changed([bookmarkId]);
  }

  /** Turned off: the page pictures go, screenshots and the user's images stay */
  async clearPageImages(): Promise<void> {
    const removed: string[] = [];
    for (const id of await idbKeys('thumbnails')) {
      if ((await getThumbnail(id).catch(() => undefined))?.source !== 'page') continue;
      await deleteThumbnail(id);
      removed.push(id);
    }
    this.#pageImageAsked.clear();
    forgetMisses();
    if (removed.length > 0) await this.#changed(removed);
  }

  /** Page screenshots are taken by the service worker; site access is required */
  capture(items: CaptureItem[]): Promise<void> {
    if (items.length === 0) return Promise.resolve();
    this.progress = {done: 0, total: items.length};
    return sendMessage({type: 'capture-thumbnails', items});
  }

  /** Stops creating thumbnails; finished ones are kept */
  cancelCapture(): Promise<void> {
    this.progress = null;
    return sendMessage({type: 'cancel-capture'});
  }

  /** A custom image instead of a page screenshot; crop — the part of it chosen in the crop dialog (image pixels) */
  async setCustom(bookmarkId: string, image: Blob, crop?: CropRect): Promise<void> {
    const blob = crop
      ? await cropImage(image, crop, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)
      : await resizeImage(image, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
    await saveThumbnail(bookmarkId, blob, 'custom');
    await this.#changed([bookmarkId]);
  }

  async remove(bookmarkId: string): Promise<void> {
    await deleteThumbnail(bookmarkId);
    await this.#changed([bookmarkId]);
  }

  /** Brings back thumbnails of restored bookmarks: old id → new id */
  async restore(saved: Map<string, StoredThumbnail>, ids: Map<string, string>): Promise<void> {
    const restored: string[] = [];
    for (const [oldId, thumbnail] of saved) {
      const newId = ids.get(oldId);
      if (!newId) continue;
      await saveThumbnail(newId, thumbnail.blob, thumbnail.source);
      restored.push(newId);
    }
    if (restored.length > 0) await this.#changed(restored);
  }

  /** Reloads all thumbnails — e.g. after restoring a backup */
  reloadAll(): Promise<void> {
    return this.#changed([]);
  }

  async clearAll(): Promise<void> {
    await clearThumbnails();
    await this.#changed([]);
  }

  /** Updates thumbnails in this tab and notifies the others */
  async #changed(ids: string[]): Promise<void> {
    this.#reload(ids);
    await sendMessage({type: 'thumbnails-changed', ids});
  }

  #reload(ids: string[]): void {
    const entries = ids.length > 0 ? ids.map((id) => this.#entries.get(id)) : [...this.#entries.values()];
    for (const entry of entries) {
      entry?.load().catch((error) => console.error('Failed to load thumbnail', error));
    }
  }
}

export const thumbnails = new ThumbnailsStore();
