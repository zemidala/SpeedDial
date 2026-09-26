// Storing bookmark thumbnails in IndexedDB. No Svelte — also used in the service worker.
import {idbClear, idbDelete, idbGet, idbSet} from '../idb';

export type ThumbnailSource = 'capture' | 'custom';

export interface StoredThumbnail {
  blob: Blob;
  source: ThumbnailSource;
  updatedAt: number;
}

export function getThumbnail(bookmarkId: string): Promise<StoredThumbnail | undefined> {
  return idbGet<StoredThumbnail>('thumbnails', bookmarkId);
}

export function saveThumbnail(bookmarkId: string, blob: Blob, source: ThumbnailSource): Promise<void> {
  return idbSet('thumbnails', bookmarkId, {blob, source, updatedAt: Date.now()} satisfies StoredThumbnail);
}

export function deleteThumbnail(bookmarkId: string): Promise<void> {
  return idbDelete('thumbnails', bookmarkId);
}

export function clearThumbnails(): Promise<void> {
  return idbClear('thumbnails');
}
