// Загрузка иконок высокого качества прямо с сайтов (нужно разрешение на доступ к сайтам)
import {candidatesFromLinks, candidatesFromManifest, type IconCandidate, rankCandidates} from './iconCandidates';

const REQUEST_TIMEOUT = 8000;
const MAX_ICON_BYTES = 1_000_000;
const MAX_PARALLEL = 4;

function request(url: string): Promise<Response> {
  // Без cookies: нам нужна только публичная разметка и картинки
  return fetch(url, {credentials: 'omit', signal: AbortSignal.timeout(REQUEST_TIMEOUT)});
}

async function readCandidates(pageUrl: string): Promise<{candidates: IconCandidate[]; baseUrl: string}> {
  const response = await request(pageUrl);
  if (!response.ok || !response.headers.get('content-type')?.includes('html')) {
    return {candidates: [], baseUrl: response.url || pageUrl};
  }

  // Скрипты страницы при разборе через DOMParser не выполняются — читаем только <link>
  const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
  const baseHref = doc.querySelector('base[href]')?.getAttribute('href');
  const baseUrl = baseHref ? new URL(baseHref, response.url).href : response.url;

  const links = [...doc.querySelectorAll<HTMLLinkElement>('link[rel][href]')].map((link) => ({
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

async function downloadImage(url: string): Promise<Blob | null> {
  try {
    const response = await request(url);
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !type.startsWith('image/')) return null;
    const blob = await response.blob();
    if (blob.size === 0 || blob.size > MAX_ICON_BYTES) return null;
    // Проверяем, что это действительно картинка (SVG createImageBitmap не декодирует)
    if (!type.includes('svg')) (await createImageBitmap(blob)).close();
    return blob;
  } catch {
    return null;
  }
}

/** Лучшая иконка сайта или null, если ничего крупнее обычного favicon не нашлось */
export async function fetchSiteIcon(pageUrl: string): Promise<Blob | null> {
  let candidates: IconCandidate[] = [];
  let baseUrl = pageUrl;
  try {
    ({candidates, baseUrl} = await readCandidates(pageUrl));
  } catch {
    // Страница недоступна — попробуем стандартный адрес
  }
  // Многие сайты кладут иконку по стандартному адресу, не объявляя её
  candidates.push({url: new URL('/apple-touch-icon.png', baseUrl).href, size: 180, penalty: 0.5});

  for (const candidate of rankCandidates(candidates)) {
    const blob = await downloadImage(candidate.url);
    if (blob) return blob;
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
