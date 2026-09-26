// Картинка дня Bing для фона страницы. Нужно разрешение на доступ к www.bing.com
import {t} from './i18n/index.svelte';


export const BING_ORIGIN = 'https://www.bing.com';

const CACHE_KEY = 'bingImage'; // chrome.storage.local
const DEFAULT_MARKET = 'en-US';
// Регионы, для которых у Bing есть своя картинка дня и подписи на местном языке
const MARKETS = ['ru-RU', 'en-US', 'en-GB', 'en-CA', 'en-AU', 'en-IN', 'de-DE', 'fr-FR', 'es-ES', 'it-IT', 'pt-BR', 'ja-JP', 'zh-CN'];
// Картинка обновляется раз в сутки; запас на случай, если Bing опубликует её чуть позже
const REFRESH_MARGIN = 10 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export interface BingImage {
  url: string;
  title: string;
  copyright: string;
  /** Страница с описанием картинки */
  link: string | null;
  /** Когда запрашивать новую картинку, мс */
  expiresAt: number;
  market: string;
  uhd: boolean;
}

/** Картинка из ответа HPImageArchive.aspx?format=js */
export interface BingApiImage {
  url: string;
  urlbase: string;
  fullstartdate: string;
  title?: string;
  copyright?: string;
  copyrightlink?: string;
}

/** Регион Bing по языку браузера: точное совпадение, затем тот же язык, иначе en-US */
export function bingMarket(language: string): string {
  const exact = MARKETS.find((market) => market.toLowerCase() === language.toLowerCase());
  if (exact) return exact;
  const base = language.split('-')[0].toLowerCase();
  return MARKETS.find((market) => market.startsWith(`${base}-`)) ?? DEFAULT_MARKET;
}

/** Время смены картинки: дата публикации (yyyyMMddHHmm, UTC) + сутки + запас */
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
    // Некорректная ссылка — показываем подпись без неё
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

/** Экран больше Full HD — стоит загружать картинку в UHD (около 4K) */
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

/** Картинка дня: из кэша, пока она актуальна, иначе с Bing */
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
