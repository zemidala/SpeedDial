// Finding and loading high-quality icons directly from sites (needs permission to access sites)
import {extractLargestIcoImage, isIco} from './ico';
import {
  candidatesFromLinks,
  candidatesFromManifest,
  type IconCandidate,
  MIN_USEFUL_SIZE,
  rankCandidates,
  VECTOR_SIZE,
  WELL_KNOWN_ICONS,
} from './iconCandidates';
import {requestSitePage} from './messages';

// Generous: when every icon is loaded again at once, a slow answer mustn't make a worse icon win
const REQUEST_TIMEOUT = 15_000;
const MAX_ICON_BYTES = 2_000_000;
const MAX_PARALLEL = 4;

export interface SiteIcon {
  blob: Blob;
  /** Image side in pixels; for SVG — VECTOR_SIZE */
  size: number;
}

function request(url: string): Promise<Response> {
  // No cookies: we only need the public markup and images
  return fetch(url, {credentials: 'omit', signal: AbortSignal.timeout(REQUEST_TIMEOUT)});
}

/** A busy or failing server: its answer says nothing about the icons, it's worth asking again later */
const isTemporary = (status: number) => status === 429 || status >= 500;

/**
 * Icons declared by the page and its manifest. complete — nothing was missed: false when the page or its manifest
 * answered "busy" or didn't load — then a better icon may be among what's missing
 */
async function readDeclaredIcons(pageUrl: string): Promise<{candidates: IconCandidate[]; baseUrl: string; complete: boolean}> {
  // The markup comes through the service worker — see requestSitePage
  const response = await requestSitePage(pageUrl);
  if ('error' in response) throw new Error(response.error);
  if (!response.ok || !response.contentType.includes('html')) {
    return {candidates: [], baseUrl: response.url, complete: !isTemporary(response.status)};
  }

  // Page scripts don't run when parsed with DOMParser — only <link> is read
  const doc = new DOMParser().parseFromString(response.text, 'text/html');
  const baseHref = doc.querySelector('base[href]')?.getAttribute('href');
  const baseUrl = baseHref ? new URL(baseHref, response.url).href : response.url;

  const links = [...doc.querySelectorAll('link[rel][href]')].map((link) => ({
    rel: link.getAttribute('rel') ?? '',
    href: link.getAttribute('href') ?? '',
    sizes: link.getAttribute('sizes'),
    type: link.getAttribute('type'),
  }));
  const candidates = candidatesFromLinks(links, baseUrl);

  const manifestHref = links.find(({rel}) => rel.toLowerCase().split(/\s+/).includes('manifest'))?.href;
  let complete = true;
  if (manifestHref) {
    try {
      const manifestUrl = new URL(manifestHref, baseUrl).href;
      const manifestResponse = await requestSitePage(manifestUrl);
      if ('error' in manifestResponse || isTemporary(manifestResponse.status)) {
        // The manifest often holds the largest icons — without it the result is only for now
        complete = false;
      } else if (manifestResponse.ok) {
        candidates.push(...candidatesFromManifest(JSON.parse(manifestResponse.text), manifestUrl));
      }
    } catch {
      // An invalid manifest — make do with icons from <link>
    }
  }
  return {candidates, baseUrl, complete};
}

/**
 * Downloads an image and checks its real size: declared sizes can't be trusted. null — no usable image there;
 * 'failed' — no answer, a timeout or a busy server: the image may well be fine, it's worth asking again later
 */
async function downloadIcon(url: string): Promise<SiteIcon | null | 'failed'> {
  let response: Response;
  try {
    response = await request(url);
  } catch {
    return 'failed';
  }
  if (response.status === 429 || response.status >= 500) return 'failed';
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || !(type.startsWith('image/') || type.includes('octet-stream'))) return null;
  let buffer: ArrayBuffer;
  try {
    buffer = await response.arrayBuffer();
  } catch {
    return 'failed'; // The download broke off or timed out
  }
  try {
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_ICON_BYTES) return null;

    if (type.includes('svg')) {
      return {blob: new Blob([buffer], {type: 'image/svg+xml'}), size: VECTOR_SIZE};
    }
    if (isIco(buffer)) {
      const image = extractLargestIcoImage(buffer);
      if (!image || image.size < MIN_USEFUL_SIZE) return null;
      return {blob: new Blob([image.data], {type: image.type}), size: image.size};
    }

    const blob = new Blob([buffer], {type});
    const bitmap = await createImageBitmap(blob);
    const size = Math.min(bitmap.width, bitmap.height);
    bitmap.close();
    return size >= MIN_USEFUL_SIZE ? {blob, size} : null;
  } catch {
    return null;
  }
}

/**
 * The site's best icon, or null if nothing larger than the regular favicon was found. final — the answer can be kept
 * for long: false when the site didn't answer (offline, VPN off) or a better icon didn't download in time — then
 * a worse icon or "no icon" is only for now, and it's worth asking again soon
 */
export async function fetchSiteIcon(pageUrl: string): Promise<{icon: SiteIcon | null; final: boolean}> {
  let candidates: IconCandidate[];
  let baseUrl: string;
  let complete: boolean;
  try {
    ({candidates, baseUrl, complete} = await readDeclaredIcons(pageUrl));
  } catch {
    // The site didn't answer at all (offline, VPN off): its other addresses won't answer either, and waiting for
    // each of them would hold up the icons of other sites in the queue
    return {icon: null, final: false};
  }
  // Many sites put icons at standard paths without declaring them
  for (const {path, size, penalty} of WELL_KNOWN_ICONS) {
    candidates.push({url: new URL(path, baseUrl).href, size, penalty});
  }

  // A better candidate that didn't download in time makes whatever comes after it a stand-in
  let final = complete;
  for (const candidate of rankCandidates(candidates)) {
    const icon = await downloadIcon(candidate.url);
    if (icon === 'failed') final = false;
    else if (icon) return {icon, final};
  }
  return {icon: null, final};
}

// Queue: at most MAX_PARALLEL sites at a time so the network isn't flooded when the page opens
let active = 0;
const waiting: Array<() => void> = [];

export async function queued<T>(task: () => Promise<T>): Promise<T> {
  if (active < MAX_PARALLEL) {
    active++;
  } else {
    await new Promise<void>((resolve) => waiting.push(resolve)); // The slot is handed over directly
  }
  try {
    return await task();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
