import {analyzePixels, effectiveResolution, meanDifference} from './color';
import {extractLargestIcoImage, isIco} from './ico';
import {VECTOR_SIZE} from './iconCandidates';
import {idbClear, idbDelete, idbGet, idbSet} from './idb';
import {buildLogoUrl, logoTemplate, UNKNOWN_SITE_URL} from './logoServices';
import {permissions} from './permissions.svelte';
import {settings} from './settings/store.svelte';
import {fetchSiteIcon, queued} from './siteIcons';
import {getFaviconUrl, isWebUrl} from './url';

/** browser — из кэша браузера; site — с самого сайта; external — со стороннего сервиса */
export type IconSource = 'browser' | 'site' | 'external';

export interface IconInfo {
  src: string;
  /** Настоящее разрешение картинки в пикселях (растянутые картинки — по исходному размеру); SVG — VECTOR_SIZE */
  size: number;
  source: IconSource;
  /** Основной цвет иконки; null, если прочитать пиксели нельзя */
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
const MAX_RESOLUTION_CHECK = 256; // Больше — растянутые картинки не встречаются, а проверка дороже
const DAY = 24 * 60 * 60 * 1000;
const SITE_ICON_TTL = 30 * DAY;
const MISSING_ICON_TTL = 7 * DAY;
const DEFAULT_ICON_THRESHOLD = 4; // Средняя разница пикселей, при которой иконка = заглушка «нет иконки»
const SOURCE_CHANGE_DELAY = 800;

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

function readPixels(img: HTMLImageElement, size: number): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext('2d', {willReadFrequently: true})!;
  context.imageSmoothingEnabled = false; // Иначе квадраты растянутой картинки размоются и не распознаются
  context.drawImage(img, 0, 0, size, size);
  return context.getImageData(0, 0, size, size).data;
}

const samplePixels = (img: HTMLImageElement) => readPixels(img, SAMPLE_SIZE);

/** Настоящее разрешение растровой картинки: растянутые favicon узнаются по одноцветным квадратам */
function measureResolution(img: HTMLImageElement): number {
  const natural = Math.min(img.naturalWidth, img.naturalHeight);
  const checked = Math.min(natural, MAX_RESOLUTION_CHECK);
  if (checked < SAMPLE_SIZE) return natural;
  return Math.round(effectiveResolution(readPixels(img, checked), checked) * natural / checked);
}

interface AnalyzeOptions {
  vector?: boolean;
  /** Заглушка источника для неизвестных сайтов — такую иконку не показываем */
  placeholder?: Uint8ClampedArray | null;
}

/** null — картинка не загрузилась или это заглушка «нет иконки» */
async function analyze(src: string, source: IconSource, {vector = false, placeholder}: AnalyzeOptions = {}): Promise<IconInfo | null> {
  try {
    const img = await loadImage(src);
    const pixels = samplePixels(img);
    if (placeholder && meanDifference(pixels, placeholder) < DEFAULT_ICON_THRESHOLD) return null;
    const size = vector ? VECTOR_SIZE : measureResolution(img);
    return {src, size, source, ...analyzePixels(pixels, SAMPLE_SIZE, SAMPLE_SIZE)};
  } catch {
    return null;
  }
}

// ===== Заглушки «нет иконки»: запрашиваем иконку заведомо несуществующего сайта и сравниваем с ней =====

let browserPlaceholder: Promise<Uint8ClampedArray | null> | null = null;

function getBrowserPlaceholder(): Promise<Uint8ClampedArray | null> {
  browserPlaceholder ??= loadImage(getFaviconUrl(UNKNOWN_SITE_URL, BROWSER_ICON_SIZE))
    .then(samplePixels)
    .catch(() => null);
  return browserPlaceholder;
}

// Обычный кэш промисов: интерфейс от него не зависит, реактивность не нужна
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const externalPlaceholders = new Map<string, Promise<Uint8ClampedArray | null>>();

function getExternalPlaceholder(logoUrl: string): Promise<Uint8ClampedArray | null> {
  let placeholder = externalPlaceholders.get(logoUrl);
  if (!placeholder) {
    placeholder = fetchImageBlob(logoUrl)
      .then(async (blob) => {
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        try {
          return samplePixels(await loadImage(url));
        } finally {
          URL.revokeObjectURL(url);
        }
      })
      .catch(() => null);
    externalPlaceholders.set(logoUrl, placeholder);
  }
  return placeholder;
}

// ===== Сторонние сервисы =====

/**
 * Картинка сервиса как Blob: так её пиксели можно прочитать (оценить качество, взять цвет),
 * а из .ico — достать самую крупную версию. Сервис должен разрешать CORS, либо нужен доступ к сайтам
 */
async function fetchImageBlob(url: string): Promise<Blob | null> {
  const response = await fetch(url, {credentials: 'omit'});
  if (!response.ok) return null;
  const buffer = await response.arrayBuffer();
  if (isIco(buffer)) {
    const image = extractLargestIcoImage(buffer);
    return image ? new Blob([image.data], {type: image.type}) : null;
  }
  const type = response.headers.get('content-type') ?? '';
  return type.startsWith('image/') ? new Blob([buffer], {type}) : null;
}

/** Иконка со стороннего сервиса; null — у сервиса её нет */
async function loadExternalIcon(logoUrl: string, placeholderUrl: string | null): Promise<IconInfo | null> {
  let blob: Blob | null;
  try {
    blob = await fetchImageBlob(logoUrl);
  } catch {
    // Сервис не разрешает читать картинку, а доступа к сайтам нет: показываем как есть, без проверки качества.
    // Считаем её не крупнее обычного favicon, чтобы не растягивать
    try {
      const img = await loadImage(logoUrl);
      const size = Math.min(img.naturalWidth, img.naturalHeight, BROWSER_ICON_SIZE);
      return {src: logoUrl, size, source: 'external', color: null, edgeColor: null, fullBleed: false};
    } catch {
      return null;
    }
  }
  if (!blob) return null;

  const url = URL.createObjectURL(blob);
  const placeholder = placeholderUrl ? await getExternalPlaceholder(placeholderUrl) : null;
  const info = await analyze(url, 'external', {vector: blob.type.includes('svg'), placeholder});
  if (!info) URL.revokeObjectURL(url);
  return info;
}

/** Иконка одного сайта; обновляется реактивно по мере загрузки */
export class IconEntry {
  /** null — иконки нет, показываем букву */
  info = $state.raw<IconInfo | null>(null);
  /** Первая попытка завершена: можно показывать букву вместо пустой подложки */
  loaded = $state(false);

  #generation = 0; // Отбрасывает результаты загрузки, начатой до reload()

  constructor(readonly pageUrl: string, readonly key: string) {}

  /**
   * Источники по порядку: иконка с сайта (из кэша), сторонний сервис, кэш браузера.
   * Потом, если кэш устарел, — свежая иконка с сайта; она заменяет текущую, если не хуже её
   */
  async load(): Promise<void> {
    const generation = this.#generation;
    const isCurrent = () => generation === this.#generation;

    await icons.ready;
    const isWeb = isWebUrl(this.pageUrl);

    // 1. Иконка с сайта из кэша
    const useSiteIcons = isWeb && icons.siteIconsEnabled;
    let cached: CachedSiteIcon | undefined;
    if (useSiteIcons) {
      cached = await idbGet<CachedSiteIcon>('icons', this.key).catch(() => undefined);
      if (cached?.blob) await this.#offerSiteIcon(cached.blob, isCurrent);
    }

    // 2. Сторонний сервис
    const template = isWeb ? icons.logoTemplate : null;
    if (!this.info && template) {
      const {logoDevToken} = settings.current;
      const logoUrl = buildLogoUrl(template, this.pageUrl, logoDevToken);
      const placeholderUrl = buildLogoUrl(template, UNKNOWN_SITE_URL, logoDevToken);
      const info = logoUrl ? await loadExternalIcon(logoUrl, placeholderUrl) : null;
      if (!isCurrent()) return this.#discard(info);
      if (info) this.#setInfo(info);
    }

    // 3. Кэш браузера
    if (!this.info) {
      const info = await analyze(getFaviconUrl(this.pageUrl, BROWSER_ICON_SIZE), 'browser', {
        placeholder: await getBrowserPlaceholder(),
      });
      if (!isCurrent()) return;
      this.#setInfo(info);
    }
    this.loaded = true;

    // 4. Свежая иконка с сайта, если кэш устарел
    if (!useSiteIcons) return;
    const ttl = cached?.blob ? SITE_ICON_TTL : MISSING_ICON_TTL;
    if (cached && Date.now() - cached.fetchedAt < ttl) return;

    const icon = await queued(() => fetchSiteIcon(this.pageUrl));
    if (!isCurrent()) return;
    const entry: CachedSiteIcon = {blob: icon?.blob ?? null, size: icon?.size ?? 0, fetchedAt: Date.now()};
    await idbSet('icons', this.key, entry).catch((error) => console.error('Failed to cache icon', error));
    if (icon) await this.#offerSiteIcon(icon.blob, isCurrent);
  }

  reload(): void {
    this.#generation++;
    this.#setInfo(null);
    this.loaded = false;
    this.load().catch((error) => console.error('Failed to load icon', error));
  }

  /** Иконка с сайта заменяет текущую, если она не хуже по качеству */
  async #offerSiteIcon(blob: Blob, isCurrent: () => boolean): Promise<void> {
    const url = URL.createObjectURL(blob);
    const info = await analyze(url, 'site', {vector: blob.type.includes('svg')});
    if (!isCurrent() || !info || (this.info && info.size < this.info.size)) {
      URL.revokeObjectURL(url);
      return;
    }
    this.#setInfo(info);
    this.loaded = true;
  }

  #setInfo(info: IconInfo | null): void {
    // Освобождаем память прежней картинки, если она была загружена как Blob
    if (this.info?.src.startsWith('blob:') && this.info.src !== info?.src) URL.revokeObjectURL(this.info.src);
    this.info = info;
  }

  #discard(info: IconInfo | null): void {
    if (info?.src.startsWith('blob:')) URL.revokeObjectURL(info.src);
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

  /** Шаблон адреса выбранного стороннего сервиса; null — не выбран */
  get logoTemplate(): string | null {
    const {logoService, externalLogoUrl, logoDevToken} = settings.current;
    return logoTemplate(logoService, externalLogoUrl, logoDevToken);
  }

  async start(settingsLoaded: Promise<unknown>): Promise<void> {
    // Источники иконок зависят и от настроек, и от разрешений: без них первая загрузка ушла бы впустую
    await Promise.all([settingsLoaded.catch(() => undefined), permissions.ready]);
    this.#resolveReady();

    // Источники иконок поменялись — загружаем заново. С задержкой: адрес и ключ сервиса вводят по букве
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
    return JSON.stringify([this.siteIconsEnabled, this.logoTemplate, this.logoTemplate && settings.current.logoDevToken]);
  }
}

export const icons = new IconsStore();
