// Bing image of the day for the page background. Needs permission to access www.bing.com
import {t} from './i18n/index.svelte';


export const BING_ORIGIN = 'https://www.bing.com';

const CACHE_KEY = 'bingImage'; // chrome.storage.local
const DEFAULT_MARKET = 'en-US';
// Regions for which Bing has its own image of the day with captions in the local language
const MARKETS = ['ru-RU', 'en-US', 'en-GB', 'en-CA', 'en-AU', 'en-IN', 'de-DE', 'fr-FR', 'es-ES', 'it-IT', 'pt-BR', 'ja-JP', 'zh-CN'];
// The image changes once a day; a margin in case Bing publishes it a bit later
const REFRESH_MARGIN = 10 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export interface BingImage {
  url: string;
  title: string;
  copyright: string;
  /** Page describing the image */
  link: string | null;
  /** When to request a new image, ms */
  expiresAt: number;
  market: string;
  uhd: boolean;
}

/** Image from the HPImageArchive.aspx?format=js response */
export interface BingApiImage {
  url: string;
  urlbase: string;
  fullstartdate: string;
  title?: string;
  copyright?: string;
  copyrightlink?: string;
}

/** Bing region by browser language: exact match, then the same language, otherwise en-US */
export function bingMarket(language: string): string {
  const exact = MARKETS.find((market) => market.toLowerCase() === language.toLowerCase());
  if (exact) return exact;
  const base = language.split('-')[0].toLowerCase();
  return MARKETS.find((market) => market.startsWith(`${base}-`)) ?? DEFAULT_MARKET;
}

/** When the image changes: publication date (yyyyMMddHHmm, UTC) + one day + margin */
export function bingExpiration(fullStartDate: string): number {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(fullStartDate);
  if (!match) return Date.now() + DAY;
  const [, year, month, day, hour, minute] = match.map(Number);
  return Date.UTC(year, month - 1, day, hour, minute) + DAY + REFRESH_MARGIN;
}

export function toBingImage(api: BingApiImage, market: string, uhd: boolean): BingImage {
  let link: string | null = null;
  try {
    link = api.copyrightlink ? new URL(api.copyrightlink, BING_ORIGIN).href : null;
  } catch {
    // Invalid link — show the caption without it
  }
  return {
    url: uhd ? `${BING_ORIGIN}${api.urlbase}_UHD.jpg` : `${BING_ORIGIN}${api.url}`,
    title: api.title ?? '',
    copyright: api.copyright ?? '',
    link,
    expiresAt: bingExpiration(api.fullstartdate),
    market,
    uhd,
  };
}

/** The screen is larger than Full HD — worth loading the UHD image (about 4K) */
function wantsUhd(): boolean {
  const scale = globalThis.devicePixelRatio || 1;
  return screen.width * scale > 1920 || screen.height * scale > 1080;
}

async function hasUhd(urlBase: string): Promise<boolean> {
  try {
    return (await fetch(`${BING_ORIGIN}${urlBase}_UHD.jpg`, {method: 'HEAD'})).ok;
  } catch {
    return false;
  }
}

/** Image of the day: from the cache while it's current, otherwise from Bing */
export async function loadBingImage(): Promise<BingImage> {
  const market = bingMarket(navigator.language);
  const uhd = wantsUhd();

  const cached = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] as BingImage | undefined;
  if (cached && cached.expiresAt > Date.now() && cached.market === market && cached.uhd === uhd) return cached;

  const response = await fetch(`${BING_ORIGIN}/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=${market}`);
  if (!response.ok) throw new Error(t.errors.bingStatus(response.status));
  const api = ((await response.json()) as {images?: BingApiImage[]}).images?.[0];
  if (!api) throw new Error(t.errors.bingNoImage);

  const image = toBingImage(api, market, uhd && await hasUhd(api.urlbase));
  await chrome.storage.local.set({[CACHE_KEY]: image});
  return image;
}
