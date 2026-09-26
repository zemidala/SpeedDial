// Colour helpers: the main colour of an icon, readable text colour, a placeholder colour from a string

export interface PixelAnalysis {
  /** Main colour of the image (#rrggbb), or null if there are no opaque pixels */
  color: string | null;
  /** Average colour of the edges; null if the edges are transparent. Used to fill around the icon seamlessly */
  edgeColor: string | null;
  /** Opaque corners — the icon has its own background and can be stretched over the whole plate */
  fullBleed: boolean;
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

export function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Analyses RGBA pixels (as in ImageData.data) */
export function analyzePixels(data: Uint8ClampedArray, width: number, height: number): PixelAnalysis {
  // Group similar colours (4 bits per channel) and take the "heaviest" group.
  // Saturated colours weigh more: for a logo the brand colour matters more than a white background.
  const buckets = new Map<number, {weight: number; r: number; g: number; b: number; count: number}>();
  const neutral = {r: 0, g: 0, b: 0, count: 0};

  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 200) continue;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // Near-white and near-black pixels are counted separately — in case of a monochrome icon
    if (min > 235 || max < 25) {
      neutral.r += r;
      neutral.g += g;
      neutral.b += b;
      neutral.count++;
      continue;
    }

    const saturation = max === 0 ? 0 : (max - min) / max;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? {weight: 0, r: 0, g: 0, b: 0, count: 0};
    bucket.weight += 1 + saturation * 2;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count++;
    buckets.set(key, bucket);
  }

  let best: {r: number; g: number; b: number; count: number} | null = null;
  let bestWeight = 0;
  for (const bucket of buckets.values()) {
    if (bucket.weight > bestWeight) {
      best = bucket;
      bestWeight = bucket.weight;
    }
  }
  best ??= neutral.count > 0 ? neutral : null;

  const color = best ? toHex(best.r / best.count, best.g / best.count, best.b / best.count) : null;
  return {color, edgeColor: averageEdgeColor(data, width, height), fullBleed: hasOpaqueCorners(data, width, height)};
}

function averageEdgeColor(data: Uint8ClampedArray, width: number, height: number): string | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let opaque = 0;
  let total = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue;
      const i = (y * width + x) * 4;
      total++;
      if (data[i + 3] < 200) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      opaque++;
    }
  }
  // If more than half of the edge is transparent, the icon has no single background
  return opaque > total / 2 ? toHex(r / opaque, g / opaque, b / opaque) : null;
}

function hasOpaqueCorners(data: Uint8ClampedArray, width: number, height: number): boolean {
  if (width < 2 || height < 2) return false;
  const corners: Array<[number, number]> = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
  return corners.every(([x, y]) => data[(y * width + x) * 4 + 3] > 245);
}

const BLOCK_THRESHOLD = 3; // Average pixel spread inside a square below which it counts as single-coloured
// Share of non-uniform squares at which the image still counts as upscaled (to allow for compression artefacts).
// In a real image the outlines don't match the square grid, and there are noticeably more non-uniform squares
const IRREGULAR_SHARE = 0.02;

/**
 * A size×size image consists of single-coloured factor×factor squares — i.e. it was upscaled without smoothing.
 * Every square is checked, not the average: a flat logo with large fills has almost all squares
 * single-coloured, but not on its outlines
 */
function isBlocky(data: Uint8ClampedArray, size: number, factor: number): boolean {
  let irregular = 0;
  for (let by = 0; by < size; by += factor) {
    for (let bx = 0; bx < size; bx += factor) {
      // Colours with transparency taken into account: the colour of transparent pixels doesn't matter
      const sum = [0, 0, 0, 0];
      for (let y = by; y < by + factor; y++) {
        for (let x = bx; x < bx + factor; x++) {
          const i = (y * size + x) * 4;
          const alpha = data[i + 3] / 255;
          sum[0] += data[i] * alpha;
          sum[1] += data[i + 1] * alpha;
          sum[2] += data[i + 2] * alpha;
          sum[3] += data[i + 3];
        }
      }
      const count = factor * factor;
      const average = sum.map((value) => value / count);
      let deviation = 0;
      for (let y = by; y < by + factor; y++) {
        for (let x = bx; x < bx + factor; x++) {
          const i = (y * size + x) * 4;
          const alpha = data[i + 3] / 255;
          deviation += Math.abs(data[i] * alpha - average[0]) + Math.abs(data[i + 1] * alpha - average[1])
            + Math.abs(data[i + 2] * alpha - average[2]) + Math.abs(data[i + 3] - average[3]);
        }
      }
      if (deviation / (count * 4) >= BLOCK_THRESHOLD) irregular++;
    }
  }
  return irregular <= (size / factor) ** 2 * IRREGULAR_SHARE;
}

/**
 * The real resolution of a size×size image. The browser returns a 16×16 favicon scaled up to 64×64,
 * and the file size doesn't show it — but the pixels do: they come in single-coloured squares.
 * A single-colour image without details looks equally good at any size — size is returned for it
 */
export function effectiveResolution(data: Uint8ClampedArray, size: number, minSize = 16): number {
  if (isBlocky(data, size, size)) return size;
  let effective = size;
  while (effective / 2 >= minSize) {
    const factor = size / (effective / 2);
    if (!Number.isInteger(factor) || !isBlocky(data, size, factor)) break;
    effective /= 2;
  }
  return effective;
}

/** Average difference between two images of the same size (0–255) */
export function meanDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length || a.length === 0) return 255;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/** Relative luminance per WCAG */
function luminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** Text colour readable on the given background */
export function readableTextColor(background: string): string {
  const rgb = parseHex(background);
  if (!rgb) return '#1f2328';
  // Threshold at which the contrast with white and black text is equal
  return luminance(rgb) > 0.179 ? '#1f2328' : '#f0f2f4';
}

/** WCAG contrast of two colours: 1 to 21. Normal text needs at least 4.5 */
export function contrastRatio(a: string, b: string): number {
  const rgbA = parseHex(a);
  const rgbB = parseHex(b);
  if (!rgbA || !rgbB) return 1;
  const [light, dark] = [luminance(rgbA), luminance(rgbB)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Mix of colours: amount = 0 — colour a, 1 — colour b */
export function mixColors(a: string, b: string, amount: number): string {
  const rgbA = parseHex(a) ?? [0, 0, 0];
  const rgbB = parseHex(b) ?? [0, 0, 0];
  const [r, g, bl] = rgbA.map((value, i) => value + (rgbB[i] - value) * amount);
  return toHex(r, g, bl);
}

/**
 * A colour readable on the background: if the contrast is too low, gradually shift the colour towards black or white
 * (whichever gives more contrast), keeping the hue as much as possible
 */
export function ensureContrast(color: string, background: string, minRatio: number): string {
  if (contrastRatio(color, background) >= minRatio) return color;
  const target = contrastRatio('#000000', background) > contrastRatio('#ffffff', background) ? '#000000' : '#ffffff';
  for (let step = 1; step <= 20; step++) {
    const candidate = mixColors(color, target, step / 20);
    if (contrastRatio(candidate, background) >= minRatio) return candidate;
  }
  return target;
}

/** A stable pleasant colour from a string — for the letter placeholder */
export function hashColor(text: string): string {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.codePointAt(0)!) | 0;
  return `hsl(${Math.abs(hash) % 360} 55% 48%)`;
}
