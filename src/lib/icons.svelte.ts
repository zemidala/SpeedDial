import {analyzePixels, effectiveResolution, meanDifference} from './color';
import {extractLargestIcoImage, isIco} from './ico';
import {VECTOR_SIZE} from './iconCandidates';
import {idbClear, idbDelete, idbGet, idbSet} from './idb';
import {buildLogoUrl, logoTemplate, UNKNOWN_SITE_URL} from './logoServices';
import {permissions} from './permissions.svelte';
import {settings} from './settings/store.svelte';
import {fetchSiteIcon, queued} from './siteIcons';
import {getFaviconUrl, isWebUrl} from './url';

/** browser — from the browser cache; site — from the site itself; external — from a third-party service */
export type IconSource = 'browser' | 'site' | 'external';

export interface IconInfo {
  src: string;
  /** Real image resolution in pixels (upscaled images — by their original size); SVG — VECTOR_SIZE */
  size: number;
  source: IconSource;
  /** Main colour of the icon; null if the pixels can't be read */
  color: string | null;
  /** Colour of the icon's edges — for seamlessly filling the area around it */
  edgeColor: string | null;
  /** The icon has its own opaque background — it can be stretched over the whole plate */
  fullBleed: boolean;
}

interface CachedSiteIcon {
  blob: Blob | null; // null — the site has nothing better than the regular favicon
  size: number;
  fetchedAt: number;
}

const BROWSER_ICON_SIZE = 64;
const SAMPLE_SIZE = 32; // The icon is scaled down to 32×32 for colour analysis
const MAX_RESOLUTION_CHECK = 256; // Upscaled images larger than this don't occur, and the check costs more
const DAY = 24 * 60 * 60 * 1000;
const SITE_ICON_TTL = 30 * DAY;
const MISSING_ICON_TTL = 7 * DAY;
const DEFAULT_ICON_THRESHOLD = 4; // Average pixel difference at which an icon equals the "no icon" placeholder
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
  context.imageSmoothingEnabled = false; // Otherwise the squares of an upscaled image blur and go unrecognised
  context.drawImage(img, 0, 0, size, size);
  return context.getImageData(0, 0, size, size).data;
}

const samplePixels = (img: HTMLImageElement) => readPixels(img, SAMPLE_SIZE);

/** Real resolution of a raster image: upscaled favicons are recognised by single-coloured squares */
function measureResolution(img: HTMLImageElement): number {
  const natural = Math.min(img.naturalWidth, img.naturalHeight);
  const checked = Math.min(natural, MAX_RESOLUTION_CHECK);
  if (checked < SAMPLE_SIZE) return natural;
  return Math.round(effectiveResolution(readPixels(img, checked), checked) * natural / checked);
}

interface AnalyzeOptions {
  vector?: boolean;
  /** The source's placeholder for unknown sites — such an icon isn't shown */
  placeholder?: Uint8ClampedArray | null;
}

/** null — the image didn't load or it's the "no icon" placeholder */
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

// ===== "No icon" placeholders: request the icon of a site that surely doesn't exist and compare with it =====

let browserPlaceholder: Promise<Uint8ClampedArray | null> | null = null;

function getBrowserPlaceholder(): Promise<Uint8ClampedArray | null> {
  browserPlaceholder ??= loadImage(getFaviconUrl(UNKNOWN_SITE_URL, BROWSER_ICON_SIZE))
    .then(samplePixels)
    .catch(() => null);
  return browserPlaceholder;
}

// A plain promise cache: the interface doesn't depend on it, no reactivity needed
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

// ===== Third-party services =====

/**
 * The service's image as a Blob: this way its pixels can be read (to judge quality, take the colour),
 * and the largest version extracted from an .ico. The service must allow CORS, or site access is needed
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

/** Icon from a third-party service; null — the service doesn't have it */
async function loadExternalIcon(logoUrl: string, placeholderUrl: string | null): Promise<IconInfo | null> {
  let blob: Blob | null;
  try {
    blob = await fetchImageBlob(logoUrl);
  } catch {
    // The service doesn't allow reading the image and there's no site access: show it as is, without a quality check.
    // Treat it as no larger than a regular favicon so it isn't stretched
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

/** Icon of one site; updates reactively as it loads */
export class IconEntry {
  /** null — no icon, show a letter */
  info = $state.raw<IconInfo | null>(null);
  /** The first attempt is done: a letter can be shown instead of an empty plate */
  loaded = $state(false);

  #generation = 0; // Drops results of a load started before reload()

  constructor(readonly pageUrl: string, readonly key: string) {}

  /**
   * Sources in order: the site icon (from the cache), a third-party service, the browser cache.
   * Then, if the cache is stale, a fresh icon from the site; it replaces the current one unless it's worse
   */
  async load(): Promise<void> {
    const generation = this.#generation;
    const isCurrent = () => generation === this.#generation;

    await icons.ready;
    const isWeb = isWebUrl(this.pageUrl);

    // 1. Site icon from the cache
    const useSiteIcons = isWeb && icons.siteIconsEnabled;
    let cached: CachedSiteIcon | undefined;
    if (useSiteIcons) {
      cached = await idbGet<CachedSiteIcon>('icons', this.key).catch(() => undefined);
      if (cached?.blob) await this.#offerSiteIcon(cached.blob, isCurrent);
    }

    // 2. Third-party service
    const template = isWeb ? icons.logoTemplate : null;
    if (!this.info && template) {
      const {logoDevToken} = settings.current;
      const logoUrl = buildLogoUrl(template, this.pageUrl, logoDevToken);
      const placeholderUrl = buildLogoUrl(template, UNKNOWN_SITE_URL, logoDevToken);
      const info = logoUrl ? await loadExternalIcon(logoUrl, placeholderUrl) : null;
      if (!isCurrent()) return this.#discard(info);
      if (info) this.#setInfo(info);
    }

    // 3. Browser cache
    if (!this.info) {
      const info = await analyze(getFaviconUrl(this.pageUrl, BROWSER_ICON_SIZE), 'browser', {
        placeholder: await getBrowserPlaceholder(),
      });
      if (!isCurrent()) return;
      this.#setInfo(info);
    }
    this.loaded = true;

    // 4. Fresh site icon if the cache is stale
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

  /** The site icon replaces the current one if it's not worse in quality */
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
    // Free the memory of the previous image if it was loaded as a Blob
    if (this.info?.src.startsWith('blob:') && this.info.src !== info?.src) URL.revokeObjectURL(this.info.src);
    this.info = info;
  }

  #discard(info: IconInfo | null): void {
    if (info?.src.startsWith('blob:')) URL.revokeObjectURL(info.src);
  }
}

class IconsStore {
  /** Icon loading waits for the settings: icon sources depend on them */
  ready: Promise<void>;

  #entries = new Map<string, IconEntry>();
  #resolveReady!: () => void;

  constructor() {
    this.ready = new Promise((resolve) => {
      this.#resolveReady = resolve;
    });
  }

  /** Site icons are enabled in the settings and site access is granted */
  get siteIconsEnabled(): boolean {
    return settings.current.siteIcons && permissions.siteAccess;
  }

  /** URL template of the chosen third-party service; null — none chosen */
  get logoTemplate(): string | null {
    const {logoService, externalLogoUrl, logoDevToken} = settings.current;
    return logoTemplate(logoService, externalLogoUrl, logoDevToken);
  }

  async start(settingsLoaded: Promise<unknown>): Promise<void> {
    // Icon sources depend on both settings and permissions: without them the first load would be wasted
    await Promise.all([settingsLoaded.catch(() => undefined), permissions.ready]);
    this.#resolveReady();

    // Icon sources changed — reload. With a delay: the service URL and key are typed letter by letter
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

  /** Icons are shared by all pages of one site */
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

  /** Forget the stored site icon and load it again */
  async refresh(pageUrl: string): Promise<void> {
    const entry = this.get(pageUrl);
    await idbDelete('icons', entry.key);
    entry.reload();
  }

  reloadAll(): void {
    for (const entry of this.#entries.values()) entry.reload();
  }

  /** Removes all icons loaded from sites */
  async clearSiteIcons(): Promise<void> {
    await idbClear('icons');
    this.reloadAll();
  }

  #sourceKey(): string {
    return JSON.stringify([this.siteIconsEnabled, this.logoTemplate, this.logoTemplate && settings.current.logoDevToken]);
  }
}

export const icons = new IconsStore();
