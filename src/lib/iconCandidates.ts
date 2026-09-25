// Выбор лучшей иконки сайта среди объявленных в <link> и web manifest

export const VECTOR_SIZE = 512; // SVG масштабируется без потерь — считаем его очень большим
export const MIN_USEFUL_SIZE = 48; // Меньше — встроенная иконка браузера не хуже

export interface IconCandidate {
  url: string;
  size: number;
  /** Подходит хуже при том же размере (maskable, догадка без объявления) */
  penalty?: number;
}

export interface LinkIcon {
  rel: string;
  href: string;
  sizes?: string | null;
  type?: string | null;
}

function isSvg(href: string, type?: string | null): boolean {
  return type === 'image/svg+xml' || /\.svg(\?|#|$)/i.test(href);
}

/** Наибольший размер из атрибута sizes ("16x16 32x32", "any"); 0, если не указан */
export function parseSizes(sizes: string | null | undefined): number {
  if (!sizes) return 0;
  let best = 0;
  for (const token of sizes.toLowerCase().split(/\s+/)) {
    if (token === 'any') return VECTOR_SIZE;
    const match = /^(\d+)x(\d+)$/.exec(token);
    if (match) best = Math.max(best, Math.min(Number(match[1]), Number(match[2])));
  }
  return best;
}

/** Иконки из <link rel="icon" | "apple-touch-icon" ...>; адреса — относительно baseUrl */
export function candidatesFromLinks(links: LinkIcon[], baseUrl: string): IconCandidate[] {
  const result: IconCandidate[] = [];
  for (const {rel, href, sizes, type} of links) {
    const rels = rel.toLowerCase().split(/\s+/);
    const isTouch = rels.some((r) => r.startsWith('apple-touch-icon'));
    if (!isTouch && !rels.includes('icon')) continue;

    let url: string;
    try {
      url = new URL(href, baseUrl).href;
    } catch {
      continue;
    }

    let size = parseSizes(sizes);
    if (!size) {
      if (isSvg(href, type)) size = VECTOR_SIZE;
      else if (isTouch) size = 180; // Размер apple-touch-icon по умолчанию
      else size = 16;
    }
    result.push({url, size});
  }
  return result;
}

interface ManifestIcon {
  src?: unknown;
  sizes?: unknown;
  type?: unknown;
  purpose?: unknown;
}

/** Иконки из web manifest; адреса — относительно адреса самого манифеста */
export function candidatesFromManifest(manifest: unknown, manifestUrl: string): IconCandidate[] {
  const icons = (manifest as {icons?: unknown})?.icons;
  if (!Array.isArray(icons)) return [];

  const result: IconCandidate[] = [];
  for (const icon of icons as ManifestIcon[]) {
    if (typeof icon?.src !== 'string') continue;
    const type = typeof icon.type === 'string' ? icon.type : null;
    const size = parseSizes(typeof icon.sizes === 'string' ? icon.sizes : null)
      || (isSvg(icon.src, type) ? VECTOR_SIZE : 0);
    if (!size) continue;

    // Maskable-иконки рассчитаны на обрезку по кругу и имеют большие поля — берём, если нет других
    const purposes = typeof icon.purpose === 'string' ? icon.purpose.split(/\s+/) : ['any'];
    const penalty = purposes.includes('any') ? 0 : 1;
    try {
      result.push({url: new URL(icon.src, manifestUrl).href, size, penalty});
    } catch {
      // Некорректный адрес — пропускаем
    }
  }
  return result;
}

/** Полезные кандидаты от лучшего к худшему, без повторов */
export function rankCandidates(candidates: IconCandidate[]): IconCandidate[] {
  const seen = new Set<string>();
  return candidates
    .filter((candidate) => candidate.size >= MIN_USEFUL_SIZE)
    .sort((a, b) => (a.penalty ?? 0) - (b.penalty ?? 0) || b.size - a.size)
    .filter(({url}) => !seen.has(url) && seen.add(url));
}
