// Фон страницы: своё изображение (хранится локально в IndexedDB) или картинка дня Bing
import {type BingImage, loadBingImage} from './bing';
import {idbDelete, idbGet, idbSet} from './idb';
import {resizeImage} from './images';

const FILE_KEY = 'background';
const MAX_WIDTH = 3840;
const MAX_HEIGHT = 2160;

class BackgroundStore {
  /** object URL своего изображения или null, если оно не выбрано */
  imageUrl = $state<string | null>(null);
  /** Картинка дня Bing; загружается, только когда выбрана как фон */
  bing = $state.raw<BingImage | null>(null);

  #bingLoading: Promise<void> | null = null;

  async load(): Promise<void> {
    const blob = await idbGet<Blob>('files', FILE_KEY).catch(() => undefined);
    this.#show(blob ?? null);
  }

  async setImage(file: Blob): Promise<void> {
    const blob = await resizeImage(file, MAX_WIDTH, MAX_HEIGHT, 'image/jpeg', 0.9);
    await idbSet('files', FILE_KEY, blob);
    this.#show(blob);
  }

  async clear(): Promise<void> {
    await idbDelete('files', FILE_KEY);
    this.#show(null);
  }

  /** Загружает картинку дня Bing один раз за открытие страницы */
  loadBing(): Promise<void> {
    this.#bingLoading ??= loadBingImage()
      .then((image) => {
        this.bing = image;
      })
      .catch((error) => {
        this.#bingLoading = null; // Позволяем попробовать снова (например, после выдачи разрешения)
        throw error;
      });
    return this.#bingLoading;
  }

  #show(blob: Blob | null): void {
    if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
    this.imageUrl = blob ? URL.createObjectURL(blob) : null;
  }
}

export const background = new BackgroundStore();
