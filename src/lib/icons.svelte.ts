import {analyzePixels, meanDifference} from './color';
import {VECTOR_SIZE} from './iconCandidates';
import {idbClear, idbDelete, idbGet, idbSet} from './idb';
import {settings} from './settings.svelte';
import {fetchSiteIcon, queued} from './siteIcons';
import {getFaviconUrl, isWebUrl} from './url';

export interface IconInfo {
  src: string;
  /** Размер исходной картинки в пикселях */
  size: number;
  /** Иконка загружена с сайта, а не взята из кэша браузера */
  fromSite: boolean;
  /** Основной цвет иконки */
  color: string | null;
  /** У иконки свой непрозрачный фон — её можно растянуть на всю подложку */
  fullBleed: boolean;
}

interface CachedSiteIcon {
  blob: Blob | null; // null — на сайте не нашлось ничего лучше обычного favicon
  fetchedAt: number;
}

const FAVICON_SIZE = 64;
const SAMPLE_SIZE = 32; // Иконку уменьшаем до 32×32 для анализа цвета
const DAY = 24 * 60 * 60 * 1000;
const SITE_ICON_TTL = 30 * DAY;
const MISSING_ICON_TTL = 7 * DAY;
const DEFAULT_ICON_THRESHOLD = 4; // Средняя разница пикселей, при которой иконка = стандартный глобус
const HOST_PERMISSION: chrome.permissions.Permissions = {origins: ['<all_urls>']};

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

function samplePixels(img: HTMLImageElement): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(SAMPLE_SIZE, SAMPLE_SIZE);
  const context = canvas.getContext('2d', {willReadFrequently: true})!;
  context.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  return context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
}

// Стандартный глобус, который браузер отдаёт для сайтов без иконки: запрашиваем его для
// заведомо несуществующего адреса и сравниваем с ним остальные иконки
let defaultFavicon: Promise<Uint8ClampedArray | null> | null = null;

function getDefaultFavicon(): Promise<Uint8ClampedArray | null> {
  defaultFavicon ??= loadImage(getFaviconUrl('https://speeddial-default.invalid/', FAVICON_SIZE))
    .then(samplePixels)
    .catch(() => null);
  return defaultFavicon;
}

/** null — картинка не загрузилась или это стандартный глобус браузера */
async function analyze(src: string, fromSite: boolean, vector = false): Promise<IconInfo | null> {
  try {
    const img = await loadImage(src);
    const pixels = samplePixels(img);
    if (!fromSite) {
      const defaultPixels = await getDefaultFavicon();
      if (defaultPixels && meanDifference(pixels, defaultPixels) < DEFAULT_ICON_THRESHOLD) return null;
    }
    const {color, fullBleed} = analyzePixels(pixels, SAMPLE_SIZE, SAMPLE_SIZE);
    const size = vector ? VECTOR_SIZE : Math.min(img.naturalWidth, img.naturalHeight);
    return {src, size, fromSite, color, fullBleed};
  } catch {
    return null;
  }
}

/** Иконка одного сайта; обновляется реактивно по мере загрузки */
export class IconEntry {
  /** null — иконки нет, показываем букву */
  info = $state.raw<IconInfo | null>(null);
  /** Первая попытка завершена: можно показывать букву вместо пустой подложки */
  loaded = $state(false);

  #generation = 0; // Отбрасывает результаты загрузки, начатой до reload()
  #objectUrl: string | null = null;

  constructor(readonly pageUrl: string, readonly key: string) {}

  async load(): Promise<void> {
    const generation = this.#generation;
    const isCurrent = () => generation === this.#generation;

    await icons.ready;
    const useSiteIcons = icons.siteIconsEnabled && isWebUrl(this.pageUrl);

    // 1. Иконка с сайта из кэша
    let cached: CachedSiteIcon | undefined;
    if (useSiteIcons) {
      cached = await idbGet<CachedSiteIcon>(this.key).catch(() => undefined);
      if (cached?.blob) await this.#showSiteIcon(cached.blob, isCurrent);
    }

    // 2. Иконка из кэша браузера
    if (!this.info) {
      const info = await analyze(getFaviconUrl(this.pageUrl, FAVICON_SIZE), false);
      if (!isCurrent()) return;
      this.info = info;
    }
    this.loaded = true;

    // 3. Свежая иконка с сайта, если кэш устарел
    if (!useSiteIcons) return;
    const ttl = cached?.blob ? SITE_ICON_TTL : MISSING_ICON_TTL;
    if (cached && Date.now() - cached.fetchedAt < ttl) return;

    const blob = await queued(() => fetchSiteIcon(this.pageUrl));
    if (!isCurrent()) return;
    await idbSet(this.key, {blob, fetchedAt: Date.now()} satisfies CachedSiteIcon)
      .catch((error) => console.error('Failed to cache icon', error));
    if (blob) await this.#showSiteIcon(blob, isCurrent);
  }

  reload(): void {
    this.#generation++;
    this.info = null;
    this.loaded = false;
    this.#revoke();
    this.load().catch((error) => console.error('Failed to load icon', error));
  }

  async #showSiteIcon(blob: Blob, isCurrent: () => boolean): Promise<void> {
    const url = URL.createObjectURL(blob);
    const info = await analyze(url, true, blob.type.includes('svg'));
    // Иконка с сайта нужна, только если она крупнее той, что есть у браузера
    const worse = !info || (this.info && !this.info.fromSite && info.size <= this.info.size);
    if (!isCurrent() || worse) {
      URL.revokeObjectURL(url);
      return;
    }
    this.#revoke();
    this.#objectUrl = url;
    this.info = info;
  }

  #revoke(): void {
    if (this.#objectUrl) URL.revokeObjectURL(this.#objectUrl);
    this.#objectUrl = null;
  }
}

class IconsStore {
  /** Загрузка иконок ждёт проверки разрешений, иначе первая отрисовка обойдётся без иконок с сайтов */
  ready: Promise<void>;

  #permitted = $state(false);
  #entries = new Map<string, IconEntry>();
  #resolveReady!: () => void;

  constructor() {
    this.ready = new Promise((resolve) => {
      this.#resolveReady = resolve;
    });
  }

  /** Иконки с сайтов включены в настройках и разрешение на доступ к сайтам выдано */
  get siteIconsEnabled(): boolean {
    return settings.current.hqIcons && this.#permitted;
  }

  /** settingsLoaded — загрузка настроек: от неё зависит, включены ли иконки с сайтов */
  async start(settingsLoaded: Promise<unknown>): Promise<void> {
    try {
      const [permitted] = await Promise.all([
        chrome.permissions.contains(HOST_PERMISSION),
        settingsLoaded.catch(() => undefined),
      ]);
      this.#permitted = permitted;
    } finally {
      this.#resolveReady();
    }

    // Разрешение могут отозвать или выдать на странице расширений
    const onPermissionsChange = async () => {
      this.#permitted = await chrome.permissions.contains(HOST_PERMISSION);
      this.reloadAll();
    };
    chrome.permissions.onAdded.addListener(onPermissionsChange);
    chrome.permissions.onRemoved.addListener(onPermissionsChange);
  }

  /** Иконки общие для всех страниц одного сайта */
  get(pageUrl: string): IconEntry {
    const key = isWebUrl(pageUrl) ? new URL(pageUrl).origin : pageUrl;
    let entry = this.#entries.get(key);
    if (!entry) {
      entry = new IconEntry(pageUrl, key);
      this.#entries.set(key, entry);
      entry.load().catch((error) => console.error('Failed to load icon', error));
    }
    return entry;
  }

  /** Забыть сохранённую иконку сайта и загрузить заново */
  async refresh(pageUrl: string): Promise<void> {
    const entry = this.get(pageUrl);
    await idbDelete(entry.key);
    entry.reload();
  }

  reloadAll(): void {
    for (const entry of this.#entries.values()) entry.reload();
  }

  /**
   * Включает или выключает загрузку иконок с сайтов. Вызывать прямо из обработчика клика:
   * браузер показывает запрос разрешения только в ответ на действие пользователя.
   */
  async setSiteIconsEnabled(enabled: boolean): Promise<boolean> {
    if (enabled) {
      const granted = await chrome.permissions.request(HOST_PERMISSION);
      if (!granted) return false;
      this.#permitted = true;
      settings.update({hqIcons: true});
    } else {
      settings.update({hqIcons: false});
      // Доступ к сайтам и загруженные иконки больше не нужны
      await chrome.permissions.remove(HOST_PERMISSION).catch(() => false);
      this.#permitted = false;
      await idbClear().catch((error) => console.error('Failed to clear icons', error));
    }
    this.reloadAll();
    return enabled;
  }
}

export const icons = new IconsStore();
