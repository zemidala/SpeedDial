import {resizeImage, THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH} from '../images';
import {type CaptureItem, onMessage, sendMessage} from '../messages';
import {clearThumbnails, deleteThumbnail, getThumbnail, saveThumbnail} from './storage';

/** Миниатюра одной закладки; url — object URL картинки или null, если миниатюры нет */
export class ThumbnailEntry {
  url = $state<string | null>(null);

  #generation = 0;

  constructor(readonly bookmarkId: string) {}

  async load(): Promise<void> {
    const generation = ++this.#generation;
    const stored = await getThumbnail(this.bookmarkId).catch(() => undefined);
    if (generation !== this.#generation) return;

    if (this.url) URL.revokeObjectURL(this.url);
    this.url = stored ? URL.createObjectURL(stored.blob) : null;
  }
}

class ThumbnailsStore {
  /** Ход создания миниатюр в service worker; null — ничего не создаётся */
  progress = $state<{done: number; total: number} | null>(null);

  #entries = new Map<string, ThumbnailEntry>();

  start(): void {
    onMessage((message) => {
      if (message.type === 'thumbnails-changed') {
        this.#reload(message.ids);
      } else if (message.type === 'capture-progress') {
        this.progress = message.done < message.total ? {done: message.done, total: message.total} : null;
      }
    });
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

  /** Снимки страниц делает service worker; нужен доступ к сайтам */
  capture(items: CaptureItem[]): Promise<void> {
    if (items.length === 0) return Promise.resolve();
    this.progress = {done: 0, total: items.length};
    return sendMessage({type: 'capture-thumbnails', items});
  }

  /** Останавливает создание миниатюр; готовые сохраняются */
  cancelCapture(): Promise<void> {
    this.progress = null;
    return sendMessage({type: 'cancel-capture'});
  }

  /** Своя картинка вместо снимка страницы */
  async setCustom(bookmarkId: string, image: Blob): Promise<void> {
    const blob = await resizeImage(image, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
    await saveThumbnail(bookmarkId, blob, 'custom');
    await this.#changed([bookmarkId]);
  }

  async remove(bookmarkId: string): Promise<void> {
    await deleteThumbnail(bookmarkId);
    await this.#changed([bookmarkId]);
  }

  async clearAll(): Promise<void> {
    await clearThumbnails();
    await this.#changed([]);
  }

  /** Обновляет миниатюры в этой вкладке и сообщает остальным */
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
