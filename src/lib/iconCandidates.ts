// Choosing the best site icon among those declared in <link> and the web manifest

export const VECTOR_SIZE = 512; // SVG scales losslessly — treat it as very large
export const MIN_USEFUL_SIZE = 48; // Smaller — the browser's built-in icon is just as good

export interface IconCandidate {
  url: string;
  size: number;
  /** The larger, the later we try it: maskable, .ico of unknown size, an undeclared guess */
  penalty?: number;
}

// The real size of an .ico is known only after parsing the file — try it after declared ones
const ICO_PENALTY = 0.8;

/** Paths where sites often put icons without declaring them in the markup */
export const WELL_KNOWN_ICONS: ReadonlyArray<{path: string; size: number; penalty: number}> = [
  {path: '/favicon.svg', size: VECTOR_SIZE, penalty: 0.5},
  {path: '/android-chrome-512x512.png', size: 512, penalty: 0.5},
  {path: '/apple-touch-icon.png', size: 180, penalty: 0.5},
  {path: '/apple-touch-icon-precomposed.png', size: 180, penalty: 0.6},
  {path: '/favicon.ico', size: MIN_USEFUL_SIZE, penalty: 0.9},
];

export interface LinkIcon {
  rel: string;
  href: string;
  sizes?: string | null;
  type?: string | null;
}

function isSvg(href: string, type?: string | null): boolean {
  return type === 'image/svg+xml' || /\.svg(\?|#|$)/i.test(href);
}

function isIcoFile(href: string, type?: string | null): boolean {
  return type === 'image/x-icon' || type === 'image/vnd.microsoft.icon' || /\.ico(\?|#|$)/i.test(href);
}

/** Largest size from the sizes attribute ("16x16 32x32", "any"); 0 if not given */
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

/** Icons from <link rel="icon" | "apple-touch-icon" ...>; URLs relative to baseUrl */
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

    const declared = parseSizes(sizes);
    if (declared) {
      result.push({url, size: declared});
    } else if (isSvg(href, type)) {
      result.push({url, size: VECTOR_SIZE});
    } else if (isTouch) {
      result.push({url, size: 180}); // Default apple-touch-icon size
    } else if (isIcoFile(href, type)) {
      result.push({url, size: MIN_USEFUL_SIZE, penalty: ICO_PENALTY});
    } else {
      result.push({url, size: 16});
    }
  }
  return result;
}

interface ManifestIcon {
  src?: unknown;
  sizes?: unknown;
  type?: unknown;
  purpose?: unknown;
}

/** Icons from the web manifest; URLs relative to the manifest's own URL */
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

    // Maskable icons are meant to be cropped to a circle and have large margins — take them only if there's nothing else
    const purposes = typeof icon.purpose === 'string' ? icon.purpose.split(/\s+/) : ['any'];
    const penalty = purposes.includes('any') ? 0 : 1;
    try {
      result.push({url: new URL(icon.src, manifestUrl).href, size, penalty});
    } catch {
      // Invalid URL — skip it
    }
  }
  return result;
}

/** Useful candidates from best to worst, without duplicates */
export function rankCandidates(candidates: IconCandidate[]): IconCandidate[] {
  const seen = new Set<string>();
  return candidates
    .filter((candidate) => candidate.size >= MIN_USEFUL_SIZE)
    .sort((a, b) => (a.penalty ?? 0) - (b.penalty ?? 0) || b.size - a.size)
    .filter(({url}) => !seen.has(url) && seen.add(url));
}
