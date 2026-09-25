import {analyzePixels, meanDifference} from './color';
import {VECTOR_SIZE} from './iconCandidates';
import {idbClear, idbDelete, idbGet, idbSet} from './idb';
import {permissions} from './permissions.svelte';
import {settings} from './settings/store.svelte';
import {fetchSiteIcon, queued} from './siteIcons';
import {getFaviconUrl, getHostname, isWebUrl} from './url';

export type IconSource = 'browser' | 'site' | 'external';

export interface IconInfo {
  src: string;
  /** Сторона исходной картинки в пикселях; для SVG — VECTOR_SIZE */
  size: number;
  source: IconSource;
  /** Основной цвет иконки; null, если определить нельзя (например, внешний логотип без CORS) */
  color: string | null;
  /** Цвет краёв иконки — для заливки области вокруг неё без шва */
  edgeColor: string | null;
  /** У иконки свой непрозрачный фон — её можно растянуть на всю подложку */
  fullBleed: boolean;
}

interface CachedSiteIcon {
  blob: Blob | null; // null — на сайте не нашлось ничего лучше обычного favicon
  size: number;
  fetchedAt: number;
}

const BROWSER_ICON_SIZE = 64;
const SAMPLE_SIZE = 32; // Иконку уменьшаем до 32×32 для анализа цвета
const DAY = 24 * 60 * 60 * 1000;
const SITE_ICON_TTL = 30 * DAY;
const MISSING_ICON_TTL = 7 * DAY;
const DEFAULT_ICON_THRESHOLD = 4; // Средняя разница пикселей, при которой иконка = стандартный глобус
const SOURCE_CHANGE_DELAY = 800;

async function loadImage(src: string, crossOrigin = false): Promise<HTMLImageElement> {
  const img = new Image();
  if (crossOrigin) img.crossOrigin = 'anonymous';
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
let defaultBrowserIcon: Promise<Uint8ClampedArray | null> | null = null;

function getDefaultBrowserIcon(): Promise<Uint8ClampedArray | null> {
  defaultBrowserIcon ??= loadImage(getFaviconUrl('https://speeddial-default.invalid/', BROWSER_ICON_SIZE))
    .then(samplePixels)
    .catch(() => null);
  return defaultBrowserIcon;
}

/** null — картинка не загрузилась или это стандартный глобус браузера */
async function analyze(src: string, source: IconSource, knownSize?: number): Promise<IconInfo | null> {
  try {
    const img = await loadImage(src);
    const pixels = samplePixels(img);
    if (source === 'browser') {
      const defaultPixels = await getDefaultBrowserIcon();
      if (defaultPixels && meanDifference(pixels, defaultPixels) < DEFAULT_ICON_THRESHOLD) return null;
    }
    const size = knownSize ?? Math.min(img.naturalWidth, img.naturalHeight);
    return {src, size, source, ...analyzePixels(pixels, SAMPLE_SIZE, SAMPLE_SIZE)};
  } catch {
    return null;
  }
}

/** Внешний логотип: цвет определяем, только если сервис разрешает CORS, иначе просто показываем */
async function analyzeExternal(src: string): Promise<IconInfo | null> {
  try {
    const img = await loadImage(src, true);
    const size = Math.min(img.naturalWidth, img.naturalHeight);
    return {src, size, source: 'external', ...analyzePixels(samplePixels(img), SAMPLE_SIZE, SAMPLE_SIZE)};
  } catch {
    try {
      const img = await loadImage(src);
      const size = Math.min(img.naturalWidth, img.naturalHeight);
      return {src, size, source: 'external', color: null, edgeColor: null, fullBleed: true};
    } catch {
      return null;
    }
  }
}

/** Адрес внешнего логотипа по шаблону; null, если шаблон некорректный */
export function buildExternalLogoUrl(template: string, pageUrl: string): string | null {
  const host = getHostname(pageUrl);
  if (!host || !template.includes('{{website}}')) return null;
  const url = template.replaceAll('{{website}}', encodeURIComponent(host));
  return isWebUrl(url) ? url : null;
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
    const isWeb = isWebUrl(this.pageUrl);
    const {externalLogos, externalLogoUrl} = settings.current;

    // 1. Внешний сервис логотипов
    if (isWeb && externalLogos) {
      const logoUrl = buildExternalLogoUrl(externalLogoUrl, this.pageUrl);
      const info = logoUrl ? await analyzeExternal(logoUrl) : null;
      if (!isCurrent()) return;
      if (info) {
        this.#show(info);
        return;
      }
    }

    // 2. Иконка с сайта из кэша
    const useSiteIcons = isWeb && icons.siteIconsEnabled;
    let cached: CachedSiteIcon | undefined;
    if (useSiteIcons) {
      cached = await idbGet<CachedSiteIcon>('icons', this.key).catch(() => undefined);
      if (cached?.blob) await this.#showSiteIcon(cached.blob, cached.size, isCurrent);
    }

    // 3. Иконка из кэша браузера
    if (!this.info) {
      const info = await analyze(getFaviconUrl(this.pageUrl, BROWSER_ICON_SIZE), 'browser');
      if (!isCurrent()) return;
      this.#show(info);
    }

    // 4. Свежая иконка с сайта, если кэш устарел
    if (!useSiteIcons) return;
    const ttl = cached?.blob ? SITE_ICON_TTL : MISSING_ICON_TTL;
    if (cached && Date.now() - cached.fetchedAt < ttl) return;

    const icon = await queued(() => fetchSiteIcon(this.pageUrl));
    if (!isCurrent()) return;
    const entry: CachedSiteIcon = {blob: icon?.blob ?? null, size: icon?.size ?? 0, fetchedAt: Date.now()};
    await idbSet('icons', this.key, entry).catch((error) => console.error('Failed to cache icon', error));
    if (icon) await this.#showSiteIcon(icon.blob, icon.size, isCurrent);
  }

  reload(): void {
    this.#generation++;
    this.info = null;
    this.loaded = false;
    this.#revoke();
    this.load().catch((error) => console.error('Failed to load icon', error));
  }

  #show(info: IconInfo | null): void {
    this.info = info;
    this.loaded = true;
  }

  async #showSiteIcon(blob: Blob, size: number, isCurrent: () => boolean): Promise<void> {
    const url = URL.createObjectURL(blob);
    const info = await analyze(url, 'site', blob.type.includes('svg') ? VECTOR_SIZE : size || undefined);
    // Иконка с сайта нужна, только если она крупнее той, что есть у браузера
    const worse = !info || (this.info?.source === 'browser' && info.size <= this.info.size);
    if (!isCurrent() || worse) {
      URL.revokeObjectURL(url);
      return;
    }
    this.#revoke();
    this.#objectUrl = url;
    this.#show(info);
  }

  #revoke(): void {
    if (this.#objectUrl) URL.revokeObjectURL(this.#objectUrl);
    this.#objectUrl = null;
  }
}

class IconsStore {
  /** Загрузка иконок ждёт настроек: от них зависят источники иконок */
  ready: Promise<void>;

  #entries = new Map<string, IconEntry>();
  #resolveReady!: () => void;

  constructor() {
    this.ready = new Promise((resolve) => {
      this.#resolveReady = resolve;
    });
  }

  /** Иконки с сайтов включены в настройках и доступ к сайтам выдан */
  get siteIconsEnabled(): boolean {
    return settings.current.siteIcons && permissions.siteAccess;
  }

  async start(settingsLoaded: Promise<unknown>): Promise<void> {
    // Источники иконок зависят и от настроек, и от разрешений: без них первая загрузка ушла бы впустую
    await Promise.all([settingsLoaded.catch(() => undefined), permissions.ready]);
    this.#resolveReady();

    // Источники иконок поменялись — загружаем заново. С задержкой: адрес логотипов вводят по букве
    let previous = this.#sourceKey();
    let timer: ReturnType<typeof setTimeout> | undefined;
    $effect.root(() => {
      $effect(() => {
        const key = this.#sourceKey();
        clearTimeout(timer);
        if (key === previous) return;
        timer = setTimeout(() => {
          previous = key;
          this.reloadAll();
        }, SOURCE_CHANGE_DELAY);
      });
    });
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
    await idbDelete('icons', entry.key);
    entry.reload();
  }

  reloadAll(): void {
    for (const entry of this.#entries.values()) entry.reload();
  }

  /** Удаляет все загруженные с сайтов иконки */
  async clearSiteIcons(): Promise<void> {
    await idbClear('icons');
    this.reloadAll();
  }

  #sourceKey(): string {
    const {externalLogos, externalLogoUrl} = settings.current;
    return JSON.stringify([this.siteIconsEnabled, externalLogos, externalLogos && externalLogoUrl]);
  }
}

export const icons = new IconsStore();
