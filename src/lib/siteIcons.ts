// Поиск и загрузка иконок высокого качества прямо с сайтов (нужно разрешение на доступ к сайтам)
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

const REQUEST_TIMEOUT = 8000;
const MAX_ICON_BYTES = 2_000_000;
const MAX_PARALLEL = 4;

export interface SiteIcon {
  blob: Blob;
  /** Сторона картинки в пикселях; для SVG — VECTOR_SIZE */
  size: number;
}

function request(url: string): Promise<Response> {
  // Без cookies: нам нужна только публичная разметка и картинки
  return fetch(url, {credentials: 'omit', signal: AbortSignal.timeout(REQUEST_TIMEOUT)});
}

async function readDeclaredIcons(pageUrl: string): Promise<{candidates: IconCandidate[]; baseUrl: string}> {
  const response = await request(pageUrl);
  if (!response.ok || !response.headers.get('content-type')?.includes('html')) {
    return {candidates: [], baseUrl: response.url || pageUrl};
  }

  // Скрипты страницы при разборе через DOMParser не выполняются — читаем только <link>
  const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
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
      const manifestResponse = await request(manifestUrl);
      if (manifestResponse.ok) {
        candidates.push(...candidatesFromManifest(await manifestResponse.json(), manifestUrl));
      }
    } catch {
      // Манифест недоступен или некорректен — обходимся иконками из <link>
    }
  }
  return {candidates, baseUrl};
}

/** Скачивает картинку и проверяет её реальный размер: объявленным размерам верить нельзя */
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

/** Лучшая иконка сайта или null, если ничего крупнее обычного favicon не нашлось */
export async function fetchSiteIcon(pageUrl: string): Promise<SiteIcon | null> {
  let candidates: IconCandidate[] = [];
  let baseUrl = pageUrl;
  try {
    ({candidates, baseUrl} = await readDeclaredIcons(pageUrl));
  } catch {
    // Страница недоступна — попробуем стандартные адреса
  }
  // Многие сайты кладут иконки по стандартным адресам, не объявляя их
  for (const {path, size, penalty} of WELL_KNOWN_ICONS) {
    candidates.push({url: new URL(path, baseUrl).href, size, penalty});
  }

  for (const candidate of rankCandidates(candidates)) {
    const icon = await downloadIcon(candidate.url);
    if (icon) return icon;
  }
  return null;
}

// Очередь: одновременно не больше MAX_PARALLEL сайтов, чтобы не забивать сеть при открытии страницы
let active = 0;
const waiting: Array<() => void> = [];

export async function queued<T>(task: () => Promise<T>): Promise<T> {
  if (active < MAX_PARALLEL) {
    active++;
  } else {
    await new Promise<void>((resolve) => waiting.push(resolve)); // Слот передаётся напрямую
  }
  try {
    return await task();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
