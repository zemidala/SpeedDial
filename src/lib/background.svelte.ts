// Page background: a custom image (stored locally in IndexedDB) or the Bing image of the day
import {type BingImage, loadBingImage} from './bing';
import {idbDelete, idbGet, idbSet} from './idb';
import {resizeImage} from './images';

const FILE_KEY = 'background';
const MAX_WIDTH = 3840;
const MAX_HEIGHT = 2160;

class BackgroundStore {
  /** Object URL of the custom image, or null if none is chosen */
  imageUrl = $state<string | null>(null);
  /** Bing image of the day; loaded only when it's the chosen background */
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

  /** Loads the Bing image of the day once per page load */
  loadBing(): Promise<void> {
    this.#bingLoading ??= loadBingImage()
      .then((image) => {
        this.bing = image;
      })
      .catch((error) => {
        this.#bingLoading = null; // Allow another try (e.g. after the permission is granted)
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
