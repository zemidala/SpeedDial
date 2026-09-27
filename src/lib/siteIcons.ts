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

const REQUEST_TIMEOUT = 8000;
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

async function readDeclaredIcons(pageUrl: string): Promise<{candidates: IconCandidate[]; baseUrl: string}> {
  // The markup comes through the service worker — see requestSitePage
  const response = await requestSitePage(pageUrl);
  if ('error' in response) throw new Error(response.error);
  if (!response.ok || !response.contentType.includes('html')) {
    return {candidates: [], baseUrl: response.url};
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
  if (manifestHref) {
    try {
      const manifestUrl = new URL(manifestHref, baseUrl).href;
      const manifestResponse = await requestSitePage(manifestUrl);
      if (!('error' in manifestResponse) && manifestResponse.ok) {
        candidates.push(...candidatesFromManifest(JSON.parse(manifestResponse.text), manifestUrl));
      }
    } catch {
      // The manifest is unavailable or invalid — make do with icons from <link>
    }
  }
  return {candidates, baseUrl};
}

/** Downloads an image and checks its real size: declared sizes can't be trusted */
async function downloadIcon(url: string): Promise<SiteIcon | null> {
  try {
    const response = await request(url);
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !(type.startsWith('image/') || type.includes('octet-stream'))) return null;

    const buffer = await response.arrayBuffer();
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

/** The site's best icon, or null if nothing larger than the regular favicon was found */
export async function fetchSiteIcon(pageUrl: string): Promise<SiteIcon | null> {
  let candidates: IconCandidate[] = [];
  let baseUrl = pageUrl;
  try {
    ({candidates, baseUrl} = await readDeclaredIcons(pageUrl));
  } catch {
    // The page is unavailable — try the standard paths
  }
  // Many sites put icons at standard paths without declaring them
  for (const {path, size, penalty} of WELL_KNOWN_ICONS) {
    candidates.push({url: new URL(path, baseUrl).href, size, penalty});
  }

  for (const candidate of rankCandidates(candidates)) {
    const icon = await downloadIcon(candidate.url);
    if (icon) return icon;
  }
  return null;
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
