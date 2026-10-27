// The picture a page declares for link previews (og:image and the like) as a thumbnail: no window is opened, only the
// page's markup and the picture are downloaded. Needs permission to access sites
import {coverTop, THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH} from '../images';
import {requestSitePage} from '../messages';
import {pageKey} from '../url';

/** Meta tags with a preview picture, best first */
const IMAGE_KEYS = ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'];
/** Narrower pictures are logos or tracking pixels, not a view of the page */
export const MIN_PAGE_IMAGE_WIDTH = 300;
const MAX_IMAGE_BYTES = 5_000_000;
const REQUEST_TIMEOUT = 15_000;

/** A page without a picture is asked again after this — sites add them */
export const MISS_TTL = 7 * 24 * 60 * 60 * 1000;
const MISSES_KEY = 'pageImageMisses';

export interface MetaTag {
  /** property or name */
  key: string;
  content: string;
}

/** The address of the page's preview picture, or null if it declares none */
export function pickPageImage(metas: MetaTag[], baseUrl: string): string | null {
  for (const key of IMAGE_KEYS) {
    for (const meta of metas) {
      if (meta.key.toLowerCase() !== key || !meta.content.trim()) continue;
      try {
        const url = new URL(meta.content.trim(), baseUrl);
        if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
      } catch {
        // An invalid address — try the next tag
      }
    }
  }
  return null;
}

/** A busy or failing server: its answer says nothing about the page, it's worth asking again later */
const isTemporary = (status: number) => status === 429 || status >= 500;

/**
 * The page's preview picture cut to the thumbnail's proportions. final — the answer can be remembered: false when
 * the site or the picture didn't answer, then it's worth asking again on the next new tab
 */
export async function fetchPageImage(pageUrl: string): Promise<{image: Blob | null; final: boolean}> {
  const response = await requestSitePage(pageUrl).catch(() => null);
  if (!response || 'error' in response) return {image: null, final: false};
  if (!response.ok || !response.contentType.includes('html')) return {image: null, final: !isTemporary(response.status)};

  // Page scripts don't run when parsed with DOMParser — only <meta> and <base> are read
  const doc = new DOMParser().parseFromString(response.text, 'text/html');
  const baseHref = doc.querySelector('base[href]')?.getAttribute('href');
  const baseUrl = baseHref ? new URL(baseHref, response.url).href : response.url;
  const metas = [...doc.querySelectorAll('meta[content]')].map((meta) => ({
    key: meta.getAttribute('property') ?? meta.getAttribute('name') ?? '',
    content: meta.getAttribute('content') ?? '',
  }));
  const imageUrl = pickPageImage(metas, baseUrl);
  if (!imageUrl) return {image: null, final: true};

  let imageResponse: Response;
  try {
    // No cookies: only the public picture is needed
    imageResponse = await fetch(imageUrl, {credentials: 'omit', signal: AbortSignal.timeout(REQUEST_TIMEOUT)});
  } catch {
    return {image: null, final: false};
  }
  if (isTemporary(imageResponse.status)) return {image: null, final: false};
  const type = imageResponse.headers.get('content-type') ?? '';
  if (!imageResponse.ok || !type.startsWith('image/') || type.includes('svg')) {
    await imageResponse.body?.cancel();
    return {image: null, final: true};
  }
  try {
    const blob = await imageResponse.blob();
    if (blob.size > MAX_IMAGE_BYTES) return {image: null, final: true};
    const bitmap = await createImageBitmap(blob);
    const width = bitmap.width;
    bitmap.close();
    if (width < MIN_PAGE_IMAGE_WIDTH) return {image: null, final: true};
    return {image: await coverTop(blob, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT), final: true};
  } catch {
    return {image: null, final: true}; // Not a picture the browser can draw
  }
}

/** Pages found to have no picture: page key → when. Kept in this browser only, a lost list just means asking again */
function readMisses(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(MISSES_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {};
  } catch {
    return {};
  }
}

export function isRecentMiss(pageUrl: string, now = Date.now()): boolean {
  const key = pageKey(pageUrl);
  const time = key ? readMisses()[key] : undefined;
  return typeof time === 'number' && now - time < MISS_TTL;
}

export function rememberMiss(pageUrl: string, now = Date.now()): void {
  const key = pageKey(pageUrl);
  if (!key) return;
  // Old entries go when a new one is written — the list doesn't grow forever
  const misses = Object.fromEntries(Object.entries(readMisses()).filter(([, time]) => now - time < MISS_TTL));
  misses[key] = now;
  try {
    localStorage.setItem(MISSES_KEY, JSON.stringify(misses));
  } catch {
    // Storage is full or blocked — the page will be asked again next time
  }
}

export function forgetMisses(): void {
  try {
    localStorage.removeItem(MISSES_KEY);
  } catch {
    // Nothing to forget
  }
}
